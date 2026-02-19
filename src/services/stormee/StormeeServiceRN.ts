// src/services/stormee/StormeeServiceRN.ts

export type StormeeRNConfig = {
  websocket: {
    url: string; // Example: wss://server/ws  (sessionId will be appended)
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
    connectionTimeoutMs?: number;
  };

  sessionId: string;

  debug?: boolean;

  eventHandlers?: {
    onConnect?: () => void;
    onDisconnect?: (event?: any) => void;
    onReconnecting?: (attempt: number) => void;
    onReconnectFailed?: () => void;

    onStateChange?: (state: WebSocketStateRN) => void;

    onTranscription?: (text: string, chunkNumber?: number) => void;
    onAudioChunk?: (chunk: Uint8Array, chunkNumber?: number) => void;

    onHeaderMessage?: (msg: string) => void;

    onStreamStart?: () => void;
    onStreamEnd?: () => void;

    onError?: (err: any) => void;

    // For debugging server raw messages
    onRawMessage?: (msg: any) => void;
  };
};

export type StartStreamRequestRN = {
  sessionId: string;
  conciergeName?: string;

  // Your backend uses agent_arguments.user_query
  userQuery: string;

  // Must match backend
  chat_history: Array<{ role: string; content: string }>;

  metadata: Record<string, any>;

  queryNumber: string;

  // optional resume
  resumptionToken?: string;
};

export enum WebSocketStateRN {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
}

type InternalState = {
  connectionState: WebSocketStateRN;
  isStreaming: boolean;

  chunksReceived: number;
  chunksProcessed: number;

  latestTranscription?: string;

  sessionId: string;
  error?: any;
};

export class StormeeServiceRN {
  private config: StormeeRNConfig;
  private debug: boolean;

  private ws: WebSocket | null = null;

  private state: InternalState;

  private reconnectAttempts = 0;
  private reconnectTimer: any = null;

  private connectionTimeoutTimer: any = null;

  private currentResumptionToken = "";
  private lastRequest: StartStreamRequestRN | null = null;
  private lastRequestId = "";

  private isUserStopped = false;

  constructor(config: StormeeRNConfig) {
    this.config = config;
    this.debug = config.debug ?? false;

    this.state = {
      connectionState: WebSocketStateRN.DISCONNECTED,
      isStreaming: false,
      chunksReceived: 0,
      chunksProcessed: 0,
      sessionId: config.sessionId,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getState() {
    return { ...this.state };
  }

  isConnected() {
    return this.state.connectionState === WebSocketStateRN.CONNECTED;
  }

  isStreamingActive() {
    return this.state.isStreaming;
  }

  getResumptionToken() {
    return this.currentResumptionToken;
  }

  getSessionId() {
    return this.state.sessionId;
  }

  async connect(sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.config.sessionId;
    this.state.sessionId = sid;

    if (this.ws && this.isConnected()) {
      if (this.debug) console.log("[StormeeRN] Already connected");
      return;
    }

    this.clearReconnectTimer();
    this.clearConnectionTimeout();

    this.setState(WebSocketStateRN.CONNECTING);

    const wsUrl = this.buildWsUrl(sid);

    if (this.debug) console.log("[StormeeRN] Connecting:", wsUrl);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        // RN supports this:
        // ws.binaryType = "arraybuffer"; ❌ (DON'T USE)
        // We'll handle in onmessage.

        // connection timeout
        const timeoutMs = this.config.websocket.connectionTimeoutMs ?? 10000;
        this.connectionTimeoutTimer = setTimeout(() => {
          if (this.debug) console.log("[StormeeRN] Connection timeout");
          this.safeCloseSocket();
          const err = new Error("WebSocket connection timeout");
          this.emitError(err);
          reject(err);
        }, timeoutMs);

        ws.onopen = () => {
          this.clearConnectionTimeout();
          this.reconnectAttempts = 0;

          if (this.debug) console.log("[StormeeRN] Connected");
          this.setState(WebSocketStateRN.CONNECTED);

          this.config.eventHandlers?.onConnect?.();

          resolve();
        };

        ws.onclose = (event: any) => {
          this.clearConnectionTimeout();

          if (this.debug) {
            console.log("[StormeeRN] Closed", {
              code: event?.code,
              reason: event?.reason,
            });
          }

          const wasStreaming = this.state.isStreaming;

          this.setState(WebSocketStateRN.DISCONNECTED);
          this.state.isStreaming = false;

          this.config.eventHandlers?.onDisconnect?.(event);

          // auto reconnect only if:
          // - enabled
          // - user did not stop manually
          // - it was previously connected or streaming
          const autoReconnect = this.config.websocket.autoReconnect ?? true;

          if (autoReconnect && !this.isUserStopped && (wasStreaming || this.lastRequest)) {
            this.tryReconnect();
          }
        };

        ws.onerror = (event: any) => {
          if (this.debug) console.log("[StormeeRN] Error event:", event);
          this.emitError(event);
        };

        ws.onmessage = (event: any) => {
          this.handleMessage(event?.data);
        };
      } catch (err) {
        this.emitError(err);
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.debug) console.log("[StormeeRN] disconnect()");
    this.isUserStopped = true;
    this.stopStreaming();
    this.safeCloseSocket();
    this.setState(WebSocketStateRN.DISCONNECTED);
  }

  stopStreaming() {
    if (this.debug) console.log("[StormeeRN] stopStreaming()");

    this.isUserStopped = true;
    this.state.isStreaming = false;

    // tell server to stop current query if protocol supports it
    this.sendJSON({
      type: "end_current_query_stream",
      timestamp: Date.now(),
    });

    this.currentResumptionToken = "";
    this.lastRequest = null;
    this.lastRequestId = "";

    this.config.eventHandlers?.onStreamEnd?.();
  }

  /**
   * Start streaming:
   * Sends your payload format (matches your library)
   */
  async startStreaming(request: StartStreamRequestRN, isResuming = false) {
    if (!this.ws || !this.isConnected()) {
      throw new Error("WebSocket not connected. Call connect() first.");
    }

    if (this.debug) {
      console.log("[StormeeRN] startStreaming()", {
        isResuming,
        sessionId: request.sessionId,
        queryNumber: request.queryNumber,
        resumptionToken: request.resumptionToken ?? this.currentResumptionToken,
      });
    }

    // end previous
    if (this.state.isStreaming) {
      this.sendJSON({ type: "end_current_query_stream", timestamp: Date.now() });
      this.state.isStreaming = false;
    }

    this.isUserStopped = false;

    if (!isResuming) {
      this.state.chunksReceived = 0;
      this.state.chunksProcessed = 0;
      this.currentResumptionToken = "";
    }

    this.lastRequest = request;

    // request_id: reuse if resuming
    const requestId =
      isResuming && this.lastRequestId ? this.lastRequestId : `requestId-${this.uuid()}`;

    this.lastRequestId = requestId;

    const payload = {
      concierge_name: request.conciergeName || "",
      request_id: requestId,
      agent_arguments: {
        user_query: request.userQuery,
      },
      chat_history: request.chat_history,
      metadata: JSON.stringify(request.metadata),
      session_id: request.sessionId,
      query_number: request.queryNumber,
      resumption_token: request.resumptionToken || this.currentResumptionToken || "",
    };

    if (this.debug) console.log("[StormeeRN] Sending payload:", payload);

    this.sendJSON(payload);

    this.state.isStreaming = true;

    this.config.eventHandlers?.onStreamStart?.();

    return { success: true, sessionId: request.sessionId };
  }

  /**
   * Send UI event like ACK
   */
  sendUIEvent(event: any) {
    return this.sendJSON({
      type: "ui_event",
      ...event,
      timestamp: Date.now(),
    });
  }

  sendPing() {
    return this.sendJSON({ type: "ping", timestamp: Date.now() });
  }

  // ============================================================================
  // Internal: Message Handling
  // ============================================================================

  private async handleMessage(data: any) {
    try {
      this.config.eventHandlers?.onRawMessage?.(data);

      // JSON messages
      if (typeof data === "string") {
        const json = this.safeJSONParse(data);

        if (!json) {
          if (this.debug) console.log("[StormeeRN] Received non-json string:", data);
          return;
        }

        await this.processJSONMessage(json);
        return;
      }

      // Binary messages
      // RN often gives ArrayBuffer
      if (data instanceof ArrayBuffer) {
        await this.processBinaryChunk(new Uint8Array(data));
        return;
      }

      // Some RN versions send { data: ... }
      if (data?.data instanceof ArrayBuffer) {
        await this.processBinaryChunk(new Uint8Array(data.data));
        return;
      }

      // Fallback
      if (this.debug) console.log("[StormeeRN] Unknown message type:", typeof data, data);
    } catch (err) {
      this.emitError(err);
    }
  }

  /**
   * This is where your library did:
   * MessagePack decode + Opus decode.
   *
   * In RN POC we just:
   * - count chunks
   * - optionally store resumption token if server sends it as first bytes or json.
   *
   * NEXT STEP later:
   * - integrate msgpack decoder
   * - integrate opus decoder (native)
   */
  private async processBinaryChunk(bytes: Uint8Array) {
    if (this.isUserStopped) {
      if (this.debug) console.log("[StormeeRN] Discard binary chunk (user stopped)");
      return;
    }

    this.state.chunksReceived++;

    // For now we just pass raw bytes to UI
    this.config.eventHandlers?.onAudioChunk?.(bytes, this.state.chunksReceived);

    this.state.chunksProcessed++;

    if (this.debug) {
      console.log("[StormeeRN] Binary chunk received:", {
        size: bytes.length,
        chunksReceived: this.state.chunksReceived,
      });
    }
  }

  private async processJSONMessage(msg: any) {
    const type = msg?.type;

    if (this.debug) console.log("[StormeeRN] JSON:", msg);

    switch (type) {
      case "session_info":
        this.state.sessionId = msg.sessionId || this.state.sessionId;
        break;

      case "stream_started":
        this.state.isStreaming = true;
        break;

      case "stream_stopped":
        this.state.isStreaming = false;
        this.config.eventHandlers?.onStreamEnd?.();
        break;

      case "transcription":
        // if your backend sends transcription as json
        if (msg.text) {
          this.state.latestTranscription = msg.text;
          this.config.eventHandlers?.onTranscription?.(msg.text, msg.chunkNumber);
        }
        break;

      case "header_message":
        if (msg.message) {
          this.config.eventHandlers?.onHeaderMessage?.(msg.message);
        }
        break;

      case "resumption_token":
        if (msg.token) {
          this.currentResumptionToken = String(msg.token);
        }
        break;

      case "error":
        this.emitError(new Error(msg.message || "Server error"));
        break;

      default:
        // ignore unknown json
        break;
    }
  }

  // ============================================================================
  // Reconnect
  // ============================================================================

  private tryReconnect() {
    const autoReconnect = this.config.websocket.autoReconnect ?? true;
    if (!autoReconnect) return;

    const max = this.config.websocket.maxReconnectAttempts ?? 3;

    if (this.reconnectAttempts >= max) {
      if (this.debug) console.log("[StormeeRN] Reconnect failed - max attempts reached");
      this.config.eventHandlers?.onReconnectFailed?.();
      return;
    }

    this.reconnectAttempts++;
    this.setState(WebSocketStateRN.RECONNECTING);

    this.config.eventHandlers?.onReconnecting?.(this.reconnectAttempts);

    const delay = this.config.websocket.reconnectDelayMs ?? 800;

    if (this.debug) {
      console.log(`[StormeeRN] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${max})`);
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.state.sessionId);

        // resume streaming if lastRequest exists
        if (this.lastRequest && !this.isUserStopped) {
          if (this.debug) console.log("[StormeeRN] Resuming last request after reconnect");

          await this.startStreaming(
            {
              ...this.lastRequest,
              resumptionToken: this.currentResumptionToken || "",
            },
            true
          );
        }
      } catch (err) {
        this.emitError(err);
        this.tryReconnect();
      }
    }, delay);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private buildWsUrl(sessionId: string) {
    // matches your library: ws://server/ws/{sessionId}
    const base = this.config.websocket.url.replace(/\/$/, "");
    return `${base}/${sessionId}`;
  }

  private sendJSON(obj: any) {
    try {
      if (!this.ws || !this.isConnected()) return false;

      const str = JSON.stringify(obj);
      this.ws.send(str);
      return true;
    } catch (err) {
      this.emitError(err);
      return false;
    }
  }

  private safeCloseSocket() {
    try {
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      }
    } catch {}
    this.ws = null;
  }

  private setState(state: WebSocketStateRN) {
    this.state.connectionState = state;
    this.config.eventHandlers?.onStateChange?.(state);
  }

  private emitError(err: any) {
    this.state.error = err;
    this.setState(WebSocketStateRN.ERROR);
    this.config.eventHandlers?.onError?.(err);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  private safeJSONParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  // crypto.randomUUID() is not always available in RN
  private uuid(): string {
    // simple uuid-ish for POC
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
      .toString(16)
      .slice(2)}`;
  }
}
