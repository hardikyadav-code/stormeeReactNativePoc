// src/services/stormee/StormeeServiceRN.ts

import { Buffer } from 'buffer';
import AudioChunkProcessor from "./audio/AudioChunkProcessor";
import CircularAudioBuffer from './audio/AudioBuffer';
import StateManager, { StreamingState } from './audio/StateManager';
import NativeAudioBridge from './native/NativeAudioBridge';

export { StreamingState };

class StormeeServiceRN {
  private ws: WebSocket | null = null;
  private sessionId = '';
  isConnected = false;

  // ===== Core Components =====
  private stateManager = new StateManager();
  private audioProcessor: AudioChunkProcessor | null = null;
  private nativeAudioBridge = NativeAudioBridge;

  // ===== Connection Management =====
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private shouldReconnect = true;

  // ===== Event Handlers =====
  private eventHandlers: any = {};

  // ===== Configuration =====
  private config = {
    sampleRate: 24000,
    channels: 1,
    bufferCapacitySeconds: 10,
    enableMetrics: true,
  };

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    try {
      console.log('[🎵 Stormee] Initializing...');

      this.audioProcessor = new AudioChunkProcessor(
        this.config.sampleRate,
        this.config.bufferCapacitySeconds
      );

      // ✅ PASS CONFIG TO NATIVE
      await this.nativeAudioBridge.initialize({
        sampleRate: this.config.sampleRate,
        channels: this.config.channels,
      });

      this.stateManager.on(StreamingState.STREAMING, () => {
        console.log('[🎵 Stormee] State: STREAMING');
      });

      this.stateManager.on(StreamingState.BUFFERING, () => {
        console.log('[🎵 Stormee] State: BUFFERING');
      });

      console.log('[🎵 Stormee] Initialization complete ✅');
    } catch (error) {
      console.error('[❌ Stormee] Init failed:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket
   */
  connect(
    sessionId: string,
    wsUrl: string = 'wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws'
  ) {
    console.log('[🔌 Stormee] Connecting...');

    this.sessionId = sessionId;
    this.stateManager.transition(StreamingState.CONNECTING);

    try {
      this.ws = new WebSocket(`${wsUrl}/${sessionId}`);

      // ✅ VERY IMPORTANT FOR BINARY AUDIO
     (this.ws as any).binaryType = 'arraybuffer';

      this.ws.onopen = () => this.handleConnect();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = () => this.handleDisconnect();
      this.ws.onerror = (err) => this.handleError(err);
    } catch (error) {
      console.error('[❌ Stormee] Connection error:', error);
      this.stateManager.transition(StreamingState.ERROR);
      this.trigger('onError', error);
    }
  }

  private handleConnect(): void {
    console.log('[✅ Stormee] Connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.stateManager.transition(StreamingState.CONNECTED);
    this.trigger('onConnect');
  }

  private handleDisconnect(): void {
    console.log('[❌ Stormee] Disconnected');
    this.isConnected = false;
    this.stateManager.transition(StreamingState.IDLE);
    this.trigger('onDisconnect');

    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`[🔄 Stormee] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      this.stateManager.transition(StreamingState.RECONNECTING);
      setTimeout(() => this.connect(this.sessionId), delay);
    }
  }

  private handleError(error: any): void {
    console.error('[🚨 Stormee] Error:', error);
    this.stateManager.transition(StreamingState.ERROR);
    this.trigger('onError', error);
  }

  sendInitWithQuery(userQuery: string): void {
    if (!this.ws || !this.isConnected) {
      console.log('[❗ Stormee] Not connected');
      return;
    }

    this.stateManager.transition(StreamingState.STREAM_STARTING);

    const requestId = `requestId-${Date.now()}`;
    
    const metadataObject = {
      chat_history: [],
      rlef_id: '',
      mode_parameters: {},
      mongo_db_id: '',
      template_name: 'open_brainstorming',
      context: '',
      user_id: '68fbb9ec1fff8606d6b61b93',
      project_id: '69948177cb0b34761aa56e0e',
      delay_on_initial_message: 0,
      query_number: '-1',
      userEmailId: 'vikas.as@techolution.com',
      userName: 'Vikas A S',
      modeName: 'BrainStorm Mode',
    };

    const payload = {
      concierge_name: 'stormee',
      request_id: requestId,
      agent_arguments: { user_query: userQuery },
      chat_history: [],
      metadata: JSON.stringify(metadataObject),
      session_id: this.sessionId,
      query_number: '-1',
      resumption_token: '',
    };

    console.log('[📤 Stormee] Sending query:', userQuery);
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(event: any): void {
    // ===== AUDIO CHUNKS =====
    if (event.data instanceof ArrayBuffer) {
      const pcmChunk = new Uint8Array(event.data);
      this.processAudioChunk(pcmChunk);
      return;
    }

    // ===== JSON MESSAGES =====
    if (typeof event.data === 'string') {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === 'stream_start') {
          console.log('[🎬 Stormee] Stream starting');
          this.handleStreamStart();
          return;
        }

        if (parsed.type === 'stream_end') {
          console.log('[🏁 Stormee] Stream ended');
          this.handleStreamEnd();
          return;
        }

        if (parsed.type === 'transcription') {
          console.log('[📝 Stormee] Transcription:', parsed.text);
          this.trigger('onTranscription', parsed.text);
          return;
        }
      } catch {
        console.log('[ℹ️ Stormee] Non-JSON message');
      }
    }
  }

  private async handleStreamStart(): Promise<void> {
    try {
      if (!this.audioProcessor) {
        throw new Error('Audio processor not initialized');
      }

      this.audioProcessor.reset();
      this.stateManager.transition(StreamingState.STREAMING);

      await this.nativeAudioBridge.startPlayback();

      this.trigger('onStreamStart');
    } catch (error) {
      console.error('[❌ Stormee] Stream start failed:', error);
      this.stateManager.transition(StreamingState.ERROR);
    }
  }

  private async handleStreamEnd(): Promise<void> {
    try {
      await this.nativeAudioBridge.stopPlayback();
      this.stateManager.transition(StreamingState.CONNECTED);
      this.trigger('onStreamEnd');
    } catch (error) {
      console.error('[❌ Stormee] Stream end failed:', error);
    }
  }

  private async processAudioChunk(chunk: Uint8Array): Promise<void> {
    if (!this.audioProcessor) return;

    try {
      let audioChunk = chunk;

      if (audioChunk.length % 2 !== 0) {
        audioChunk = audioChunk.slice(0, audioChunk.length - 1);
      }

      const success = this.audioProcessor.processChunk(audioChunk);
      if (!success) return;

      // ✅ BACKEND SENDS INT16 PCM - SEND AS-IS (no conversion needed)
      // Swift will handle the Int16→Float32 conversion
      const base64 = Buffer.from(audioChunk).toString('base64');
      await this.nativeAudioBridge.writeAudioFrame(base64);

      const health = this.audioProcessor.getHealthPercent();

      if (
        health < 30 &&
        this.stateManager.getState() === StreamingState.STREAMING
      ) {
        this.stateManager.transition(StreamingState.BUFFERING);
      } else if (
        health > 50 &&
        this.stateManager.getState() === StreamingState.BUFFERING
      ) {
        this.stateManager.transition(StreamingState.STREAMING);
      }

      this.trigger('onAudioChunk', chunk);
    } catch (error) {
      console.error('[❌ Stormee] Chunk processing error:', error);
    }
  }

  setEventHandlers(handlers: any): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  private trigger(event: string, ...args: any[]): void {
    if (this.eventHandlers?.[event]) {
      try {
        this.eventHandlers[event](...args);
      } catch (error) {
        console.error(`[❌ Stormee] Event handler error (${event}):`, error);
      }
    }
  }

  getState(): StreamingState {
    return this.stateManager.getState();
  }

  disconnect(): void {
    console.log('[🔌 Stormee] Disconnecting');
    this.shouldReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.stateManager.transition(StreamingState.IDLE);
    this.audioProcessor?.reset();
    this.nativeAudioBridge.terminate();
  }
}

export default new StormeeServiceRN();