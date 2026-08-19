CREATE TABLE public.telegram_notification_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL UNIQUE,
  chat_username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.telegram_link_tokens (
  token uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_link_tokens_expiry
  ON public.telegram_link_tokens (expires_at);

ALTER TABLE public.telegram_notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own Telegram subscription"
  ON public.telegram_notification_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());
