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

    console.log('=== Lançamentos de Vendas com ID curto duplicado ===');
    await exec(conn, `sqlite3 ${DB} -header -column "
SELECT
  substr(descricao, 9, 6) AS id_curto,
  COUNT(*) AS qtd,
  GROUP_CONCAT(round(valor,2),' / ') AS valores,
  GROUP_CONCAT(substr(data,1,10),' / ') AS datas
FROM lancamentos
WHERE descricao LIKE 'Pedido #%' AND tipo='entrada'
GROUP BY id_curto
HAVING COUNT(*) > 1
ORDER BY qtd DESC;"`);

    console.log('\n\n=== CMV com ID curto duplicado ===');
    await exec(conn, `sqlite3 ${DB} -header -column "
SELECT
  substr(descricao, 16, 6) AS id_curto,
  COUNT(*) AS qtd,
  GROUP_CONCAT(round(valor,2),' / ') AS valores
FROM lancamentos
WHERE descricao LIKE 'CMV — Pedido #%' AND tipo='saida'
GROUP BY id_curto
HAVING COUNT(*) > 1
ORDER BY qtd DESC;"`);

    console.log('\n\n=== Total atual vs total real dos pedidos entregues ===');
    await exec(conn, `sqlite3 ${DB} "SELECT 'Pedidos entregues (real)' AS tipo, ROUND(SUM(total),2) AS valor FROM pedidos WHERE status='entregue' UNION ALL SELECT 'Lancamentos Vendas atual', ROUND(SUM(valor),2) FROM lancamentos WHERE tipo='entrada' AND cat='Vendas';"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
