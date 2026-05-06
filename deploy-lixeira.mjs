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

    console.log('\n\n=== pm2 restart neuzalanches (pra rodar migração deleted_at) ===');
    await exec(conn, `pm2 restart neuzalanches && pm2 list | grep neuzalanches`);

    console.log('\n\n=== Verificando schemas pós-migração ===');
    await exec(conn, `sqlite3 /var/www/neuzalanches/fluxo-caixa.db "SELECT name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%_deleted_at' ORDER BY name;"`);

    console.log('\n\n=== Resumo lixeira (deve estar tudo zerado, exceto se algo já tiver sido excluído) ===');
    await exec(conn, `sqlite3 /var/www/neuzalanches/fluxo-caixa.db "SELECT 'lancamentos' AS tabela, COUNT(*) AS na_lixeira FROM lancamentos WHERE deleted_at IS NOT NULL UNION ALL SELECT 'pedidos', COUNT(*) FROM pedidos WHERE deleted_at IS NOT NULL UNION ALL SELECT 'produtos', COUNT(*) FROM produtos WHERE deleted_at IS NOT NULL UNION ALL SELECT 'categorias', COUNT(*) FROM categorias WHERE deleted_at IS NOT NULL UNION ALL SELECT 'adicionais', COUNT(*) FROM adicionais WHERE deleted_at IS NOT NULL UNION ALL SELECT 'custos_fixos', COUNT(*) FROM custos_fixos WHERE deleted_at IS NOT NULL UNION ALL SELECT 'estoque_itens', COUNT(*) FROM estoque_itens WHERE deleted_at IS NOT NULL UNION ALL SELECT 'fornecedores', COUNT(*) FROM fornecedores WHERE deleted_at IS NOT NULL;"`);

    console.log('\n\n=== Health-check do server ===');
    await exec(conn, `sleep 2 && curl -s http://localhost:3003/api/lancamentos -H "Authorization: Bearer x" -o /dev/null -w "/api/lancamentos -> HTTP %{http_code}\\n"`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
