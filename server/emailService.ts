import nodemailer from 'nodemailer';

// Create Outlook SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: process.env.OUTLOOK_EMAIL,
      pass: process.env.OUTLOOK_PASSWORD,
    },
  });
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
}

export async function sendEmail({ to, subject, html, cc = [], bcc = [] }: EmailOptions) {
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