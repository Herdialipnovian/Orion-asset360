import type { CapacitorConfig } from "@capacitor/cli";

// ORIGIN Asset360 — Field APK. The web assets are bundled and served from
// http://localhost inside the WebView: localhost is a secure context (so camera +
// BarcodeDetector work without HTTPS), and an http origin avoids mixed-content when
// the app calls the operator's http server on the LAN (base set at runtime on login).
const config: CapacitorConfig = {
  appId: "id.origin.asset360.field",
  appName: "Asset360 Field",
  webDir: "apk-www",
  server: {
    androidScheme: "http",
    cleartext: true
  }
};

export default config;
