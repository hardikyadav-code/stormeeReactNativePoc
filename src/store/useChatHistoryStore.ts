import { create } from "zustand";

// 🚀 Define the common prefix for easy filtering in your logs
const LOG_PREFIX = "🧠 [StormeeStore]";

// Define the structure of a single chat message
export type ChatMessage = {
    role: "user" | "assistant";
    message: string;
};

interface ChatHistoryState {
    isStormeeThinking: boolean;
    setIsStormeeThinking: (value: boolean) => void;
    
    // Chat history state
    chatHistory: ChatMessage[];
    
    // Setters to add messages
    addUserMessage: (message: string) => void;
    addAssistantMessage: (message: string) => void;
    
    // Helper to clear the history
    clearChatHistory: () => void;
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
    isStormeeThinking: false,
    
    setIsStormeeThinking: (value: boolean) => set((state) => {
        console.log(`${LOG_PREFIX} isStormeeThinking updated: ${state.isStormeeThinking} ➡️ ${value}`);
        return { isStormeeThinking: value };
    }),

    // Initialize with an empty array
    chatHistory: [],

    // Appends a new user message to the existing history array
    addUserMessage: (message: string) => set((state) => {
        console.log(`${LOG_PREFIX} 👤 Added User Message: "${message}"`);
        const updatedHistory: ChatMessage[] = [...state.chatHistory, { role: "user", message }];
        console.log(`${LOG_PREFIX} Total messages in history: ${updatedHistory.length}`);
        
        return { chatHistory: updatedHistory };
    }),

    // Appends a new assistant message to the existing history array
    addAssistantMessage: (message: string) => set((state) => {
        // We substring the message in the log so it doesn't flood your console if the AI sends a huge paragraph
        console.log(`${LOG_PREFIX} 🤖 Added Assistant Message: "${message.substring(0, 60)}..."`);
        const updatedHistory: ChatMessage[] = [...state.chatHistory, { role: "assistant", message }];
        console.log(`${LOG_PREFIX} Total messages in history: ${updatedHistory.length}`);
        
        return { chatHistory: updatedHistory };
    }),

    // Resets the chat history
    clearChatHistory: () => set(() => {
        console.log(`${LOG_PREFIX} 🧹 Cleared chat history`);
        return { chatHistory: [] };
    }),
}));