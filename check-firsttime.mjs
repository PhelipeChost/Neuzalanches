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
    console.log('=== Logs OUT últimos 300 — falhas, não-extraídos, sendText ===');
    await exec(conn, `tail -n 400 /root/.pm2/logs/neuzalanches-out.log | grep -E 'webhook|saudacao|enviando|sendText|não conseguiu|extrair|cooldown' | tail -80`);

    console.log('\n\n=== ERR últimos 30 ===');
    await exec(conn, `tail -n 30 /root/.pm2/logs/neuzalanches-error.log`);

    console.log('\n\n=== Mensagens recebidas hoje (raw payload p/ ver addressingMode/key) ===');
    await exec(conn, `curl -s -X POST -H "apikey: neuzalanches-secret-key-2024" -H "Content-Type: application/json" http://localhost:8080/chat/findMessages/neuzalanches -d '{"where":{"key":{"fromMe":false}},"limit":10,"offset":0}' | python3 -c "
import json,sys,datetime
data=json.load(sys.stdin)
for r in data.get('messages',{}).get('records',[])[:10]:
    ts=r.get('messageTimestamp',0)
    dt=datetime.datetime.fromtimestamp(ts).strftime('%m-%d %H:%M')
    k=r.get('key',{})
    print(f\"{dt} | push={r.get('pushName','?')[:15]:15} | jid={k.get('remoteJid')} | senderPn={k.get('senderPn')} | remoteJidAlt={k.get('remoteJidAlt')} | addr={k.get('addressingMode')} | participantPn={k.get('participantPn')}\")
"`);

    console.log('\n\n=== Webhook está configurado p/ MESSAGES_UPSERT? ===');
    await exec(conn, `curl -s -H "apikey: neuzalanches-secret-key-2024" http://localhost:8080/webhook/find/neuzalanches | python3 -m json.tool 2>&1 | head -40`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
