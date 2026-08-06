import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: {
    suggestedProducts?: string[];
    actions?: Array<{ type: string; productId: string }>;
  };
  created_at: string;
}

export interface SuggestedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  badge: string | null;
  stock_quantity?: number;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  suggestedProducts: SuggestedProduct[];
  actions: Array<{ type: string; productId: string }>;
}

// Generate or get session ID
const getSessionId = (): string => {
  let sessionId = localStorage.getItem("chat_session_id");
  if (!sessionId) {
    sessionId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("chat_session_id", sessionId);
  }
  return sessionId;
};

export const useAIChatbot = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sessionId = getSessionId();

  // Load conversation history
  const { data: messages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as ChatMessage[];
    },
    enabled: !!conversationId,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (message: string): Promise<ChatResponse> => {
      const { data, error } = await supabase.functions.invoke("ai-chatbot", {
        body: {
          message: message.trim(),
          conversationId: conversationId || undefined,
          sessionId: sessionId,
          context: {
            currentPage: window.location.pathname,
          },
        },
        // Headers are automatically added by Supabase client
      });

      if (error) throw error;

      // Update conversation ID if new
      const newConversationId = data.conversationId;
      if (newConversationId && newConversationId !== conversationId) {
        setConversationId(newConversationId);
      }

      return data as ChatResponse;
    },
    onSuccess: (data) => {
      // Invalidate messages query to refetch with new conversation ID
      queryClient.invalidateQueries({ queryKey: ["chat-messages", data.conversationId] });
    },
  });

  // Clear conversation
  const clearConversation = useMutation({
    mutationFn: async () => {
      const currentConvId = conversationId;
      // Clear local session
      localStorage.removeItem("chat_session_id");
      setConversationId(null);
      // Clear messages for the current conversation
      if (currentConvId) {
        queryClient.setQueryData(["chat-messages", currentConvId], []);
      }
      // Also clear all chat messages queries
      queryClient.removeQueries({ queryKey: ["chat-messages"] });
    },
  });

  return {
    messages,
    isLoadingHistory,
    sendMessage: sendMessage.mutateAsync,
    isSending: sendMessage.isPending,
    error: sendMessage.error,
    clearConversation: clearConversation.mutateAsync,
    conversationId,
  };
};

