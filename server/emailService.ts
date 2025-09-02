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
    service: 'outlook', // Use service instead of manual config
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
    
    // Always include accounting@go4fc.com in CC
    const ccList = [...cc, 'accounting@go4fc.com'];
    
    const mailOptions = {
      from: `"GO 4 Farms & Cattle" <${process.env.OUTLOOK_EMAIL}>`,
      to,
      cc: ccList.join(', '),
      bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
      subject,
      html,
      // Force HTML mode - do not include text version to prevent plain text fallback
      text: undefined,
      // Ensure multipart encoding for attachments
      encoding: 'utf8',
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'MIME-Version': '1.0'
      },
      attachments: attachments.length > 0 ? attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: 'base64',
        cid: att.filename.replace(/[^a-zA-Z0-9]/g, '_') // Clean CID for inline attachments
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
    console.log(`  - Headers:`, mailOptions.headers);
    console.log(`  - Force HTML mode: text=${mailOptions.text}, encoding=${mailOptions.encoding}`);

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