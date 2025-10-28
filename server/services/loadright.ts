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

      // Check what page we're on after login
      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();
      console.log('✅ Successfully logged into LoadRight');
      console.log(`📍 Current URL: ${currentUrl}`);
      console.log(`📄 Page title: ${pageTitle}`);

      // Wait for dashboard to appear
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Double-check we're still logged in
      const finalUrl = this.page.url();
      const finalTitle = await this.page.title();
      console.log('📊 Dashboard should be loaded...');
      console.log(`📍 Final URL: ${finalUrl}`);
      console.log(`📄 Final title: ${finalTitle}`);

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
      // Wait for dashboard to fully render
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Navigate to Active Loads page via Menu dropdown
      console.log('🔍 Step 1: Looking for "Menu" button...');
      
      const menuResult = await this.page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('button, a, div[role="button"], [onclick], nav *, header *'));
        
        for (const el of allElements) {
          const text = el.textContent || '';
          const innerText = (el as HTMLElement).innerText || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const className = el.className || '';
          
          // Look for hamburger menu by:
          // 1. Contains hamburger icon (☰)
          // 2. aria-label contains "menu"
          // 3. Common class names like "hamburger", "menu-toggle", "nav-toggle"
          // 4. Located in header/nav area with button role
          if (text.includes('☰') || innerText.includes('☰') ||
              ariaLabel.toLowerCase().includes('menu') ||
              className.toLowerCase().includes('hamburger') ||
              className.toLowerCase().includes('menu-toggle') ||
              className.toLowerCase().includes('nav-toggle')) {
            (el as HTMLElement).click();
            return {
              step: 'menu_clicked',
              clickedText: text.slice(0, 50) || ariaLabel || className
            };
          }
        }
        
        return {
          step: 'menu_not_found',
          totalElements: allElements.length
        };
      });
      
      console.log('📊 Menu click result:', JSON.stringify(menuResult, null, 2));
      
      // Wait for dropdown menu to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Click "Active Loads" from the dropdown menu
      console.log('🔍 Step 2: Looking for "Active Loads" in menu dropdown...');
      
      const activeLoadsResult = await this.page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('a, button, div, span, li, nav *'));
        
        for (const el of allElements) {
          const text = el.textContent || '';
          const innerText = (el as HTMLElement).innerText || '';
          
          // Look for "Active Loads" menu item
          if (text.includes('Active Loads') || text.includes('Active Load') || 
              innerText.includes('Active Loads') || innerText.includes('Active Load')) {
            (el as HTMLElement).click();
            return {
              clicked: true,
              clickedText: text.slice(0, 100)
            };
          }
        }
        
        return {
          clicked: false,
          pageTitle: document.title,
          bodyPreview: document.body?.innerText?.slice(0, 300)
        };
      });
      
      console.log('📊 Active Loads click result:', JSON.stringify(activeLoadsResult, null, 2));
      
      if (activeLoadsResult.clicked) {
        console.log(`🎯 Successfully navigated to Active Loads page!`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('📋 Active Loads page loaded (shows accepted + tendered loads)');
      } else {
        console.log(`⚠️ Could not find "Active Loads" menu item`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Take screenshot for debugging
      await this.screenshot('/tmp/loadright-page.png');
      console.log('📸 Screenshot saved to /tmp/loadright-page.png');

      // Save HTML for debugging
      const html = await this.page.content();
      const fs = await import('fs/promises');
      await fs.writeFile('/tmp/loadright-page.html', html);
      console.log('📄 Page HTML saved to /tmp/loadright-page.html');

      // Get page text to check what we have
      const pageText = await this.page.evaluate(() => document.body.textContent || '');
      console.log(`📄 Page text length: ${pageText.length} characters`);
      console.log(`🔍 Contains "Load #": ${pageText.includes('Load #')}`);
      console.log(`🔍 Contains "109-": ${pageText.includes('109-')}`);
      console.log(`🔍 Contains "Tendered": ${pageText.includes('Tendered')}`);

      // Extract load data from the page - SIMPLIFIED approach
      const loads = await this.page.evaluate(() => {
        const tenders: any[] = [];
        
        // Get all text content on the page
        const fullText = document.body.innerText || document.body.textContent || '';
        
        // Split by common separators and find load numbers
        const loadNumberRegex = /Load #\s*(\d+-\d+)/g;
        const matches = Array.from(fullText.matchAll(loadNumberRegex));
        
        for (const match of matches) {
          const loadNumber = match[1];
          tenders.push({
            loadNumber,
            shipper: '',
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
            status: 'tendered' as const,
          });
        }

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
