import { ElevenLabsClient } from "elevenlabs";
import { ObjectStorageService, isGCSAvailable } from "../objectStorage";

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
const objectStorage = new ObjectStorageService();

export interface GenerateSpeechOptions {
  text: string;
  voice: 'male' | 'female';
  markerId: number;
}

/**
 * Generate speech audio from text using ElevenLabs API with optional Google Cloud Storage caching
 * Uses Eleven Flash v2.5 model for low-latency real-time generation
 * Caches generated audio to prevent repeated API calls and reduce costs
 * Gracefully degrades if GCS is not configured
 */
export async function generateSpeechWithCache(options: GenerateSpeechOptions): Promise<{ buffer: Buffer; fromCache: boolean }> {
  if (!client) {
    throw new Error("ElevenLabs API key not configured");
  }

  const { text, voice, markerId } = options;
  const voiceId = VOICES[voice];
  
  // Generate cache key based on marker ID and voice
  const cacheKey = `tts-audio/marker-${markerId}-${voice}.mp3`;

  console.log(`🎙️ Processing audio for marker ${markerId} with ${voice} voice...`);

  // Check if GCS is available for caching
  const gcsEnabled = isGCSAvailable();
  if (!gcsEnabled) {
    console.log(`⚠️ GCS not configured - caching disabled, will generate fresh audio`);
  }

  try {
    // Try to check cache only if GCS is available
    if (gcsEnabled) {
      try {
        const cachedAudio = await objectStorage.getFile(cacheKey);
        if (cachedAudio) {
          console.log(`✅ Cache HIT: Returning cached audio for marker ${markerId} (${cachedAudio.length} bytes)`);
          return { buffer: cachedAudio, fromCache: true };
        }
        console.log(`⚠️ Cache MISS: Need to generate audio for marker ${markerId}`);
      } catch (cacheCheckError) {
        console.log(`⚠️ Cache check failed, proceeding with generation:`, cacheCheckError instanceof Error ? cacheCheckError.message : 'Unknown error');
      }
    }

    console.log(`🎤 Generating new audio for marker ${markerId}...`);

    // Generate audio using ElevenLabs API
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

    // Try to cache for future use only if GCS is available
    if (gcsEnabled) {
      try {
        await objectStorage.uploadFile(cacheKey, buffer, 'audio/mpeg');
        console.log(`💾 Cached audio to Google Cloud Storage: ${cacheKey}`);
      } catch (cacheUploadError) {
        console.log(`⚠️ Cache upload failed, continuing without cache:`, cacheUploadError instanceof Error ? cacheUploadError.message : 'Unknown error');
      }
    } else {
      console.log(`⚠️ Skipping cache upload (GCS not configured)`);
    }
    
    return { buffer, fromCache: false };
  } catch (error) {
    console.error("❌ ElevenLabs generation error:", error);
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
