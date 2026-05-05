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

    const script = `
const Database = require('/var/www/neuzalanches/node_modules/better-sqlite3');
const db = new Database('${DB}');

// ── 1. PEDIDOS entregues por DIA (BRT = UTC-3) ──
function brtDate(utcStr) {
  if (!utcStr) return '';
  const d = new Date(utcStr.replace(' ', 'T') + 'Z');
  d.setUTCHours(d.getUTCHours() - 3); // converte UTC pra BRT
  return d.toISOString().slice(0, 10);
}

const pedidos = db.prepare("SELECT id, total, created_at, status FROM pedidos WHERE status='entregue' AND deleted_at IS NULL").all();
const porDiaPedidos = {};
for (const p of pedidos) {
  const dia = brtDate(p.created_at);
  porDiaPedidos[dia] = (porDiaPedidos[dia] || 0) + p.total;
}

// ── 2. LANÇAMENTOS de Vendas por DIA (campo 'data') ──
const lancs = db.prepare("SELECT data, valor FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND deleted_at IS NULL").all();
const porDiaLanc = {};
for (const l of lancs) {
  const dia = (l.data || '').slice(0, 10);
  porDiaLanc[dia] = (porDiaLanc[dia] || 0) + l.valor;
}

// ── 3. Comparar dia-a-dia ──
const diasSet = new Set([...Object.keys(porDiaPedidos), ...Object.keys(porDiaLanc)]);
const dias = [...diasSet].sort();

console.log('=== Pedidos entregues (BRT) vs Lançamentos Vendas (campo data) ===');
console.log('dia        | pedidos    | lancamento | diff');
console.log('-----------|------------|------------|--------');
let totPed = 0, totLanc = 0;
for (const d of dias) {
  const p = porDiaPedidos[d] || 0;
  const l = porDiaLanc[d] || 0;
  totPed += p; totLanc += l;
  const diff = (l - p).toFixed(2).padStart(8);
  const flag = Math.abs(l - p) > 0.01 ? '  ⚠️' : '';
  console.log(\`\${d} | \${p.toFixed(2).padStart(10)} | \${l.toFixed(2).padStart(10)} | \${diff}\${flag}\`);
}
console.log('-----------|------------|------------|--------');
console.log(\`TOTAL      | \${totPed.toFixed(2).padStart(10)} | \${totLanc.toFixed(2).padStart(10)} | \${(totLanc-totPed).toFixed(2).padStart(8)}\`);

// ── 4. Resumo por mês BRT ──
console.log('\\n=== Por mês (BRT) ===');
const meses = {};
for (const p of pedidos) {
  const m = brtDate(p.created_at).slice(0, 7);
  meses[m] = meses[m] || { ped: 0, lanc: 0 };
  meses[m].ped += p.total;
}
for (const l of lancs) {
  const m = (l.data || '').slice(0, 7);
  meses[m] = meses[m] || { ped: 0, lanc: 0 };
  meses[m].lanc += l.valor;
}
console.log('mês     | pedidos    | lanc       | diff');
for (const m of Object.keys(meses).sort()) {
  const v = meses[m];
  console.log(\`\${m} | \${v.ped.toFixed(2).padStart(10)} | \${v.lanc.toFixed(2).padStart(10)} | \${(v.lanc - v.ped).toFixed(2).padStart(8)}\`);
}

// ── 5. Identificar lançamentos cuja DATA não bate com BRT do pedido ──
console.log('\\n=== Lançamentos com data DIVERGENTE do pedido (timezone bug) ===');
const lancsAuto = db.prepare("SELECT id, descricao, valor, data FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND descricao LIKE 'Pedido #%' AND deleted_at IS NULL").all();
let bugs = 0;
for (const l of lancsAuto) {
  const m = l.descricao.match(/^Pedido #([0-9a-f]{6})/);
  if (!m) continue;
  const idC = m[1];
  const ped = db.prepare("SELECT created_at, total FROM pedidos WHERE substr(id,1,6) = ? AND status='entregue'").get(idC);
  if (!ped) continue;
  const diaCorreto = brtDate(ped.created_at);
  const diaLanc = (l.data || '').slice(0, 10);
  if (diaCorreto !== diaLanc) {
    if (bugs < 30) console.log(\`  #\${idC} R$ \${l.valor.toFixed(2)} → lanc.data=\${diaLanc} mas BRT=\${diaCorreto} (UTC: \${ped.created_at.slice(0,16)})\`);
    bugs++;
  }
}
console.log(\`\\nTotal de lançamentos com data divergente: \${bugs}\`);

db.close();
`;

    const b64 = Buffer.from(script).toString('base64');
    await exec(conn, `echo '${b64}' | base64 -d > /tmp/investigar.cjs && node /tmp/investigar.cjs`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
