import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.SMS_ACCOUNT_SID || "";
const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN || "";
const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER || "";

let twilioClient: ReturnType<typeof twilio> | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

// Normalize phone number for SMS sending
function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // If it's 10 digits, assume it's US and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If it's 11 digits and starts with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // If it already has +, return as is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // Default: assume it needs +1
  return `+1${digits}`;
}

export async function sendSMSToDriver(toNumber: string, message: string): Promise<void> {
  if (!twilioClient) {
    console.warn("SMS service not configured. Message:", message);
    return;
  }

  if (!fromNumber) {
    console.warn("SMS from number not configured. Message:", message);
    return;
  }

  // Normalize the phone number
  const normalizedNumber = normalizePhoneNumber(toNumber);

  // Enhanced logging for debugging
  console.log(`🚀 SMS SEND ATTEMPT:`, {
    originalNumber: toNumber,
    normalizedNumber: normalizedNumber,
    from: fromNumber,
    messageLength: message.length,
    hasClient: !!twilioClient
  });

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: normalizedNumber,
    });
    console.log(`✅ SMS sent successfully: ${result.sid}`, {
      to: normalizedNumber,
      status: result.status,
      direction: result.direction
    });
  } catch (error) {
    console.error("❌ Failed to send SMS:", {
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo,
      originalNumber: toNumber,
      normalizedNumber: normalizedNumber,
      from: fromNumber
    });
    throw error;
  }
}
