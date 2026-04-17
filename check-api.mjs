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
  await exec(conn, 'curl -s http://localhost:3001/api/produtos | head -100');
  console.log('\n---');
  await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/produtos && echo');
  console.log('\n---');
  await exec(conn, 'curl -s http://localhost:3001/ | head -5');
  console.log('\n---');
  await exec(conn, 'pm2 logs neuzalanches --lines 10 --nostream 2>&1');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
