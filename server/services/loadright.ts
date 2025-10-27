import puppeteer, { Browser, Page } from 'puppeteer';

const LOADRIGHT_URL = 'https://carrierportal.loadright.com';
const LOGIN_TIMEOUT = 30000;
const NAVIGATION_TIMEOUT = 30000;

export interface LoadRightTender {
  loadNumber: string;
  shipper: string;
  pickupLocation: string;
  pickupCity: string;
  pickupState: string;
  pickupDate: string;
  pickupTime: string;
  deliveryLocation: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryDate: string;
  deliveryTime: string;
  orderNumber: string;
  pieces: string;
  miles: string;
  weight: string;
  rate: string;
  notes: string;
  status: 'tendered' | 'dispatched' | 'pending_resign';
}

/**
 * LoadRight Integration Service
 * Logs into carrier portal and scrapes tendered load data
 */
export class LoadRightService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private email: string;
  private password: string;

  constructor() {
    this.email = process.env.LOADRIGHT_EMAIL || '';
    this.password = process.env.LOADRIGHT_PASSWORD || '';

    if (!this.email || !this.password) {
      console.warn('⚠️ LoadRight credentials not configured - integration disabled');
    }
  }

  /**
   * Initialize browser and log in to LoadRight portal
   */
  async login(): Promise<void> {
    if (!this.email || !this.password) {
      throw new Error('LoadRight credentials not configured');
    }

    console.log('🔐 Logging into LoadRight carrier portal...');

    try {
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.page = await this.browser.newPage();
      
      // Set viewport and user agent
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to login page
      await this.page.goto(LOADRIGHT_URL, {
        waitUntil: 'networkidle2',
        timeout: NAVIGATION_TIMEOUT,
      });

      console.log('📄 Login page loaded');

      // Fill in credentials
      await this.page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
      await this.page.type('input[type="email"], input[name="email"]', this.email);
      await this.page.type('input[type="password"], input[name="password"]', this.password);

      console.log('✍️ Credentials entered');

      // Click login button
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT }),
        this.page.click('button[type="submit"], input[type="submit"], button:has-text("Log In")'),
      ]);

      console.log('✅ Successfully logged into LoadRight');
    } catch (error) {
      console.error('❌ LoadRight login failed:', error);
      await this.cleanup();
      throw new Error(`Failed to log in to LoadRight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch all tendered loads from the dashboard
   */
  async getTenderedLoads(): Promise<LoadRightTender[]> {
    if (!this.page) {
      throw new Error('Not logged in - call login() first');
    }

    console.log('📥 Fetching tendered loads from LoadRight...');

    try {
      // Wait for dashboard to load
      await this.page.waitForSelector('.dashboard, [class*="Dashboard"], h1:has-text("Dashboard")', {
        timeout: 10000,
      });

      console.log('📊 Dashboard loaded');

      // Click on "Tendered" section to view loads
      const tenderedButton = await this.page.$('a:has-text("Tendered"), button:has-text("Tendered"), [class*="Tendered"]');
      if (tenderedButton) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT }),
          tenderedButton.click(),
        ]);
        console.log('📋 Tendered loads page loaded');
      }

      // Extract load data from the page
      const loads = await this.page.evaluate(() => {
        const loadElements = document.querySelectorAll('[class*="load"], [class*="Load"], tr[data-load], .load-row');
        const tenders: any[] = [];

        loadElements.forEach((element) => {
          // This is a placeholder - we'll need to inspect the actual HTML structure
          // to determine the correct selectors for extracting load data
          const loadNumber = element.querySelector('[class*="load-number"], [class*="loadNumber"]')?.textContent?.trim() || '';
          const shipper = element.querySelector('[class*="shipper"]')?.textContent?.trim() || '';
          
          if (loadNumber) {
            tenders.push({
              loadNumber,
              shipper,
              pickupLocation: '',
              pickupCity: '',
              pickupState: '',
              pickupDate: '',
              pickupTime: '',
              deliveryLocation: '',
              deliveryCity: '',
              deliveryState: '',
              deliveryDate: '',
              deliveryTime: '',
              orderNumber: '',
              pieces: '',
              miles: '',
              weight: '',
              rate: '',
              notes: '',
              status: 'tendered',
            });
          }
        });

        return tenders;
      });

      console.log(`✅ Found ${loads.length} tendered loads`);
      return loads;
    } catch (error) {
      console.error('❌ Failed to fetch tendered loads:', error);
      throw new Error(`Failed to fetch loads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Accept a tendered load in LoadRight portal
   */
  async acceptLoad(loadNumber: string): Promise<void> {
    if (!this.page) {
      throw new Error('Not logged in - call login() first');
    }

    console.log(`✅ Accepting load ${loadNumber} in LoadRight...`);

    try {
      // Find the load row and click Accept button
      await this.page.evaluate((loadNum) => {
        const loadRow = Array.from(document.querySelectorAll('[class*="load"], tr, [data-load]')).find(
          (el) => el.textContent?.includes(loadNum)
        );

        if (!loadRow) {
          throw new Error(`Load ${loadNum} not found`);
        }

        const acceptButton = loadRow.querySelector(
          'button:has-text("Accept"), a:has-text("Accept"), [class*="accept"]'
        ) as HTMLElement;

        if (!acceptButton) {
          throw new Error('Accept button not found');
        }

        acceptButton.click();
      }, loadNumber);

      // Wait for confirmation or navigation
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`✅ Load ${loadNumber} accepted successfully`);
    } catch (error) {
      console.error(`❌ Failed to accept load ${loadNumber}:`, error);
      throw new Error(`Failed to accept load: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get HTML content of current page (for debugging/inspection)
   */
  async getPageHTML(): Promise<string> {
    if (!this.page) {
      throw new Error('Not logged in');
    }
    return await this.page.content();
  }

  /**
   * Take screenshot of current page (for debugging)
   */
  async screenshot(path: string = '/tmp/loadright-screenshot.png'): Promise<void> {
    if (!this.page) {
      throw new Error('Not logged in');
    }
    const screenshotBuffer = await this.page.screenshot({ fullPage: true });
    const fs = await import('fs/promises');
    await fs.writeFile(path, screenshotBuffer);
    console.log(`📸 Screenshot saved to ${path}`);
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('🧹 LoadRight browser session cleaned up');
  }
}

/**
 * Helper function to sync loads from LoadRight
 */
export async function syncLoadRightTenders(): Promise<LoadRightTender[]> {
  const service = new LoadRightService();
  try {
    await service.login();
    const loads = await service.getTenderedLoads();
    return loads;
  } finally {
    await service.cleanup();
  }
}
