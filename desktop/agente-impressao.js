// ─── Agente de Impressão Térmica — Electron-embedded ────────────────────────
// Servidor HTTP em http://localhost:17777 que a Cozinha já sabe usar.
// Descobre a impressora XP-80 (ou outra térmica) pelo spooler do Windows e
// envia bytes ESC/POS raw via winspool.drv (P/Invoke pelo PowerShell).
// Zero dependência nativa, zero Zadig, zero WinUSB.
import http from "http";
import { execFile, exec } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const PORTA = 17777;

// Nomes/substrings que identificam impressoras térmicas (case-insensitive)
const TERMOS_TERMICA = [
  "xp-80", "xp80", "xprinter", "pos-80", "pos80", "pos58",
  "thermal", "termica", "térmica", "receipt",
  "goojprt", "epson tm", "elgin i", "bematech",
  "star tsp", "star sp", "citizen", "sewoo",
  "generic", "generic / text only",
];

let impressoraAtual = null;   // nome exato do Windows
let ultimaChecagem = 0;
const CACHE_MS = 10_000;

// ─── Descoberta de impressoras ──────────────────────────────────────────────
function listarImpressoras() {
  return new Promise((resolve) => {
    const cmd = `powershell.exe -NoProfile -Command "Get-Printer | Select-Object -Property Name,PrinterStatus,PortName | ConvertTo-Json -Compress"`;
    exec(cmd, { timeout: 8000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        let parsed = JSON.parse(stdout.trim());
        if (!Array.isArray(parsed)) parsed = [parsed];
        resolve(parsed);
      } catch { resolve([]); }
    });
  });
}

async function descobrirTermica() {
  if (impressoraAtual && Date.now() - ultimaChecagem < CACHE_MS) return impressoraAtual;

  const impressoras = await listarImpressoras();
  // Prioridade: match exato nos termos → primeira impressora "Normal" que não seja fax/pdf/onenote
  const excluir = ["fax", "onenote", "pdf", "xps", "snagit", "microsoft print"];

  const candidatos = [];
  for (const imp of impressoras) {
    const nome = (imp.Name || "").toLowerCase();
    if (excluir.some(e => nome.includes(e))) continue;
    for (const termo of TERMOS_TERMICA) {
      if (nome.includes(termo)) { candidatos.push(imp.Name); break; }
    }
  }
  // Prefere o nome sem "(copy)" — o copy é um driver duplicado
  const melhor = candidatos.find(n => !n.toLowerCase().includes("(copy")) || candidatos[0] || null;

  impressoraAtual = melhor;
  ultimaChecagem = Date.now();
  return impressoraAtual;
}

// ─── Impressão RAW via PowerShell + winspool.drv ────────────────────────────
// Usa P/Invoke pra abrir a impressora em modo RAW e jogar os bytes direto,
// exatamente como faria um driver de POS. Funciona com qualquer impressora
// instalada no Windows, sem trocar driver.
const TMP_DIR = join(tmpdir(), "nexus-pdv-print");

function buildPsScript(printerName, filePath) {
  const pEsc = printerName.replace(/'/g, "''");
  const fEsc = filePath.replace(/'/g, "''");
  return `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential)] public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
  }
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string p, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr h, int l, ref DOCINFOA di);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, IntPtr buf, int cb, out int written);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  public static bool Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "ESC/POS", pDatatype = "RAW" };
    StartDocPrinter(h, 1, ref di);
    StartPagePrinter(h);
    IntPtr buf = Marshal.AllocHGlobal(data.Length);
    Marshal.Copy(data, 0, buf, data.Length);
    int w;
    bool ok = WritePrinter(h, buf, data.Length, out w);
    Marshal.FreeHGlobal(buf);
    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return ok;
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes('${fEsc}')
$ok = [RawPrint]::Send('${pEsc}', $bytes)
if (-not $ok) { Write-Error "WritePrinter failed"; exit 1 }
Write-Output "OK"
`;
}

function imprimirRaw(nomeImpressora, bytesBuffer) {
  return new Promise((resolve, reject) => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
    const tmpFile = join(TMP_DIR, `cupom_${Date.now()}.bin`);

    try { writeFileSync(tmpFile, bytesBuffer); } catch (e) {
      reject(new Error("Falha ao gravar arquivo temporário: " + e.message));
      return;
    }

    const script = buildPsScript(nomeImpressora, tmpFile);
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script];

    execFile("powershell.exe", args, { timeout: 15000 }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) {
        const msg = (stderr || "").trim() || err.message || "Erro desconhecido";
        reject(new Error(msg));
      } else {
        resolve(true);
      }
    });
  });
}

// ─── Servidor HTTP ──────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, obj) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

export async function iniciarAgenteImpressao() {
  // Descobre a impressora no boot (não bloqueia)
  descobrirTermica().catch(() => {});

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

    // GET /status — retorna nome da impressora se online
    if (req.method === "GET" && req.url === "/status") {
      const imp = await descobrirTermica();
      if (imp) {
        json(res, 200, { ok: true, impressora: imp });
      } else {
        json(res, 200, { ok: false, erro: "Nenhuma impressora térmica encontrada" });
      }
      return;
    }

    // POST /imprimir — recebe { data: "base64..." } e imprime
    if (req.method === "POST" && req.url === "/imprimir") {
      const b = await body(req);
      if (!b || !b.data) { json(res, 400, { ok: false, erro: "Envie { data: 'base64...' }" }); return; }

      const imp = await descobrirTermica();
      if (!imp) { json(res, 503, { ok: false, erro: "Nenhuma impressora térmica encontrada" }); return; }

      try {
        const buf = Buffer.from(b.data, "base64");
        await imprimirRaw(imp, buf);
        json(res, 200, { ok: true, impressora: imp, bytes: buf.length });
      } catch (e) {
        // Limpa cache para re-descobrir na próxima
        impressoraAtual = null;
        ultimaChecagem = 0;
        json(res, 500, { ok: false, erro: e.message, impressora: imp });
      }
      return;
    }

    // GET /impressoras — lista todas (debug)
    if (req.method === "GET" && req.url === "/impressoras") {
      const lista = await listarImpressoras();
      json(res, 200, { ok: true, impressoras: lista });
      return;
    }

    json(res, 404, { ok: false, erro: "Rota não encontrada" });
  });

  server.listen(PORTA, "127.0.0.1", () => {
    console.log(`[agente-impressao] no ar em http://127.0.0.1:${PORTA}`);
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`[agente-impressao] porta ${PORTA} já em uso — outro agente rodando?`);
    } else {
      console.error("[agente-impressao] erro:", e.message);
    }
  });

  return server;
}
