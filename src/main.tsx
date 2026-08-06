import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// CSS is loaded by Vite and will be injected as <style> tags
// This is non-blocking and optimized by Vite's build process
import "./index.css";
// CKEditor translations are loaded dynamically when needed (lazy loaded in CKEditor component)

try {
  const rootElement = document.getElementById("root");
  
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  const root = createRoot(rootElement);
  root.render(<App />);
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    console.error("Failed to initialize app:", error);
  }
  // In production, silently fail or show user-friendly error
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui;">
        <div style="text-align: center; padding: 2rem;">
          <h1 style="color: #dc2626; margin-bottom: 1rem;">Lỗi khởi tạo ứng dụng</h1>
          <p style="color: #6b7280;">Vui lòng tải lại trang hoặc liên hệ hỗ trợ.</p>
        </div>
      </div>
    `;
  }
}
