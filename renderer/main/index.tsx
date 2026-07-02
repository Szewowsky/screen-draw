import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { ErrorBoundaryView, TooltipProvider, Toaster } from "../components/ui";
import { RootView } from "./root-view";

declare const __APP_DISPLAY_NAME__: string | undefined;

document.title = __APP_DISPLAY_NAME__ || document.title;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <ErrorBoundaryView />;
    return this.props.children;
  }
}

// Get the root element
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

// Create React root and render
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <TooltipProvider>
      <ErrorBoundary>
        <RootView />
      </ErrorBoundary>
    </TooltipProvider>
    <Toaster />
  </React.StrictMode>,
);

// Hot Module Replacement (HMR) support
if (import.meta.hot) {
  import.meta.hot.accept();
}
