import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./AuthContext";

// Descobre a URL do PDV lanchonete (pra botões "Suporte" e "Trocar de estabelecimento")
// 1) Prioridade: veio via ?pdv=<origin> — guarda em sessionStorage
// 2) Fallback: estamos embutidos no Nexus PDV desktop (porta 41731 do Mercado)?
//    Então o PDV lanchonete está na porta 41730 (convenção do desktop/main.js).
// Assim o botão de Suporte NUNCA some — mesmo se o cliente abrir o Mercado direto.
{
  const search = new URLSearchParams(window.location.search);
  const pdv = search.get("pdv");
  if (pdv && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(pdv)) {
    sessionStorage.setItem("nx_pdv_url", pdv);
    search.delete("pdv");
    const qs = search.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
  } else if (!sessionStorage.getItem("nx_pdv_url")) {
    // Convenção do desktop embarcado: Mercado em 41731 → PDV lanchonete em 41730
    const { hostname, port, protocol } = window.location;
    if (port === "41731" && (hostname === "127.0.0.1" || hostname === "localhost")) {
      sessionStorage.setItem("nx_pdv_url", `${protocol}//${hostname}:41730`);
    }
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
