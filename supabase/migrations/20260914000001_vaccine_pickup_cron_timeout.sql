-- Nhắc lấy vaccine: đặt lại cron (idempotent) + tăng timeout pg_net.
-- Cron cũ gọi net.http_post với timeout mặc định (5000ms trên production) — Edge Function
-- cold start + 2 query + gọi Telegram vượt 5s → net._http_response ghi
-- "Timeout of 5000 ms reached", tin nhắn không bao giờ được gửi (xác nhận 14/09/2026).
-- 11:00 VN = 04:00 UTC → PH, Q8, Q5 | 12:30 VN = 05:30 UTC → Q4 Mới, Q4 Cũ, Q1

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

INSERT INTO public.telegram_scheduled_job_tokens (job_name)
VALUES ('vaccine-pickup')
ON CONFLICT (job_name) DO NOTHING;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('vaccine-pickup-noon', 'vaccine-pickup-afternoon');

SELECT cron.schedule(
  'vaccine-pickup-noon',
  '0 4 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zfzotqmksdstizmodtzz.supabase.co/functions/v1/telegram-vaccine-pickup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-k9-cron-token', (
          SELECT token::text
          FROM public.telegram_scheduled_job_tokens
          WHERE job_name = 'vaccine-pickup'
        )
      ),
      body := '{"slot":"noon"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

SELECT cron.schedule(
  'vaccine-pickup-afternoon',
  '30 5 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zfzotqmksdstizmodtzz.supabase.co/functions/v1/telegram-vaccine-pickup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-k9-cron-token', (
          SELECT token::text
          FROM public.telegram_scheduled_job_tokens
          WHERE job_name = 'vaccine-pickup'
        )
      ),
      body := '{"slot":"afternoon"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
