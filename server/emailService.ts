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
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent successfully to ${to}, CC: ${ccList.join(', ')}`);
    console.log(`Message ID: ${result.messageId}`);
    
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
    executablePath: '/home/runner/.cache/puppeteer/chrome/linux-139.0.7258.138/chrome-linux64/chrome',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
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