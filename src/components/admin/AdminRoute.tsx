import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminRoute } from "@/hooks/useAdminRoute";
import { Loader2 } from "lucide-react";

interface AdminRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: 'super_admin' | 'manager' | 'staff';
  redirectTo?: string;
}

/**
 * Component to protect admin routes with permission checks
 * Usage:
 * <AdminRoute requiredPermission="orders.view">
 *   <AdminOrders />
 * </AdminRoute>
 */
export const AdminRoute = ({
  children,
  requiredPermission,
  requiredRole,
  redirectTo = '/admin/login',
}: AdminRouteProps) => {
  const { user, role, hasPermission, loading } = useAdminRoute({
    requiredPermission,
    requiredRole,
    redirectTo,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !role) {
    return <Navigate to={redirectTo} replace />;
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
      return <Navigate to="/admin/forbidden" replace />;
    }
  }

  // Check required permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/admin/forbidden" replace />;
  }

  return <>{children}</>;
};

