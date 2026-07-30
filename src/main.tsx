import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "#daymark-surface";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (
  import.meta.env.VITE_DAYMARK_SURFACE !== "software" &&
  "serviceWorker" in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {
      // Daymark remains fully usable online when registration is unavailable.
      });
  });
}
