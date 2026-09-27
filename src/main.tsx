import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// iOS Safari: warn if not installed as PWA (storage may be cleared by browser)
if (!("standalone" in navigator && (navigator as { standalone?: boolean }).standalone) && /iPhone|iPad/.test(navigator.userAgent)) {
  const warned = sessionStorage.getItem("pwa-warned");
  if (!warned) {
    sessionStorage.setItem("pwa-warned", "1");
    // shown via CSS banner, not alert
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
