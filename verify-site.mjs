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

  // Check API through Nginx
  await exec(conn, 'curl -s -o /dev/null -w "API via Nginx: %{http_code}\\n" http://localhost/api/produtos');

  // Check frontend
  await exec(conn, 'curl -s -o /dev/null -w "Frontend: %{http_code}\\n" http://localhost/');

  // Check HTTPS externally
  await exec(conn, 'curl -sk -o /dev/null -w "HTTPS: %{http_code}\\n" https://neuzalanches.com.br/');
  await exec(conn, 'curl -sk -o /dev/null -w "HTTPS API: %{http_code}\\n" https://neuzalanches.com.br/api/produtos');

  // Check Nginx config
  console.log('\n--- Nginx proxy config ---');
  await exec(conn, 'grep proxy_pass /etc/nginx/sites-available/neuzalanches');

  // PM2 status
  console.log('\n--- PM2 status ---');
  await exec(conn, 'pm2 status --no-color');

  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
