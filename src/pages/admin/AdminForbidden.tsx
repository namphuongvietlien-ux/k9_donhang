import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldX, ArrowLeft } from "lucide-react";

const AdminForbidden = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldX className="w-12 h-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            Truy cập bị từ chối
          </CardTitle>
          <CardDescription className="text-base">
            Bạn không có quyền truy cập trang này
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Trang bạn đang cố gắng truy cập yêu cầu quyền hạn mà tài khoản của bạn không có.
            Vui lòng liên hệ quản trị viên nếu bạn cần quyền truy cập.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <Link to="/admin">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Về trang chủ Admin
              </Link>
            </Button>
            <Button variant="default" className="flex-1" asChild>
              <Link to="/">
                Về trang chủ
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminForbidden;

