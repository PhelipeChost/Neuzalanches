// ─── Modo de rede (multi-máquina) ────────────────────────────────────────────
// Cada instalação do Nexus PDV é, por padrão, um "servidor" — sobe o Express +
// SQLite local, exatamente como sempre funcionou (single-machine). Quando um
// estabelecimento tem mais de um computador (ex: caixa + cozinha, ou caixa da
// pizza + caixa da sorveteria), UMA máquina continua sendo o servidor (dona do
// banco de dados) e as demais entram em "modo cliente": não sobem servidor nem
// banco próprios — só abrem a janela apontando pro endereço da máquina servidor
// na rede local. Tudo o mais (agente de impressão, heartbeat de licença,
// auto-update) continua rodando localmente em cada máquina, pois são coisas
// físicas/individuais de cada terminal.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { networkInterfaces } from "os";
import { fileURLToPath } from "url";
import { app } from "electron";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Empacotado: o .ps1 precisa estar FORA do app.asar (extraResources), pois
// powershell.exe é um processo externo e não consegue ler de dentro do asar
// (só o fs do Node, patchado, faz isso). Rodando do código-fonte, usa o
// arquivo direto da pasta rede/.
function caminhoScriptFirewall() {
  return app.isPackaged
    ? join(process.resourcesPath, "rede", "criar-regra-firewall.ps1")
    : join(__dirname, "criar-regra-firewall.ps1");
}

export function caminhoConfigRede(dir) { return join(dir, "rede.json"); }

// A porta é sempre a constante fixa do app (PORT em main.js) — o host nunca
// deve carregar ":porta" junto. Protege contra colar "192.168.0.101:41730"
// (ex: copiado da tela "endereços desta máquina", que mostra IP:porta pro
// usuário ler) no campo que espera só o IP — sem isso, o Node tenta resolver
// a string inteira via DNS e falha com ENOTFOUND.
function normalizarHost(host) {
  return String(host || "").trim().replace(/:\d+$/, "");
}

// Padrão: "servidor" — preserva o comportamento atual (single-machine) sem
// exigir nenhuma configuração de quem já usa o PDV numa máquina só.
export function lerConfigRede(dir) {
  try {
    const p = caminhoConfigRede(dir);
    if (!existsSync(p)) return { modo: "servidor", servidorHost: "" };
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    return { modo: cfg.modo === "cliente" ? "cliente" : "servidor", servidorHost: normalizarHost(cfg.servidorHost) };
  } catch { return { modo: "servidor", servidorHost: "" }; }
}

export function salvarConfigRede(dir, cfg) {
  const p = caminhoConfigRede(dir);
  mkdirSync(dirname(p), { recursive: true });
  const dados = { modo: cfg.modo === "cliente" ? "cliente" : "servidor", servidorHost: normalizarHost(cfg.servidorHost) };
  writeFileSync(p, JSON.stringify(dados, null, 2), "utf8");
  return dados;
}

// IPs desta máquina na rede local (pra mostrar no "modo servidor": "digite
// este endereço nas outras máquinas"). Filtra loopback e interfaces internas.
// Só endereços de rede local de verdade (RFC1918) — exclui loopback E também
// adaptadores virtuais (VPN tipo Hamachi/Radmin/ZeroTier, VMware/VirtualBox,
// link-local 169.254.x.x de DHCP falho), que aparecem como "não-internal" mas
// nunca são alcançáveis por outra máquina física na mesma rede Wi-Fi/cabo.
function ehIpPrivadoLan(ip) {
  return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)
    || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ip);
}

export function meusIpsLan() {
  const ifaces = networkInterfaces();
  const ips = [];
  for (const nome of Object.keys(ifaces)) {
    for (const info of ifaces[nome] || []) {
      if (info.family === "IPv4" && !info.internal && ehIpPrivadoLan(info.address)) ips.push(info.address);
    }
  }
  return ips;
}

// Testa se um host:porta responde à API antes de salvar o modo cliente —
// evita que o usuário salve um IP errado e a máquina fique presa numa tela
// de "servidor não encontrado" sem saber por quê.
export function testarServidor(host, port, timeoutMs = 3000) {
  host = normalizarHost(host);
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/api/produtos", timeout: timeoutMs }, (res) => {
      res.destroy();
      resolve({ ok: true });
    });
    req.on("error", (e) => resolve({ ok: false, motivo: e.code === "ECONNREFUSED" ? "Conexão recusada — verifique o IP e se o Nexus PDV está aberto na máquina servidor." : e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, motivo: "Tempo esgotado — a máquina não respondeu. Verifique se estão na mesma rede." }); });
  });
}

// ─── Diagnóstico de rede (multi-máquina) ────────────────────────────────────
// Detecta se o perfil de rede do Windows está como "Público" (bloqueia
// conexões de entrada) e tenta criar regra de firewall por porta.
import { execSync } from "child_process";

export function diagnosticoRede(porta) {
  const problemas = [];

  // 1. Verificar perfil de rede (PowerShell)
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory | ConvertTo-Json"',
      { timeout: 8000, encoding: "utf8", windowsHide: true }
    );
    const perfis = JSON.parse(out);
    const lista = Array.isArray(perfis) ? perfis : [perfis];
    const publicas = lista.filter(p => p.NetworkCategory === 0 || p.NetworkCategory === "Public");
    const fisicas = publicas.filter(p => !/loopback|virtual|vmware|virtualbox|docker|vethernet|radmin|hamachi|zerotier/i.test(p.InterfaceAlias));
    if (fisicas.length > 0) {
      problemas.push({
        tipo: "rede_publica",
        descricao: `A rede "${fisicas[0].Name || fisicas[0].InterfaceAlias}" está como Pública. O Windows bloqueia conexões de entrada nesse modo.`,
        interface: fisicas[0].InterfaceAlias,
        solucao: "Mude o perfil da rede para Privado: Configurações > Rede e Internet > Ethernet/Wi-Fi > Tipo de perfil de rede > Rede privada.",
      });
    }
  } catch { /* PowerShell pode não funcionar — segue em frente */ }

  // 2. Verificar se a regra de firewall por porta existe
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName 'Nexus PDV Rede Local' -ErrorAction SilentlyContinue | Select-Object -First 1 Enabled | ConvertTo-Json"`,
      { timeout: 5000, encoding: "utf8", windowsHide: true }
    );
    if (!out || out.trim() === "" || out.includes("null")) {
      problemas.push({ tipo: "sem_regra_firewall", descricao: `Não há regra de firewall para a porta ${porta}.`, solucao: "auto" });
    }
  } catch {
    problemas.push({ tipo: "sem_regra_firewall", descricao: `Não foi possível verificar o firewall para a porta ${porta}.`, solucao: "auto" });
  }

  return { ok: problemas.length === 0, problemas, ips: meusIpsLan(), porta };
}

// Criar regra de firewall exige admin — o script .ps1 se auto-eleva via UAC
// (Start-Process -Verb RunAs), então o usuário só precisa clicar "Sim" uma vez
// na janela padrão do Windows. Não requer rodar o app inteiro como admin.
export function criarRegraFirewall(porta) {
  const scriptPath = caminhoScriptFirewall();
  try {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -port ${porta}`,
      { timeout: 30000, encoding: "utf8", windowsHide: true }
    );
    return { ok: true };
  } catch (e) {
    if (e.status === 1223) {
      return { ok: false, motivo: 'Você cancelou a permissão do Windows. Clique em "Criar regra" novamente e escolha "Sim" na janela que o Windows abrir.' };
    }
    return { ok: false, motivo: "Não foi possível criar a regra automaticamente. Peça a um administrador do computador, ou mude o perfil de rede para Privado (geralmente resolve sem precisar da regra)." };
  }
}
