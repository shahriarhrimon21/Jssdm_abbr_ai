import { useEffect, useState } from "react";

/**
 * Shared online/offline detection — a single, reusable hook (backed by the
 * browser's "online"/"offline" events) so the Topbar can show one compact,
 * global status indicator (Part U: "subtle but clear... NOT an oversized
 * banner") that any page can read.
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
