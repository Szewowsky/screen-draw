import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider, Toaster } from "../components/ui";
import { SettingsView } from "./settings-view";
import "../styles.css";
import { initializeTheme } from "../theme";

initializeTheme();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <TooltipProvider>
      <SettingsView />
    </TooltipProvider>
    <Toaster />
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept();
}
