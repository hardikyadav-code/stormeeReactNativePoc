// src/services/stormee/StormeeServiceRN.ts

import { Buffer } from "buffer";
import { NativeModules } from "react-native";

;(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

const { StormeeAudioModule } = NativeModules;

export enum StreamingState {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  STREAM_STARTING = "STREAM_STARTING",
  STREAMING = "STREAMING",
  BUFFERING = "BUFFERING",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
}

type EventHandlers = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onTranscription?: (text: string, chunkNumber?: number) => void;
  onAudioChunk?: (bytes: Uint8Array, chunkNumber?: number) => void;
  onError?: (err: any) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onHeaderMessage?: (message: string) => void;
  onChunkProcessed?: (chunk: any) => void;
};

class StormeeServiceRN {
  // WebSocket and state
  private socket: WebSocket | null = null;
  private state: StreamingState = StreamingState.IDLE;
  private handlers: EventHandlers = {};
  public isConnected = false;

  // Reconnection logic
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingSessionId: string = "";

  // Stream management
  private isUserStopped: boolean = false;
  private lastRequest: any = null;
  private lastRequestId: string = "";
  private chunkCounter: number = 0;

  // ✅ AUDIO BUFFERING
  private audioBuffer: Uint8Array[] = [];
  private totalAudioBytes: number = 0;
  private bufferedChunkCount: number = 0;

  // Hardcoded WebSocket base URL (session ID will be appended to path)
  private readonly WS_BASE_URL = "wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws";

  setEventHandlers(handlers: EventHandlers) {
    this.handlers = handlers;
  }

  async initialize() {
    console.log("🎵 Starting initialization...");
    try {
      await StormeeAudioModule.initialize();
      console.log("✅ Service initialized");
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      throw error;
    }
  }

  getState(): StreamingState {
    return this.state;
  }

  connect(sessionId: string, _wsUrl?: string) {
    this.pendingSessionId = sessionId;
    const finalUrl = `${this.WS_BASE_URL}/${sessionId}`;

    console.log(`🔌 Connecting to ${this.WS_BASE_URL}...`);
    console.log(`📋 Session ID: ${sessionId}`);
    console.log(`📡 Final URL: ${finalUrl}`);

    this.state = StreamingState.CONNECTING;

    try {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }

      this.socket = new WebSocket(finalUrl);
      (this.socket as any).binaryType = "arraybuffer";

      this.socket.onopen = () => {
        console.log("✅ WebSocket Connected");
        this.isConnected = true;
        this.state = StreamingState.CONNECTED;
        this.reconnectAttempts = 0;
        this.isUserStopped = false;

        // ✅ Reset audio buffer for new stream
        this.audioBuffer = [];
        this.totalAudioBytes = 0;
        this.bufferedChunkCount = 0;

        if (this.handlers.onConnect) {
          this.handlers.onConnect();
        }
      };

      this.socket.onmessage = async (event: any) => {
        await this.handleMessage(event);
      };

      this.socket.onerror = (err: any) => {
        console.error("🚨 WebSocket Error:", err);
        this.state = StreamingState.ERROR;

        if (this.handlers.onError) {
          this.handlers.onError(err);
        }
      };

      this.socket.onclose = (event: any) => {
        console.log("❌ WebSocket Closed");
        console.log(`Close Code: ${event.code}, Reason: ${event.reason}`);

        this.isConnected = false;

        if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isUserStopped) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000);

          console.log(
            `🔄 Reconnecting... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) ` +
            `waiting ${delay}ms`
          );

          this.state = StreamingState.RECONNECTING;

          setTimeout(() => {
            this.connect(this.pendingSessionId);
          }, delay);
        } else {
          console.error(
            `❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached or user stopped.`
          );
          this.state = StreamingState.IDLE;

          if (this.handlers.onDisconnect) {
            this.handlers.onDisconnect();
          }
        }
      };
    } catch (error) {
      console.error("❌ Connection failed:", error);
      this.state = StreamingState.ERROR;

      if (this.handlers.onError) {
        this.handlers.onError(error);
      }
    }
  }

  disconnect() {
    console.log("🔌 Disconnecting...");
    this.isUserStopped = true;
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.isConnected = false;
    this.state = StreamingState.IDLE;
  }

  sendInitWithQuery(userQuery: string) {
    if (!this.socket || !this.isConnected) {
      console.error("❌ Not connected. Call connect() first.");
      return;
    }

    console.log("📤 Sending query:", userQuery);
    this.state = StreamingState.STREAM_STARTING;

    this.isUserStopped = false;
    this.chunkCounter = 0;

    const payload = {
      concierge_name: "stormee",
      request_id: `requestId-${this.generateUUID()}`,
      agent_arguments: {
        user_query: userQuery,
      },
      chat_history: [],
      metadata: JSON.stringify({
        chat_history: [],
        rlef_id: "",
        mode_parameters: {},
        mongo_db_id: "",
        template_name: "open_brainstorming",
        context: "",
        user_id: "68fbb9ec1fff8606d6b61b93",
        project_id: "69948177cb0b34761aa56e0e",
        delay_on_initial_message: 0,
        query_number: "-1",
        userEmailId: "vikas.as@techolution.com",
        userName: "Vikas A S",
        modeName: "BrainStorm Mode",
      }),
      session_id: this.generateUUID(),
      query_number: "-1",
      resumption_token: "",
    };

    this.lastRequest = payload;
    this.lastRequestId = payload.request_id;

    try {
      const payloadStr = JSON.stringify(payload);
      console.log(`📊 Sending payload: ${payloadStr.length} bytes`);

      this.socket.send(payloadStr);
      console.log("✅ Query sent successfully");
    } catch (error) {
      console.error("❌ Failed to send query:", error);
      this.state = StreamingState.ERROR;

      if (this.handlers.onError) {
        this.handlers.onError(error);
      }
    }
  }

  private async handleMessage(event: any) {
    if (!event.data) return;

    try {
      if (event.data instanceof ArrayBuffer) {
        if (this.isUserStopped) {
          console.log("[MESSAGE] Discarding audio chunk - user stopped");
          return;
        }

        await this.bufferAudioChunk(event.data);
      } else if (typeof event.data === "string") {
        try {
          const jsonData = JSON.parse(event.data);
          console.log("📨 Received JSON:", jsonData);

          await this.processJSONMessage(jsonData);
        } catch (parseError) {
          console.warn("⚠️ Could not parse JSON:", event.data);
        }
      }
    } catch (error) {
      console.error("🚨 Error handling message:", error);
      this.state = StreamingState.ERROR;

      if (this.handlers.onError) {
        this.handlers.onError(error);
      }
    }
  }

  // ✅ NEW: Buffer audio chunks
  // Add this to your StormeeServiceRN.ts - REPLACE the bufferAudioChunk function

  // ✅ Auto-play timer
  private autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_PLAY_DELAY = 2000; // 2 seconds after last chunk

  private async bufferAudioChunk(data: ArrayBuffer): Promise<void> {
    try {
      this.chunkCounter++;
      const uint8Array = new Uint8Array(data);

      console.log("🎵 Received audio chunk:", {
        chunkNumber: this.chunkCounter,
        size: uint8Array.length,
        bytes: `${uint8Array.length} bytes`,
      });

      // Skip empty chunks
      if (uint8Array.length === 0) {
        console.log("⏭️ Skipping empty chunk");
        return;
      }

      // Skip first metadata chunk
      if (this.chunkCounter === 1) {
        console.log("⏭️ Skipping chunk 1 (metadata)");
        return;
      }

      this.state = StreamingState.STREAMING;

      // ✅ Add to buffer
      this.audioBuffer.push(uint8Array);
      this.totalAudioBytes += uint8Array.length;
      this.bufferedChunkCount++;

      console.log(`📦 Buffered chunk ${this.bufferedChunkCount}: ${uint8Array.length} bytes (Total: ${this.totalAudioBytes} bytes)`);

      // ✅ Clear previous timer
      if (this.autoPlayTimer) {
        clearTimeout(this.autoPlayTimer);
        console.log("⏱️ Resetting auto-play timer...");
      }

      // ✅ Set new timer - play after 2 seconds of silence (no new chunks)
      this.autoPlayTimer = setTimeout(async () => {
        console.log("⏱️ Auto-play timer expired - playing buffered audio!");
        await this.playBufferedAudio();
      }, this.AUTO_PLAY_DELAY);

      if (this.handlers.onAudioChunk) {
        this.handlers.onAudioChunk(uint8Array, this.chunkCounter);
      }

      if (this.handlers.onChunkProcessed) {
        this.handlers.onChunkProcessed({
          chunkNumber: this.chunkCounter,
          size: uint8Array.length,
        });
      }
    } catch (error) {
      console.error("❌ Error buffering audio chunk:", error);
    }
  }

  async playWAVFile(): Promise<string> {
  console.log("🧪 [TEST] Calling playWAVFile from service...");
  try {
    const result = await StormeeAudioModule.playWAVFile();
    console.log("✅ WAV playback result:", result);
    return result;
  } catch (error) {
    console.error("❌ WAV playback failed:", error);
    throw error;
  }
}

  // ✅ Also add this to the processJSONMessage function

  private async processJSONMessage(data: any): Promise<void> {
    const messageType = data.type;

    switch (messageType) {
      case "error":
        console.error("🚨 Server error:", data.message);
        this.state = StreamingState.ERROR;

        if (this.handlers.onError) {
          this.handlers.onError(new Error(data.message || "Server error"));
        }
        break;

      case "stream_started":
        console.log("📍 Stream started");
        this.state = StreamingState.STREAMING;

        if (this.handlers.onStreamStart) {
          this.handlers.onStreamStart();
        }
        break;

      case "stream_stopped":
        console.log("📍 Stream stopped (from backend)");
        this.state = StreamingState.CONNECTED;

        // ✅ Clear timer and play immediately
        if (this.autoPlayTimer) {
          clearTimeout(this.autoPlayTimer);
        }
        await this.playBufferedAudio();

        try {
          await StormeeAudioModule.stop();
          console.log("⏹️ Audio stopped");
        } catch (stopError) {
          console.error("❌ Stop audio error:", stopError);
        }

        if (this.handlers.onStreamEnd) {
          this.handlers.onStreamEnd();
        }
        break;

      default:
        console.log("📨 Unknown message type:", messageType);
    }
  }

  // ✅ NEW: Combine all buffered chunks and send to Swift
  async playBufferedAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      console.warn("⚠️ No audio buffered");
      return;
    }

    try {
      console.log(`🎵 Combining ${this.bufferedChunkCount} chunks (${this.totalAudioBytes} bytes)...`);

      // Combine all chunks into one buffer
      const combinedBuffer = new Uint8Array(this.totalAudioBytes);
      let offset = 0;

      for (const chunk of this.audioBuffer) {
        combinedBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      console.log(`✅ Combined buffer ready: ${combinedBuffer.length} bytes`);

      // Convert to Base64
      const base64Data = Buffer.from(combinedBuffer).toString("base64");
      console.log(`📝 Base64 encoded: ${base64Data.length} characters`);

      // Send once to native module
      console.log("📤 Sending combined audio to native module...");
      const result = await StormeeAudioModule.writeAudioFrame(base64Data);
      console.log(`✅ Audio sent to native module! Result: ${result}`);

      // Clear buffer
      this.audioBuffer = [];
      this.totalAudioBytes = 0;
      this.bufferedChunkCount = 0;

    } catch (error) {
      console.error("❌ Error playing buffered audio:", error);
      this.state = StreamingState.ERROR;

      if (this.handlers.onError) {
        this.handlers.onError(error);
      }
    }
  }

  

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export default new StormeeServiceRN();