import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackAddToCart, trackRemoveFromCart } from "@/utils/analytics";

export interface CartItem {
  id: string | number;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  image: string;
  quantity: number;
  shipping_fee?: number | null; // Shipping fee riêng của sản phẩm (null = dùng default)
  free_shipping_threshold?: number | null; // Ngưỡng miễn phí vận chuyển riêng cho sản phẩm (null = dùng default từ settings)
  weight?: number | null; // Cân nặng sản phẩm (kg)
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string | number) => void;
  updateQuantity: (id: string | number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

const CART_STORAGE_KEY = "vinon_cart";
const CART_EXPIRY_DAYS = 30; // Giữ giỏ hàng 30 ngày

interface StoredCart {
  items: CartItem[];
  expiry: string;
  updated_at: string;
}

export const CartProvider = ({ children }: CartProviderProps) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsed: StoredCart = JSON.parse(savedCart);
        // Check expiry
        if (parsed.expiry && new Date(parsed.expiry) > new Date()) {
          setItems(parsed.items || []);
        } else {
          // Cart expired, remove it
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Failed to load cart from localStorage:", error);
      }
      localStorage.removeItem(CART_STORAGE_KEY);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return; // Don't save on initial load

    if (items.length > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + CART_EXPIRY_DAYS);
      const storedCart: StoredCart = {
        items,
        expiry: expiry.toISOString(),
        updated_at: new Date().toISOString(),
      };
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(storedCart));
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Failed to save cart to localStorage:", error);
        }
      }
    } else {
      // Clear cart from storage if empty
      localStorage.removeItem(CART_STORAGE_KEY);
    }
  }, [items, isLoaded]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const addItem = useCallback(async (newItem: Omit<CartItem, "quantity">) => {
    // Fetch product để lấy shipping_fee, free_shipping_threshold, và weight
    let shippingFee: number | null = null;
    let freeShippingThreshold: number | null = null;
    let weight: number | null = null;
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:111',message:'Before product query',data:{productId:newItem.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:117',message:'Executing product query',data:{productId:newItem.id,selectColumns:'shipping_fee,free_shipping_threshold,weight'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const { data: product, error: queryError } = await supabase
        .from("products")
        .select("shipping_fee, free_shipping_threshold, weight")
        .eq("id", newItem.id)
        .single();
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:121',message:'Query result',data:{hasError:!!queryError,errorCode:queryError?.code,errorMessage:queryError?.message,errorDetails:queryError?.details,errorHint:queryError?.hint,hasProduct:!!product},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (queryError) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:128',message:'Query error details',data:{errorCode:queryError.code,errorMessage:queryError.message,errorDetails:queryError.details,errorHint:queryError.hint,fullError:JSON.stringify(queryError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw queryError;
      }
      
      if (product) {
        shippingFee = product.shipping_fee;
        freeShippingThreshold = product.free_shipping_threshold;
        weight = product.weight;
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:127',message:'Product data extracted',data:{shippingFee,freeShippingThreshold,weight},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/cbf65b25-7b38-447b-9a69-230487d39aef',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CartContext.tsx:133',message:'Catch block - error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // If fetch fails, use null (will use default shipping fee)
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching product shipping info:", error);
      }
    }

    setItems((prev) => {
      const existingItem = prev.find((item) => item.id === newItem.id);
      if (existingItem) {
        const updatedItems = prev.map((item) =>
          item.id === newItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
        // Track add to cart for existing item
        const updatedItem = updatedItems.find((item) => item.id === newItem.id);
        if (updatedItem) {
          trackAddToCart({
            id: String(updatedItem.id),
            name: updatedItem.name,
            price: updatedItem.salePrice ?? updatedItem.price,
            quantity: updatedItem.quantity,
          });
        }
        return updatedItems;
      }
      const newItems = [...prev, { ...newItem, quantity: 1, shipping_fee: shippingFee, free_shipping_threshold: freeShippingThreshold, weight: weight }];
      // Track add to cart for new item
      trackAddToCart({
        id: String(newItem.id),
        name: newItem.name,
        price: newItem.salePrice ?? newItem.price,
        quantity: 1,
      });
      return newItems;
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string | number) => {
    setItems((prev) => {
      const itemToRemove = prev.find((item) => item.id === id);
      if (itemToRemove) {
        // Track remove from cart
        trackRemoveFromCart({
          id: String(itemToRemove.id),
          name: itemToRemove.name,
          price: itemToRemove.salePrice ?? itemToRemove.price,
          quantity: itemToRemove.quantity,
        });
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const updateQuantity = useCallback(async (id: string | number, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    // Validate stock quantity
    try {
      const { data: product, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, unit_name")
        .eq("id", id)
        .single();
      
      if (error || !product) {
        // If product not found, allow update but show warning
        if (process.env.NODE_ENV === 'development') {
          console.warn("Product not found for stock validation:", id);
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, quantity } : item
          )
        );
        return;
      }
      
      const availableStock = product.stock_quantity ?? 0;
      const unitName = product.unit_name || "Sản phẩm";
      if (quantity > availableStock) {
        // Show error toast
        const { toast } = await import("sonner");
        toast.error(
          `Số lượng vượt quá tồn kho. Sản phẩm "${product.name}" chỉ còn ${availableStock} ${unitName}.`,
          { duration: 5000 }
        );
        // Set quantity to available stock
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, quantity: availableStock } : item
          )
        );
        return;
      }
    } catch (error) {
      // If validation fails, allow update but log error
      if (process.env.NODE_ENV === 'development') {
        console.error("Error validating stock:", error);
      }
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const totalPrice = items.reduce((sum, item) => {
    const price = item.salePrice ?? item.price;
    return sum + price * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
