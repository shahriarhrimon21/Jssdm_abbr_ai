import { useEffect, useState } from "react";

/**
 * Shared online/offline detection — extracted so the Topbar can show one
 * compact, global status indicator (Part U: "subtle but clear... NOT an
 * oversized banner") instead of only SmartAbbreviate.tsx knowing about
 * connectivity, which previously left every other page silently unaware.
 * Same real-events approach SmartAbbreviate.tsx already used (the browser's
 * "online"/"offline" events), just lifted to be reusable.
 */
function isOnlineNow(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnlineNow);

  useEffect(() => {
    function update() {
      setOnline(isOnlineNow());
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
