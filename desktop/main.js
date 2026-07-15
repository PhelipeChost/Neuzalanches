// ─── NEXUS PDV — Desktop (Electron) ──────────────────────────────────────────
// Offline-first: sobe o MESMO servidor Express/SQLite localmente (banco na pasta
// do usuário) e abre a plataforma numa janela. Antes de tudo, passa pelo GATE DE
// LICENÇA (RS256). Sem licença válida → tela de bloqueio; nunca inicia o servidor.
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } from "electron";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, appendFileSync, rmSync } from "fs";
import http from "http";

import { verificarLicenca } from "./licenca/verificar.js";
import { CHAVE_PUBLICA_NEXUS } from "./licenca/chavePublica.js";
import { fingerprintMaquina } from "./licenca/fingerprint.js";
import { lerLicenca, salvarLicenca, removerLicenca } from "./licenca/armazenamento.js";
import { ativarOnline, heartbeatOnline, lerChave, salvarChave, aplicarConfigSync, gerarCobrancaPix, statusPagamento } from "./licenca/online.js";
import { criarMotorSync, criarAuthVps } from "./sync/motor.js";
import { configurarAutoUpdate } from "./atualizacao.js";
import { iniciarAgenteImpressao } from "./agente-impressao.js";
import { lerConfigRede, salvarConfigRede, meusIpsLan, testarServidor, diagnosticoRede, criarRegraFirewall } from "./rede/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");          // pasta principal (server/, etc.)
const PORT = 41730;                                // porta local fixa do app (lanchonete)
const MERCADO_PORT = 41731;                        // porta local do PDV Mercado (2º stack)
const APP_NAME = "Nexus PDV";
const ICONE = nativeImage.createFromPath(join(__dirname, "build", "icon.ico"));

// Nome que aparece na barra de tarefas do Windows (agrupador)
if (process.platform === "win32") app.setAppUserModelId("com.nexus.pdv");

// Chave pública: em produção (empacotado), SEMPRE a chave real da Nexus. Rodando
// do código-fonte, se existir chave-dev.pem, usa ela — permite testar sem licença real.
let PUBKEY = CHAVE_PUBLICA_NEXUS;
function resolverChave() {
  const devPem = join(__dirname, "licenca", "chave-dev.pem");
  if (!app.isPackaged && existsSync(devPem)) {
    console.log("[licenca] MODO DEV — usando chave-dev.pem (não vai no instalador)");
    return readFileSync(devPem, "utf8");
  }
  return CHAVE_PUBLICA_NEXUS;
}

let splash = null;    // janela de boas-vindas
let janela = null;    // janela principal (login/app ou tela de bloqueio)

// ─── Servidor local (reaproveita server/index.js) ────────────────────────────
async function iniciarServidor() {
  const dirDados = app.getPath("userData");
  process.env.PORT = String(PORT);
  process.env.FLUXO_DB_PATH = join(dirDados, "fluxo-caixa.db");     // banco gravável
  process.env.FLUXO_DIST_PATH = join(__dirname, "app-dist");        // frontend base "/"
  process.env.NODE_ENV = "production";
  process.env.NEXUS_DESKTOP = "1";  // habilita login opcional (acesso direto até ativar)
  process.env.MERCADO_URL = `http://127.0.0.1:${MERCADO_PORT}`; // exposto no GET tipos-estabelecimento
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "nexus-desktop-" + fingerprintMaquina();

  await import(pathToFileURL(join(REPO_ROOT, "server", "index.js")).href);
  await esperarPorta(PORT, 15000);
}

// ─── PDV Mercado (2º stack: backend/ + frontend/) ────────────────────────────
// Sobe no MESMO processo, em outra porta. sql.js é WASM puro (zero dependência
// nativa), então não briga com o ABI do Electron. Falha aqui NUNCA derruba o
// PDV lanchonete — o mercado simplesmente fica indisponível.
async function iniciarMercado() {
  const dirDados = app.getPath("userData");
  const backendIndex = join(REPO_ROOT, "backend", "src", "index.js");
  if (!existsSync(backendIndex)) {
    console.log("[mercado] backend/ não encontrado neste build — pulado");
    return;
  }
  process.env.MERCADO_PORT = String(MERCADO_PORT);
  process.env.MERCADO_DB_PATH = join(dirDados, "mercado.db");
  // Empacotado: frontend-dist vai em resources/ via extraResources.
  // Dev (código-fonte): usa frontend/dist buildado.
  process.env.MERCADO_DIST = app.isPackaged
    ? join(REPO_ROOT, "frontend-dist")
    : join(REPO_ROOT, "frontend", "dist");

  await import(pathToFileURL(backendIndex).href);
  console.log(`[mercado] PDV Mercado no ar em http://127.0.0.1:${MERCADO_PORT}`);
}

// ─── Sincronização com a nuvem (opcional, config em userData/sync.json) ──────
let motorSync = null;
async function iniciarSync(dirDados) {
  const cfgPath = join(dirDados, "sync.json");
  if (!existsSync(cfgPath)) { console.log("[sync] sem sync.json — modo 100% local"); return; }
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")); } catch { console.log("[sync] sync.json inválido"); return; }
  if (!cfg.ativo || !cfg.vpsUrl || !cfg.email) { console.log("[sync] desativado na config"); return; }

  const db = await import(pathToFileURL(join(REPO_ROOT, "server", "database.js")).href);
  const curPath = join(dirDados, "sync-cursor.json");
  let cur;
  try { cur = JSON.parse(readFileSync(curPath, "utf8")); } catch { cur = { pull: "1970-01-01T00:00:00", push: "1970-01-01T00:00:00" }; }
  const salvar = () => { try { writeFileSync(curPath, JSON.stringify(cur)); } catch {} };
  const cursor = {
    getPull() { return cur.pull; }, setPull(v) { cur.pull = v; salvar(); },
    getPush() { return cur.push; }, setPush(v) { cur.push = v; salvar(); },
  };
  motorSync = criarMotorSync({
    vpsUrl: cfg.vpsUrl,
    obterToken: criarAuthVps({ vpsUrl: cfg.vpsUrl, email: cfg.email, senha: cfg.senha, syncToken: cfg.syncToken }),
    local: { pedidosAlteradosDesde: db.pedidosAlteradosDesde, upsertPedidoSync: db.upsertPedidoSync },
    cursor,
    log: (m) => console.log("[sync]", m),
  });
  motorSync.start(cfg.intervaloMs || 5000);
  console.log("[sync] iniciado →", cfg.vpsUrl);
}

function esperarPorta(port, timeoutMs) {
  const ate = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tenta = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/produtos", timeout: 1500 }, (res) => {
        res.destroy(); resolve();
      });
      req.on("error", () => { Date.now() > ate ? reject(new Error("Servidor local não subiu a tempo.")) : setTimeout(tenta, 400); });
      req.on("timeout", () => { req.destroy(); Date.now() > ate ? reject(new Error("timeout")) : setTimeout(tenta, 400); });
    };
    tenta();
  });
}

// ─── Janelas ─────────────────────────────────────────────────────────────────
function janelaBase(extra = {}) {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: "#0d0f14",
    title: APP_NAME,
    icon: ICONE,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
    ...extra,
  });
  // A <title> da página (index.html) senão sobrescreve o título da janela
  // no taskbar/Alt+Tab assim que carrega — trava sempre em APP_NAME.
  win.on("page-title-updated", (e) => e.preventDefault());
  return win;
}

// Splash: janela pequena, sem moldura, com a logo — aparece IMEDIATAMENTE
// enquanto o servidor local sobe em segundo plano.
function abrirSplash() {
  splash = new BrowserWindow({
    width: 480, height: 420,
    frame: false, transparent: false, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: false, center: true,
    backgroundColor: "#0b1622",
    title: APP_NAME,
    icon: ICONE,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(join(__dirname, "ui", "splash.html"));
}
function fecharSplash() {
  if (splash && !splash.isDestroyed()) { try { splash.close(); } catch {} }
  splash = null;
}

function abrirApp(resultado, host = "127.0.0.1") {
  janela = janelaBase({ show: false });
  janela.once("ready-to-show", () => {
    janela.show();
    fecharSplash();
    if (resultado.estado === "tolerancia") {
      dialog.showMessageBox(janela, {
        type: "warning", title: "Assinatura vencida",
        message: "Sua licença venceu.",
        detail: resultado.motivo + "\n\nO sistema continua funcionando por alguns dias. Regularize com a Nexus para não bloquear.",
        buttons: ["Entendi"],
      });
    }
  });
  janela.loadURL(`http://${host}:${PORT}/`);
  janela.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

function abrirBloqueio(resultado) {
  janela = janelaBase({ width: 620, height: 720, resizable: false, show: false });
  janela._motivo = resultado.motivo;
  janela.once("ready-to-show", () => { janela.show(); fecharSplash(); });
  janela.loadFile(join(__dirname, "ui", "bloqueio.html"));
}

// Modo cliente (multi-máquina): a máquina servidor configurada não respondeu.
// Tela simples com "tentar de novo" e opção de trocar a configuração de rede,
// em vez de travar num erro cru do Chromium.
function abrirServidorOffline() {
  janela = janelaBase({ width: 560, height: 560, resizable: false, show: false });
  janela.once("ready-to-show", () => { janela.show(); fecharSplash(); });
  janela.loadFile(join(__dirname, "ui", "servidor-offline.html"));
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle("licenca:info", () => ({
  fingerprint: fingerprintMaquina(),
  motivo: (BrowserWindow.getFocusedWindow() || janela)?._motivo || "É necessário ativar a licença.",
  versao: app.getVersion(),
  temChave: !!lerChave(app.getPath("userData")),
}));

ipcMain.handle("licenca:abrirArquivo", async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: "Abrir arquivo de licença",
    filters: [{ name: "Licença Nexus", extensions: ["lic", "txt", "jwt"] }, { name: "Todos", extensions: ["*"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return readFileSync(r.filePaths[0], "utf8").trim(); } catch { return null; }
});

ipcMain.handle("licenca:validar", (_e, token) => {
  const res = verificarLicenca(token, { publicKeyPem: PUBKEY, fingerprintAtual: fingerprintMaquina() });
  if (res.estado !== "bloqueado") {
    const dir = app.getPath("userData");
    salvarLicenca(dir, token);
    const chave = res.claims?.chave || res.claims?.license_key;
    if (chave) salvarChave(dir, chave);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
    return { ok: true, estado: res.estado };
  }
  return { ok: false, motivo: res.motivo };
});

// Ativação ONLINE por chave: fala com a Nexus, recebe o token + config de sync,
// grava tudo e reinicia. É o caminho recomendado (dispensa enviar .lic à mão).
ipcMain.handle("licenca:ativarOnline", async (_e, chave) => {
  chave = String(chave || "").trim();
  if (!chave) return { ok: false, motivo: "Informe a chave de licença." };
  const dir = app.getPath("userData");
  const fingerprint = fingerprintMaquina();

  let resp;
  try {
    resp = await ativarOnline({ chave, fingerprint });
  } catch {
    return { ok: false, motivo: "Sem conexão com o servidor da Nexus. Verifique a internet." };
  }

  if (!resp.token) {
    const motivos = {
      invalido: "Chave de licença inválida.",
      revogado: "Licença revogada. Contate a Nexus.",
      bloqueado: resp.error || "Licença bloqueada.",
    };
    return { ok: false, motivo: motivos[resp.estado] || resp.error || "Não foi possível ativar a licença." };
  }

  // Confere a assinatura localmente antes de aceitar (defesa em profundidade).
  const check = verificarLicenca(resp.token, { publicKeyPem: PUBKEY, fingerprintAtual: fingerprint });
  if (check.estado === "bloqueado") return { ok: false, motivo: check.motivo };

  salvarLicenca(dir, resp.token);
  salvarChave(dir, chave);
  aplicarConfigSync(dir, resp.config); // liga a cozinha simultânea (sync.json)
  setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
  return { ok: true, estado: check.estado };
});

// Reset: esquece a licença + chave e reinicia → volta para a tela de ativação.
ipcMain.handle("licenca:reset", async () => {
  const dir = app.getPath("userData");
  removerLicenca(dir);
  try { const { caminhoChave } = await import("./licenca/online.js"); rmSync(caminhoChave(dir), { force: true }); } catch {}
  setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
  return { ok: true };
});

// ─── Pagamento Pix (GoatPay) ────────────────────────────────────────────────
// Gera QR Pix para o cliente pagar a mensalidade pela tela de bloqueio.
ipcMain.handle("licenca:gerarCobranca", async () => {
  const chave = lerChave(app.getPath("userData"));
  if (!chave) return { ok: false, motivo: "Nenhuma chave de licença registrada." };
  try {
    const r = await gerarCobrancaPix(chave);
    if (r.error) return { ok: false, motivo: r.error };
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, motivo: "Sem conexão com o servidor. Verifique a internet." };
  }
});

ipcMain.handle("licenca:statusPagamento", async () => {
  const chave = lerChave(app.getPath("userData"));
  if (!chave) return { pago: false };
  try {
    const r = await statusPagamento(chave);
    // Só considera pago se a ÚLTIMA cobrança gerada estiver com status "paid" —
    // clientStatus é o status geral da conta (já "ativo" na renovação proativa,
    // antes de vencer) e NÃO reflete se esta cobrança específica foi paga.
    const pago = r.ultimaCobranca?.status === "paid";
    if (pago) {
      await baterHeartbeat(app.getPath("userData"));
    }
    return { pago, ...r };
  } catch {
    return { pago: false };
  }
});

ipcMain.handle("licenca:reiniciar", () => {
  setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
  return { ok: true };
});

// Splash pergunta a versão
ipcMain.handle("splash:versao", () => app.getVersion());

// Status da licença — usado pelo Suporte (plano de assinatura / validade).
// Só LÊ e verifica; não altera nada.
ipcMain.handle("licenca:status", () => {
  try {
    const dir = app.getPath("userData");
    const token = lerLicenca(dir);
    const r = verificarLicenca(token, { publicKeyPem: PUBKEY, fingerprintAtual: fingerprintMaquina() });
    const c = r.claims || {};
    return {
      estado: r.estado,                       // ativo | tolerancia | bloqueado
      motivo: r.motivo,
      dias_restantes: r.diasRestantes,
      expira_em: c.exp ? new Date(c.exp * 1000).toISOString() : null,
      plano: c.plano || c.plan || null,
      cliente: c.cliente || c.nome || c.name || null,
      grace_days: Number(c.grace_days) || 0,
      versao: app.getVersion(),
    };
  } catch (e) {
    return { estado: "erro", motivo: e.message };
  }
});

// ─── Rede local (multi-máquina) ──────────────────────────────────────────────
ipcMain.handle("rede:obter", () => {
  const cfg = lerConfigRede(app.getPath("userData"));
  return { ...cfg, meusIps: meusIpsLan(), porta: PORT };
});

ipcMain.handle("rede:testar", async (_e, host) => {
  host = String(host || "").trim();
  if (!host) return { ok: false, motivo: "Informe o endereço da máquina servidor." };
  return await testarServidor(host, PORT);
});

// Salva o modo de rede e reinicia — mesmo padrão da ativação de licença
// (salvar + relaunch), já que o boot inteiro depende dessa escolha.
ipcMain.handle("rede:salvar", (_e, cfg) => {
  salvarConfigRede(app.getPath("userData"), cfg);
  setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
  return { ok: true };
});

ipcMain.handle("rede:diagnostico", () => diagnosticoRede(PORT));

ipcMain.handle("rede:criarRegraFirewall", () => criarRegraFirewall(PORT));

// Workaround do bug de foco do Chromium/Electron no Windows: depois de um
// alert()/confirm() nativo, os inputs param de aceitar foco até a janela
// perder e recuperar o foco. O frontend chama isso após cada diálogo nativo.
ipcMain.handle("janela:refocus", () => {
  try {
    if (janela && !janela.isDestroyed()) { janela.blur(); janela.focus(); }
  } catch { /* janela pode não existir ainda */ }
  return { ok: true };
});

// ─── Heartbeat ("ligar em casa") ─────────────────────────────────────────────
// Renova o token (estende a validade offline), atualiza a config de sync e
// reporta a versão instalada. Só roda se a ativação foi online (há chave salva).
async function baterHeartbeat(dir) {
  const chave = lerChave(dir);
  if (!chave) return; // ativado por arquivo .lic — sem heartbeat
  let resp;
  try {
    resp = await heartbeatOnline({ chave, fingerprint: fingerprintMaquina(), versao_app: app.getVersion() });
  } catch { return; } // offline: mantém o token em cache, segue trabalhando
  if (resp.estado === "ativo" && resp.token) {
    salvarLicenca(dir, resp.token);      // renova a validade
    aplicarConfigSync(dir, resp.config); // atualiza a config de sync
  } else if (resp.estado === "revogado") {
    removerLicenca(dir);                 // kill switch: bloqueia no próximo boot
  }
  // bloqueado/tolerancia: não renova; o token expira naturalmente.
}

function iniciarHeartbeat(dir) {
  baterHeartbeat(dir);                                        // no boot
  setInterval(() => baterHeartbeat(dir), 1 * 60 * 60 * 1000); // a cada 1h
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function main() {
  // Log de boot em arquivo (app empacotado não mostra console) — %APPDATA%/Nexus PDV/boot.log
  try {
    const logPath = join(app.getPath("userData"), "boot.log");
    const escreve = (tag, args) => { try { appendFileSync(logPath, `${new Date().toISOString()} ${tag} ${args.map(a => a && a.stack ? a.stack : a).join(" ")}\n`); } catch {} };
    const _l = console.log.bind(console), _e = console.error.bind(console);
    console.log = (...a) => { _l(...a); escreve("[log]", a); };
    console.error = (...a) => { _e(...a); escreve("[err]", a); };
    process.on("uncaughtException", (e) => escreve("[uncaught]", [e]));
    process.on("unhandledRejection", (e) => escreve("[rejection]", [e]));
    escreve("[boot]", ["main() iniciou — v" + app.getVersion()]);
  } catch { /* logging é best-effort */ }

  Menu.setApplicationMenu(null);
  PUBKEY = resolverChave();

  // 1º — SPLASH imediato (dá feedback antes de qualquer verificação lenta)
  abrirSplash();

  const dirDados = app.getPath("userData");
  console.log("[boot] userData =", dirDados);
  const token = lerLicenca(dirDados);
  const resultado = verificarLicenca(token, { publicKeyPem: PUBKEY, fingerprintAtual: fingerprintMaquina() });

  if (resultado.estado === "bloqueado") {
    // Deixa o splash aparecer por um instante antes da tela de ativação
    setTimeout(() => abrirBloqueio(resultado), 900);
    return;
  }

  const redeCfg = lerConfigRede(dirDados);

  // ── MODO CLIENTE (multi-máquina): não sobe servidor nem banco próprios —
  // só abre a janela apontando pra máquina servidor na rede local. Impressora,
  // licença e auto-update continuam por conta desta máquina (são locais).
  if (redeCfg.modo === "cliente" && redeCfg.servidorHost) {
    console.log("[boot] modo cliente — conectando em", redeCfg.servidorHost);
    const teste = await testarServidor(redeCfg.servidorHost, PORT);
    if (!teste.ok) {
      console.error("[boot] servidor não respondeu:", teste.motivo);
      fecharSplash();
      abrirServidorOffline();
      return;
    }
    iniciarAgenteImpressao().catch(e => console.error("[agente-impressao] falha ao iniciar:", e && e.message));
    abrirApp(resultado, redeCfg.servidorHost);
    iniciarHeartbeat(dirDados);
    configurarAutoUpdate(() => janela);
    return;
  }

  // ── MODO SERVIDOR (padrão — comportamento original, single-machine) ──────
  try {
    // Tenta criar regra de firewall para a porta do PDV (permite multi-máquina).
    // Falha silenciosa se não for admin — o usuário pode criar depois via Suporte.
    try {
      const diag = diagnosticoRede(PORT);
      if (!diag.ok) {
        const semRegra = diag.problemas.find(p => p.tipo === "sem_regra_firewall");
        if (semRegra) {
          const r = criarRegraFirewall(PORT);
          console.log("[rede] regra de firewall:", r.ok ? "criada" : r.motivo);
        }
        const redePublica = diag.problemas.find(p => p.tipo === "rede_publica");
        if (redePublica) console.log("[rede] AVISO:", redePublica.descricao);
      }
    } catch (e) { console.log("[rede] diagnóstico falhou (não-crítico):", e.message); }

    console.log("[boot] licença OK, subindo servidor local…");
    await iniciarServidor();
    console.log("[boot] servidor no ar, abrindo janela.");
    // PDV Mercado em paralelo — nunca bloqueia nem derruba o boot do PDV
    iniciarMercado().catch(e => console.error("[mercado] falha ao iniciar:", e && e.message));
    iniciarAgenteImpressao().catch(e => console.error("[agente-impressao] falha ao iniciar:", e && e.message));
    abrirApp(resultado);   // esta chama fecharSplash() no ready-to-show
    iniciarSync(dirDados).catch(e => console.error("[sync] falha ao iniciar:", e.message));
    iniciarHeartbeat(dirDados);           // renova licença + config de sync em segundo plano
    configurarAutoUpdate(() => janela);   // verifica/baixa atualização em segundo plano
  } catch (err) {
    console.error("[boot] FALHA ao iniciar servidor local:\n", err && err.stack ? err.stack : err);
    fecharSplash();
    dialog.showErrorBox(APP_NAME, "Falha ao iniciar o sistema local:\n" + (err && err.message));
    app.quit();
  }
}

app.whenReady().then(main);
app.on("before-quit", () => { try { motorSync && motorSync.stop(); } catch {} });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) main(); });
