ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stt INTEGER;

WITH ranked AS (
  SELECT
    id,
    COALESCE((
      SELECT MAX(existing.stt)
      FROM public.order_items existing
      WHERE existing.order_id = order_items.order_id
    ), 0) + ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.order_items
  WHERE stt IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.is_locked = TRUE
    )
)
UPDATE public.order_items oi
SET stt = ranked.rn
FROM ranked
WHERE oi.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_stt
ON public.order_items (order_id, stt)
WHERE stt IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_order_item_stt_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stt IS DISTINCT FROM NEW.stt THEN
    RAISE EXCEPTION 'Không được phép thay đổi STT sau khi đã lưu.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_order_item_stt_change ON public.order_items;

CREATE TRIGGER trg_prevent_order_item_stt_change
BEFORE UPDATE ON public.order_items
FOR EACH ROW
WHEN (OLD.stt IS DISTINCT FROM NEW.stt)
EXECUTE FUNCTION public.prevent_order_item_stt_change();
