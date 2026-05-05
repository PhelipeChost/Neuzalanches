import { Client } from 'ssh2';

function exec(conn, cmd, label = '') {
  return new Promise((resolve, reject) => {
    if (label) console.log(`\n>>> ${label}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

// Webhook URL do N8N (obter após ativar o workflow)
const N8N_WEBHOOK_URL = 'https://elitemaster.app.n8n.cloud/webhook/neuzalanches-bot';
const EVOLUTION_API_KEY = 'neuzalanches-secret-key-2024';
const INSTANCE_NAME = 'neuzalanches';

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Conectado ao VPS\n');

  // 1. Verificar se Docker está instalado
  console.log('=== Verificando Docker ===');
  const dockerVersion = await exec(conn, 'docker --version 2>/dev/null || echo "NOT_INSTALLED"');

  if (dockerVersion.includes('NOT_INSTALLED')) {
    console.log('\nInstalando Docker...');
    await exec(conn, 'curl -fsSL https://get.docker.com | sh', 'Instalando Docker');
    await exec(conn, 'systemctl enable docker && systemctl start docker', 'Iniciando Docker');
  } else {
    console.log('Docker já instalado:', dockerVersion);
  }

  // 2. Parar e remover container antigo se existir
  console.log('\n=== Preparando container Evolution API ===');
  await exec(conn, 'docker stop evolution-api 2>/dev/null || true');
  await exec(conn, 'docker rm evolution-api 2>/dev/null || true');

  // 3. Criar diretório de dados
  await exec(conn, 'mkdir -p /var/evolution-api/instances', 'Criando diretório de dados');

  // 4. Instalar Evolution API via Docker
  console.log('\n=== Instalando Evolution API ===');
  const dockerCmd = `docker run -d \\
    --name evolution-api \\
    --restart always \\
    -p 8080:8080 \\
    -e SERVER_URL=http://145.223.31.205:8080 \\
    -e AUTHENTICATION_TYPE=apikey \\
    -e AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY} \\
    -e AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true \\
    -e DEL_INSTANCE=false \\
    -e DATABASE_ENABLED=false \\
    -e REDIS_ENABLED=false \\
    -e RABBITMQ_ENABLED=false \\
    -e WEBSOCKET_ENABLED=false \\
    -e CHATWOOT_ENABLED=false \\
    -e QRCODE_LIMIT=30 \\
    -e QRCODE_COLOR=%23000000 \\
    -e LOG_LEVEL=ERROR \\
    -e LOG_COLOR=true \\
    -e LOG_BAILEYS=error \\
    -v /var/evolution-api/instances:/evolution/instances \\
    atendai/evolution-api:latest`;

  await exec(conn, dockerCmd, 'Iniciando Evolution API');

  // 5. Aguardar container iniciar
  console.log('\n=== Aguardando Evolution API iniciar ===');
  await exec(conn, 'sleep 8');

  // 6. Verificar se está rodando
  const status = await exec(conn, 'docker ps --filter name=evolution-api --format "{{.Status}}"');
  console.log('\nStatus:', status);

  // 7. Criar instância WhatsApp
  console.log('\n=== Criando instância WhatsApp ===');
  const createInstance = await exec(conn, `curl -s -X POST http://localhost:8080/instance/create \\
    -H "Content-Type: application/json" \\
    -H "apikey: ${EVOLUTION_API_KEY}" \\
    -d '{
      "instanceName": "${INSTANCE_NAME}",
      "qrcode": true,
      "integration": "WHATSAPP-BAILEYS"
    }'`);
  console.log('\nResposta:', createInstance);

  // 8. Configurar webhook para N8N
  console.log('\n=== Configurando webhook N8N ===');
  await exec(conn, 'sleep 3');
  const webhookResult = await exec(conn, `curl -s -X POST http://localhost:8080/webhook/set/${INSTANCE_NAME} \\
    -H "Content-Type: application/json" \\
    -H "apikey: ${EVOLUTION_API_KEY}" \\
    -d '{
      "url": "${N8N_WEBHOOK_URL}",
      "webhook_by_events": false,
      "webhook_base64": false,
      "events": ["MESSAGES_UPSERT"]
    }'`);
  console.log('\nWebhook configurado:', webhookResult);

  // 9. Buscar QR Code
  console.log('\n=== Buscando QR Code ===');
  await exec(conn, 'sleep 3');
  const qrCode = await exec(conn, `curl -s http://localhost:8080/instance/connect/${INSTANCE_NAME} \\
    -H "apikey: ${EVOLUTION_API_KEY}"`);

  try {
    const qrData = JSON.parse(qrCode);
    if (qrData.base64) {
      console.log('\n✅ QR CODE DISPONÍVEL!');
      console.log('Acesse: http://145.223.31.205:8080/instance/connect/' + INSTANCE_NAME);
      console.log('Header: apikey: ' + EVOLUTION_API_KEY);
    } else {
      console.log('\nQR Code:', JSON.stringify(qrData, null, 2));
    }
  } catch(e) {
    console.log('\nResposta QR:', qrCode);
  }

  // 10. Status final
  console.log('\n=== RESUMO ===');
  console.log('✅ Evolution API: http://145.223.31.205:8080');
  console.log('✅ API Key:', EVOLUTION_API_KEY);
  console.log('✅ Instância:', INSTANCE_NAME);
  console.log('✅ Webhook N8N:', N8N_WEBHOOK_URL);
  console.log('\n📱 Para conectar o WhatsApp:');
  console.log('   Escaneie o QR Code em:');
  console.log('   http://145.223.31.205:8080/instance/connect/' + INSTANCE_NAME);
  console.log('   (com o header apikey: ' + EVOLUTION_API_KEY + ')');

  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
