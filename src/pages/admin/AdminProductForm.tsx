import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Upload, X, Loader2, Plus, ArrowLeft, Save, Video, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateSlug, generateUniqueSlug } from "@/lib/slug";
import { formatRenameCounts, renameProductEverywhere } from "@/lib/renameProduct";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  video_url: string | null;
  gallery_images: string[] | null;
  category: string | null;
  badge: string | null;
  has_gift: boolean;
  is_active: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_name: string;
  cost_price: number;
  profit_margin: number | null;
  auto_calculate_profit: boolean;
  average_cost: number | null;
  shipping_fee: number | null;
  free_shipping_threshold: number | null;
  weight: number | null;
  package_length: number | null;
  package_width: number | null;
  package_height: number | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const badges = [
  { value: "", label: "Không có" },
  { value: "NEW", label: "NEW" },
  { value: "HOT", label: "HOT" },
  { value: "-10%", label: "-10%" },
  { value: "-15%", label: "-15%" },
  { value: "-20%", label: "-20%" },
  { value: "-25%", label: "-25%" },
  { value: "-30%", label: "-30%" },
];

const productSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên sản phẩm").max(200),
  slug: z.string().min(1, "Vui lòng nhập slug").max(200),
  description: z.string().max(2000).optional(),
  price: z.number().min(0, "Giá phải >= 0"),
  original_price: z.number().min(0).optional().nullable(),
  category: z.string().optional(),
  badge: z.string().optional(),
  has_gift: z.boolean(),
  is_active: z.boolean(),
  stock_quantity: z.number().min(0, "Số lượng tồn kho phải >= 0"),
  low_stock_threshold: z.number().min(0, "Ngưỡng cảnh báo phải >= 0"),
  unit_name: z.string().min(1, "Vui lòng nhập đơn vị tính").max(50),
  cost_price: z.number().min(0, "Giá vốn phải >= 0"),
  profit_margin: z.number().min(0).max(100).optional().nullable(),
  auto_calculate_profit: z.boolean(),
  shipping_fee: z.number().min(0).optional().nullable(),
  free_shipping_threshold: z.number().min(0).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  package_length: z.number().min(0).optional().nullable(),
  package_width: z.number().min(0).optional().nullable(),
  package_height: z.number().min(0).optional().nullable(),
});

const AdminProductForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const originalNameRef = useRef("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [averageCost, setAverageCost] = useState<number | null>(null);
  const { products: sharedProducts = [], loading: productsLoading } = useProducts();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    price: 0,
    original_price: null as number | null,
    category: "",
    badge: "",
    has_gift: false,
    is_active: true,
    stock_quantity: 0,
    low_stock_threshold: 10,
    unit_name: "Sản phẩm",
    cost_price: 0,
    profit_margin: null as number | null,
    auto_calculate_profit: false,
    shipping_fee: null as number | null,
    free_shipping_threshold: null as number | null,
    weight: null as number | null,
    package_length: null as number | null,
    package_width: null as number | null,
    package_height: null as number | null,
  });

  // Prevent renders during unmount
  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      setIsNavigating(true);
    };
  }, []);

  // Auto-calculate price from cost_price and profit_margin
  useEffect(() => {
    if (formData.auto_calculate_profit && formData.cost_price > 0 && formData.profit_margin && formData.profit_margin > 0) {
      const calculatedPrice = Math.round(formData.cost_price * (1 + formData.profit_margin / 100));
      setFormData((prev) => ({
        ...prev,
        price: calculatedPrice,
      }));
    }
  }, [formData.cost_price, formData.profit_margin, formData.auto_calculate_profit]);

  const isEditing = !!id;

  // Load product data from shared cache when editing
  useEffect(() => {
    if (!id) return;

    if (productsLoading) {
      setIsLoading(true);
      return;
    }

    const product = (sharedProducts as Array<any> | undefined)?.find((item) => item.id === id);

    if (!product) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải thông tin sản phẩm",
      });
      navigate("/admin/products");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setAverageCost(product.average_cost ?? null);
    originalNameRef.current = product.name || "";
    setFormData({
      name: product.name,
      slug: product.slug,
      description: product.description || "",
      price: product.price,
      original_price: product.original_price,
      category: product.category || "",
      badge: product.badge || "",
      has_gift: product.has_gift,
      is_active: product.is_active,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
      unit_name: product.unit_name || product.unit || "Sản phẩm",
      cost_price: product.cost_price || 0,
      profit_margin: product.profit_margin,
      auto_calculate_profit: product.auto_calculate_profit || false,
      shipping_fee: product.shipping_fee,
      free_shipping_threshold: product.free_shipping_threshold,
      weight: product.weight,
      package_length: product.package_length,
      package_width: product.package_width,
      package_height: product.package_height,
    });
    setImagePreview(product.image_url);
    setVideoPreview(product.video_url || null);
    setGalleryPreviews(Array.isArray(product.gallery_images) ? product.gallery_images : []);
    setIsSlugManuallyEdited(true);
    setIsLoading(false);
  }, [id, navigate, productsLoading, sharedProducts, toast]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (data) {
        setCategories(data);
      }
    };
    fetchCategories();
  }, []);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn file ảnh",
      });
      return;
    }

    // Validate file size (before resize)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Kích thước ảnh tối đa 10MB (trước khi resize)",
      });
      return;
    }

    try {
      // Import resize function dynamically
      const { resizeImage } = await import("@/utils/imageResize");
      
      // Show loading state
      toast({
        title: "Đang xử lý ảnh...",
        description: "Đang điều chỉnh kích thước ảnh về tiêu chuẩn (1000x1000px)",
      });

      // Resize image to 1000x1000 (Google recommended size)
      const resizedFile = await resizeImage(file, 1000, 0.9);
      
      setImageFile(resizedFile);
      setImagePreview(URL.createObjectURL(resizedFile));
      
      toast({
        title: "Thành công",
        description: `Ảnh đã được điều chỉnh về kích thước tiêu chuẩn`,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error resizing image:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể xử lý ảnh. Vui lòng thử lại.",
      });
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from("product-images")
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    if (!data?.publicUrl) {
      throw new Error("Failed to get public URL for uploaded image");
    }

    return data.publicUrl;
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Kích thước video tối đa 500MB",
      });
      return;
    }

    // Check file type
    if (!file.type.startsWith("video/")) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn file video",
      });
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const uploadVideo = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `video-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    setUploadingVideo(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from("product-videos")
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data } = supabase.storage
        .from("product-videos")
        .getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error("Failed to get public URL for uploaded video");
      }

      return data.publicUrl;
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleGalleryImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check total count (max 6)
    const currentCount = galleryFiles.length + galleryPreviews.length;
    if (currentCount + files.length > 6) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Tối đa 6 ảnh phụ. Vui lòng chọn lại.",
      });
      return;
    }

    // Show loading toast
    toast({
      title: "Đang xử lý ảnh...",
      description: `Đang điều chỉnh ${files.length} ảnh về kích thước tiêu chuẩn`,
    });

    try {
      const { resizeImage } = await import("@/utils/imageResize");
      
      // Validate and resize each file
      const validFiles: File[] = [];
      const validPreviews: string[] = [];

      for (const file of files) {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          continue;
        }

        // Validate file size (before resize)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: `File ${file.name} vượt quá 10MB`,
          });
          continue;
        }

        try {
          // Resize image to 1000x1000
          const resizedFile = await resizeImage(file, 1000, 0.9);
          validFiles.push(resizedFile);
          validPreviews.push(URL.createObjectURL(resizedFile));
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`Error resizing ${file.name}:`, error);
          }
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: `Không thể xử lý ${file.name}`,
          });
        }
      }

      if (validFiles.length > 0) {
        setGalleryFiles((prev) => [...prev, ...validFiles]);
        setGalleryPreviews((prev) => [...prev, ...validPreviews]);
        
        toast({
          title: "Thành công",
          description: `Đã xử lý ${validFiles.length} ảnh`,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error processing gallery images:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể xử lý ảnh. Vui lòng thử lại.",
      });
    }
  };

  const removeGalleryImage = (index: number) => {
    // Find how many existing URLs (from DB) are before this index
    const existingUrlCount = galleryPreviews.filter(url => url.startsWith('http')).length;
    const isNewFile = index >= existingUrlCount;
    const fileIndex = isNewFile ? index - existingUrlCount : -1;
    
    // Remove from files if it's a new file
    if (isNewFile && fileIndex >= 0 && fileIndex < galleryFiles.length) {
      setGalleryFiles((prev) => prev.filter((_, i) => i !== fileIndex));
    }
    
    // Remove from previews
    setGalleryPreviews((prev) => {
      const newPreviews = [...prev];
      if (newPreviews[index]?.startsWith('blob:')) {
        URL.revokeObjectURL(newPreviews[index]);
      }
      return newPreviews.filter((_, i) => i !== index);
    });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double submission
    if (isSubmitting || isNavigating) {
      return;
    }
    
    setErrors({});

    // Pre-validate description length (strip HTML for accurate count)
    const descriptionText = formData.description 
      ? formData.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      : "";
    if (descriptionText.length > 2000) {
      setErrors({ description: `Mô tả vượt quá 2000 ký tự (hiện tại: ${descriptionText.length} ký tự). Vui lòng rút ngắn.` });
      toast({
        variant: "destructive",
        title: "Lỗi xác thực",
        description: `Mô tả vượt quá 2000 ký tự (hiện tại: ${descriptionText.length} ký tự). Vui lòng rút ngắn.`,
      });
      return;
    }

    const result = productSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      const errorMessages: string[] = [];
      
      result.error.errors.forEach((err) => {
        const fieldName = err.path[0] ? String(err.path[0]) : "unknown";
        const errorMsg = err.message;
        fieldErrors[fieldName] = errorMsg;
        errorMessages.push(`${fieldName}: ${errorMsg}`);
        
      });
      
      setErrors(fieldErrors);
      
      // Show toast with all validation errors
      const errorSummary = errorMessages.length > 0 
        ? errorMessages.slice(0, 3).join("; ") + (errorMessages.length > 3 ? ` và ${errorMessages.length - 3} lỗi khác` : "")
        : "Vui lòng kiểm tra lại thông tin";
      
      toast({
        variant: "destructive",
        title: "Lỗi xác thực",
        description: errorSummary,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.error("Validation errors:", result.error.errors);
        console.error("Form data:", formData);
      }
      return;
    }

    if (isMountedRef.current && !isNavigating) {
      setIsSubmitting(true);
    }

    try {
      let imageUrl = imagePreview || null;

      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      // Upload video if new file selected
      let videoUrl = videoPreview || null;
      if (videoFile) {
        videoUrl = await uploadVideo(videoFile);
      }

      // Upload gallery images
      // Separate existing URLs (from database) and new files
      const existingUrls = galleryPreviews.filter(url => url.startsWith('http'));
      const newFiles = galleryFiles;
      
      let galleryImageUrls: string[] = [...existingUrls];
      
      if (newFiles.length > 0) {
        const uploadedUrls = await Promise.all(
          newFiles.map((file) => uploadImage(file))
        );
        galleryImageUrls = [...galleryImageUrls, ...uploadedUrls];
      }

      // Limit to max 6 images
      if (galleryImageUrls.length > 6) {
        galleryImageUrls = galleryImageUrls.slice(0, 6);
      }

      let finalSlug = formData.slug || generateSlug(formData.name);

      if (!isEditing || finalSlug !== formData.slug) {
        finalSlug = await generateUniqueSlug(finalSlug, "products", id);
      }

      const productData: any = {
        name: formData.name,
        slug: finalSlug,
        description: formData.description || null,
        price: formData.price,
        original_price: formData.original_price,
        image_url: imageUrl,
        video_url: videoUrl,
        gallery_images: galleryImageUrls.length > 0 ? galleryImageUrls : null,
        category: formData.category || null,
        badge: formData.badge || null,
        has_gift: formData.has_gift,
        is_active: formData.is_active,
        stock_quantity: formData.stock_quantity,
        low_stock_threshold: formData.low_stock_threshold,
        unit_name: formData.unit_name,
        cost_price: formData.cost_price,
        profit_margin: formData.profit_margin,
        auto_calculate_profit: formData.auto_calculate_profit,
        shipping_fee: formData.shipping_fee,
        free_shipping_threshold: formData.free_shipping_threshold,
        weight: formData.weight,
        package_length: formData.package_length,
        package_width: formData.package_width,
        package_height: formData.package_height,
      };

      if (isEditing) {
        let { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", id);

        if (error) {
          if (error.code === "23505") {
            setErrors({ slug: "Slug đã tồn tại, vui lòng chọn slug khác" });
            if (isMountedRef.current && !isNavigating) {
              setIsSubmitting(false);
            }
            return;
          }
          throw error;
        } else {
          let syncNote = `Sản phẩm "${formData.name}" đã được cập nhật`;
          if (
            id &&
            formData.name.trim() !== originalNameRef.current.trim()
          ) {
            try {
              const sync = await renameProductEverywhere(id, formData.name);
              syncNote = `${syncNote}. ${formatRenameCounts(sync)}`;
            } catch (syncErr) {
              toast({
                variant: "destructive",
                title: "Tên catalog đã đổi, đơn cũ chưa đổi",
                description:
                  syncErr instanceof Error
                    ? syncErr.message
                    : "Không đồng bộ được tên trên đơn cũ",
              });
            }
          }
          toast({
            title: "Đã cập nhật sản phẩm",
            description: syncNote,
          });
        }
        
        // Invalidate product queries to refresh cache
        queryClient.invalidateQueries({ queryKey: ["product"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } else {
        let { error } = await supabase.from("products").insert(productData);

        if (error) {
          if (error.code === "23505") {
            setErrors({ slug: "Slug đã tồn tại, vui lòng chọn slug khác" });
            if (isMountedRef.current && !isNavigating) {
              setIsSubmitting(false);
            }
            return;
          }
          throw error;
        } else {
          toast({
            title: "Đã thêm sản phẩm",
            description: `Sản phẩm "${formData.name}" đã được thêm`,
          });
        }
        
        // Invalidate product queries to refresh cache
        queryClient.invalidateQueries({ queryKey: ["products"] });
      }

      // Set navigating state to prevent any state updates and trigger re-render with stable button
      setIsNavigating(true);
      // Navigate immediately without resetting isSubmitting to prevent DOM errors
      // The component will unmount, so we don't need to reset state
      navigate("/admin/products");
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error saving product:", error);
      }
      const errorMessage = error instanceof Error ? error.message : "Không thể lưu sản phẩm";
      const errorDetails = error instanceof Error && 'code' in error 
        ? ` (Code: ${(error as any).code})` 
        : "";
      
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `${errorMessage}${errorDetails}. Vui lòng kiểm tra console để biết thêm chi tiết.`,
      });
      if (isMountedRef.current && !isNavigating) {
        setIsSubmitting(false);
      }
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/products")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {isEditing ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {isEditing
                  ? "Cập nhật thông tin sản phẩm. Đổi tên sẽ cập nhật luôn tên trên đơn cũ cùng mã hàng."
                  : "Điền thông tin để thêm sản phẩm mới"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin cơ bản</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Tên sản phẩm *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const autoSlug = generateSlug(name);
                        setFormData((prev) => ({
                          ...prev,
                          name,
                          slug: isSlugManuallyEdited ? prev.slug : autoSlug,
                        }));
                      }}
                      placeholder="Nhập tên sản phẩm"
                    />
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">
                        Đổi tên ở đây sẽ đổi luôn tên trên đơn / điều chuyển /
                        phiếu XB cũ cùng mã hàng. Mã SKU không đổi.
                      </p>
                    )}
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name}</p>
                    )}
                  </div>

                  {/* Slug */}
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => {
                          setIsSlugManuallyEdited(true);
                          setFormData((prev) => ({ ...prev, slug: e.target.value }));
                        }}
                        placeholder="slug-se-tu-dong-tao"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const autoSlug = generateSlug(formData.name);
                          setIsSlugManuallyEdited(false);
                          setFormData((prev) => ({ ...prev, slug: autoSlug }));
                        }}
                        title="Tự động tạo slug từ tên sản phẩm"
                      >
                        🔄
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Slug sẽ tự động được tạo từ tên sản phẩm
                    </p>
                    {errors.slug && (
                      <p className="text-sm text-destructive">{errors.slug}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Mô tả sản phẩm (tối đa 2000 ký tự)</Label>
                    <CKEditorComponent
                      value={formData.description || ""}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, description: value }))
                      }
                      placeholder="Nhập mô tả sản phẩm..."
                    />
                    {(() => {
                      // Strip HTML tags to count actual text characters
                      const textContent = formData.description 
                        ? formData.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
                        : "";
                      const charCount = textContent.length;
                      const maxChars = 2000;
                      const remaining = maxChars - charCount;
                      const isNearLimit = remaining < 100;
                      const isOverLimit = remaining < 0;
                      
                      return (
                        <div className="flex items-center justify-between text-xs">
                          <p className={isOverLimit ? "text-destructive" : isNearLimit ? "text-yellow-600" : "text-muted-foreground"}>
                            {isOverLimit 
                              ? `Vượt quá ${Math.abs(remaining)} ký tự. Vui lòng rút ngắn mô tả.`
                              : `${charCount} / ${maxChars} ký tự${isNearLimit ? ` (còn ${remaining} ký tự)` : ""}`
                            }
                          </p>
                          {errors.description && (
                            <p className="text-destructive font-medium">{errors.description}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>

              {/* Pricing & Inventory */}
              <Card>
                <CardHeader>
                  <CardTitle>Giá và tồn kho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Giá bán (VNĐ) *</Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            price: Number(e.target.value),
                          }))
                        }
                        disabled={formData.auto_calculate_profit && formData.cost_price > 0 && formData.profit_margin && formData.profit_margin > 0}
                        className={formData.auto_calculate_profit && formData.cost_price > 0 && formData.profit_margin && formData.profit_margin > 0 ? "bg-muted" : ""}
                      />
                      {errors.price && (
                        <p className="text-sm text-destructive">{errors.price}</p>
                      )}
                      {formData.auto_calculate_profit && formData.cost_price > 0 && formData.profit_margin && formData.profit_margin > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Giá bán được tự động tính từ giá vốn và biên lợi nhuận
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="original_price">Giá gốc (nếu có)</Label>
                      <Input
                        id="original_price"
                        type="number"
                        value={formData.original_price || ""}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          setFormData((prev) => ({
                            ...prev,
                            original_price: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                          }));
                        }}
                      />
                    </div>
                  </div>

                  {/* Cost Price & Profit Management - Simplified */}
                  <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Giá vốn & Lợi nhuận</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/admin/products/pricing")}
                      >
                        Quản lý chi tiết
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cost_price">Giá vốn (VNĐ) *</Label>
                        <Input
                          id="cost_price"
                          type="number"
                          min="0"
                          value={formData.cost_price}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              cost_price: Number(e.target.value),
                            }))
                          }
                        />
                        {errors.cost_price && (
                          <p className="text-sm text-destructive">{errors.cost_price}</p>
                        )}
                        {averageCost !== null && averageCost > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Giá nhập TB: {new Intl.NumberFormat("vi-VN").format(averageCost)}₫
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profit_margin">Biên lợi nhuận (%)</Label>
                        <Input
                          id="profit_margin"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={formData.profit_margin || ""}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            setFormData((prev) => ({
                              ...prev,
                              profit_margin: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                            }));
                          }}
                          placeholder="Ví dụ: 30"
                        />
                        {errors.profit_margin && (
                          <p className="text-sm text-destructive">{errors.profit_margin}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="auto_calculate_profit"
                        checked={formData.auto_calculate_profit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            auto_calculate_profit: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="auto_calculate_profit" className="text-sm font-normal cursor-pointer">
                        Tự động tính giá bán từ giá vốn và biên lợi nhuận
                      </Label>
                    </div>

                    {/* Profit Preview */}
                    {formData.cost_price > 0 && formData.price > 0 && (
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Giá vốn:</span>
                          <span className="font-medium">{new Intl.NumberFormat("vi-VN").format(formData.cost_price)}₫</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Giá bán:</span>
                          <span className="font-medium">{new Intl.NumberFormat("vi-VN").format(formData.price)}₫</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Lợi nhuận:</span>
                          <span className={`font-bold ${formData.price >= formData.cost_price ? "text-green-600" : "text-red-600"}`}>
                            {new Intl.NumberFormat("vi-VN").format(formData.price - formData.cost_price)}₫
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Biên lợi nhuận:</span>
                          <span className={`font-bold ${formData.price >= formData.cost_price ? "text-green-600" : "text-red-600"}`}>
                            {formData.price > 0
                              ? `${((formData.price - formData.cost_price) / formData.price * 100).toFixed(2)}%`
                              : "0%"}
                          </span>
                        </div>
                        {formData.price < formData.cost_price && (
                          <div className="text-xs text-red-600 font-medium mt-2">
                            ⚠️ Cảnh báo: Giá bán thấp hơn giá vốn (đang lỗ)
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unit_name">Đơn vị tính *</Label>
                    <Input
                      id="unit_name"
                      type="text"
                      placeholder="Ví dụ: Hộp, Thùng, Chai, Gói..."
                      value={formData.unit_name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          unit_name: e.target.value,
                        }))
                      }
                    />
                    {errors.unit_name && (
                      <p className="text-sm text-destructive">
                        {errors.unit_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Đơn vị tính sẽ hiển thị trong thông báo tồn kho (ví dụ: "Còn 10 Hộp")
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stock_quantity">Số lượng tồn kho *</Label>
                      <Input
                        id="stock_quantity"
                        type="number"
                        min="0"
                        value={formData.stock_quantity}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            stock_quantity: Number(e.target.value),
                          }))
                        }
                      />
                      {errors.stock_quantity && (
                        <p className="text-sm text-destructive">
                          {errors.stock_quantity}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Tồn kho: {formData.stock_quantity} {formData.unit_name}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="low_stock_threshold">Ngưỡng cảnh báo</Label>
                      <Input
                        id="low_stock_threshold"
                        type="number"
                        min="0"
                        value={formData.low_stock_threshold}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            low_stock_threshold: Number(e.target.value),
                          }))
                        }
                      />
                      {errors.low_stock_threshold && (
                        <p className="text-sm text-destructive">
                          {errors.low_stock_threshold}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Shipping Fee */}
                  <div className="space-y-2">
                    <Label htmlFor="shipping_fee">Phí vận chuyển (₫)</Label>
                    <Input
                      id="shipping_fee"
                      type="number"
                      min="0"
                      value={formData.shipping_fee || ""}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setFormData((prev) => ({
                          ...prev,
                          shipping_fee: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                        }));
                      }}
                      placeholder="Để trống = dùng phí mặc định"
                    />
                    <p className="text-xs text-muted-foreground">
                      Để trống sẽ dùng phí vận chuyển mặc định từ cài đặt. Nhập giá trị để đặt phí riêng cho sản phẩm này.
                    </p>
                  </div>

                  {/* Free Shipping Threshold */}
                  <div className="space-y-2">
                    <Label htmlFor="free_shipping_threshold">Ngưỡng miễn phí vận chuyển (₫)</Label>
                    <Input
                      id="free_shipping_threshold"
                      type="number"
                      min="0"
                      value={formData.free_shipping_threshold || ""}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setFormData((prev) => ({
                          ...prev,
                          free_shipping_threshold: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                        }));
                      }}
                      placeholder="Để trống = dùng ngưỡng mặc định"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nếu tổng tiền sản phẩm này (giá × số lượng) {'>='} ngưỡng này, sản phẩm sẽ được miễn phí vận chuyển. Để trống sẽ dùng ngưỡng mặc định từ cài đặt.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Shipping Dimensions */}
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin vận chuyển</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Weight */}
                  <div className="space-y-2">
                    <Label htmlFor="weight">Cân nặng sau khi đóng gói (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.weight || ""}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setFormData((prev) => ({
                          ...prev,
                          weight: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                        }));
                      }}
                      placeholder="Ví dụ: 0.5"
                    />
                  </div>

                  {/* Package Dimensions */}
                  <div className="space-y-2">
                    <Label>Kích thước đóng gói (cm)</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="package_length" className="text-sm">Chiều dài</Label>
                        <Input
                          id="package_length"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.package_length || ""}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            setFormData((prev) => ({
                              ...prev,
                              package_length: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                            }));
                          }}
                          placeholder="Dài"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="package_width" className="text-sm">Chiều rộng</Label>
                        <Input
                          id="package_width"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.package_width || ""}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            setFormData((prev) => ({
                              ...prev,
                              package_width: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                            }));
                          }}
                          placeholder="Rộng"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="package_height" className="text-sm">Chiều cao</Label>
                        <Input
                          id="package_height"
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.package_height || ""}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            setFormData((prev) => ({
                              ...prev,
                              package_height: value === "" ? null : (isNaN(Number(value)) ? null : Number(value)),
                            }));
                          }}
                          placeholder="Cao"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Image Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>Hình ảnh sản phẩm</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Main Image */}
                  <div className="space-y-2">
                    <Label>Ảnh chính *</Label>
                    <div className="relative w-full aspect-square border-2 border-dashed rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                      {imagePreview ? (
                        <>
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setImageFile(null);
                              setImagePreview(null);
                            }}
                            className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-4">
                          <Upload className="w-12 h-12 text-muted-foreground mb-2" />
                          <span className="text-sm font-medium">Upload ảnh chính</span>
                          <span className="text-xs text-muted-foreground mt-1">
                            JPG, PNG, WEBP (tối đa 5MB)
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Gallery Images */}
                  <div className="space-y-2">
                    <Label>Ảnh phụ (tối đa 6 ảnh)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {galleryPreviews.map((preview, index) => (
                        <div key={`gallery-${preview}-${index}`} className="relative aspect-square border rounded-lg overflow-hidden">
                          <img
                            src={preview}
                            alt={`Gallery ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {galleryPreviews.length < 6 && (
                        <label key="add-gallery-image" className="aspect-square border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="text-center">
                            <ImageIcon className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                            <span className="text-xs text-muted-foreground">Thêm</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleGalleryImageChange}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {galleryPreviews.length}/6 ảnh đã chọn
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Video Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>Video sản phẩm</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Video sản phẩm</Label>
                    <div className="relative w-full aspect-video border-2 border-dashed rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                      {videoPreview ? (
                        <div className="relative w-full h-full">
                          <video
                            src={videoPreview}
                            controls
                            className="w-full h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setVideoFile(null);
                              if (videoPreview.startsWith('blob:')) {
                                URL.revokeObjectURL(videoPreview);
                              }
                              setVideoPreview(null);
                            }}
                            className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 z-10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-4">
                          <Video className="w-12 h-12 text-muted-foreground mb-2" />
                          <span className="text-sm font-medium">Upload video</span>
                          <span className="text-xs text-muted-foreground mt-1 text-center">
                            Tất cả định dạng video<br />
                            Tối đa 500MB
                          </span>
                          <input
                            type="file"
                            accept="video/*"
                            onChange={handleVideoChange}
                            className="hidden"
                            disabled={uploadingVideo}
                          />
                        </label>
                      )}
                    </div>
                    {uploadingVideo && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải video lên...</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Category & Badge */}
              <Card>
                <CardHeader>
                  <CardTitle>Phân loại</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Danh mục</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open("/admin/categories", "_blank")}
                        className="h-auto p-1 text-xs"
                      >
                        Quản lý danh mục →
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={formData.category}
                        onValueChange={(value) => {
                          if (value === "__add_new__") {
                            setShowCategoryInput(true);
                          } else {
                            setFormData((prev) => ({ ...prev, category: value }));
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Chọn danh mục" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="__add_new__" className="text-primary">
                            <span className="flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Thêm danh mục mới
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {showCategoryInput && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          placeholder="Nhập tên danh mục mới"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={async () => {
                            if (newCategory.trim()) {
                              const slug = newCategory
                                .trim()
                                .toLowerCase()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .replace(/đ/g, "d")
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/(^-|-$)/g, "");

                              const { data, error } = await supabase
                                .from("categories")
                                .insert({ name: newCategory.trim(), slug })
                                .select()
                                .single();

                              if (!error && data) {
                                setFormData((prev) => ({
                                  ...prev,
                                  category: newCategory.trim(),
                                }));
                                setCategories((prev) => [...prev, data]);
                                toast({ title: "Đã thêm danh mục mới" });
                              } else {
                                toast({
                                  variant: "destructive",
                                  title: "Lỗi",
                                  description: "Không thể thêm danh mục",
                                });
                              }
                              setShowCategoryInput(false);
                              setNewCategory("");
                            }
                          }}
                        >
                          Thêm
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowCategoryInput(false);
                            setNewCategory("");
                          }}
                        >
                          Hủy
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Badge</Label>
                    <Select
                      value={formData.badge}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, badge: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn badge" />
                      </SelectTrigger>
                      <SelectContent>
                        {badges.map((badge) => (
                          <SelectItem
                            key={badge.value || "none"}
                            value={badge.value || "none"}
                          >
                            {badge.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Cài đặt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has_gift">Có quà tặng</Label>
                    <Switch
                      id="has_gift"
                      checked={formData.has_gift}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, has_gift: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_active">Hiển thị sản phẩm</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, is_active: checked }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {!isNavigating ? (
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    <span className="flex items-center">
                      <Loader2 className={`w-4 h-4 mr-2 animate-spin ${isSubmitting ? 'inline' : 'hidden'}`} />
                      <Save className={`w-4 h-4 mr-2 ${isSubmitting ? 'hidden' : 'inline'}`} />
                      <span>{isSubmitting ? "Đang lưu..." : (isEditing ? "Cập nhật sản phẩm" : "Thêm sản phẩm")}</span>
                    </span>
                  </Button>
                ) : (
                  <Button type="submit" disabled={true} className="w-full">
                    <span className="flex items-center">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>Đang lưu...</span>
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/products")}
                  className="w-full"
                >
                  Hủy
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AdminProductForm;

