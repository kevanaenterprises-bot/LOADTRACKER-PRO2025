import plivo from "plivo";

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

const authId = process.env.PLIVO_AUTH_ID || process.env.SMS_AUTH_ID || "";
const authToken = process.env.PLIVO_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN || "";
const rawFromNumber = process.env.PLIVO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER || "";

// Normalize the FROM number as well
const fromNumber = rawFromNumber ? normalizePhoneNumber(rawFromNumber) : "";

let plivoClient: plivo.Client | null = null;

if (authId && authToken) {
  plivoClient = new plivo.Client(authId, authToken);
}

export async function sendSMSToDriver(toNumber: string, message: string): Promise<void> {
  console.log("🔍 SMS Service Debug Check:", {
    hasPlivoClient: !!plivoClient,
    hasFromNumber: !!fromNumber,
    fromNumberValue: fromNumber,
    authIdLength: authId?.length || 0,
    authTokenLength: authToken?.length || 0
  });

  if (!plivoClient) {
    console.warn("❌ SMS service not configured - no Plivo client. Message:", message);
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
    hasClient: !!plivoClient,
    timestamp: new Date().toISOString()
  });

  try {
    console.log(`📱 ATTEMPTING TO SEND SMS WITH PLIVO:`, {
      src: fromNumber,
      dst: normalizedNumber,
      messagePreview: message.substring(0, 50) + "..."
    });
    
    const result = await plivoClient.messages.create(
      fromNumber, // src
      normalizedNumber, // dst
      message // text
    );
    
    console.log(`✅ SMS SENT WITH PLIVO: ${result.messageUuid}`, {
      messageUuid: result.messageUuid,
      to: normalizedNumber,
      apiId: result.apiId,
      message: result.message,
      invalidNumber: result.invalidNumber
    });
    
    // Plivo messages are sent immediately with status feedback
    console.log(`✅ SUCCESS: SMS sent via Plivo - 30-40% cost savings vs Twilio!
    - Message UUID: ${result.messageUuid}
    - API Response: ${result.message}
    - Invalid numbers (if any): ${result.invalidNumber || 'None'}`);
    
  } catch (error: any) {
    console.error("❌ Failed to send SMS via Plivo - Detailed Error:", {
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
