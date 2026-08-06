import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays, subMonths, format, eachDayOfInterval, startOfMonth, endOfMonth, eachMonthOfInterval, isSameDay } from "date-fns";
import { vi } from "date-fns/locale";

export type TimeRange = "today" | "week" | "month";

interface DailyRevenue {
  date: string;
  revenue: number;
  ecommerceRevenue: number;
  orders: number;
  websiteOrders: number;
  ecommerceOrders: number;
}

interface DashboardStats {
  totalProducts: number;
  newOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  revenueChange: number;
  ordersChange: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
};

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardStats> => {
      const today = new Date();
      const lastWeek = subDays(today, 7);
      const twoWeeksAgo = subDays(today, 14);

      // Get total products
      const { count: totalProducts } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Get low stock products
      const { data: stockData } = await supabase
        .from("products")
        .select("stock_quantity, low_stock_threshold")
        .eq("is_active", true);

      const lowStockProducts = stockData?.filter(p => 
        p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
      ).length || 0;

      const outOfStockProducts = stockData?.filter(p => 
        p.stock_quantity === 0
      ).length || 0;

      // Get new orders (last 7 days)
      const { count: newOrders } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", lastWeek.toISOString());

      // Get orders from previous week for comparison
      const { count: previousWeekOrders } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", lastWeek.toISOString());

      // Get unique customers
      const { data: customersData } = await supabase
        .from("orders")
        .select("user_id");
      
      const uniqueCustomers = new Set(customersData?.map(o => o.user_id).filter(Boolean));

      // Get total revenue
      const { data: revenueData } = await supabase
        .from("orders")
        .select("total_amount, discount_amount, created_at")
        .eq("status", "completed");

      const totalRevenue = revenueData?.reduce((sum, order) => {
        return sum + (order.total_amount - (order.discount_amount || 0));
      }, 0) || 0;

      // Calculate revenue from last week
      const lastWeekRevenue = revenueData?.filter(order => 
        new Date(order.created_at) >= lastWeek
      ).reduce((sum, order) => sum + (order.total_amount - (order.discount_amount || 0)), 0) || 0;

      // Calculate revenue from previous week
      const previousWeekRevenue = revenueData?.filter(order => {
        const date = new Date(order.created_at);
        return date >= twoWeeksAgo && date < lastWeek;
      }).reduce((sum, order) => sum + (order.total_amount - (order.discount_amount || 0)), 0) || 0;

      const revenueChange = previousWeekRevenue > 0 
        ? ((lastWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100 
        : 0;

      const ordersChange = (previousWeekOrders || 0) > 0 
        ? (((newOrders || 0) - (previousWeekOrders || 0)) / (previousWeekOrders || 1)) * 100 
        : 0;

      return {
        totalProducts: totalProducts || 0,
        newOrders: newOrders || 0,
        totalCustomers: uniqueCustomers.size,
        totalRevenue,
        revenueChange,
        ordersChange,
        lowStockProducts,
        outOfStockProducts,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useRevenueChart = (timeRange: TimeRange, dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ["revenue-chart", timeRange, dateFrom, dateTo],
    queryFn: async (): Promise<DailyRevenue[]> => {
      const today = new Date();
      let startDate: Date;
      let endDate: Date;
      let dateFormat: string;
      let intervals: Date[];
      
      // If custom date range is provided, use it
      if (dateFrom && dateTo) {
        startDate = startOfDay(new Date(dateFrom));
        endDate = endOfDay(new Date(dateTo));
        // Determine format based on range length
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 7) {
          dateFormat = "EEE";
          intervals = eachDayOfInterval({ start: startDate, end: endDate });
        } else if (daysDiff <= 31) {
          dateFormat = "dd/MM";
          intervals = eachDayOfInterval({ start: startDate, end: endDate });
        } else {
          dateFormat = "MMM";
          intervals = eachMonthOfInterval({ start: startOfMonth(startDate), end: endOfMonth(endDate) });
        }
      } else {
        // Use preset timeRange
        switch (timeRange) {
          case "today":
            startDate = startOfDay(today);
            endDate = endOfDay(today);
            dateFormat = "HH:mm";
            // For today, show hourly intervals (0-23 hours)
            intervals = [];
            for (let i = 0; i <= 23; i++) {
              const hour = new Date(today);
              hour.setHours(i, 0, 0, 0);
              intervals.push(hour);
            }
            break;
          case "week":
            startDate = subDays(today, 6);
            endDate = today;
            dateFormat = "EEE";
            intervals = eachDayOfInterval({ start: startDate, end: today });
            break;
          case "month":
            startDate = subDays(today, 29);
            endDate = today;
            dateFormat = "dd/MM";
            intervals = eachDayOfInterval({ start: startDate, end: today });
            break;
          default:
            startDate = subDays(today, 6);
            endDate = today;
            dateFormat = "EEE";
            intervals = eachDayOfInterval({ start: startDate, end: today });
        }
      }

      // Get website orders - for today include all orders, for past days only completed
      const queryStartDate = dateFrom ? startOfDay(new Date(dateFrom)) : startOfDay(startDate);
      const queryEndDate = dateTo ? endOfDay(new Date(dateTo)) : endOfDay(today);
      
      // Get all orders from start date to end date
      const { data: allOrders } = await supabase
        .from("orders")
        .select("total_amount, discount_amount, created_at, status")
        .gte("created_at", queryStartDate.toISOString())
        .lte("created_at", queryEndDate.toISOString());

      // Get all ecommerce orders from start date to end date
      const { data: allEcommerceOrders } = await supabase
        .from("ecommerce_orders")
        .select("total_amount, created_at, status")
        .gte("created_at", queryStartDate.toISOString())
        .lte("created_at", queryEndDate.toISOString());

      const revenueByDate = new Map<string, { revenue: number; ecommerceRevenue: number; orders: number; websiteOrders: number; ecommerceOrders: number }>();

      // Helper function to check if using today preset
      const isTodayPreset = !dateTo && timeRange === "today";
      
      // Helper function to check if order is from today
      const isOrderFromToday = (orderDate: Date) => isSameDay(orderDate, today);

      // Initialize all dates with 0
      intervals.forEach(date => {
        // For today preset, format by hour; otherwise use date format
        const key = isTodayPreset ? format(date, "HH:mm", { locale: vi }) : format(date, dateFormat, { locale: vi });
        revenueByDate.set(key, { revenue: 0, ecommerceRevenue: 0, orders: 0, websiteOrders: 0, ecommerceOrders: 0 });
      });

      // Aggregate website orders
      allOrders?.forEach(order => {
        const orderDate = new Date(order.created_at);
        const orderIsToday = isOrderFromToday(orderDate);
        
        // For today preset: include all orders from today (real-time data)
        // For past days or custom range: only include completed orders
        if (!orderIsToday && order.status !== "completed") {
          return;
        }
        
        // Skip if not from today when using today preset
        if (isTodayPreset && !orderIsToday) {
          return;
        }
        
        // For today preset, format by hour; otherwise use date format
        const key = isTodayPreset ? format(orderDate, "HH:mm", { locale: vi }) : format(orderDate, dateFormat, { locale: vi });
        const existing = revenueByDate.get(key) || { revenue: 0, ecommerceRevenue: 0, orders: 0, websiteOrders: 0, ecommerceOrders: 0 };
        revenueByDate.set(key, {
          revenue: existing.revenue + (order.total_amount - (order.discount_amount || 0)),
          ecommerceRevenue: existing.ecommerceRevenue,
          orders: existing.orders + 1,
          websiteOrders: existing.websiteOrders + 1,
          ecommerceOrders: existing.ecommerceOrders,
        });
      });

      // Aggregate ecommerce orders
      allEcommerceOrders?.forEach(order => {
        const orderDate = new Date(order.created_at);
        const orderIsToday = isOrderFromToday(orderDate);
        
        // For today preset: include all orders from today (real-time data)
        // For past days or custom range: only include delivered orders
        if (!orderIsToday && order.status !== "delivered") {
          return;
        }
        
        // Skip if not from today when using today preset
        if (isTodayPreset && !orderIsToday) {
          return;
        }
        
        // For today preset, format by hour; otherwise use date format
        const key = isTodayPreset ? format(orderDate, "HH:mm", { locale: vi }) : format(orderDate, dateFormat, { locale: vi });
        
        const existing = revenueByDate.get(key) || { revenue: 0, ecommerceRevenue: 0, orders: 0, websiteOrders: 0, ecommerceOrders: 0 };
        revenueByDate.set(key, {
          revenue: existing.revenue,
          ecommerceRevenue: existing.ecommerceRevenue + (order.total_amount || 0),
          orders: existing.orders + 1, // Count ecommerce orders in total orders
          websiteOrders: existing.websiteOrders,
          ecommerceOrders: existing.ecommerceOrders + 1,
        });
      });

      return Array.from(revenueByDate.entries()).map(([date, data]) => ({
        date,
        revenue: data.revenue + data.ecommerceRevenue, // Total revenue
        ecommerceRevenue: data.ecommerceRevenue,
        orders: data.orders,
        websiteOrders: data.websiteOrders,
        ecommerceOrders: data.ecommerceOrders,
      }));
    },
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
};

export const useRecentOrders = () => {
  return useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, customer_name, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });
};

export const useTopProducts = () => {
  return useQuery({
    queryKey: ["top-products"],
    queryFn: async () => {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("product_name, product_slug, product_image, quantity, price");

      if (!orderItems) return [];

      const productSales = new Map<string, { 
        quantity: number; 
        revenue: number;
        slug: string | null;
        image: string | null;
      }>();
      
      orderItems.forEach(item => {
        const existing = productSales.get(item.product_name) || { 
          quantity: 0, 
          revenue: 0,
          slug: item.product_slug || null,
          image: item.product_image || null,
        };
        productSales.set(item.product_name, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity),
          slug: existing.slug || item.product_slug || null,
          image: existing.image || item.product_image || null,
        });
      });

      return Array.from(productSales.entries())
        .map(([name, data]) => ({ 
          name, 
          ...data,
          slug: data.slug,
          image: data.image,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    },
    staleTime: 1000 * 60 * 5,
  });
};

export { formatCurrency };
