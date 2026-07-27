import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import SuporteIndicador from './SuporteIndicador.jsx'

// ─── Fix bug de foco do Electron/Chromium no Windows ────────────────────────
// Depois de um alert()/confirm() nativo, os campos de texto param de aceitar
// foco até a janela perder e recuperar o foco ("campos bloqueados"). Envolve
// os diálogos nativos pra pedir um blur+focus ao processo principal via IPC.
if (window.janela?.refocus) {
    const refocus = () => { try { window.janela.refocus(); } catch { } };
    const _alert = window.alert.bind(window);
    const _confirm = window.confirm.bind(window);
    window.alert = (msg) => { const r = _alert(msg); refocus(); return r; };
    window.confirm = (msg) => { const r = _confirm(msg); refocus(); return r; };
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
        <SuporteIndicador />
    </React.StrictMode>
)