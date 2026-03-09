"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SW === "true";
    if (process.env.NODE_ENV !== "production" && !enableInDev) {
      return;
    }

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        console.error("service worker registration failed", error);
      }
    };

    void register();
  }, []);

  return null;
}
