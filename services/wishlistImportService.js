const cheerio = require('cheerio');
const puppeteerService = require('./puppeteerService');
const itemFetchService = require('./itemFetchService');
const productExtractionService = require('./productExtractionService');
const amazonWishlistParser = require('./amazonWishlistParser');
const aiWishlistParser = require('./aiWishlistParser');

/**
 * Import all items from a wishlist / product listing URL.
 *
 * Amazon wishlists:  plain HTTP + Amazon's own "show more" pagination (no browser, no AI),
 *                    falling back to Chrome + scrolling if Amazon blocks the request.
 * Everything else:   structured data (JSON-LD) -> Chrome + scrolling -> chunked AI parsing.
 *
 * Images are NOT downloaded here — items carry their original imageUrl and images are
 * processed later, only for the items the user actually imports.
 */

const AMAZON_MAX_PAGES = 40; // ~12 items per page
const BROWSER_NAV_TIMEOUT_MS = 25000;
const GENERIC_SCROLL_BUDGET_MS = 15000;
const AMAZON_SCROLL_BUDGET_MS = 60000;
const SCROLL_WAIT_MS = 800;
const MIN_STRUCTURED_ITEMS = 2;

class WishlistImportService {
    /**
     * @param {string} rawUrl
     * @param {Object} options - { onProgress(percent, message) }
     * @returns {Promise<{wishlistTitle, pageTitle, sourceUrl, totalItems, items, processingMethod}>}
     */
    async importFromUrl(rawUrl, options = {}) {
        const progress = options.onProgress || (async () => {});
        let url = itemFetchService.normalizeUrl(rawUrl);

        await progress(5, 'Loading the page…');

        // Resolve short links (a.co, amzn.to) and try a plain request first — it's fast
        let fast = null;
        try {
            const response = await itemFetchService.fetchHtml(url);
            const blocked = productExtractionService.isBlockedPage(response.html, response.status);
            fast = { ...response, blocked };
            url = itemFetchService.safeNormalize(response.finalUrl) || url;
        } catch (error) {
            console.log(`[WISHLIST-IMPORT] Plain fetch failed for ${url}: ${error.message}`);
        }

        const amazonUrl = amazonWishlistParser.canonicalWishlistUrl(url);
        if (amazonUrl) {
            return this.importAmazonWishlist(amazonUrl, fast, progress);
        }
        return this.importGenericPage(url, fast, progress);
    }

    // ---------- Amazon ----------

    async importAmazonWishlist(url, fast, progress) {
        let result = null;

        if (fast && !fast.blocked) {
            try {
                result = await this.paginateAmazon(url, fast.html, progress);
            } catch (error) {
                console.log(`[WISHLIST-IMPORT] Amazon pagination failed: ${error.message}`);
            }
        }

        if (!result || result.items.length === 0) {
            console.log('[WISHLIST-IMPORT] Falling back to browser for Amazon wishlist');
            await progress(15, 'Opening the list in a browser…');
            const html = await this.loadWithBrowser(url, (page) => this.scrollAmazon(page, progress));
            const parsed = amazonWishlistParser.parsePage(html, url);
            result = { items: this.dedupeAmazon(parsed.items), listName: parsed.listName };
        }

        if (result.items.length === 0) {
            throw new Error("We couldn't find any items on that Amazon list. Make sure the list is public or shared, then try again.");
        }

        await progress(95, `Found ${result.items.length} items`);
        return this.buildResult({
            items: result.items,
            title: result.listName,
            pageTitle: result.listName,
            sourceUrl: url,
            processingMethod: 'amazon_wishlist'
        });
    }

    async paginateAmazon(url, firstPageHtml, progress) {
        const first = amazonWishlistParser.parsePage(firstPageHtml, url);
        const items = [...first.items];
        const seen = new Set(items.map(item => item.itemId || item.linkUrl));
        let nextUrl = first.ended ? null : first.nextUrl;
        let pages = 1;

        await progress(15, `Loaded ${items.length} items…`);

        while (nextUrl && pages < AMAZON_MAX_PAGES) {
            const { html } = await itemFetchService.fetchHtml(nextUrl);
            const page = amazonWishlistParser.parsePage(html, url);
            pages++;

            const fresh = page.items.filter(item => !seen.has(item.itemId || item.linkUrl));
            fresh.forEach(item => seen.add(item.itemId || item.linkUrl));
            items.push(...fresh);

            // After the last page Amazon starts over from the top, so stop on the end marker
            // (or as a safety net, on a page with nothing new)
            if (page.ended || fresh.length === 0) break;
            nextUrl = page.nextUrl;

            await progress(Math.min(90, 15 + pages * 5), `Loaded ${items.length} items…`);
        }

        console.log(`[WISHLIST-IMPORT] Amazon pagination: ${items.length} items over ${pages} page(s)`);
        return { items, listName: first.listName };
    }

    dedupeAmazon(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = item.itemId || item.linkUrl || item.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /** Scroll until the end-of-list marker shows up or the item count stops growing */
    async scrollAmazon(page, progress) {
        const deadline = Date.now() + AMAZON_SCROLL_BUDGET_MS;
        let lastCount = -1;
        let stableRounds = 0;

        while (Date.now() < deadline) {
            const { count, ended } = await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
                return {
                    count: document.querySelectorAll('li.g-item-sortable, li[data-itemid]').length,
                    ended: !!document.querySelector('#endOfListMarker')
                };
            });
            if (ended) break;
            stableRounds = count === lastCount ? stableRounds + 1 : 0;
            if (stableRounds >= 3) break;
            if (count !== lastCount) await progress(Math.min(85, 20 + count), `Loaded ${count} items…`);
            lastCount = count;
            await new Promise(resolve => setTimeout(resolve, SCROLL_WAIT_MS));
        }
    }

    // ---------- Other sites ----------

    async importGenericPage(url, fast, progress) {
        // 1. Structured data in the plain HTML
        if (fast && !fast.blocked) {
            const structured = productExtractionService.extractProductList(fast.html, url);
            if (structured.length >= MIN_STRUCTURED_ITEMS) {
                return this.buildStructuredResult(structured, fast.html, url);
            }
        }

        // 2. Render with Chrome (handles JS-built pages and lazy loading)
        let browserHtml = null;
        try {
            await progress(15, 'Opening the page in a browser…');
            browserHtml = await this.loadWithBrowser(url, (page) => this.scrollGeneric(page));
            if (productExtractionService.isBlockedPage(browserHtml, 200) &&
                productExtractionService.extractProductList(browserHtml, url).length === 0) {
                browserHtml = null;
            }
        } catch (error) {
            console.log(`[WISHLIST-IMPORT] Browser load failed for ${url}: ${error.message}`);
        }

        if (browserHtml) {
            const structured = productExtractionService.extractProductList(browserHtml, url);
            if (structured.length >= MIN_STRUCTURED_ITEMS) {
                return this.buildStructuredResult(structured, browserHtml, url);
            }
        }

        // 3. AI on a compact outline of the page
        const html = browserHtml || (fast && !fast.blocked ? fast.html : null);
        if (!html) {
            throw new Error("That site blocked our request, so we couldn't read the list. You can export it to CSV and import that instead.");
        }

        await progress(35, 'Reading the items…');
        const items = await aiWishlistParser.parseItems(html, url, {
            onProgress: (done, total) => progress(35 + Math.round((done / total) * 55), `Reading the items… (${done}/${total})`)
        });

        if (items.length === 0) {
            throw new Error("We couldn't find any products on that page. Make sure the link goes to the list itself and that it's public.");
        }

        const title = this.pageTitle(html);
        return this.buildResult({ items, title, pageTitle: title, sourceUrl: url, processingMethod: 'ai_parsing' });
    }

    buildStructuredResult(items, html, url) {
        const title = this.pageTitle(html);
        return this.buildResult({
            items: items.map(item => ({
                ...item,
                linkUrl: item.linkUrl ? (itemFetchService.safeNormalize(item.linkUrl) || item.linkUrl) : null,
                linkLabel: item.linkUrl ? productExtractionService.buildLinkLabel(item.linkUrl, null) : null
            })),
            title,
            pageTitle: title,
            sourceUrl: url,
            processingMethod: 'structured_data'
        });
    }

    /** Scroll to trigger lazy loading until the page stops growing (time-boxed) */
    async scrollGeneric(page) {
        const deadline = Date.now() + GENERIC_SCROLL_BUDGET_MS;
        let lastHeight = 0;
        let stableRounds = 0;

        while (Date.now() < deadline && stableRounds < 2) {
            const height = await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
                return document.body.scrollHeight;
            });
            stableRounds = height === lastHeight ? stableRounds + 1 : 0;
            lastHeight = height;
            await new Promise(resolve => setTimeout(resolve, SCROLL_WAIT_MS));
        }
    }

    // ---------- Shared ----------

    async loadWithBrowser(url, afterLoad) {
        return itemFetchService.withBrowserSlot(() => puppeteerService.withPage(async (page) => {
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BROWSER_NAV_TIMEOUT_MS });
            } catch (error) {
                if (error.name !== 'TimeoutError') throw error;
                console.log(`[WISHLIST-IMPORT] Navigation timed out for ${url}, using what loaded`);
            }
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
            if (afterLoad) await afterLoad(page);
            return page.content();
        }, {
            // Images aren't needed: their URLs are in the DOM even when the request is blocked
            blockResources: ['image', 'media', 'font'],
            shouldBlockRequest: (requestUrl) => itemFetchService.isPrivateRequestUrl(requestUrl)
        }));
    }

    pageTitle(html) {
        const $ = cheerio.load(html || '');
        const raw = productExtractionService.cleanText($('meta[property="og:title"]').attr('content')) ||
            productExtractionService.cleanText($('title').first().text());
        return raw ? raw.replace(/^Amazon\.[a-z.]+:\s*/i, '') : null;
    }

    buildResult({ items, title, pageTitle, sourceUrl, processingMethod }) {
        return {
            wishlistTitle: title || null,
            pageTitle: pageTitle || null,
            sourceUrl,
            totalItems: items.length,
            items: items.map(({ itemId, ...item }) => item),
            processingMethod
        };
    }
}

module.exports = new WishlistImportService();
