import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyStoredTheme } from "./lib/hooks.js";
import "./index.css";

// Apply the stored theme before React paints, so a dark-theme user never sees
// a flash of the light palette.
applyStoredTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
