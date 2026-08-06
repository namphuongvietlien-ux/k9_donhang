import { useRef, useState, useEffect } from "react";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImageUploaderProps {
  imageUrl: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  isUploading?: boolean;
  className?: string;
  label?: string;
  maxSize?: number; // in MB
  aspectRatio?: "square" | "video" | "auto";
  bucket?: string; // Supabase storage bucket name
  folder?: string; // Folder path in storage
}

/**
 * Reusable Image Uploader Component
 * Handles image upload to Supabase Storage and displays preview
 */
const ImageUploader = ({
  imageUrl,
  onUpload,
  onRemove,
  isUploading = false,
  className,
  label,
  maxSize = 5, // Default 5MB
  aspectRatio = "auto",
  bucket = "product-images",
  folder = "uploads",
}: ImageUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(imageUrl || null);

  // Update preview when imageUrl prop changes
  useEffect(() => {
    if (imageUrl !== preview && !uploading) {
      setPreview(imageUrl || null);
    }
  }, [imageUrl, uploading]);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`Kích thước file tối đa là ${maxSize}MB`);
      return;
    }

    setUploading(true);
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl); // Show preview immediately

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const fileExt = file.name.split(".").pop();
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      // Clean up preview URL
      URL.revokeObjectURL(previewUrl);
      
      onUpload(publicUrl);
      setPreview(publicUrl);
      toast.success("Đã tải lên hình ảnh thành công");
    } catch (error) {
      // Clean up preview URL on error
      URL.revokeObjectURL(previewUrl);
      setPreview(imageUrl || null);
      const errorMessage = error instanceof Error ? error.message : "Không thể tải lên hình ảnh";
      toast.error("Không thể tải lên: " + errorMessage);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = () => {
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    if (onRemove) {
      onRemove();
    } else {
      onUpload("");
    }
    toast.success("Đã xóa hình ảnh");
  };

  const aspectRatioClass = {
    square: "aspect-square",
    video: "aspect-video",
    auto: "",
  }[aspectRatio];

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </label>
      )}
      <div
        className={cn(
          "relative border-2 border-dashed border-border rounded-lg p-2 hover:border-primary/50 transition-colors",
          aspectRatioClass && "overflow-hidden"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {preview || imageUrl ? (
          <div className={cn("relative rounded overflow-hidden", aspectRatioClass || "aspect-video")}>
            <img
              src={preview || imageUrl || ""}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 w-6 h-6"
              onClick={handleRemove}
              disabled={uploading || isUploading}
              aria-label="Xóa ảnh"
            >
              <X className="w-3 h-3" />
            </Button>
            {(uploading || isUploading) && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col items-center justify-center text-muted-foreground cursor-pointer",
              aspectRatioClass || "aspect-video",
              "min-h-[120px]"
            )}
            onClick={() => inputRef.current?.click()}
          >
            {uploading || isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <ImageIcon className="w-8 h-8 mb-2" />
                <span className="text-sm">Kéo thả hoặc click để tải ảnh lên</span>
                <span className="text-xs text-muted-foreground mt-1">
                  Tối đa {maxSize}MB
                </span>
              </>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
          disabled={uploading || isUploading}
        />
      </div>
    </div>
  );
};

export default ImageUploader;

