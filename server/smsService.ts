import telnyx from "telnyx";

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

const apiKey = process.env.TELNYX_API_KEY || process.env.SMS_API_KEY || "";
const rawFromNumber = process.env.TELNYX_PHONE_NUMBER || process.env.SMS_FROM_NUMBER || "";

// Normalize the FROM number as well
const fromNumber = rawFromNumber ? normalizePhoneNumber(rawFromNumber) : "";

let telnyxClient: any = null;

if (apiKey) {
  telnyxClient = telnyx(apiKey);
}

export async function sendSMSToDriver(toNumber: string, message: string): Promise<void> {
  console.log("🔍 SMS Service Debug Check:", {
    hasTelnyxClient: !!telnyxClient,
    hasFromNumber: !!fromNumber,
    fromNumberValue: fromNumber,
    apiKeyLength: apiKey?.length || 0
  });

  if (!telnyxClient) {
    console.warn("❌ SMS service not configured - no Telnyx client. Message:", message);
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
    hasClient: !!telnyxClient,
    timestamp: new Date().toISOString()
  });

  try {
    console.log(`📱 ATTEMPTING TO SEND SMS WITH TELNYX:`, {
      from: fromNumber,
      to: normalizedNumber,
      messagePreview: message.substring(0, 50) + "..."
    });
    
    const result = await telnyxClient.messages.create({
      from: fromNumber,
      to: normalizedNumber,
      text: message
    });
    
    console.log(`✅ SMS SENT WITH TELNYX: ${result.data.id}`, {
      id: result.data.id,
      to: result.data.to,
      from: result.data.from,
      direction: result.data.direction,
      messaging_profile_id: result.data.messaging_profile_id,
      text: result.data.text
    });
    
    // Telnyx provides immediate response with message details
    console.log(`✅ SUCCESS: SMS sent via Telnyx - LOWEST COST ($0.004/SMS) with highest performance!
    - Message ID: ${result.data.id}
    - Direction: ${result.data.direction}
    - Messaging Profile: ${result.data.messaging_profile_id}`);
    
  } catch (error: any) {
    console.error("❌ Failed to send SMS via Telnyx - Detailed Error:", {
      error: error.message,
      code: error.code,
      status: error.status,
      response: error.response,
      originalNumber: toNumber,
      normalizedNumber: normalizedNumber,
      from: fromNumber,
      fullError: error
    });
    throw error;
  }
}
