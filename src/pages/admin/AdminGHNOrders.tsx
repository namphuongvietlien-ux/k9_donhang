import { useState, useMemo } from "react";
import { Plus, Loader2, RefreshCw, Eye, Trash2, Package, CheckCircle2, XCircle, Download, DollarSign, Upload, FileText, FileSpreadsheet } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { read, utils, write } from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import {
  useEcommerceOrders,
  useCreateEcommerceOrder,
  useSyncGHNTracking,
  useAddEcommerceOrderItems,
  useDeleteEcommerceOrderItem,
  useEcommerceOrder,
  type EcommerceOrder,
} from "@/hooks/useEcommerceOrders";
import { fetchGHNTracking, parseGHNTrackingFromAPI } from "@/utils/ghnApi";
import { calculateShopeeFeesWithQuantity, DEFAULT_SHOPEE_FEE_CONFIG } from "@/utils/shopeeFeeCalculator";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const getStatusBadge = (status: string) => {
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Chờ xử lý", variant: "outline" },
    tracking: { label: "Đang theo dõi", variant: "secondary" },
    in_transit: { label: "Đang vận chuyển", variant: "secondary" },
    delivered: { label: "Đã giao hàng", variant: "default" },
    returned: { label: "Đã trả hàng", variant: "destructive" },
    cancelled: { label: "Đã hủy", variant: "destructive" },
  };
  const statusInfo = statusMap[status] || { label: status, variant: "outline" };
  return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
};

interface OrderItem {
  internal_product_id: string;
  quantity: number;
  unit_price: number;
  product_name: string;
}

const AdminGHNOrders = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{
    total: number;
    processed: number;
    success: number;
    failed: number;
    skipped: number;
    results: Array<{ code: string; status: "success" | "error" | "skipped"; message: string }>;
  } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [isSettlementDialogOpen, setIsSettlementDialogOpen] = useState(false);
  const [settlementOrderId, setSettlementOrderId] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<number>(0);
  const [settlementStatus, setSettlementStatus] = useState<"pending" | "partial" | "completed" | "cancelled">("completed");
  const [settlementNotes, setSettlementNotes] = useState<string>("");
  const [isSavingSettlement, setIsSavingSettlement] = useState(false);
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);
  const [bulkTrackingCodes, setBulkTrackingCodes] = useState<string>("");
  const [bulkExcelFile, setBulkExcelFile] = useState<File | null>(null);
  const [bulkExcelData, setBulkExcelData] = useState<Array<{
    trackingCode: string;
    productCode?: string;
    productName?: string;
    price: number;
    quantity: number;
  }>>([]);
  const [bulkImportProgress, setBulkImportProgress] = useState<{
    total: number;
    processed: number;
    success: number;
    failed: number;
    results: Array<{ code: string; status: "success" | "error" | "skipped"; message: string }>;
  } | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const { toast } = useToast();

  const { data: orders = [], isLoading } = useEcommerceOrders("ghn");
  const createOrderMutation = useCreateEcommerceOrder();
  const syncTrackingMutation = useSyncGHNTracking();
  const addItemsMutation = useAddEcommerceOrderItems();
  const deleteItemMutation = useDeleteEcommerceOrderItem();
  const { data: selectedOrderData } = useEcommerceOrder(selectedOrderId || "");
  const queryClient = useQueryClient();

  const { products: sharedProducts = [] } = useProducts();
  const products = (sharedProducts as Array<{ id: string; name: string; slug?: string; price?: number; stock_quantity?: number; is_active?: boolean }> || []).filter(
    (product) => product.is_active !== false
  );

  // Fetch order items for all orders to calculate settlement
  const { data: orderItemsMap = {} } = useQuery({
    queryKey: ["ecommerce-order-items-ghn", orders.map((o) => o.id).join(",")],
    queryFn: async () => {
      if (orders.length === 0) return {};

      const { data, error } = await supabase
        .from("ecommerce_order_items")
        .select("*")
        .in(
          "ecommerce_order_id",
          orders.map((o) => o.id)
        );

      if (error) throw error;

      // Group by order_id
      const map: Record<string, Array<{ quantity: number; unit_price: number; total_price: number }>> = {};
      (data || []).forEach((item) => {
        if (!map[item.ecommerce_order_id]) {
          map[item.ecommerce_order_id] = [];
        }
        map[item.ecommerce_order_id].push({
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        });
      });

      return map;
    },
    enabled: orders.length > 0,
  });

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "all", label: "Tất cả" },
        { value: "pending", label: "Chờ xử lý" },
        { value: "tracking", label: "Đang theo dõi" },
        { value: "in_transit", label: "Đang vận chuyển" },
        { value: "delivered", label: "Đã giao hàng" },
        { value: "returned", label: "Đã trả hàng" },
        { value: "cancelled", label: "Đã hủy" },
      ],
    },
  ];

  // Calculate date range from date inputs
  const dateRange = useMemo(() => {
    if (!dateFrom && !dateTo) return null;
    
    const start = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const end = dateTo ? new Date(dateTo + "T23:59:59") : null;
    
    return { start, end };
  }, [dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchQuery ||
        order.tracking_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.platform_order_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      
      // Date filter
      let matchesDate = true;
      if (dateRange) {
        const orderDate = new Date(order.created_at);
        if (dateRange.start && orderDate < dateRange.start) {
          matchesDate = false;
        }
        if (dateRange.end && orderDate > dateRange.end) {
          matchesDate = false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, searchQuery, statusFilter, dateRange]);

  // Calculate settlement amount for each order (auto-calculate)
  // For GHN, use Shopee fee calculator to calculate net revenue (same as Shopee orders)
  const ordersWithSettlement = useMemo(() => {
    return filteredOrders.map((order) => {
      const items = orderItemsMap[order.id] || [];
      let settlementAmount = order.total_amount; // Default to total_amount if no items

      if (items.length > 0) {
        // Calculate total sales and total quantity
        const totalSales = items.reduce((sum, item) => sum + Number(item.total_price), 0);
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

        // Calculate fees using Shopee fee calculator (KẾ TOÁN SÀN SHOPEE)
        const feeCalculation = calculateShopeeFeesWithQuantity(
          totalSales,
          totalQuantity,
          0, // shippingFee
          DEFAULT_SHOPEE_FEE_CONFIG
        );

        settlementAmount = feeCalculation.netRevenue;
      }

      return {
        ...order,
        settlementAmount,
      };
    });
  }, [filteredOrders, orderItemsMap]);

  const paginatedOrders = ordersWithSettlement.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddItemToOrder = () => {
    if (!selectedProductId || quantity <= 0 || unitPrice <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập đầy đủ thông tin",
      });
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const newItem: OrderItem = {
      internal_product_id: selectedProductId,
      quantity,
      unit_price: unitPrice,
      product_name: product.name,
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedProductId("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleAddOrder = async () => {
    if (!trackingCode.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập mã vận chuyển",
      });
      return;
    }

    // Auto-add selected product if user filled in product info but didn't click "Thêm"
    let finalOrderItems = [...orderItems];
    if (finalOrderItems.length === 0 && selectedProductId && quantity > 0 && unitPrice > 0) {
      const product = products.find((p) => p.id === selectedProductId);
      if (product) {
        finalOrderItems = [{
          internal_product_id: selectedProductId,
          quantity,
          unit_price: unitPrice,
          product_name: product.name,
        }];
      }
    }

    if (finalOrderItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng thêm ít nhất một sản phẩm",
      });
      return;
    }

    try {
      // Check if order with this tracking code already exists
      const { data: existingOrder } = await supabase
        .from("ecommerce_orders")
        .select("id, tracking_code, platform_code")
        .eq("tracking_code", trackingCode.trim())
        .eq("platform_code", "ghn")
        .maybeSingle();

      if (existingOrder) {
        // If order exists, show dialog to confirm action
        toast({
          title: "Đơn hàng đã tồn tại",
          description: `Đơn hàng với mã vận đơn "${trackingCode.trim()}" đã tồn tại. Đang mở đơn hàng hiện có...`,
        });
        
        // Close add dialog
        setIsAddDialogOpen(false);
        
        // Reset form
        setTrackingCode("");
        setOrderItems([]);
        setSelectedProductId("");
        setQuantity(1);
        setUnitPrice(0);
        
        // Open existing order details
        setSelectedOrderId(existingOrder.id);
        setIsProductDialogOpen(true);
        
        return;
      }

      // Create order
      const order = await createOrderMutation.mutateAsync({
        trackingCode: trackingCode.trim(),
        platformCode: "ghn",
      });

      // Add items to order (use finalOrderItems which may include auto-added product)
      await addItemsMutation.mutateAsync({
        orderId: order.id,
        items: finalOrderItems.map((item) => ({
          internal_product_id: item.internal_product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });

      // After creating order and items, sync tracking
      await handleSyncTracking(order.id, trackingCode.trim());

      // Reset form
      setTrackingCode("");
      setOrderItems([]);
      setSelectedProductId("");
      setQuantity(1);
      setUnitPrice(0);
      setIsAddDialogOpen(false);
      
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleSyncTracking = async (orderId: string, code: string, silent = false) => {
    setIsSyncing(true);
    try {
      // Fetch tracking data from GHN API
      const apiResponse = await fetchGHNTracking(code);

      // Parse API response to our tracking format
      const trackingData = parseGHNTrackingFromAPI(apiResponse, code);

      // Sync to database
      await syncTrackingMutation.mutateAsync({
        orderId,
        trackingData,
      });

      if (!silent) {
        toast({
          title: "Thành công",
          description: "Đã đồng bộ tracking thành công",
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error syncing tracking:", error);
      }
      if (!silent) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: error instanceof Error ? error.message : "Không thể sync tracking. Vui lòng thử lại sau.",
        });
      }
      throw error; // Re-throw for handleSyncAllTracking to catch
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAllTracking = async () => {
    setIsSyncingAll(true);
    setSyncAllProgress({ total: 0, processed: 0, success: 0, failed: 0, skipped: 0, results: [] });

    // Filter orders: exclude delivered status
    const ordersToSync = filteredOrders.filter(order => order.status !== "delivered");
    const totalOrders = ordersToSync.length;

    if (totalOrders === 0) {
      toast({
        title: "Thông báo",
        description: "Không có đơn hàng nào cần sync (tất cả đã giao hàng hoặc không có đơn hàng).",
      });
      setIsSyncingAll(false);
      setSyncAllProgress(null);
      return;
    }

    setSyncAllProgress(prev => ({ ...prev!, total: totalOrders }));

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const results: Array<{ code: string; status: "success" | "error" | "skipped"; message: string }> = [];

    // Sync sequentially to avoid rate limiting
    for (const order of ordersToSync) {
      processedCount++;
      setSyncAllProgress(prev => ({ ...prev!, processed: processedCount }));

      try {
        await handleSyncTracking(order.id, order.tracking_code, true); // silent = true
        successCount++;
        results.push({ code: order.tracking_code, status: "success", message: "Đồng bộ thành công" });
      } catch (error: any) {
        failedCount++;
        results.push({ code: order.tracking_code, status: "error", message: error.message || "Lỗi không xác định" });
      }

      setSyncAllProgress(prev => ({ ...prev!, success: successCount, failed: failedCount, skipped: skippedCount, results }));

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast({
      title: "Hoàn thành đồng bộ",
      description: `Đã xử lý ${totalOrders} đơn hàng. Thành công: ${successCount}, Thất bại: ${failedCount}, Bỏ qua: ${skippedCount}.`,
    });

    setIsSyncingAll(false);
    // Hide progress after a short delay
    setTimeout(() => setSyncAllProgress(null), 3000);
    queryClient.invalidateQueries({ queryKey: ["ecommerce-orders", "ghn"] });
  };

  const handleAddProducts = () => {
    if (!selectedOrderId) return;
    setIsProductDialogOpen(true);
  };

  const handleDownloadTemplate = () => {
    // Create sample data
    const sampleData = [
      {
        "Mã vận đơn": "GYDDGE3K",
        "Mã sản phẩm": "PROD001",
        "Tên sản phẩm": "Sản phẩm mẫu 1",
        "Giá": 100000,
        "Số lượng": 1,
      },
      {
        "Mã vận đơn": "GYDDGE4K",
        "Mã sản phẩm": "",
        "Tên sản phẩm": "Sản phẩm mẫu 2",
        "Giá": 150000,
        "Số lượng": 2,
      },
      {
        "Mã vận đơn": "GYDDGE5K",
        "Mã sản phẩm": "PROD003",
        "Tên sản phẩm": "",
        "Giá": 200000,
        "Số lượng": 1,
      },
    ];

    // Create workbook and worksheet
    const worksheet = utils.json_to_sheet(sampleData);
    const workbook = { Sheets: { "Mẫu": worksheet }, SheetNames: ["Mẫu"] };

    // Generate Excel file
    const excelBuffer = write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-tai-hang-loat-ghn.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Thành công",
      description: "Đã tải xuống file mẫu",
    });
  };

  const handleExcelFileUpload = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = read(arrayBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "File Excel phải có ít nhất 1 dòng dữ liệu (không tính header)",
        });
        return;
      }

      // Parse header row (first row)
      const headers = jsonData[0].map((h: any) => String(h || "").trim());
      const headersLower = headers.map((h: string) => h.toLowerCase());
      
      const trackingCodeIndex = headersLower.findIndex((h: string) => 
        h === "mã vận đơn" || h.includes("mã vận đơn") || h.includes("tracking") || h.includes("mã vận")
      );
      const productCodeIndex = headersLower.findIndex((h: string) => 
        h === "mã sản phẩm" || h.includes("mã sản phẩm") || h.includes("product code") || h.includes("sku")
      );
      const productNameIndex = headersLower.findIndex((h: string) => 
        h === "tên sản phẩm" || (h.includes("tên") && h.includes("sản phẩm")) || h.includes("product name")
      );
      const priceIndex = headersLower.findIndex((h: string) => 
        (h === "giá" || h.includes("giá") || h.includes("price") || h.includes("đơn giá")) &&
        !h.includes("tổng") // Exclude "Tổng giá"
      );
      const quantityIndex = headersLower.findIndex((h: string) => 
        h === "số lượng" || h === "sl" || h.includes("số lượng") || h.includes("quantity") || h.includes("qty")
      );

      if (trackingCodeIndex === -1) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Không tìm thấy cột 'Mã vận đơn' trong file Excel",
        });
        return;
      }

      // Parse data rows
      const parsedData: Array<{
        trackingCode: string;
        productCode?: string;
        productName?: string;
        price: number;
        quantity: number;
      }> = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const trackingCode = String(row[trackingCodeIndex] || "").trim();
        
        if (!trackingCode) continue;

        const productCode = productCodeIndex !== -1 ? String(row[productCodeIndex] || "").trim() : undefined;
        const productName = productNameIndex !== -1 ? String(row[productNameIndex] || "").trim() : undefined;
        const price = priceIndex !== -1 ? Number(row[priceIndex] || 0) : 0;
        const quantity = quantityIndex !== -1 ? Number(row[quantityIndex] || 1) : 1;

        parsedData.push({
          trackingCode,
          productCode: productCode && productCode.length > 0 ? productCode : undefined,
          productName: productName && productName.length > 0 ? productName : undefined,
          price,
          quantity,
        });
      }

      if (parsedData.length === 0) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Không tìm thấy dữ liệu hợp lệ trong file Excel",
        });
        return;
      }

      setBulkExcelData(parsedData);
      toast({
        title: "Thành công",
        description: `Đã đọc ${parsedData.length} dòng dữ liệu từ file Excel`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Không thể đọc file Excel: ${error.message}`,
      });
    }
  };

  const handleBulkImport = async () => {
    let itemsToProcess: Array<{
      trackingCode: string;
      productCode?: string;
      productName?: string;
      price: number;
      quantity: number;
    }> = [];

    // Check if using Excel data or text input
    if (bulkExcelData.length > 0) {
      itemsToProcess = bulkExcelData;
    } else if (bulkTrackingCodes.trim()) {
      // Parse tracking codes from text (one per line)
      const codes = bulkTrackingCodes
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      
      itemsToProcess = codes.map((code) => ({
        trackingCode: code,
        price: 0,
        quantity: 1,
      }));
    } else {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập mã vận đơn hoặc upload file Excel",
      });
      return;
    }

    if (itemsToProcess.length === 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không tìm thấy dữ liệu hợp lệ",
      });
      return;
    }

    setIsBulkImporting(true);
    setBulkImportProgress({
      total: itemsToProcess.length,
      processed: 0,
      success: 0,
      failed: 0,
      results: [],
    });

    const results: Array<{ code: string; status: "success" | "error" | "skipped"; message: string }> = [];

    for (const item of itemsToProcess) {
      try {
        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from("ecommerce_orders")
          .select("id, tracking_code, platform_code")
          .eq("tracking_code", item.trackingCode)
          .eq("platform_code", "ghn")
          .maybeSingle();

        if (existingOrder) {
          results.push({
            code: item.trackingCode,
            status: "skipped",
            message: "Đơn hàng đã tồn tại",
          });
          setBulkImportProgress((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              processed: prev.processed + 1,
              results: [...prev.results, results[results.length - 1]],
            };
          });
          continue;
        }

        // Create order
        const order = await createOrderMutation.mutateAsync({
          trackingCode: item.trackingCode,
          platformCode: "ghn",
        });

        // Find product by code (slug) or name
        let productId: string | null = null;
        let foundProductName: string | null = null;
        
        if (item.productCode && item.productCode.length > 0) {
          // Try to find by slug first, then by exact name match, then partial match
          const product = products.find((p) => 
            (p as any).slug === item.productCode || 
            p.name.toLowerCase() === item.productCode!.toLowerCase()
          ) || products.find((p) => 
            p.name.toLowerCase().includes(item.productCode!.toLowerCase())
          );
          if (product) {
            productId = product.id;
            foundProductName = product.name;
          }
        }
        
        // If not found by code, try by name
        if (!productId && item.productName && item.productName.length > 0) {
          // Find by exact name match first, then partial match
          const product = products.find((p) => 
            p.name.toLowerCase() === item.productName!.toLowerCase()
          ) || products.find((p) => 
            p.name.toLowerCase().includes(item.productName!.toLowerCase())
          );
          if (product) {
            productId = product.id;
            foundProductName = product.name;
          }
        }

        // Add product to order - always add if we have price
        // If product not found, we'll still create order with total_amount but no items
        // User can add product manually later
        let totalAmount = 0;
        
        if (item.price > 0 && productId) {
          // Add item with product
          await addItemsMutation.mutateAsync({
            orderId: order.id,
            items: [{
              internal_product_id: productId,
              quantity: item.quantity || 1,
              unit_price: item.price,
            }],
          });
          
          totalAmount = item.price * (item.quantity || 1);
        } else if (item.price > 0) {
          // Product not found but we have price - set total_amount directly
          totalAmount = item.price * (item.quantity || 1);
        }

        // Update order total_amount
        if (totalAmount > 0) {
          await supabase
            .from("ecommerce_orders")
            .update({ total_amount: totalAmount })
            .eq("id", order.id);
        }

        // Sync tracking
        await handleSyncTracking(order.id, item.trackingCode);

        results.push({
          code: item.trackingCode,
          status: "success",
          message: productId ? "Thành công (đã thêm sản phẩm)" : "Thành công",
        });

        setBulkImportProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            processed: prev.processed + 1,
            success: prev.success + 1,
            results: [...prev.results, results[results.length - 1]],
          };
        });
      } catch (error: any) {
        results.push({
          code: item.trackingCode,
          status: "error",
          message: error.message || "Lỗi không xác định",
        });

        setBulkImportProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            processed: prev.processed + 1,
            failed: prev.failed + 1,
            results: [...prev.results, results[results.length - 1]],
          };
        });
      }
    }

    setIsBulkImporting(false);
    
    toast({
      title: "Hoàn thành",
      description: `Đã xử lý ${itemsToProcess.length} đơn hàng. Thành công: ${results.filter((r) => r.status === "success").length}, Thất bại: ${results.filter((r) => r.status === "error").length}, Bỏ qua: ${results.filter((r) => r.status === "skipped").length}`,
    });

    // Refresh orders list
    queryClient.invalidateQueries({ queryKey: ["ecommerce-orders", "ghn"] });
    
    // Reset form
    setBulkTrackingCodes("");
    setBulkExcelFile(null);
    setBulkExcelData([]);
  };

  const handleSaveSettlement = async () => {
    if (!settlementOrderId) return;

    if (settlementAmount < 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Số tiền quyết toán không được âm",
      });
      return;
    }

    setIsSavingSettlement(true);
    try {
      const updateData: any = {
        settlement_status: settlementStatus,
        settlement_amount: settlementAmount,
        settlement_notes: settlementNotes || null,
      };

      // Set settlement_date if status is completed or partial
      if (settlementStatus === "completed" || settlementStatus === "partial") {
        updateData.settlement_date = new Date().toISOString();
      } else if (settlementStatus === "pending") {
        updateData.settlement_date = null;
      }

      const { error } = await supabase
        .from("ecommerce_orders")
        .update(updateData)
        .eq("id", settlementOrderId);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã cập nhật quyết toán tiền",
      });

      // Refresh orders
      await queryClient.invalidateQueries({ queryKey: ["ecommerce-orders", "ghn"] });
      
      // Close dialog
      setIsSettlementDialogOpen(false);
      setSettlementOrderId(null);
      setSettlementAmount(0);
      setSettlementStatus("completed");
      setSettlementNotes("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể lưu quyết toán",
      });
    } finally {
      setIsSavingSettlement(false);
    }
  };

  const handleExportCSV = () => {
    try {
      // Prepare CSV headers
      const headers = [
        "Mã vận đơn",
        "Trạng thái",
        "Milestone",
        "Ngày lấy hàng",
        "Ngày giao hàng",
        "Tổng tiền",
        "Quyết toán tiền",
        "Ngày tạo",
        "Người nhận",
        "Số lần sync",
        "Lần sync cuối",
      ];

      // Prepare CSV rows
      const rows = ordersWithSettlement.map((order) => [
        order.tracking_code,
        order.status === "pending" ? "Chờ xử lý" :
        order.status === "tracking" ? "Đang theo dõi" :
        order.status === "in_transit" ? "Đang vận chuyển" :
        order.status === "delivered" ? "Đã giao hàng" :
        order.status === "returned" ? "Đã trả hàng" :
        order.status === "cancelled" ? "Đã hủy" : order.status,
        order.last_milestone_name || "-",
        order.picked_up_at
          ? format(new Date(order.picked_up_at), "dd/MM/yyyy HH:mm", { locale: vi })
          : "-",
        order.delivered_at
          ? format(new Date(order.delivered_at), "dd/MM/yyyy HH:mm", { locale: vi })
          : "-",
        formatPrice(order.total_amount),
        formatPrice(order.settlement_amount && order.settlement_amount > 0 ? order.settlement_amount : order.settlementAmount),
        format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi }),
        order.delivered_to || "-",
        order.sync_count.toString(),
        order.last_synced_at
          ? format(new Date(order.last_synced_at), "dd/MM/yyyy HH:mm", { locale: vi })
          : "-",
      ]);

      // Create CSV content with UTF-8 BOM for Excel
      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      // Add UTF-8 BOM for Excel compatibility
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      // Generate filename with date range and status filter
      let filename = "don-hang-ghn";
      const parts: string[] = [];
      
      // Add status filter to filename if not "all"
      if (statusFilter !== "all") {
        const statusLabels: Record<string, string> = {
          pending: "cho-xu-ly",
          tracking: "dang-theo-doi",
          in_transit: "dang-van-chuyen",
          delivered: "da-giao-hang",
          returned: "da-tra-hang",
          cancelled: "da-huy",
        };
        parts.push(statusLabels[statusFilter] || statusFilter);
      }
      
      // Add date range to filename if applicable
      if (dateFrom || dateTo) {
        const fromStr = dateFrom ? format(new Date(dateFrom), "dd-MM-yyyy", { locale: vi }) : "all";
        const toStr = dateTo ? format(new Date(dateTo), "dd-MM-yyyy", { locale: vi }) : "all";
        parts.push(`${fromStr}-${toStr}`);
      }
      
      if (parts.length > 0) {
        filename = `don-hang-ghn-${parts.join("-")}`;
      }
      
      link.setAttribute("download", `${filename}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Build description message with filter info
      const filterInfo: string[] = [];
      if (statusFilter !== "all") {
        const statusLabels: Record<string, string> = {
          pending: "Chờ xử lý",
          tracking: "Đang theo dõi",
          in_transit: "Đang vận chuyển",
          delivered: "Đã giao hàng",
          returned: "Đã trả hàng",
          cancelled: "Đã hủy",
        };
        filterInfo.push(`trạng thái: ${statusLabels[statusFilter] || statusFilter}`);
      }
      if (dateFrom || dateTo) {
        const fromStr = dateFrom ? format(new Date(dateFrom), "dd/MM/yyyy", { locale: vi }) : "tất cả";
        const toStr = dateTo ? format(new Date(dateTo), "dd/MM/yyyy", { locale: vi }) : "tất cả";
        filterInfo.push(`từ ${fromStr} đến ${toStr}`);
      }
      
      const filterText = filterInfo.length > 0 ? ` (${filterInfo.join(", ")})` : " (tất cả trạng thái)";
      
      toast({
        title: "Thành công",
        description: `Đã xuất ${filteredOrders.length} đơn hàng${filterText} ra file CSV`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể xuất file: " + (error instanceof Error ? error.message : "Unknown error"),
      });
    }
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý đơn hàng GHN" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Đơn hàng GHN</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý và theo dõi đơn hàng từ GHN (Giao Hàng Nhanh)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSyncAllTracking}
              disabled={isSyncingAll || filteredOrders.length === 0}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncingAll ? "animate-spin" : ""}`} />
              {isSyncingAll ? "Đang sync..." : "Sync tất cả"}
            </Button>
            {syncAllProgress && (
              <span className="text-sm text-muted-foreground">
                {syncAllProgress.processed}/{syncAllProgress.total} - 
                Thành công: {syncAllProgress.success}, 
                Thất bại: {syncAllProgress.failed}
                {syncAllProgress.skipped > 0 && `, Bỏ qua: ${syncAllProgress.skipped}`}
              </span>
            )}
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={filteredOrders.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Xuất Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsBulkImportDialogOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Tải hàng loạt
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Thêm đơn hàng
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách đơn hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              activeFilters={{ status: statusFilter }}
              onFilterChange={(key, value) => {
                if (key === "status") setStatusFilter(value);
              }}
            />
            
            {/* Date Range Filter */}
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="date-from" className="whitespace-nowrap">Từ ngày:</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="date-to" className="whitespace-nowrap">Đến ngày:</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                  min={dateFrom}
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Xóa bộ lọc
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : paginatedOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Không có đơn hàng nào
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã vận đơn</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Ngày lấy hàng</TableHead>
                      <TableHead>Ngày giao hàng</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Quyết toán tiền</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.tracking_code}
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.last_milestone_name ? (
                            <Badge variant="outline">
                              {order.last_milestone_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.picked_up_at ? (
                            format(new Date(order.picked_up_at), "dd/MM/yyyy HH:mm", { locale: vi })
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.delivered_at ? (
                            format(new Date(order.delivered_at), "dd/MM/yyyy HH:mm", { locale: vi })
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatPrice(order.total_amount)}</TableCell>
                        <TableCell className="font-bold text-green-600">
                          {order.settlement_amount && order.settlement_amount > 0
                            ? formatPrice(order.settlement_amount)
                            : formatPrice(order.settlementAmount)}
                        </TableCell>
                        <TableCell>
                          {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setIsProductDialogOpen(true);
                              }}
                              aria-label="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const orderWithSettlement = ordersWithSettlement.find((o) => o.id === order.id);
                                setSettlementOrderId(order.id);
                                setSettlementAmount(orderWithSettlement?.settlementAmount || order.settlement_amount || 0);
                                setSettlementStatus(
                                  (order.settlement_status as "pending" | "partial" | "completed" | "cancelled") || "completed"
                                );
                                setSettlementNotes(order.settlement_notes || "");
                                setIsSettlementDialogOpen(true);
                              }}
                              aria-label="Quyết toán tiền"
                              title="Quyết toán tiền"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSyncTracking(order.id, order.tracking_code)}
                              disabled={isSyncing}
                              aria-label="Sync lại"
                            >
                              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(ordersWithSettlement.length / itemsPerPage)}
                  totalItems={ordersWithSettlement.length}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Order Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm đơn hàng GHN</DialogTitle>
            <DialogDescription>
              Nhập mã vận chuyển và chọn sản phẩm để tạo đơn hàng mới
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Tracking Code */}
            <div>
              <Label htmlFor="tracking-code">Mã vận chuyển *</Label>
              <Input
                id="tracking-code"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder="VD: GYDDGE3K"
              />
            </div>

            {/* Product Selection */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Thêm sản phẩm</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="product-select">Sản phẩm</Label>
                  <Select value={selectedProductId} onValueChange={(value) => {
                    setSelectedProductId(value);
                    const product = products.find((p) => p.id === value);
                    if (product) {
                      setUnitPrice(product.price);
                    }
                  }}>
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Chọn sản phẩm" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({formatPrice(product.price)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quantity">Số lượng</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label htmlFor="unit-price">Giá bán (₫)</Label>
                  <Input
                    id="unit-price"
                    type="number"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddItemToOrder}
                    disabled={!selectedProductId}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Thêm
                  </Button>
                </div>
              </div>
              {selectedProductId && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Giá hệ thống: {formatPrice(products.find((p) => p.id === selectedProductId)?.price || 0)} | 
                  Tồn kho: {products.find((p) => p.id === selectedProductId)?.stock_quantity || 0}
                </div>
              )}
            </div>

            {/* Selected Items List */}
            {orderItems.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Sản phẩm đã chọn</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Đơn giá</TableHead>
                      <TableHead>Thành tiền</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatPrice(item.unit_price)}</TableCell>
                        <TableCell>{formatPrice(item.unit_price * item.quantity)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-right">
                  <strong>
                    Tổng đơn hàng: {formatPrice(
                      orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
                    )}
                  </strong>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setTrackingCode("");
                  setOrderItems([]);
                  setSelectedProductId("");
                  setQuantity(1);
                  setUnitPrice(0);
                }}
              >
                Hủy
              </Button>
              <Button
                onClick={handleAddOrder}
                disabled={createOrderMutation.isPending || addItemsMutation.isPending || isSyncing}
              >
                {createOrderMutation.isPending || addItemsMutation.isPending || isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Thêm và Sync"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Selection Dialog */}
      {selectedOrderId && (
        <ProductSelectionDialog
          open={isProductDialogOpen}
          onOpenChange={setIsProductDialogOpen}
          orderId={selectedOrderId}
          orderData={selectedOrderData}
          products={products}
          onAddItems={addItemsMutation.mutateAsync}
          onDeleteItem={deleteItemMutation.mutateAsync}
        />
      )}

      {/* Bulk Import Dialog */}
      <Dialog open={isBulkImportDialogOpen} onOpenChange={setIsBulkImportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tải hàng loạt mã vận đơn</DialogTitle>
            <DialogDescription>
              Nhập nhiều mã vận đơn hoặc upload file Excel với thông tin đơn hàng và sản phẩm
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">
                <FileText className="w-4 h-4 mr-2" />
                Nhập text
              </TabsTrigger>
              <TabsTrigger value="excel">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Upload Excel
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="text" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="bulk-tracking-codes">Danh sách mã vận đơn (mỗi dòng một mã) *</Label>
                <Textarea
                  id="bulk-tracking-codes"
                  value={bulkTrackingCodes}
                  onChange={(e) => setBulkTrackingCodes(e.target.value)}
                  placeholder="GYDDGE3K&#10;GYDDGE4K&#10;GYDDGE5K"
                  rows={10}
                  className="font-mono text-sm"
                  disabled={isBulkImporting}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Mỗi dòng là một mã vận đơn. Hệ thống sẽ tự động bỏ qua các dòng trống.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="excel" className="space-y-4 mt-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="excel-file">Upload file Excel *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Tải file mẫu
                  </Button>
                </div>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    id="excel-file"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBulkExcelFile(file);
                        handleExcelFileUpload(file);
                      }
                    }}
                    className="hidden"
                    disabled={isBulkImporting}
                  />
                  <label htmlFor="excel-file" className="cursor-pointer">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {bulkExcelFile ? bulkExcelFile.name : "Click để chọn file Excel"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hỗ trợ file .xlsx, .xls
                    </p>
                  </label>
                </div>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-semibold mb-2">Định dạng file Excel:</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    File Excel cần có các cột sau (dòng đầu tiên là header):
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>Mã vận đơn</strong> (bắt buộc): Mã vận đơn GHN</li>
                    <li><strong>Mã sản phẩm</strong> (tùy chọn): Mã sản phẩm trong hệ thống</li>
                    <li><strong>Tên sản phẩm</strong> (tùy chọn): Tên sản phẩm (sẽ tìm theo tên nếu không có mã)</li>
                    <li><strong>Giá</strong> (tùy chọn): Giá bán (VNĐ)</li>
                    <li><strong>Số lượng</strong> (tùy chọn): Số lượng sản phẩm (mặc định: 1)</li>
                  </ul>
                </div>
                {bulkExcelData.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">
                      Đã đọc {bulkExcelData.length} dòng dữ liệu:
                    </p>
                    <div className="max-h-40 overflow-y-auto border rounded p-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Mã vận đơn</TableHead>
                            <TableHead className="text-xs">Sản phẩm</TableHead>
                            <TableHead className="text-xs">Giá</TableHead>
                            <TableHead className="text-xs">SL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkExcelData.slice(0, 10).map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="text-xs font-mono">{item.trackingCode}</TableCell>
                              <TableCell className="text-xs">
                                {item.productName ? item.productName : (item.productCode ? item.productCode : "-")}
                              </TableCell>
                              <TableCell className="text-xs">{formatPrice(item.price)}</TableCell>
                              <TableCell className="text-xs">{item.quantity}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {bulkExcelData.length > 10 && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          ... và {bulkExcelData.length - 10} dòng khác
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

            {bulkImportProgress && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tiến độ xử lý</span>
                  <span className="text-sm text-muted-foreground">
                    {bulkImportProgress.processed} / {bulkImportProgress.total}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(bulkImportProgress.processed / bulkImportProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Thành công:</span>
                    <span className="ml-2 font-semibold text-green-600">{bulkImportProgress.success}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Thất bại:</span>
                    <span className="ml-2 font-semibold text-red-600">{bulkImportProgress.failed}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bỏ qua:</span>
                    <span className="ml-2 font-semibold text-yellow-600">
                      {bulkImportProgress.processed - bulkImportProgress.success - bulkImportProgress.failed}
                    </span>
                  </div>
                </div>
                {bulkImportProgress.results.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-1">
                    {bulkImportProgress.results.map((result, index) => (
                      <div
                        key={index}
                        className={`text-xs p-2 rounded flex items-center justify-between ${
                          result.status === "success"
                            ? "bg-green-50 text-green-700"
                            : result.status === "error"
                            ? "bg-red-50 text-red-700"
                            : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        <span className="font-mono">{result.code}</span>
                        <span className="ml-2">{result.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          <div className="flex justify-end gap-2 border-t pt-4 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkImportDialogOpen(false);
                setBulkTrackingCodes("");
                setBulkExcelFile(null);
                setBulkExcelData([]);
                setBulkImportProgress(null);
              }}
              disabled={isBulkImporting}
            >
              {bulkImportProgress ? "Đóng" : "Hủy"}
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={isBulkImporting || (bulkTrackingCodes.trim() === "" && bulkExcelData.length === 0)}
            >
              {isBulkImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Bắt đầu tải
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settlement Dialog */}
      <Dialog open={isSettlementDialogOpen} onOpenChange={setIsSettlementDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quyết toán tiền</DialogTitle>
            <DialogDescription>
              {settlementOrderId && orders.find((o) => o.id === settlementOrderId)?.tracking_code && (
                <>Mã vận đơn: {orders.find((o) => o.id === settlementOrderId)?.tracking_code}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {settlementOrderId && (
              <>
                {(() => {
                  const order = orders.find((o) => o.id === settlementOrderId);
                  const orderWithSettlement = ordersWithSettlement.find((o) => o.id === settlementOrderId);
                  const autoCalculatedAmount = orderWithSettlement?.settlementAmount || 0;
                  
                  return (
                    <>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tổng tiền đơn hàng:</span>
                          <span className="font-medium text-lg">
                            {formatPrice(order?.total_amount || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tự động tính (từ items):</span>
                          <span className="font-medium text-green-600">
                            {formatPrice(autoCalculatedAmount)}
                          </span>
                        </div>
                        {order?.settlement_amount && order.settlement_amount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Đã quyết toán (đã lưu):</span>
                            <span className="font-medium">
                              {formatPrice(order.settlement_amount)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm border-t pt-2">
                          <span className="text-muted-foreground">Còn lại:</span>
                          <span className="font-medium text-primary">
                            {formatPrice((order?.total_amount || 0) - settlementAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="settlement-status">Trạng thái quyết toán *</Label>
                        <Select
                          value={settlementStatus}
                          onValueChange={(value: "pending" | "partial" | "completed" | "cancelled") =>
                            setSettlementStatus(value)
                          }
                        >
                          <SelectTrigger id="settlement-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Chưa quyết toán</SelectItem>
                            <SelectItem value="partial">Quyết toán một phần</SelectItem>
                            <SelectItem value="completed">Đã quyết toán</SelectItem>
                            <SelectItem value="cancelled">Đã hủy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="settlement-amount">Số tiền quyết toán (VNĐ) *</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSettlementAmount(autoCalculatedAmount)}
                            className="h-7 text-xs"
                          >
                            Dùng số tự động tính
                          </Button>
                        </div>
                        <Input
                          id="settlement-amount"
                          type="number"
                          min="0"
                          value={settlementAmount}
                          onChange={(e) => setSettlementAmount(Number(e.target.value))}
                          placeholder="Nhập số tiền"
                        />
                        <p className="text-xs text-muted-foreground">
                          Số tiền: {formatPrice(settlementAmount)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="settlement-notes">Ghi chú</Label>
                        <Input
                          id="settlement-notes"
                          value={settlementNotes}
                          onChange={(e) => setSettlementNotes(e.target.value)}
                          placeholder="Ghi chú về quyết toán (tùy chọn)"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsSettlementDialogOpen(false);
                            setSettlementOrderId(null);
                            setSettlementAmount(0);
                            setSettlementStatus("completed");
                            setSettlementNotes("");
                          }}
                        >
                          Hủy
                        </Button>
                        <Button
                          onClick={handleSaveSettlement}
                          disabled={isSavingSettlement || settlementAmount < 0}
                        >
                          {isSavingSettlement ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Đang lưu...
                            </>
                          ) : (
                            "Lưu quyết toán"
                          )}
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

// Product Selection Dialog Component
interface ProductSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderData?: {
    order: EcommerceOrder;
    items: any[];
    events: any[];
  };
  products: Array<{
    id: string;
    name: string;
    price: number;
    stock_quantity: number;
  }>;
  onAddItems: (data: {
    orderId: string;
    items: Array<{
      internal_product_id: string;
      quantity: number;
      unit_price: number;
    }>;
  }) => Promise<any>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

const ProductSelectionDialog = ({
  open,
  onOpenChange,
  orderId,
  orderData,
  products,
  onAddItems,
  onDeleteItem,
}: ProductSelectionDialogProps) => {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setUnitPrice(product.price);
    }
  };

  const handleAddItem = async () => {
    if (!selectedProductId || quantity <= 0 || unitPrice <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập đầy đủ thông tin",
      });
      return;
    }

    setIsAdding(true);
    try {
      await onAddItems({
        orderId,
        items: [
          {
            internal_product_id: selectedProductId,
            quantity,
            unit_price: unitPrice,
          },
        ],
      });
      setSelectedProductId("");
      setQuantity(1);
      setUnitPrice(0);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await onDeleteItem(itemId);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const totalAmount = orderData?.items.reduce((sum, item) => sum + item.total_price, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chọn sản phẩm</DialogTitle>
          <DialogDescription>
            Mã vận đơn: {orderData?.order.tracking_code}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Items */}
          {orderData && orderData.items.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Sản phẩm đã thêm</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Số lượng</TableHead>
                    <TableHead>Đơn giá</TableHead>
                    <TableHead>Thành tiền</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderData.items.map((item) => {
                    const product = products.find((p) => p.id === item.internal_product_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{product?.name || "N/A"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatPrice(item.unit_price)}</TableCell>
                        <TableCell>{formatPrice(item.total_price)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 text-right">
                <strong>Tổng đơn hàng: {formatPrice(totalAmount)}</strong>
              </div>
            </div>
          )}

          {/* Add New Item */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Thêm sản phẩm</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="product-select">Sản phẩm</Label>
                <Select value={selectedProductId} onValueChange={handleProductSelect}>
                  <SelectTrigger id="product-select">
                    <SelectValue placeholder="Chọn sản phẩm" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({formatPrice(product.price)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Số lượng</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label htmlFor="unit-price">Giá bán (₫)</Label>
                <Input
                  id="unit-price"
                  type="number"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAddItem}
                  disabled={!selectedProductId || isAdding}
                  className="w-full"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Thêm"
                  )}
                </Button>
              </div>
            </div>
            {selectedProduct && (
              <div className="mt-2 text-sm text-muted-foreground">
                Giá hệ thống: {formatPrice(selectedProduct.price)} | Tồn kho: {selectedProduct.stock_quantity}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminGHNOrders;
