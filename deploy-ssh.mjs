import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const HOST = '145.223.31.205';
const USER = 'root';
const PASS = '31976hibridosF@';
const REMOTE_DIR = '/var/www/neuzalanches';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`  > ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { errOut += d; process.stderr.write(d); });
      stream.on('close', (code) => resolve({ out: out.trim(), err: errOut.trim(), code }));
    });
  });
}

function getSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
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

function getAllFiles(dir, base) {
  base = base || dir;
  let results = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) {
      results = results.concat(getAllFiles(full, base));
    } else {
      results.push({ local: full, rel: relative(base, full).replace(/\\/g, '/') });
    }
  }
  return results;
}

async function deploy() {
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
  });
  console.log('Connected to VPS');

  // Create directories
  await exec(conn, `mkdir -p ${REMOTE_DIR}/dist/assets ${REMOTE_DIR}/server/services`);

  // Get SFTP session
  const sftp = await getSftp(conn);
  console.log('SFTP session ready');

  // Upload server files
  console.log('\n--- Uploading server files ---');
  for (const f of ['server/index.js', 'server/database.js']) {
    const data = readFileSync(f);
    console.log(`  ${f} (${data.length} bytes)`);
    await sftpWrite(sftp, `${REMOTE_DIR}/${f}`, data);
  }

  // Upload server/services
  try {
    const svcFiles = getAllFiles('server/services');
    for (const { local, rel } of svcFiles) {
      const data = readFileSync(local);
      console.log(`  server/services/${rel} (${data.length} bytes)`);
      await sftpWrite(sftp, `${REMOTE_DIR}/server/services/${rel}`, data);
    }
  } catch (e) { console.log('  No server/services'); }

  // Upload package files
  console.log('\n--- Uploading package files ---');
  for (const f of ['package.json', 'package-lock.json']) {
    const data = readFileSync(f);
    console.log(`  ${f} (${data.length} bytes)`);
    await sftpWrite(sftp, `${REMOTE_DIR}/${f}`, data);
  }

  // Upload dist
  console.log('\n--- Uploading dist files ---');
  const distFiles = getAllFiles('dist');
  for (const { local, rel } of distFiles) {
    const dir = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/')) : '';
    if (dir) await exec(conn, `mkdir -p ${REMOTE_DIR}/dist/${dir}`);
    const data = readFileSync(local);
    console.log(`  dist/${rel} (${data.length} bytes)`);
    await sftpWrite(sftp, `${REMOTE_DIR}/dist/${rel}`, data);
  }

  // Upload public assets
  console.log('\n--- Uploading public assets ---');
  try {
    const publicFiles = getAllFiles('public');
    for (const { local, rel } of publicFiles) {
      const data = readFileSync(local);
      console.log(`  public/${rel} -> dist/${rel} (${data.length} bytes)`);
      await sftpWrite(sftp, `${REMOTE_DIR}/dist/${rel}`, data);
    }
  } catch (e) { console.log('  No public dir'); }

  sftp.end();

  // Install production dependencies
  console.log('\n--- Installing dependencies ---');
  await exec(conn, `cd ${REMOTE_DIR} && npm install --omit=dev 2>&1 | tail -5`);

  // Restart with PM2
  console.log('\n--- Restarting PM2 ---');
  const pm2Check = await exec(conn, `pm2 list --no-color 2>&1`);
  if (pm2Check.out.includes('neuzalanches')) {
    await exec(conn, `cd ${REMOTE_DIR} && pm2 restart neuzalanches --update-env`);
  } else {
    await exec(conn, `cd ${REMOTE_DIR} && pm2 start server/index.js --name neuzalanches`);
    await exec(conn, `pm2 save`);
  }

  // Verify
  console.log('\n--- Verifying ---');
  await exec(conn, `pm2 status neuzalanches --no-color`);
  await exec(conn, `sleep 2 && curl -s -o /dev/null -w "API status: %{http_code}" http://localhost:3001/api/produtos && echo`);

  console.log('\n✅ Deploy complete!');
  conn.end();
}

deploy().catch(err => { console.error('Deploy failed:', err); process.exit(1); });
