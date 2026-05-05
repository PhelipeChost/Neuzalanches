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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const conn = new Client();
conn.on('ready', async () => {
  try {
    const H = '-H "apikey: neuzalanches-secret-key-2024"';
    const URL = 'http://localhost:8080';
    const I = 'neuzalanches';

    console.log('=== 1. Estado atual ===');
    await exec(conn, `curl -s ${H} ${URL}/instance/connectionState/${I}`);

    console.log('\n\n=== 2. Restart PM2 neuzalanches (limpa Map ultimaSaudacao em memória) ===');
    await exec(conn, `pm2 restart neuzalanches`);

    console.log('\n\n=== 3. Limpando histórico de chats/mensagens/contatos do Evolution para a instância ===');
    // Detecta container Postgres do Evolution
    const dockerPs = await exec(conn, `docker ps --format '{{.Names}}' | grep -iE 'postgres|evolution' | head -5`);
    console.log('Containers candidatos:', dockerPs.split('\n').join(', '));

    // Tenta achar o postgres do evolution
    const pgContainer = (await exec(conn, `docker ps --format '{{.Names}}' | grep -iE 'postgres' | head -1`)).trim();
    if (pgContainer) {
      console.log(`\nUsando container Postgres: ${pgContainer}`);
      // Pega ID da instância
      console.log('\n--- ID da instância neuzalanches: ---');
      await exec(conn, `docker exec ${pgContainer} psql -U postgres -d evolution -tAc "SELECT id FROM \\"Instance\\" WHERE name='neuzalanches';"`);

      console.log('\n--- Contagem ANTES ---');
      await exec(conn, `docker exec ${pgContainer} psql -U postgres -d evolution -c "SELECT (SELECT COUNT(*) FROM \\"Message\\" m JOIN \\"Instance\\" i ON m.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS msgs, (SELECT COUNT(*) FROM \\"Chat\\" c JOIN \\"Instance\\" i ON c.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS chats, (SELECT COUNT(*) FROM \\"Contact\\" co JOIN \\"Instance\\" i ON co.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS contatos;"`);

      console.log('\n--- Limpando Message, Chat, Contact ---');
      await exec(conn, `docker exec ${pgContainer} psql -U postgres -d evolution -c "DELETE FROM \\"MessageUpdate\\" WHERE \\"instanceId\\"=(SELECT id FROM \\"Instance\\" WHERE name='neuzalanches'); DELETE FROM \\"Message\\" WHERE \\"instanceId\\"=(SELECT id FROM \\"Instance\\" WHERE name='neuzalanches'); DELETE FROM \\"Chat\\" WHERE \\"instanceId\\"=(SELECT id FROM \\"Instance\\" WHERE name='neuzalanches'); DELETE FROM \\"Contact\\" WHERE \\"instanceId\\"=(SELECT id FROM \\"Instance\\" WHERE name='neuzalanches');"`);

      console.log('\n--- Contagem DEPOIS ---');
      await exec(conn, `docker exec ${pgContainer} psql -U postgres -d evolution -c "SELECT (SELECT COUNT(*) FROM \\"Message\\" m JOIN \\"Instance\\" i ON m.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS msgs, (SELECT COUNT(*) FROM \\"Chat\\" c JOIN \\"Instance\\" i ON c.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS chats, (SELECT COUNT(*) FROM \\"Contact\\" co JOIN \\"Instance\\" i ON co.\\"instanceId\\"=i.id WHERE i.name='neuzalanches') AS contatos;"`);
    } else {
      console.log('Postgres do Evolution não encontrado — pulando limpeza de DB.');
    }

    console.log('\n\n=== 4. Estado final ===');
    await sleep(2000);
    await exec(conn, `curl -s ${H} ${URL}/instance/connectionState/${I}`);

    console.log('\n=== 5. PM2 status ===');
    await exec(conn, `pm2 list | grep neuzalanches`);

    console.log('\n\n=== PRONTO ===');
  } catch (e) { console.error('Erro:', e.message); }
  finally { conn.end(); }
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '177.153.62.21', port: 22, username: 'root', password: 'A@Xn8felipe', readyTimeout: 30000 });
