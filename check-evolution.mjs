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
  console.log('=== Logs do container ===');
  await exec(conn, 'docker logs evolution-api --tail 50 2>&1');

  console.log('\n=== Status do container ===');
  await exec(conn, 'docker inspect evolution-api --format "{{.State.Status}} | ExitCode: {{.State.ExitCode}} | Error: {{.State.Error}}" 2>&1');

  console.log('\n=== Tentando versão anterior da imagem ===');
  await exec(conn, 'docker stop evolution-api 2>/dev/null; docker rm evolution-api 2>/dev/null');

  // Tentar com versão v2 específica e configurações mínimas
  const cmd = `docker run -d \
    --name evolution-api \
    --restart always \
    -p 8080:8080 \
    -e AUTHENTICATION_TYPE=apikey \
    -e AUTHENTICATION_API_KEY=neuzalanches-secret-key-2024 \
    -e SERVER_URL=http://145.223.31.205:8080 \
    -e DATABASE_PROVIDER=typeorm \
    -e DATABASE_CONNECTION_URI=sqlite:///evolution/instances/db.sqlite \
    -e LOG_LEVEL=ERROR \
    -v /var/evolution-api/instances:/evolution/instances \
    atendai/evolution-api:v2.2.3`;

  console.log('\n=== Tentando com Evolution API v2.2.3 ===');
  await exec(conn, cmd);
  await exec(conn, 'sleep 10');

  console.log('\n=== Status após nova tentativa ===');
  await exec(conn, 'docker ps --filter name=evolution-api');

  console.log('\n=== Logs novos ===');
  await exec(conn, 'docker logs evolution-api --tail 30 2>&1');

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
