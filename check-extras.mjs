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

    console.log('=== Lançamentos de Vendas que NÃO seguem padrão "Pedido #XXXXXX" ===');
    await exec(conn, `sqlite3 ${DB} -header -column "SELECT substr(id,1,8) id, ROUND(valor,2) valor, substr(data,1,10) data, substr(descricao,1,60) descricao, substr(obs,1,40) obs FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND descricao NOT LIKE 'Pedido #%';"`);

    console.log('\n\n=== Soma desses extras ===');
    await exec(conn, `sqlite3 ${DB} "SELECT COUNT(*), ROUND(SUM(valor),2) FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND descricao NOT LIKE 'Pedido #%';"`);

    console.log('\n\n=== Lançamentos previstos x realizados ===');
    await exec(conn, `sqlite3 ${DB} -header -column "SELECT status, tipo, cat, COUNT(*) qtd, ROUND(SUM(valor),2) total FROM lancamentos GROUP BY status, tipo, cat;"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
