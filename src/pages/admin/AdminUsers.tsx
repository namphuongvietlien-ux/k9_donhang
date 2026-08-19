import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Loader2, UserPlus, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { AdminRoute } from "@/components/admin/AdminRoute";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";

interface User {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  role: 'super_admin' | 'manager' | 'staff' | 'admin' | null;
  role_name: string;
}

const roleOptions = [
  { value: 'super_admin', label: 'Quản trị viên', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'manager', label: 'Quản lý', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'staff', label: 'Nhân viên', color: 'bg-green-100 text-green-800 border-green-300' },
];

const getRoleBadge = (role: string | null) => {
  if (!role) return <Badge variant="outline">Chưa có quyền</Badge>;
  const roleOption = roleOptions.find((r) => r.value === role);
  if (!roleOption) return <Badge variant="outline">{role}</Badge>;
  return (
    <Badge variant="outline" className={roleOption.color}>
      {roleOption.label}
    </Badge>
  );
};

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignRoleDialogOpen, setIsAssignRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserRole, setNewUserRole] = useState<'super_admin' | 'manager' | 'staff'>('staff');
  const [newUserWarehouseId, setNewUserWarehouseId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { session } = useAuth();
  const { warehouses } = useWarehouses();
  const canManageUsers = hasPermission('users.manage');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get users with their roles using RPC function
      // Note: This requires a SECURITY DEFINER function to access auth.users
      const { data, error } = await supabase.rpc('get_admin_users_with_roles');

      if (error) {
        // Fallback: Query user_roles and join with auth.users metadata
        // Since we can't directly query auth.users, we'll use a workaround
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['super_admin', 'manager', 'staff', 'admin']);

        if (rolesError) {
          throw rolesError;
        }

        // For now, we'll show users from user_roles table
        // In production, you should create an Edge Function or RPC function
        // that can safely query auth.users
        const usersWithRoles: User[] = (rolesData || []).map((ur: any) => ({
          id: ur.user_id,
          email: 'N/A', // Will be fetched separately if needed
          email_confirmed_at: null,
          created_at: '',
          role: ur.role,
          role_name: roleOptions.find(r => r.value === ur.role)?.label || ur.role,
        }));

        setUsers(usersWithRoles);
      } else {
        setUsers(data || []);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching users:', error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách users. Vui lòng tạo RPC function get_admin_users_with_roles.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập đầy đủ email và mật khẩu.",
      });
      return;
    }
    if (newUserRole !== 'super_admin' && !newUserWarehouseId) {
      toast({
        variant: "destructive",
        title: "Thiếu chi nhánh",
        description: "Chọn chi nhánh phụ trách cho quản lý hoặc nhân viên.",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Ensure session is valid before calling Edge Function
      if (!session) {
        // Try to refresh session
        const { data: { session: newSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !newSession) {
          throw new Error("Bạn cần đăng nhập lại để thực hiện thao tác này.");
        }
      }

      // Use Edge Function to create user (requires users.manage permission)
      // Use direct fetch to get better error details (status code and response body)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // Use the same key as the Supabase client (supports both VITE_SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!session) {
        throw new Error("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-admin-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserFullName || undefined,
          role: newUserRole,
          warehouse_id: newUserRole === 'super_admin' ? undefined : newUserWarehouseId,
        }),
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        let errorMessage = responseData?.error || responseData?.details || `HTTP ${response.status}: ${response.statusText}`;
        
        // Translate common error messages to Vietnamese
        if (errorMessage.includes("already been registered") || errorMessage.includes("already exists")) {
          errorMessage = `Email ${newUserEmail} đã được đăng ký trong hệ thống. Vui lòng sử dụng email khác hoặc gán quyền cho user hiện có.`;
        } else if (errorMessage.includes("Invalid email")) {
          errorMessage = "Email không hợp lệ. Vui lòng kiểm tra lại.";
        } else if (errorMessage.includes("Password")) {
          errorMessage = "Mật khẩu không hợp lệ. " + errorMessage;
        } else if (errorMessage.includes("Forbidden") || errorMessage.includes("permission")) {
          errorMessage = "Bạn không có quyền thực hiện thao tác này.";
        } else if (errorMessage.includes("Unauthorized")) {
          errorMessage = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
        }
        
        throw new Error(errorMessage);
      }

      if (responseData?.error) {
        let errorMessage = responseData.details ? `${responseData.error}: ${responseData.details}` : responseData.error;
        
        // Translate common error messages to Vietnamese
        if (errorMessage.includes("already been registered") || errorMessage.includes("already exists")) {
          errorMessage = `Email ${newUserEmail} đã được đăng ký trong hệ thống. Vui lòng sử dụng email khác hoặc gán quyền cho user hiện có.`;
        }
        
        throw new Error(errorMessage);
      }

      const data = responseData;

      toast({
        title: "Thành công",
        description: data?.message || `Đã tạo user ${newUserEmail} với quyền ${roleOptions.find(r => r.value === newUserRole)?.label}.`,
      });

      setIsCreateDialogOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFullName("");
      setNewUserRole('staff');
      setNewUserWarehouseId("");
      fetchUsers();
    } catch (error: any) {
      const errorMessage = error.message || error.error || "Không thể tạo user";
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: errorMessage,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !newUserRole) return;

    setIsAssigning(true);
    try {
      // Remove existing admin roles first
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUser.id)
        .in('role', ['super_admin', 'manager', 'staff', 'admin']);

      if (deleteError) throw deleteError;

      // Assign new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: selectedUser.id,
          role: newUserRole,
        });

      if (insertError) throw insertError;

      toast({
        title: "Thành công",
        description: `Đã gán quyền ${roleOptions.find(r => r.value === newUserRole)?.label} cho user.`,
      });

      setIsAssignRoleDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể gán quyền.",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveRole = async (userId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa quyền của user này?")) return;

    // Guard: prevent removing own role or removing super_admin
    const currentUserId = session?.user?.id;
    const targetUser = users.find((u) => u.id === userId);

    if (currentUserId && userId === currentUserId) {
      toast({
        variant: "destructive",
        title: "Không thể xóa quyền của chính bạn",
        description: "Tài khoản đang đăng nhập không thể tự xóa quyền của mình.",
      });
      return;
    }

    if (targetUser?.role === 'super_admin') {
      toast({
        variant: "destructive",
        title: "Không thể xóa quyền super admin",
        description: "Tài khoản super admin không được phép bị xóa quyền từ giao diện này.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .in('role', ['super_admin', 'manager', 'staff', 'admin']);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã xóa quyền của user.",
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể xóa quyền.",
      });
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  const searchFilters: SearchFilter[] = [
    {
      key: "role",
      label: "Quyền",
      options: [
        { value: "all", label: "Tất cả" },
        ...roleOptions.map((r) => ({ value: r.value, label: r.label })),
      ],
      value: roleFilter,
      onChange: setRoleFilter,
    },
  ];

  return (
    <AdminRoute
      requiredRole="manager"
      accessDeniedRedirect="/admin"
    >
      <AdminLayout>
        <SEO title="Quản lý Users" />
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Quản lý Users</h1>
              <p className="text-muted-foreground mt-1">
                Quản lý tài khoản và phân quyền cho admin users
              </p>
            </div>
            {canManageUsers && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Tạo User Mới
              </Button>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách Users</CardTitle>
              <CardDescription>
                Quản lý tài khoản admin và phân quyền
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <AdminSearchBar
                  searchValue={searchQuery}
                  onSearchChange={setSearchQuery}
                  filters={searchFilters}
                  activeFilters={searchFilters.filter((f) => f.value !== "all")}
                  onFilterChange={(key, value) => {
                    const filter = searchFilters.find((f) => f.key === key);
                    if (filter) filter.onChange(value);
                  }}
                />

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Quyền</TableHead>
                            <TableHead>Ngày tạo</TableHead>
                            <TableHead className="text-right">Thao tác</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedUsers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Không có user nào
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedUsers.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.email}</TableCell>
                                <TableCell>{getRoleBadge(user.role)}</TableCell>
                                <TableCell>
                                  {user.created_at
                                    ? format(new Date(user.created_at), "dd/MM/yyyy HH:mm", {
                                        locale: vi,
                                      })
                                    : "N/A"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {canManageUsers && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setSelectedUser(user);
                                            setNewUserRole(user.role || 'staff');
                                            setIsAssignRoleDialogOpen(true);
                                          }}
                                        >
                                          <Shield className="w-4 h-4 mr-2" />
                                          Gán quyền
                                        </Button>
                                        {user.role && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleRemoveRole(user.id)}
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Xóa quyền
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <AdminPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={filteredUsers.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={setItemsPerPage}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create User Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo User Mới</DialogTitle>
              <DialogDescription>
                Tạo tài khoản admin mới. User sẽ nhận email xác nhận.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateUser();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ tên (tùy chọn)</Label>
                <Input
                  id="fullName"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Quyền</Label>
                <Select value={newUserRole} onValueChange={(value: any) => {
                  setNewUserRole(value);
                  if (value === 'super_admin') setNewUserWarehouseId("");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newUserRole !== 'super_admin' ? (
                <div className="space-y-2">
                  <Label htmlFor="warehouse">Chi nhánh phụ trách</Label>
                  <Select value={newUserWarehouseId} onValueChange={setNewUserWarehouseId}>
                    <SelectTrigger id="warehouse">
                      <SelectValue placeholder="Chọn chi nhánh" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouseLabel(warehouse)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Quản lý được duyệt đơn xuất nội bộ của chi nhánh này.
                  </p>
                </div>
              ) : null}
            <DialogFooter className="px-0">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  "Tạo User"
                )}
              </Button>
            </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Assign Role Dialog */}
        <Dialog open={isAssignRoleDialogOpen} onOpenChange={setIsAssignRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gán Quyền</DialogTitle>
              <DialogDescription>
                Gán quyền cho user: {selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assignRole">Quyền</Label>
                <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssignRoleDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleAssignRole} disabled={isAssigning}>
                {isAssigning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang gán...
                  </>
                ) : (
                  "Gán Quyền"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AdminRoute>
  );
};

export default AdminUsers;

