import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  preview: {
    host: "::",
    port: 4173,
    strictPort: false,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "sitemap-xml",
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          if (req.url === "/sitemap.xml") {
            res.setHeader("Content-Type", "application/xml; charset=utf-8");
          }
          next();
        });
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    cssCodeSplit: true,
    cssMinify: true,
    // Default esbuild minify — avoid aggressive terser/tree-shake that emptied all chunks
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // No manualChunks: custom splits caused empty bundles + circular init (TDZ) crashes
  },
}));
