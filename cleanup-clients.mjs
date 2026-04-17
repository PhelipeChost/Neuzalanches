import { Client } from 'ssh2';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

function sftpWrite(sftp, remotePath, data) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on('error', reject);
    ws.on('close', resolve);
    ws.end(data);
  });
}

const CLEANUP_SCRIPT = `
import Database from 'better-sqlite3';
const db = new Database('/var/www/neuzalanches/fluxo-caixa.db');

const clientes = db.prepare("SELECT id, nome, email, telefone FROM usuarios WHERE tipo = 'cliente'").all();
console.log("Found " + clientes.length + " client records:");
clientes.forEach(c => console.log("  - " + c.nome + " (" + (c.telefone || c.email || "no contact") + ")"));

if (clientes.length > 0) {
  const clientIds = clientes.map(c => c.id);
  const ph = clientIds.map(() => "?").join(",");

  // Nullify pedidos FK first
  const pedUpd = db.prepare("UPDATE pedidos SET cliente_id = NULL WHERE cliente_id IN (" + ph + ")").run(...clientIds);
  console.log("\\nNullified " + pedUpd.changes + " pedidos cliente_id");

  const endDel = db.prepare("DELETE FROM enderecos WHERE cliente_id IN (" + ph + ")").run(...clientIds);
  console.log("Deleted " + endDel.changes + " addresses");

  const usDel = db.prepare("DELETE FROM usuarios WHERE tipo = 'cliente'").run();
  console.log("Deleted " + usDel.changes + " client records");
}

const remaining = db.prepare("SELECT COUNT(*) as c FROM usuarios").get();
const admins = db.prepare("SELECT nome, email FROM usuarios WHERE tipo = 'admin'").all();
console.log("\\nRemaining users: " + remaining.c);
admins.forEach(a => console.log("  [ADMIN] " + a.nome + " (" + a.email + ")"));
db.close();
`;

const conn = new Client();
conn.on('ready', async () => {
  console.log('Connected\n');

  // Upload cleanup script
  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));
  await sftpWrite(sftp, '/var/www/neuzalanches/_cleanup.mjs', CLEANUP_SCRIPT);
  sftp.end();

  // Run it from the project dir (needs node_modules)
  await exec(conn, 'cd /var/www/neuzalanches && node _cleanup.mjs && rm _cleanup.mjs');

  console.log('\n✅ Client cleanup done!');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
