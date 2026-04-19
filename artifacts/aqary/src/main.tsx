import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Local dev: Vite :5173 → API :5001. Production split deploy: set `VITE_API_BASE_URL` to your API origin (no trailing slash).
// Same-origin combined deploy: leave `VITE_API_BASE_URL` unset so requests stay relative `/api/...`.
const apiBase = import.meta.env.VITE_API_BASE_URL;
if (import.meta.env.DEV) {
  setBaseUrl(apiBase || "http://localhost:5001");
} else if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById("root")!).render(<App />);
