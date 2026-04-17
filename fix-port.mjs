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

  // 1. Remove old JS files from dist/assets (keep only the latest)
  console.log('=== Cleaning old JS bundles ===');
  await exec(conn, `cd /var/www/neuzalanches/dist/assets && ls -la`);
  await exec(conn, `cd /var/www/neuzalanches/dist/assets && rm -f index-BeVCkucU.js index-CSrmUALO.js index-x0spy-gl.js`);
  console.log('\nOld bundles removed\n');

  // 2. Fully recreate PM2 process
  console.log('=== Recreating PM2 process ===');
  await exec(conn, `pm2 delete neuzalanches 2>&1`);
  await exec(conn, `cd /var/www/neuzalanches && pm2 start server/index.js --name neuzalanches --update-env 2>&1`);
  await exec(conn, `pm2 save 2>&1`);

  // 3. Wait and verify
  console.log('\n=== Waiting for server start ===');
  await exec(conn, `sleep 3`);

  console.log('\n=== Testing PIX endpoint (should be public now) ===');
  const pixResult = await exec(conn, `curl -s http://localhost:3001/api/config/pix`);

  console.log('\n\n=== Testing public order endpoint (should return 400, not 404) ===');
  await exec(conn, `curl -s -w "\\nHTTP: %{http_code}" -X POST http://localhost:3001/api/pedidos/publico -H "Content-Type: application/json" -d '{"test":true}'`);

  console.log('\n\n=== PM2 status ===');
  await exec(conn, `pm2 status --no-color`);

  if (pixResult.includes('pix_key')) {
    console.log('\n✅ Server is running the NEW code!');
  } else {
    console.log('\n❌ Still running old code');
  }

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
