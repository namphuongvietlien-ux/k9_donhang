CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.telegram_scheduled_job_tokens (
  job_name text PRIMARY KEY,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_scheduled_job_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.telegram_scheduled_job_tokens (job_name)
VALUES ('weekly-internal-reminder')
ON CONFLICT (job_name) DO NOTHING;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'weekly-internal-reminder-saturday';

SELECT cron.schedule(
  'weekly-internal-reminder-saturday',
  '0 5 * * 6',
  $$
    SELECT net.http_post(
      url := 'https://zfzotqmksdstizmodtzz.supabase.co/functions/v1/telegram-weekly-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-k9-cron-token', (
          SELECT token::text
          FROM public.telegram_scheduled_job_tokens
          WHERE job_name = 'weekly-internal-reminder'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
