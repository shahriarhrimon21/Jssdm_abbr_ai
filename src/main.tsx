import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles/app.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found in index.html");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Registers the offline-capability service worker (public/sw.js) — see that
// file's header comment for the caching strategy. This is a progressive
// enhancement: registration failing (unsupported browser, blocked by a
// privacy setting, dev environment without HTTPS/localhost) must never
// break the app itself, so any error here is swallowed rather than thrown.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline capability degrades gracefully; the app itself still works online */
    });
  });
}
