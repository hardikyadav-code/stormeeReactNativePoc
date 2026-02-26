import { create } from "zustand";

interface ChatHistoryState {
    isStormeeThinking : boolean,
    setIsStormeeThinking : (value : boolean) => void,
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
    isStormeeThinking : false,
    setIsStormeeThinking : (value : boolean) => set({isStormeeThinking : value}),
}))