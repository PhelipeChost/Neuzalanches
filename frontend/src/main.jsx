import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./AuthContext";

// Veio do Nexus PDV (multi-estabelecimento)? Guarda a URL de volta pro
// botão "Trocar de estabelecimento" e limpa a query da barra.
{
  const pdv = new URLSearchParams(window.location.search).get("pdv");
  if (pdv && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(pdv)) {
    sessionStorage.setItem("nx_pdv_url", pdv);
    window.history.replaceState({}, "", window.location.pathname);
  }
}

// PWA: registra o service worker (produção)
if ("serviceWorker" in navigator && !location.hostname.includes("localhost:5174")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
