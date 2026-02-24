// src/services/stormee/useStormeeRN.ts

import { useEffect, useRef, useState } from "react";
import { StormeeClientRN } from "./ StormeeClient";

export function useStormeeRN(visible: boolean) {
  const [transcription, setTranscription] = useState("");
  const [connected, setConnected] = useState(false);

  const clientRef = useRef<StormeeClientRN | null>(null);

  const WS_URL =
    "wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws";
  const SESSION_ID = "3b309fad-aefb-42d4-8fdc-7e794f24e14b";

  // ✅ Create the client once on mount
  useEffect(() => {
    clientRef.current = new StormeeClientRN({
      wsUrl: WS_URL,
      sessionId: SESSION_ID,
      onTranscription: (text) => setTranscription(text),
      onError: (err) => console.error("[useStormeeRN] Error:", err),
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    });

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  // ✅ Connect / disconnect based on modal visibility
  useEffect(() => {
    if (!visible) return;
    if (!clientRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        console.log("[useStormeeRN] Connecting...");
        await clientRef.current?.connect();

        if (cancelled) return;

        console.log("[useStormeeRN] Connected ✅");
        setConnected(true);
      } catch (e) {
        if (!cancelled) {
          console.error("[useStormeeRN] Connect failed:", e);
          setConnected(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      console.log("[useStormeeRN] Disconnecting...");
      clientRef.current?.disconnect();
      setConnected(false);
    };
  }, [visible]);

  const send = async (text: string) => {
    if (!clientRef.current) {
      console.warn("[useStormeeRN] send() called but client is not ready");
      return;
    }
    await clientRef.current.startStreaming(text);
  };

  return {
    transcription,
    connected,
    send,
  };
}