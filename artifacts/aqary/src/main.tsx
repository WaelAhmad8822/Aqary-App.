import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Local dev: Vite :5173 → local API :5001 (or `VITE_API_BASE_URL`).
// Production default: Railway API. Override with `VITE_API_BASE_URL` at build time.
// Same-origin combined deploy (API on same host as SPA): set `VITE_API_RELATIVE=true` so requests stay `/api/...`.
const DEFAULT_PRODUCTION_API =
  "https://workspaceapi-server-production-e3b4.up.railway.app";

const apiBase = import.meta.env.VITE_API_BASE_URL;
const useRelativeApi = import.meta.env.VITE_API_RELATIVE === "true";

if (import.meta.env.DEV) {
  setBaseUrl(apiBase || "http://localhost:5001");
} else if (useRelativeApi) {
  // Intentionally no setBaseUrl — client uses same-origin `/api/...`
} else {
  setBaseUrl(apiBase || DEFAULT_PRODUCTION_API);
}

createRoot(document.getElementById("root")!).render(<App />);
