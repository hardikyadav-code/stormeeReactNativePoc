// src/services/stormee/StormeeClientRN.ts

import { StormeeServiceRN } from "./StormeeServiceRN";
import { patchReactNativeWebSocketTypes } from "./stormeeWsShim";

type StormeeClientRNOptions = {
  wsUrl: string;
  sessionId: string;

  onTranscription?: (text: string) => void;
  onError?: (err: any) => void;

  onConnect?: () => void;
  onDisconnect?: () => void;

  // optional debug callbacks
  onStateChange?: (state: string) => void;
  onAudioChunk?: (bytes: Uint8Array, chunkNumber?: number) => void;
};

export class StormeeClientRN {
  private service: StormeeServiceRN;
  private sessionId: string;

  constructor(options: StormeeClientRNOptions) {
    patchReactNativeWebSocketTypes();

    this.sessionId = options.sessionId;

    this.service = new StormeeServiceRN({
      websocket: {
        url: options.wsUrl,
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 800,
        connectionTimeoutMs: 10000,
      },

      sessionId: options.sessionId,

      debug: true,

      eventHandlers: {
        onConnect: () => {
          options.onConnect?.();
        },
        onDisconnect: () => {
          options.onDisconnect?.();
        },
        onStateChange: (state) => {
          options.onStateChange?.(state);
        },

        onTranscription: (text: string) => {
          options.onTranscription?.(text);
        },

        onAudioChunk: (bytes: Uint8Array, chunkNumber?: number) => {
          options.onAudioChunk?.(bytes, chunkNumber);
        },

        onError: (err: any) => {
          options.onError?.(err);
        },
      },
    });
  }

  // ✅ connect socket
  async connect() {
    await this.service.connect(this.sessionId);
  }

  // ✅ disconnect socket
  disconnect() {
    this.service.disconnect();
  }

  // ✅ start streaming
  async startStreaming(userQuery: string) {
    await this.service.startStreaming({
      sessionId: this.sessionId,
      conciergeName: "Stormee",
      userQuery,
      chat_history: [],
      metadata: {},
      queryNumber: "1",
    });
  }

  // ✅ stop current stream
  stopStreaming() {
    this.service.stopStreaming();
  }

  // optional helpers
  isConnected() {
    return this.service.isConnected();
  }

  getResumptionToken() {
    return this.service.getResumptionToken();
  }
}
