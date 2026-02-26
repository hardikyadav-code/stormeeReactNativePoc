// StormeeServiceRN.ts
// Fixed for continuous conversation lifecycle — mirrors the web StormeeService lib.

import { Buffer } from "buffer";
import { NativeModules } from "react-native";
// 🚀 Import the Zustand Store
import { useChatHistoryStore } from "../../store/useChatHistoryStore"; 

;(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

const { StormeeAudioModule } = NativeModules;

export enum StreamingState {
  IDLE         = "IDLE",
  CONNECTING   = "CONNECTING",
  CONNECTED    = "CONNECTED",
  STREAMING    = "STREAMING",
  RECONNECTING = "RECONNECTING",
  ERROR        = "ERROR",
}

type EventHandlers = {
  onConnect?:           () => void;
  onDisconnect?:        () => void;
  onTranscription?:     (text: string, chunkNumber?: number) => void;
  onAudioChunk?:        (bytes: Uint8Array, chunkNumber?: number) => void;
  onError?:             (err: any) => void;
  onStreamStart?:       () => void;
  onStreamEnd?:         () => void;
  onHeaderMessage?:     (message: string) => void;
  onChunkProcessed?:    (chunk: any) => void;
  onReconnecting?:      (attempt: number) => void;
  onReconnected?:       () => void;
  onReconnectFailed?:   () => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const INACTIVITY_PING_INTERVAL = 10_000; // ms — ping if no data received for 10 s

// ── Robust multi-frame byte extractor ────────────────────────────────────────
function extractAllBytes(v: unknown): Uint8Array[] {
  if (v == null) return [];

  if (v instanceof Uint8Array) return v.length > 0 ? [v] : [];
  if (ArrayBuffer.isView(v)) {
    const b = v as ArrayBufferView;
    return b.byteLength > 0 ? [new Uint8Array(b.buffer, b.byteOffset, b.byteLength)] : [];
  }

  if (typeof v === "string") {
    if (!v.length) return [];
    try {
      const d = Buffer.from(v, "base64");
      return d.length > 0 ? [new Uint8Array(d)] : [];
    } catch { return []; }
  }

  if (typeof v === "object") {
    const obj = v as any;

    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
      return [new Uint8Array(v as number[])];
    }
    if (typeof obj.length === "number" && obj.length > 0 && typeof obj[0] === "number") {
      const bytes = new Uint8Array(obj.length);
      for (let i = 0; i < obj.length; i++) bytes[i] = obj[i] ?? 0;
      return [bytes];
    }

    if (Array.isArray(v)) {
      const results: Uint8Array[] = [];
      for (const el of v) results.push(...extractAllBytes(el));
      return results;
    }
    if (typeof obj.length === "number" && obj.length > 0) {
      const results: Uint8Array[] = [];
      for (let i = 0; i < obj.length; i++) results.push(...extractAllBytes(obj[i]));
      return results;
    }

    const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) {
      if (typeof obj[keys[0]] === "number") {
        const bytes = new Uint8Array(keys.length);
        for (let i = 0; i < keys.length; i++) bytes[i] = obj[keys[i]] ?? 0;
        return [bytes];
      }
      const results: Uint8Array[] = [];
      for (let i = 0; i < keys.length; i++) results.push(...extractAllBytes(obj[keys[i]]));
      return results;
    }
  }

  return [];
}

// ── Minimal msgpack parser ────────────────────────────────────────────────────
type MsgVal = any;
interface Parsed { value: MsgVal; offset: number; }

function parseMsgpack(buf: Uint8Array, offset: number): Parsed {
  if (offset >= buf.length) throw new Error(`msgpack offset ${offset} out of bounds`);
  const t = buf[offset++];

  if ((t & 0x80) === 0x00) return { value: t, offset };
  if ((t & 0xe0) === 0xe0) return { value: t - 256, offset };

  if ((t & 0xf0) === 0x80) {
    const n = t & 0x0f;
    const map: Record<string, MsgVal> = {};
    for (let i = 0; i < n; i++) {
      const k = parseMsgpack(buf, offset); offset = k.offset;
      const v = parseMsgpack(buf, offset); offset = v.offset;
      map[String(k.value)] = v.value;
    }
    return { value: map, offset };
  }

  if ((t & 0xf0) === 0x90) {
    const n = t & 0x0f;
    const arr: MsgVal[] = [];
    for (let i = 0; i < n; i++) {
      const v = parseMsgpack(buf, offset); offset = v.offset;
      arr.push(v.value);
    }
    return { value: arr, offset };
  }

  if ((t & 0xe0) === 0xa0) {
    const n = t & 0x1f;
    return { value: Buffer.from(buf.subarray(offset, offset + n)).toString("utf8"), offset: offset + n };
  }

  switch (t) {
    case 0xc0: return { value: null,  offset };
    case 0xc2: return { value: false, offset };
    case 0xc3: return { value: true,  offset };
    case 0xc4: { const n = buf[offset++]; return { value: buf.subarray(offset, offset + n), offset: offset + n }; }
    case 0xc5: { const n = (buf[offset] << 8) | buf[offset + 1]; offset += 2; return { value: buf.subarray(offset, offset + n), offset: offset + n }; }
    case 0xc6: { const n = ((buf[offset]<<24)|(buf[offset+1]<<16)|(buf[offset+2]<<8)|buf[offset+3])>>>0; offset+=4; return { value: buf.subarray(offset, offset + n), offset: offset + n }; }
    case 0xca: return { value: 0, offset: offset + 4 };
    case 0xcb: return { value: 0, offset: offset + 8 };
    case 0xcc: return { value: buf[offset], offset: offset + 1 };
    case 0xcd: { const v = (buf[offset]<<8)|buf[offset+1]; return { value: v, offset: offset+2 }; }
    case 0xce: { const v = ((buf[offset]<<24)|(buf[offset+1]<<16)|(buf[offset+2]<<8)|buf[offset+3])>>>0; return { value: v, offset: offset+4 }; }
    case 0xd0: { const v = buf[offset]; return { value: v > 127 ? v - 256 : v, offset: offset+1 }; }
    case 0xd1: { const v = (buf[offset]<<8)|buf[offset+1]; return { value: v > 32767 ? v - 65536 : v, offset: offset+2 }; }
    case 0xd2: { const v = (buf[offset]<<24)|(buf[offset+1]<<16)|(buf[offset+2]<<8)|buf[offset+3]; return { value: v, offset: offset+4 }; }
    case 0xd9: { const n = buf[offset++]; return { value: Buffer.from(buf.subarray(offset, offset+n)).toString("utf8"), offset: offset+n }; }
    case 0xda: { const n = (buf[offset]<<8)|buf[offset+1]; offset+=2; return { value: Buffer.from(buf.subarray(offset, offset+n)).toString("utf8"), offset: offset+n }; }
    case 0xdb: { const n = ((buf[offset]<<24)|(buf[offset+1]<<16)|(buf[offset+2]<<8)|buf[offset+3])>>>0; offset+=4; return { value: Buffer.from(buf.subarray(offset, offset+n)).toString("utf8"), offset: offset+n }; }
    case 0xdc: { const n=(buf[offset]<<8)|buf[offset+1]; offset+=2; const arr:MsgVal[]=[]; for(let i=0;i<n;i++){const v=parseMsgpack(buf,offset);offset=v.offset;arr.push(v.value);} return {value:arr,offset}; }
    case 0xde: { const n=(buf[offset]<<8)|buf[offset+1]; offset+=2; const m:Record<string,MsgVal>={}; for(let i=0;i<n;i++){const k=parseMsgpack(buf,offset);offset=k.offset;const v=parseMsgpack(buf,offset);offset=v.offset;m[String(k.value)]=v.value;} return {value:m,offset}; }
    case 0xdf: { const n=((buf[offset]<<24)|(buf[offset+1]<<16)|(buf[offset+2]<<8)|buf[offset+3])>>>0;offset+=4; const m:Record<string,MsgVal>={}; for(let i=0;i<n;i++){const k=parseMsgpack(buf,offset);offset=k.offset;const v=parseMsgpack(buf,offset);offset=v.offset;m[String(k.value)]=v.value;} return {value:m,offset}; }
    default: throw new Error(`Unknown msgpack type 0x${t.toString(16)} at offset ${offset-1}`);
  }
}

// ── Parse one binary WebSocket frame ─────────────────────────────────────────
interface ChunkResult {
  tokenId:        string;
  opusBytesArray: Uint8Array[];
  transcription:  string | null;
  chunkNumber:    number | null;
  isEnd:          boolean;
  headerMessage:  string | null;
}

function parseFrame(raw: Uint8Array): ChunkResult {
  const result: ChunkResult = {
    tokenId: "", opusBytesArray: [],
    transcription: null, chunkNumber: null,
    isEnd: false, headerMessage: null,
  };

  try {
    const parsed = parseMsgpack(raw, 0);
    const arr = parsed.value as MsgVal[];
    if (!Array.isArray(arr) || arr.length < 2) return result;

    if (typeof arr[0] === "string") {
      result.tokenId = arr[0];
    } else {
      const tb = extractAllBytes(arr[0]);
      if (tb.length > 0) result.tokenId = Buffer.from(tb[0]).toString("utf8");
    }

    const meta = arr[1] as Record<string, MsgVal>;
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return result;

    if (typeof meta["chunk_number"] === "number") result.chunkNumber = meta["chunk_number"] as number;
    if (meta["isEnd"] === true) result.isEnd = true;

    const hm = meta["header_message"];
    if (typeof hm === "string" && hm.trim()) result.headerMessage = hm.trim();

    const tx = meta["transcription"];
    if (typeof tx === "string" && tx.trim()) result.transcription = tx.trim();

    const audioRaw = meta["audio_data"];
    if (audioRaw != null) {
      const bytesArray = extractAllBytes(audioRaw);
      if (bytesArray.length > 0) result.opusBytesArray = bytesArray;
    }
  } catch (err) {
    console.error("❌ parseFrame error:", err);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
class StormeeServiceRN {
  private socket:    WebSocket | null = null;
  private state:     StreamingState   = StreamingState.IDLE;
  private handlers:  EventHandlers    = {};
  public  isConnected = false;

  // Reconnection
  private reconnectAttempts    = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay       = 1000;
  private isUserStopped        = false;

  // Session / query tracking
  private pendingSessionId    = "";
  private chunkCounter        = 0;
  private currentResumptionToken = "";  // Last ack'd token — sent on resume
  private lastRequestPayload: object | null = null; // Re-sent on reconnect
  private lastRequestId       = "";     // Reused on reconnect

  // Promise handles for connect()
  private connectResolve: (() => void)       | null = null;
  private connectReject:  ((e: any) => void) | null = null;

  // Ordered audio playback queue (Promise chain)
  private playbackQueue: Promise<void> = Promise.resolve();

  // Inactivity ping (mirrors WebSocketManager.startWaitingForResponse)
  private inactivityTimer:          ReturnType<typeof setTimeout> | null = null;
  private waitingForInitialResponse = false;

  // 🚀 Chat Tracking
  private currentTranscription = "";

  private readonly WS_BASE_URL = "wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws";

  // ── Public API ──────────────────────────────────────────────────────────────

  setEventHandlers(h: EventHandlers) { this.handlers = h; }

  async initialize() {
    console.log("🎵 Initializing audio engine…");
    await StormeeAudioModule.initialize();
    console.log("✅ Audio engine ready");
  }

  getState() { return this.state; }

  connect(sessionId: string): Promise<void> {
    if (this.isConnected && this.pendingSessionId === sessionId && this.socket) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.pendingSessionId  = sessionId;
      this.state             = StreamingState.CONNECTING;
      this.connectResolve    = resolve;
      this.connectReject     = reject;
      this.isUserStopped     = false;
      this.reconnectAttempts = 0;

      if (this.socket) { this.socket.close(); this.socket = null; }

      this._openSocket();
    });
  }

  async sendInitWithQuery(userQuery: string): Promise<void> {
    if (!this.socket || !this.isConnected) {
      throw new Error("Not connected — call connect() first");
    }

    // ── 1. End the previous query stream (idempotent if nothing was running) ──
    this._sendJSON({ end_current_query_stream: true });

    // ── 2. Reset per-query state ──────────────────────────────────────────────
    this.isUserStopped         = false;
    this.chunkCounter          = 0;
    this.playbackQueue         = Promise.resolve();
    this.waitingForInitialResponse = false;
    this.clearInactivityTimer();

    // 🚀 Reset UI Transcription State
    this.currentTranscription = ""; 
    this.handlers.onTranscription?.("", 0);

    // Reset audio module for a clean slate
    try { await StormeeAudioModule.resetForNewQuery?.(); } catch (_) {}

    // ── 3. Build payload ───────────────────────────────────────────────────────
    const isResume       = !!this.currentResumptionToken;
    const requestId      = isResume && this.lastRequestId
      ? this.lastRequestId
      : `requestId-${this._uuid()}`;
    this.lastRequestId   = requestId;

    // 🚀 Grab current conversation history from Zustand
    const currentHistory = useChatHistoryStore.getState().chatHistory;

    const payload = {
      concierge_name: "stormee",
      request_id:     requestId,
      agent_arguments: { user_query: userQuery },
      
      // 🚀 Inject history
      chat_history:   currentHistory, 
      
      metadata: JSON.stringify({
        // 🚀 Inject history into metadata
        chat_history: currentHistory, 
        rlef_id: "", mode_parameters: {}, mongo_db_id: "",
        template_name:   "open_brainstorming", context: "",
        user_id:         "68fbb9ec1fff8606d6b61b93",
        project_id:      "69948177cb0b34761aa56e0e",
        delay_on_initial_message: 0,
        query_number:    "-1",
        userEmailId:     "vikas.as@techolution.com",
        userName:        "Vikas A S",
        modeName:        "BrainStorm Mode",
      }),
      session_id:       this.pendingSessionId,
      query_number:     "-1",
      resumption_token: this.currentResumptionToken, 
    };

    this.lastRequestPayload    = payload as any;
    this.currentResumptionToken = "";

    this.state = StreamingState.STREAMING;
    this._sendJSON(payload);

    this.waitingForInitialResponse = true;
    this.startInactivityTimer();
    this.handlers.onStreamStart?.();
  }

  stopStreaming(): void {
    this.isUserStopped              = true;
    this.waitingForInitialResponse  = false;
    this.clearInactivityTimer();
    this.currentResumptionToken     = "";
    this.lastRequestPayload         = null;
    this.lastRequestId              = "";

    this._sendJSON({ end_current_query_stream: true });

    this.state = StreamingState.CONNECTED;
    this.handlers.onStreamEnd?.();

    try { StormeeAudioModule.stopPlayback?.(); } catch (_) {}
    this.playbackQueue = Promise.resolve();
  }

  disconnect(): void {
    this.isUserStopped = true;
    this.waitingForInitialResponse = false;
    this.clearInactivityTimer();
    if (this.socket) { this.socket.close(); this.socket = null; }
    this.isConnected = false;
    this.state       = StreamingState.IDLE;
    this.handlers.onDisconnect?.();
  }

  async playWAVFile() { return StormeeAudioModule.playWAVFile(); }

  private startInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      if (this.isConnected && this.waitingForInitialResponse) {
        console.log("📡 No data for 10 s — sending ping");
        this._sendJSON({ ping: true });
        this.startInactivityTimer(); 
      }
    }, INACTIVITY_PING_INTERVAL);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private _openSocket(): void {
    try {
      const ws = new WebSocket(`${this.WS_BASE_URL}/${this.pendingSessionId}`);
      (ws as any).binaryType = "arraybuffer";
      this.socket = ws;

      ws.onopen = () => {
        this.isConnected      = true;
        this.state            = StreamingState.CONNECTED;
        this.reconnectAttempts = 0;
        this.connectResolve?.();
        this.connectResolve = this.connectReject = null;
        this.handlers.onConnect?.();

        if (this.lastRequestPayload && !this.isUserStopped) {
          this._resumeAfterReconnect();
        }
      };

      ws.onmessage = async (e: any) => { await this._handleMessage(e); };

      ws.onerror = (err: any) => {
        this.state = StreamingState.ERROR;
        this.connectReject?.(err);
        this.connectResolve = this.connectReject = null;
        this.handlers.onError?.(err);
      };

      ws.onclose = (_e: any) => {
        this.isConnected = false;
        this.connectReject?.(new Error("WS closed"));
        this.connectResolve = this.connectReject = null;
        this.clearInactivityTimer();

        if (!this.isUserStopped && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.state = StreamingState.RECONNECTING;
          this.handlers.onReconnecting?.(this.reconnectAttempts);
          setTimeout(() => this._openSocket(), this.reconnectDelay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.state = StreamingState.IDLE;
          this.handlers.onReconnectFailed?.();
        } else {
          this.state = StreamingState.IDLE;
          this.handlers.onDisconnect?.();
        }
      };
    } catch (err) {
      this.state = StreamingState.ERROR;
      this.connectResolve = this.connectReject = null;
      this.handlers.onError?.(err);
    }
  }

  private _resumeAfterReconnect(): void {
    if (!this.lastRequestPayload) return;

    const payload = {
      ...(this.lastRequestPayload as any),
      request_id:      this.lastRequestId,
      resumption_token: this.currentResumptionToken,
    };

    console.log("🔄 Resuming stream after reconnect, token:", this.currentResumptionToken || "(none)");

    this.chunkCounter  = 0;
    this.playbackQueue = Promise.resolve();
    this.state         = StreamingState.STREAMING;
    this.isUserStopped = false;

    this._sendJSON(payload);

    this.waitingForInitialResponse = true;
    this.startInactivityTimer();

    this.handlers.onReconnected?.();
  }

  private async _handleMessage(event: any): Promise<void> {
    if (!event.data) return;

    try {
      if (event.data instanceof ArrayBuffer) {
        if (this.isUserStopped) return;

        const payload = new Uint8Array(event.data);
        if (payload.length === 0) return;

        this._resetInactivityTimer();

        let parsed: ReturnType<typeof parseMsgpack>;
        try {
          parsed = parseMsgpack(payload, 0);
        } catch (e) {
          console.error("🚨 Failed to unpack MessagePack:", e);
          return;
        }

        const tokenId    = parsed.value[0];
        const chunkObject = parsed.value[1];
        if (!chunkObject) return;

        this.chunkCounter++;

        if (tokenId) {
          const tokenStr = typeof tokenId === "string"
            ? tokenId
            : Buffer.from(tokenId).toString("utf8");
          this.currentResumptionToken = tokenStr;
          this._sendAck(tokenStr);
        }

        // Transcription
        if (chunkObject.transcription) {
          const tx: string = chunkObject.transcription;
          if (!tx.startsWith("{") && !tx.includes("<cognitive")) {
            this.currentTranscription = tx; // 🚀 Keep track of the transcription string
            this.handlers.onTranscription?.(tx, this.chunkCounter);
          }
        }

        if (chunkObject.header_message) {
          this.handlers.onHeaderMessage?.(chunkObject.header_message);
        }

        // Audio frames
        if (chunkObject.audio_data) {
          const frames = extractAllBytes(chunkObject.audio_data);
          if (frames.length > 0) {
            console.log(`📦 ${frames.length} Opus frame(s) in chunk #${this.chunkCounter}`);
            for (const frame of frames) {
              await this._enqueueAudioFrame(frame);
            }
          }
        }

        // Stream end
        if (chunkObject.isEnd) {
          
          // 🚀 1. Push final transcription to Zustand store
          if (this.currentTranscription.trim().length > 0) {
            useChatHistoryStore.getState().addAssistantMessage(this.currentTranscription.trim());
          }
          
          // 🚀 2. Unlock the UI input
          useChatHistoryStore.getState().setIsStormeeThinking(false);

          this.playbackQueue = this.playbackQueue.then(async () => {
            try { await StormeeAudioModule.processAccumulatedAudio(); } catch (_) {}
          });

          this.playbackQueue = this.playbackQueue.then(() => {
            this.state                     = StreamingState.CONNECTED;
            this.waitingForInitialResponse = false;
            this.clearInactivityTimer();
            this.lastRequestPayload        = null;
            this.lastRequestId             = "";
            this.currentResumptionToken    = "";
            this._sendJSON({ end_current_query_stream: true });
            this.handlers.onStreamEnd?.();
          });
        }

        this.handlers.onChunkProcessed?.(chunkObject);

      } else if (typeof event.data === "string") {
        this._resetInactivityTimer();
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.ack) return;
        await this._processJSON(data);
      }
    } catch (err) {
      this.handlers.onError?.(err);
    }
  }

  private async _processJSON(data: any): Promise<void> {
    switch (data.type) {
      case "stream_started":
        this.chunkCounter  = 0;
        this.playbackQueue = Promise.resolve();
        this.handlers.onStreamStart?.();
        break;
      case "stream_stopped":
        await this.playbackQueue;
        this.state = StreamingState.CONNECTED;
        this.handlers.onStreamEnd?.();
        break;
      case "error":
        this.state = StreamingState.ERROR;
        this.handlers.onError?.(new Error(data.message || "Server error"));
        break;
    }
  }

  private async _enqueueAudioFrame(opusBytes: Uint8Array): Promise<void> {
    const b64 = Buffer.from(opusBytes).toString("base64");
    this.playbackQueue = this.playbackQueue.then(async () => {
      try { await StormeeAudioModule.writeAudioFrame(b64); } catch (_) {}
    });
    this.handlers.onAudioChunk?.(opusBytes, this.chunkCounter);
  }

  private _sendAck(tokenId: string): void {
    if (!tokenId) return;
    this._sendJSON({ ack: tokenId });
  }

  private _sendJSON(obj: object): void {
    if (!this.socket || !this.isConnected) return;
    try { this.socket.send(JSON.stringify(obj)); } catch (_) {}
  }

  private _resetInactivityTimer(): void {
    if (this.waitingForInitialResponse) {
      this.startInactivityTimer(); 
    }
  }

  private _uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export default new StormeeServiceRN();