// src/services/stormee/StormeeClientRN.ts

import StormeeServiceRN, { StreamingState } from "./StormeeServiceRN";
import { patchReactNativeWebSocketTypes } from "./stormeeWsShim";

// Export StreamingState for backward compatibility
export { StreamingState };

// Map StreamingState to WebSocketStateRN for backward compatibility
enum WebSocketStateRN {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}

// Helper to convert StreamingState to WebSocketStateRN
function mapStreamingStateToWebSocketState(state: StreamingState): WebSocketStateRN {
  switch (state) {
    case StreamingState.IDLE:
      return WebSocketStateRN.DISCONNECTED;
    case StreamingState.CONNECTING:
      return WebSocketStateRN.CONNECTING;
    case StreamingState.CONNECTED:
      return WebSocketStateRN.CONNECTED;
    case StreamingState.RECONNECTING:
      return WebSocketStateRN.RECONNECTING;
    case StreamingState.ERROR:
      return WebSocketStateRN.ERROR;
    case StreamingState.STREAM_STARTING:
      return WebSocketStateRN.CONNECTING;
    case StreamingState.STREAMING:
      return WebSocketStateRN.CONNECTED;
    case StreamingState.BUFFERING:
      return WebSocketStateRN.CONNECTED;
    default:
      return WebSocketStateRN.DISCONNECTED;
  }
}

type StormeeClientRNOptions = {
  wsUrl?: string;
  sessionId: string;

  onTranscription?: (text: string) => void;
  onError?: (err: any) => void;

  onConnect?: () => void;
  onDisconnect?: () => void;

  // optional debug callbacks
  onStateChange?: (state: WebSocketStateRN | StreamingState) => void;
  onAudioChunk?: (bytes: Uint8Array, chunkNumber?: number) => void;
};

export class StormeeClientRN {
  private service = StormeeServiceRN; // singleton instance
  private sessionId: string;
  private wsUrl: string;

  constructor(private options: StormeeClientRNOptions) {
    patchReactNativeWebSocketTypes();

    this.sessionId = options.sessionId;
    this.wsUrl = 'wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws';

    // Wire service events to client callbacks
    if (this.service.setEventHandlers) {
      this.service.setEventHandlers({
        onConnect: () => {
          console.log('[StormeeClientRN] Connected');
          this.options.onConnect?.();
          this.options.onStateChange?.(WebSocketStateRN.CONNECTED);
        },
        onDisconnect: () => {
          console.log('[StormeeClientRN] Disconnected');
          this.options.onDisconnect?.();
          this.options.onStateChange?.(WebSocketStateRN.DISCONNECTED);
        },
        onTranscription: (text: string) => {
          console.log('[StormeeClientRN] Transcription:', text);
          this.options.onTranscription?.(text);
        },
        onAudioChunk: (bytes: Uint8Array) => {
          console.log('[StormeeClientRN] Audio chunk received');
          this.options.onAudioChunk?.(bytes);
        },
        onError: (err: any) => {
          console.error('[StormeeClientRN] Error:', err);
          this.options.onError?.(err);
          this.options.onStateChange?.(WebSocketStateRN.ERROR);
        },
        onStreamStart: () => {
          console.log('[StormeeClientRN] Stream started');
          this.options.onStateChange?.(WebSocketStateRN.CONNECTED);
        },
        onStreamEnd: () => {
          console.log('[StormeeClientRN] Stream ended');
          this.options.onStateChange?.(WebSocketStateRN.CONNECTED);
        },
      });
    }
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      await this.service.initialize();
      console.log('[StormeeClientRN] Initialized');
    } catch (error) {
      console.error('[StormeeClientRN] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Connect socket
   */
  async connect() {
    try {
      if (!this.service.connect) {
        throw new Error("StormeeServiceRN.connect is not implemented");
      }
      console.log('[StormeeClientRN] Connecting...');
      this.service.connect(this.sessionId, this.wsUrl);
    } catch (error) {
      console.error('[StormeeClientRN] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    try {
      if (!this.service.disconnect) {
        throw new Error("StormeeServiceRN.disconnect is not implemented");
      }
      console.log('[StormeeClientRN] Disconnecting...');
      this.service.disconnect();
    } catch (error) {
      console.error('[StormeeClientRN] Disconnect failed:', error);
    }
  }

  /**
   * Start streaming (sends TTS or audio request after init)
   */
  async startStreaming(userQuery: string) {
    console.log("Started startstreaming")
    try {
      console.log('[StormeeClientRN] Starting stream with query:', userQuery);

      if (!this.service.isConnected) {
        console.log('[StormeeClientRN] Not connected, connecting first...');
        await this.connect();
      }

      if (!this.service.sendInitWithQuery) {
        throw new Error("StormeeServiceRN.sendInitWithQuery is not implemented");
      }

      // Send the user query to backend
      this.service.sendInitWithQuery(userQuery);
    } catch (error) {
      console.error('[StormeeClientRN] Start streaming failed:', error);
      throw error;
    }
  }

  /**
   * Stop current stream
   */
  stopStreaming() {
    console.log('[StormeeClientRN] Stopping stream');
    this.disconnect();
  }

  /**
   * Check if connected
   */
  checkIsConnected(): boolean {
    return this.service.isConnected;
  }

  /**
   * Get current state
   */
  getState(): StreamingState {
    return this.service.getState();
  }

  /**
   * Get mapped state for backward compatibility
   */
  getMappedState(): WebSocketStateRN {
    return mapStreamingStateToWebSocketState(this.service.getState());
  }
}

export { WebSocketStateRN };