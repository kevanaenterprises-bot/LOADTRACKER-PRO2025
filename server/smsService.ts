import twilio from "twilio";

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

const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.SMS_ACCOUNT_SID || "";
const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN || "";
const rawFromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER || "";

// Normalize the FROM number as well
const fromNumber = rawFromNumber ? normalizePhoneNumber(rawFromNumber) : "";

let twilioClient: ReturnType<typeof twilio> | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

export async function sendSMSToDriver(toNumber: string, message: string): Promise<void> {
  console.log("🔍 SMS Service Debug Check:", {
    hasTwilioClient: !!twilioClient,
    hasFromNumber: !!fromNumber,
    fromNumberValue: fromNumber,
    accountSidLength: accountSid?.length || 0,
    authTokenLength: authToken?.length || 0
  });

  if (!twilioClient) {
    console.warn("❌ SMS service not configured - no Twilio client. Message:", message);
    return;
  }

  if (!fromNumber) {
    console.warn("❌ SMS from number not configured. Message:", message);
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
    hasClient: !!twilioClient,
    timestamp: new Date().toISOString()
  });

  try {
    console.log(`📱 ATTEMPTING TO SEND SMS TO TWILIO:`, {
      from: fromNumber,
      to: normalizedNumber,
      messagePreview: message.substring(0, 50) + "..."
    });
    
    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: normalizedNumber,
    });
    
    console.log(`✅ SMS QUEUED WITH TWILIO: ${result.sid}`, {
      to: normalizedNumber,
      status: result.status,
      direction: result.direction,
      price: result.price,
      uri: result.uri,
      dateCreated: result.dateCreated,
      dateSent: result.dateSent,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    });
    
    // Important: Twilio messages are queued, not instantly delivered
    console.log(`⚠️ NOTE: SMS status is "${result.status}" - Messages may take time to deliver or may fail silently if:
    - Phone number is not verified in Twilio (for trial accounts)
    - Recipient has not opted in to receive messages
    - Phone number format is incorrect
    - Twilio account has insufficient balance`);
    
  } catch (error) {
    console.error("❌ Failed to send SMS - Detailed Error:", {
      error: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
      details: error.details,
      originalNumber: toNumber,
      normalizedNumber: normalizedNumber,
      from: fromNumber,
      fullError: error
    });
    throw error;
  }
}
