import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "../components/ui";
import "../styles.css";
import { ToolbarView } from "./toolbar-view";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <TooltipProvider>
      <ToolbarView />
    </TooltipProvider>
  </React.StrictMode>,
);

// Hot Module Replacement (HMR) support
if (import.meta.hot) {
  import.meta.hot.accept();
}
