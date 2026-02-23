import Sound from 'react-native-sound';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

/**
 * WORKING Audio Player using react-native-sound
 * This ACTUALLY plays audio through the speaker! 🔊
 */

class WorkingSoundPlayer {
  private audioBuffer: Float32Array[] = [];
  private isPlaying = false;
  private isInitialized = false;
  private sampleRate = 24000;
  private channels = 1;
  private audioFilePath = '';
  private sound: any = null;
  private playbackStarted = false;
  private lastPlayTime = 0;
  private playInterval = 2000; // Save and play every 2 seconds

  async initialize(config: { sampleRate: number; channels: number }): Promise<void> {
    try {
      console.log('[🎵 WorkingSoundPlayer] Initializing with config:', config);
      
      this.sampleRate = config.sampleRate;
      this.channels = config.channels;
      this.audioBuffer = [];
      
      // Set up audio file path
      const documentsDir = Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalDirectoryPath;
      this.audioFilePath = `${documentsDir}/stormee_audio_${Date.now()}.wav`;

      // Enable audio playback
      Sound.setCategory('Playback', true);

      this.isInitialized = true;
      console.log('[✅ WorkingSoundPlayer] Initialization complete ✅');
      console.log('[📁 WorkingSoundPlayer] Audio file path:', this.audioFilePath);
    } catch (error) {
      console.error('[❌ WorkingSoundPlayer] Init failed:', error);
      throw error;
    }
  }

  async startPlayback(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }
    this.isPlaying = true;
    this.playbackStarted = true;
    this.lastPlayTime = Date.now();
    console.log('[▶️ WorkingSoundPlayer] Playback started ✅');
  }

  async stopPlayback(): Promise<void> {
    this.isPlaying = false;
    
    // Stop sound if playing
    if (this.sound) {
      try {
        await new Promise((resolve) => {
          this.sound.stop(() => {
            resolve(null);
          });
        });
      } catch (e) {
        console.log('[ℹ️ WorkingSoundPlayer] Sound stop failed');
      }
    }
    
    console.log('[⏹️ WorkingSoundPlayer] Playback stopped');
  }

  async writeAudioFrame(pcmData: Float32Array): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Audio player not initialized');
    }

    try {
      // Store the PCM data
      this.audioBuffer.push(new Float32Array(pcmData));
      
      console.log('[🔊 WorkingSoundPlayer] Frame written:', pcmData.length, 'samples');
      console.log('[📊 WorkingSoundPlayer] Total buffered:', this.getTotalSamples(), 'samples');
      
      // ✅ FIX: Save and play every 2 seconds OR when we have enough data
      const now = Date.now();
      const timeSinceLastPlay = now - this.lastPlayTime;
      const totalSamples = this.getTotalSamples();
      
      // Play if: 2 seconds passed OR we have 50k+ samples (about 2 seconds at 24kHz)
      if (this.playbackStarted && (timeSinceLastPlay > this.playInterval || totalSamples > 50000)) {
        console.log('[💾 WorkingSoundPlayer] SAVING AND PLAYING NOW!');
        this.lastPlayTime = now;
        await this.saveAndPlayAudio();
      }
    } catch (error) {
      console.error('[❌ WorkingSoundPlayer] Write frame error:', error);
      throw error;
    }
  }

  private async saveAndPlayAudio(): Promise<void> {
    try {
      if (this.audioBuffer.length === 0) {
        console.log('[⚠️ WorkingSoundPlayer] No audio to save');
        return;
      }

      console.log('[💾 WorkingSoundPlayer] Converting', this.audioBuffer.length, 'frames to WAV...');
      
      // Combine all buffers
      const combinedAudio = this.getCombinedAudio();
      if (!combinedAudio) {
        console.log('[⚠️ WorkingSoundPlayer] Failed to combine audio');
        return;
      }

      console.log('[🔄 WorkingSoundPlayer] Encoding WAV format...');
      
      // Convert to WAV format
      const wavBuffer = this.encodeWAV(combinedAudio);
      
      console.log('[🔄 WorkingSoundPlayer] Converting to base64...');
      
      // Convert to base64
      const base64Data = Buffer.from(new Uint8Array(wavBuffer)).toString('base64');
      
      console.log('[💾 WorkingSoundPlayer] Saving file, size:', wavBuffer.byteLength, 'bytes');
      
      // Save to file
      await RNFS.writeFile(this.audioFilePath, base64Data, 'base64');
      
      console.log('[✅ WorkingSoundPlayer] File saved!');
      
      // Clear buffer after saving (to avoid re-encoding same data)
      this.audioBuffer = [];
      
      // Play the audio file
      await this.playSound();
    } catch (error) {
      console.error('[❌ WorkingSoundPlayer] Save error:', error);
    }
  }

  private async playSound(): Promise<void> {
    try {
      // Release previous sound if exists
      if (this.sound) {
        console.log('[🔄 WorkingSoundPlayer] Releasing previous sound...');
        this.sound.release();
      }

      console.log('[🎵 WorkingSoundPlayer] Creating sound object...');
      
      // Create new sound
      this.sound = new Sound(this.audioFilePath, '', (error: any) => {
        if (error) {
          console.log('[❌ WorkingSoundPlayer] Failed to load sound:', error);
          return;
        }

        const duration = this.sound.getDuration();
        console.log('[✅ WorkingSoundPlayer] Sound loaded! Duration:', duration, 's');
        console.log('[▶️ WorkingSoundPlayer] PLAYING AUDIO NOW!!! 🎵🔊🎵');
        
        // Play the sound
        this.sound.play((success: boolean) => {
          if (success) {
            console.log('[🎉 WorkingSoundPlayer] AUDIO PLAYING!!! You should hear sound now! 🔊');
          } else {
            console.log('[❌ WorkingSoundPlayer] Playback failed');
          }
        });
      });
    } catch (error) {
      console.error('[❌ WorkingSoundPlayer] Play error:', error);
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
    
    if (this.sound) {
      this.sound.release();
      this.sound = null;
    }
    
    this.audioBuffer = [];
    this.isInitialized = false;
    
    // Delete audio file
    try {
      const exists = await RNFS.exists(this.audioFilePath);
      if (exists) {
        await RNFS.unlink(this.audioFilePath);
      }
    } catch (error) {
      console.log('[ℹ️ WorkingSoundPlayer] Could not delete file');
    }
    
    console.log('[🛑 WorkingSoundPlayer] Terminated]');
  }
}

export default new WorkingSoundPlayer();