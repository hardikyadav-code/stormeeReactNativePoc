import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  SafeAreaView,
  Image,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { RattManager } from "../services/ratt/rattConfig"; // Make sure path is correct

type StormeeModalProps = {
  visible: boolean;
  onClose: () => void;
};

const RattModel = ({ visible, onClose }: StormeeModalProps) => {
  // 1. Local UI State
  const [transcription, setTranscription] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // 2. Lifecycle: Boot up RATT when Modal opens, Kill when it closes
  useEffect(() => {
    const rattManager = RattManager.getInstance();

    if (visible) {
      console.log("Modal opened. Booting RATT...");
      
      // Attach UI updaters
      rattManager.attachCallbacks(
        (text) => setTranscription(text),
        (state) => {
          if (state.wsReady !== undefined) setIsConnected(state.wsReady);
          if (state.micOpen !== undefined) setIsRecording(state.micOpen);
        },
        (error) => console.error("RATT Error:", error)
      );

      // Initialize the connection
      rattManager.init();
    }

    // Cleanup when modal closes
    return () => {
      if (visible) {
        console.log("Modal closed. Tearing down RATT...");
        rattManager.disconnect();
        // Reset local state
        setIsConnected(false);
        setIsRecording(false);
        setTranscription("");
      }
    };
  }, [visible]);

  // 3. Microphone Handler
  const handleMicPress = async () => {
    const rattManager = RattManager.getInstance();
    
    if (isRecording) {
      await rattManager.stopSession();
    } else {
      await rattManager.startSession();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={{
                uri: "https://cdn-icons-png.flaticon.com/512/4712/4712109.png",
              }}
              style={styles.logo}
            />
            <Text style={styles.headerTitle}>Stormee</Text>
          </View>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* BODY */}
        <View style={styles.body}>
          <Text style={styles.connectionText}>
            {isConnected ? "Connected ✅" : "Connecting ⏳..."}
          </Text>

          <View style={styles.transcriptionBox}>
            <Text style={styles.transcriptionText}>
              {transcription || "Listening for your voice..."}
            </Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          {!isConnected ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.loadingText}>Warming up...</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleMicPress}
              style={[
                styles.sendBtn,
                isRecording && styles.recordingBtn // Turn red when active
              ]}
            >
              <Text style={styles.sendBtnText}>
                {isRecording ? "Stop Recording 🛑" : "Tap to Speak 🎤"}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
  },
  header: {
    height: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  connectionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  transcriptionBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  transcriptionText: {
    color: "#9ca3af",
    fontSize: 16,
    lineHeight: 22,
  },
  footer: {
    height: 80,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingBtn: {
    backgroundColor: "#ef4444", // Red when recording
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  loadingContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#9ca3af",
    fontSize: 16,
  }
});

export default RattModel;


