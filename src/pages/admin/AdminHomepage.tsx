import { useState, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CKEditorComponent from "@/components/admin/CKEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Upload, X, Plus, Trash2 } from "lucide-react";
import { useHomepageContent, iconOptions, HomepageContent, JourneyItem, CoreValue, StoryItem } from "@/hooks/useHomepageContent";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminHomepage = () => {
  const { content, isLoading, updateContent, isUpdating } = useHomepageContent();
  const [localContent, setLocalContent] = useState<HomepageContent | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const currentContent = localContent || content;

  const handleFieldChange = (field: keyof HomepageContent, value: unknown) => {
    setLocalContent(prev => ({
      ...(prev || content),
      [field]: value,
    }));
  };

  const handleJourneyItemChange = (index: number, field: keyof JourneyItem, value: string) => {
    const items = [...currentContent.journey_items];
    items[index] = { ...items[index], [field]: value };
    handleFieldChange("journey_items", items);
  };

  const handleCoreValueChange = (index: number, field: keyof CoreValue, value: string) => {
    const values = [...currentContent.core_values];
    values[index] = { ...values[index], [field]: value };
    handleFieldChange("core_values", values);
  };

  const handleStoryItemChange = (index: number, field: keyof StoryItem, value: string) => {
    const items = [...currentContent.story_items];
    items[index] = { ...items[index], [field]: value };
    handleFieldChange("story_items", items);
  };

  const uploadImage = async (file: File, fieldId: string): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ chấp nhận file ảnh");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return null;
    }

    setUploadingField(fieldId);
    const fileExt = file.name.split(".").pop();
    const fileName = `homepage/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);

    if (uploadError) {
      toast.error("Lỗi upload: " + uploadError.message);
      setUploadingField(null);
      return null;
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(fileName);
    setUploadingField(null);
    return data.publicUrl;
  };

  const handleSave = () => {
    if (localContent) {
      updateContent(localContent);
    }
  };

  const addJourneyItem = () => {
    const items = [...currentContent.journey_items, { icon: "Star", title: "", description: "", image_url: "" }];
    handleFieldChange("journey_items", items);
  };

  const removeJourneyItem = (index: number) => {
    const items = currentContent.journey_items.filter((_, i) => i !== index);
    handleFieldChange("journey_items", items);
  };

  const addCoreValue = () => {
    const values = [...currentContent.core_values, { icon: "Star", title: "", description: "" }];
    handleFieldChange("core_values", values);
  };

  const removeCoreValue = (index: number) => {
    const values = currentContent.core_values.filter((_, i) => i !== index);
    handleFieldChange("core_values", values);
  };

  const addStoryItem = () => {
    const items = [...currentContent.story_items, { title: "", description: "", image_url: "", button_text: "Xem ngay", button_link: "/about" }];
    handleFieldChange("story_items", items);
  };

  const removeStoryItem = (index: number) => {
    const items = currentContent.story_items.filter((_, i) => i !== index);
    handleFieldChange("story_items", items);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quản lý nội dung Trang chủ</h1>
            <p className="text-muted-foreground">Chỉnh sửa nội dung các phần trên trang chủ</p>
          </div>
          <Button onClick={handleSave} disabled={isUpdating || !localContent}>
            <span className="flex items-center">
              <Loader2 className={`w-4 h-4 mr-2 animate-spin ${isUpdating ? 'inline' : 'hidden'}`} />
              <Save className={`w-4 h-4 mr-2 ${isUpdating ? 'hidden' : 'inline'}`} />
              <span>Lưu thay đổi</span>
            </span>
          </Button>
        </div>

        <Tabs defaultValue="journey" className="space-y-4">
          <TabsList>
            <TabsTrigger value="journey">Hành trình</TabsTrigger>
            <TabsTrigger value="values">Giá trị cốt lõi</TabsTrigger>
            <TabsTrigger value="story">Câu chuyện</TabsTrigger>
          </TabsList>

          {/* Journey Section */}
          <TabsContent value="journey" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tiêu đề phần Hành trình</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tiêu đề phụ</Label>
                    <Input
                      value={currentContent.journey_section_subtitle}
                      onChange={(e) => handleFieldChange("journey_section_subtitle", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tiêu đề chính</Label>
                    <Input
                      value={currentContent.journey_section_title}
                      onChange={(e) => handleFieldChange("journey_section_title", e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Các mục hành trình</h3>
              <Button variant="outline" size="sm" onClick={addJourneyItem}>
                <Plus className="w-4 h-4 mr-1" /> Thêm mục
              </Button>
            </div>

            {currentContent.journey_items.map((item, index) => (
              <Card key={index}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Mục {index + 1}</span>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeJourneyItem(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Icon</Label>
                      <Select value={item.icon} onValueChange={(v) => handleJourneyItemChange(index, "icon", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {iconOptions.map(icon => (
                            <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tiêu đề</Label>
                      <Input value={item.title} onChange={(e) => handleJourneyItemChange(index, "title", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Hình ảnh</Label>
                      <ImageUploader
                        imageUrl={item.image_url}
                        onUpload={async (file) => {
                          const url = await uploadImage(file, `journey-${index}`);
                          if (url) handleJourneyItemChange(index, "image_url", url);
                        }}
                        onRemove={() => handleJourneyItemChange(index, "image_url", "")}
                        isUploading={uploadingField === `journey-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Mô tả</Label>
                    <CKEditorComponent
                      value={item.description || ""}
                      onChange={(value) => handleJourneyItemChange(index, "description", value)}
                      placeholder="Nhập mô tả..."
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Core Values Section */}
          <TabsContent value="values" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tiêu đề phần Giá trị cốt lõi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tiêu đề phụ</Label>
                    <Input
                      value={currentContent.core_values_section_subtitle}
                      onChange={(e) => handleFieldChange("core_values_section_subtitle", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tiêu đề chính</Label>
                    <Input
                      value={currentContent.core_values_section_title}
                      onChange={(e) => handleFieldChange("core_values_section_title", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Hình ảnh trung tâm</Label>
                  <ImageUploader
                    imageUrl={currentContent.core_values_image}
                    onUpload={async (file) => {
                      const url = await uploadImage(file, "core-values-image");
                      if (url) handleFieldChange("core_values_image", url);
                    }}
                    onRemove={() => handleFieldChange("core_values_image", "")}
                    isUploading={uploadingField === "core-values-image"}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Các giá trị</h3>
              <Button variant="outline" size="sm" onClick={addCoreValue}>
                <Plus className="w-4 h-4 mr-1" /> Thêm giá trị
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {currentContent.core_values.map((value, index) => (
                <Card key={index}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Giá trị {index + 1}</span>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeCoreValue(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Icon</Label>
                        <Select value={value.icon} onValueChange={(v) => handleCoreValueChange(index, "icon", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {iconOptions.map(icon => (
                              <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tiêu đề</Label>
                        <Input value={value.title} onChange={(e) => handleCoreValueChange(index, "title", e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Mô tả</Label>
                      <CKEditorComponent
                        value={value.description || ""}
                        onChange={(value) => handleCoreValueChange(index, "description", value)}
                        placeholder="Nhập mô tả giá trị cốt lõi..."
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Story Section */}
          <TabsContent value="story" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Các câu chuyện</h3>
              <Button variant="outline" size="sm" onClick={addStoryItem}>
                <Plus className="w-4 h-4 mr-1" /> Thêm câu chuyện
              </Button>
            </div>

            {currentContent.story_items.map((item, index) => (
              <Card key={index}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Câu chuyện {index + 1}</span>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeStoryItem(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tiêu đề</Label>
                      <Input value={item.title} onChange={(e) => handleStoryItemChange(index, "title", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Hình ảnh</Label>
                      <ImageUploader
                        imageUrl={item.image_url}
                        onUpload={async (file) => {
                          const url = await uploadImage(file, `story-${index}`);
                          if (url) handleStoryItemChange(index, "image_url", url);
                        }}
                        onRemove={() => handleStoryItemChange(index, "image_url", "")}
                        isUploading={uploadingField === `story-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Mô tả</Label>
                    <CKEditorComponent
                      value={item.description || ""}
                      onChange={(value) => handleStoryItemChange(index, "description", value)}
                      placeholder="Nhập mô tả câu chuyện..."
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Text nút</Label>
                      <Input value={item.button_text} onChange={(e) => handleStoryItemChange(index, "button_text", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Link nút</Label>
                      <Input value={item.button_link} onChange={(e) => handleStoryItemChange(index, "button_link", e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

// Image Uploader Component
const ImageUploader = ({ 
  imageUrl, 
  onUpload, 
  onRemove, 
  isUploading 
}: { 
  imageUrl: string; 
  onUpload: (file: File) => void; 
  onRemove: () => void;
  isUploading: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  return (
    <div 
      className="relative border-2 border-dashed border-border rounded-lg p-2 hover:border-primary/50 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {imageUrl ? (
        <div className="relative aspect-video rounded overflow-hidden">
          <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-1 right-1 w-6 h-6"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <div 
          className="aspect-video flex flex-col items-center justify-center text-muted-foreground cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-xs">Kéo thả hoặc click</span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </div>
  );
};

export default AdminHomepage;
