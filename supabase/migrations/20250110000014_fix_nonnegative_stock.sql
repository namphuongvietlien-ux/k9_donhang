-- Clamp tồn không âm (products + stock_on_hand + triggers + ecommerce)
UPDATE public.products
SET stock_quantity = 0
WHERE stock_quantity IS NOT NULL AND stock_quantity < 0;

UPDATE public.stock_on_hand
SET quantity = 0, updated_at = now()
WHERE quantity < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_nonneg'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_quantity_nonneg
      CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'products CHECK skip: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.clamp_product_stock_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity IS NOT NULL AND NEW.stock_quantity < 0 THEN
    NEW.stock_quantity := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clamp_product_stock ON public.products;
CREATE TRIGGER trg_clamp_product_stock
  BEFORE INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.clamp_product_stock_quantity();

CREATE OR REPLACE FUNCTION public.clamp_stock_on_hand_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity < 0 THEN
    NEW.quantity := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clamp_stock_on_hand ON public.stock_on_hand;
CREATE TRIGGER trg_clamp_stock_on_hand
  BEFORE INSERT OR UPDATE OF quantity ON public.stock_on_hand
  FOR EACH ROW
  EXECUTE FUNCTION public.clamp_stock_on_hand_quantity();

CREATE OR REPLACE FUNCTION public.deduct_stock_on_ecommerce_delivery(
  p_ecommerce_order_id UUID
) RETURNS VOID AS $$
DECLARE
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT
      eoi.internal_product_id,
      eoi.quantity,
      eoi.unit_price
    FROM public.ecommerce_order_items eoi
    WHERE eoi.ecommerce_order_id = p_ecommerce_order_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_item.quantity),
      updated_at = NOW()
    WHERE id = v_item.internal_product_id;

    INSERT INTO public.inventory_movements (
      lot_id,
      stock_out_item_id,
      movement_type,
      quantity,
      unit_price,
      movement_date
    ) VALUES (
      NULL,
      NULL,
      'out',
      v_item.quantity,
      v_item.unit_price,
      CURRENT_DATE
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
