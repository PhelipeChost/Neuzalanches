// Ponte segura entre a tela de bloqueio e o processo principal.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenca", {
  info: () => ipcRenderer.invoke("licenca:info"),
  abrirArquivo: () => ipcRenderer.invoke("licenca:abrirArquivo"),
  validar: (token) => ipcRenderer.invoke("licenca:validar", token),
  ativarOnline: (chave) => ipcRenderer.invoke("licenca:ativarOnline", chave),
  reset: () => ipcRenderer.invoke("licenca:reset"),
});

contextBridge.exposeInMainWorld("splash", {
  versao: () => ipcRenderer.invoke("splash:versao"),
});

// Info do PDV (versão do app) — usada pela seção Suporte no diagnóstico.
contextBridge.exposeInMainWorld("pdvInfo", {
  versao: null, // preenchido no boot pelo próprio main; a UI faz fallback via IPC
  getVersao: () => ipcRenderer.invoke("splash:versao"),
});

// Auto-update: gatilho manual "verificar agora" no painel de Suporte
contextBridge.exposeInMainWorld("atualizacao", {
  verificar: () => ipcRenderer.invoke("atualizacao:verificar"),
});
