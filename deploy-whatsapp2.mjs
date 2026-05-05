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
  console.log('=== Upload whatsapp.js atualizado ===');
  const sftp = await getSftp(conn);
  await upload(sftp, path.resolve('server/services/whatsapp.js'), '/var/www/neuzalanches/server/services/whatsapp.js');
  console.log('  ✓ OK');

  console.log('\n=== Reiniciando servidor ===');
  await exec(conn, 'pm2 restart neuzalanches --update-env 2>&1');
  await exec(conn, 'sleep 2');

  console.log('\n=== Logs ===');
  await exec(conn, 'pm2 logs neuzalanches --lines 5 --nostream 2>&1');

  console.log('\n✅ Pronto! whatsapp.js atualizado em produção.');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
