// ─── Ativação online + heartbeat (servidor Nexus) ────────────────────────────
// Conversa com o painel Nexus (reinonexusideal) para:
//   • /api/licenca/ativar    → amarra a máquina e devolve o token (.lic) + config.sync
//   • /api/licenca/heartbeat → renova o token, atualiza a config e reporta a versão
// A config.sync recebida é gravada em userData/sync.json, ligando a "cozinha
// simultânea" automaticamente (o iniciarSync do main.js consome esse arquivo).
//
// A CHAVE (license_key NXS-…) é guardada localmente para o heartbeat periódico.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const NEXUS_URL = (process.env.NEXUS_URL || "https://reinonexusideal.com.br").replace(/\/+$/, "");

// ── Persistência da chave ──────────────────────────────────────────────────
export function caminhoChave(dir) { return join(dir, "licenca-chave.txt"); }

export function lerChave(dir) {
  try {
    const p = caminhoChave(dir);
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf8").trim() || null;
  } catch { return null; }
}

export function salvarChave(dir, chave) {
  const p = caminhoChave(dir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, String(chave).trim(), "utf8");
  return p;
}

// ── Gravação do sync.json a partir do config.sync ──────────────────────────
// Retorna true se a sincronização ficou ativa (tem vpsUrl + email).
export function aplicarConfigSync(dir, config) {
  const s = config && config.sync;
  if (!s) return false;
  const cfg = {
    ativo: !!(s.vpsUrl && (s.email || s.syncToken)),
    vpsUrl: s.vpsUrl || "",
    email: s.email || "",
    senha: s.senha || "",
    syncToken: s.syncToken || "",
    intervaloMs: s.intervaloMs || 5000,
  };
  try {
    const p = join(dir, "sync.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
    return cfg.ativo;
  } catch { return false; }
}

// ── Chamadas HTTP ───────────────────────────────────────────────────────────
async function postJson(path, body, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(NEXUS_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...j };
  } finally { clearTimeout(t); }
}

export function ativarOnline({ chave, fingerprint }) {
  return postJson("/api/licenca/ativar", { chave, fingerprint });
}

export function heartbeatOnline({ chave, fingerprint, versao_app }) {
  return postJson("/api/licenca/heartbeat", { chave, fingerprint, versao_app });
}

export function gerarCobrancaPix(chave) {
  return postJson("/api/assinatura/gerar-cobranca", { chave }, 20000);
}

export async function statusPagamento(chave) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(NEXUS_URL + `/api/assinatura/status/${encodeURIComponent(chave)}`, {
      signal: ctrl.signal,
    });
    return await r.json();
  } finally { clearTimeout(t); }
}

export { NEXUS_URL };
