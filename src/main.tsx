import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/ui/App";
import { initTheme } from "@/document/theme";
import "@/ui/styles.css";

initTheme(); // apply saved (or default solid Dark) theme before first paint

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
