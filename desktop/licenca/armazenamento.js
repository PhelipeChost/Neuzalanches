// ─── Armazenamento local da licença ──────────────────────────────────────────
// Guarda a string .lic num arquivo (ex.: %APPDATA%\NexusPDV\licenca.lic).
// Revalidada a cada abertura — é o que faz o app funcionar offline e travar
// sozinho quando vencer.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";

export function caminhoLicenca(dirDados) {
  return join(dirDados, "licenca.lic");
}

export function lerLicenca(dirDados) {
  try {
    const p = caminhoLicenca(dirDados);
    if (!existsSync(p)) return null;
    const txt = readFileSync(p, "utf8").trim();
    return txt || null;
  } catch {
    return null;
  }
}

export function salvarLicenca(dirDados, token) {
  const p = caminhoLicenca(dirDados);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, String(token).trim(), "utf8");
  return p;
}

export function removerLicenca(dirDados) {
  try { rmSync(caminhoLicenca(dirDados), { force: true }); } catch { /* ok */ }
}
