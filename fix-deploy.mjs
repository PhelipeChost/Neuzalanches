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
  console.log('=== Corrigindo porta no .env do servidor ===');
  // Fix PORT to 3001 (production port) and add Evolution API vars
  await exec(conn, `cat > /var/www/neuzalanches/.env << 'EOF'
# Porta da API
PORT=3001

# NEXO — URL do webhook para reportar receitas (comissão automática)
NEXO_WEBHOOK_URL=https://reinonexusideal.com.br/api/public/webhook/bf17b496e73c3dc6e25fca5ef4ab161de103ae41

# Evolution API — WhatsApp
EVOLUTION_URL=http://145.223.31.205:8080
EVOLUTION_KEY=neuzalanches-secret-key-2024
EVOLUTION_INSTANCE=neuzalanches
EOF`);

  console.log('\n=== Parando neuzalanches-server (porta 3002 - desnecessário) ===');
  await exec(conn, 'pm2 delete neuzalanches-server 2>/dev/null; true');

  console.log('\n=== Reiniciando neuzalanches (porta 3001 - produção) ===');
  await exec(conn, 'pm2 restart neuzalanches --update-env 2>&1');

  console.log('\n=== Aguardando inicialização ===');
  await exec(conn, 'sleep 3');

  console.log('\n=== Atualizando nginx para incluir /whatsapp ===');
  // Read current config and add /whatsapp location block before /api/
  const nginxConf = await exec(conn, 'cat /etc/nginx/sites-enabled/neuzalanches');

  if (!nginxConf.includes('location /whatsapp')) {
    await exec(conn, `sed -i 's|    location /api/ {|    location /whatsapp {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n\n    location /api/ {|' /etc/nginx/sites-enabled/neuzalanches`);
    console.log('  ✓ Nginx config atualizado');
  } else {
    console.log('  ✓ Nginx já tem /whatsapp');
  }

  console.log('\n=== Testando config nginx ===');
  await exec(conn, 'nginx -t 2>&1');

  console.log('\n=== Recarregando nginx ===');
  await exec(conn, 'systemctl reload nginx 2>&1');

  console.log('\n=== Logs do servidor ===');
  await exec(conn, 'pm2 logs neuzalanches --lines 10 --nostream 2>&1');

  console.log('\n=== Testando /whatsapp via curl ===');
  const result = await exec(conn, 'curl -s http://localhost:3001/whatsapp | head -5 2>&1');
  console.log(result);

  console.log('\n✅ Pronto!');
  console.log('🌐 Acesse: https://neuzalanches.com.br/whatsapp');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
