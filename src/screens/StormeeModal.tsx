import React, { useEffect, useState, useRef } from "react";
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
  FlatList,
  ActivityIndicator,
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
  
  const flatListRef = useRef<FlatList>(null);

  // Zustand Store
  const chatHistory = useChatHistoryStore((state) => state.chatHistory);
  const isStormeeThinking = useChatHistoryStore((state) => state.isStormeeThinking);
  const addUserMessage = useChatHistoryStore((state) => state.addUserMessage);
  const setIsStormeeThinking = useChatHistoryStore((state) => state.setIsStormeeThinking);

  // 🚀 THE INITIAL GREETING TRIGGER
  useEffect(() => {
    // If we connect, AND the chat is totally empty, trigger the first message!
    if (connected && chatHistory.length === 0 && !isStormeeThinking) {
      setIsStormeeThinking(true);
      // Send a hidden prompt to the backend to get it to introduce itself
      send("Hello, please introduce yourself and ask how you can help me brainstorm today.");
    }
  }, [connected, chatHistory.length]);

  const handleSend = async () => {
    if (!input.trim() || isStormeeThinking) return;
    
    const userText = input.trim();
    setInput(""); 

    // 1. Add user message to UI
    addUserMessage(userText);
    
    // 2. Lock the input and show thinking state
    setIsStormeeThinking(true);

    // 3. Send to backend (service will automatically attach the history!)
    await send(userText);
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [chatHistory, transcription]);

  // Render individual chat bubbles
  const renderBubble = ({ item }: { item: { role: string; message: string } }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.aiWrapper]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={styles.bubbleText}>{item.message}</Text>
        </View>
      </View>
    );
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
                source={{ uri: "https://cdn-icons-png.flaticon.com/512/4712/4712109.png" }}
                style={styles.logo}
              />
              <Text style={styles.headerTitle}>Stormee</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* CHAT HISTORY BODY */}
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, index) => index.toString()}
            renderItem={renderBubble}
            contentContainerStyle={styles.chatContainer}
            ListFooterComponent={
              <>
                {/* Live Streaming Bubble */}
                {isStormeeThinking && transcription.length > 0 && (
                  <View style={[styles.bubbleWrapper, styles.aiWrapper]}>
                    <View style={[styles.bubble, styles.aiBubble]}>
                      <Text style={styles.bubbleText}>{transcription}</Text>
                    </View>
                  </View>
                )}
                
                {/* Thinking Indicator (Before streaming starts) */}
                {isStormeeThinking && transcription.length === 0 && (
                  <View style={[styles.bubbleWrapper, styles.aiWrapper]}>
                     <ActivityIndicator size="small" color="#9ca3af" style={{ margin: 10 }} />
                  </View>
                )}
              </>
            }
          />

          {/* FOOTER INPUT */}
          <View style={styles.footer}>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={isStormeeThinking ? "Stormee is talking..." : "Type your message..."}
                placeholderTextColor="#6b7280"
                style={[styles.input, isStormeeThinking && styles.inputDisabled]}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                editable={!isStormeeThinking} // 🚀 Lock input while AI is talking
              />

              <Pressable 
                style={[styles.sendBtn, (!input.trim() || isStormeeThinking) && styles.sendBtnDisabled]} 
                onPress={handleSend}
                disabled={!input.trim() || isStormeeThinking}
              >
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
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  header: {
    height: 60, paddingHorizontal: 16, borderBottomWidth: 1,
    borderBottomColor: "#1f2937", flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 26, height: 26, borderRadius: 6 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10, justifyContent: "center",
    alignItems: "center", backgroundColor: "#111827",
  },
  closeBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  
  chatContainer: { padding: 16, gap: 12 },
  
  bubbleWrapper: { width: "100%", flexDirection: "row", marginBottom: 10 },
  userWrapper: { justifyContent: "flex-end" },
  aiWrapper: { justifyContent: "flex-start" },
  
  bubble: { maxWidth: "80%", padding: 14, borderRadius: 16 },
  userBubble: { backgroundColor: "#2563eb", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: "#1f2937", borderBottomLeftRadius: 4 },
  
  bubbleText: { color: "#fff", fontSize: 16, lineHeight: 22 },

  footer: {
    borderTopWidth: 1, borderTopColor: "#1f2937", padding: 12, backgroundColor: "#0b0b0f",
  },
  inputContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 14,
    backgroundColor: "#111827", color: "#fff", borderWidth: 1, borderColor: "#1f2937",
  },
  inputDisabled: { opacity: 0.5 },
  sendBtn: {
    height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: "#2563eb",
    justifyContent: "center", alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#374151" },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

export default StormeeModal;