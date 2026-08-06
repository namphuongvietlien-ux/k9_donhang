-- Create chat conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL, -- Unique session ID (user_id or anonymous_id)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL if anonymous
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- Store product suggestions, actions, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_session_id ON public.chat_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_conversations
-- Users can view their own conversations
CREATE POLICY "Users can view own conversations"
ON public.chat_conversations
FOR SELECT
USING (user_id = auth.uid() OR user_id IS NULL);

-- Anyone can create conversations (for anonymous users)
CREATE POLICY "Anyone can create conversations"
ON public.chat_conversations
FOR INSERT
WITH CHECK (true);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
ON public.chat_conversations
FOR UPDATE
USING (user_id = auth.uid() OR user_id IS NULL);

-- RLS Policies for chat_messages
-- Users can view messages from their conversations
CREATE POLICY "Users can view own messages"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = chat_messages.conversation_id
    AND (user_id = auth.uid() OR user_id IS NULL)
  )
);

-- Anyone can insert messages (for anonymous users)
CREATE POLICY "Anyone can insert messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = chat_messages.conversation_id
    AND (user_id = auth.uid() OR user_id IS NULL)
  )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at when conversation changes
CREATE TRIGGER update_chat_conversation_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_conversation_updated_at();

-- Function to get or create conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_session_id TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Try to find existing conversation
  SELECT id INTO v_conversation_id
  FROM public.chat_conversations
  WHERE session_id = p_session_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- If not found, create new one
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.chat_conversations (session_id, user_id)
    VALUES (p_session_id, p_user_id)
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

