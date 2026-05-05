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
    console.log('=== Estado ===');
    await exec(conn, `curl -s -H "apikey: neuzalanches-secret-key-2024" http://localhost:8080/instance/connectionState/neuzalanches`);
    console.log();

    console.log('\n=== Mensagens recebidas após 23:30 BRT (UTC-3) de ontem ===');
    // 2026-04-26 23:30 BRT = 2026-04-27 02:30 UTC = epoch 1777264200
    await exec(conn, `curl -s -X POST -H "apikey: neuzalanches-secret-key-2024" -H "Content-Type: application/json" http://localhost:8080/chat/findMessages/neuzalanches -d '{"where":{"key":{"fromMe":false}},"limit":15,"offset":0}' | python3 -c "
import json,sys,datetime
data=json.load(sys.stdin)
for r in data.get('messages',{}).get('records',[])[:15]:
    ts=r.get('messageTimestamp',0)
    dt=datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S UTC')
    k=r.get('key',{})
    push=r.get('pushName','?')
    text=str(r.get('message',{}).get('conversation',''))[:60]
    print(f\"{dt} | {push} | jid={k.get('remoteJid')} alt={k.get('remoteJidAlt')} mode={k.get('addressingMode')} | '{text}'\")
"`);

    console.log('\n\n=== Logs OUT últimas 80 linhas filtrando webhook/saudacao/extrair ===');
    await exec(conn, `tail -n 200 /root/.pm2/logs/neuzalanches-out.log | grep -E 'webhook|saudacao|enviando|cooldown|extrair|fromMe|connection' | tail -40`);

    console.log('\n=== Logs ERR últimas 15 ===');
    await exec(conn, `tail -n 15 /root/.pm2/logs/neuzalanches-error.log`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
