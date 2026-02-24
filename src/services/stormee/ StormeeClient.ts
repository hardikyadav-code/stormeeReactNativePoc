// src/services/stormee/StormeeClientRN.ts

import StormeeServiceRN, { StreamingState } from "./StormeeServiceRN";
import { patchReactNativeWebSocketTypes } from "./stormeeWsShim";

export { StreamingState };

enum WebSocketStateRN {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING   = "CONNECTING",
  CONNECTED    = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR        = "ERROR",
}

function mapStreamingStateToWebSocketState(state: StreamingState): WebSocketStateRN {
  switch (state) {
    case StreamingState.IDLE:         return WebSocketStateRN.DISCONNECTED;
    case StreamingState.CONNECTING:   return WebSocketStateRN.CONNECTING;
    case StreamingState.CONNECTED:    return WebSocketStateRN.CONNECTED;
    case StreamingState.STREAMING:    return WebSocketStateRN.CONNECTED;
    case StreamingState.RECONNECTING: return WebSocketStateRN.RECONNECTING;
    case StreamingState.ERROR:        return WebSocketStateRN.ERROR;
    default:                          return WebSocketStateRN.DISCONNECTED;
  }
}

type StormeeClientRNOptions = {
  wsUrl?: string;
  sessionId: string;
  onTranscription?: (text: string) => void;
  onError?: (err: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStateChange?: (state: WebSocketStateRN | StreamingState) => void;
  onAudioChunk?: (bytes: Uint8Array, chunkNumber?: number) => void;
};

export class StormeeClientRN {
  private service = StormeeServiceRN;
  private sessionId: string;

  private static isInitialized = false;

  constructor(private options: StormeeClientRNOptions) {
    patchReactNativeWebSocketTypes();
    this.sessionId = options.sessionId;

    this.service.setEventHandlers({
      onConnect: () => {
        console.log("[StormeeClientRN] onConnect");
        this.options.onConnect?.();
        this.options.onStateChange?.(WebSocketStateRN.CONNECTED);
      },
      onDisconnect: () => {
        console.log("[StormeeClientRN] onDisconnect");
        this.options.onDisconnect?.();
        this.options.onStateChange?.(WebSocketStateRN.DISCONNECTED);
      },
      onTranscription: (text: string) => {
        this.options.onTranscription?.(text);
      },
      onAudioChunk: (bytes: Uint8Array, chunkNumber?: number) => {
        console.log(`[StormeeClientRN] audio chunk #${chunkNumber}`);
        this.options.onAudioChunk?.(bytes, chunkNumber);
      },
      onError: (err: any) => {
        console.error("[StormeeClientRN] onError:", err);
        this.options.onError?.(err);
        this.options.onStateChange?.(WebSocketStateRN.ERROR);
      },
      onStreamStart: () => {
        console.log("[StormeeClientRN] onStreamStart");
        this.options.onStateChange?.(StreamingState.STREAMING);
      },
      onStreamEnd: () => {
        console.log("[StormeeClientRN] onStreamEnd");
        this.options.onStateChange?.(WebSocketStateRN.CONNECTED);
      },
    });
  }

  async initialize(): Promise<void> {
    if (StormeeClientRN.isInitialized) {
      console.log("[StormeeClientRN] Already initialized — skip");
      return;
    }
    await this.service.initialize();
    StormeeClientRN.isInitialized = true;
    console.log("[StormeeClientRN] Initialized");
  }

  async connect(): Promise<void> {
    if (!StormeeClientRN.isInitialized) await this.initialize();
    console.log("[StormeeClientRN] Connecting...");
    await this.service.connect(this.sessionId);
    console.log("[StormeeClientRN] Socket is open and ready");
  }

  disconnect(): void {
    console.log("[StormeeClientRN] Disconnecting...");
    this.service.disconnect();
  }

  async startStreaming(userQuery: string): Promise<void> {
    console.log("[StormeeClientRN] startStreaming:", userQuery);
    try {
      if (!this.service.isConnected) {
        console.log("[StormeeClientRN] Not connected — connecting now...");
        await this.connect();
      }
      console.log("[StormeeClientRN] Sending query to backend...");
      this.service.sendInitWithQuery(userQuery);
    } catch (error) {
      console.error("[StormeeClientRN] startStreaming error:", error);
      throw error;
    }
  }

  stopStreaming(): void {
    console.log("[StormeeClientRN] stopStreaming");
    this.disconnect();
  }

  checkIsConnected(): boolean { return this.service.isConnected; }
  getState(): StreamingState  { return this.service.getState(); }
  getMappedState(): WebSocketStateRN { return mapStreamingStateToWebSocketState(this.service.getState()); }
}

export { WebSocketStateRN };