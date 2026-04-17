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

  const DB = '/var/www/neuzalanches/fluxo-caixa.db';

  // List the orders to confirm
  console.log('=== Pedidos encontrados ===');
  await exec(conn, `sqlite3 ${DB} "SELECT id, cliente_nome, total, status, created_at FROM pedidos WHERE cliente_nome LIKE '%Josu%' OR cliente_nome LIKE '%Uli%' ORDER BY created_at;"`);

  // Delete related pedido_itens first
  console.log('\n=== Removendo itens dos pedidos ===');
  await exec(conn, `sqlite3 ${DB} "DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE cliente_nome LIKE '%Josu%' OR cliente_nome LIKE '%Uli%'); SELECT changes() || ' itens removidos';"`);

  // Delete the orders
  console.log('\n=== Removendo pedidos ===');
  await exec(conn, `sqlite3 ${DB} "DELETE FROM pedidos WHERE cliente_nome LIKE '%Josu%' OR cliente_nome LIKE '%Uli%'; SELECT changes() || ' pedidos removidos';"`);

  // Verify
  console.log('\n=== Verificando ===');
  await exec(conn, `sqlite3 ${DB} "SELECT COUNT(*) || ' pedidos restantes desses nomes' FROM pedidos WHERE cliente_nome LIKE '%Josu%' OR cliente_nome LIKE '%Uli%';"`);

  console.log('\n✅ Pronto!');
  conn.end();
});
conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
