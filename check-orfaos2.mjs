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

// 1. Lista todos pedidos entregues e seus IDs curtos
const entregues = new Set(db.prepare("SELECT substr(id,1,6) AS c FROM pedidos WHERE status='entregue'").all().map(r => r.c));
console.log('Pedidos entregues:', entregues.size);

// 2. Lista lançamentos de Vendas e CMV automáticos, extrai ID curto e checa se é órfão
const vendas = db.prepare("SELECT id, descricao, valor, data FROM lancamentos WHERE tipo='entrada' AND cat='Vendas' AND descricao LIKE 'Pedido #%'").all();
const cmvs   = db.prepare("SELECT id, descricao, valor, data FROM lancamentos WHERE tipo='saida' AND cat='CMV' AND descricao LIKE 'CMV — Pedido #%'").all();

const reVenda = /^Pedido #([0-9a-f]{6})/;
const reCmv   = /^CMV — Pedido #([0-9a-f]{6})/;

const orfaosVendas = [];
const orfaosCmv = [];
const dupVendas = new Map(); // id_curto -> [lanc...]
const dupCmv = new Map();

for (const l of vendas) {
  const m = l.descricao.match(reVenda);
  if (!m) continue;
  const idC = m[1];
  if (!entregues.has(idC)) orfaosVendas.push({ ...l, idC });
  if (!dupVendas.has(idC)) dupVendas.set(idC, []);
  dupVendas.get(idC).push(l);
}
for (const l of cmvs) {
  const m = l.descricao.match(reCmv);
  if (!m) continue;
  const idC = m[1];
  if (!entregues.has(idC)) orfaosCmv.push({ ...l, idC });
  if (!dupCmv.has(idC)) dupCmv.set(idC, []);
  dupCmv.get(idC).push(l);
}

console.log('\\n=== ÓRFÃOS de Vendas (lanc existe mas pedido entregue não) ===');
console.log('total:', orfaosVendas.length);
orfaosVendas.forEach(o => console.log(\`  #\${o.idC}  R$ \${o.valor.toFixed(2)}  (\${o.data.slice(0,10)})  desc: \${o.descricao.slice(0,50)}\`));

console.log('\\n=== ÓRFÃOS de CMV ===');
console.log('total:', orfaosCmv.length);
orfaosCmv.forEach(o => console.log(\`  #\${o.idC}  R$ \${o.valor.toFixed(2)}  (\${o.data.slice(0,10)})\`));

console.log('\\n=== DUPLICATAS de Vendas (mesmo pedido com 2+ lançamentos) ===');
for (const [idC, arr] of dupVendas) {
  if (arr.length > 1) console.log(\`  #\${idC}  \${arr.length}x  valores: \${arr.map(a=>a.valor.toFixed(2)).join(' | ')}\`);
}

console.log('\\n=== DUPLICATAS de CMV ===');
for (const [idC, arr] of dupCmv) {
  if (arr.length > 1) console.log(\`  #\${idC}  \${arr.length}x  valores: \${arr.map(a=>a.valor.toFixed(2)).join(' | ')}\`);
}

console.log('\\n=== TOTAIS atuais (auto + manuais) ===');
const tot = db.prepare("SELECT tipo, cat, COUNT(*) qtd, ROUND(SUM(valor),2) total FROM lancamentos GROUP BY tipo, cat ORDER BY tipo, cat").all();
tot.forEach(r => console.log(\`  \${r.tipo.padEnd(8)} | \${(r.cat||'').padEnd(20)} | \${String(r.qtd).padStart(3)}x | R$ \${r.total.toFixed(2)}\`));

db.close();
`;

    const b64 = Buffer.from(script).toString('base64');
    await exec(conn, `echo '${b64}' | base64 -d > /tmp/check-orfaos.cjs && node /tmp/check-orfaos.cjs`);
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
