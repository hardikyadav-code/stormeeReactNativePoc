// src/services/stormee/native/AudioBuffer.ts

/**
 * Circular buffer for in-memory audio storage
 * Replaces disk I/O (RNFS) with fast in-memory storage
 */
export class CircularAudioBuffer {
  private buffer: Float32Array;
  private writeHead = 0;
  private readHead = 0;
  private size: number;
  private sampleRate: number;

  constructor(sampleCapacity: number, sampleRate: number) {
    this.buffer = new Float32Array(sampleCapacity);
    this.size = sampleCapacity;
    this.sampleRate = sampleRate;
    console.log(`[AudioBuffer] Created: ${sampleCapacity} samples (${sampleCapacity / sampleRate}s)`);
  }

  /**
   * Write samples to buffer
   */
  write(samples: Float32Array): number {
    let written = 0;
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeHead] = samples[i];
      this.writeHead = (this.writeHead + 1) % this.size;
      written++;
    }
    return written;
  }

  /**
   * Read samples from buffer
   */
  read(sampleCount: number): Float32Array | null {
    if (this.getAvailableSamples() < sampleCount) {
      return null;
    }

    const output = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      output[i] = this.buffer[this.readHead];
      this.readHead = (this.readHead + 1) % this.size;
    }
    return output;
  }

  /**
   * Get available samples in buffer
   */
  getAvailableSamples(): number {
    return (this.writeHead - this.readHead + this.size) % this.size;
  }

  /**
   * Get buffer health as percentage
   */
  getHealthPercent(): number {
    return (this.getAvailableSamples() / this.size) * 100;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.writeHead = 0;
    this.readHead = 0;
  }

  /**
   * Is buffer full?
   */
  isFull(threshold: number = 0.95): boolean {
    return this.getHealthPercent() > threshold * 100;
  }

  /**
   * Is buffer empty?
   */
  isEmpty(threshold: number = 0.05): boolean {
    return this.getHealthPercent() < threshold * 100;
  }
}

export default CircularAudioBuffer;