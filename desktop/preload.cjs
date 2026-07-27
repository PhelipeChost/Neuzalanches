// Ponte segura entre a tela de bloqueio e o processo principal.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenca", {
  info: () => ipcRenderer.invoke("licenca:info"),
  status: () => ipcRenderer.invoke("licenca:status"),
  abrirArquivo: () => ipcRenderer.invoke("licenca:abrirArquivo"),
  validar: (token) => ipcRenderer.invoke("licenca:validar", token),
  ativarOnline: (chave) => ipcRenderer.invoke("licenca:ativarOnline", chave),
  reset: () => ipcRenderer.invoke("licenca:reset"),
  gerarCobranca: () => ipcRenderer.invoke("licenca:gerarCobranca"),
  statusPagamento: () => ipcRenderer.invoke("licenca:statusPagamento"),
  reiniciar: () => ipcRenderer.invoke("licenca:reiniciar"),
});

contextBridge.exposeInMainWorld("splash", {
  versao: () => ipcRenderer.invoke("splash:versao"),
});

// Rede local (multi-máquina): modo servidor/cliente entre os PDVs do mesmo
// estabelecimento (caixa + cozinha + terminais extras na mesma rede).
contextBridge.exposeInMainWorld("rede", {
  obter: () => ipcRenderer.invoke("rede:obter"),
  testar: (host) => ipcRenderer.invoke("rede:testar", host),
  salvar: (cfg) => ipcRenderer.invoke("rede:salvar", cfg),
  diagnostico: () => ipcRenderer.invoke("rede:diagnostico"),
  criarRegraFirewall: () => ipcRenderer.invoke("rede:criarRegraFirewall"),
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

// Correção do bug de foco pós-alert/confirm (Chromium no Windows)
// + controles de fullscreen (esconde barra de tarefas do Windows)
contextBridge.exposeInMainWorld("janela", {
  refocus: () => ipcRenderer.invoke("janela:refocus"),
  fullScreen: () => ipcRenderer.invoke("janela:fullScreen"),
  isFullScreen: () => ipcRenderer.invoke("janela:isFullScreen"),
});

// Estado do túnel de suporte (para o indicador visível na UI).
// getEstado() = snapshot imediato; onEstado(cb) = escuta pushes; devolve unsubscribe.
contextBridge.exposeInMainWorld("nexusSuporte", {
  getEstado: () => ipcRenderer.invoke("suporte:estado"),
  onEstado: (cb) => {
    const handler = (_e, s) => cb(s);
    ipcRenderer.on("suporte:estado", handler);
    return () => ipcRenderer.removeListener("suporte:estado", handler);
  },
});
