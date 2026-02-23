import { AssistantClient, AssistantOptions, AssistantEvent } from 'ratt-lib';
import { v4 as uuidv4 } from 'uuid';
import { throttle } from 'lodash';
import { Buffer } from 'buffer'; // Requires 'npm install buffer'
import AudioRecord from 'react-native-audio-record';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface RattClientState {
  wsReady: boolean;
  micOpen: boolean;
  micConnecting: boolean;
  amplitude: number;
  transcription: string;
  isLoading: boolean;
  error: string | null;
  autoSend: boolean;
  disconnectionByError: boolean;
  startAudio: boolean;
}

type TranscriptCallback = (text: string) => void;
type StateCallback = (state: Partial<RattClientState>) => void;
type ErrorCallback = (error: string) => void;

/* ------------------------------------------------------------------ */
/* RATT CLIENT SERVICE (React Native Version)                         */
/* ------------------------------------------------------------------ */

export class RattClientService {
  private client: AssistantClient | null = null;
  private starting = false;
  private isRecording = false;

  private readonly clientId = `chat-session-${uuidv4()}`;
  // Use a mutable ref object if your library expects it, otherwise string
  private requestIdRef = { current: `request-${uuidv4()}` };

  private onTranscript?: TranscriptCallback;
  private onState?: StateCallback;
  private onError?: ErrorCallback;

  private stopAudioFlag = false;
  private disconnectFlag = false;

  constructor(
    private readonly serverUrl: string,
    private readonly rattAgentDetails: any,
  ) {
    // 1. Initialize Native Mic Configuration
    // RATT usually expects 16kHz, 16-bit, Mono PCM
    const options = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6, // 6 = VoiceRecognition on iOS (optimized for speech)
      wavFile: 'test.wav', // Library requires a file path even for streaming
    };

    AudioRecord.init(options);

    // 2. Setup the Data Listener
    // This receives Base64 encoded PCM chunks from the native layer
    AudioRecord.on('data', (data) => {
      if (!this.client || !this.isRecording) return;

      try {
        // Convert Base64 -> Buffer -> Int16Array
        const buffer = Buffer.from(data, 'base64');
        const pcm16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

        // Push raw PCM data to RATT library
        this.client.pushPCM16(pcm16);
      } catch (err) {
        console.error('Error processing audio chunk:', err);
      }
    });
  }

  /* ---------------- Event Wiring ---------------- */

  attachCallbacks(
    onTranscript: TranscriptCallback,
    onState?: StateCallback,
    onError?: ErrorCallback,
  ) {
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.onError = onError;
  }

  /* ---------------- Native Mic Control ---------------- */

  private async startNativeMic() {
    if (this.isRecording) return;

    console.log('🎙️ Starting iOS Native Mic...');
    try {
      this.isRecording = true;
      AudioRecord.start(); // Starts native capture
      this.onState?.({ micOpen: true });
    } catch (error) {
      console.error('Failed to start native mic:', error);
      this.onError?.('Microphone failed to start');
      this.isRecording = false;
      this.onState?.({ micOpen: false });
    }
  }

  private async stopNativeMic() {
    if (!this.isRecording) return;

    console.log('🛑 Stopping iOS Native Mic...');
    try {
      this.isRecording = false;
      await AudioRecord.stop();
      this.onState?.({ micOpen: false });
    } catch (error) {
      console.error('Failed to stop native mic:', error);
    }
  }

  /* ---------------- Init ---------------- */

  async init(): Promise<void> {
    console.log('xoxo initializing RATT client service (Native)');
    if (this.client) return;

    const opts: AssistantOptions = {
      url: this.serverUrl,
      requestId: this.requestIdRef, // Pass the ref object
      rattAgentDetails: this.rattAgentDetails,
      externalAudio: true, // CRITICAL: Tells lib we provide the audio stream
    };

    console.log('xoxo RATT AssistantOptions:', opts);

    const client = new AssistantClient(opts);
    this.client = client;

    const throttledAmplitude = throttle((value: number) => {
      this.onState?.({ amplitude: value });
    }, 150);

    /* -------- RATT EVENTS -------- */

    client.on(AssistantEvent.READY, () => {
      console.log('xoxoratt ratt is ready');
      this.onState?.({ wsReady: true });
    });

    client.on(AssistantEvent.MIC_OPEN, (e: any) => {
      // Sync internal state with library events
      const isOpen = Boolean(e?.detail?.open);
      this.onState?.({ micOpen: isOpen });
    });

    client.on(AssistantEvent.MIC_CONNECTING, (e: any) => {
      this.onState?.({ micConnecting: Boolean(e?.detail?.connecting) });
    });

    client.on(AssistantEvent.AMPLITUDE, (e: any) => {
      throttledAmplitude(Number(e?.detail?.value ?? 0));
    });

    client.on(AssistantEvent.TRANSCRIPTION, (e: any) => {
      const text = String(e?.detail?.text ?? '');
      console.log('xoxoratttext transcription:', text);
      if (text) this.onTranscript?.(text);
    });

    client.on(AssistantEvent.SOCKET_MESSAGE, (e: any) => {
      const parsed = e?.detail?.parsed;
      if (!parsed) return;

      console.log('xoxoratt parsed event:', parsed);

      if (parsed.start_audio) {
        this.onState?.({ startAudio: true });
        // Optionally auto-start mic here if your flow requires it:
        // this.startNativeMic();
      }

      if (parsed.stop_audio) {
        this.stopAudioFlag = true;
        // Optionally auto-stop mic here:
        // this.stopNativeMic();
      }

      if (parsed.disconnect) {
        this.disconnectFlag = true;
      }

      if (this.stopAudioFlag && this.disconnectFlag) {
        this.onState?.({
          autoSend: true,
          disconnectionByError: false,
        });

        this.stopAudioFlag = false;
        this.disconnectFlag = false;
      }
    });

    client.on(AssistantEvent.ERROR, (e: any) => {
      // Check if it's a close event by looking for the 'code' property
      const errorObj = e?.detail?.error;
      const isCloseEvent = errorObj && typeof errorObj === 'object' && 'code' in errorObj;

      const err = isCloseEvent
          ? `Connection closed (${errorObj.code})`
          : String(errorObj ?? 'Unknown RATT error');
          
      console.error('xoxo RATT ERROR:', err);

      this.onError?.(err);
      this.onState?.({
        micOpen: false,
        wsReady: false,
        disconnectionByError: true,
        error: err,
      });

      // Safety stop mic on error
      this.stopNativeMic();
    });

    await client.connect();
  }

  /* ---------------- Session Control ---------------- */

  async start(): Promise<void> {
    console.log('xoxostart starting RATT session');
    if (!this.client || this.starting) return;

    this.starting = true;
    this.onState?.({ micConnecting: true });

    try {
      // 1. Tell RATT library to start session
      await this.client.startSession();

      // 2. Start capturing audio from Native Mic
      await this.startNativeMic();

      this.onState?.({
        micOpen: true,
        micConnecting: false,
        wsReady: true,
      });
    } catch (err) {
      this.onError?.('Failed to start RATT session');
      this.onState?.({
        micConnecting: false,
        disconnectionByError: true,
      });

      // Cleanup if start fails
      this.stopNativeMic();
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.client) return;

    // 1. Stop Native Mic first to stop data flow
    await this.stopNativeMic();

    // 2. Tell RATT library to stop
    await this.client.stopAudio();
    
    this.onState?.({ micOpen: false });
  }

  disconnect(): void {
    if (!this.client) return;
    this.stopNativeMic();
    this.client.closeSocket();
  }

  async teardown(): Promise<void> {
    if (!this.client) return;

    this.stopNativeMic();
    this.client.teardown();
    this.client = null;

    this.onState?.({
      wsReady: false,
      micOpen: false,
      micConnecting: false,
    });
  }

  /* ---------------- Helpers ---------------- */

  getCurrentRequestId(): string {
    return this.requestIdRef.current;
  }
}