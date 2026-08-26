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
