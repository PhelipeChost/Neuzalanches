// ─── Fingerprint estável da máquina ──────────────────────────────────────────
// Windows: usa o MachineGuid do registro (estável e único por instalação do SO).
// Fallback multiplataforma: hash de hostname + CPUs + MAC da 1ª placa física.
// É o valor que o admin da Nexus embute no token (claim "fingerprint") para
// amarrar a licença a UMA máquina. O app calcula e compara.
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import os from "os";

let _cache = null;

function machineGuidWindows() {
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function macEstavel() {
  const ifaces = os.networkInterfaces();
  for (const nome of Object.keys(ifaces)) {
    for (const ni of ifaces[nome] || []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") return ni.mac;
    }
  }
  return "";
}

export function fingerprintMaquina() {
  if (_cache) return _cache;
  let base;
  if (process.platform === "win32") {
    base = machineGuidWindows();
  }
  if (!base) {
    // Fallback determinístico
    base = [os.hostname(), (os.cpus()[0] || {}).model || "", os.arch(), macEstavel()].join("|");
  }
  // Hash para não expor dados crus do hardware e ter tamanho fixo
  _cache = createHash("sha256").update("nexus-fp:" + base).digest("hex").slice(0, 32);
  return _cache;
}
