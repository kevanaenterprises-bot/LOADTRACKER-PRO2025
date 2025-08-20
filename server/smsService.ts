import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.SMS_ACCOUNT_SID || "";
const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN || "";
const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.SMS_FROM_NUMBER || "";

let twilioClient: ReturnType<typeof twilio> | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
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

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber,
    });
    console.log(`SMS sent successfully: ${result.sid}`);
  } catch (error) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}
