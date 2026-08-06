import { useState, useEffect } from "react";
import { z } from "zod";
import { Upload, X, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateSlug, generateUniqueSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Switch } from "@/components/ui/switch";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { resizeImage } from "@/utils/imageResize";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  has_gift: boolean;
  is_active: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  shipping_fee: number | null;
  free_shipping_threshold: number | null;
  weight: number | null;
  package_length: number | null;
  package_width: number | null;
  package_height: number | null;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
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
  shipping_fee: z.number().min(0).optional().nullable(),
  free_shipping_threshold: z.number().min(0).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  package_length: z.number().min(0).optional().nullable(),
  package_width: z.number().min(0).optional().nullable(),
  package_height: z.number().min(0).optional().nullable(),
});

// Slug generation functions are now imported from @/lib/slug

const ProductFormDialog = ({ open, onOpenChange, product, onSuccess }: ProductFormDialogProps) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false); // Track if user manually edited slug

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
    shipping_fee: null as number | null,
    free_shipping_threshold: null as number | null,
    weight: null as number | null,
    package_length: null as number | null,
    package_width: null as number | null,
    package_height: null as number | null,
  });

  // Fetch categories from categories table
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
    
    if (open) {
      fetchCategories();
    }
  }, [open]);

  useEffect(() => {
    if (product) {
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
        shipping_fee: product.shipping_fee,
        free_shipping_threshold: product.free_shipping_threshold,
        weight: product.weight,
        package_length: product.package_length,
        package_width: product.package_width,
        package_height: product.package_height,
      });
      setImagePreview(product.image_url);
      setIsSlugManuallyEdited(true); // When editing, assume slug was manually set
    } else {
      setFormData({
        name: "",
        slug: "",
        description: "",
        price: 0,
        original_price: null,
        category: "",
        badge: "",
        has_gift: false,
        is_active: true,
        stock_quantity: 0,
        low_stock_threshold: 10,
        shipping_fee: null,
        free_shipping_threshold: null,
        weight: null,
        package_length: null,
        package_width: null,
        package_height: null,
      });
      setImagePreview(null);
      setIsSlugManuallyEdited(false); // New product, slug will be auto-generated
    }
    setImageFile(null);
    setErrors({});
    setShowCategoryInput(false);
    setNewCategory("");
  }, [product, open]);

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
        description: "Ảnh đã được điều chỉnh về kích thước tiêu chuẩn (tối đa 1000x1000px)",
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
    
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = productSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl = product?.image_url || null;

      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      // Ensure slug is generated if empty
      let finalSlug = formData.slug || generateSlug(formData.name);
      
      // Generate unique slug if needed (only for new products or if slug changed)
      if (!product || finalSlug !== product.slug) {
        finalSlug = await generateUniqueSlug(finalSlug, "products", product?.id);
      }

      // Build productData
      const productData = {
        name: formData.name,
        slug: finalSlug,
        description: formData.description || null,
        price: formData.price,
        original_price: formData.original_price,
        image_url: imageUrl,
        category: formData.category || null,
        badge: formData.badge || null,
        has_gift: formData.has_gift,
        is_active: formData.is_active,
        stock_quantity: formData.stock_quantity,
        low_stock_threshold: formData.low_stock_threshold,
        shipping_fee: formData.shipping_fee,
        free_shipping_threshold: formData.free_shipping_threshold,
        weight: formData.weight,
        package_length: formData.package_length,
        package_width: formData.package_width,
        package_height: formData.package_height,
      };

      if (product) {
        const { error, data } = await supabase
          .from("products")
          .update(productData)
          .eq("id", product.id);

        if (error) {
          if (error.code === "23505") {
            setErrors({ slug: "Slug đã tồn tại, vui lòng chọn slug khác" });
            setIsSubmitting(false);
            return;
          }
          throw error;
        }

        toast({
          title: "Đã cập nhật sản phẩm",
          description: `Sản phẩm "${formData.name}" đã được cập nhật`,
        });
      } else {
        const { error, data } = await supabase.from("products").insert(productData);

        if (error) {
          if (error.code === "23505") {
            setErrors({ slug: "Slug đã tồn tại, vui lòng chọn slug khác" });
            setIsSubmitting(false);
            return;
          }
          throw error;
        }

        toast({
          title: "Đã thêm sản phẩm",
          description: `Sản phẩm "${formData.name}" đã được thêm`,
        });
      }

      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể lưu sản phẩm",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
          </DialogTitle>
          <DialogDescription>
            {product ? "Cập nhật thông tin sản phẩm" : "Điền thông tin để thêm sản phẩm mới vào hệ thống"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main Image Upload */}
          <div className="space-y-2">
            <Label>Hình ảnh chính sản phẩm</Label>
            <div className="flex items-start gap-4">
              <div className="relative w-32 h-32 border-2 border-dashed rounded-lg overflow-hidden flex items-center justify-center bg-muted">
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
                      className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full"
                      aria-label="Xóa hình ảnh"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Định dạng: JPG, PNG, WEBP</p>
                <p>Kích thước tối đa: 10MB (tự động resize về 1000x1000px)</p>
              </div>
            </div>
          </div>

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
                  // Auto-generate slug only if user hasn't manually edited it
                  slug: isSlugManuallyEdited ? prev.slug : autoSlug,
                }));
              }}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL) *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => {
                  setIsSlugManuallyEdited(true); // Mark as manually edited
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
                aria-label="Tự động tạo slug từ tên sản phẩm"
              >
                🔄
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Slug sẽ tự động được tạo từ tên sản phẩm. Bạn có thể chỉnh sửa thủ công nếu cần.
            </p>
            {errors.slug && <p className="text-sm text-destructive">{errors.slug}</p>}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <CKEditorComponent
              value={formData.description || ""}
              onChange={(value) => setFormData((prev) => ({ ...prev, description: value }))}
              placeholder="Nhập mô tả sản phẩm..."
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Giá bán (VNĐ) *</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData((prev) => ({ ...prev, price: Number(e.target.value) }))}
              />
              {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="original_price">Giá gốc (nếu có)</Label>
              <Input
                id="original_price"
                type="number"
                value={formData.original_price || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    original_price: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
          </div>

          {/* Category & Badge */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Danh mục</Label>
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
                  <SelectContent className="bg-popover">
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
                        // Add to categories table
                        const slug = newCategory.trim().toLowerCase()
                          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                          .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, "");
                        
                        const { data, error } = await supabase
                          .from("categories")
                          .insert({ name: newCategory.trim(), slug })
                          .select()
                          .single();
                        
                        if (!error && data) {
                          setFormData((prev) => ({ ...prev, category: newCategory.trim() }));
                          setCategories((prev) => [...prev, data]);
                          toast({ title: "Đã thêm danh mục mới" });
                        } else {
                          toast({ variant: "destructive", title: "Lỗi", description: "Không thể thêm danh mục" });
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
                onValueChange={(value) => setFormData((prev) => ({ ...prev, badge: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn badge" />
                </SelectTrigger>
                <SelectContent>
                  {badges.map((badge) => (
                    <SelectItem key={badge.value || "none"} value={badge.value || "none"}>
                      {badge.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stock Management */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stock_quantity">Số lượng tồn kho *</Label>
              <Input
                id="stock_quantity"
                type="number"
                min="0"
                value={formData.stock_quantity}
                onChange={(e) => setFormData((prev) => ({ ...prev, stock_quantity: Number(e.target.value) }))}
              />
              {errors.stock_quantity && <p className="text-sm text-destructive">{errors.stock_quantity}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="low_stock_threshold">Ngưỡng cảnh báo hết hàng</Label>
              <Input
                id="low_stock_threshold"
                type="number"
                min="0"
                value={formData.low_stock_threshold}
                onChange={(e) => setFormData((prev) => ({ ...prev, low_stock_threshold: Number(e.target.value) }))}
              />
              {errors.low_stock_threshold && <p className="text-sm text-destructive">{errors.low_stock_threshold}</p>}
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
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  shipping_fee: e.target.value ? Number(e.target.value) : null,
                }))
              }
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
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  free_shipping_threshold: e.target.value ? Number(e.target.value) : null,
                }))
              }
              placeholder="Để trống = dùng ngưỡng mặc định"
            />
            <p className="text-xs text-muted-foreground">
              Nếu tổng tiền sản phẩm này (giá × số lượng) {'>='} ngưỡng này, sản phẩm sẽ được miễn phí vận chuyển. Để trống sẽ dùng ngưỡng mặc định từ cài đặt.
            </p>
          </div>

          {/* Shipping Dimensions */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weight">Cân nặng sau khi đóng gói (kg)</Label>
              <Input
                id="weight"
                type="number"
                min="0"
                step="0.01"
                value={formData.weight || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    weight: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="Ví dụ: 0.5"
              />
            </div>

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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        package_length: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        package_width: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        package_height: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    placeholder="Cao"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Switches */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Switch
                id="has_gift"
                checked={formData.has_gift}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, has_gift: checked }))}
              />
              <Label htmlFor="has_gift">Có quà tặng</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is_active">Hiển thị sản phẩm</Label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : product ? (
                "Cập nhật"
              ) : (
                "Thêm sản phẩm"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductFormDialog;
