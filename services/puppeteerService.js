const puppeteer = require('puppeteer');
const { ApiError } = require('../middleware/errorHandler');

class PuppeteerService {
    constructor() {
        this.browser = null;
        this.isLaunching = false;
    }

    async getBrowser() {
        console.log(`[PUPPETEER] Checking browser status...`);
        
        if (this.browser && this.browser.isConnected()) {
            console.log(`[PUPPETEER] ✅ Existing browser found and connected`);
            return this.browser;
        }

        if (this.isLaunching) {
            console.log(`[PUPPETEER] ⏳ Browser is already launching, waiting...`);
            // Wait for browser to finish launching
            let waitCount = 0;
            while (this.isLaunching) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
                if (waitCount % 10 === 0) {
                    console.log(`[PUPPETEER] Still waiting for browser launch... (${waitCount * 100}ms)`);
                }
                if (waitCount > 300) { // 30 second timeout
                    throw new Error('Browser launch timeout');
                }
            }
            console.log(`[PUPPETEER] ✅ Browser launch completed after waiting`);
            return this.browser;
        }

        console.log(`[PUPPETEER] 🚀 Launching new browser instance...`);
        this.isLaunching = true;
        try {
            const launchOptions = {
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--single-process'
                ]
            };

            // Debug environment variables
            console.log(`[PUPPETEER] Environment debug:`);
            console.log(`[PUPPETEER] - PUPPETEER_EXECUTABLE_PATH:`, process.env.PUPPETEER_EXECUTABLE_PATH);
            console.log(`[PUPPETEER] - GOOGLE_CHROME_BIN:`, process.env.GOOGLE_CHROME_BIN);
            console.log(`[PUPPETEER] - NODE_ENV:`, process.env.NODE_ENV);
            console.log(`[PUPPETEER] - Current working directory:`, process.cwd());
            
            // Check if Chrome is installed via puppeteer
            const fs = require('fs');
            const path = require('path');
            const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(process.cwd(), '.cache', 'puppeteer');
            console.log(`[PUPPETEER] - Checking cache directory:`, cacheDir);
            
            try {
                if (fs.existsSync(cacheDir)) {
                    const contents = fs.readdirSync(cacheDir, { recursive: true });
                    console.log(`[PUPPETEER] - Cache directory contents:`, contents.slice(0, 10)); // First 10 items
                } else {
                    console.log(`[PUPPETEER] - Cache directory does not exist`);
                }
            } catch (error) {
                console.log(`[PUPPETEER] - Error reading cache directory:`, error.message);
            }

            // Set executable path based on environment
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                console.log(`[PUPPETEER] - Using custom executable path:`, launchOptions.executablePath);
            } else if (process.env.GOOGLE_CHROME_BIN) {
                // Use Google Chrome provided by Heroku buildpack
                launchOptions.executablePath = process.env.GOOGLE_CHROME_BIN;
                console.log(`[PUPPETEER] - Using Chrome from buildpack:`, launchOptions.executablePath);
            } else {
                console.log(`[PUPPETEER] - No executable path set, Puppeteer will try to find Chrome automatically`);
            }
            
            console.log(`[PUPPETEER] Launch options:`, launchOptions);
            this.browser = await puppeteer.launch(launchOptions);
            this.isLaunching = false;
            console.log(`[PUPPETEER] ✅ Browser launched successfully`);
            return this.browser;
        } catch (error) {
            this.isLaunching = false;
            console.error(`[PUPPETEER] ❌ Error launching browser: ${error.message}`);
            throw new ApiError('Failed to launch browser', {
                status: 500,
                errorType: 'BROWSER_ERROR',
                publicMessage: 'Unable to start web scraping service. Please try again.'
            });
        }
    }

    async createPage(options = {}) {
        try {
            console.log(`[PUPPETEER] Getting browser instance...`);
            const browser = await this.getBrowser();
            console.log(`[PUPPETEER] ✅ Browser instance obtained, creating new page...`);
            
            const page = await browser.newPage();
            console.log(`[PUPPETEER] ✅ New page created, setting viewport...`);

            // Set default viewport
            await page.setViewport({
                width: options.width || 1280,
                height: options.height || 720
            });
            console.log(`[PUPPETEER] ✅ Viewport set, setting user agent...`);

            // Set user agent to avoid detection
            await page.setUserAgent(
                options.userAgent || 
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            console.log(`[PUPPETEER] ✅ User agent set`);

            // Set request interceptor if needed
            if (options.blockImages) {
                console.log(`[PUPPETEER] Setting up image blocking...`);
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (req.resourceType() === 'image') {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
                console.log(`[PUPPETEER] ✅ Image blocking configured`);
            }

            console.log(`[PUPPETEER] ✅ Page fully configured and ready`);
            return page;
        } catch (error) {
            console.error(`[PUPPETEER] ❌ Error creating page: ${error.message}`);
            throw new ApiError('Failed to create browser page', {
                status: 500,
                errorType: 'BROWSER_ERROR',
                publicMessage: 'Unable to create web page for scraping. Please try again.'
            });
        }
    }

    async navigateToPage(page, url, options = {}) {
        try {
            const timeout = options.timeout || 30000;
            const waitUntil = options.waitUntil || 'networkidle2';

            console.log(`[PUPPETEER] Starting navigation to: ${url}`);
            console.log(`[PUPPETEER] Options - timeout: ${timeout}ms, waitUntil: ${waitUntil}`);

            await page.goto(url, { 
                waitUntil,
                timeout 
            });
            console.log(`[PUPPETEER] ✅ Page navigation completed`);

            // Wait for additional selector if specified
            if (options.waitForSelector) {
                console.log(`[PUPPETEER] Waiting for selector: ${options.waitForSelector}`);
                await page.waitForSelector(options.waitForSelector, { 
                    timeout: options.selectorTimeout || 10000 
                });
                console.log(`[PUPPETEER] ✅ Selector found: ${options.waitForSelector}`);
            }

            return page;
        } catch (error) {
            console.error(`[PUPPETEER] ❌ Navigation error: ${error.message}`);
            if (error.name === 'TimeoutError') {
                throw new ApiError('Page load timeout', {
                    status: 408,
                    errorType: 'TIMEOUT_ERROR',
                    publicMessage: 'The webpage took too long to load. Please try again.'
                });
            }
            throw new ApiError('Failed to navigate to page', {
                status: 500,
                errorType: 'NAVIGATION_ERROR',
                publicMessage: 'Unable to access the requested webpage. Please check the URL and try again.'
            });
        }
    }

    async closePage(page) {
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
        } catch (error) {
            console.error('Error closing page:', error);
        }
    }

    async closeBrowser() {
        try {
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            console.error('Error closing browser:', error);
        }
    }

    async withPage(callback, options = {}) {
        let page = null;
        try {
            console.log(`[PUPPETEER] Creating new page with options:`, options);
            page = await this.createPage(options);
            console.log(`[PUPPETEER] ✅ Page created successfully, executing callback...`);
            
            const result = await callback(page);
            console.log(`[PUPPETEER] ✅ Callback completed successfully`);
            return result;
        } catch (error) {
            console.error(`[PUPPETEER] ❌ Error in withPage: ${error.message}`);
            throw error;
        } finally {
            console.log(`[PUPPETEER] Closing page...`);
            await this.closePage(page);
            console.log(`[PUPPETEER] ✅ Page closed`);
        }
    }
}

// Export singleton instance
module.exports = new PuppeteerService();