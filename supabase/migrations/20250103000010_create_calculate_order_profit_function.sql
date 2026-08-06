-- Function to calculate and save profit for order items
-- This function is called when order_items are inserted or updated
CREATE OR REPLACE FUNCTION public.calculate_order_item_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_cost_price DECIMAL(12, 0);
  calculated_profit DECIMAL(12, 0);
  calculated_margin DECIMAL(5, 2);
BEGIN
  -- Get cost_price from products table using product_slug
  -- Priority: cost_price > average_cost > 0
  SELECT 
    COALESCE(
      NULLIF(cost_price, 0),
      NULLIF(average_cost, 0),
      0
    )
  INTO product_cost_price
  FROM public.products
  WHERE slug = NEW.product_slug
  LIMIT 1;
  
  -- If not found by slug, set to 0
  IF product_cost_price IS NULL THEN
    product_cost_price := 0;
  END IF;
  
  -- Calculate profit
  calculated_profit := (NEW.price - product_cost_price) * NEW.quantity;
  
  -- Calculate profit margin (%)
  IF NEW.price > 0 THEN
    calculated_margin := ROUND(((NEW.price - product_cost_price) / NEW.price) * 100, 2);
  ELSE
    calculated_margin := 0;
  END IF;
  
  -- Update the order item with calculated values
  NEW.cost_price := product_cost_price;
  NEW.profit := calculated_profit;
  NEW.profit_margin := calculated_margin;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-calculate profit when order_items are inserted
DROP TRIGGER IF EXISTS trigger_calculate_order_profit ON public.order_items;
CREATE TRIGGER trigger_calculate_order_profit
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  WHEN (NEW.price IS NOT NULL AND NEW.quantity > 0)
  EXECUTE FUNCTION public.calculate_order_item_profit();

