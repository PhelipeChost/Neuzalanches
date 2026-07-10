// ─── Impressão de cupom — XP-80 (ESC/POS, 80mm / 48 colunas) ─────────────────
// Gera o cupom em duas formas: texto simples (pré-visualização) e RAW ESC/POS
// (bytes prontos pra impressora térmica). Se a venda tiver NFC-e vinculada
// (nfce_url / nfce_chave), o cupom sai com a chave e o QR Code da nota.
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const LARGURA = 48; // XP-80: 48 colunas em fonte A

const ESC = "\x1b", GS = "\x1d";
const CMD = {
  init: ESC + "@",
  centro: ESC + "a" + "\x01",
  esquerda: ESC + "a" + "\x00",
  negritoOn: ESC + "E" + "\x01",
  negritoOff: ESC + "E" + "\x00",
  duploOn: GS + "!" + "\x11",
  duploOff: GS + "!" + "\x00",
  corte: GS + "V" + "\x42" + "\x00",
  pulo: "\n\n\n",
};

const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const linha = (c = "-") => c.repeat(LARGURA);
const lados = (esq, dir) => {
  const e = String(esq).slice(0, LARGURA - String(dir).length - 1);
  return e + " ".repeat(Math.max(1, LARGURA - e.length - String(dir).length)) + dir;
};

// QR Code ESC/POS (GS ( k) — usado pro link da NFC-e
function qrCode(data) {
  const bytes = Buffer.from(data, "utf8");
  const len = bytes.length + 3;
  const pL = String.fromCharCode(len & 0xff);
  const pH = String.fromCharCode((len >> 8) & 0xff);
  return (
    GS + "(k" + "\x04\x00" + "\x31\x41" + "\x32\x00" +            // modelo 2
    GS + "(k" + "\x03\x00" + "\x31\x43" + "\x06" +                // tamanho módulo 6
    GS + "(k" + "\x03\x00" + "\x31\x45" + "\x31" +                // correção M
    GS + "(k" + pL + pH + "\x31\x50\x30" + data +                 // dados
    GS + "(k" + "\x03\x00" + "\x31\x51\x30"                        // imprime
  );
}

const METODO_LABEL = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito", vale: "Vale" };

export function montarCupom(venda, { store_name }) {
  const dt = new Date((venda.created_at || "").replace(" ", "T") + "Z");
  dt.setUTCHours(dt.getUTCHours() - 3);
  const dataStr = dt.toISOString().slice(0, 16).replace("T", " ");

  const partesTexto = [];
  const p = (s = "") => partesTexto.push(s);

  p(store_name.toUpperCase());
  p(`CUPOM #${String(venda.number).padStart(6, "0")} — ${dataStr}`);
  p(`Operador: ${venda.user_name || ""}`);
  p(linha("="));
  for (const it of venda.items) {
    p(it.name);
    p(lados(`  ${it.qty} x ${fmtBRL(it.unit_price)}`, fmtBRL(it.total)));
  }
  p(linha());
  p(lados("Subtotal", fmtBRL(venda.subtotal)));
  if (venda.discount > 0) p(lados("Desconto", "-" + fmtBRL(venda.discount)));
  p(lados("TOTAL", fmtBRL(venda.total)));
  p(linha());
  for (const pg of venda.payments) p(lados(METODO_LABEL[pg.method] || pg.method, fmtBRL(pg.amount)));
  if (venda.change_given > 0) p(lados("Troco", fmtBRL(venda.change_given)));
  p(linha("="));
  if (venda.nfce_chave) {
    p("NFC-e — consulte pela chave:");
    p(venda.nfce_chave);
  } else {
    p("*** SEM VALOR FISCAL ***");
  }
  p("Obrigado pela preferência!");

  const texto = partesTexto.join("\n");

  // RAW ESC/POS
  let raw = CMD.init + CMD.centro + CMD.negritoOn + CMD.duploOn + store_name.toUpperCase() + "\n" + CMD.duploOff + CMD.negritoOff;
  raw += `CUPOM #${String(venda.number).padStart(6, "0")}\n${dataStr}  Op: ${venda.user_name || ""}\n`;
  raw += CMD.esquerda + linha("=") + "\n";
  for (const it of venda.items) {
    raw += it.name + "\n" + lados(`  ${it.qty} x ${fmtBRL(it.unit_price)}`, fmtBRL(it.total)) + "\n";
  }
  raw += linha() + "\n" + lados("Subtotal", fmtBRL(venda.subtotal)) + "\n";
  if (venda.discount > 0) raw += lados("Desconto", "-" + fmtBRL(venda.discount)) + "\n";
  raw += CMD.negritoOn + lados("TOTAL", fmtBRL(venda.total)) + CMD.negritoOff + "\n" + linha() + "\n";
  for (const pg of venda.payments) raw += lados(METODO_LABEL[pg.method] || pg.method, fmtBRL(pg.amount)) + "\n";
  if (venda.change_given > 0) raw += lados("Troco", fmtBRL(venda.change_given)) + "\n";
  raw += linha("=") + "\n" + CMD.centro;
  if (venda.nfce_url || venda.nfce_chave) {
    raw += "Documento fiscal NFC-e\n";
    if (venda.nfce_chave) raw += venda.nfce_chave.replace(/(.{4})/g, "$1 ").trim() + "\n";
    if (venda.nfce_url) raw += qrCode(venda.nfce_url) + "\n";
  } else {
    raw += CMD.negritoOn + "*** SEM VALOR FISCAL ***\n" + CMD.negritoOff;
  }
  raw += "Obrigado pela preferencia!\n" + CMD.pulo + CMD.corte;

  return { texto, raw: Buffer.from(raw, "binary") };
}

// Lista impressoras instaladas no sistema (Windows: PowerShell / unix: lpstat)
export function listarImpressoras() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"', { timeout: 8000 }, (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
      });
    } else {
      exec("lpstat -a 2>/dev/null | awk '{print $1}'", { timeout: 8000 }, (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
      });
    }
  });
}

// Impressão RAW local: grava arquivo temporário e manda pro spooler.
// Windows: compartilhamento/porta da impressora via "print"; unix: lp -o raw.
export function imprimirLocal(rawBuffer, impressora) {
  return new Promise((resolve) => {
    if (!impressora) return resolve({ ok: false, erro: "Nenhuma impressora configurada em Ajustes" });
    const tmp = path.join(os.tmpdir(), `cupom-${Date.now()}.bin`);
    fs.writeFileSync(tmp, rawBuffer);
    const cmd = process.platform === "win32"
      ? `print /D:"${impressora}" "${tmp}"`
      : `lp -d "${impressora}" -o raw "${tmp}"`;
    exec(cmd, { timeout: 15000 }, (err) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      resolve(err ? { ok: false, erro: String(err.message).slice(0, 200) } : { ok: true });
    });
  });
}
