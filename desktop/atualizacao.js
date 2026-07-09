// ─── Auto-atualização (electron-updater) ─────────────────────────────────────
// Verifica no boot se há versão nova na VPS (/updates/latest.yml), baixa em
// segundo plano e instala ao fechar o programa — sem interromper o caixa.
//
// IMPORTANTE: o electron-updater (CJS) é carregado de forma PREGUIÇOSA via
// createRequire, DENTRO da função e sob try/catch. Assim, mesmo que ele falhe
// ao carregar no app empacotado, NUNCA derruba o boot do sistema.
import { app, dialog, Notification } from "electron";
import { createRequire } from "module";

export function configurarAutoUpdate(getJanela) {
  if (!app.isPackaged) {
    console.log("[update] modo dev — auto-update desligado");
    return;
  }

  let autoUpdater;
  try {
    const require = createRequire(import.meta.url);
    autoUpdater = require("electron-updater").autoUpdater;
  } catch (e) {
    console.error("[update] não foi possível carregar electron-updater:", e?.message || e);
    return; // sem auto-update, mas o app segue normal
  }

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.verifyUpdateCodeSignature = false; // ainda não assinamos o instalador

    autoUpdater.on("checking-for-update", () => console.log("[update] verificando atualizações…"));
    autoUpdater.on("update-not-available", (info) => console.log("[update] já está na versão mais recente:", info?.version));
    autoUpdater.on("error", (err) => console.error("[update] erro:", err?.message || err));
    autoUpdater.on("download-progress", (p) => console.log(`[update] baixando ${Math.round(p.percent)}%`));

    autoUpdater.on("update-available", (info) => {
      console.log("[update] nova versão disponível:", info.version);
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: "Nexus PDV",
            body: `Atualização ${info.version} disponível — baixando em segundo plano.`,
          }).show();
        }
      } catch { /* notificação é opcional */ }
    });

    autoUpdater.on("update-downloaded", async (info) => {
      console.log("[update] atualização baixada:", info.version);
      const janela = (typeof getJanela === "function" ? getJanela() : null) || undefined;
      try {
        const r = await dialog.showMessageBox(janela, {
          type: "info",
          title: "Atualização pronta",
          message: `A versão ${info.version} do Nexus PDV foi baixada.`,
          detail: "Deseja reiniciar agora para aplicar? Se preferir continuar trabalhando, "
                + "a atualização será instalada automaticamente quando você fechar o programa.",
          buttons: ["Reiniciar agora", "Depois"],
          defaultId: 1, cancelId: 1,
        });
        if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
      } catch (e) {
        console.error("[update] dialog:", e?.message);
      }
    });

    autoUpdater.checkForUpdates().catch((e) => console.error("[update] checkForUpdates:", e?.message || e));
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4 * 60 * 60 * 1000);
  } catch (e) {
    console.error("[update] falha ao configurar auto-update:", e?.message || e);
  }
}
