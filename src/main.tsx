import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import StationApp from "./StationApp";
import "./station.css";
import "./station-v2.css";
import "./preem-theme.css";
import { registerServiceWorker } from "./pwa";
void registerServiceWorker()?.catch(() => {
  /* UI offers useful feedback when push is requested. */
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/station" ||
    window.location.pathname.startsWith("/station/") ? (
      <StationApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
