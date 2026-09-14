-- Chẩn đoán bot nhắc lấy vaccine (chạy từng khối trên Supabase SQL Editor).
-- Chuỗi: pg_cron (04:00 / 05:30 UTC) → net.http_post → Edge Function
-- telegram-vaccine-pickup → Telegram group Nhắc_lấy_Vaccin.

-- 1) Cron còn được lên lịch không? (phải có 2 dòng, active = true)
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname LIKE 'vaccine-pickup%';

-- 2) Cron có chạy không / chạy lúc nào? (status = succeeded chỉ nghĩa là net.http_post đã xếp hàng)
SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname LIKE 'vaccine-pickup%'
ORDER BY d.start_time DESC
LIMIT 20;

-- 3) Edge Function trả gì? (status_code 200 = ok; 401 = token sai; 502 = Telegram lỗi;
--    error_msg 'Timeout of 5000 ms reached' = pg_net cắt sớm → chạy lại sql-vaccine-pickup-cron.sql)
SELECT id, created, status_code, error_msg, left(content::text, 400) AS content
FROM net._http_response
WHERE content::text LIKE '%slot%'
   OR content::text LIKE '%vaccine%'
   OR error_msg IS NOT NULL
ORDER BY created DESC
LIMIT 20;

-- 4) Token của job (dán vào header x-k9-cron-token khi test tay bằng curl)
SELECT job_name, token, created_at
FROM public.telegram_scheduled_job_tokens
WHERE job_name = 'vaccine-pickup';

-- 5) Hôm nay (giờ VN) có phiếu vaccine nào lọt điều kiện của bot không?
--    Bot chỉ lấy: order_kind DH/DT/DC, status pending|processing,
--    packing_date = hôm nay VN, kho nhận thuộc slot, mã hàng chứa 'VAC'.
WITH today_vn AS (
  SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
)
SELECT
  o.order_code,
  o.order_kind,
  o.status,
  o.packing_date,
  w.code AS kho_nhan,
  CASE
    WHEN w.code IN ('PH', 'Q8', 'Q5') THEN 'noon (11:00)'
    WHEN w.code IN ('Q4_275', 'Q4_178', 'Q1') THEN 'afternoon (12:30)'
    ELSE 'ngoài slot'
  END AS slot,
  oi.product_slug,
  oi.quantity,
  oi.unit
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
LEFT JOIN public.warehouses w ON w.id = o.warehouse_id
CROSS JOIN today_vn t
WHERE oi.product_slug ILIKE '%VAC%'
  AND o.packing_date BETWEEN t.d - 1 AND t.d + 1
ORDER BY o.packing_date, o.order_code;

-- 6) Test tay (terminal), thay <TOKEN> bằng kết quả bước 4.
--    dryRun: chỉ xem preview, không gửi Telegram; bỏ dryRun để gửi thật.
-- curl -X POST https://zfzotqmksdstizmodtzz.supabase.co/functions/v1/telegram-vaccine-pickup \
--   -H 'Content-Type: application/json' -H 'x-k9-cron-token: <TOKEN>' \
--   -d '{"slot":"noon","dryRun":true}'
--    Nếu trả về "group chat was upgraded to a supergroup chat" hoặc có "migratedTo":
--    cập nhật secret TELEGRAM_VACCINE_CHAT_ID bằng chat_id mới (-100…) rồi deploy lại.
