import { ElevenLabsClient } from "elevenlabs";

// ElevenLabs voice IDs for male and female narrators
const VOICES = {
  male: "pNInz6obpgDQGcFmaJgB", // Adam - Deep, resonant male voice
  female: "21m00Tcm4TlvDq8ikWAM", // Rachel - Clear, warm female voice
};

// Initialize ElevenLabs client
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenLabsApiKey) {
  console.warn("⚠️ ELEVENLABS_API_KEY not found - on-demand TTS will not work");
}

const client = elevenLabsApiKey ? new ElevenLabsClient({ apiKey: elevenLabsApiKey }) : null;

export interface GenerateSpeechOptions {
  text: string;
  voice: 'male' | 'female';
  markerId: number;
}

/**
 * Generate speech audio from text using ElevenLabs API
 * Uses Eleven Flash v2.5 model for low-latency real-time generation
 */
export async function generateSpeech(options: GenerateSpeechOptions): Promise<Buffer> {
  if (!client) {
    throw new Error("ElevenLabs API key not configured");
  }

  const { text, voice, markerId } = options;
  const voiceId = VOICES[voice];

  console.log(`🎙️ Generating speech for marker ${markerId} with ${voice} voice...`);

  try {
    // Use Eleven Flash v2.5 for low latency (~75ms)
    const audio = await client.textToSpeech.convert(voiceId, {
      text,
      model_id: "eleven_flash_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });

    // Convert Node.js Readable stream to Buffer
    const chunks: Buffer[] = [];
    
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    console.log(`✅ Generated ${buffer.length} bytes of audio for marker ${markerId}`);
    
    return buffer;
  } catch (error) {
    console.error("❌ ElevenLabs API error:", error);
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format historical marker text for optimal TTS output
 */
export function formatMarkerTextForTTS(title: string, inscription: string): string {
  // Add pauses and formatting for natural speech
  return `Historical Marker. ${title}. ${inscription}`;
}
