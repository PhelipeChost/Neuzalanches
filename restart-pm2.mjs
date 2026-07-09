import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 restart neuzalanches && sleep 1 && pm2 list | grep neuzalanches', (err, s) => {
    if (err) { console.error(err); conn.end(); return; }
    s.on('data', d => process.stdout.write(d));
    s.on('close', () => conn.end());
  });
});
conn.on('error', e => console.error('SSH:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
