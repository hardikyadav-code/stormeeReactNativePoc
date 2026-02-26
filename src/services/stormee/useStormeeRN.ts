import { useEffect, useRef, useState } from "react";
import { StormeeClientRN } from "./ StormeeClient";
import{ useChatHistoryStore } from "../../store/useChatHistoryStore";

export function useStormeeRN(visible: boolean) {
  const [transcription, setTranscription] = useState("");
  const [connected, setConnected] = useState(false);


  const clientRef = useRef<StormeeClientRN | null>(null);

  useEffect(() => {
    clientRef.current = new StormeeClientRN({
      sessionId: "modal-session-" + Date.now(),
      onTranscription: (text) => {
        setTranscription(text);
        useChatHistoryStore.getState().setIsStormeeThinking(false);
      },
      onError: (err) => console.error("[useStormeeRN] Error:", err),
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    });

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible || !clientRef.current) return;

    const client = clientRef.current;
    (async () => {
      try {
        await client.initialize();
        await client.connect();
      } catch (e) {
        console.error("Connect failed:", e);
      }
    })();

    return () => {
      client?.disconnect();
    };
  }, [visible]);

  const send = async (text: string) => {
    await clientRef.current?.startStreaming(text);
  };

  return { transcription, connected, send };
}