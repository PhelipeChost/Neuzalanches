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
  await exec(conn, 'find /var/www/neuzalanches -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" 2>/dev/null');
  console.log('\n---');
  await exec(conn, 'ls -la /var/www/neuzalanches/');
  console.log('\n--- Check database.js for path ---');
  await exec(conn, 'grep -n "new Database\\|sqlite\\|\.db" /var/www/neuzalanches/server/database.js | head -5');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
