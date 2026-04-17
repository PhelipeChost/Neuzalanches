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
  await exec(conn, 'pm2 reset neuzalanches 2>&1');
  await exec(conn, 'sleep 2');
  await exec(conn, 'pm2 logs neuzalanches --lines 5 --nostream 2>&1');
  console.log('\n--- Tests ---');
  await exec(conn, 'curl -sk -o /dev/null -w "HTTPS homepage: %{http_code}\\n" https://neuzalanches.com.br/');
  await exec(conn, 'curl -sk -o /dev/null -w "HTTPS API: %{http_code}\\n" https://neuzalanches.com.br/api/produtos');
  await exec(conn, 'curl -sk -o /dev/null -w "HTTPS registro: %{http_code}\\n" -X POST https://neuzalanches.com.br/api/auth/registro -H "Content-Type: application/json" -d "{\\"nome\\":\\"TesteDeploy\\",\\"telefone\\":\\"11999990001\\",\\"senha\\":\\"1234\\"}"');
  await exec(conn, 'pm2 status --no-color');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
