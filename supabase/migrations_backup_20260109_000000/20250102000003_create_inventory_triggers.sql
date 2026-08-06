-- =====================================================
-- INVENTORY & ACCOUNTING SYSTEM - PHASE 1
-- Create triggers for automatic operations
-- =====================================================

-- 1. Trigger: Auto-generate stock in code
CREATE OR REPLACE FUNCTION auto_generate_stock_in_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_stock_in_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_stock_in_code
BEFORE INSERT ON public.stock_in_transactions
FOR EACH ROW
EXECUTE FUNCTION auto_generate_stock_in_code();

-- 2. Trigger: Auto-generate stock out code
CREATE OR REPLACE FUNCTION auto_generate_stock_out_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_stock_out_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_stock_out_code
BEFORE INSERT ON public.stock_out_transactions
FOR EACH ROW
EXECUTE FUNCTION auto_generate_stock_out_code();

-- 3. Trigger: Update stock when stock in item is inserted
CREATE TRIGGER trigger_update_stock_on_in
AFTER INSERT ON public.stock_in_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_in();

-- 4. Trigger: Update stock when stock out item is inserted
CREATE TRIGGER trigger_update_stock_on_out
AFTER INSERT ON public.stock_out_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_out();

-- 5. Trigger: Create accounts payable when stock in transaction is created
CREATE TRIGGER trigger_create_accounts_payable
AFTER INSERT ON public.stock_in_transactions
FOR EACH ROW
EXECUTE FUNCTION create_accounts_payable();

-- 6. Trigger: Update accounts payable status
CREATE TRIGGER trigger_update_accounts_payable_status
BEFORE INSERT OR UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION update_accounts_payable_status();

-- 7. Trigger: Update accounts receivable status
CREATE TRIGGER trigger_update_accounts_receivable_status
BEFORE INSERT OR UPDATE ON public.accounts_receivable
FOR EACH ROW
EXECUTE FUNCTION update_accounts_receivable_status();

-- 8. Trigger: Update accounts payable when payment is made
CREATE TRIGGER trigger_update_accounts_payable_on_payment
AFTER INSERT ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION update_accounts_payable_on_payment();

-- 9. Trigger: Update accounts receivable when payment is received
CREATE TRIGGER trigger_update_accounts_receivable_on_payment
AFTER INSERT ON public.customer_payments
FOR EACH ROW
EXECUTE FUNCTION update_accounts_receivable_on_payment();

-- 10. Trigger: Auto-calculate total_amount for stock_in_items
CREATE OR REPLACE FUNCTION calculate_stock_in_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_price := NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_stock_in_item_total
BEFORE INSERT OR UPDATE ON public.stock_in_items
FOR EACH ROW
EXECUTE FUNCTION calculate_stock_in_item_total();

-- 11. Trigger: Auto-calculate total_amount for stock_in_transactions
CREATE OR REPLACE FUNCTION update_stock_in_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.stock_in_transactions
  SET total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM public.stock_in_items
    WHERE stock_in_id = COALESCE(NEW.stock_in_id, OLD.stock_in_id)
  )
  WHERE id = COALESCE(NEW.stock_in_id, OLD.stock_in_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_in_total
AFTER INSERT OR UPDATE OR DELETE ON public.stock_in_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_in_total();

-- 12. Trigger: Auto-calculate total_cost for stock_out_transactions
CREATE OR REPLACE FUNCTION update_stock_out_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.stock_out_transactions
  SET total_cost = (
    SELECT COALESCE(SUM(total_cost), 0)
    FROM public.stock_out_items
    WHERE stock_out_id = COALESCE(NEW.stock_out_id, OLD.stock_out_id)
  )
  WHERE id = COALESCE(NEW.stock_out_id, OLD.stock_out_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_out_total
AFTER INSERT OR UPDATE OR DELETE ON public.stock_out_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_out_total();

