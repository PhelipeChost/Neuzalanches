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

    // Script Node embarcado na VPS — usa better-sqlite3 já presente em node_modules
    const script = `
const Database = require('/var/www/neuzalanches/node_modules/better-sqlite3');
const crypto   = require('crypto');
const db = new Database('${DB}');
db.pragma('foreign_keys = ON');

function gerarId() { return crypto.randomBytes(12).toString('hex'); }

const pedidos = db.prepare(\`
  SELECT id, total, cliente_nome, tipo, created_at
  FROM pedidos
  WHERE status = 'entregue'
  ORDER BY created_at ASC
\`).all();

const buscarItens = db.prepare(\`
  SELECT produto_id, quantidade, custo_unitario, adicionais
  FROM pedido_itens
  WHERE pedido_id = ?
\`);

const insLanc = db.prepare(\`
  INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs)
  VALUES (?, ?, ?, ?, ?, ?, 'realizado', ?)
\`);

let restVendas = 0, restCmv = 0, semCmv = 0;
const exemplos = [];

const tx = db.transaction(() => {
  for (const p of pedidos) {
    const idCurto = p.id.slice(0, 6);
    const dataIso = (p.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const nome = p.cliente_nome || 'Cliente';

    // ── Vendas ──
    const lancVenda = db.prepare(\`
      SELECT 1 FROM lancamentos
      WHERE tipo='entrada' AND cat='Vendas'
        AND descricao LIKE 'Pedido #' || ? || '%'
    \`).get(idCurto);

    if (!lancVenda) {
      insLanc.run(
        gerarId(),
        'entrada',
        \`Pedido #\${idCurto} — \${nome}\`,
        p.total,
        dataIso,
        'Vendas',
        \`Pedido \${p.tipo} entregue (restauração automática)\`
      );
      restVendas++;
      if (exemplos.length < 8) exemplos.push(\`+ VENDA  #\${idCurto} R$ \${p.total.toFixed(2)} (\${dataIso}) \${nome}\`);
    }

    // ── CMV ──
    const lancCmv = db.prepare(\`
      SELECT 1 FROM lancamentos
      WHERE tipo='saida' AND cat='CMV'
        AND descricao LIKE 'CMV — Pedido #' || ? || '%'
    \`).get(idCurto);

    if (!lancCmv) {
      const itens = buscarItens.all(p.id);
      let cmv = 0;
      for (const it of itens) {
        cmv += (Number(it.custo_unitario) || 0) * (Number(it.quantidade) || 0);
      }
      if (cmv > 0) {
        insLanc.run(
          gerarId(),
          'saida',
          \`CMV — Pedido #\${idCurto} — \${nome}\`,
          cmv,
          dataIso,
          'CMV',
          \`Custo de produção do pedido \${p.tipo} (restauração automática)\`
        );
        restCmv++;
        if (exemplos.length < 16) exemplos.push(\`+ CMV    #\${idCurto} R$ \${cmv.toFixed(2)} (\${dataIso})\`);
      } else {
        semCmv++;
      }
    }
  }
});
tx();

console.log('=== Resultado da restauração ===');
console.log('Pedidos entregues processados:', pedidos.length);
console.log('Lançamentos VENDAS criados:', restVendas);
console.log('Lançamentos CMV criados:', restCmv);
console.log('Pedidos sem CMV calculável (itens sem custo):', semCmv);
console.log();
console.log('Exemplos:');
exemplos.forEach(e => console.log('  ' + e));
console.log();

// Resumo final
const resumo = db.prepare(\`
  SELECT tipo, cat, COUNT(*) qtd, ROUND(SUM(valor),2) total
  FROM lancamentos GROUP BY tipo, cat ORDER BY tipo, cat
\`).all();
console.log('=== Estado FINAL dos lançamentos ===');
for (const r of resumo) console.log(\`  \${r.tipo.padEnd(8)} | \${(r.cat||'').padEnd(20)} | \${String(r.qtd).padStart(3)}x | R$ \${(r.total||0).toFixed(2)}\`);

db.close();
`;

    // Faz backup do DB antes
    console.log('=== 1. Backup do banco ===');
    await exec(conn, `cp /var/www/neuzalanches/fluxo-caixa.db /var/www/neuzalanches/fluxo-caixa.db.bkp-$(date +%Y%m%d-%H%M%S) && ls -lh /var/www/neuzalanches/fluxo-caixa.db.bkp-*`);

    // Salva o script no servidor e executa
    console.log('\n\n=== 2. Executando restauração ===');
    const b64 = Buffer.from(script).toString('base64');
    await exec(conn, `echo '${b64}' | base64 -d > /tmp/restaurar-financeiro.cjs && node /tmp/restaurar-financeiro.cjs`);

  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 60000 });
