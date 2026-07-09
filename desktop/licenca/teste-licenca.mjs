// Teste da camada de licença — roda com: node desktop/licenca/teste-licenca.mjs
// Gera um par de chaves DE TESTE para simular o servidor Nexus assinando tokens,
// e valida todos os estados/ataques. A chave pública REAL embutida também é
// testada: deve REJEITAR tokens assinados por qualquer outra chave.
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { verificarLicenca } from "./verificar.js";
import { fingerprintMaquina } from "./fingerprint.js";
import { lerLicenca, salvarLicenca, removerLicenca } from "./armazenamento.js";

const AGORA = Math.floor(Date.now() / 1000);
const DIA = 86400;
const erros = [];
const caso = (nome, cond) => { if (!cond) erros.push(nome); else console.log("  ✓", nome); };

// Par de chaves de teste (simula o servidor Nexus)
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const outroPar = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const assinar = (claims, pk = privateKey) => jwt.sign(claims, pk, { algorithm: "RS256" });
const base = { cliente: "Lanchonete Teste", plano: "completo", client_id: 1, iat: AGORA };

console.log("— Estados —");
// 1. válido
let r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, grace_days: 7, fingerprint: null }), { publicKeyPem: publicKey });
caso("token válido → ativo", r.estado === "ativo" && r.diasRestantes >= 29);

// 2. vencido há 2 dias, grace 7 → tolerância
r = verificarLicenca(assinar({ ...base, exp: AGORA - 2 * DIA, grace_days: 7, fingerprint: null }), { publicKeyPem: publicKey });
caso("vencido dentro da tolerância → tolerancia", r.estado === "tolerancia");

// 3. vencido há 10 dias, grace 7 → bloqueado
r = verificarLicenca(assinar({ ...base, exp: AGORA - 10 * DIA, grace_days: 7, fingerprint: null }), { publicKeyPem: publicKey });
caso("vencido além da tolerância → bloqueado", r.estado === "bloqueado");

// 4. sem grace_days (0) e vencido → bloqueado direto
r = verificarLicenca(assinar({ ...base, exp: AGORA - 60, fingerprint: null }), { publicKeyPem: publicKey });
caso("vencido sem grace → bloqueado", r.estado === "bloqueado");

// 5. sem exp → bloqueado
r = verificarLicenca(jwt.sign({ ...base, fingerprint: null }, privateKey, { algorithm: "RS256", noTimestamp: true }), { publicKeyPem: publicKey });
caso("sem exp → bloqueado", r.estado === "bloqueado");

console.log("— Segurança —");
// 6. token adulterado (troca payload mantendo assinatura)
const tokenBom = assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: null });
const [h, , s] = tokenBom.split(".");
const payloadFalso = Buffer.from(JSON.stringify({ ...base, exp: AGORA + 3650 * DIA, fingerprint: null })).toString("base64url");
r = verificarLicenca([h, payloadFalso, s].join("."), { publicKeyPem: publicKey });
caso("payload adulterado → bloqueado", r.estado === "bloqueado");

// 7. assinado por OUTRA chave privada → bloqueado
r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: null }, outroPar.privateKey), { publicKeyPem: publicKey });
caso("assinatura de outra chave → bloqueado", r.estado === "bloqueado");

// 8. ataque de algoritmo: HS256 usando a chave pública como segredo
const hs = jwt.sign({ ...base, exp: AGORA + 30 * DIA, fingerprint: null }, publicKey, { algorithm: "HS256" });
r = verificarLicenca(hs, { publicKeyPem: publicKey });
caso("ataque alg HS256 → bloqueado", r.estado === "bloqueado");

// 9. chave REAL da Nexus embutida rejeita token de chave de teste
r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: null }));
caso("chave real embutida rejeita assinatura estranha → bloqueado", r.estado === "bloqueado");

// 10. lixo/vazio
caso("string vazia → bloqueado", verificarLicenca("", { publicKeyPem: publicKey }).estado === "bloqueado");
caso("lixo → bloqueado", verificarLicenca("nao-e-um-jwt", { publicKeyPem: publicKey }).estado === "bloqueado");

console.log("— Fingerprint —");
const fp = fingerprintMaquina();
caso("fingerprint estável e 32 hex", /^[0-9a-f]{32}$/.test(fp) && fp === fingerprintMaquina());

// 11. token amarrado a ESTA máquina → ativo
r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: fp }), { publicKeyPem: publicKey, fingerprintAtual: fp });
caso("fingerprint desta máquina → ativo", r.estado === "ativo");

// 12. token de outra máquina → bloqueado
r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: "aaaa1111bbbb2222cccc3333dddd4444" }), { publicKeyPem: publicKey, fingerprintAtual: fp });
caso("fingerprint de outra máquina → bloqueado", r.estado === "bloqueado");

// 13. sem fingerprint no token → não amarra (ativo em qualquer máquina)
r = verificarLicenca(assinar({ ...base, exp: AGORA + 30 * DIA, fingerprint: null }), { publicKeyPem: publicKey, fingerprintAtual: fp });
caso("token sem fingerprint → ativo em qualquer máquina", r.estado === "ativo");

console.log("— Armazenamento —");
const dir = mkdtempSync(join(tmpdir(), "lic-test-"));
try {
  caso("ler sem arquivo → null", lerLicenca(dir) === null);
  salvarLicenca(dir, "  " + tokenBom + "\n");
  caso("salvar + ler (com trim)", lerLicenca(dir) === tokenBom);
  removerLicenca(dir);
  caso("remover → null", lerLicenca(dir) === null);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (erros.length) {
  console.log("\nFALHOU:");
  erros.forEach(e => console.log(" ✗", e));
  process.exit(1);
}
console.log("\nTODOS OS TESTES DA LICENÇA PASSARAM ✓  (fingerprint desta máquina: " + fp + ")");
