import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Force cache refresh for production updates
console.log("🔄 PRODUCTION: App loading with enhanced authentication - v2.1");

createRoot(document.getElementById("root")!).render(<App />);
