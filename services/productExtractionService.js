const cheerio = require('cheerio');

/**
 * Pure HTML -> product data extraction (no network calls).
 *
 * Reads the structured data stores publish for search engines, in priority order:
 *   1. Site-specific selectors (Amazon)
 *   2. JSON-LD Product blocks
 *   3. Open Graph / product meta tags
 *   4. schema.org microdata
 *   5. <h1> / <title> (marked weak — a fallback may still be tried)
 */

const KNOWN_STORES = {
    amazon: 'Amazon',
    ebay: 'eBay',
    walmart: 'Walmart',
    target: 'Target',
    etsy: 'Etsy',
    bestbuy: 'Best Buy',
    homedepot: 'Home Depot',
    lowes: "Lowe's",
    costco: 'Costco',
    ikea: 'IKEA',
    rei: 'REI',
    wayfair: 'Wayfair',
    kohls: "Kohl's",
    macys: "Macy's",
    nordstrom: 'Nordstrom',
    lego: 'LEGO',
    apple: 'Apple',
    nike: 'Nike',
    sephora: 'Sephora',
    ulta: 'Ulta',
    barnesandnoble: 'Barnes & Noble',
    gamestop: 'GameStop',
    aliexpress: 'AliExpress',
    temu: 'Temu',
    shein: 'SHEIN',
    zara: 'Zara',
    uniqlo: 'Uniqlo',
    patagonia: 'Patagonia'
};

const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'ne', 'or']);

const BLOCKED_TITLE_PATTERN = /robot check|captcha|access denied|just a moment|attention required|are you a human|verify you are (a )?human|pardon our interruption|request blocked|security check|bot detection/i;
const BLOCKED_BODY_MARKERS = [
    'Enter the characters you see below',
    "Sorry, we just need to make sure you're not a robot",
    '_cf_chl_opt',
    'px-captcha',
    'captcha-delivery.com'
];

const AI_KEEP_ATTRIBUTES = new Set([
    'src', 'data-src', 'data-old-hires', 'data-zoom-image', 'alt', 'content',
    'property', 'name', 'itemprop', 'itemtype', 'id', 'type', 'datetime'
]);

class ProductExtractionService {
    /**
     * Extract product data from a page's HTML.
     * @param {string} html - Full document HTML (including <head>)
     * @param {string} pageUrl - Final URL of the page, used to resolve relative image URLs
     * @returns {Object} { name, nameIsWeak, price, currency, imageUrl, imageCandidates, linkLabel }
     */
    extractProductData(html, pageUrl) {
        const $ = cheerio.load(html || '');
        const sources = [
            this.extractSiteSpecific($, pageUrl),
            this.extractJsonLd($),
            this.extractMetaTags($),
            this.extractMicrodata($)
        ];

        let name = null;
        let price = null;
        let currency = null;
        const imageCandidates = [];

        for (const source of sources) {
            if (!source) continue;
            if (!name && source.name) name = source.name;
            if (!price && source.price) {
                price = source.price;
                currency = source.currency || currency;
            }
            if (!currency && source.currency) currency = source.currency;
            for (const img of source.images || []) imageCandidates.push(img);
        }

        let nameIsWeak = false;
        if (!name) {
            name = this.cleanText($('h1').first().text()) || this.cleanText($('title').first().text()) || null;
            nameIsWeak = !!name;
        }

        const siteName = this.cleanText($('meta[property="og:site_name"]').attr('content'));
        const linkLabel = this.buildLinkLabel(pageUrl, siteName);

        const resolvedImages = this.uniqueImages(imageCandidates, pageUrl);

        return {
            name: name ? this.stripSiteSuffix(this.decodeEntities(name), [siteName, linkLabel]) : null,
            nameIsWeak,
            price: this.normalizePrice(price),
            currency: currency || null,
            imageUrl: resolvedImages[0] || null,
            imageCandidates: resolvedImages,
            linkLabel
        };
    }

    /**
     * Extract a list of products from a listing/wishlist page's structured data
     * (JSON-LD Product nodes and ItemList entries). No AI involved.
     * @param {string} html
     * @param {string} pageUrl
     * @returns {Array<{name, price, imageUrl, linkUrl}>}
     */
    extractProductList(html, pageUrl) {
        const $ = cheerio.load(html || '');
        const nodes = [];

        $('script[type="application/ld+json"]').each((_, el) => {
            const parsed = this.safeJsonParse($(el).contents().text());
            if (parsed) this.collectProducts(parsed, nodes, 0);
            if (parsed) this.collectListItems(parsed, nodes, 0);
        });

        const items = [];
        const seen = new Set();
        for (const node of nodes) {
            const name = this.asString(node.name);
            if (!name) continue;

            const offer = node.offers || node.hasVariant ? this.findOffer(node) : null;
            const offerUrl = [].concat(node.offers || [])[0]?.url;
            const linkUrl = this.resolveUrl(this.asString(node.url) || offerUrl || node['@id'], pageUrl);
            const key = linkUrl || name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            items.push({
                name: this.decodeEntities(name),
                price: offer ? this.normalizePrice(offer.price) : null,
                imageUrl: this.uniqueImages(this.flattenImages(node.image), pageUrl)[0] || null,
                linkUrl
            });
        }
        return items;
    }

    /**
     * Collect ItemList entries that describe items without a Product @type
     * (e.g. { "@type": "ListItem", "name": ..., "url": ... }).
     */
    collectListItems(node, out, depth) {
        if (!node || depth > 8) return;
        if (Array.isArray(node)) {
            node.forEach(child => this.collectListItems(child, out, depth + 1));
            return;
        }
        if (typeof node !== 'object') return;

        const types = [].concat(node['@type'] || []).map(t => String(t).replace(/^.*[:/]/, '').toLowerCase());
        if (types.includes('breadcrumblist')) return;
        if (types.includes('listitem') && node.name && node.url && !node.item) {
            out.push(node);
        }
        if (node['@graph']) this.collectListItems(node['@graph'], out, depth + 1);
        if (node.itemListElement) this.collectListItems(node.itemListElement, out, depth + 1);
        if (node.mainEntity) this.collectListItems(node.mainEntity, out, depth + 1);
    }

    /**
     * Detect bot-check / CAPTCHA / block pages so we don't extract junk from them.
     */
    isBlockedPage(html, status) {
        if ([401, 403, 429, 503].includes(status)) return true;
        if (!html) return false;
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && BLOCKED_TITLE_PATTERN.test(titleMatch[1])) return true;
        return BLOCKED_BODY_MARKERS.some(marker => html.includes(marker));
    }

    /**
     * Shrink HTML to just the parts an AI needs: metadata plus main content markup,
     * with scripts/styles/svg and most attributes removed.
     * @param {string} html
     * @param {number} maxChars
     * @returns {string}
     */
    cleanHtmlForAi(html, maxChars = 40000) {
        const $ = cheerio.load(html || '');

        $('script:not([type="application/ld+json"]), style, noscript, svg, iframe, link, template, canvas, video, audio, source, nav, footer').remove();
        $('*').contents().filter((_, node) => node.type === 'comment').remove();

        $('*').each((_, el) => {
            for (const attr of Object.keys(el.attribs || {})) {
                if (!AI_KEEP_ATTRIBUTES.has(attr)) $(el).removeAttr(attr);
            }
        });

        const head = $('head meta, head title, script[type="application/ld+json"]')
            .map((_, el) => $.html(el))
            .get()
            .join('\n');

        const main = $('main, [role="main"], #main, #content').first();
        const bodyHtml = (main.length ? $.html(main) : $('body').html()) || '';

        const combined = `${head}\n${bodyHtml}`.replace(/\s+/g, ' ').trim();
        return combined.length > maxChars ? combined.substring(0, maxChars) : combined;
    }

    // ---------- Sources ----------

    extractSiteSpecific($, pageUrl) {
        let host = '';
        try {
            host = new URL(pageUrl).hostname;
        } catch (e) {
            return null;
        }

        if (/(^|\.)amazon\.[a-z.]+$/i.test(host)) {
            const name = this.cleanText($('#productTitle').first().text());

            const priceText = [
                '#corePrice_feature_div .a-offscreen',
                '#corePriceDisplay_desktop_feature_div .a-offscreen',
                '#apex_desktop .a-price .a-offscreen',
                '#priceblock_ourprice',
                '#priceblock_dealprice',
                '.a-price .a-offscreen'
            ].map(sel => this.cleanText($(sel).first().text())).find(Boolean);

            const images = [];
            const landing = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront').first();
            if (landing.length) {
                images.push(landing.attr('data-old-hires'));
                const dynamic = landing.attr('data-a-dynamic-image');
                if (dynamic) {
                    try {
                        // Keys are image URLs, values are [width, height] — pick the largest
                        const entries = Object.entries(JSON.parse(dynamic));
                        entries.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
                        images.push(...entries.map(([url]) => url));
                    } catch (e) {
                        // ignore malformed attribute
                    }
                }
                images.push(landing.attr('src'));
            }

            return {
                name,
                price: priceText || null,
                currency: null,
                images: images.filter(Boolean)
            };
        }

        return null;
    }

    extractJsonLd($) {
        const products = [];

        $('script[type="application/ld+json"]').each((_, el) => {
            const raw = $(el).contents().text();
            const parsed = this.safeJsonParse(raw);
            if (parsed) this.collectProducts(parsed, products, 0);
        });

        const product = products.find(p => p.name) || products[0];
        if (!product) return null;

        const offer = this.findOffer(product);

        return {
            name: this.asString(product.name),
            price: offer ? offer.price : null,
            currency: offer ? offer.currency : null,
            images: this.flattenImages(product.image)
        };
    }

    extractMetaTags($) {
        const meta = (selector) => this.cleanText($(selector).first().attr('content'));

        const price = meta('meta[property="product:price:amount"]')
            || meta('meta[property="og:price:amount"]')
            || meta('meta[name="twitter:data1"][content*="$"]');
        const currency = meta('meta[property="product:price:currency"]')
            || meta('meta[property="og:price:currency"]');

        return {
            name: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]'),
            price,
            currency,
            images: [
                meta('meta[property="og:image:secure_url"]'),
                meta('meta[property="og:image"]'),
                meta('meta[name="og:image"]'),
                meta('meta[name="twitter:image"]'),
                meta('meta[name="twitter:image:src"]')
            ].filter(Boolean)
        };
    }

    extractMicrodata($) {
        const scope = $('[itemtype*="schema.org/Product"]').first();
        if (!scope.length) return null;

        const prop = (name) => {
            const el = scope.find(`[itemprop="${name}"]`).first();
            if (!el.length) return null;
            return this.cleanText(el.attr('content') || el.attr('src') || el.attr('href') || el.text());
        };

        return {
            name: prop('name'),
            price: prop('price') || prop('lowPrice'),
            currency: prop('priceCurrency'),
            images: [prop('image')].filter(Boolean)
        };
    }

    // ---------- JSON-LD helpers ----------

    collectProducts(node, out, depth) {
        if (!node || depth > 8) return;
        if (Array.isArray(node)) {
            node.forEach(child => this.collectProducts(child, out, depth + 1));
            return;
        }
        if (typeof node !== 'object') return;

        const types = [].concat(node['@type'] || []).map(t => String(t).replace(/^.*[:/]/, '').toLowerCase());
        if (types.some(t => t === 'product' || t === 'productgroup' || t === 'individualproduct' || t === 'productmodel')) {
            out.push(node);
        }

        if (node['@graph']) this.collectProducts(node['@graph'], out, depth + 1);
        if (node.mainEntity) this.collectProducts(node.mainEntity, out, depth + 1);
        if (node.itemListElement) this.collectProducts(node.itemListElement, out, depth + 1);
        if (node.item) this.collectProducts(node.item, out, depth + 1);
    }

    findOffer(product) {
        const candidates = [].concat(product.offers || []);
        if (product.hasVariant) {
            for (const variant of [].concat(product.hasVariant)) {
                candidates.push(...[].concat(variant?.offers || []));
            }
        }

        for (const offer of candidates) {
            if (!offer || typeof offer !== 'object') continue;
            const spec = [].concat(offer.priceSpecification || [])[0];
            const price = offer.price ?? offer.lowPrice ?? spec?.price;
            if (price !== undefined && price !== null && price !== '') {
                return {
                    price: String(price),
                    currency: offer.priceCurrency || spec?.priceCurrency || null
                };
            }
        }
        return null;
    }

    flattenImages(image) {
        const out = [];
        for (const img of [].concat(image || [])) {
            if (typeof img === 'string') out.push(img);
            else if (img && typeof img === 'object') out.push(img.url || img.contentUrl || img['@id']);
        }
        return out.filter(Boolean);
    }

    safeJsonParse(raw) {
        if (!raw) return null;
        const text = raw.trim();
        try {
            return JSON.parse(text);
        } catch (e) {
            try {
                // Some sites put raw newlines/tabs inside strings
                return JSON.parse(text.replace(/[\u0000-\u001F]+/g, ' '));
            } catch (e2) {
                return null;
            }
        }
    }

    asString(value) {
        if (typeof value === 'string') return this.cleanText(value);
        if (Array.isArray(value)) return this.asString(value[0]);
        return null;
    }

    // ---------- Normalization helpers ----------

    /**
     * Convert a price in any common format to a plain decimal string ("1299.00" -> "1299.00",
     * "1.299,00 €" -> "1299.00", "$10 - $20" -> "10"). Returns null if no number found.
     */
    normalizePrice(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;

        const match = String(raw).match(/\d[\d.,\s ']*/);
        if (!match) return null;

        let num = match[0].replace(/[\s ']/g, '').replace(/[.,]+$/, '');
        const lastComma = num.lastIndexOf(',');
        const lastDot = num.lastIndexOf('.');

        if (lastComma > -1 && lastDot > -1) {
            // Whichever separator comes last is the decimal separator
            num = lastComma > lastDot
                ? num.replace(/\./g, '').replace(',', '.')
                : num.replace(/,/g, '');
        } else if (lastComma > -1) {
            const decimals = num.length - lastComma - 1;
            const commaCount = (num.match(/,/g) || []).length;
            num = (commaCount === 1 && decimals !== 3)
                ? num.replace(',', '.')
                : num.replace(/,/g, '');
        } else if (lastDot > -1) {
            const dotCount = (num.match(/\./g) || []).length;
            if (dotCount > 1) num = num.replace(/\./g, '');
        }

        const value = parseFloat(num);
        return Number.isFinite(value) ? String(value) : null;
    }

    buildLinkLabel(pageUrl, siteName) {
        let host;
        try {
            host = new URL(pageUrl).hostname.replace(/^www\./, '');
        } catch (e) {
            return siteName || null;
        }

        const parts = host.split('.');
        let base = parts[parts.length - 2] || parts[0];
        if (parts.length >= 3 && SECOND_LEVEL_SUFFIXES.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
            base = parts[parts.length - 3];
        }

        if (KNOWN_STORES[base]) return KNOWN_STORES[base];
        if (siteName && siteName.length <= 40) return siteName;
        return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
    }

    stripSiteSuffix(name, labels) {
        let result = name;
        for (const label of labels.filter(Boolean)) {
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp(`\\s*[|\\-–—:]\\s*${escaped}(\\.com)?\\s*$`, 'i'), '');
        }
        return this.cleanText(result) || name;
    }

    uniqueImages(candidates, pageUrl) {
        const seen = new Set();
        const out = [];
        for (const candidate of candidates) {
            const resolved = this.resolveUrl(candidate, pageUrl);
            if (resolved && !seen.has(resolved)) {
                seen.add(resolved);
                out.push(resolved);
            }
        }
        return out;
    }

    resolveUrl(value, base) {
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed || trimmed.startsWith('data:')) return null;
        try {
            const url = new URL(trimmed, base);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch (e) {
            return null;
        }
    }

    decodeEntities(text) {
        if (!text || !/&[#a-z0-9]+;/i.test(text)) return text;
        return cheerio.load(`<p>${text}</p>`)('p').text();
    }

    cleanText(text) {
        if (!text || typeof text !== 'string') return null;
        const cleaned = text.replace(/\s+/g, ' ').trim();
        return cleaned || null;
    }
}

module.exports = new ProductExtractionService();
