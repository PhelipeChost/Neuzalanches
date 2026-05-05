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
  console.log('=== PM2 details ===');
  await exec(conn, 'pm2 show neuzalanches 2>&1 | head -30');

  console.log('\n=== What port is the OLD neuzalanches on? ===');
  await exec(conn, 'pm2 logs neuzalanches --lines 5 --nostream 2>&1');

  console.log('\n=== Nginx config ===');
  await exec(conn, 'cat /etc/nginx/sites-enabled/neuzalanches 2>/dev/null || cat /etc/nginx/sites-enabled/default 2>/dev/null | head -60');

  console.log('\n=== Test /whatsapp endpoint ===');
  await exec(conn, 'curl -s http://localhost:3002/whatsapp | head -30 2>&1');

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
