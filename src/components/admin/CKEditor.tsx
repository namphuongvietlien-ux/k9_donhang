import { useRef, useEffect, useState } from "react";
import { Image, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// Lazy load CKEditor to reduce initial bundle size (only used in admin)
let CKEditor: any;
let ClassicEditor: any;
let ckEditorLoaded = false;

const loadCKEditor = async () => {
  if (ckEditorLoaded) return;
  
  try {
    // Load CKEditor modules - load separately to better handle errors
    const CKEditorModuleResult = await import("@ckeditor/ckeditor5-react");
    const ClassicEditorModuleResult = await import("@ckeditor/ckeditor5-build-classic");
    
    // Try to load translations (optional - don't fail if this doesn't work)
    try {
      await import("@ckeditor/ckeditor5-build-classic/build/translations/vi");
    } catch (translationError) {
      // Translations are optional, just log in dev
      if (process.env.NODE_ENV === 'development') {
        console.warn("Vietnamese translations not available for CKEditor:", translationError);
      }
    }
    
    // CKEditor 5 React v11 - CKEditor is a named export
    CKEditor = CKEditorModuleResult.CKEditor;
    // ClassicEditor is a default export
    ClassicEditor = ClassicEditorModuleResult.default;
    
    if (!CKEditor || !ClassicEditor) {
      throw new Error(`CKEditor modules not properly loaded. CKEditor: ${!!CKEditor}, ClassicEditor: ${!!ClassicEditor}`);
    }
    
    ckEditorLoaded = true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Failed to load CKEditor:", error);
    }
    throw error; // Re-throw to be caught by component
  }
};

interface CKEditorComponentProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const CKEditorComponent = ({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: CKEditorComponentProps) => {
  const editorRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCKEditor()
      .then(() => {
        setIsLoading(false);
      })
      .catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error("Failed to load CKEditor in component:", error);
        }
        setIsLoading(false); // Stop loading even on error to show error state
      });
  }, []);

  if (isLoading || !CKEditor || !ClassicEditor) {
    return (
      <div className={cn("ckeditor-wrapper flex items-center justify-center min-h-[200px] border border-input rounded-md", className)}>
        <div className="text-muted-foreground">Đang tải trình soạn thảo...</div>
        {!isLoading && (!CKEditor || !ClassicEditor) && (
          <div className="text-destructive text-sm mt-2">
            Lỗi tải trình soạn thảo. Vui lòng tải lại trang.
          </div>
        )}
      </div>
    );
  }

  const uploadImageToStorage = async (file: File): Promise<string> => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Chỉ cho phép upload file ảnh');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error('Kích thước file tối đa là 5MB');
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `ckeditor-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    if (!publicUrl) {
      throw new Error('Failed to get public URL for uploaded image');
    }

    return publicUrl;
  };

  const insertImageIntoEditor = (imageUrl: string, altText: string) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const currentData = editor.getData();
    const imageHtml = `<p><img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto;" /></p>`;
    
    // Insert at cursor position or append to end
    const newData = currentData + imageHtml;
    editor.setData(newData);
    
    // Trigger onChange
    onChange(newData);
  };

  const handleImageUpload = async () => {
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      setIsUploading(true);

      try {
        const publicUrl = await uploadImageToStorage(file);
        insertImageIntoEditor(publicUrl, file.name);
        
        toast({
          title: "Thành công",
          description: "Ảnh đã được chèn vào mô tả",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Không thể upload ảnh';
        toast({
          variant: "destructive",
          title: "Lỗi upload ảnh",
          description: errorMessage,
        });
      } finally {
        setIsUploading(false);
        // Clean up input
        input.value = '';
      }
    };
    
    input.click();
  };

  return (
    <div className={cn("ckeditor-wrapper", className)}>
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          onClick={handleImageUpload}
          disabled={disabled || isUploading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang upload...</span>
            </>
          ) : (
            <>
              <Image className="h-4 w-4" />
              <span>Chèn ảnh</span>
            </>
          )}
        </Button>
      </div>
      <CKEditor
        editor={ClassicEditor as any}
        data={value || ""}
        disabled={disabled}
        config={{
          placeholder,
          toolbar: [
            "heading",
            "|",
            "bold",
            "italic",
            "link",
            "bulletedList",
            "numberedList",
            "|",
            "blockQuote",
            "insertTable",
            "|",
            "undo",
            "redo",
          ],
        }}
        onReady={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(event, editor) => {
          const data = editor.getData();
          onChange(data);
        }}
      />
      <style>{`
        .ckeditor-wrapper .ck-editor__editable {
          min-height: 200px;
        }
        .ckeditor-wrapper .ck-editor__editable.ck-focused {
          border-color: hsl(var(--primary));
        }
        .ckeditor-wrapper .ck-editor {
          border: 1px solid hsl(var(--input));
          border-radius: calc(var(--radius) - 2px);
        }
        .ckeditor-wrapper .ck-editor__editable {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }
      `}</style>
    </div>
  );
};

export default CKEditorComponent;

