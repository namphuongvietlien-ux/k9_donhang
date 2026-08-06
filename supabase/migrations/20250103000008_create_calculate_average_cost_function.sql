-- Function to calculate and update average_cost for a product
-- This function calculates the weighted average cost from all stock_in_items
CREATE OR REPLACE FUNCTION public.calculate_average_cost(product_uuid UUID)
RETURNS DECIMAL(12, 0)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_cost DECIMAL(12, 0);
  total_quantity INTEGER;
  total_value DECIMAL(15, 0);
BEGIN
  -- Calculate weighted average cost from stock_in_items
  SELECT 
    COALESCE(SUM(sii.quantity * sii.unit_price), 0),
    COALESCE(SUM(sii.quantity), 0)
  INTO total_value, total_quantity
  FROM public.stock_in_items sii
  JOIN public.stock_in_transactions sit ON sii.stock_in_id = sit.id
  WHERE sii.product_id = product_uuid;
  
  -- Calculate average cost
  IF total_quantity > 0 THEN
    avg_cost := ROUND(total_value / total_quantity, 0);
  ELSE
    avg_cost := 0;
  END IF;
  
  -- Update products table
  UPDATE public.products
  SET average_cost = avg_cost
  WHERE id = product_uuid;
  
  RETURN avg_cost;
END;
$$;

-- Function to auto-update cost_price from average_cost when stock_in is created
CREATE OR REPLACE FUNCTION public.auto_update_cost_price_from_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_avg_cost DECIMAL(12, 0);
BEGIN
  -- Calculate new average cost
  new_avg_cost := public.calculate_average_cost(NEW.product_id);
  
  -- Optionally update cost_price if it's 0 or NULL
  -- (Admin can still manually override)
  UPDATE public.products
  SET cost_price = new_avg_cost
  WHERE id = NEW.product_id 
    AND (cost_price = 0 OR cost_price IS NULL);
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update average_cost when stock_in_items are inserted
DROP TRIGGER IF EXISTS trigger_auto_update_average_cost ON public.stock_in_items;
CREATE TRIGGER trigger_auto_update_average_cost
  AFTER INSERT ON public.stock_in_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_cost_price_from_average();

-- Create trigger to auto-update average_cost when stock_in_items are updated
DROP TRIGGER IF EXISTS trigger_auto_update_average_cost_update ON public.stock_in_items;
CREATE TRIGGER trigger_auto_update_average_cost_update
  AFTER UPDATE ON public.stock_in_items
  FOR EACH ROW
  WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.unit_price IS DISTINCT FROM NEW.unit_price)
  EXECUTE FUNCTION public.auto_update_cost_price_from_average();

-- Create trigger to auto-update average_cost when stock_in_items are deleted
DROP TRIGGER IF EXISTS trigger_auto_update_average_cost_delete ON public.stock_in_items;
CREATE TRIGGER trigger_auto_update_average_cost_delete
  AFTER DELETE ON public.stock_in_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_cost_price_from_average();

