import { Client } from 'ssh2';
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
const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('=== Versão do código deployado: tem remoteJidAlt? ===');
    await exec(conn, `grep -n 'remoteJidAlt' /var/www/neuzalanches/server/index.js | head -3`);

    console.log('\n=== PM2 uptime do neuzalanches ===');
    await exec(conn, `pm2 describe neuzalanches | grep -E 'uptime|restarts|status' | head -5`);

    console.log('\n=== ÚLTIMAS 60 linhas brutas do OUT log (sem filtro) ===');
    await exec(conn, `tail -n 60 /root/.pm2/logs/neuzalanches-out.log`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
