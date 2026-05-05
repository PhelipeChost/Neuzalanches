import { Client } from 'ssh2';
import fs from 'fs';
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
  console.log('=== Deploy WhatsApp Integration ===\n');

  const sftp = await getSftp(conn);

  // Upload dos arquivos modificados
  const files = [
    ['server/index.js', '/var/www/neuzalanches/server/index.js'],
    ['server/services/whatsapp.js', '/var/www/neuzalanches/server/services/whatsapp.js'],
    ['src/Pedidos.jsx', '/var/www/neuzalanches/src/Pedidos.jsx'],
    ['.env', '/var/www/neuzalanches/.env'],
  ];

  for (const [local, remote] of files) {
    const localFull = path.resolve(local);
    console.log(`Uploading ${local} → ${remote}`);
    await upload(sftp, localFull, remote);
    console.log('  ✓ OK');
  }

  console.log('\n=== Criando pasta services se não existir ===');
  await exec(conn, 'mkdir -p /var/www/neuzalanches/server/services');

  console.log('\n=== Re-upload do whatsapp.js (garantindo pasta criada) ===');
  await upload(sftp, path.resolve('server/services/whatsapp.js'), '/var/www/neuzalanches/server/services/whatsapp.js');

  console.log('\n=== Build do frontend ===');
  await exec(conn, 'cd /var/www/neuzalanches && npm run build 2>&1');

  console.log('\n=== Reiniciando servidor ===');
  await exec(conn, 'cd /var/www/neuzalanches && pm2 restart neuzalanches-server 2>&1 || pm2 start server/index.js --name neuzalanches-server 2>&1');

  console.log('\n=== Status PM2 ===');
  await exec(conn, 'pm2 list');

  console.log('\n=== Logs recentes ===');
  await exec(conn, 'pm2 logs neuzalanches-server --lines 15 --nostream 2>&1');

  console.log('\n\n✅ Deploy concluído!');
  console.log('📱 Página QR Code: https://neuzalanches.com.br/whatsapp');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
