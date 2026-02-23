// src/services/stormee/native/AudioChunkProcessor.ts

import { CircularAudioBuffer } from './AudioBuffer';

/**
 * Processes incoming PCM chunks from WebSocket
 * - Validates format
 * - Converts Int16 → Float32
 * - Writes to circular buffer
 */
export class AudioChunkProcessor {
  private buffer: CircularAudioBuffer;
  private stats = {
    chunksReceived: 0,
    chunksProcessed: 0,
    errors: 0,
    droppedChunks: 0,
  };

  constructor(sampleRate: number, bufferCapacitySeconds: number) {
    const bufferCapacity = sampleRate * bufferCapacitySeconds;
    this.buffer = new CircularAudioBuffer(bufferCapacity, sampleRate);
  }

  /**
   * Process incoming PCM chunk
   * 
   * Input: Uint8Array containing Int16 PCM samples
   * Output: boolean (success/failure)
   */
  processChunk(rawChunk: Uint8Array): boolean {
    try {
      this.stats.chunksReceived++;

      // Validate
      if (rawChunk.length === 0) {
        this.stats.errors++;
        console.warn('[AudioChunkProcessor] Empty chunk');
        return false;
      }

      // Handle odd-length chunks
      let chunk = rawChunk;
      if (chunk.length % 2 !== 0) {
        console.warn('[AudioChunkProcessor] Trimming odd-length chunk');
        chunk = chunk.slice(0, chunk.length - 1);
      }

      // Convert Int16 → Float32
      const int16Array = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        // Normalize: Int16 [-32768, 32767] → Float32 [-1.0, 1.0]
        float32Array[i] = int16Array[i] / 32768;
      }

      // Write to buffer
      const written = this.buffer.write(float32Array);

      if (written === float32Array.length) {
        this.stats.chunksProcessed++;
        return true;
      } else {
        this.stats.droppedChunks++;
        console.warn('[AudioChunkProcessor] Buffer overflow');
        return false;
      }

    } catch (err) {
      this.stats.errors++;
      console.error('[AudioChunkProcessor] Error:', err);
      return false;
    }
  }

  /**
   * Get audio frame for playback
   */
  getFrame(frameSize: number): Float32Array | null {
    return this.buffer.read(frameSize);
  }

  /**
   * Get buffer health
   */
  getHealthPercent(): number {
    return this.buffer.getHealthPercent();
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset processor
   */
  reset(): void {
    this.buffer.clear();
    this.stats = {
      chunksReceived: 0,
      chunksProcessed: 0,
      errors: 0,
      droppedChunks: 0,
    };
  }
}

export default AudioChunkProcessor;