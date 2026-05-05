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

const EVOLUTION_API_KEY = 'neuzalanches-secret-key-2024';
const INSTANCE_NAME = 'neuzalanches';
const N8N_WEBHOOK_URL = 'https://elitemaster.app.n8n.cloud/webhook/neuzalanches-bot';

const conn = new Client();
conn.on('ready', async () => {
  console.log('=== Removendo container antigo ===');
  await exec(conn, 'docker stop evolution-api 2>/dev/null; docker rm evolution-api 2>/dev/null');

  console.log('\n=== Instalando Evolution API v1.8.2 (estável, sem banco externo) ===');
  const cmd = `docker run -d \
    --name evolution-api \
    --restart always \
    -p 8080:8080 \
    -e SERVER_URL=http://145.223.31.205:8080 \
    -e AUTHENTICATION_TYPE=apikey \
    -e AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY} \
    -e AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true \
    -e DATABASE_ENABLED=false \
    -e REDIS_ENABLED=false \
    -e RABBITMQ_ENABLED=false \
    -e WEBSOCKET_ENABLED=false \
    -e CHATWOOT_ENABLED=false \
    -e CONFIG_SESSION_PHONE_CLIENT=Neuzalanches \
    -e CONFIG_SESSION_PHONE_NAME=Chrome \
    -e QRCODE_LIMIT=30 \
    -e LOG_LEVEL=ERROR \
    -e LOG_COLOR=true \
    -e STORE_MESSAGES=true \
    -e STORE_MESSAGE_UP=true \
    -e STORE_CONTACTS=true \
    -e STORE_CHATS=true \
    -v /var/evolution-api/instances:/evolution/instances \
    -v /var/evolution-api/store:/evolution/store \
    atendai/evolution-api:v1.8.2`;

  await exec(conn, cmd);

  console.log('\n=== Aguardando iniciar (15s) ===');
  await exec(conn, 'sleep 15');

  console.log('\n=== Status ===');
  const status = await exec(conn, 'docker ps --filter name=evolution-api --format "{{.Status}}"');
  console.log('Status:', status);

  console.log('\n=== Logs ===');
  await exec(conn, 'docker logs evolution-api --tail 20 2>&1');

  if (!status.includes('Restart')) {
    console.log('\n✅ Evolution API rodando! Criando instância...');

    // Criar instância
    const create = await exec(conn, `curl -s -X POST http://localhost:8080/instance/create \
      -H "Content-Type: application/json" \
      -H "apikey: ${EVOLUTION_API_KEY}" \
      -d '{"instanceName":"${INSTANCE_NAME}","qrcode":true}'`);
    console.log('\nInstância:', create);

    await exec(conn, 'sleep 3');

    // Configurar webhook
    const webhook = await exec(conn, `curl -s -X POST http://localhost:8080/webhook/set/${INSTANCE_NAME} \
      -H "Content-Type: application/json" \
      -H "apikey: ${EVOLUTION_API_KEY}" \
      -d '{"url":"${N8N_WEBHOOK_URL}","webhook_by_events":false,"events":["MESSAGES_UPSERT"]}'`);
    console.log('\nWebhook:', webhook);

    await exec(conn, 'sleep 3');

    // Pegar QR Code
    const qr = await exec(conn, `curl -s http://localhost:8080/instance/connect/${INSTANCE_NAME} \
      -H "apikey: ${EVOLUTION_API_KEY}"`);
    console.log('\nQR Code response:', qr.slice(0, 200));

    console.log('\n\n=== ✅ INSTALAÇÃO CONCLUÍDA ===');
    console.log('API URL: http://145.223.31.205:8080');
    console.log('API Key:', EVOLUTION_API_KEY);
    console.log('Instância:', INSTANCE_NAME);
    console.log('\n📱 Para escanear o QR Code, acesse:');
    console.log(`curl http://145.223.31.205:8080/instance/connect/${INSTANCE_NAME} -H "apikey: ${EVOLUTION_API_KEY}"`);
  } else {
    console.log('\n❌ Ainda reiniciando. Logs completos:');
    await exec(conn, 'docker logs evolution-api 2>&1');
  }

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
