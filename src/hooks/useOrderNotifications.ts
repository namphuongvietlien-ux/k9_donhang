import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

interface Order {
  id: string;
  customer_name: string;
  total_amount: number;
  created_at: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
};

export const useOrderNotifications = () => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { hasPermission, permissions } = usePermissions();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Check both admin status and permission
    if (!isAdmin || !hasPermission('orders.view')) return;

    // Create notification sound
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVAqM5HH47B+USpGpcq8Zy4qQoSqyL1+SDBKlr/Ao2tIPm+bwraAUEZggp7HuoRRWm6WsrSAUFBkjKy0hFtYaoGkrn9cWmh6oLGLZmFuhZ+0jmlqb4GZr4llY22BmLGOb2pvfpWtjW9pcYCVrYxwaXB/k6qNcmhxgJKojHJncYCRpolzaHGAkKaIc2hygJGmh3Nocn+QpYh0aHJ/kKWIdGhyf5CliHRocn+QpYhzaHJ/kKWIdGhyf5CliHNocn+QpYh0aHJ/kKWIdGhyf4+liHRocn+PpYh0aHJ/j6WIdGhyf4+liHRocn+PpYd0aHJ/j6WHdGhyf4+lh3Rocn+PpYd0aHJ/j6WHdGhyf4+lh3Rocn+PpYd0aHJ/j6WHdGhyf4+lh3Rocn+PpYd0aHJ/j6WHdGhyf4+lh3Rocn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+lh3Rncn+PpYd0Z3J/j6WHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+PpId0Z3J/j6SHdGdyf4+kh3Rncn+OpId0Z3J/j6SHdGdyf4+kh3Rncn+OpId0Z3J/j6SHdGdyf4+kh3Rncn+OpId0Z3J/jqSHdGdyf4+kh3Rncn+OpId0Z3J/jqSHdGdyf4+kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdGdyf46kh3Rncn+OpId0Z3J/jqSHdA==");

    const channel = supabase
      .channel("admin-order-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const newOrder = payload.new as Order;
          
          // Play notification sound
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }

          // Show toast notification
          toast({
            title: "🛒 Đơn hàng mới!",
            description: `${newOrder.customer_name} vừa đặt đơn hàng ${formatCurrency(newOrder.total_amount)}`,
            duration: 8000,
          });
        }
      )
      .subscribe(() => {
        // Channel subscribed
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, hasPermission, permissions, toast]);
};
