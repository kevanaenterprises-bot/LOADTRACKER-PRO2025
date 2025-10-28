import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from '../storage';

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
 * Logs into carrier portal and scrapes tendered load data using actual portal selectors
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

      // Wait for page to be fully interactive
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try multiple selector strategies to find the email input
      const emailInput = await this.page.waitForSelector(
        'input[type="email"], input[placeholder*="Email"], input[name="email"], #email',
        { timeout: 15000 }
      );
      
      const passwordInput = await this.page.waitForSelector(
        'input[type="password"], input[placeholder*="Password"], input[name="password"], #password',
        { timeout: 15000 }
      );

      if (!emailInput || !passwordInput) {
        throw new Error('Could not find login form fields');
      }

      // Clear any existing values and type credentials
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(this.email, { delay: 100 });
      
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(this.password, { delay: 100 });

      console.log('✍️ Credentials entered');

      // Wait a moment for the form to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find and click the Log In button by searching for its text
      const buttonClicked = await this.page.evaluate(() => {
        // Find all button and link elements
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
        
        // Find the one with "Log In" text
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          if (text === 'Log In' || text.includes('Log In')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        
        // Fallback: try to find and click any submit button
        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement;
        if (submitBtn) {
          submitBtn.click();
          return true;
        }
        
        return false;
      });

      if (!buttonClicked) {
        throw new Error('Could not find or click Log In button');
      }

      // Wait for navigation after clicking login
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT });

      console.log('✅ Successfully logged into LoadRight');

      // Wait for dashboard to appear
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('📊 Dashboard loaded');

    } catch (error) {
      console.error('❌ LoadRight login failed:', error);
      
      // Try to save screenshot for debugging
      try {
        if (this.page) {
          await this.screenshot('/tmp/loadright-error.png');
          console.log('📸 Error screenshot saved to /tmp/loadright-error.png');
        }
      } catch (screenshotError) {
        console.log('⚠️ Could not save error screenshot');
      }
      
      await this.cleanup();
      throw new Error(`Failed to log in to LoadRight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch all tendered loads from the portal
   */
  async getTenderedLoads(): Promise<LoadRightTender[]> {
    if (!this.page) {
      throw new Error('Not logged in - call login() first');
    }

    console.log('📥 Fetching tendered loads from LoadRight...');

    try {
      // Click on "Tendered" card/link to navigate to tendered loads page
      // The dashboard shows "Tendered" with a count (e.g., "12")
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to find and click the Tendered section
      const tenderedElements = await this.page.$$('a, button, div[role="button"]');
      let clicked = false;
      
      for (const element of tenderedElements) {
        const text = await element.evaluate(el => el.textContent?.trim() || '');
        if (text.includes('Tendered')) {
          console.log('🎯 Found Tendered section, clicking...');
          await element.click();
          clicked = true;
          break;
        }
      }
      
      if (clicked) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('📋 Tendered loads page should be loaded');
      } else {
        console.log('⚠️ Could not find Tendered link, continuing anyway...');
      }

      // Save HTML for debugging
      const html = await this.page.content();
      const fs = await import('fs/promises');
      await fs.writeFile('/tmp/loadright-page.html', html);
      console.log('📄 Page HTML saved to /tmp/loadright-page.html');

      // Extract load data from the page
      const loads = await this.page.evaluate(() => {
        const tenders: any[] = [];
        
        console.log('🔍 Starting load extraction...');
        
        // Get all text content to help debug
        const pageText = document.body.textContent || '';
        console.log('Page text length:', pageText.length);
        console.log('Page contains "Load #":', pageText.includes('Load #'));
        console.log('Page contains "109-":', pageText.includes('109-'));

        // Find all load detail sections on the page
        const loadSections = document.querySelectorAll('div');
        
        loadSections.forEach((section) => {
          const loadNumberElement = section.querySelector('*');
          const loadNumberText = loadNumberElement?.textContent;
          
          // Look for load number pattern (e.g., "Load # 109-40326")
          const loadMatch = loadNumberText?.match(/Load #\s*(\d+-\d+)/);
          if (!loadMatch) return;

          const loadNumber = loadMatch[1];
          
          // Extract other details from the section
          const allText = section.textContent || '';
          
          // Look for pickup information
          const pickupMatch = allText.match(/Pick Up\s+([^\n]+)\s+([^\n]+)\s+([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
          const pickupLocation = pickupMatch ? `${pickupMatch[1]} ${pickupMatch[2]}` : '';
          const pickupCity = pickupMatch ? pickupMatch[3] : '';
          const pickupState = pickupMatch ? pickupMatch[4] : '';
          
          // Look for delivery information
          const deliveryMatch = allText.match(/Delivery\s+(\d{2}\/\d{2}\/\d{4})/);
          const deliveryDate = deliveryMatch ? deliveryMatch[1] : '';
          
          // Look for final destination
          const finalDestMatch = allText.match(/Final Destination\s+([^\n]+)\s+([^\n]+)\s+([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
          const deliveryLocation = finalDestMatch ? `${finalDestMatch[1]} ${finalDestMatch[2]}` : '';
          const deliveryCity = finalDestMatch ? finalDestMatch[3] : '';
          const deliveryState = finalDestMatch ? finalDestMatch[4] : '';
          
          // Look for order number
          const orderMatch = allText.match(/Order Number:\s*(\S+)/);
          const orderNumber = orderMatch ? orderMatch[1] : '';
          
          tenders.push({
            loadNumber,
            shipper: '',
            pickupLocation,
            pickupCity,
            pickupState,
            pickupDate: '',
            pickupTime: '',
            deliveryLocation,
            deliveryCity,
            deliveryState,
            deliveryDate,
            deliveryTime: '',
            orderNumber,
            pieces: '',
            miles: '',
            weight: '',
            rate: '',
            notes: '',
            status: 'tendered' as const,
          });
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
 * Helper function to sync loads from LoadRight and save to database
 */
export async function syncLoadRightTenders() {
  const service = new LoadRightService();
  try {
    console.log('🔄 Starting LoadRight tender sync...');
    
    await service.login();
    const loads = await service.getTenderedLoads();
    
    console.log(`📝 Processing ${loads.length} loads...`);
    
    // Save each load to the database (avoid duplicates)
    const savedTenders = [];
    for (const load of loads) {
      // Check if we already have this load
      const existing = await storage.getLoadRightTenderByLoadNumber(load.loadNumber);
      
      if (!existing) {
        // Create new tender
        const tender = await storage.createLoadRightTender({
          loadNumber: load.loadNumber,
          shipper: load.shipper || null,
          pickupLocation: load.pickupLocation,
          pickupCity: load.pickupCity || null,
          pickupState: load.pickupState || null,
          deliveryLocation: load.deliveryLocation,
          deliveryCity: load.deliveryCity || null,
          deliveryState: load.deliveryState || null,
          pickupDate: load.pickupDate || null,
          deliveryDate: load.deliveryDate || null,
          rate: load.rate || null,
          miles: load.miles || null,
          status: 'tendered',
        });
        savedTenders.push(tender);
        console.log(`✅ Saved load ${load.loadNumber}`);
      } else if (existing.status !== 'accepted') {
        // Update existing tender if not yet accepted
        const updated = await storage.updateLoadRightTender(existing.id, {
          pickupLocation: load.pickupLocation,
          deliveryLocation: load.deliveryLocation,
          pickupDate: load.pickupDate || null,
          deliveryDate: load.deliveryDate || null,
        });
        savedTenders.push(updated);
        console.log(`🔄 Updated load ${load.loadNumber}`);
      } else {
        savedTenders.push(existing);
        console.log(`⏭️ Skipped already-accepted load ${load.loadNumber}`);
      }
    }
    
    console.log(`✅ Sync complete: ${savedTenders.length} tenders processed`);
    return savedTenders;
    
  } finally {
    await service.cleanup();
  }
}

// Export service instance for direct use
export const loadRightService = {
  syncTenders: syncLoadRightTenders,
};
