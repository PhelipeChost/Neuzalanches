// Envio de backups do PDV para o Google Drive da Nexus, via OAuth (refresh
// token). Zero dependências novas — usa fetch global (Node 18+/Electron 33).
//
// MODELO DE CREDENCIAL:
//  - Credencial OAuth (client_id, client_secret, refresh_token) é GLOBAL da
//    Nexus — a mesma pra todos os PDVs. Vem de env (DRIVE_CLIENT_ID etc.,
//    embutida no build) OU da config local. Escopo recomendado: drive.file
//    (o app só enxerga/gerencia os arquivos que ELE cria — não o Drive inteiro).
//  - A PASTA (folder_id) é por cliente — configurada no Suporte de cada PDV.
//
// Como o refresh_token é da conta Nexus, todo arquivo enviado é PROPRIEDADE da
// Nexus (conta no valor de quota dela), invisível pro cliente.

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";

// Troca o refresh_token por um access_token de curta duração.
async function obterAccessToken({ client_id, client_secret, refresh_token }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id,
    client_secret,
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth falhou: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

// Faz upload multipart (metadados + binário) de um Buffer pra uma pasta.
async function uploadBuffer(accessToken, { folderId, nomeArquivo, buffer, mimeType = "application/octet-stream" }) {
  const boundary = "nexusbackup" + Date.now().toString(36);
  const metadata = JSON.stringify({ name: nomeArquivo, parents: folderId ? [folderId] : undefined });
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, "utf8");
  const pos = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const corpo = Buffer.concat([pre, buffer, pos]);

  const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&fields=id,name&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: corpo,
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(`Upload falhou: ${data.error?.message || res.status}`);
  }
  return data;
}

// Lista os arquivos que o app criou nesta pasta (drive.file só vê os próprios).
async function listarNaPasta(accessToken, folderId, prefixoNome) {
  const q = [`'${folderId}' in parents`, "trashed=false"];
  if (prefixoNome) q.push(`name contains '${prefixoNome}'`);
  const url = `${FILES_URL}?q=${encodeURIComponent(q.join(" and "))}` +
    `&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=100&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Listagem falhou: ${data.error?.message || res.status}`);
  return data.files || [];
}

async function apagar(accessToken, fileId) {
  await fetch(`${FILES_URL}/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  }).catch(() => {});
}

// ── API pública do serviço ──────────────────────────────────────────────────

// Envia um arquivo e faz a rotação (mantém os `manter` mais recentes com o
// mesmo prefixo). Retorna { id, name }.
export async function enviarBackup({ cred, folderId, nomeArquivo, buffer, prefixo, manter = 15 }) {
  const accessToken = await obterAccessToken(cred);
  const enviado = await uploadBuffer(accessToken, { folderId, nomeArquivo, buffer });
  if (prefixo && manter > 0) {
    try {
      const arquivos = await listarNaPasta(accessToken, folderId, prefixo);
      for (const f of arquivos.slice(manter)) await apagar(accessToken, f.id);
    } catch { /* rotação é best-effort — não derruba o envio */ }
  }
  return enviado;
}

// Lista os backups disponíveis na pasta do cliente (pra restauração no Suporte).
export async function listarBackups({ cred, folderId }) {
  const accessToken = await obterAccessToken(cred);
  return listarNaPasta(accessToken, folderId);
}

// Baixa o conteúdo bruto de um arquivo específico (restauração).
export async function baixarArquivo({ cred, fileId }) {
  const accessToken = await obterAccessToken(cred);
  const res = await fetch(`${FILES_URL}/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Download falhou: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Valida credencial + acesso de escrita à pasta: sobe um arquivo mínimo e apaga.
export async function testarConexao({ cred, folderId }) {
  const accessToken = await obterAccessToken(cred);
  const teste = await uploadBuffer(accessToken, {
    folderId,
    nomeArquivo: `conexao-nexus-${Date.now()}.txt`,
    buffer: Buffer.from("Teste de conexao Nexus — pode apagar.", "utf8"),
    mimeType: "text/plain",
  });
  await apagar(accessToken, teste.id);
  return { ok: true };
}
