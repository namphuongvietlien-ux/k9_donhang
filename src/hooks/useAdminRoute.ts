import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface UseAdminRouteOptions {
  requiredPermission?: string;
  requiredRole?: 'super_admin' | 'manager' | 'staff';
  redirectTo?: string;
}

/**
 * Hook to protect admin routes with permission checks
 * @param options - Route protection options
 */
export const useAdminRoute = (options: UseAdminRouteOptions = {}) => {
  const { requiredPermission, requiredRole, redirectTo = '/admin/login' } = options;
  const { user, role, hasPermission, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return; // Wait for auth to load

    // Check if user is authenticated
    if (!user) {
      navigate(redirectTo);
      return;
    }

    // Check if user has admin role
    if (!role) {
      navigate(redirectTo);
      return;
    }

    // Check required role
    if (requiredRole) {
      const roleHierarchy: Record<string, number> = {
        super_admin: 3,
        manager: 2,
        staff: 1,
      };

      const userRoleLevel = roleHierarchy[role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

      if (userRoleLevel < requiredRoleLevel) {
        navigate('/admin/forbidden');
        return;
      }
    }

    // Check required permission
    if (requiredPermission && !hasPermission(requiredPermission)) {
      navigate('/admin/forbidden');
      return;
    }
  }, [user, role, hasPermission, requiredPermission, requiredRole, redirectTo, navigate, loading]);

  return { user, role, hasPermission, loading };
};

