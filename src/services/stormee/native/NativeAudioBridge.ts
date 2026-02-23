import { NativeModules, Platform } from 'react-native';

const { StormeeAudioBridge: NativeModule } = NativeModules;

class NativeAudioBridge {
  private isInitialized = false;
  private useNative = false;

  async initialize(config: { sampleRate: number; channels: number }): Promise<void> {
    try {
      console.log('[🎵 NativeAudioBridge] Initializing...');
      console.log('[🎵 NativeAudioBridge] Config:', config);

      // Check if native module exists
      if (!NativeModule) {
        console.warn('[⚠️ NativeAudioBridge] Native module NOT found');
        console.warn('[⚠️ NativeAudioBridge] NativeModules.StormeeAudioBridge:', NativeModule);
        this.useNative = false;
        this.isInitialized = true;
        return;
      }

      console.log('[✅ NativeAudioBridge] Found NativeModule:', Object.keys(NativeModule));

      // Try to call initialize on native
      const result = await NativeModule.initialize(config);
      console.log('[✅ NativeAudioBridge] Native initialize result:', result);

      this.useNative = true;
      this.isInitialized = true;
      console.log('[✅ NativeAudioBridge] Native audio enabled');
    } catch (error) {
      console.error('[❌ NativeAudioBridge] Init error:', error);
      this.useNative = false;
      this.isInitialized = true;
    }
  }

  async startPlayback(): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('Not initialized');
      }

      if (!this.useNative) {
        console.log('[ℹ️ NativeAudioBridge] JS fallback mode (startPlayback)');
        return;
      }

      console.log('[▶️ NativeAudioBridge] Starting native playback...');
      const result = await NativeModule.startPlayback();
      console.log('[▶️ NativeAudioBridge] Start playback result:', result);
    } catch (error) {
      console.error('[❌ NativeAudioBridge] startPlayback error:', error);
      this.useNative = false;
    }
  }

  async stopPlayback(): Promise<void> {
    try {
      if (!this.isInitialized || !this.useNative) {
        console.log('[ℹ️ NativeAudioBridge] JS fallback mode (stopPlayback)');
        return;
      }

      console.log('[⏹️ NativeAudioBridge] Stopping native playback...');
      const result = await NativeModule.stopPlayback();
      console.log('[⏹️ NativeAudioBridge] Stop playback result:', result);
    } catch (error) {
      console.error('[❌ NativeAudioBridge] stopPlayback error:', error);
      this.useNative = false;
    }
  }

  async writeAudioFrame(base64Data: string): Promise<void> {
    try {
      if (!this.isInitialized || !this.useNative) {
        // Silently fail in fallback mode - don't spam logs
        return;
      }

      console.log('[📝 NativeAudioBridge] Writing audio frame, base64 length:', base64Data.length);
      const result = await NativeModule.writeAudioFrame(base64Data);
      console.log('[📝 NativeAudioBridge] Write result:', result);
    } catch (error) {
      console.error('[❌ NativeAudioBridge] writeAudioFrame error:', error);
      this.useNative = false;
    }
  }

  async getPlaybackMetrics(): Promise<any> {
    try {
      if (!this.isInitialized || !this.useNative) {
        return { isPlaying: false };
      }

      console.log('[📊 NativeAudioBridge] Getting metrics...');
      const result = await NativeModule.getPlaybackMetrics();
      console.log('[📊 NativeAudioBridge] Metrics:', result);
      return result;
    } catch (error) {
      console.error('[❌ NativeAudioBridge] getPlaybackMetrics error:', error);
      this.useNative = false;
      return { isPlaying: false };
    }
  }

  async terminate(): Promise<void> {
    try {
      if (!this.isInitialized || !this.useNative) {
        return;
      }

      console.log('[🛑 NativeAudioBridge] Terminating...');
      const result = await NativeModule.terminate();
      console.log('[🛑 NativeAudioBridge] Terminate result:', result);
      this.useNative = false;
    } catch (error) {
      console.error('[❌ NativeAudioBridge] terminate error:', error);
    }
  }
}

export default new NativeAudioBridge();