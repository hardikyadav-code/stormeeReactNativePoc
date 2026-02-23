import { Buffer } from 'buffer';

/**
 * Mock Audio Player - Uses JavaScript instead of native
 * This is a temporary solution for testing
 * In production, replace this with the native AVAudioEngine
 */

class MockAudioPlayer {
  private audioContext: any = null;
  private audioBuffer: any = null;
  private sourceNode: any = null;
  private isInitialized = false;

  async initialize(config: { sampleRate: number; channels: number }): Promise<void> {
    try {
      console.log('[🎵 MockAudioPlayer] Initializing with config:', config);
      
      // For iOS, we won't actually play audio in JS
      // But we'll pretend to initialize
      this.isInitialized = true;
      
      console.log('[🎵 MockAudioPlayer] Initialization complete ✅');
    } catch (error) {
      console.error('[❌ MockAudioPlayer] Init failed:', error);
      throw error;
    }
  }

  async startPlayback(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }
    console.log('[▶️ MockAudioPlayer] Playback started');
  }

  async stopPlayback(): Promise<void> {
    console.log('[⏹️ MockAudioPlayer] Playback stopped');
  }

  async writeAudioFrame(pcmData: Float32Array): Promise<void> {
    // In a mock, we just log it
    console.log('[🔊 MockAudioPlayer] Frame written:', pcmData.length, 'samples');
  }

  async getPlaybackMetrics(): Promise<any> {
    return {
      isPlaying: false,
      sampleRate: 24000,
      channels: 1,
    };
  }

  async terminate(): Promise<void> {
    console.log('[🛑 MockAudioPlayer] Terminated');
    this.isInitialized = false;
  }
}

export default new MockAudioPlayer();