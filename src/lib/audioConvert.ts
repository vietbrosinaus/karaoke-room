/**
 * Client-side audio format conversion.
 * Runs entirely in the browser — no server upload needed.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lamejs = require("lamejs");

/**
 * Decode a WebM/Opus blob to raw PCM AudioBuffer.
 * Uses a regular AudioContext since OfflineAudioContext requires knowing
 * the exact length upfront (which we don't have before decoding).
 */
async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

/**
 * Convert a WebM/Opus blob to MP3.
 * Uses lamejs (pure JS LAME encoder) — ~180KB, runs on main thread.
 * For a 5-minute song this takes ~1-2 seconds.
 */
export async function convertToMp3(blob: Blob, bitrate = 192): Promise<Blob> {
  const audioBuffer = await decodeBlob(blob);
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
  const mp3Data: Uint8Array[] = [];

  // Process in chunks of 1152 samples (MP3 frame size)
  const chunkSize = 1152;
  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  for (let i = 0; i < samples; i += chunkSize) {
    const end = Math.min(i + chunkSize, samples);
    const leftChunk = new Int16Array(end - i);
    const rightChunk = new Int16Array(end - i);

    // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
    for (let j = 0; j < end - i; j++) {
      leftChunk[j] = Math.max(-32768, Math.min(32767, Math.round(left[i + j]! * 32767)));
      rightChunk[j] = Math.max(-32768, Math.min(32767, Math.round(right[i + j]! * 32767)));
    }

    const mp3Buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3Buf.length > 0) mp3Data.push(new Uint8Array(mp3Buf));
  }

  // Flush remaining
  const end = mp3Encoder.flush();
  if (end.length > 0) mp3Data.push(new Uint8Array(end));

  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" });
}

/**
 * Convert a WebM/Opus blob to WAV.
 * No library needed — just a 44-byte header + raw PCM.
 */
export async function convertToWav(blob: Blob): Promise<Blob> {
  const audioBuffer = await decodeBlob(blob);
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = samples * numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and write PCM samples
  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;
  let offset = 44;

  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = ch === 0 ? left[i]! : right[i]!;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}
