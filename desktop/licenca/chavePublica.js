// Chave PÚBLICA da Nexus (RS256) — embutida no app, vai junto no build.
// A chave PRIVADA correspondente fica SÓ no servidor da Nexus (reinonexusideal),
// que é o único capaz de emitir licenças válidas. O app só verifica.
export const CHAVE_PUBLICA_NEXUS = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0cyRPGMm21vDLdyqVeGC
BVlByCPS5+uDRtH6vI6pcLUwTV/ft0uSDlFcSW5zn8xTZwJysNOvQb8vDDZ/snKw
lvywls7yO9aWuKTHVAIg6hnLNrvS7eLGsFEH6ScUhWUDHpbHOd7fQ/kTIjrP3xAj
U+ufx1ZbUtGBLSRIQGmsFne1TGMbEsQxEneMSNy4f8kNbcE5xN4f8wVH+3TBdtdg
KvASrjJxhKkpLC8SMiR72kutaQH4SRKYzkCroN417KQD7JOvpR2XgHuu+UGulxYH
NZ5s6DCLjjxMOK+7K6bxT4UA97SV1xrPfFPBcCefhv9zJDiJoE1yuR5NbrLD7kWE
OwIDAQAB
-----END PUBLIC KEY-----`;

// Algoritmo FIXO. Nunca aceitar o "alg" vindo do token (proteção contra
// alg=none / troca para HS256 usando a pública como segredo).
export const ALGORITMO = "RS256";
