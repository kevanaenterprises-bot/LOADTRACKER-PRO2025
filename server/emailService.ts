import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';

// Create Outlook SMTP transporter
const createTransporter = () => {
  console.log('🔍 Creating transporter with:', {
    host: 'smtp-mail.outlook.com',
    port: 587,
    user: process.env.OUTLOOK_EMAIL,
    hasPassword: !!process.env.OUTLOOK_PASSWORD
  });
  
  return nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false, // Will upgrade to TLS
    auth: {
      user: process.env.OUTLOOK_EMAIL,
      pass: process.env.OUTLOOK_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false
    },
    debug: true, // Enable debug logging
    logger: true // Enable logger
  });
};

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
  try {
    const transporter = createTransporter();
    
    // Always include both in-house email addresses in CC
    const ccList = [...cc, 'accounting@go4fc.com', 'gofarmsbills@gmail.com'];
    
    const mailOptions = {
      from: `"GO 4 Farms & Cattle" <${process.env.OUTLOOK_EMAIL}>`,
      to,
      cc: ccList.join(', '),
      bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
      subject,
      html,
      // Force HTML-only: Remove text property completely
      text: '',
      attachments: attachments.length > 0 ? attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: 'base64'
      })) : undefined,
    };

    // Debug email composition before sending
    console.log(`📧 Email composition debug:`);
    console.log(`  - To: ${to}`);
    console.log(`  - Subject: ${subject}`);
    console.log(`  - HTML length: ${html.length} characters`);
    console.log(`  - Attachments: ${attachments.length}`);
    if (attachments.length > 0) {
      attachments.forEach((att, index) => {
        console.log(`    ${index + 1}. ${att.filename} (${att.content.length} bytes, ${att.contentType})`);
      });
    }
    console.log(`  - Force HTML mode: text=${mailOptions.text}`);

    const result = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent successfully to ${to}, CC: ${ccList.join(', ')}`);
    console.log(`Message ID: ${result.messageId}`);
    console.log(`📧 Email sent with ${mailOptions.attachments?.length || 0} attachments in HTML mode`);
    
    return {
      success: true,
      messageId: result.messageId,
      recipients: {
        to,
        cc: ccList,
        bcc
      }
    };
    
  } catch (error) {
    console.error('❌ Email sending failed:');
    console.error('Error details:', error instanceof Error ? error.message : error);
    console.error('Error code:', (error as any)?.code);
    console.error('Error response:', (error as any)?.response);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate PDF from HTML using Puppeteer
export async function generatePDF(html: string): Promise<Buffer> {
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
    
    return Buffer.from(pdf);
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
    console.log('🔍 Testing email connection with config:', {
      host: 'smtp-mail.outlook.com',
      port: 587,
      user: process.env.OUTLOOK_EMAIL,
      hasPassword: !!process.env.OUTLOOK_PASSWORD
    });
    
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:');
    console.error('Error details:', error instanceof Error ? error.message : error);
    console.error('Error code:', (error as any)?.code);
    console.error('Error response:', (error as any)?.response);
    return false;
  }
}