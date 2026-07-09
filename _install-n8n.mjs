// Instala o n8n no VPS do protótipo (Docker, network host) e sobe o workflow do bot.
// Uso: node _install-n8n.mjs
import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const HOST = '177.153.62.21';
const USER = 'root';
const PASS = 'A@Xn8felipe';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}
function getSftp(conn) { return new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s))); }
function sftpWrite(sftp, remotePath, data) {
  return new Promise((res, rej) => { const ws = sftp.createWriteStream(remotePath); ws.on('error', rej); ws.on('close', res); ws.end(data); });
}

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('=== Verificando porta 5678 e containers existentes ===');
    await exec(conn, 'docker ps -a --filter name=n8n --format "{{.Names}} {{.Status}}" ; ss -ltnp | grep :5678 || echo "porta 5678 livre"');

    console.log('\n=== Subindo n8n (Docker, network host, dados persistentes) ===');
    await exec(conn, `docker rm -f n8n 2>/dev/null; docker volume create n8n_data >/dev/null; docker run -d \
      --name n8n \
      --restart always \
      --network host \
      -e N8N_HOST=177.153.62.21 \
      -e N8N_PORT=5678 \
      -e N8N_SECURE_COOKIE=false \
      -e WEBHOOK_URL=http://177.153.62.21:5678/ \
      -e GENERIC_TIMEZONE=America/Sao_Paulo \
      -e TZ=America/Sao_Paulo \
      -v n8n_data:/home/node/.n8n \
      docker.n8n.io/n8nio/n8n:latest && echo "container criado"`);

    console.log('\n=== Aguardando n8n iniciar (até 60s) ===');
    await exec(conn, 'for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678/healthz 2>/dev/null); if [ "$code" = "200" ]; then echo "n8n saudavel (healthz 200) apos ${i}x2s"; break; fi; sleep 2; done; curl -s -o /dev/null -w "healthz final: %{http_code}\\n" http://localhost:5678/healthz');

    console.log('\n=== Enviando workflow do bot para o servidor ===');
    const sftp = await getSftp(conn);
    await sftpWrite(sftp, '/root/bot-frentecaixa-n8n.json', readFileSync('bot-frentecaixa-n8n.json'));
    sftp.end();
    await exec(conn, 'ls -la /root/bot-frentecaixa-n8n.json');

    console.log('\n=== Status final ===');
    await exec(conn, 'docker ps --filter name=n8n --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
    console.log('\n✅ n8n instalado! Editor: http://177.153.62.21:5678');
  } catch (e) {
    console.error('\n❌ Falhou:', e.message);
    process.exitCode = 1;
  } finally {
    conn.end();
  }
});
conn.on('error', e => { console.error('SSH error:', e.message); process.exitCode = 1; });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
