import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { X, Send, Bot, Loader2, ShoppingCart, Eye, Trash2 } from "lucide-react";
import { useAIChatbot, ChatMessage, SuggestedProduct } from "@/hooks/useAIChatbot";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import productPepper from "@/assets/product-pepper.jpg";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const AIChatbot = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; isPending?: boolean }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addItem } = useCart();
  const { toast } = useToast();
  const { messages, isLoadingHistory, sendMessage, isSending, error, clearConversation, conversationId } = useAIChatbot();

  // Hide chatbot on admin pages (must stay below all hooks — no early return before useEffect)
  const isAdminPage = location.pathname.startsWith("/admin");

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAdminPage) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optimisticMessages, isSending, isAdminPage]);

  // Clear optimistic messages when real messages arrive (after successful send)
  useEffect(() => {
    if (isAdminPage) return;
    if (messages.length > 0 && optimisticMessages.length > 0) {
      // Check if any optimistic message content matches a real message
      const optimisticContents = optimisticMessages.map(m => m.content);
      const realUserContents = messages.filter(m => m.role === "user").map(m => m.content);
      
      // If all optimistic messages have matching real messages, clear them
      const allMatched = optimisticContents.every(optContent => 
        realUserContents.includes(optContent)
      );
      
      if (allMatched) {
        setOptimisticMessages([]);
      }
    }
  }, [messages, optimisticMessages, isAdminPage]);

  // Focus input when chat opens
  useEffect(() => {
    if (isAdminPage || !isOpen || !inputRef.current) return;
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeoutId);
  }, [isOpen, isAdminPage]);

  if (isAdminPage) {
    return null;
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || isSending) return;

    const message = inputMessage.trim();
    
    // Add optimistic user message immediately
    const optimisticUserMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user" as const,
      content: message,
    };
    setOptimisticMessages(prev => [...prev, optimisticUserMessage]);
    
    // Clear input
    setInputMessage("");

    try {
      await sendMessage(message);
      // Optimistic message will be cleared when real messages arrive
    } catch (error) {
      // Remove failed optimistic message
      setOptimisticMessages(prev => prev.filter(m => m.id !== optimisticUserMessage.id));
      toast({
        title: "Lỗi",
        description: "Không thể gửi tin nhắn. Vui lòng thử lại sau.",
        variant: "destructive",
      });
    }
  };

  const handleAddToCart = async (product: SuggestedProduct) => {
    // Check stock before adding to cart
    const availableStock = product.stock_quantity ?? 0;
    if (availableStock <= 0) {
      toast({
        variant: "destructive",
        title: "Sản phẩm đã hết hàng",
        description: "Vui lòng chọn sản phẩm khác.",
      });
      return;
    }
    
    addItem({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.original_price || product.price,
      salePrice: product.original_price ? product.price : null,
      image: product.image_url || productPepper,
    });
    toast({
      title: "Đã thêm vào giỏ hàng",
      description: product.name,
    });
  };

  const handleClearConversation = async () => {
    setOptimisticMessages([]);
    await clearConversation();
    toast({
      title: "Đã xóa cuộc trò chuyện",
      description: "Cuộc trò chuyện đã được xóa.",
    });
  };

  return (
    <>
      {/* Chatbot Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "w-16 h-16 rounded-full",
          "bg-gradient-to-br from-primary to-primary/80",
          "shadow-lg shadow-primary/50",
          "flex items-center justify-center",
          "text-white",
          "transition-all duration-300",
          "hover:scale-110 hover:shadow-xl hover:shadow-primary/60",
          "active:scale-95"
        )}
        aria-label="AI Tư vấn sản phẩm"
      >
        {!isOpen ? (
          <Bot className="w-8 h-8" />
        ) : (
          <X className="w-6 h-6 animate-in fade-in duration-200" />
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Chat Card */}
          <div
            className={cn(
              // Mobile: full-width card with safe margins, centered
              "fixed inset-x-3 bottom-24 z-50 max-w-md mx-auto",
              // Desktop: docked to bottom-right
              "sm:inset-auto sm:bottom-24 sm:right-6 sm:mx-0",
              // Sizing
              "w-[calc(100%-1.5rem)] sm:w-96 h-[70vh] max-h-[80vh]",
              "bg-card rounded-2xl shadow-2xl",
              "animate-in slide-in-from-bottom-4 fade-in duration-300",
              "flex flex-col",
              "border border-border"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-primary/5">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">AI Tư vấn sản phẩm</h3>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleClearConversation}
                    aria-label="Xóa cuộc trò chuyện"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsOpen(false)}
                  aria-label="Đóng"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 && optimisticMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
                  <Bot className="w-12 h-12 text-primary/50" />
                  <p className="text-muted-foreground">
                    Xin chào! Tôi là AI tư vấn sản phẩm. Tôi có thể giúp bạn:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Tìm sản phẩm phù hợp</li>
                    <li>• So sánh sản phẩm</li>
                    <li>• Trả lời câu hỏi về sản phẩm</li>
                    <li>• Hỗ trợ đặt hàng</li>
                  </ul>
                </div>
              ) : (
                <>
                  {/* Display real messages from database */}
                  {messages.map((msg) => {
                    // Get suggested products from metadata
                    const suggestedProductsData = (msg.metadata as any)?.suggestedProductsData || [];
                    const hasProducts = suggestedProductsData.length > 0;

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg p-3",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>

                          {/* Product Suggestions */}
                          {hasProducts && (
                            <div className="mt-3 space-y-2">
                              {suggestedProductsData.map((product: SuggestedProduct) => (
                                <Card key={product.id} className="p-3 bg-background border-border">
                                  <div className="flex gap-3">
                                    {product.image_url && (
                                      <img
                                        src={product.image_url}
                                        alt={product.name}
                                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                                      />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-medium text-sm line-clamp-2 mb-1">
                                        {product.name}
                                      </h4>
                                      {product.badge && (
                                        <Badge className="mb-1 text-xs">{product.badge}</Badge>
                                      )}
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-primary font-bold text-sm">
                                          {formatPrice(product.price)}
                                        </span>
                                        {product.original_price && (
                                          <span className="text-muted-foreground text-xs line-through">
                                            {formatPrice(product.original_price)}
                                          </span>
                                        )}
                                      </div>
                                      {/* Action buttons – stack on mobile, inline on larger screens to tránh lệch layout */}
                                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 text-xs w-full sm:w-auto sm:flex-1"
                                          asChild
                                        >
                                          <Link to={`/product/${product.slug}`} onClick={() => setIsOpen(false)}>
                                            <Eye className="w-3 h-3 mr-1" />
                                            Xem
                                          </Link>
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-8 text-xs w-full sm:w-auto sm:flex-1"
                                          onClick={() => handleAddToCart(product)}
                                        >
                                          <ShoppingCart className="w-3 h-3 mr-1" />
                                          Thêm
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Display optimistic messages (pending user messages) */}
                  {optimisticMessages.map((msg) => {
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg p-3",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                            msg.isPending && "opacity-70"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Typing Indicator */}
              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-background">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Nhập câu hỏi của bạn..."
                  disabled={isSending}
                  maxLength={1000}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputMessage.trim() || isSending}
                  className="flex-shrink-0"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
              {error && (
                <p className="text-xs text-destructive mt-2">
                  Có lỗi xảy ra. Vui lòng thử lại sau.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default AIChatbot;

