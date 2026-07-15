// ─────────────────────────────────────────────────────────────────────────────
//  Impressão de cupom da Cozinha via Web USB + ESC/POS
//  Conversa direto com a impressora térmica USB (80mm), sem caixa de diálogo
//  do navegador e sem depender da impressora padrão do Windows.
//
//  Pré-requisito no Windows: a impressora precisa estar com o driver WinUSB
//  (instalado via Zadig). Veja cozinha-impressora/LEIA-ME-impressao.md.
// ─────────────────────────────────────────────────────────────────────────────

const PRINTER_CLASS = 0x07; // USB Printer Class

// Filtros para o navegador mostrar na lista de "Conectar impressora".
// Cobrimos a classe USB de impressoras + alguns vendor IDs comuns em
// impressoras térmicas chinesas (XP-80, Goojprt, Elgin i9, etc).
const FILTROS_USB = [
  { classCode: PRINTER_CLASS },
  { vendorId: 0x0416 }, // Winbond / muitos clones
  { vendorId: 0x0483 }, // STMicro (algumas XP-80)
  { vendorId: 0x0fe6 }, // ICS Advent / Goojprt
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0519 }, // Star Micronics
  { vendorId: 0x1504 }, // Bixolon
  { vendorId: 0x154f }, // SNBC
  { vendorId: 0x28e9 }, // Generic
];

export function isWebUsbSuportado() {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

async function abrirDevice(device) {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  // Procura interface da classe Printer; se não houver, pega a primeira.
  const cfg = device.configuration;
  let iface = cfg.interfaces.find(i => i.alternates[0].interfaceClass === PRINTER_CLASS);
  if (!iface) iface = cfg.interfaces[0];
  if (!iface) throw new Error("Impressora sem interfaces USB disponíveis.");

  try {
    await device.claimInterface(iface.interfaceNumber);
  } catch (e) {
    throw new Error(
      "Não foi possível reservar a impressora. No Windows, instale o driver " +
      "WinUSB com o Zadig — veja cozinha-impressora/LEIA-ME-impressao.md."
    );
  }

  const ep = iface.alternates[0].endpoints.find(e => e.direction === "out" && e.type === "bulk")
          || iface.alternates[0].endpoints.find(e => e.direction === "out");
  if (!ep) throw new Error("Impressora não expõe endpoint USB de saída.");

  device.__interfaceNumber = iface.interfaceNumber;
  device.__endpointNumber = ep.endpointNumber;
  return device;
}

export async function conectarImpressora() {
  if (!isWebUsbSuportado()) throw new Error("Este navegador não tem Web USB. Use Chrome/Edge.");
  const device = await navigator.usb.requestDevice({ filters: FILTROS_USB });
  await abrirDevice(device);
  return device;
}

export async function getImpressoraAutorizada() {
  if (!isWebUsbSuportado()) return null;
  const devices = await navigator.usb.getDevices();
  if (!devices.length) return null;
  const device = devices[0];
  try {
    await abrirDevice(device);
    return device;
  } catch {
    return null;
  }
}

export async function desconectarImpressora(device) {
  if (!device) return;
  try {
    if (device.__interfaceNumber != null) await device.releaseInterface(device.__interfaceNumber);
    if (device.opened) await device.close();
  } catch {}
}

// ─── CP850 (Latin-1 / DOS Multilingual) — cobre os acentos do PT-BR ─────────
const CP850 = {
  "Ç":0x80,"ü":0x81,"é":0x82,"â":0x83,"ä":0x84,"à":0x85,"å":0x86,"ç":0x87,
  "ê":0x88,"ë":0x89,"è":0x8A,"ï":0x8B,"î":0x8C,"ì":0x8D,"Ä":0x8E,"Å":0x8F,
  "É":0x90,"æ":0x91,"Æ":0x92,"ô":0x93,"ö":0x94,"ò":0x95,"û":0x96,"ù":0x97,
  "ÿ":0x98,"Ö":0x99,"Ü":0x9A,"ø":0x9B,"£":0x9C,"Ø":0x9D,"×":0x9E,"ƒ":0x9F,
  "á":0xA0,"í":0xA1,"ó":0xA2,"ú":0xA3,"ñ":0xA4,"Ñ":0xA5,"ª":0xA6,"º":0xA7,
  "¿":0xA8,"®":0xA9,"¬":0xAA,"½":0xAB,"¼":0xAC,"¡":0xAD,"«":0xAE,"»":0xAF,
  "Á":0xB5,"Â":0xB6,"À":0xB7,"©":0xB8,
  "ã":0xC6,"Ã":0xC7,
  "ð":0xD0,"Ð":0xD1,"Ê":0xD2,"Ë":0xD3,"È":0xD4,"Í":0xD6,"Î":0xD7,"Ï":0xD8,
  "Ó":0xE0,"ß":0xE1,"Ô":0xE2,"Ò":0xE3,"õ":0xE4,"Õ":0xE5,"µ":0xE6,
  "Ú":0xE9,"Û":0xEA,"Ù":0xEB,"ý":0xEC,"Ý":0xED,"´":0xEF,"°":0xF8,
};

function encodeCP850(s) {
  const out = [];
  for (const ch of String(s ?? "")) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (CP850[ch] != null) { out.push(CP850[ch]); continue; }
    // Fallback: remove o acento e tenta de novo.
    const norm = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (norm && norm !== ch) {
      for (const c2 of norm) {
        const code2 = c2.charCodeAt(0);
        if (code2 < 0x80) out.push(code2);
        else if (CP850[c2] != null) out.push(CP850[c2]);
        else out.push(0x3F); // '?'
      }
    } else {
      out.push(0x3F);
    }
  }
  return new Uint8Array(out);
}

// ─── Builder de comandos ESC/POS ─────────────────────────────────────────────
class ESCPOS {
  constructor() { this.chunks = []; }
  _b(arr) { this.chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr)); return this; }
  init()            { return this._b([0x1B, 0x40]); }                            // ESC @
  codepageCP850()   { return this._b([0x1B, 0x74, 0x02]); }                      // ESC t 2
  align(a)          { return this._b([0x1B, 0x61, { left:0, center:1, right:2 }[a] ?? 0]); }
  bold(on)          { return this._b([0x1B, 0x45, on ? 1 : 0]); }
  size(w, h) {
    const W = Math.max(1, Math.min(8, w | 0)) - 1;
    const H = Math.max(1, Math.min(8, h | 0)) - 1;
    return this._b([0x1D, 0x21, (W << 4) | H]);
  }
  text(s)           { return this._b(encodeCP850(s)); }
  line(s = "")      { return this.text(s)._b([0x0A]); }
  feed(n = 1)       { return this._b(new Uint8Array(n).fill(0x0A)); }
  cut()             { return this._b([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00]); } // partial cut + feed
  bytes() {
    const len = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

// ─── Geração do cupom da cozinha em ESC/POS ──────────────────────────────────
const LARGURA = 48; // colunas a 80mm fonte A
const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHora = (iso) => {
  if (!iso) return "";
  const s = iso instanceof Date ? iso.toISOString() : String(iso);
  const d = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s.replace(" ", "T") + "Z");
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const TIPO_CUPOM = { delivery: "DELIVERY", retirada: "RETIRADA", casa: "CONSUMIR NO LOCAL" };
const MARCA_PADRAO = "MEU ESTABELECIMENTO";

function padBetween(left, right, width = LARGURA) {
  const sp = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(sp) + right;
}

// Imprime o nome do estabelecimento no topo, com tamanho adaptado ao comprimento.
function tituloMarca(b, marca) {
  const nome = (marca || MARCA_PADRAO).toUpperCase();
  b.align("center").bold(true);
  if (nome.length <= 22) b.size(2, 2); else b.size(1, 2);
  b.line(nome);
  b.size(1, 1);
}

export function gerarCupomCozinhaBytes(p, marca = MARCA_PADRAO) {
  const tipo = p.tipo_entrega === "retirada" ? "retirada" : p.tipo_entrega === "casa" ? "casa" : "delivery";
  const idCurto = String(p.id || "").slice(0, 6).toUpperCase();
  const hora = fmtHora(p.created_at);
  const origem = p.tipo === "online" ? "ONLINE" : "PRESENCIAL";

  const b = new ESCPOS().init().codepageCP850();

  // Cabeçalho
  tituloMarca(b, marca);
  b.align("center").bold(true).size(1, 1).line(">> COZINHA <<").bold(false);
  b.line("-".repeat(LARGURA));

  // ID + hora
  b.align("left").bold(true).line(padBetween(`#${idCurto}`, hora));

  // Tag tipo
  b.align("center").bold(true).size(1, 2).line(`[ ${TIPO_CUPOM[tipo]} ]`);
  b.size(1, 1).align("left").bold(false);

  b.line(`Cliente: ${p.cliente_nome || "-"}`);
  b.line(`Origem: ${origem}`);
  b.line("-".repeat(LARGURA));

  // Itens
  for (const it of p.itens || []) {
    b.bold(true).size(1, 2).line(`${it.quantidade}x ${it.produto_nome}`);
    b.bold(false).size(1, 1);
    for (const a of it.adicionais || []) {
      const q = (a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "";
      b.line(`  + ${q}${a.nome}`);
    }
  }

  // Observação destacada
  if (p.obs) {
    b.feed(1);
    b.align("center").bold(true).size(1, 2).line(`** OBS: ${p.obs} **`);
    b.size(1, 1).bold(false).align("left");
  }

  // Endereço (delivery)
  if (tipo === "delivery" && p.endereco_rua) {
    b.line("-".repeat(LARGURA));
    b.bold(true).line("ENTREGA:").bold(false);
    b.line(`${p.endereco_rua}${p.endereco_numero ? ", " + p.endereco_numero : ""}`);
    if (p.endereco_bairro) b.line(p.endereco_bairro);
    if (p.endereco_referencia) b.line(`Ref: ${p.endereco_referencia}`);
  }

  b.line("-".repeat(LARGURA));

  // Pagamento
  if (p.metodo_pagamento) {
    const labels = { pix: "PIX", credito: "CARTAO CREDITO", debito: "CARTAO DEBITO", dinheiro: "DINHEIRO" };
    const troco = Number(p.troco_para), total = Number(p.total);
    const trocoTxt = (p.metodo_pagamento === "dinheiro" && troco > total) ? ` (troco p/ ${fmtBRL(troco)})` : "";
    b.line(`Pgto: ${labels[p.metodo_pagamento] || p.metodo_pagamento}${trocoTxt}`);
  }

  // Total
  b.bold(true).line(padBetween("TOTAL", fmtBRL(p.total))).bold(false);
  b.line("-".repeat(LARGURA));

  b.align("center").line(new Date().toLocaleString("pt-BR"));
  b.feed(2).cut();

  return b.bytes();
}

// ─── Envia bytes para a impressora em pequenos blocos ────────────────────────
export async function imprimirCupomUSB(device, pedido) {
  if (!device) throw new Error("Impressora USB não conectada.");
  const bytes = gerarCupomCozinhaBytes(pedido);
  const CHUNK = 256;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await device.transferOut(device.__endpointNumber, bytes.slice(i, i + CHUNK));
  }
}

// ─── AGENTE LOCAL (recomendado) ──────────────────────────────────────────────
//  Imprime via o mini-agente Node rodando em http://localhost:9100. Funciona
//  mesmo com o site em HTTPS de produção (loopback é exceção de conteúdo misto)
//  e não exige trocar o driver da impressora. Veja agente-impressao/.
const AGENTE_URL = "http://localhost:17777";

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Pinga o agente. Retorna o nome da impressora se estiver no ar, senão null.
export async function agenteStatus(timeoutMs = 1200) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${AGENTE_URL}/status`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? (j.impressora || "impressora") : null;
  } catch {
    return null;
  }
}

// Envia bytes ESC/POS já prontos pelo agente local. Lança erro se falhar.
export async function imprimirBytesViaAgente(bytes) {
  const r = await fetch(`${AGENTE_URL}/imprimir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: bytesToBase64(bytes) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.erro || "Falha no agente de impressão");
  return j;
}

// Imprime um pedido pelo agente local. Lança erro se o agente falhar.
export async function imprimirViaAgente(pedido, marca) {
  return imprimirBytesViaAgente(gerarCupomCozinhaBytes(pedido, marca));
}

// ─── QR CODE DA MESA em ESC/POS (raster GS v 0) ──────────────────────────────
//  Recebe a matriz de módulos do QR (qrcode lib: QRCode.create(url).modules,
//  com .size e .data[i*size+j] = 1 para preto) e devolve os bytes do cupom.
function rasterQR(b, matrix, scale, quiet = 4) {
  const size = matrix.size;
  const dark = (r, c) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return 0;
    if (matrix.data) return matrix.data[r * size + c] ? 1 : 0;
    return matrix.get ? (matrix.get(c, r) ? 1 : 0) : 0;
  };
  const mods = size + quiet * 2;
  const widthDots = mods * scale;
  const widthBytes = Math.ceil(widthDots / 8);
  const heightDots = widthDots;
  const out = new Uint8Array(widthBytes * heightDots);
  for (let y = 0; y < heightDots; y++) {
    const mr = Math.floor(y / scale) - quiet;
    for (let x = 0; x < widthDots; x++) {
      const mc = Math.floor(x / scale) - quiet;
      if (dark(mr, mc)) out[y * widthBytes + (x >> 3)] |= (0x80 >> (x & 7));
    }
  }
  b._b([0x1D, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, heightDots & 0xff, (heightDots >> 8) & 0xff]);
  b._b(out);
  return b;
}

export function gerarQRMesaBytes(mesa, qrMatrix, marca = MARCA_PADRAO) {
  // Escala adaptativa: QR de ~420 dots de largura (bem escaneável em 80mm).
  const scale = Math.max(4, Math.min(12, Math.floor(420 / (qrMatrix.size + 8))));

  const b = new ESCPOS().init().codepageCP850();
  tituloMarca(b, marca);
  b.align("center").bold(false).line("CARDÁPIO DIGITAL");
  b.line("-".repeat(LARGURA));
  b.bold(true).size(1, 1).line("MESA");
  b.size(4, 4).line(String(mesa.numero));
  b.size(1, 1).bold(false);
  b.feed(1);
  rasterQR(b, qrMatrix, scale);
  b.feed(1);
  b.bold(true).size(1, 1).line("FAÇA SEU PEDIDO");
  b.bold(false).line("Aponte a câmera do");
  b.line("celular para o QR Code");
  b.line("-".repeat(LARGURA));
  b.bold(true).line("PAGAMENTO NO CAIXA").bold(false);
  b.feed(2).cut();
  return b.bytes();
}

// ─── CUPOM DE VENDA — NFC-e autorizada ou não-fiscal ────────────────────────
const LABELS_PGTO = { pix: "PIX", credito: "CARTAO CREDITO", debito: "CARTAO DEBITO", dinheiro: "DINHEIRO", vale: "VALE", multiplo: "MULTIPLO" };

// Agrupa a chave de acesso de 44 dígitos em blocos de 4 (formato padrão do DANFE-NFCe)
function grupos4(s) {
  return String(s || "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

function itensCupom(b, itens) {
  for (const it of itens || []) {
    b.align("left").bold(true).line(`${it.quantidade}x ${it.produto_nome}`).bold(false);
    for (const a of it.adicionais || []) {
      const q = (a.quantidade || 1) > 1 ? `${a.quantidade}x ` : "";
      b.line(`  + ${q}${a.nome}`);
    }
    const total = (it.preco_unitario || 0) * (it.quantidade || 1) + (it.adicionais || []).reduce((s, a) => s + (a.preco || 0) * (a.quantidade || 1) * (it.quantidade || 1), 0);
    b.line(padBetween(`  ${fmtBRL(it.preco_unitario)} un`, fmtBRL(total)));
  }
}

// DANFE-NFCe simplificado (versão térmica): itens, total, chave de acesso
// agrupada, protocolo e QR code de consulta. É uma representação reduzida —
// não substitui o XML autorizado, que é o documento fiscal de fato; serve
// só como comprovante impresso pro consumidor levar.
export function gerarCupomNFCeBytes(pedido, itens, nota, marca = MARCA_PADRAO, qrMatrix = null) {
  const b = new ESCPOS().init().codepageCP850();
  tituloMarca(b, marca);

  if (nota.ambiente === "homologacao") {
    b.align("center").bold(true).line("AMBIENTE DE HOMOLOGACAO").line("SEM VALOR FISCAL").bold(false);
  }
  b.align("center").line("DANFE NFC-e").line("Documento Auxiliar da NF-e").line("de Consumidor Eletronica");
  b.line("-".repeat(LARGURA));

  itensCupom(b, itens);
  b.line("-".repeat(LARGURA));
  b.bold(true).line(padBetween("TOTAL", fmtBRL(pedido.total))).bold(false);
  if (pedido.metodo_pagamento) b.line(`Pgto: ${LABELS_PGTO[pedido.metodo_pagamento] || pedido.metodo_pagamento}`);
  b.line("-".repeat(LARGURA));

  b.align("center");
  b.line(`NFC-e no ${nota.numero || "?"}  serie ${nota.serie || "1"}`);
  if (nota.chave) { b.feed(1); b.line("Chave de acesso"); b.line(grupos4(nota.chave)); }
  if (nota.protocolo) b.line(`Protocolo: ${nota.protocolo}`);

  if (qrMatrix) {
    const scale = Math.max(3, Math.min(8, Math.floor(280 / (qrMatrix.size + 8))));
    b.feed(1);
    rasterQR(b, qrMatrix, scale);
  }
  b.feed(1);
  b.line("Consulte pela Chave de Acesso em");
  b.line("nfce.fazenda.sp.gov.br");
  b.line("-".repeat(LARGURA));
  b.line(new Date().toLocaleString("pt-BR"));
  b.feed(2).cut();
  return b.bytes();
}

// Recibo simples sem valor fiscal — impresso quando a venda não solicitou
// (ou não teve, por qualquer motivo) NFC-e emitida.
export function gerarCupomNaoFiscalBytes(pedido, itens, marca = MARCA_PADRAO) {
  const b = new ESCPOS().init().codepageCP850();
  tituloMarca(b, marca);
  b.align("center").bold(true).line("CUPOM NAO FISCAL").line("SEM VALOR FISCAL").bold(false);
  b.line("-".repeat(LARGURA));

  itensCupom(b, itens);
  b.line("-".repeat(LARGURA));
  b.bold(true).line(padBetween("TOTAL", fmtBRL(pedido.total))).bold(false);
  if (pedido.metodo_pagamento) b.line(`Pgto: ${LABELS_PGTO[pedido.metodo_pagamento] || pedido.metodo_pagamento}`);
  b.line("-".repeat(LARGURA));
  b.align("center").line(new Date().toLocaleString("pt-BR"));
  b.feed(2).cut();
  return b.bytes();
}

// Decide qual cupom imprimir (fiscal autorizado ou não-fiscal) e envia pro
// agente local. `nota` vem de api.fiscal.notaPorPedido(pedido.id) — null ou
// status != 'autorizada' cai no cupom não fiscal.
export async function imprimirNotaPedido(pedido, itens, nota, marca, qrMatrix = null) {
  const bytes = (nota && nota.status === "autorizada")
    ? gerarCupomNFCeBytes(pedido, itens, nota, marca, qrMatrix)
    : gerarCupomNaoFiscalBytes(pedido, itens, marca);
  return imprimirBytesViaAgente(bytes);
}
