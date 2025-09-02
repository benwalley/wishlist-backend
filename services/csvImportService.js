const { ApiError } = require('../middleware/errorHandler');
const csv = require('csv-parser');
const { Readable } = require('stream');

class CsvImportService {
    constructor() {
        this.allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.requiredHeaders = ['name'];
        this.optionalHeaders = ['price', 'imageUrl', 'linkUrl', 'description'];
    }

    /**
     * Validate uploaded CSV file
     * @param {Object} file - Multer file object
     * @returns {boolean} Is valid
     */
    validateFile(file) {
        if (!file) {
            throw new ApiError('No file uploaded', {
                status: 400,
                errorType: 'NO_FILE',
                publicMessage: 'Please upload a CSV file'
            });
        }

        if (file.size > this.maxFileSize) {
            throw new ApiError('File too large', {
                status: 400,
                errorType: 'FILE_TOO_LARGE',
                publicMessage: `File size must be less than ${this.maxFileSize / 1024 / 1024}MB`
            });
        }

        if (!this.allowedMimeTypes.includes(file.mimetype) && !file.originalname.toLowerCase().endsWith('.csv')) {
            throw new ApiError('Invalid file type', {
                status: 400,
                errorType: 'INVALID_FILE_TYPE',
                publicMessage: 'Please upload a CSV file'
            });
        }

        return true;
    }

    /**
     * Parse CSV content from buffer using csv-parser library
     * @param {Buffer} buffer - CSV file buffer
     * @returns {Promise<Array<Object>>} Parsed CSV data
     */
    async parseCsv(buffer) {
        return new Promise((resolve, reject) => {
            const items = [];
            const errors = [];
            let headersSeen = false;
            let headers = [];

            // Create readable stream from buffer
            const readable = Readable.from(buffer);

            readable
                .pipe(csv({
                    skipEmptyLines: true,
                    mapHeaders: ({ header }) => header.trim().toLowerCase()
                }))
                .on('headers', (csvHeaders) => {
                    headers = csvHeaders;
                    headersSeen = true;
                    console.log(`[CSV-IMPORT] Headers detected: ${csvHeaders.join(', ')}`);
                    
                    try {
                        this.validateHeaders(csvHeaders);
                    } catch (error) {
                        return reject(error);
                    }
                })
                .on('data', (row) => {
                    try {
                        const item = this.processRow(row, items.length + 1);
                        if (item) {
                            items.push(item);
                        }
                    } catch (error) {
                        console.error(`[CSV-IMPORT] Error processing row ${items.length + 1}:`, error);
                        errors.push({
                            row: items.length + 1,
                            error: error.message,
                            data: row
                        });
                    }
                })
                .on('end', () => {
                    console.log(`[CSV-IMPORT] Successfully parsed CSV: ${items.length} valid items`);
                    if (errors.length > 0) {
                        console.warn(`[CSV-IMPORT] ${errors.length} rows had errors and were skipped`);
                    }
                    resolve(items);
                })
                .on('error', (error) => {
                    console.error('CSV parsing error:', error);
                    reject(new ApiError('Failed to parse CSV file', {
                        status: 400,
                        errorType: 'CSV_PARSE_ERROR',
                        publicMessage: 'Unable to parse CSV file. Please check the format.',
                        metadata: {
                            parseError: error.message
                        }
                    }));
                });
        });
    }

    /**
     * Process a single CSV row object (from csv-parser)
     * @param {Object} row - Parsed CSV row object
     * @param {number} lineNumber - Line number for error reporting
     * @returns {Object|null} Item object or null if invalid
     */
    processRow(row, lineNumber) {
        console.log(`[CSV-IMPORT] Row ${lineNumber}: Processing row:`, row);
        
        const item = {};
        
        // Extract fields from row object
        item.name = row.name || '';
        item.price = this.cleanPrice(row.price);
        item.imageUrl = this.validateUrl(row.imageurl, 'image');
        item.linkUrl = this.validateUrl(row.linkurl, 'product');
        item.description = row.description || null;

        // Validate required fields
        if (!item.name || item.name.trim().length === 0) {
            console.warn(`[CSV-IMPORT] Row ${lineNumber}: Missing name, skipping`);
            return null;
        }

        // Additional validation to prevent malformed data
        if (item.name.includes(',') && item.name.includes('http')) {
            console.error(`[CSV-IMPORT] Row ${lineNumber}: Malformed name detected: "${item.name}", skipping`);
            return null;
        }

        console.log(`[CSV-IMPORT] Row ${lineNumber}: Mapped item "${item.name}"`);
        return item;
    }

    /**
     * Validate CSV headers
     * @param {Array<string>} headers - CSV header row
     */
    validateHeaders(headers) {
        const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
        
        // Check for required headers
        for (const required of this.requiredHeaders) {
            if (!normalizedHeaders.includes(required.toLowerCase())) {
                throw new ApiError('Missing required header', {
                    status: 400,
                    errorType: 'MISSING_HEADER',
                    publicMessage: `CSV must contain required header: ${required}`
                });
            }
        }

        console.log(`[CSV-IMPORT] Headers validated: ${headers.join(', ')}`);
    }

    /**
     * Clean and extract price from string
     * @param {string} priceText - Raw price text
     * @returns {string|null} Cleaned price or null
     */
    cleanPrice(priceText) {
        if (!priceText || typeof priceText !== 'string') return null;
        
        // Remove currency symbols and extract numeric value
        const priceMatch = priceText.replace(/[^0-9.,]/g, '').match(/[\d,]+\.?\d*/);
        if (priceMatch) {
            return priceMatch[0].replace(/,/g, '');
        }
        
        return null;
    }

    /**
     * Validate URL format
     * @param {string} url - URL to validate
     * @param {string} type - URL type (image or product)
     * @returns {string|null} Valid URL or null
     */
    validateUrl(url, type) {
        if (!url || typeof url !== 'string' || url.trim().length === 0) {
            return null;
        }

        try {
            // Convert relative URLs to absolute URLs
            if (url.startsWith('//')) {
                url = 'https:' + url;
            } else if (url.startsWith('/')) {
                // For relative URLs, we can't convert without knowing the base domain
                return url;
            }

            const urlObj = new URL(url);

            // Basic URL validation
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return null;
            }

            return url;
        } catch (error) {
            console.warn(`[CSV-IMPORT] Invalid URL: ${url}`, error.message);
            return null;
        }
    }

    /**
     * Extract image URLs from parsed CSV items
     * @param {Array<Object>} items - Parsed CSV items
     * @returns {Array<string>} Array of image URLs
     */
    extractImageUrls(items) {
        return items
            .map(item => item.imageUrl)
            .filter(url => url && url.trim().length > 0);
    }
}

module.exports = new CsvImportService();