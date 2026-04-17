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

  // 1. Fix Nginx for SPA routing (/admin must serve index.html)
  console.log('=== Checking Nginx config ===');
  const nginxConf = await exec(conn, 'cat /etc/nginx/sites-available/neuzalanches 2>/dev/null || cat /etc/nginx/sites-enabled/neuzalanches 2>/dev/null || echo "NOT_FOUND"');

  if (nginxConf.includes('try_files')) {
    console.log('\ntry_files already configured — SPA routing OK');
  } else {
    console.log('\nAdding try_files for SPA routing...');
    // Add try_files to the location / block
    await exec(conn, `sed -i '/location \\/ {/,/}/ s|root .*;|root /var/www/neuzalanches/dist;\\n        try_files $uri $uri/ /index.html;|' /etc/nginx/sites-available/neuzalanches 2>/dev/null`);
    await exec(conn, 'nginx -t 2>&1 && nginx -s reload 2>&1');
  }

  // 2. Clean client records from database (keep admins)
  console.log('\n\n=== Cleaning client records ===');

  // List clients that will be removed
  console.log('Clients to remove:');
  await exec(conn, `cd /var/www/neuzalanches && node -e "
    import Database from 'better-sqlite3';
    const db = new Database('fluxo-caixa.db');
    const clientes = db.prepare(\"SELECT id, nome, email, telefone, tipo FROM usuarios WHERE tipo = 'cliente'\").all();
    console.log('Found ' + clientes.length + ' client records:');
    clientes.forEach(c => console.log('  - ' + c.nome + ' (' + (c.telefone || c.email || 'no contact') + ')'));

    // Delete client addresses first (FK)
    const clientIds = clientes.map(c => c.id);
    if (clientIds.length > 0) {
      const placeholders = clientIds.map(() => '?').join(',');
      const endDel = db.prepare('DELETE FROM enderecos WHERE cliente_id IN (' + placeholders + ')').run(...clientIds);
      console.log('Deleted ' + endDel.changes + ' addresses');

      // Delete clients
      const usDel = db.prepare('DELETE FROM usuarios WHERE tipo = \\'cliente\\'').run();
      console.log('Deleted ' + usDel.changes + ' client records');
    } else {
      console.log('No clients to delete');
    }

    // Verify
    const remaining = db.prepare(\"SELECT COUNT(*) as count FROM usuarios\").get();
    const admins = db.prepare(\"SELECT nome, email FROM usuarios WHERE tipo = 'admin'\").all();
    console.log('\\nRemaining users: ' + remaining.count);
    admins.forEach(a => console.log('  [ADMIN] ' + a.nome + ' (' + a.email + ')'));
    db.close();
  "`)

  // 3. Verify Nginx serves /admin correctly
  console.log('\n\n=== Testing routes ===');
  await exec(conn, `curl -s -o /dev/null -w "GET / -> %{http_code}\\n" https://neuzalanches.com.br/`);
  await exec(conn, `curl -s -o /dev/null -w "GET /admin -> %{http_code}\\n" https://neuzalanches.com.br/admin`);
  await exec(conn, `curl -s -o /dev/null -w "GET /api/produtos -> %{http_code}\\n" https://neuzalanches.com.br/api/produtos`);

  console.log('\n✅ Post-deploy complete!');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
