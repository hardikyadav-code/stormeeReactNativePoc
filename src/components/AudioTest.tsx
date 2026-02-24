// src/screens/AudioTest.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Button,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import StormeeServiceRN from "../services/stormee/StormeeServiceRN";
import { StormeeClientRN } from "../services/stormee/ StormeeClient";

export function AudioTest() {
  const [status, setStatus] = useState("Initializing...");
  const [logs, setLogs] = useState<string[]>([]);

  // ✅ useRef so client is created exactly once across renders
  const clientRef = useRef<StormeeClientRN | null>(null);

  const addLog = (message: string) => {
    console.log(message);
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev, // newest at top
    ]);
  };

  useEffect(() => {
    // Create client once
    clientRef.current = new StormeeClientRN({
      sessionId: "test-session-" + Date.now(),
      onConnect: () => {
        addLog("✅ WebSocket connected");
        setStatus("Connected");
      },
      onDisconnect: () => {
        addLog("❌ WebSocket disconnected");
        setStatus("Disconnected");
      },
      onTranscription: (text) => addLog("📝 " + text),
      onAudioChunk: (_bytes, chunkNumber) =>
        addLog(`🔊 Audio chunk #${chunkNumber} received by JS`),
      onError: (err) => {
        addLog("🚨 Error: " + JSON.stringify(err));
        setStatus("Error");
      },
      onStateChange: (state) => addLog("📊 State → " + state),
    });

    // Initialize audio engine on mount
    const init = async () => {
      try {
        addLog("🎵 Initializing audio engine...");
        await clientRef.current?.initialize();
        addLog("✅ Audio engine ready");
        setStatus("Ready");
      } catch (err) {
        addLog("❌ Init failed: " + JSON.stringify(err));
        setStatus("Error");
      }
    };

    init();

    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // ✅ FIX: Single clean flow — connect() awaits onopen, THEN sends query.
  //         No setTimeout, no double connect().
  const handleTest = async () => {
    try {
      addLog("🔌 Connecting...");
      setStatus("Connecting...");

      // This awaits the real WebSocket onopen before resolving
      await clientRef.current?.connect();
      addLog("✅ Socket open — sending query...");

      // Safe to send immediately after connect() resolves
      await clientRef.current?.startStreaming(
        "Hello, please generate some audio for testing"
      );

      addLog("📤 Query sent — waiting for audio chunks...");
      setStatus("Streaming...");
    } catch (err) {
      addLog("❌ handleTest error: " + JSON.stringify(err));
      setStatus("Error");
    }
  };

  const handleStop = () => {
    clientRef.current?.stopStreaming();
    addLog("⏹️ Stopped by user");
    setStatus("Stopped");
  };

  const handlePlayWAV = async () => {
    try {
      addLog("🧪 Testing WAV playback...");
      const result = await StormeeServiceRN.playWAVFile();
      addLog("✅ WAV result: " + result);
    } catch (err) {
      addLog("❌ WAV failed: " + JSON.stringify(err));
    }
  };

  const handleClearLogs = () => setLogs([]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AVAudioEngine Test</Text>
        <Text style={styles.status}>Status: {status}</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleTest}>
          <Text style={styles.btnText}>🎵 Start Test</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnDanger} onPress={handleStop}>
          <Text style={styles.btnText}>⏹ Stop</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnOrange} onPress={handlePlayWAV}>
          <Text style={styles.btnText}>🧪 Test WAV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGray} onPress={handleClearLogs}>
          <Text style={styles.btnText}>🗑 Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Logs */}
      <ScrollView style={styles.logBox}>
        <Text style={styles.logTitle}>Logs ({logs.length}):</Text>
        {logs.map((log) => (
          <Text  style={styles.logItem}>
            {log}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f2f2f7",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1c1c1e",
  },
  status: {
    fontSize: 14,
    color: "#636366",
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#007AFF",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDanger: {
    flex: 1,
    backgroundColor: "#FF3B30",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  btnOrange: {
    flex: 1,
    backgroundColor: "#FF9500",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  btnGray: {
    flex: 1,
    backgroundColor: "#8E8E93",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  logBox: {
    flex: 1,
    backgroundColor: "#1c1c1e",
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },
  logTitle: {
    color: "#98989d",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  logItem: {
    color: "#30d158",
    fontSize: 11,
    fontFamily: "Courier New",
    marginBottom: 3,
  },
});