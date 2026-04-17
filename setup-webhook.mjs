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

  const WEBHOOK_URL = 'https://reinonexusideal.com.br/api/public/webhook/bf17b496e73c3dc6e25fca5ef4ab161de103ae41';

  // 1. Verificar .env atual na produção
  console.log('=== .env atual ===');
  await exec(conn, 'cat /var/www/neuzalanches/.env 2>/dev/null || echo "(sem .env)"');

  // 2. Criar/atualizar .env na produção com NEXO_WEBHOOK_URL
  console.log('\n\n=== Configurando .env ===');
  // Checar se já tem NEXO_WEBHOOK_URL
  const envContent = await exec(conn, 'cat /var/www/neuzalanches/.env 2>/dev/null');

  if (envContent.includes('NEXO_WEBHOOK_URL')) {
    // Substituir a linha existente
    await exec(conn, `sed -i 's|^NEXO_WEBHOOK_URL=.*|NEXO_WEBHOOK_URL=${WEBHOOK_URL}|' /var/www/neuzalanches/.env`);
    console.log('URL atualizada no .env existente');
  } else {
    // Adicionar ao .env (ou criar)
    await exec(conn, `echo 'NEXO_WEBHOOK_URL=${WEBHOOK_URL}' >> /var/www/neuzalanches/.env`);
    console.log('URL adicionada ao .env');
  }

  // 3. Verificar .env final
  console.log('\n=== .env final ===');
  await exec(conn, 'cat /var/www/neuzalanches/.env');

  // 4. Reiniciar PM2 para pegar a nova variável
  console.log('\n\n=== Reiniciando PM2 ===');
  await exec(conn, 'cd /var/www/neuzalanches && pm2 restart neuzalanches --update-env 2>&1');

  // 5. Verificar se está rodando
  console.log('\n=== Status ===');
  await exec(conn, 'pm2 status --no-color 2>&1');

  // 6. Testar o webhook com uma chamada de teste
  console.log('\n=== Testando webhook ===');
  await exec(conn, `curl -sk -X POST '${WEBHOOK_URL}' -H 'Content-Type: application/json' -d '{"amount":0.01,"period":"2026-04","source":"teste","description":"Teste de conexão NeuzaLanches"}' -w "\\nHTTP Status: %{http_code}\\n" -o /dev/null`);

  console.log('\n✅ Webhook configurado!');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
