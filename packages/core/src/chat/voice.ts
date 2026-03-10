/**
 * Voice — transcription and text-to-speech via pure HTTP (no SDK deps).
 *
 * Supports OpenAI Whisper for transcription and OpenAI TTS for speech synthesis.
 * Graceful degradation when API keys are missing.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface VoiceConfig {
  /** OpenAI API key for Whisper transcription and TTS. */
  openaiApiKey?: string;
  /** TTS voice ID. Default: 'onyx'. */
  ttsVoice?: string;
  /** TTS model. Default: 'tts-1'. */
  ttsModel?: string;
  /** Whisper model. Default: 'whisper-1'. */
  whisperModel?: string;
}

export interface TranscriptionResult {
  /** Transcribed text. */
  text: string;
  /** Whether transcription was successful. */
  success: boolean;
}

export interface SpeechResult {
  /** Audio data as Buffer (MP3). */
  audio: Buffer;
  /** Whether synthesis was successful. */
  success: boolean;
}

// ─── Transcriber ──────────────────────────────────────────────────────

/**
 * Transcribe audio using OpenAI Whisper API.
 * Returns a fallback message if no API key is configured.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  config: VoiceConfig,
  filename: string = 'audio.ogg',
): Promise<TranscriptionResult> {
  if (!config.openaiApiKey) {
    return { text: '[Voice message — transcription unavailable]', success: false };
  }

  const model = config.whisperModel ?? 'whisper-1';

  // Build multipart form data manually (no SDK)
  const boundary = `----SoleriFormBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  // File part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/ogg\r\n\r\n`,
    ),
  );
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));

  // Model part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`,
    ),
  );

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      await response.text().catch(() => {});
      return { text: `[Transcription failed: ${response.status}]`, success: false };
    }

    const data = (await response.json()) as { text?: string };
    return { text: data.text ?? '', success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: `[Transcription error: ${msg}]`, success: false };
  }
}

// ─── TTS ──────────────────────────────────────────────────────────────

/**
 * Synthesize speech from text using OpenAI TTS API.
 * Returns null if no API key is configured.
 */
export async function synthesizeSpeech(
  text: string,
  config: VoiceConfig,
): Promise<SpeechResult | null> {
  if (!config.openaiApiKey) return null;

  const model = config.ttsModel ?? 'tts-1';
  const voice = config.ttsVoice ?? 'onyx';

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, voice, input: text }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return { audio: Buffer.alloc(0), success: false };
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, success: true };
  } catch {
    return { audio: Buffer.alloc(0), success: false };
  }
}
