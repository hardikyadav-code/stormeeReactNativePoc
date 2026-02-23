// src/services/stormee/useStormeeRN.ts

import { useEffect, useRef, useState } from "react";
import { StormeeClientRN } from "./ StormeeClient"
import StormeeServiceRN from "./StormeeServiceRN";

export function useStormeeRN(visible: boolean) {
  const [transcription, setTranscription] = useState("");
  const [connected, setConnected] = useState(false);

  const clientRef = useRef<StormeeClientRN | null>(null);

  // IMPORTANT: use Mac IP (not localhost)
  const WS_URL = "wss://devllmstudio.creativeworkspace.ai/stormee-asgi-server/ws";
  const SESSION_ID = "3b309fad-aefb-42d4-8fdc-7e794f24e14b";

  // create client once
  useEffect(() => {
    clientRef.current = new StormeeClientRN({
      wsUrl: WS_URL,
      sessionId: SESSION_ID,
      onTranscription: (text) => setTranscription(text),
      onError: (err) => console.log("Stormee Error:", err),
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    });

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  // connect/disconnect based on modal visibility
  useEffect(() => {
    if (!visible) return;
    if (!clientRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        console.log("Stormee connecting...");
        await clientRef.current?.connect();

        if (cancelled) return;

        console.log("Stormee connected ✅");
        setConnected(true);
      } catch (e) {
        console.log("Stormee connect failed:", e);
        setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      console.log("Stormee disconnecting...");
      clientRef.current?.disconnect();
      setConnected(false);
    };
  }, [visible]);

  const send = async (text: string) => {
    if (!clientRef.current) return;
    await clientRef.current.startStreaming(text);
  };



  return {
    transcription,
    connected,
    send,
    // playAudio
  };
}
