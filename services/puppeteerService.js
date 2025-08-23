const puppeteer = require('puppeteer-core');
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
            const isProd = process.env.NODE_ENV === 'production';
            const isDocker = process.cwd().includes('/usr/src/app');
            
            // Debug environment variables
            console.log(`[PUPPETEER] Environment debug:`);
            console.log(`[PUPPETEER] - PUPPETEER_EXECUTABLE_PATH:`, process.env.PUPPETEER_EXECUTABLE_PATH);
            console.log(`[PUPPETEER] - NODE_ENV:`, process.env.NODE_ENV);
            console.log(`[PUPPETEER] - Is Production:`, isProd);
            console.log(`[PUPPETEER] - Is Docker:`, isDocker);
            console.log(`[PUPPETEER] - Current working directory:`, process.cwd());

            // Determine Chrome executable path for production
            let chromeExecPath = 'chrome';
            if (isProd) {
                if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                    chromeExecPath = process.env.PUPPETEER_EXECUTABLE_PATH;
                } else if (process.env.GOOGLE_CHROME_BIN) {
                    chromeExecPath = process.env.GOOGLE_CHROME_BIN;
                } else if (process.env.CHROME_BIN) {
                    chromeExecPath = process.env.CHROME_BIN;
                } else {
                    // Try common buildpack paths - prioritize heroku-community/chrome-for-testing
                    const fs = require('fs');
                    const possiblePaths = [
                        '/app/.chrome-for-testing/chrome-linux64/chrome', // heroku-community/chrome-for-testing
                        'chrome', // Try PATH
                        '/usr/bin/google-chrome-stable',
                        '/usr/bin/chromium-browser'
                    ];
                    
                    for (const path of possiblePaths) {
                        try {
                            if (path.startsWith('/') && fs.existsSync(path)) {
                                chromeExecPath = path;
                                break;
                            } else if (path === 'chrome') {
                                chromeExecPath = 'chrome'; // Will be tested by puppeteer
                                break;
                            }
                        } catch (err) {
                            continue;
                        }
                    }
                }
                console.log(`[PUPPETEER] - Production Chrome path:`, chromeExecPath);
            }

            const launchOptions = isProd ? {
                executablePath: chromeExecPath,
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            } : isDocker ? {
                executablePath: '/usr/bin/chromium',
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            } : {
                headless: 'new'
            };

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