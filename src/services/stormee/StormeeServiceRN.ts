// StormeeServiceRN.ts

import { Buffer } from "buffer";
import { NativeModules } from "react-native";

;(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

const { StormeeAudioModule } = NativeModules;

export enum StreamingState {
  IDLE       = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED  = "CONNECTED",
  STREAMING  = "STREAMING",
  RECONNECTING = "RECONNECTING",
  ERROR      = "ERROR",
}

type EventHandlers = {
  onConnect?:        () => void;
  onDisconnect?:     () => void;
  onTranscription?:  (text: string, chunkNumber?: number) => void;
  onAudioChunk?:     (bytes: Uint8Array, chunkNumber?: number) => void;
  onError?:          (err: any) => void;
  onStreamStart?:    () => void;
  onStreamEnd?:      () => void;
  onHeaderMessage?:  (message: string) => void;
  onChunkProcessed?: (chunk: any) => void;
};

// ── Hermes-safe binary extraction ────────────────────────────────────────────
function extractBytes(v: unknown): Uint8Array | null {
  if (v == null) return null;

  // Already a proper typed array
  if (v instanceof Uint8Array) return v.length > 0 ? v : null;
  if (ArrayBuffer.isView(v)) {
    const b = v as ArrayBufferView;
    return b.byteLength > 0 ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null;
  }

  // Base64 string
  if (typeof v === "string") {
    if (!v.length) return null;
    try {
      const d = Buffer.from(v, "base64");
      return d.length > 0 ? new Uint8Array(d) : null;
    } catch { return null; }
  }

  if (typeof v === "object") {
    // Array of numbers or array wrapping a typed array
    if (Array.isArray(v)) {
      if (!v.length) return null;
      if (typeof v[0] === "number") return new Uint8Array(v as number[]);
      // Array wrapping one binary value: [Uint8Array(N)]
      for (const el of v) {
        const inner = extractBytes(el);
        if (inner) return inner;
      }
      return null;
    }

    // KEY FIX FOR HERMES:
    // Object.keys(Uint8Array) returns [] in Hermes — useless.
    // But .length and v[i] always work on any array-like object including Uint8Array.
    const obj = v as any;
    if (typeof obj.length === "number" && obj.length > 0) {
      if (typeof obj[0] === "number") {
        const bytes = new Uint8Array(obj.length);
        for (let i = 0; i < obj.length; i++) bytes[i] = obj[i] ?? 0;
        return bytes;
      }
      // length > 0 but first element isn't a number — try recursing on element 0
      const inner = extractBytes(obj[0]);
      if (inner) return inner;
    }

    // Last resort: plain object with numeric string keys {"0":104,"1":11,...}
    const keys = Object.keys(obj).filter(k => !isNaN(Number(k)))
                                  .sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) {
      const bytes = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) bytes[i] = obj[keys[i]] ?? 0;
      return bytes;
    }
  }

  return null;
}

// ── Minimal msgpack parser ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MsgVal = any;
interface Parsed { value: MsgVal; offset: number; }

function parseMsgpack(buf: Uint8Array, offset: number): Parsed {
  if (offset >= buf.length) throw new Error(`msgpack offset ${offset} out of bounds`);
  const t = buf[offset++];

  if ((t & 0x80) === 0x00) return { value: t, offset };           // pos fixint
  if ((t & 0xe0) === 0xe0) return { value: t - 256, offset };      // neg fixint

  if ((t & 0xf0) === 0x80) {                                        // fixmap
    const n = t & 0x0f;
    const map: Record<string, MsgVal> = {};
    for (let i = 0; i < n; i++) {
      const k = parseMsgpack(buf, offset); offset = k.offset;
      const v = parseMsgpack(buf, offset); offset = v.offset;
      map[String(k.value)] = v.value;
    }
    return { value: map, offset };
  }

  if ((t & 0xf0) === 0x90) {                                        // fixarray
    const n = t & 0x0f;
    const arr: MsgVal[] = [];
    for (let i = 0; i < n; i++) {
      const v = parseMsgpack(buf, offset); offset = v.offset;
      arr.push(v.value);
    }
    return { value: arr, offset };
  }

  if ((t & 0xe0) === 0xa0) {                                        // fixstr
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

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────
class StormeeServiceRN {
  private socket:    WebSocket | null = null;
  private state:     StreamingState   = StreamingState.IDLE;
  private handlers:  EventHandlers    = {};
  public  isConnected = false;

  private reconnectAttempts   = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay       = 1000;
  private pendingSessionId     = "";
  private isUserStopped        = false;
  private chunkCounter         = 0;

  private connectResolve: (() => void)       | null = null;
  private connectReject:  ((e: any) => void) | null = null;
  private playbackQueue: Promise<void> = Promise.resolve();

  private readonly WS_BASE_URL =
    "wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws";

  setEventHandlers(h: EventHandlers) { this.handlers = h; }

  async initialize() {
    console.log("🎵 Initializing...");
    await StormeeAudioModule.initialize();
    console.log("✅ Audio engine ready");
  }

  getState() { return this.state; }

  // ── Connect ───────────────────────────────────────────────────────────────
  connect(sessionId: string): Promise<void> {
    if (this.isConnected && this.pendingSessionId === sessionId && this.socket) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.pendingSessionId = sessionId;
      console.log(`🔌 Connecting: ${this.WS_BASE_URL}/${sessionId}`);
      this.state            = StreamingState.CONNECTING;
      this.connectResolve   = resolve;
      this.connectReject    = reject;
      this.isUserStopped    = false;
      this.reconnectAttempts = 0;
      this.chunkCounter     = 0;
      this.playbackQueue    = Promise.resolve();

      if (this.socket) {
        this.socket.onopen = this.socket.onmessage =
        this.socket.onerror = this.socket.onclose = null;
        this.socket.close();
        this.socket = null;
      }

      try {
        const ws = new WebSocket(`${this.WS_BASE_URL}/${sessionId}`);
        (ws as any).binaryType = "arraybuffer";
        this.socket = ws;

        ws.onopen = () => {
          console.log("✅ WebSocket open");
          this.isConnected = true;
          this.state       = StreamingState.CONNECTED;
          this.reconnectAttempts = 0;
          this.connectResolve?.();
          this.connectResolve = this.connectReject = null;
          this.handlers.onConnect?.();
        };

        ws.onmessage = async (e: any) => { await this.handleMessage(e); };

        ws.onerror = (err: any) => {
          console.error("🚨 WS error:", err);
          this.state = StreamingState.ERROR;
          this.connectReject?.(err);
          this.connectResolve = this.connectReject = null;
          this.handlers.onError?.(err);
        };

        ws.onclose = (e: any) => {
          console.log(`❌ WS closed code=${e.code}`);
          this.isConnected = false;
          this.connectReject?.(new Error(`WS closed before open (code=${e.code})`));
          this.connectResolve = this.connectReject = null;

          if (!this.isUserStopped && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000);
            this.state = StreamingState.RECONNECTING;
            setTimeout(() => this.connect(this.pendingSessionId).catch(console.error), delay);
          } else {
            this.state = StreamingState.IDLE;
            this.handlers.onDisconnect?.();
          }
        };
      } catch (err) {
        this.state = StreamingState.ERROR;
        this.connectResolve = this.connectReject = null;
        reject(err);
        this.handlers.onError?.(err);
      }
    });
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  disconnect() {
    this.isUserStopped = true;
    this.connectReject?.(new Error("User disconnected"));
    this.connectResolve = this.connectReject = null;
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage =
      this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.state       = StreamingState.IDLE;
    this.handlers.onDisconnect?.();
  }

  // ── Send query ────────────────────────────────────────────────────────────
  sendInitWithQuery(userQuery: string) {
    if (!this.socket || !this.isConnected) { console.error("❌ Not connected"); return; }

    this.state         = StreamingState.STREAMING;
    this.isUserStopped = false;
    this.chunkCounter  = 0;
    this.playbackQueue = Promise.resolve();

    const payload = {
      concierge_name: "stormee",
      request_id:     `requestId-${this.generateUUID()}`,
      agent_arguments: { user_query: userQuery },
      chat_history:   [],
      metadata: JSON.stringify({
        chat_history: [], rlef_id: "", mode_parameters: {}, mongo_db_id: "",
        template_name: "open_brainstorming", context: "",
        user_id:      "68fbb9ec1fff8606d6b61b93",
        project_id:   "69948177cb0b34761aa56e0e",
        delay_on_initial_message: 0,
        query_number: "-1",
        userEmailId:  "vikas.as@techolution.com",
        userName:     "Vikas A S",
        modeName:     "BrainStorm Mode",
      }),
      session_id:       this.generateUUID(),
      query_number:     "-1",
      resumption_token: "",
    };

    try {
      this.socket.send(JSON.stringify(payload));
      console.log("✅ Query sent");
    } catch (err) {
      console.error("❌ Send failed:", err);
      this.state = StreamingState.ERROR;
      this.handlers.onError?.(err);
    }
  }

  // ── Send ACK (required — backend uses for flow control) ──────────────────
  private sendAck(tokenId: string) {
    if (!this.socket || !this.isConnected || !tokenId) return;
    try { this.socket.send(JSON.stringify({ ack: tokenId })); }
    catch (err) { console.warn("⚠️ ACK failed:", err); }
  }

  // ── Message handler ───────────────────────────────────────────────────────
  private async handleMessage(event: any) {
    if (!event.data) return;
    
    try {
      if (event.data instanceof ArrayBuffer) {
        if (this.isUserStopped) return;

        const payload = new Uint8Array(event.data);

        // Skip empty keep-alive frames
        if (payload.length === 0) {
            console.log("⏭️ Empty binary frame — skip");
            return;
        }

        try {
          // Unpack the MessagePack envelope
          const parsed = parseMsgpack(payload, 0);
          const tokenId = parsed.value[0];
          const chunkObject = parsed.value[1];

          if (chunkObject) {
            this.chunkCounter++;

            // ACK immediately
            if (tokenId) {
                const tokenStr = typeof tokenId === "string" ? tokenId : Buffer.from(tokenId).toString("utf8");
                this.sendAck(tokenStr);
            }

            // 🎯 Handle Transcription
            if (chunkObject.transcription) {
              const tx = chunkObject.transcription;
              const internal = tx.startsWith("{") ||
                               tx.includes("<cognitive_reasoning>") ||
                               tx.includes("<answerExample");
              if (!internal) {
                console.log(`📝 [${this.chunkCounter}] Transcription:`, tx);
                this.handlers.onTranscription?.(tx, this.chunkCounter);
              }
            }

            if (chunkObject.header_message) {
                this.handlers.onHeaderMessage?.(chunkObject.header_message);
            }

            // 🚀 EXTRACT PURE OPUS USING HERMES-SAFE EXTRACTOR
            if (chunkObject.audio_data) {
              const pureOpusChunk = extractBytes(chunkObject.audio_data);
              
              if (pureOpusChunk && pureOpusChunk.length > 0) {
                 await this.processPureAudioFrame(pureOpusChunk);
              } else {
                 console.log(`⚠️ [${this.chunkCounter}] Audio data exists but extractBytes failed.`);
              }
            }

            // 🎯 Handle Stream End
            if (chunkObject.isEnd) {
              console.log('[🏁 Stormee] Stream ended');
              this.handlers.onStreamEnd?.();
            }
          }
        } catch (unpackError) {
          console.error("🚨 Failed to unpack MessagePack:", unpackError);
        }

      } else if (typeof event.data === "string") {
        try { 
          await this.processJSON(JSON.parse(event.data)); 
        } catch { 
          console.warn("⚠️ Non-JSON:", (event.data as string).slice(0, 80)); 
        }
      }
    } catch (err) {
      console.error("🚨 handleMessage:", err);
      this.handlers.onError?.(err);
    }
  }

  // ── Process Pure Audio Frame ──────────────────────────────────────────────────
  private async processPureAudioFrame(opusBytes: Uint8Array) {
    const toc = opusBytes[0];
    console.log(`🎵 #${this.chunkCounter}: ${opusBytes.length}B Opus | TOC=0x${toc.toString(16)}`);

    // Encode for native bridge
    const b64 = Buffer.from(opusBytes).toString("base64");

    // Queue ensures sequential playback even under async native calls
    this.playbackQueue = this.playbackQueue.then(async () => {
      try {
        const result = await StormeeAudioModule.writeAudioFrame(b64);
        console.log(`✅ #${this.chunkCounter} played: ${result}`);
      } catch (err) {
        console.error(`❌ #${this.chunkCounter} native error:`, err);
      }
    });

    this.handlers.onAudioChunk?.(opusBytes, this.chunkCounter);
    this.handlers.onChunkProcessed?.({ chunkNumber: this.chunkCounter, size: opusBytes.length });
  }

  // ── Process JSON control messages ─────────────────────────────────────────
  private async processJSON(data: any) {
    if (data.ack) return; // ack echo from server — ignore

    switch (data.type) {
      case "stream_started":
        this.chunkCounter  = 0;
        this.playbackQueue = Promise.resolve();
        this.handlers.onStreamStart?.();
        break;
      case "stream_stopped":
        await this.playbackQueue;
        try { await StormeeAudioModule.stop(); } catch { /* ignore */ }
        this.state = StreamingState.CONNECTED;
        this.handlers.onStreamEnd?.();
        break;
      case "error":
        console.error("🚨 Server error:", data.message);
        this.state = StreamingState.ERROR;
        this.handlers.onError?.(new Error(data.message || "Server error"));
        break;
    }
  }

  async playWAVFile() { return StormeeAudioModule.playWAVFile(); }

  private generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export default new StormeeServiceRN();
