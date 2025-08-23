const puppeteer = require('puppeteer-core');
const { ApiError } = require('../middleware/errorHandler');

class PuppeteerService {
    constructor() {
        this.browser = null;
        this.isLaunching = false;
    }

    async getBrowser() {
        if (this.browser && this.browser.isConnected()) {
            return this.browser;
        }

        if (this.isLaunching) {
            // Wait for browser to finish launching
            let waitCount = 0;
            while (this.isLaunching) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
                if (waitCount > 300) { // 30 second timeout
                    throw new Error('Browser launch timeout');
                }
            }
            return this.browser;
        }

        this.isLaunching = true;
        try {
            const isProd = process.env.NODE_ENV === 'production';
            const isDocker = process.cwd().includes('/usr/src/app');
            
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
                    // Try common buildpack paths
                    const fs = require('fs');
                    const possiblePaths = [
                        '/app/.chrome-for-testing/chrome-linux64/chrome',
                        'chrome',
                        '/usr/bin/google-chrome-stable',
                        '/usr/bin/chromium-browser'
                    ];
                    
                    for (const path of possiblePaths) {
                        try {
                            if (path.startsWith('/') && fs.existsSync(path)) {
                                chromeExecPath = path;
                                break;
                            } else if (path === 'chrome') {
                                chromeExecPath = 'chrome';
                                break;
                            }
                        } catch (err) {
                            continue;
                        }
                    }
                }
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

            this.browser = await puppeteer.launch(launchOptions);
            this.isLaunching = false;
            return this.browser;
        } catch (error) {
            this.isLaunching = false;
            console.error(`[PUPPETEER] Error launching browser: ${error.message}`);
            throw new ApiError('Failed to launch browser', {
                status: 500,
                errorType: 'BROWSER_ERROR',
                publicMessage: 'Unable to start web scraping service. Please try again.'
            });
        }
    }

    async createPage(options = {}) {
        try {
            const browser = await this.getBrowser();
            const page = await browser.newPage();

            // Set default viewport
            await page.setViewport({
                width: options.width || 1280,
                height: options.height || 720
            });

            // Set user agent to avoid detection
            await page.setUserAgent(
                options.userAgent || 
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );

            // Set request interceptor if needed
            if (options.blockImages) {
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (req.resourceType() === 'image') {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
            }

            return page;
        } catch (error) {
            console.error(`[PUPPETEER] Error creating page: ${error.message}`);
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

            await page.goto(url, { waitUntil, timeout });

            // Wait for additional selector if specified
            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector, { 
                    timeout: options.selectorTimeout || 10000 
                });
            }

            return page;
        } catch (error) {
            console.error(`[PUPPETEER] Navigation error: ${error.message}`);
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


    async withPage(callback, options = {}) {
        let page = null;
        try {
            page = await this.createPage(options);
            const result = await callback(page);
            return result;
        } catch (error) {
            console.error(`[PUPPETEER] Error in withPage: ${error.message}`);
            throw error;
        } finally {
            await this.closePage(page);
        }
    }
}

// Export singleton instance
module.exports = new PuppeteerService();