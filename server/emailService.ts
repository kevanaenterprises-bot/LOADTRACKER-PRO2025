import { Resend } from 'resend';
import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

// Initialize Resend client (works with Railway - no SMTP port blocking!)
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to get Chrome executable path based on platform
function getChromeExecutablePath(): string | undefined {
  // Replit-specific path
  const replitChromePath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  
  if (existsSync(replitChromePath)) {
    console.log('🔍 Using Replit Chromium path');
    return replitChromePath;
  }
  
  // Railway/other platforms - let Puppeteer use bundled Chrome
  console.log('🔍 Using Puppeteer bundled Chrome (Railway/cloud)');
  return undefined; // Let Puppeteer auto-detect
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export async function sendEmail({ to, subject, html, cc = [], bcc = [], attachments = [] }: EmailOptions) {
  const MAX_RETRIES = 2;
  let lastError: any;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📧 Resend Email attempt ${attempt}/${MAX_RETRIES} to ${to}`);
      
      // Always include both in-house email addresses in CC
      const ccList = [...cc, 'accounting@go4fc.com', 'gofarmsbills@gmail.com'];
      
      // Check total attachment size to prevent server overload
      const totalAttachmentSize = attachments.reduce((total, att) => total + att.content.length, 0);
      const maxSizeMB = 40; // Resend allows up to 40MB
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      
      if (totalAttachmentSize > maxSizeBytes) {
        throw new Error(`Total attachment size (${Math.round(totalAttachmentSize / 1024 / 1024)}MB) exceeds ${maxSizeMB}MB limit`);
      }
      
      // Debug email composition before sending
      console.log(`📧 Email composition debug (attempt ${attempt}):`);
      console.log(`  - From: kevin@go4fc.com`);
      console.log(`  - To: ${to}`);
      console.log(`  - CC: ${ccList.join(', ')}`);
      console.log(`  - Subject: ${subject}`);
      console.log(`  - HTML length: ${html.length} characters`);
      console.log(`  - Attachments: ${attachments.length}`);
      console.log(`  - Total attachment size: ${Math.round(totalAttachmentSize / 1024 / 1024 * 100) / 100}MB`);
      if (attachments.length > 0) {
        attachments.forEach((att, index) => {
          console.log(`    ${index + 1}. ${att.filename} (${Math.round(att.content.length / 1024)}KB, ${att.contentType})`);
        });
      }

      // Send via Resend API (no SMTP ports blocked!)
      const result = await resend.emails.send({
        from: 'GO 4 Farms & Cattle <kevin@go4fc.com>',
        to: [to],
        cc: ccList,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject,
        html,
        attachments: attachments.length > 0 ? attachments.map(att => ({
          filename: att.filename,
          content: att.content,
        })) : undefined,
      });
      
      console.log(`✅ Email sent successfully via Resend to ${to} on attempt ${attempt}`);
      console.log(`Message ID: ${result.data?.id}`);
      console.log(`📧 Email sent with ${attachments.length} attachments`);
      
      return {
        success: true,
        messageId: result.data?.id || 'unknown',
        recipients: {
          to,
          cc: ccList,
          bcc
        }
      };
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Email attempt ${attempt}/${MAX_RETRIES} failed:`);
      console.error('Error details:', error instanceof Error ? error.message : error);
      console.error('Full error:', error);
      
      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        break;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = attempt * 2000; // 2 seconds, then 4 seconds
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // If we get here, all attempts failed
  throw new Error(`Failed to send email after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`);
}

// Generate PDF from HTML using Puppeteer with improved timeout handling
export async function generatePDF(html: string): Promise<Buffer> {
  console.log(`📄 Starting PDF generation for HTML content (${html.length} characters)`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromeExecutablePath(),
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Set longer timeouts for complex documents
    page.setDefaultTimeout(60000); // 60 seconds
    page.setDefaultNavigationTimeout(60000);
    
    console.log(`📄 Setting HTML content...`);
    await page.setContent(html, { 
      waitUntil: 'networkidle0',
      timeout: 60000 // 60 seconds timeout
    });
    
    console.log(`📄 Generating PDF...`);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
      timeout: 60000 // 60 seconds timeout for PDF generation
    });
    
    console.log(`✅ PDF generated successfully (${pdf.length} bytes)`);
    return Buffer.from(pdf);
  } catch (error) {
    console.error(`❌ PDF generation failed:`, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Compress and resize image for efficient PDF embedding
export async function compressImageForPDF(imageBuffer: Buffer, contentType: string, maxWidth: number = 800): Promise<Buffer> {
  console.log(`🗜️ Compressing image (${imageBuffer.length} bytes, ${contentType}) to max width ${maxWidth}px`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-features=VizDisplayCompositor'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Convert image buffer to base64 data URL
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64Image}`;
    
    // Create HTML to resize and compress the image
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; }
          #canvas { border: none; }
        </style>
      </head>
      <body>
        <canvas id="canvas"></canvas>
        <script>
          const canvas = document.getElementById('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          img.onload = function() {
            const aspectRatio = img.height / img.width;
            const newWidth = Math.min(img.width, ${maxWidth});
            const newHeight = newWidth * aspectRatio;
            
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            window.imageProcessed = true;
          };
          
          img.src = '${dataUrl}';
        </script>
      </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Wait for image processing
    await page.waitForFunction('window.imageProcessed', { timeout: 30000 });
    
    // Get compressed image as JPEG with quality 0.8
    const compressedBase64 = await page.evaluate(() => {
      const canvas = document.getElementById('canvas') as HTMLCanvasElement;
      if (!canvas) throw new Error('Canvas element not found');
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    });
    
    const compressedBuffer = Buffer.from(compressedBase64, 'base64');
    console.log(`✅ Image compressed: ${imageBuffer.length} bytes -> ${compressedBuffer.length} bytes (${Math.round((1 - compressedBuffer.length / imageBuffer.length) * 100)}% reduction)`);
    
    return compressedBuffer;
    
  } finally {
    await browser.close();
  }
}

// Convert image buffer (JPEG/PNG) to PDF for better email compatibility
export async function convertImageToPDF(imageBuffer: Buffer, contentType: string, filename: string): Promise<Buffer> {
  console.log(`🖼️ Converting image to PDF: ${filename} (${imageBuffer.length} bytes, ${contentType})`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-features=VizDisplayCompositor'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Convert image buffer to base64 data URL
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64Image}`;
    
    // Create HTML with the image centered and properly sized
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            margin: 0; 
            padding: 20px; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 100vh;
            background: white;
          }
          .image-container {
            text-align: center;
            max-width: 100%;
          }
          .document-title {
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #333;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .document-image {
            max-width: 100%;
            max-height: 90vh;
            height: auto;
            border: 1px solid #ddd;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
        </style>
      </head>
      <body>
        <div class="image-container">
          <div class="document-title">${filename}</div>
          <img src="${dataUrl}" alt="Document" class="document-image">
        </div>
      </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    });
    
    console.log(`✅ Image converted to PDF: ${filename} -> ${pdf.length} bytes PDF`);
    return Buffer.from(pdf);
    
  } finally {
    await browser.close();
  }
}

export async function testEmailConnection() {
  try {
    console.log('🔍 Testing Resend API connection:', {
      hasApiKey: !!process.env.RESEND_API_KEY,
      fromEmail: 'kevin@go4fc.com'
    });
    
    // Resend doesn't have a verify method, so we just check if API key exists
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    
    console.log('✅ Resend API key is configured');
    return true;
  } catch (error) {
    console.error('❌ Resend API configuration failed:');
    console.error('Error details:', error instanceof Error ? error.message : error);
    return false;
  }
}