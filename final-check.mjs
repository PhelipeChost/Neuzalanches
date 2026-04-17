import { Client } from 'ssh2';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('Connected\n');

  // 1. Check if PIX endpoint is really public (no authMiddleware)
  console.log('=== Testing PIX endpoint (no auth) ===');
  await exec(conn, `curl -s http://localhost:3001/api/config/pix`);

  // 2. Check if public order endpoint exists
  console.log('\n\n=== Testing public order endpoint ===');
  await exec(conn, `curl -s -w "\\nHTTP: %{http_code}" -X POST http://localhost:3001/api/pedidos/publico -H "Content-Type: application/json" -d '{"test":true}'`);

  // 3. Check deployed server code for the PIX route
  console.log('\n\n=== Checking server code for PIX route ===');
  await exec(conn, `grep -n "config/pix" /var/www/neuzalanches/server/index.js`);

  // 4. Check deployed server code for public order route
  console.log('\n\n=== Checking server code for public order route ===');
  await exec(conn, `grep -n "pedidos/publico" /var/www/neuzalanches/server/index.js`);

  // 5. Check PM2 logs for errors
  console.log('\n\n=== PM2 recent logs ===');
  await exec(conn, `pm2 logs neuzalanches --lines 20 --nostream 2>&1`);

  // 6. Check what JS file is referenced in index.html
  console.log('\n\n=== index.html content ===');
  await exec(conn, `cat /var/www/neuzalanches/dist/index.html`);

  // 7. Check if old JS files are still lingering
  console.log('\n\n=== JS files in dist/assets ===');
  await exec(conn, `ls -la /var/www/neuzalanches/dist/assets/`);

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
