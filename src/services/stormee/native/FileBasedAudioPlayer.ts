import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

/**
 * Audio Player that:
 * 1. Buffers PCM audio data
 * 2. Converts to WAV format
 * 3. Saves to file
 * 4. Plays using native audio
 */

class FileBasedAudioPlayer {
  private audioBuffer: Float32Array[] = [];
  private isPlaying = false;
  private isInitialized = false;
  private sampleRate = 24000;
  private channels = 1;
  private audioFilePath = '';
  private playbackStarted = false;

  async initialize(config: { sampleRate: number; channels: number }): Promise<void> {
    try {
      console.log('[🎵 FileBasedAudioPlayer] Initializing with config:', config);
      
      this.sampleRate = config.sampleRate;
      this.channels = config.channels;
      this.audioBuffer = [];
      
      // Set up audio file path
      const documentsDir = Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalDirectoryPath;
      this.audioFilePath = `${documentsDir}/stormee_audio.wav`;

      this.isInitialized = true;
      console.log('[🎵 FileBasedAudioPlayer] Initialization complete ✅');
      console.log('[📁 FileBasedAudioPlayer] Audio file path:', this.audioFilePath);
    } catch (error) {
      console.error('[❌ FileBasedAudioPlayer] Init failed:', error);
      throw error;
    }
  }

  async startPlayback(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }
    this.isPlaying = true;
    this.playbackStarted = true;
    console.log('[▶️ FileBasedAudioPlayer] Playback started ✅');
  }

  async stopPlayback(): Promise<void> {
    this.isPlaying = false;
    console.log('[⏹️ FileBasedAudioPlayer] Playback stopped');
  }

  async writeAudioFrame(pcmData: Float32Array): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }

    try {
      // Store the PCM data
      this.audioBuffer.push(new Float32Array(pcmData));
      
      console.log('[🔊 FileBasedAudioPlayer] Frame written: ', pcmData.length, 'samples');
      console.log('[📊 FileBasedAudioPlayer] Total buffered:', this.getTotalSamples(), 'samples');
      
      // Auto-save when we have enough data (every 50 frames or ~1.3 seconds)
      if (this.audioBuffer.length % 50 === 0 && this.playbackStarted) {
        console.log('[💾 FileBasedAudioPlayer] Auto-saving buffered audio...');
        await this.saveAndPlayAudio();
      }
    } catch (error) {
      console.error('[❌ FileBasedAudioPlayer] Write frame error:', error);
      throw error;
    }
  }

  private async saveAndPlayAudio(): Promise<void> {
    try {
      if (this.audioBuffer.length === 0) return;

      console.log('[💾 FileBasedAudioPlayer] Converting to WAV format...');
      
      // Combine all buffers
      const combinedAudio = this.getCombinedAudio();
      if (!combinedAudio) return;

      // Convert to WAV format
      const wavBuffer = this.encodeWAV(combinedAudio);
      
      // Convert to base64
      const base64Data = this.bufferToBase64(wavBuffer);
      
      // Save to file
      const fileContent = `data:audio/wav;base64,${base64Data}`;
      await RNFS.writeFile(this.audioFilePath, base64Data, 'base64');
      
      console.log('[✅ FileBasedAudioPlayer] Audio saved to file');
      console.log('[📁 FileBasedAudioPlayer] File size:', wavBuffer.byteLength, 'bytes');
      
      // Try to play using native player
      await this.playAudioFile();
    } catch (error) {
      console.error('[❌ FileBasedAudioPlayer] Save/Play error:', error);
    }
  }

  private async playAudioFile(): Promise<void> {
    try {
      const { RNSound } = NativeModules;
      
      if (RNSound && RNSound.play) {
        console.log('[🎵 FileBasedAudioPlayer] Playing audio file...');
        await RNSound.play(this.audioFilePath);
        console.log('[🔊 FileBasedAudioPlayer] Audio playing! 🎵');
      } else {
        console.log('[ℹ️ FileBasedAudioPlayer] RNSound not available, file saved at:', this.audioFilePath);
      }
    } catch (error) {
      console.error('[⚠️ FileBasedAudioPlayer] Could not play audio:', error);
      console.log('[ℹ️ FileBasedAudioPlayer] But audio is saved at:', this.audioFilePath);
    }
  }

  private getCombinedAudio(): Float32Array | null {
    if (this.audioBuffer.length === 0) return null;
    
    const totalLength = this.getTotalSamples();
    const combined = new Float32Array(totalLength);
    
    let offset = 0;
    for (const frame of this.audioBuffer) {
      combined.set(frame, offset);
      offset += frame.length;
    }
    
    return combined;
  }

  private getTotalSamples(): number {
    return this.audioBuffer.reduce((total, frame) => total + frame.length, 0);
  }

  private encodeWAV(samples: Float32Array): ArrayBuffer {
    const numChannels = this.channels;
    const sampleRate = this.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const wavLength = 44 + samples.length * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(wavLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, wavLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return arrayBuffer;
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(bytes).toString('base64');
  }

  async getPlaybackMetrics(): Promise<any> {
    return {
      isPlaying: this.isPlaying,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bufferedFrames: this.audioBuffer.length,
      totalSamples: this.getTotalSamples(),
      audioFilePath: this.audioFilePath,
    };
  }

  async terminate(): Promise<void> {
    this.isPlaying = false;
    this.audioBuffer = [];
    this.isInitialized = false;
    
    // Try to delete audio file
    try {
      const exists = await RNFS.exists(this.audioFilePath);
      if (exists) {
        await RNFS.unlink(this.audioFilePath);
      }
    } catch (error) {
      console.log('[ℹ️ FileBasedAudioPlayer] Could not delete audio file');
    }
    
    console.log('[🛑 FileBasedAudioPlayer] Terminated');
  }
}

export default new FileBasedAudioPlayer();