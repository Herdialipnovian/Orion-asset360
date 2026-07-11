import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Build ONLY the field PWA, with relative asset paths, for bundling inside the
// Capacitor APK (served from http://localhost -> a secure context, so the camera
// + BarcodeDetector work without HTTPS). API base is set at runtime on login.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  build: {
    outDir: "apk-www",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "field.html") }
  }
});
