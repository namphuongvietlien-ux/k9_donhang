-- Create function to decrease stock when order items are inserted
CREATE OR REPLACE FUNCTION public.decrease_stock_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Decrease stock quantity for the product
  UPDATE public.products 
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE slug = NEW.product_slug;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically decrease stock when order items are created
DROP TRIGGER IF EXISTS trigger_decrease_stock_on_order ON public.order_items;
CREATE TRIGGER trigger_decrease_stock_on_order
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrease_stock_on_order();