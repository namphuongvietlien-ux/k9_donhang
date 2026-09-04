-- Đổi giờ nhắc lấy vaccine (Asia/Ho_Chi_Minh)
-- 11:00 VN = 04:00 UTC  → PH, Q8, Q5
-- 12:30 VN = 05:30 UTC  → Q4 Mới, Q4 Cũ, Q1

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
      body := '{"slot":"noon"}'::jsonb
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
      body := '{"slot":"afternoon"}'::jsonb
    );
  $$
);
