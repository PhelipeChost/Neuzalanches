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
    console.log('=== git pull ===');
    await exec(conn, `cd /var/www/neuzalanches && git pull`);

    console.log('\n\n=== npm build ===');
    await exec(conn, `cd /var/www/neuzalanches && npm run build 2>&1 | tail -8`);

    console.log('\n\n=== pm2 restart (rodar migração) ===');
    await exec(conn, `pm2 restart neuzalanches && sleep 2 && pm2 list | grep neuzalanches`);

    console.log('\n\n=== Verifica colunas novas em produtos ===');
    await exec(conn, `sqlite3 /var/www/neuzalanches/fluxo-caixa.db "PRAGMA table_info(produtos);" | grep -E 'promo|eh_promocao|preco_de'`);

    console.log('\n\n=== Verifica categoria Promoções ===');
    await exec(conn, `sqlite3 /var/www/neuzalanches/fluxo-caixa.db "SELECT id, nome, permite_adicionais, ordem FROM categorias WHERE nome = 'Promoções';"`);

    console.log('\n\n=== Health-check endpoint público ===');
    await exec(conn, `curl -s http://localhost:3003/api/promocoes/ativas -o /dev/null -w "/api/promocoes/ativas -> HTTP %{http_code}\\n"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
