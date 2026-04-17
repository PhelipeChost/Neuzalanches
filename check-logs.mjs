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
  await exec(conn, 'pm2 logs neuzalanches --lines 30 --nostream 2>&1');
  console.log('\n--- Error log ---');
  await exec(conn, 'tail -30 /root/.pm2/logs/neuzalanches-error.log 2>/dev/null');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
