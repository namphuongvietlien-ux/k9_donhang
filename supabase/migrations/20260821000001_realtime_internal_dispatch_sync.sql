-- Realtime cho luồng duyệt đơn xuất nội bộ.
--
-- Manager bấm "Chấp nhận" / "Từ chối" trong Telegram → telegram-webhook gọi
-- telegram_decide_internal_dispatch bằng service_role, tức DB đổi HOÀN TOÀN
-- ngoài app. Query defaults ở App.tsx (staleTime 5 phút, refetchOnMount = false,
-- refetchOnWindowFocus = false) khiến portal giữ trạng thái cũ cho tới khi F5.
-- Phát realtime để client invalidate query thay vì nới lỏng defaults (giữ egress
-- PostgREST thấp — xem CLAUDE.md).

DO $$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Chưa có publication supabase_realtime — bỏ qua';
    RETURN;
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'internal_dispatches',
    'weekly_orders',
    'weekly_order_items'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
