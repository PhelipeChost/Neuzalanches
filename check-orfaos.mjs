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

    console.log('=== Lançamentos de Vendas órfãos (pedido não existe mais OU não está entregue) ===');
    await exec(conn, `sqlite3 ${DB} -header -column "
SELECT substr(l.id,1,8) lanc_id, substr(l.descricao,9,6) ped_id_curto, ROUND(l.valor,2) valor, substr(l.data,1,10) data, substr(l.descricao,1,40) descricao
FROM lancamentos l
WHERE l.tipo='entrada' AND l.cat='Vendas' AND l.descricao LIKE 'Pedido #%'
  AND NOT EXISTS (
    SELECT 1 FROM pedidos p
    WHERE p.status='entregue'
      AND substr(p.id,1,6) = substr(l.descricao,9,6)
  );"`);

    console.log('\n\n=== CMV órfãos ===');
    await exec(conn, `sqlite3 ${DB} -header -column "
SELECT substr(l.id,1,8) lanc_id, substr(l.descricao,16,6) ped_id_curto, ROUND(l.valor,2) valor, substr(l.data,1,10) data
FROM lancamentos l
WHERE l.tipo='saida' AND l.cat='CMV' AND l.descricao LIKE 'CMV — Pedido #%'
  AND NOT EXISTS (
    SELECT 1 FROM pedidos p
    WHERE p.status='entregue'
      AND substr(p.id,1,6) = substr(l.descricao,16,6)
  );"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
