import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from '../storage';

const LOADRIGHT_URL = 'https://carrierportal.loadright.com';
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
 * LoadRight Integration Service - Session Cookie Based
 * User logs in manually, provides session cookie, we use that to scrape data
 */
export class LoadRightService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private sessionCookie: string;

  constructor(sessionCookie?: string) {
    this.sessionCookie = sessionCookie || '';
  }

  /**
   * Initialize browser with user's session cookie (manual login required)
   */
  async initWithSession(): Promise<void> {
    if (!this.sessionCookie) {
      throw new Error('No LoadRight session cookie provided. Please log in manually first.');
    }

    console.log('🔐 Initializing LoadRight with session cookie...');

    try {
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
      
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set the LoadRight session cookie
      await this.page.setCookie({
        name: 'LspAuthCtxPortal',
        value: this.sessionCookie,
        domain: 'carrierportal.loadright.com',
        path: '/',
        httpOnly: true,
        secure: true,
      });

      // Navigate with the cookie
      await this.page.goto(LOADRIGHT_URL, {
        waitUntil: 'networkidle2',
        timeout: NAVIGATION_TIMEOUT,
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify session is valid
      const currentUrl = this.page.url();
      const currentTitle = await this.page.title();
      
      console.log(`📍 URL: ${currentUrl}`);
      console.log(`📄 Title: ${currentTitle}`);
      
      // Debug: Check what's actually on the page
      const pageInfo = await this.page.evaluate(() => {
        return {
          bodyText: document.body.innerText.substring(0, 500),
          hasLoginForm: !!document.querySelector('input[type="password"]'),
          elementCount: document.querySelectorAll('*').length,
          hasNav: !!document.querySelector('nav'),
          hasMenu: !!document.querySelector('[class*="menu"]'),
        };
      });
      
      console.log('🔍 Page analysis:', JSON.stringify(pageInfo, null, 2));
      
      // Save screenshot for debugging
      await this.screenshot('/tmp/loadright-session.png');
      console.log('📸 Screenshot saved to /tmp/loadright-session.png');
      
      if (pageInfo.hasLoginForm) {
        throw new Error(`Session cookie is not working - login form still visible. The cookie might be expired, invalid, or LoadRight requires additional authentication. Please log in again and get a fresh cookie.`);
      }
      
      console.log('✅ LoadRight session initialized successfully');

    } catch (error) {
      await this.cleanup();
      throw new Error(`Failed to initialize LoadRight session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch all tendered loads from the portal
   */
  async getTenderedLoads(): Promise<LoadRightTender[]> {
    if (!this.page) {
      throw new Error('Not initialized - call initWithSession() first');
    }

    console.log('📥 Fetching tendered loads...');

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 1: Click hamburger menu
      console.log('🔍 Step 1: Looking for hamburger menu...');
      
      const menuResult = await this.page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('button, a, div[role="button"], [onclick], nav *, header *'));
        
        for (const el of allElements) {
          const text = el.textContent || '';
          const innerText = (el as HTMLElement).innerText || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const className = el.className || '';
          
          if (text.includes('☰') || innerText.includes('☰') ||
              ariaLabel.toLowerCase().includes('menu') ||
              className.toLowerCase().includes('hamburger') ||
              className.toLowerCase().includes('menu-toggle') ||
              className.toLowerCase().includes('nav-toggle')) {
            (el as HTMLElement).click();
            return {
              clicked: true,
              text: text.slice(0, 50) || ariaLabel || className
            };
          }
        }
        
        return { clicked: false, elementsSearched: allElements.length };
      });
      
      console.log('📊 Menu click:', JSON.stringify(menuResult));
      
      if (!menuResult.clicked) {
        throw new Error(`Could not find hamburger menu button. Searched ${(menuResult as any).elementsSearched} elements.`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Click "Active Loads"
      console.log('🔍 Step 2: Looking for "Active Loads"...');
      
      const activeLoadsResult = await this.page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('a, button, div, span, li, nav *'));
        
        for (const el of allElements) {
          const text = el.textContent || '';
          const innerText = (el as HTMLElement).innerText || '';
          
          if (text.includes('Active Loads') || text.includes('Active Load') || 
              innerText.includes('Active Loads') || innerText.includes('Active Load')) {
            (el as HTMLElement).click();
            return { clicked: true, text: text.slice(0, 100) };
          }
        }
        
        return { clicked: false, pageTitle: document.title };
      });
      
      console.log('📊 Active Loads click:', JSON.stringify(activeLoadsResult));
      
      if (!activeLoadsResult.clicked) {
        throw new Error(`Could not find "Active Loads" menu item.`);
      }
      
      console.log('🎯 Navigated to Active Loads page');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Extract loads from the page
      const loads = await this.page.evaluate(() => {
        const tenders: any[] = [];
        const fullText = document.body.innerText || document.body.textContent || '';
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
      console.error('❌ Failed to fetch loads:', error);
      throw new Error(`Failed to fetch loads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Take a screenshot (for debugging)
   */
  private async screenshot(filePath: `${string}.png`): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ path: filePath, fullPage: true });
    }
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('🧹 LoadRight browser session cleaned up');
    }
  }
}

/**
 * Sync tendered loads from LoadRight to local storage
 */
export async function syncLoadRightTenders(sessionCookie?: string): Promise<{ success: boolean; count: number; tenders: LoadRightTender[] }> {
  console.log('🔄 Starting LoadRight tender sync...');
  
  const service = new LoadRightService(sessionCookie);
  
  try {
    await service.initWithSession();
    const tenders = await service.getTenderedLoads();
    
    console.log(`📝 Processing ${tenders.length} loads...`);
    
    // Store in database
    for (const tender of tenders) {
      await storage.createLoadRightTender(tender);
    }
    
    console.log(`✅ Sync complete: ${tenders.length} tenders processed`);
    
    return {
      success: true,
      count: tenders.length,
      tenders,
    };
  } catch (error) {
    console.error('❌ LoadRight sync failed:', error);
    return {
      success: false,
      count: 0,
      tenders: [],
    };
  } finally {
    await service.cleanup();
  }
}
