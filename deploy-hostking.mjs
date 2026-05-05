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
  try {
    const proj = '/var/www/neuzalanches';

    console.log('=== git pull ===');
    await exec(conn, `cd ${proj} && git pull --ff-only`);

    console.log('\n=== npm run build ===');
    await exec(conn, `cd ${proj} && npm run build 2>&1 | tail -10`);

    console.log('\n=== pm2 restart ===');
    await exec(conn, `pm2 restart neuzalanches --update-env`);

    console.log('\n=== pm2 status ===');
    await exec(conn, `pm2 list`);

    console.log('\n✅ Deploy concluído!');
  } catch (e) {
    console.error('Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
