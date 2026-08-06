import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center max-w-md w-full">
        <h1 className="mb-4 text-6xl md:text-8xl font-bold text-primary">404</h1>
        <h2 className="mb-4 text-2xl md:text-3xl font-semibold text-foreground">
          Không tìm thấy trang
        </h2>
        <p className="mb-8 text-lg text-muted-foreground">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild>
            <Link to="/" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Về trang chủ
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/products" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Xem sản phẩm
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
