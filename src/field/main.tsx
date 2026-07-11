/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { createRoot } from "react-dom/client";
import FieldApp from "./FieldApp";
import "./field.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FieldApp />
  </React.StrictMode>
);

// Register the field service worker (installability + app-shell; offline outbox = Phase 4).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/field-sw.js", { scope: "/field" }).catch(() => {});
  });
}
