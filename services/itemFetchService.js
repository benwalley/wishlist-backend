const net = require('net');
const puppeteerService = require('./puppeteerService');
const geminiAIService = require('./geminiAIService');
const imageProcessingService = require('./imageProcessingService');
const productExtractionService = require('./productExtractionService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Fetch product details (name, price, image, store label) from a product URL.
 *
 * Pipeline, cheapest first — each step only runs if the previous one didn't find enough:
 *   1. In-memory cache (by normalized URL)
 *   2. Plain HTTP fetch + structured data (JSON-LD / Open Graph / microdata)   ~0.3–2s
 *   3. Headless Chrome + the same structured-data extraction                  ~3–10s
 *   4. Gemini on a cleaned, size-capped copy of the HTML                       ~2–6s
 */

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const FETCH_HEADERS = {
    'User-Agent': BROWSER_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
};

const FAST_FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const BROWSER_NAV_TIMEOUT_MS = 20000;
const BROWSER_SETTLE_MS = 4000;
const MAX_CONCURRENT_BROWSER_PAGES = 2;
const AI_TIMEOUT_MS = 20000;
const AI_MAX_HTML_CHARS = 40000;
const IMAGE_TIMEOUT_MS = 10000;
const IMAGE_TOTAL_BUDGET_MS = 15000;
const MAX_IMAGE_ATTEMPTS = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const TRACKING_PARAM_PATTERNS = [
    /^utm_/i,
    /^(fbclid|gclid|gbraid|wbraid|dclid|msclkid|yclid|igshid|twclid|ttclid|li_fat_id)$/i,
    /^(mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|mkt_tok|srsltid|spm|scm|trk|trkid|cmpid|clickid|irclickid|irgwc|cjevent|ranmid|raneaid|ransiteid)$/i,
    /^(ref|ref_|ref_src)$/i,
    /^(_pos|_sid|_ss|_psq|_fid)$/i // Shopify search tracking
];

const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/i;
const AMAZON_ASIN = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i;

class ItemFetchService {
    constructor() {
        this.cache = new Map();
        this.activeBrowserPages = 0;
        this.browserQueue = [];
    }

    // ---------- Public API ----------

    /**
     * Cache + plain-HTTP path only. Fast and bounded (~8s worst case), safe to run inside a request.
     * @returns {Promise<{url: string, data: Object|null, complete: boolean}>}
     */
    async fetchFast(rawUrl) {
        const url = this.normalizeUrl(rawUrl);

        const cached = this.getCached(url);
        if (cached) {
            console.log(`[ITEM-FETCH] Cache hit for ${url}`);
            return { url, data: cached, complete: true };
        }

        const startTime = Date.now();
        try {
            const { html, status, finalUrl } = await this.fetchHtml(url);
            const pageUrl = this.safeNormalize(finalUrl) || url;

            const data = { ...productExtractionService.extractProductData(html, pageUrl), pageUrl };
            const complete = this.isComplete(data);

            if (!complete && productExtractionService.isBlockedPage(html, status)) {
                console.log(`[ITEM-FETCH] Fast path blocked (HTTP ${status}) for ${url} after ${Date.now() - startTime}ms`);
                return { url: pageUrl, data: null, complete: false, blocked: true };
            }
            console.log(`[ITEM-FETCH] Fast path ${complete ? 'succeeded' : 'incomplete'} for ${url} in ${Date.now() - startTime}ms`);

            if (complete) {
                this.setCached(url, data);
                if (pageUrl !== url) this.setCached(pageUrl, data);
            }
            return { url: pageUrl, data, complete, html };
        } catch (error) {
            console.log(`[ITEM-FETCH] Fast path failed for ${url} after ${Date.now() - startTime}ms: ${error.message}`);
            return { url, data: null, complete: false };
        }
    }

    /**
     * Full pipeline (fast path -> browser -> AI). Returns extracted data without an image ID.
     * @param {string} rawUrl
     * @param {Object} options - { skipFastPath, partial } — use when fetchFast already ran
     */
    async extract(rawUrl, options = {}) {
        let url = this.normalizeUrl(rawUrl);
        let best = options.partial || null;
        let htmlForAi = null;
        let blocked = false;

        if (!options.skipFastPath) {
            const fast = await this.fetchFast(url);
            if (fast.complete) return fast.data;
            url = fast.url;
            best = this.mergeResults(best, fast.data);
            blocked = !!fast.blocked;
            htmlForAi = fast.html || null;
        } else {
            const cached = this.getCached(url);
            if (cached) return cached;
        }

        // Browser fallback — for sites that block plain requests or render with JavaScript
        const browserStart = Date.now();
        try {
            const page = await this.withBrowserSlot(() => this.fetchHtmlWithBrowser(url));
            const pageUrl = this.safeNormalize(page.finalUrl) || url;
            const data = { ...productExtractionService.extractProductData(page.html, pageUrl), pageUrl };

            if (!this.isComplete(data) && productExtractionService.isBlockedPage(page.html, page.status)) {
                blocked = true;
                console.log(`[ITEM-FETCH] Browser blocked (HTTP ${page.status}) for ${url} after ${Date.now() - browserStart}ms`);
            } else {
                blocked = false;
                best = this.mergeResults(best, data);
                htmlForAi = page.html;
                url = pageUrl;
                console.log(`[ITEM-FETCH] Browser ${this.isComplete(best) ? 'succeeded' : 'incomplete'} for ${url} in ${Date.now() - browserStart}ms`);
                if (this.isComplete(best)) {
                    this.setCached(url, best);
                    return best;
                }
            }
        } catch (error) {
            console.log(`[ITEM-FETCH] Browser failed for ${url} after ${Date.now() - browserStart}ms: ${error.message}`);
        }

        // AI fallback — only on pages we actually loaded, with a small cleaned input
        if (htmlForAi && await geminiAIService.isServiceAvailable()) {
            const aiStart = Date.now();
            try {
                const cleaned = productExtractionService.cleanHtmlForAi(htmlForAi, AI_MAX_HTML_CHARS);
                const aiData = await this.withTimeout(
                    geminiAIService.parseItemData(cleaned, { pageUrl: url }),
                    AI_TIMEOUT_MS,
                    'AI extraction timed out'
                );
                best = this.mergeResults(best, this.normalizeAiResult(aiData, url, htmlForAi));
                console.log(`[ITEM-FETCH] AI fallback finished for ${url} in ${Date.now() - aiStart}ms (${cleaned.length} chars sent)`);
            } catch (error) {
                console.log(`[ITEM-FETCH] AI fallback failed for ${url} after ${Date.now() - aiStart}ms: ${error.message}`);
            }
        }

        if (best && best.name) {
            if (this.isComplete(best)) this.setCached(url, best);
            return best;
        }

        throw new Error(blocked
            ? "That store blocked our request, so we couldn't read the product details. You can still fill them in manually."
            : "We couldn't find product details on that page. You can still fill them in manually.");
    }

    /**
     * Download the best image for the extracted data and return the API response shape.
     * Tries a few image candidates within a fixed time budget; never throws.
     */
    async attachImage(data, userId) {
        const candidates = (data.imageCandidates && data.imageCandidates.length
            ? data.imageCandidates
            : [data.imageUrl]
        ).filter(Boolean).slice(0, MAX_IMAGE_ATTEMPTS);

        const deadline = Date.now() + IMAGE_TOTAL_BUDGET_MS;
        let imageId = null;
        let imageUrl = null;

        for (const candidate of candidates) {
            const remaining = deadline - Date.now();
            if (remaining < 1500) break;
            try {
                imageId = await imageProcessingService.downloadAndSaveImage(candidate, userId, 'item_fetch', 512, {
                    timeout: Math.min(IMAGE_TIMEOUT_MS, remaining),
                    referer: data.pageUrl
                });
                imageUrl = candidate;
                break;
            } catch (error) {
                console.log(`[ITEM-FETCH] Image candidate failed (${candidate}): ${error.message}`);
            }
        }

        return {
            name: data.name || null,
            price: data.price || null,
            currency: data.currency || null,
            imageUrl: imageUrl || data.imageUrl || null,
            linkLabel: data.linkLabel || null,
            imageId
        };
    }

    /**
     * Full pipeline plus image. Used by the background job.
     */
    async fetchItem(rawUrl, userId, options = {}) {
        const data = await this.extract(rawUrl, options);
        return this.attachImage(data, userId);
    }

    // ---------- URL handling ----------

    /**
     * Validate and canonicalize a URL: pull the URL out of pasted share text, add a missing
     * scheme, drop tracking params and fragments, and reduce Amazon links to /dp/{ASIN}.
     * Rejects non-http(s) and private/internal hosts.
     */
    normalizeUrl(rawUrl) {
        if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
            throw this.invalidUrlError('Please provide a valid URL');
        }

        let text = rawUrl.trim();
        const embedded = text.match(/https?:\/\/[^\s<>"']+/i);
        if (embedded) {
            text = embedded[0];
        } else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
            text = `https://${text}`;
        }

        let url;
        try {
            url = new URL(text);
        } catch (error) {
            throw this.invalidUrlError('Please provide a valid URL');
        }

        if (!['http:', 'https:'].includes(url.protocol)) {
            throw this.invalidUrlError('Only http and https links are supported');
        }
        if (this.isPrivateHost(url.hostname)) {
            throw this.invalidUrlError('That link cannot be fetched');
        }

        url.hash = '';

        if (AMAZON_HOST.test(url.hostname)) {
            const asin = url.pathname.match(AMAZON_ASIN);
            if (asin) return `${url.origin}/dp/${asin[1].toUpperCase()}`;
        }

        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_PARAM_PATTERNS.some(pattern => pattern.test(key))) {
                url.searchParams.delete(key);
            }
        }

        return url.href;
    }

    safeNormalize(rawUrl) {
        try {
            return this.normalizeUrl(rawUrl);
        } catch (error) {
            return null;
        }
    }

    invalidUrlError(message) {
        return new ApiError(message, { status: 400, errorType: 'INVALID_URL', publicMessage: message });
    }

    /**
     * Hostname-based guard so users can't make the server fetch internal addresses.
     * (Doesn't cover DNS that resolves to a private IP.)
     */
    isPrivateHost(hostname) {
        const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
        if (!host) return true;
        if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;

        if (net.isIPv4(host)) {
            const [a, b] = host.split('.').map(Number);
            return a === 0 || a === 10 || a === 127 ||
                (a === 169 && b === 254) ||
                (a === 172 && b >= 16 && b <= 31) ||
                (a === 192 && b === 168) ||
                (a === 100 && b >= 64 && b <= 127);
        }
        if (net.isIPv6(host)) {
            return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
                host.startsWith('fe80') || host.startsWith('::ffff:');
        }

        // Single-label hosts (e.g. "db", "redis") are internal service names
        return !host.includes('.');
    }

    // ---------- Fetching ----------

    /**
     * Plain HTTP GET with browser-like headers. Follows redirects manually so every hop
     * is checked against the private-host guard.
     */
    async fetchHtml(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FAST_FETCH_TIMEOUT_MS);

        try {
            let current = url;
            for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
                const response = await fetch(current, {
                    headers: FETCH_HEADERS,
                    redirect: 'manual',
                    signal: controller.signal
                });

                const location = response.headers.get('location');
                if (response.status >= 300 && response.status < 400 && location) {
                    const next = new URL(location, current);
                    if (!['http:', 'https:'].includes(next.protocol) || this.isPrivateHost(next.hostname)) {
                        throw new Error(`Redirect to disallowed URL: ${next.href}`);
                    }
                    current = next.href;
                    continue;
                }

                const contentType = response.headers.get('content-type') || '';
                if (contentType && !/html|xml/i.test(contentType)) {
                    throw new Error(`Not an HTML page (${contentType})`);
                }
                const contentLength = Number(response.headers.get('content-length') || 0);
                if (contentLength > MAX_HTML_BYTES) {
                    throw new Error(`Page too large (${contentLength} bytes)`);
                }

                const html = await response.text();
                return { html, status: response.status, finalUrl: current };
            }
            throw new Error('Too many redirects');
        } catch (error) {
            if (error.name === 'AbortError') throw new Error(`Timed out after ${FAST_FETCH_TIMEOUT_MS}ms`);
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    async fetchHtmlWithBrowser(url) {
        return puppeteerService.withPage(async (page) => {
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

            let response = null;
            try {
                response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BROWSER_NAV_TIMEOUT_MS });
            } catch (error) {
                // A slow page may still have usable content — only give up on non-timeout errors
                if (error.name !== 'TimeoutError') throw error;
                console.log(`[ITEM-FETCH] Browser navigation timed out for ${url}, using partial content`);
            }

            // Give client-rendered pages a moment to fill in, without waiting on every tracker
            await page.waitForNetworkIdle({ idleTime: 500, timeout: BROWSER_SETTLE_MS }).catch(() => {});

            return {
                html: await page.content(),
                status: response ? response.status() : 0,
                finalUrl: page.url()
            };
        }, {
            blockResources: ['image', 'media', 'font', 'stylesheet'],
            shouldBlockRequest: (requestUrl) => this.isPrivateRequestUrl(requestUrl)
        });
    }

    /** For Puppeteer request filtering: true if the URL points at a private/internal host */
    isPrivateRequestUrl(requestUrl) {
        try {
            const parsed = new URL(requestUrl);
            return ['http:', 'https:'].includes(parsed.protocol) && this.isPrivateHost(parsed.hostname);
        } catch (error) {
            return false;
        }
    }

    /**
     * Limit concurrent Chrome pages so a burst of requests can't exhaust dyno memory.
     */
    async withBrowserSlot(fn) {
        while (this.activeBrowserPages >= MAX_CONCURRENT_BROWSER_PAGES) {
            await new Promise(resolve => this.browserQueue.push(resolve));
        }
        this.activeBrowserPages++;
        try {
            return await fn();
        } finally {
            this.activeBrowserPages--;
            const next = this.browserQueue.shift();
            if (next) next();
        }
    }

    // ---------- Result helpers ----------

    isComplete(data) {
        return !!(data && data.name && !data.nameIsWeak && (data.price || data.imageUrl));
    }

    /**
     * Combine two partial results. Earlier (base) values win, except a weak name
     * (from <title>/<h1>) is replaced by a strong one.
     */
    mergeResults(base, next) {
        if (!next) return base;
        if (!base) return next;

        const useNextName = !!next.name && (!base.name || (base.nameIsWeak && !next.nameIsWeak));
        const imageCandidates = [...new Set([...(base.imageCandidates || []), ...(next.imageCandidates || [])])];

        return {
            name: useNextName ? next.name : base.name,
            nameIsWeak: useNextName ? next.nameIsWeak : base.nameIsWeak,
            price: base.price || next.price || null,
            currency: base.price ? base.currency : (next.currency || base.currency || null),
            imageUrl: imageCandidates[0] || null,
            imageCandidates,
            linkLabel: base.linkLabel || next.linkLabel || null,
            pageUrl: next.pageUrl || base.pageUrl
        };
    }

    /**
     * Convert Gemini output to the internal shape. Image URLs are only accepted if they
     * actually appear in the page HTML, so a hallucinated URL can't slip through.
     */
    normalizeAiResult(aiData, pageUrl, html) {
        if (!aiData) return null;

        const imageCandidates = [];
        const resolved = productExtractionService.resolveUrl(aiData.imageUrl, pageUrl);
        if (resolved) {
            const path = new URL(resolved).pathname;
            if (html.includes(aiData.imageUrl) || (path.length > 1 && html.includes(path))) {
                imageCandidates.push(resolved);
            } else {
                console.log(`[ITEM-FETCH] Discarding AI image URL not found in page: ${aiData.imageUrl}`);
            }
        }

        return {
            name: aiData.name ? productExtractionService.cleanText(aiData.name) : null,
            nameIsWeak: false,
            price: productExtractionService.normalizePrice(aiData.price),
            currency: null,
            imageUrl: imageCandidates[0] || null,
            imageCandidates,
            linkLabel: aiData.linkLabel || null,
            pageUrl
        };
    }

    // ---------- Cache ----------

    getCached(url) {
        const entry = this.cache.get(url);
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
            this.cache.delete(url);
            return null;
        }
        return entry.data;
    }

    setCached(url, data) {
        this.cache.delete(url);
        this.cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        while (this.cache.size > CACHE_MAX_ENTRIES) {
            this.cache.delete(this.cache.keys().next().value);
        }
    }

    // ---------- Utilities ----------

    withTimeout(promise, ms, message) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message || `Timed out after ${ms}ms`)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }
}

module.exports = new ItemFetchService();
