import { Client } from 'ssh2';
function exec(conn, cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error(err.message); return resolve(''); }
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
    const DB = '/var/www/neuzalanches/fluxo-caixa.db';

    console.log('=== Total de pedidos por status ===');
    await exec(conn, `sqlite3 ${DB} "SELECT status, COUNT(*) as qtd, ROUND(SUM(total),2) as total FROM pedidos GROUP BY status ORDER BY qtd DESC;"`);

    console.log('\n\n=== Total geral de pedidos ===');
    await exec(conn, `sqlite3 ${DB} "SELECT COUNT(*) FROM pedidos;"`);

    console.log('\n\n=== Lançamentos atuais — tipo / cat / qtd / total ===');
    await exec(conn, `sqlite3 ${DB} -header -column "SELECT tipo, cat, COUNT(*) qtd, ROUND(SUM(valor),2) total FROM lancamentos GROUP BY tipo, cat ORDER BY tipo, cat;"`);

    console.log('\n\n=== Lançamentos automáticos de pedido (descricao começando com "Pedido #" ou "CMV — Pedido #") ===');
    await exec(conn, `sqlite3 ${DB} "SELECT COUNT(*) as qtd_lanc_pedido FROM lancamentos WHERE descricao LIKE 'Pedido #%' OR descricao LIKE 'CMV — Pedido #%';"`);

    console.log('\n\n=== Pedidos ENTREGUES sem lançamento de Vendas correspondente ===');
    await exec(conn, `sqlite3 ${DB} -header -column "
SELECT COUNT(*) AS pedidos_entregues_sem_lanc
FROM pedidos p
WHERE p.status = 'entregue'
  AND NOT EXISTS (
    SELECT 1 FROM lancamentos l
    WHERE l.descricao LIKE 'Pedido #' || substr(p.id,1,6) || '%'
      AND l.tipo = 'entrada'
  );"`);

    console.log('\n\n=== Pedidos ENTREGUES por mês ===');
    await exec(conn, `sqlite3 ${DB} -header -column "SELECT substr(created_at,1,7) AS mes, COUNT(*) qtd, ROUND(SUM(total),2) total FROM pedidos WHERE status='entregue' GROUP BY mes ORDER BY mes;"`);

    console.log('\n\n=== Amostra: 5 pedidos entregues recentes ===');
    await exec(conn, `sqlite3 ${DB} -header -column "SELECT substr(id,1,8) id, status, ROUND(total,2) total, substr(created_at,1,16) criado, cliente_nome FROM pedidos WHERE status='entregue' ORDER BY created_at DESC LIMIT 5;"`);

    console.log('\n\n=== Schema lancamentos ===');
    await exec(conn, `sqlite3 ${DB} ".schema lancamentos"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
