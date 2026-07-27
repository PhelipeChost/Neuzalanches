// ─── Túnel de suporte remoto (cliente WebSocket + proxy reverso) ─────────────
// O PDV do cliente normalmente não tem IP público, então o admin da Nexus não
// consegue falar direto com o servidor local (127.0.0.1:41730). Solução: ESTA
// ponta abre um WS de saída persistente com wss://…/api/suporte/tunel usando
// a mesma licença RS256 do cliente. Quando o admin clica "Acessar PDV" no
// painel, a requisição HTTP dele é envelopada dentro do WS e chega aqui;
// executamos localmente e devolvemos a resposta pelo mesmo canal.
//
// Contrato (definido pelo broker do outro lado):
//   entrada  { type:'req', id, method, path, headers, has_body:bool }
//            + N frames binários [1B idLen][idAscii][payload]  (se has_body)
//            + { type:'req_end', id }
//   saída    { type:'res_meta', id, status, headers, body_b64? }
//            + (se body grande) N frames binários [1B idLen][idAscii][payload]
//            + { type:'res_chunk_end', id }
//
// Handshake pode falhar com:
//   401 = token ausente/inválido
//   403 = licença bloqueada, cliente inativo, ou tipo:'suporte' no lugar da licença
//   404 = client_id não existe no painel Nexus
//   400 = claims incompletos (falta client_id/fingerprint)
// Em qualquer um deles, parar de reconectar — não adianta bater na parede,
// e se o Suporte revogou o acesso, respeita.
import { WebSocket } from "ws";
import http from "http";
import { Buffer } from "buffer";

const TUNEL_URL_DEFAULT = "wss://reinonexusideal.com.br/api/suporte/tunel";
const BACKOFF_MIN_MS = 2000;
const BACKOFF_MAX_MS = 60000;
const BODY_INLINE_MAX = 128 * 1024;  // até 128 KB volta inline em base64; acima disso, chunks binários
const REQ_TIMEOUT_MS = 60000;
const SESSAO_ATIVA_JANELA_MS = 30000;
const HANDSHAKE_FATAL = new Set([400, 401, 403, 404]);

export function criarTunelSuporte({ tokenLicenca, porta = 41730, url = TUNEL_URL_DEFAULT, onEstado = () => {}, log = () => {} }) {
  if (!tokenLicenca) throw new Error("[suporte-tunel] licença ausente");
  let ws = null, parado = false, tentativa = 0, backoff = BACKOFF_MIN_MS;
  let reconectTimer = null;
  const requisicoesAbertas = new Map(); // id → { meta, buffer: Buffer[] }
  let ultimaAtividade = 0;
  let estadoAtual = "desconectado";

  function emitir(estado) {
    estadoAtual = estado;
    try { onEstado({ estado, sessaoAtiva: Date.now() - ultimaAtividade < SESSAO_ATIVA_JANELA_MS }); } catch {}
  }

  function agendarReconexao() {
    if (parado) return;
    clearTimeout(reconectTimer);
    const delay = Math.min(BACKOFF_MAX_MS, Math.round(backoff * (1 + Math.random() * 0.3)));
    log(`aguardando ${Math.round(delay / 1000)}s antes de tentar de novo`);
    reconectTimer = setTimeout(conectar, delay);
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
  }

  function conectar() {
    if (parado) return;
    tentativa++;
    log(`conectando (tentativa ${tentativa}) → ${url}`);
    emitir("conectando");
    try {
      ws = new WebSocket(url + "?token=" + encodeURIComponent(tokenLicenca), {
        handshakeTimeout: 15000,
      });
    } catch (e) {
      log("falha ao criar WS: " + e.message);
      return agendarReconexao();
    }

    ws.on("open", () => {
      log("túnel aberto");
      tentativa = 0;
      backoff = BACKOFF_MIN_MS;
      emitir("conectado");
    });

    ws.on("unexpected-response", (_req, res) => {
      if (HANDSHAKE_FATAL.has(res.statusCode)) {
        log(`túnel rejeitado (${res.statusCode}) — parando reconexão. Só volta após reiniciar o app.`);
        parado = true;
        emitir("bloqueado");
        try { ws.terminate(); } catch {}
        return;
      }
      log(`handshake HTTP ${res.statusCode} — vai tentar de novo`);
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) return receberFrameBinario(data);
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === "req") return receberReqMeta(msg);
      if (msg.type === "req_end") return dispararRequisicao(msg.id);
    });

    ws.on("close", (code, motivo) => {
      log(`túnel fechou (${code}) ${motivo || ""}`);
      requisicoesAbertas.clear();
      if (!parado) {
        emitir("desconectado");
        agendarReconexao();
      }
    });

    ws.on("error", (err) => {
      log("erro no túnel: " + (err && err.message));
      // 'close' vem em seguida — reconexão é agendada lá
    });

    // Ping/pong do ws lib responde automaticamente aos pings do broker.
    // O broker fecha após 2 pings sem pong; se acontecer, cai no 'close' acima.
  }

  function receberReqMeta(msg) {
    ultimaAtividade = Date.now();
    requisicoesAbertas.set(msg.id, { meta: msg, buffer: [] });
    try { onEstado({ estado: estadoAtual, sessaoAtiva: true }); } catch {}
  }

  function receberFrameBinario(buf) {
    // [1B idLen][idAscii][payload]
    if (!buf || buf.length < 1) return;
    const idLen = buf[0];
    if (buf.length < 1 + idLen) return;
    const id = buf.slice(1, 1 + idLen).toString("ascii");
    const payload = buf.slice(1 + idLen);
    const entrada = requisicoesAbertas.get(id);
    if (!entrada) return; // frame órfão (req_end já disparou)
    entrada.buffer.push(payload);
  }

  function dispararRequisicao(id) {
    const entrada = requisicoesAbertas.get(id);
    if (!entrada) return;
    requisicoesAbertas.delete(id);
    const { meta, buffer } = entrada;
    const body = buffer.length ? Buffer.concat(buffer) : undefined;

    const opts = {
      hostname: "127.0.0.1",
      port: porta,
      path: meta.path,
      method: meta.method || "GET",
      headers: sanitizarHeaders(meta.headers),
      timeout: REQ_TIMEOUT_MS,
    };

    const reqLocal = http.request(opts, (resLocal) => {
      const pedacos = [];
      resLocal.on("data", (c) => pedacos.push(c));
      resLocal.on("end", () => {
        const bodyResp = Buffer.concat(pedacos);
        const metaOut = {
          type: "res_meta",
          id,
          status: resLocal.statusCode,
          headers: resLocal.headers,
        };
        if (bodyResp.length <= BODY_INLINE_MAX) {
          metaOut.body_b64 = bodyResp.toString("base64");
          enviarJson(metaOut);
        } else {
          enviarJson(metaOut);
          const CHUNK = 64 * 1024;
          for (let off = 0; off < bodyResp.length; off += CHUNK) {
            enviarFrameBinario(id, bodyResp.slice(off, off + CHUNK));
          }
          enviarJson({ type: "res_chunk_end", id });
        }
      });
    });

    reqLocal.on("error", (e) => {
      log(`erro no proxy local (${meta.method} ${meta.path}): ${e.message}`);
      enviarJson({
        type: "res_meta",
        id,
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body_b64: Buffer.from("Proxy local falhou: " + e.message, "utf8").toString("base64"),
      });
    });

    reqLocal.on("timeout", () => reqLocal.destroy(new Error("timeout de 60s")));

    if (body) reqLocal.write(body);
    reqLocal.end();
  }

  // Remove headers hop-by-hop e cabeçalhos que o Node preenche sozinho.
  // Mantém x-nexus-suporte-token intacto — é o que o middleware do server/
  // valida pra conceder acesso admin pleno via túnel.
  function sanitizarHeaders(h) {
    const out = {};
    if (!h) return out;
    const remover = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "proxy-connection"]);
    for (const [k, v] of Object.entries(h)) {
      if (!remover.has(String(k).toLowerCase())) out[k] = v;
    }
    return out;
  }

  function enviarJson(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  function enviarFrameBinario(id, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const idBuf = Buffer.from(id, "ascii");
    const header = Buffer.alloc(1);
    header[0] = idBuf.length;
    try { ws.send(Buffer.concat([header, idBuf, payload])); } catch {}
  }

  return {
    start() { parado = false; conectar(); },
    stop() {
      parado = true;
      clearTimeout(reconectTimer);
      try { ws && ws.terminate(); } catch {}
      emitir("desconectado");
    },
    estado: () => ({
      conectado: !!ws && ws.readyState === WebSocket.OPEN,
      sessaoAtiva: Date.now() - ultimaAtividade < SESSAO_ATIVA_JANELA_MS,
      estado: estadoAtual,
    }),
  };
}
