// ─── Verificação de licença (contrato Nexus RS256) ───────────────────────────
// Retorna sempre um objeto { estado, motivo, claims, diasRestantes }, nunca lança.
//   estado: "ativo" | "tolerancia" | "bloqueado"
//
// Segurança: a ASSINATURA RS256 é sempre exigida (algorithms travado em RS256).
// A checagem de validade é feita à mão (ignoreExpiration) só para conseguir
// aplicar a janela de tolerância (grace_days) após o vencimento — o que o
// jwt.verify padrão não permite. Assinatura inválida/chave errada = bloqueado.
import jwt from "jsonwebtoken";
import { CHAVE_PUBLICA_NEXUS, ALGORITMO } from "./chavePublica.js";

const DIA = 86400; // segundos

/**
 * @param {string} token  a string da licença (.lic)
 * @param {object} opts
 * @param {string} opts.publicKeyPem   chave pública (default: a da Nexus)
 * @param {string|null} opts.fingerprintAtual  fingerprint da máquina atual (ou null p/ não checar)
 * @param {number} opts.agora  epoch em segundos (default: agora) — facilita teste
 */
export function verificarLicenca(token, opts = {}) {
  const {
    publicKeyPem = CHAVE_PUBLICA_NEXUS,
    fingerprintAtual = null,
    agora = Math.floor(Date.now() / 1000),
  } = opts;

  if (!token || typeof token !== "string" || !token.trim()) {
    return bloqueado("Nenhuma licença informada.", null);
  }

  // 1) Assinatura (obrigatória). ignoreExpiration para tratar grace manualmente.
  let claims;
  try {
    claims = jwt.verify(token.trim(), publicKeyPem, {
      algorithms: [ALGORITMO],   // trava o algoritmo — não confia no header do token
      ignoreExpiration: true,
    });
  } catch (e) {
    return bloqueado("Licença inválida ou adulterada.", null, e.message);
  }

  // 2) Amarração de máquina (só quando o token traz fingerprint)
  if (claims.fingerprint != null && claims.fingerprint !== "") {
    if (!fingerprintAtual || fingerprintAtual !== claims.fingerprint) {
      return bloqueado("Esta licença pertence a outra máquina.", claims);
    }
  }

  // 3) Validade + tolerância (grace_days)
  const exp = Number(claims.exp) || 0;
  if (!exp) return bloqueado("Licença sem data de validade.", claims);

  const grace = Math.max(0, Number(claims.grace_days) || 0);
  const fimTolerancia = exp + grace * DIA;
  const diasRestantes = Math.ceil((exp - agora) / DIA);

  if (agora <= exp) {
    return { estado: "ativo", motivo: "Licença ativa.", claims, diasRestantes };
  }
  if (agora <= fimTolerancia) {
    const diasTolerancia = Math.ceil((fimTolerancia - agora) / DIA);
    return {
      estado: "tolerancia",
      motivo: `Licença vencida — período de tolerância (${diasTolerancia} dia(s) restantes). Renove para não bloquear.`,
      claims,
      diasRestantes,
    };
  }
  return bloqueado("Licença vencida. Assinatura em atraso — contate a Nexus.", claims);
}

function bloqueado(motivo, claims, detalhe) {
  return { estado: "bloqueado", motivo, claims: claims || null, diasRestantes: null, detalhe };
}
