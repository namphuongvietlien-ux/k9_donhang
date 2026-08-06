import { createContext, useContext, ReactNode } from "react";
import { useAuth, type AdminRole } from "@/contexts/AuthContext";

interface AdminContextType {
  isAdmin: boolean; // Backward compatibility: true if role is super_admin, manager, or staff
  role: AdminRole;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider = ({ children }: AdminProviderProps) => {
  const { user, isAdmin, role, permissions, hasPermission, loading } = useAuth();

  return (
    <AdminContext.Provider value={{ isAdmin, role, permissions, hasPermission, loading }}>
      {children}
    </AdminContext.Provider>
  );
};
