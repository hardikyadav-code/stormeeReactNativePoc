import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  SafeAreaView,
  Image,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useStormeeRN } from "../services/stormee/useStormeeRN";
import { useChatHistoryStore } from "../store/useChatHistoryStore";

type StormeeModalProps = {
  visible: boolean;
  onClose: () => void;
};

const StormeeModal = ({ visible, onClose }: StormeeModalProps) => {
  const { transcription, connected, send } = useStormeeRN(visible);

  const [input, setInput] = useState("");
  const istThinking = useChatHistoryStore((state) => state.isStormeeThinking);

  useEffect(() => {
    if (connected) {
      send("Hello Stormee!");
      useChatHistoryStore.getState().setIsStormeeThinking(true);
    }
  }, [connected]);

  const handleSend = async () => {
    if (!input.trim()) return;

    await send(input.trim());
    setInput("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
            {/* <Text style={styles.connectionText}>
              {connected ? "Connected ✅" : "Disconnected ❌"}
            </Text> */}

            <View style={styles.transcriptionBox}>
              <Text style={styles.transcriptionText}>
                {istThinking ? "Stormee is thinking..." : transcription}
              </Text>
            </View>
          </View>

          {/* FOOTER INPUT */}
          <View style={styles.footer}>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Type your message..."
                placeholderTextColor="#6b7280"
                style={styles.input}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />

              <Pressable style={styles.sendBtn} onPress={handleSend}>
                <Text style={styles.sendBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
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
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    padding: 12,
    backgroundColor: "#0b0b0f",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#111827",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },

  sendBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },

  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});

export default StormeeModal;