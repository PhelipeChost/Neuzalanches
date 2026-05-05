import { Client } from 'ssh2';
import path from 'path';

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

function upload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => err ? reject(err) : resolve());
  });
}

function getSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });
}

const conn = new Client();
conn.on('ready', async () => {
  const sftp = await getSftp(conn);

  const files = [
    ['server/index.js',      '/var/www/neuzalanches/server/index.js'],
    ['src/App.jsx',          '/var/www/neuzalanches/src/App.jsx'],
    ['src/ClienteApp.jsx',   '/var/www/neuzalanches/src/ClienteApp.jsx'],
    ['src/api.js',           '/var/www/neuzalanches/src/api.js'],
  ];

  for (const [local, remote] of files) {
    console.log(`Upload ${local}`);
    await upload(sftp, path.resolve(local), remote);
    console.log('  ✓');
  }

  console.log('\n=== Build frontend ===');
  await exec(conn, 'cd /var/www/neuzalanches && npm run build 2>&1');

  console.log('\n=== Reiniciando servidor ===');
  await exec(conn, 'pm2 restart neuzalanches --update-env 2>&1');
  await exec(conn, 'sleep 2');

  console.log('\n=== Logs ===');
  await exec(conn, 'pm2 logs neuzalanches --lines 5 --nostream 2>&1');

  console.log('\n=== Testando endpoint /api/config/horario ===');
  await exec(conn, 'curl -s http://localhost:3001/api/config/horario');

  console.log('\n\n✅ Deploy concluído!');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
