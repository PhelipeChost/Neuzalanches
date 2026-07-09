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
