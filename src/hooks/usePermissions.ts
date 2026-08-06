import { useCallback } from "react";
import { useAuth, type AdminRole } from "@/contexts/AuthContext";

interface UsePermissionsReturn {
  role: AdminRole;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissionList: string[]) => boolean;
  hasAllPermissions: (permissionList: string[]) => boolean;
  isSuperAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
}

/**
 * Hook to check user permissions
 * @returns Permission checking functions and role information
 */
export const usePermissions = (): UsePermissionsReturn => {
  const { role, permissions, hasPermission: baseHasPermission } = useAuth();

  const hasPermission = useCallback(
    (permission: string) => {
      if (role === 'super_admin') return true; // Super admin has all permissions
      return baseHasPermission(permission);
    },
    [role, baseHasPermission]
  );

  const hasAnyPermission = useCallback(
    (permissionList: string[]) => {
      if (role === 'super_admin') return true;
      return permissionList.some((p) => hasPermission(p));
    },
    [role, hasPermission]
  );

  const hasAllPermissions = useCallback(
    (permissionList: string[]) => {
      if (role === 'super_admin') return true;
      return permissionList.every((p) => hasPermission(p));
    },
    [role, hasPermission]
  );

  return {
    role,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isSuperAdmin: role === 'super_admin',
    isManager: role === 'manager',
    isStaff: role === 'staff',
  };
};

