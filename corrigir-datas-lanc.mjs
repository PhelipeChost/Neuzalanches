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

    console.log('=== Backup ===');
    await exec(conn, `cp ${DB} ${DB}.bkp-tz-$(date +%Y%m%d-%H%M%S) && ls -lh ${DB}.bkp-tz-*`);

    const script = `
const Database = require('/var/www/neuzalanches/node_modules/better-sqlite3');
const db = new Database('${DB}');

function brtDate(utcStr) {
  if (!utcStr) return null;
  const d = new Date(utcStr.replace(' ', 'T') + 'Z');
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString().slice(0, 10);
}

// Para cada lançamento auto de Vendas/CMV, recalcular data baseada no pedido
const updateData = db.prepare("UPDATE lancamentos SET data = ? WHERE id = ?");

let corrigidos = 0;
const tx = db.transaction(() => {
  // Vendas
  const vendas = db.prepare("SELECT id, descricao, data FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND descricao LIKE 'Pedido #%' AND deleted_at IS NULL").all();
  for (const l of vendas) {
    const m = l.descricao.match(/^Pedido #([0-9a-f]{6})/);
    if (!m) continue;
    const ped = db.prepare("SELECT created_at FROM pedidos WHERE substr(id,1,6) = ? AND status='entregue'").get(m[1]);
    if (!ped) continue;
    const certo = brtDate(ped.created_at);
    const atual = (l.data || '').slice(0, 10);
    if (certo && certo !== atual) {
      updateData.run(certo, l.id);
      corrigidos++;
    }
  }

  // CMV
  const cmvs = db.prepare("SELECT id, descricao, data FROM lancamentos WHERE tipo='saida' AND cat='CMV' AND descricao LIKE 'CMV — Pedido #%' AND deleted_at IS NULL").all();
  for (const l of cmvs) {
    const m = l.descricao.match(/^CMV — Pedido #([0-9a-f]{6})/);
    if (!m) continue;
    const ped = db.prepare("SELECT created_at FROM pedidos WHERE substr(id,1,6) = ? AND status='entregue'").get(m[1]);
    if (!ped) continue;
    const certo = brtDate(ped.created_at);
    const atual = (l.data || '').slice(0, 10);
    if (certo && certo !== atual) {
      updateData.run(certo, l.id);
      corrigidos++;
    }
  }
});
tx();

console.log('Lançamentos corrigidos:', corrigidos);

// Verificação pós-correção
console.log('\\n=== Comparação por mês após correção ===');
const pedidos = db.prepare("SELECT total, created_at FROM pedidos WHERE status='entregue' AND deleted_at IS NULL").all();
const lancs = db.prepare("SELECT data, valor FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND deleted_at IS NULL").all();
const meses = {};
for (const p of pedidos) {
  const m = brtDate(p.created_at).slice(0,7);
  meses[m] = meses[m] || { ped: 0, lanc: 0 };
  meses[m].ped += p.total;
}
for (const l of lancs) {
  const m = (l.data || '').slice(0,7);
  meses[m] = meses[m] || { ped: 0, lanc: 0 };
  meses[m].lanc += l.valor;
}
console.log('mês     | pedidos    | lanc       | diff');
for (const m of Object.keys(meses).sort()) {
  const v = meses[m];
  console.log(\`\${m} | \${v.ped.toFixed(2).padStart(10)} | \${v.lanc.toFixed(2).padStart(10)} | \${(v.lanc - v.ped).toFixed(2).padStart(8)}\`);
}

console.log('\\n=== Comparação por dia após correção ===');
const porDiaP = {}, porDiaL = {};
for (const p of pedidos) { const d=brtDate(p.created_at); porDiaP[d] = (porDiaP[d]||0) + p.total; }
for (const l of lancs)   { const d=(l.data||'').slice(0,10); porDiaL[d] = (porDiaL[d]||0) + l.valor; }
const dias = [...new Set([...Object.keys(porDiaP), ...Object.keys(porDiaL)])].sort();
console.log('dia        | pedidos    | lanc       | diff');
for (const d of dias) {
  const p = porDiaP[d]||0, l = porDiaL[d]||0;
  const flag = Math.abs(l - p) > 0.01 ? '  ⚠️' : '';
  console.log(\`\${d} | \${p.toFixed(2).padStart(10)} | \${l.toFixed(2).padStart(10)} | \${(l-p).toFixed(2).padStart(8)}\${flag}\`);
}

db.close();
`;

    const b64 = Buffer.from(script).toString('base64');
    console.log('\n\n=== Executando correção ===');
    await exec(conn, `echo '${b64}' | base64 -d > /tmp/fix-tz.cjs && node /tmp/fix-tz.cjs`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 60000 });
