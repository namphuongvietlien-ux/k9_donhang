import { useState, useEffect, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Plus, Trash2, Edit2, ShoppingBag, Store, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FeeType {
  id: string;
  platform_code: string;
  fee_key: string;
  fee_name: string;
  fee_type: 'percentage' | 'fixed_amount';
  fee_unit: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface FeeConfig {
  id: string;
  platform_code: string;
  fee_key: string;
  fee_value: number;
  is_active: boolean;
}

const PLATFORMS = [
  { code: 'shopee', name: 'Shopee', icon: ShoppingBag },
  { code: 'tiktok', name: 'TikTok', icon: Store },
];

const AdminFeeConfig = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState<string>('shopee');
  const [editingFeeType, setEditingFeeType] = useState<FeeType | null>(null);
  const [deletingFeeType, setDeletingFeeType] = useState<FeeType | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newFeeType, setNewFeeType] = useState({
    fee_key: '',
    fee_name: '',
    fee_type: 'percentage' as 'percentage' | 'fixed_amount',
    fee_unit: '%',
    description: '',
    display_order: 0,
  });

  // Fetch fee types
  const { data: feeTypes = [], isLoading: isLoadingTypes, refetch: refetchTypes } = useQuery({
    queryKey: ['platform-fee-types', selectedPlatform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_fee_types')
        .select('*')
        .eq('platform_code', selectedPlatform)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as FeeType[];
    },
  });

  // Fetch fee configs
  const { data: feeConfigs = [], isLoading: isLoadingConfigs, refetch: refetchConfigs } = useQuery({
    queryKey: ['platform-fee-configs', selectedPlatform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_fee_configs')
        .select('*')
        .eq('platform_code', selectedPlatform)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as FeeConfig[];
    },
  });
  

  // Create config map for easy lookup
  const configMap = feeConfigs.reduce((acc, config) => {
    acc[config.fee_key] = config;
    return acc;
  }, {} as Record<string, FeeConfig>);

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (updates: { fee_key: string; fee_value: number }[]) => {
      for (const update of updates) {
        const existing = configMap[update.fee_key];
        if (existing) {
          const { error } = await supabase
            .from('platform_fee_configs')
            .update({ fee_value: update.fee_value })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('platform_fee_configs')
            .insert({
              platform_code: selectedPlatform,
              fee_key: update.fee_key,
              fee_value: update.fee_value,
            });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-fee-configs', selectedPlatform] });
      refetchConfigs();
      toast({
        title: "Thành công",
        description: "Đã lưu cấu hình phí",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: "Không thể lưu cấu hình: " + error.message,
        variant: "destructive",
      });
    },
  });

  // Add fee type mutation
  const addFeeTypeMutation = useMutation({
    mutationFn: async (feeType: typeof newFeeType) => {
      const { error } = await supabase
        .from('platform_fee_types')
        .insert({
          platform_code: selectedPlatform,
          fee_key: feeType.fee_key,
          fee_name: feeType.fee_name,
          fee_type: feeType.fee_type,
          fee_unit: feeType.fee_unit,
          description: feeType.description || null,
          display_order: feeType.display_order,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-fee-types', selectedPlatform] });
      refetchTypes();
      setIsAddDialogOpen(false);
      setNewFeeType({
        fee_key: '',
        fee_name: '',
        fee_type: 'percentage',
        fee_unit: '%',
        description: '',
        display_order: 0,
      });
      toast({
        title: "Thành công",
        description: "Đã thêm loại phí mới",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Không thể thêm loại phí";
      
      // Kiểm tra lỗi conflict (409)
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        errorMessage = `Mã phí "${newFeeType.fee_key}" đã tồn tại cho ${platform?.name}. Vui lòng chọn mã phí khác.`;
      } else if (error.message) {
        errorMessage = `Không thể thêm loại phí: ${error.message}`;
      }
      
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete fee type mutation
  const deleteFeeTypeMutation = useMutation({
    mutationFn: async (feeType: FeeType) => {
      // Soft delete: set is_active = false
      const { error } = await supabase
        .from('platform_fee_types')
        .update({ is_active: false })
        .eq('id', feeType.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-fee-types', selectedPlatform] });
      refetchTypes();
      setDeletingFeeType(null);
      toast({
        title: "Thành công",
        description: "Đã xóa loại phí",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: "Không thể xóa loại phí: " + error.message,
        variant: "destructive",
      });
    },
  });

  const [configValues, setConfigValues] = useState<Record<string, number>>({});

  // Use ref to store latest feeConfigs to avoid dependency on array reference
  const feeConfigsRef = useRef(feeConfigs);
  feeConfigsRef.current = feeConfigs;
  
  // Use ref to track previous serialized value to prevent unnecessary updates
  const prevSerializedRef = useRef<string>('');
  
  useEffect(() => {
    // Compute serialized version of current feeConfigs
    const currentFeeConfigs = feeConfigsRef.current;
    const currentSerialized = currentFeeConfigs.length === 0 
      ? '[]' 
      : JSON.stringify(currentFeeConfigs.map(c => ({ key: c.fee_key, value: c.fee_value })).sort((a, b) => a.key.localeCompare(b.key)));
    
    // Only proceed if serialized value actually changed
    if (currentSerialized === prevSerializedRef.current) {
      return;
    }
    
    // Update ref
    prevSerializedRef.current = currentSerialized;
    
    const values: Record<string, number> = {};
    currentFeeConfigs.forEach((config) => {
      values[config.fee_key] = config.fee_value;
    });
    
    // Only update if values actually changed (compare serialized versions)
    setConfigValues((prev) => {
      const prevSerialized = JSON.stringify(Object.keys(prev).sort().map(k => ({ key: k, value: prev[k] })));
      const newSerialized = JSON.stringify(Object.keys(values).sort().map(k => ({ key: k, value: values[k] })));
      
      if (prevSerialized !== newSerialized) {
        return values;
      }
      return prev;
    });
  }, [feeConfigs.length]); // Only depend on length, not the array itself

  const handleConfigChange = (feeKey: string, value: number) => {
    setConfigValues((prev) => ({ ...prev, [feeKey]: value }));
  };

  const handleSaveConfigs = () => {
    const updates = Object.entries(configValues).map(([fee_key, fee_value]) => ({
      fee_key,
      fee_value,
    }));
    saveConfigMutation.mutate(updates);
  };

  const handleAddFeeType = async () => {
    if (!newFeeType.fee_key || !newFeeType.fee_name) {
      toast({
        title: "Lỗi",
        description: "Vui lòng điền đầy đủ thông tin",
        variant: "destructive",
      });
      return;
    }

    // Kiểm tra xem fee_key đã tồn tại chưa
    const existingFeeType = feeTypes.find(
      (ft) => ft.fee_key.toLowerCase() === newFeeType.fee_key.toLowerCase()
    );

    if (existingFeeType) {
      toast({
        title: "Lỗi",
        description: `Mã phí "${newFeeType.fee_key}" đã tồn tại cho ${platform?.name}. Vui lòng chọn mã phí khác.`,
        variant: "destructive",
      });
      return;
    }

    addFeeTypeMutation.mutate(newFeeType);
  };

  const platform = PLATFORMS.find((p) => p.code === selectedPlatform);

  if (isLoadingTypes || isLoadingConfigs) {
    return (
      <AdminLayout>
        <SEO title="Quản lý cấu hình phí" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý cấu hình phí" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý cấu hình phí sàn</h1>
            <p className="text-muted-foreground mt-2">
              Cấu hình và quản lý các loại phí cho từng sàn thương mại điện tử
            </p>
          </div>
        </div>

        <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform}>
          <TabsList>
            {PLATFORMS.map((p) => (
              <TabsTrigger key={p.code} value={p.code} className="flex items-center gap-2">
                <p.icon className="w-4 h-4" />
                {p.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {PLATFORMS.map((p) => (
            <TabsContent key={p.code} value={p.code} className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <p.icon className="w-5 h-5" />
                        Cấu hình phí {p.name}
                      </CardTitle>
                      <CardDescription>
                        Quản lý các loại phí và giá trị phí cho {p.name}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => setIsAddDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm loại phí
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {feeTypes.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Info className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Chưa có loại phí nào. Hãy thêm loại phí mới để bắt đầu.</p>
                      </div>
                    ) : (
                      feeTypes.map((feeType) => {
                        const config = configMap[feeType.fee_key];
                        const value = configValues[feeType.fee_key] ?? config?.fee_value ?? 0;

                        return (
                          <div
                            key={feeType.id}
                            className="flex items-center gap-4 p-4 border rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="font-semibold">{feeType.fee_name}</Label>
                                <span className="text-xs text-muted-foreground">
                                  ({feeType.fee_key})
                                </span>
                              </div>
                              {feeType.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {feeType.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step={feeType.fee_type === 'percentage' ? '0.01' : '1'}
                                  value={value}
                                  onChange={(e) =>
                                    handleConfigChange(feeType.fee_key, Number(e.target.value))
                                  }
                                  className="w-32"
                                />
                                <span className="text-sm font-medium">{feeType.fee_unit}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingFeeType(feeType)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {feeTypes.length > 0 && (
                    <div className="mt-6 flex justify-end">
                      <Button
                        onClick={handleSaveConfigs}
                        disabled={saveConfigMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {saveConfigMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Lưu cấu hình
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Add Fee Type Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Thêm loại phí mới</DialogTitle>
              <DialogDescription>
                Thêm một loại phí mới cho {platform?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Mã phí (fee_key) *</Label>
                <Input
                  value={newFeeType.fee_key}
                  onChange={(e) =>
                    setNewFeeType({ ...newFeeType, fee_key: e.target.value })
                  }
                  placeholder="vd: newFeeRate"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Mã định danh duy nhất (không có khoảng trắng, dùng camelCase)
                </p>
              </div>
              <div>
                <Label>Tên phí *</Label>
                <Input
                  value={newFeeType.fee_name}
                  onChange={(e) =>
                    setNewFeeType({ ...newFeeType, fee_name: e.target.value })
                  }
                  placeholder="vd: Phí mới"
                />
              </div>
              <div>
                <Label>Loại phí *</Label>
                <Select
                  value={newFeeType.fee_type}
                  onValueChange={(value: 'percentage' | 'fixed_amount') =>
                    setNewFeeType({
                      ...newFeeType,
                      fee_type: value,
                      fee_unit: value === 'percentage' ? '%' : 'VND',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại phí" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]" position="popper">
                    <SelectItem value="percentage">
                      Phần trăm (%)
                    </SelectItem>
                    <SelectItem value="fixed_amount">
                      Số tiền cố định (VND)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Chọn loại phí: <strong>Phần trăm (%)</strong> hoặc <strong>Số tiền cố định (VND)</strong>
                </p>
              </div>
              <div>
                <Label>Đơn vị</Label>
                <Input
                  value={newFeeType.fee_unit}
                  onChange={(e) =>
                    setNewFeeType({ ...newFeeType, fee_unit: e.target.value })
                  }
                  placeholder={newFeeType.fee_type === 'percentage' ? '%' : 'VND'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Đơn vị tự động: <strong>{newFeeType.fee_type === 'percentage' ? '%' : 'VND'}</strong> (theo loại phí đã chọn). Bạn có thể chỉnh sửa nếu cần.
                </p>
              </div>
              <div>
                <Label>Mô tả</Label>
                <Input
                  value={newFeeType.description}
                  onChange={(e) =>
                    setNewFeeType({ ...newFeeType, description: e.target.value })
                  }
                  placeholder="Mô tả về loại phí này"
                />
              </div>
              <div>
                <Label>Thứ tự hiển thị</Label>
                <Input
                  type="number"
                  value={newFeeType.display_order}
                  onChange={(e) =>
                    setNewFeeType({ ...newFeeType, display_order: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleAddFeeType} disabled={addFeeTypeMutation.isPending}>
                {addFeeTypeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Thêm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingFeeType}
          onOpenChange={(open) => !open && setDeletingFeeType(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa loại phí "{deletingFeeType?.fee_name}"? Hành động này
                không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingFeeType && deleteFeeTypeMutation.mutate(deletingFeeType)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminFeeConfig;

