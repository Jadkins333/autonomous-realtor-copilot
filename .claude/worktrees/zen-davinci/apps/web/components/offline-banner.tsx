"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="mx-auto mb-4 w-full max-w-7xl rounded-xl border border-amber-500/60 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      Offline mode: cached pages are available, but write actions are disabled until connection returns.
    </div>
  );
}
