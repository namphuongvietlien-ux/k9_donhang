-- Hẹn giờ Telegram nhắc lấy vaccine (Asia/Ho_Chi_Minh)
-- 12:00 VN = 05:00 UTC  → PH, Q8, Q5
-- 13:45 VN = 06:45 UTC  → Q4 Mới, Q4 Cũ, Q1

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
  '0 5 * * *',
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
      body := '{"slot":"noon"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'vaccine-pickup-afternoon',
  '45 6 * * *',
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
      body := '{"slot":"afternoon"}'::jsonb
    );
  $$
);
