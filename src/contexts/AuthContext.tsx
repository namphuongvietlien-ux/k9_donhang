import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AdminRole = 'super_admin' | 'manager' | 'staff' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean; // Backward compatibility: true if role is super_admin, manager, or staff
  role: AdminRole;
  permissions: string[];
  /** Login GAS (admin, Q7, 275hd…) */
  username: string | null;
  /** NULL = Tất cả kho (Admin); có giá trị = Chi nhánh khóa cứng */
  warehouseId: string | null;
  warehouseCode: string | null;
  warehouseLabel: string | null;
  /** true khi tài khoản gắn 1 kho cụ thể */
  isStoreScoped: boolean;
  hasPermission: (permission: string) => boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

function clearStoreState(
  setUsername: (v: string | null) => void,
  setWarehouseId: (v: string | null) => void,
  setWarehouseCode: (v: string | null) => void,
  setWarehouseLabel: (v: string | null) => void,
) {
  setUsername(null);
  setWarehouseId(null);
  setWarehouseCode(null);
  setWarehouseLabel(null);
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AdminRole>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [warehouseCode, setWarehouseCode] = useState<string | null>(null);
  const [warehouseLabel, setWarehouseLabel] = useState<string | null>(null);

  const loadProfileStore = useCallback(async (userId: string) => {
    let meta: Record<string, unknown> | null = null;
    try {
      const { data: u } = await supabase.auth.getUser();
      meta = (u.user?.user_metadata || null) as Record<string, unknown> | null;
    } catch {
      /* ignore */
    }

    // 1) RPC SECURITY DEFINER — không phụ thuộc RLS profiles bị sai
    try {
      const { data: rpcRows, error: rpcErr } = await supabase.rpc(
        "get_my_store_scope" as never,
      );
      if (!rpcErr && rpcRows) {
        const row = (
          Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
        ) as {
          username?: string | null;
          warehouse_id?: string | null;
          warehouse_code?: string | null;
          warehouse_label?: string | null;
        } | null;
        if (row && (row.warehouse_id != null || row.username != null)) {
          setUsername(row.username || null);
          setWarehouseId(row.warehouse_id || null);
          setWarehouseCode(row.warehouse_code || null);
          setWarehouseLabel(
            row.warehouse_label ||
              (row.warehouse_id ? "Chi nhánh" : "Tất cả"),
          );
          return;
        }
      }
    } catch {
      /* rpc chưa có — fallback */
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "username, warehouse_id, warehouses:warehouse_id ( id, code, name, short_name )",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const row = data as {
          username?: string | null;
          warehouse_id?: string | null;
          warehouses?:
            | {
                id: string;
                code: string;
                name: string;
                short_name?: string | null;
              }
            | {
                id: string;
                code: string;
                name: string;
                short_name?: string | null;
              }[]
            | null;
        };

        setUsername(row.username || null);
        const wid = row.warehouse_id || null;
        setWarehouseId(wid);
        const whRaw = row.warehouses;
        const wh = Array.isArray(whRaw) ? whRaw[0] : whRaw;
        if (wid && wh) {
          setWarehouseCode(wh.code || null);
          setWarehouseLabel(
            wh.short_name || wh.name || wh.code || "Chi nhánh",
          );
        } else {
          setWarehouseCode(null);
          setWarehouseLabel(wid ? "Chi nhánh" : "Tất cả");
        }
        return;
      }

      // Fallback select đơn giản
      const fb = await supabase
        .from("profiles")
        .select("username, warehouse_id, full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (!fb.error && fb.data) {
        const row = fb.data as {
          username?: string | null;
          warehouse_id?: string | null;
        };
        setUsername(row.username || null);
        setWarehouseId(row.warehouse_id || null);
        setWarehouseCode(null);
        setWarehouseLabel(row.warehouse_id ? "Chi nhánh" : "Tất cả");
        if (row.warehouse_id) {
          const wh = await supabase
            .from("warehouses")
            .select("code, name, short_name")
            .eq("id", row.warehouse_id)
            .maybeSingle();
          if (wh.data) {
            const w = wh.data as {
              code?: string;
              name?: string;
              short_name?: string;
            };
            setWarehouseCode(w.code || null);
            setWarehouseLabel(
              w.short_name || w.name || w.code || "Chi nhánh",
            );
          }
        }
        return;
      }

      // 3) user_metadata từ seed (khi RLS profiles chặn đọc)
      const mid = (meta?.warehouse_id as string) || null;
      const mcode = (meta?.warehouse_code as string) || null;
      const muser = (meta?.username as string) || null;
      const mlabel = (meta?.warehouse_label as string) || mcode;
      if (mid || mcode || muser) {
        setUsername(muser);
        setWarehouseId(mid);
        setWarehouseCode(mcode);
        setWarehouseLabel(mlabel || (mid || mcode ? "Chi nhánh" : "Tất cả"));
        if (mid && !mcode) {
          const wh = await supabase
            .from("warehouses")
            .select("code, name, short_name")
            .eq("id", mid)
            .maybeSingle();
          if (wh.data) {
            const w = wh.data as {
              code?: string;
              name?: string;
              short_name?: string;
            };
            setWarehouseCode(w.code || null);
            setWarehouseLabel(
              w.short_name || w.name || w.code || "Chi nhánh",
            );
          }
        }
        return;
      }

      clearStoreState(
        setUsername,
        setWarehouseId,
        setWarehouseCode,
        setWarehouseLabel,
      );
    } catch {
      clearStoreState(
        setUsername,
        setWarehouseId,
        setWarehouseCode,
        setWarehouseLabel,
      );
    }
  }, []);

  // Function to load user role and permissions
  const loadUserRoleAndPermissions = useCallback(async (userId: string) => {
    try {
      // Check if user can access admin panel
      const { data: canAccess, error: canAccessError } = await supabase.rpc('can_access_admin', {
        _user_id: userId
      });

      if (canAccessError || !canAccess) {
        setRole(null);
        setPermissions([]);
        setIsAdmin(false);
        clearStoreState(
          setUsername,
          setWarehouseId,
          setWarehouseCode,
          setWarehouseLabel,
        );
        return;
      }

      // Get user role
      const { data: roleData, error: roleError } = await supabase.rpc('get_user_role', {
        _user_id: userId
      });

      if (roleError || !roleData) {
        // Fallback: check for 'admin' role (backward compatibility)
        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        
        if (adminData) {
          setRole('super_admin'); // Map 'admin' to 'super_admin'
          setIsAdmin(true);
        } else {
          setRole(null);
          setIsAdmin(false);
        }
        setPermissions([]);
        await loadProfileStore(userId);
        return;
      }

      // Set role (handle backward compatibility: map 'admin' to 'super_admin')
      const adminRole = roleData === 'admin' ? 'super_admin' : roleData as AdminRole;
      setRole(adminRole);
      setIsAdmin(!!adminRole);

      await loadProfileStore(userId);

      // Get permissions using database function (more reliable with RLS)
      const { data: permissionsData, error: permissionsError } = await supabase.rpc('get_user_permissions', {
        _user_id: userId
      });

      if (permissionsError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error getting permissions:', permissionsError);
        }
        // Fallback: query permissions directly if function fails
        // Query role_permissions and permissions separately to avoid nested select issues
        const { data: rolePermsData, error: rolePermsError } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role', roleData);

        if (rolePermsError || !rolePermsData || rolePermsData.length === 0) {
          setPermissions([]);
          return;
        }

        const permissionIds = rolePermsData.map((rp: any) => rp.permission_id);
        
        const { data: permsData, error: permsError } = await supabase
          .from('permissions')
          .select('code')
          .in('id', permissionIds);

        if (permsError || !permsData) {
          setPermissions([]);
          return;
        }

        const permissionCodes = permsData.map((p: any) => p.code) as string[];
        setPermissions(permissionCodes);
        return;
      }

      // permissionsData is already an array of permission codes (or null if no permissions)
      setPermissions(permissionsData || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading role and permissions:', error);
      }
      setRole(null);
      setPermissions([]);
      setIsAdmin(false);
      clearStoreState(
        setUsername,
        setWarehouseId,
        setWarehouseCode,
        setWarehouseLabel,
      );
    }
  }, [loadProfileStore]);

  // Function to check permission
  const hasPermission = useCallback((permission: string) => {
    if (role === 'super_admin') return true; // Super admin has all permissions
    return permissions.includes(permission);
  }, [role, permissions]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only synchronous state updates here
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer Supabase calls with requestIdleCallback to avoid blocking critical path
          // Falls back to setTimeout if requestIdleCallback is not available
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
              loadUserRoleAndPermissions(session.user.id);
            }, { timeout: 2000 });
          } else {
            setTimeout(() => {
              loadUserRoleAndPermissions(session.user.id);
            }, 0);
          }
        } else {
          setRole(null);
          setPermissions([]);
          setIsAdmin(false);
          clearStoreState(
            setUsername,
            setWarehouseId,
            setWarehouseCode,
            setWarehouseLabel,
          );
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session - defer to avoid blocking initial render
    // Use requestIdleCallback to defer non-critical auth check
    const checkSession = () => {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          loadUserRoleAndPermissions(session.user.id).finally(() => {
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      }).catch(() => {
        setLoading(false);
      });
    };

    // Defer session check to avoid blocking critical rendering path
    if ('requestIdleCallback' in window) {
      requestIdleCallback(checkSession, { timeout: 1000 });
    } else {
      // Fallback: use setTimeout with small delay
      setTimeout(checkSession, 100);
    }

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    let login = String(email || "").trim().toLowerCase();
    if (login && !login.includes("@")) {
      login = `${login}@k9.local`;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: login,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setPermissions([]);
    setIsAdmin(false);
    clearStoreState(
      setUsername,
      setWarehouseId,
      setWarehouseCode,
      setWarehouseLabel,
    );
  };

  const isStoreScoped = !!warehouseId;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin,
        role,
        permissions,
        username,
        warehouseId,
        warehouseCode,
        warehouseLabel,
        isStoreScoped,
        hasPermission,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
