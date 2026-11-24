const cheerio = require('cheerio');
const geminiAIService = require('./geminiAIService');
const productExtractionService = require('./productExtractionService');
const itemFetchService = require('./itemFetchService');

/**
 * Extracts a list of products from any listing/wishlist page with Gemini.
 *
 * Instead of raw HTML, Gemini gets a compact "page outline": one line per link, image or
 * piece of text, in reading order, with `---` between list items. That's typically 5–10x
 * smaller than the HTML. Long outlines are split into overlapping chunks that are parsed
 * in parallel, so big lists don't hit the model's output limit.
 */

const CHUNK_CHARS = 25000;
const CHUNK_OVERLAP_CHARS = 1500;
const MAX_CHUNKS = 12;
const MAX_CONCURRENT_CHUNKS = 4;
const CHUNK_TIMEOUT_MS = 45000;

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'iframe', 'template', 'canvas', 'video', 'audio', 'nav', 'footer', 'header', 'form', 'select', 'button', 'head']);
const ITEM_BOUNDARY_TAGS = new Set(['li', 'article', 'tr']);
const BLOCK_TAGS = new Set(['div', 'p', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'article', 'tr', 'td', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'main', 'aside']);

const ITEMS_SCHEMA = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Product name' },
                    price: { type: 'string', description: 'Price as shown, or empty string' },
                    imageUrl: { type: 'string', description: 'IMG url copied exactly from the outline, or empty string' },
                    linkUrl: { type: 'string', description: 'LINK url copied exactly from the outline, or empty string' }
                },
                required: ['name', 'price', 'imageUrl', 'linkUrl']
            }
        }
    },
    required: ['items']
};

class AIWishlistParser {
    /**
     * @param {string} html - Full page HTML
     * @param {string} pageUrl - Page URL (for resolving relative links)
     * @param {Object} options - { onProgress(completedChunks, totalChunks) }
     * @returns {Promise<Array<{name, price, imageUrl, linkUrl, linkLabel}>>}
     */
    async parseItems(html, pageUrl, options = {}) {
        const outline = this.buildPageOutline(html, pageUrl);
        const chunks = this.splitIntoChunks(outline);
        console.log(`[AI-PARSER] Outline is ${outline.length} chars (from ${html.length} chars of HTML), ${chunks.length} chunk(s)`);

        if (chunks.length === 0) return [];

        let completed = 0;
        let failed = 0;
        const results = await this.mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
            try {
                return await this.parseChunkWithRetry(chunk, pageUrl, index);
            } catch (error) {
                failed++;
                console.error(`[AI-PARSER] Chunk ${index + 1}/${chunks.length} failed: ${error.message}`);
                return [];
            } finally {
                completed++;
                if (options.onProgress) await options.onProgress(completed, chunks.length);
            }
        });

        if (failed === chunks.length) {
            throw new Error("We couldn't read the items on that page. Please try again in a minute.");
        }

        return this.dedupe(results.flat());
    }

    async parseChunkWithRetry(chunk, pageUrl, index) {
        try {
            return await this.parseChunk(chunk, pageUrl);
        } catch (error) {
            console.warn(`[AI-PARSER] Chunk ${index + 1} attempt 1 failed (${error.message}), retrying once`);
            return await this.parseChunk(chunk, pageUrl);
        }
    }

    async parseChunk(chunk, pageUrl) {
        const prompt = `Below is a text outline of part of a wishlist or product listing page (${pageUrl}).
Lines starting with "LINK " are link URLs, "IMG " are image URLs (followed by "| alt text"), other lines are visible text. "---" separates list entries.

List every product on the page: something a person could buy or wish for. Skip navigation, ads, recommendations ("you may also like"), and store promos.
For each product give:
- name: product name
- price: current price as shown (with currency symbol), or "" if none
- imageUrl: the product photo — copy an IMG url exactly, or ""
- linkUrl: the product page — copy a LINK url exactly, or ""
Never invent or modify URLs. If the outline starts or ends mid-product, only include it if its name is visible.

OUTLINE:
${chunk}`;

        const result = await itemFetchService.withTimeout(
            geminiAIService.generateStructuredResponse(prompt, ITEMS_SCHEMA, {
                maxTokens: 16384,
                temperature: 0.1,
                thinkingBudget: 0
            }),
            CHUNK_TIMEOUT_MS,
            `AI parsing timed out after ${CHUNK_TIMEOUT_MS / 1000}s`
        );

        const items = Array.isArray(result.data?.items) ? result.data.items : [];
        return items.map(item => this.validateItem(item, chunk)).filter(Boolean);
    }

    /**
     * Clean an AI item. URLs are kept only if they appear verbatim in the chunk,
     * so hallucinated links/images are dropped.
     */
    validateItem(item, chunk) {
        const name = productExtractionService.cleanText(item?.name);
        if (!name) return null;

        const urlInChunk = (url) => {
            const clean = productExtractionService.cleanText(url);
            if (!clean) return null;
            for (const prefix of ['LINK ', 'IMG ']) {
                let index = chunk.indexOf(prefix + clean);
                while (index !== -1) {
                    // Must match the whole URL, not just a prefix of a longer one
                    const after = chunk[index + prefix.length + clean.length];
                    if (after === undefined || after === '\n' || after === ' ') return clean;
                    index = chunk.indexOf(prefix + clean, index + 1);
                }
            }
            return null;
        };

        const linkUrl = urlInChunk(item.linkUrl);
        return {
            name,
            price: productExtractionService.normalizePrice(item.price),
            imageUrl: urlInChunk(item.imageUrl),
            linkUrl,
            linkLabel: linkUrl ? productExtractionService.buildLinkLabel(linkUrl, null) : null
        };
    }

    dedupe(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = item.linkUrl || item.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ---------- Outline ----------

    /**
     * Convert HTML into compact text lines: LINK <url>, IMG <url> | <alt>, text, and ---
     * between list entries. Links are absolute and cleaned (tracking params removed).
     */
    buildPageOutline(html, pageUrl) {
        const $ = cheerio.load(html || '');
        const root = $('main, [role="main"]').first();
        const start = root.length ? root : $('body');
        const lines = [];

        const push = (line) => {
            if (line && lines[lines.length - 1] !== line) lines.push(line);
        };

        const walk = (node) => {
            if (node.type === 'text') {
                const text = productExtractionService.cleanText(node.data);
                if (text) push(text.length > 200 ? `${text.substring(0, 200)}…` : text);
                return;
            }
            if (node.type !== 'tag') return;

            const tag = node.name;
            if (SKIP_TAGS.has(tag)) return;

            const attribs = node.attribs || {};
            if (attribs['aria-hidden'] === 'true' || attribs.hidden !== undefined) return;

            if (ITEM_BOUNDARY_TAGS.has(tag) || attribs['data-itemid'] || attribs['data-item-id'] || attribs['data-product-id']) {
                push('---');
            }

            if (tag === 'img') {
                const src = this.imageSource(attribs, pageUrl);
                if (src) push(`IMG ${src}${attribs.alt ? ` | ${productExtractionService.cleanText(attribs.alt) || ''}` : ''}`);
                return;
            }

            if (tag === 'a' && attribs.href) {
                const href = productExtractionService.resolveUrl(attribs.href, pageUrl);
                if (href) push(`LINK ${itemFetchService.safeNormalize(href) || href}`);
            }

            for (const child of node.children || []) walk(child);

            if (BLOCK_TAGS.has(tag)) push('');
        };

        start.each((_, el) => walk(el));

        return lines
            .join('\n')
            .replace(/\n{2,}/g, '\n')
            .trim();
    }

    /** Pick the real image URL, preferring lazy-load attributes over placeholder src */
    imageSource(attribs, pageUrl) {
        const width = parseInt(attribs.width, 10);
        const height = parseInt(attribs.height, 10);
        if ((width && width < 40) || (height && height < 40)) return null; // icons / tracking pixels

        const srcset = attribs['data-srcset'] || attribs.srcset;
        const fromSrcset = srcset ? srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).pop() : null;

        const candidates = [
            attribs['data-old-hires'], attribs['data-src'], attribs['data-lazy-src'],
            attribs['data-original'], attribs['data-zoom-image'], attribs.src, fromSrcset
        ];
        for (const candidate of candidates) {
            const resolved = productExtractionService.resolveUrl(candidate, pageUrl);
            if (resolved && !/\.svg(\?|$)/i.test(resolved)) return resolved;
        }
        return null;
    }

    /** Split on line boundaries into chunks with a little overlap, so items at the edges aren't lost */
    splitIntoChunks(outline) {
        if (!outline) return [];
        const chunks = [];
        let start = 0;

        while (start < outline.length && chunks.length < MAX_CHUNKS) {
            let end = Math.min(start + CHUNK_CHARS, outline.length);
            if (end < outline.length) {
                const boundary = outline.lastIndexOf('\n---', end);
                const newline = outline.lastIndexOf('\n', end);
                end = boundary > start + CHUNK_CHARS / 2 ? boundary : (newline > start ? newline : end);
            }
            chunks.push(outline.substring(start, end));
            if (end >= outline.length) break;

            const overlapStart = outline.lastIndexOf('\n', end - CHUNK_OVERLAP_CHARS);
            start = overlapStart > start ? overlapStart + 1 : end;
        }

        return chunks;
    }

    async mapWithConcurrency(items, limit, fn) {
        const results = new Array(items.length);
        let next = 0;
        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const index = next++;
                results[index] = await fn(items[index], index);
            }
        });
        await Promise.all(workers);
        return results;
    }
}

module.exports = new AIWishlistParser();
