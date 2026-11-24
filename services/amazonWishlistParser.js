const cheerio = require('cheerio');
const productExtractionService = require('./productExtractionService');

/**
 * Parses Amazon wishlist pages (pure HTML -> data, no network calls).
 *
 * Amazon renders the first page of items server-side and links the next page via a hidden
 * `input[name=showMoreUrl]`. Fetching that URL returns the next batch (~12 items) as HTML.
 * The batch containing `#endOfListMarker` is the last one — after it, Amazon starts over.
 */

const AMAZON_HOST = /(^|\.)amazon\.[a-z.]+$/i;
const WISHLIST_PATH = /\/(?:hz\/wishlist\/(?:ls|genericItemsPage|printview)|gp\/registry\/wishlist|wishlist(?:\/ls)?)\/([A-Z0-9]{8,16})(?:[/?]|$)/i;
const AMAZON_SHORT_HOSTS = new Set(['a.co', 'amzn.to', 'amzn.eu', 'amzn.asia', 'amzn.com']);

class AmazonWishlistParser {
    isShortLink(url) {
        try {
            return AMAZON_SHORT_HOSTS.has(new URL(url).hostname.replace(/^www\./, ''));
        } catch (error) {
            return false;
        }
    }

    /**
     * Returns the canonical wishlist URL (https://www.amazon.com/hz/wishlist/ls/{ID}) or null
     * if the URL isn't an Amazon wishlist.
     */
    canonicalWishlistUrl(url) {
        try {
            const parsed = new URL(url);
            if (!AMAZON_HOST.test(parsed.hostname)) return null;
            const match = parsed.pathname.match(WISHLIST_PATH);
            return match ? `${parsed.origin}/hz/wishlist/ls/${match[1].toUpperCase()}` : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse one wishlist page or "show more" batch.
     * @returns {{ items: Array, nextUrl: string|null, ended: boolean, listName: string|null }}
     */
    parsePage(html, baseUrl) {
        const $ = cheerio.load(html || '');
        const origin = new URL(baseUrl).origin;
        const items = [];

        $('li.g-item-sortable, li[data-itemid]').each((_, el) => {
            const li = $(el);
            const itemId = li.attr('data-itemid') || li.attr('id') || null;

            const asin = this.findAsin(li);
            const titleLink = li.find('a[id^="itemName_"]').first();
            const productLink = titleLink.length ? titleLink : li.find('a[href*="/dp/"]').first();

            const name = productExtractionService.cleanText(
                titleLink.attr('title') || titleLink.text() ||
                productLink.attr('title') ||
                li.find('img').first().attr('alt') ||
                li.find('h2, h3').first().text()
            );
            if (!name) return;

            const linkUrl = asin
                ? `${origin}/dp/${asin}`
                : productExtractionService.resolveUrl(productLink.attr('href'), baseUrl);

            const dataPrice = li.attr('data-price');
            const priceText = (dataPrice && dataPrice !== '-Infinity' ? dataPrice : null) ||
                li.find('[id^="itemPrice_"] .a-offscreen').first().text() ||
                li.find('.a-price .a-offscreen').first().text();

            const comment = productExtractionService.cleanText(li.find('[id^="itemComment_"]').first().text());
            const amazonPriority = parseInt(productExtractionService.cleanText(li.find('[id^="itemPriority_"]').first().text()), 10);

            items.push({
                itemId,
                name: productExtractionService.decodeEntities(name),
                price: productExtractionService.normalizePrice(priceText),
                imageUrl: this.largerImage(productExtractionService.resolveUrl(li.find('img').first().attr('src'), baseUrl)),
                linkUrl,
                linkLabel: 'Amazon',
                description: comment || null,
                // Amazon priority is -2 (lowest) .. 2 (highest); ours is 0..5 with 3 as default
                priority: Number.isFinite(amazonPriority) ? Math.min(5, Math.max(1, amazonPriority + 3)) : undefined
            });
        });

        const nextValue = $('input[name="showMoreUrl"]').attr('value');
        return {
            items,
            nextUrl: nextValue ? new URL(nextValue, baseUrl).href : null,
            ended: $('#endOfListMarker').length > 0,
            listName: productExtractionService.cleanText($('#profile-list-name').first().text())
        };
    }

    findAsin(li) {
        const direct = li.attr('data-csa-c-item-id');
        if (direct && /^[A-Z0-9]{10}$/i.test(direct)) return direct.toUpperCase();

        const params = li.attr('data-reposition-action-params') || '';
        const fromParams = params.match(/ASIN:([A-Z0-9]{10})/i);
        if (fromParams) return fromParams[1].toUpperCase();

        const href = li.find('a[href*="/dp/"]').first().attr('href') || '';
        const fromHref = href.match(/\/dp\/([A-Z0-9]{10})/i);
        return fromHref ? fromHref[1].toUpperCase() : null;
    }

    /** Amazon thumbnails are tiny (e.g. ._SS220_.jpg) — ask for a 500px version instead */
    largerImage(url) {
        if (!url || !/media-amazon\.com|images-amazon\.com/.test(url)) return url;
        return url.replace(/\._[^/]*?_\.(jpe?g|png|webp|gif)$/i, '._SL500_.$1');
    }
}

module.exports = new AmazonWishlistParser();
