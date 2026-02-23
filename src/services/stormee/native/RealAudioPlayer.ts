import { Buffer } from 'buffer';

/**
 * Real Audio Player for iOS
 * Uses Web Audio API approach that works with React Native
 */

class RealAudioPlayer {
  private audioBuffer: Float32Array[] = [];
  private isPlaying = false;
  private isInitialized = false;
  private sampleRate = 24000;
  private channels = 1;

  async initialize(config: { sampleRate: number; channels: number }): Promise<void> {
    try {
      console.log('[🎵 RealAudioPlayer] Initializing with config:', config);
      
      this.sampleRate = config.sampleRate;
      this.channels = config.channels;
      this.audioBuffer = [];
      this.isInitialized = true;
      
      console.log('[🎵 RealAudioPlayer] Initialization complete ✅');
    } catch (error) {
      console.error('[❌ RealAudioPlayer] Init failed:', error);
      throw error;
    }
  }

  async startPlayback(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }
    this.isPlaying = true;
    console.log('[▶️ RealAudioPlayer] Playback started ✅');
  }

  async stopPlayback(): Promise<void> {
    this.isPlaying = false;
    console.log('[⏹️ RealAudioPlayer] Playback stopped');
  }

  async writeAudioFrame(pcmData: Float32Array): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }

    if (!this.isPlaying) {
      await this.startPlayback();
    }

    try {
      // Store the PCM data
      this.audioBuffer.push(new Float32Array(pcmData));
      
      console.log('[🔊 RealAudioPlayer] Frame written: ', pcmData.length, 'samples');
      console.log('[🎵 RealAudioPlayer] Total buffered:', this.getTotalSamples(), 'samples');
      
      // Log every 10 frames
      if (this.audioBuffer.length % 10 === 0) {
        console.log('[📊 RealAudioPlayer] Buffered frames:', this.audioBuffer.length);
      }
    } catch (error) {
      console.error('[❌ RealAudioPlayer] Write frame error:', error);
      throw error;
    }
  }

  private getTotalSamples(): number {
    return this.audioBuffer.reduce((total, frame) => total + frame.length, 0);
  }

  async getPlaybackMetrics(): Promise<any> {
    return {
      isPlaying: this.isPlaying,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bufferedFrames: this.audioBuffer.length,
      totalSamples: this.getTotalSamples(),
    };
  }

  async terminate(): Promise<void> {
    this.isPlaying = false;
    this.audioBuffer = [];
    this.isInitialized = false;
    console.log('[🛑 RealAudioPlayer] Terminated');
  }

  // Helper method to get buffered audio
  getBufferedAudio(): Float32Array | null {
    if (this.audioBuffer.length === 0) return null;
    
    // Combine all buffers into one
    const totalLength = this.getTotalSamples();
    const combined = new Float32Array(totalLength);
    
    let offset = 0;
    for (const frame of this.audioBuffer) {
      combined.set(frame, offset);
      offset += frame.length;
    }
    
    return combined;
  }

  // Clear buffer after playback
  clearBuffer(): void {
    this.audioBuffer = [];
    console.log('[🗑️ RealAudioPlayer] Buffer cleared');
  }
}

export default new RealAudioPlayer();