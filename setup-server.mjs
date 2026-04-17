import { Client } from 'ssh2';

const HOST = '145.223.31.205';
const USER = 'root';
const PASS = '31976hibridosF@';

function exec(conn, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${cmd}`);
    const timer = setTimeout(() => reject(new Error(`Timeout: ${cmd}`)), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let out = '', errOut = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { errOut += d; process.stderr.write(d); });
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out: out.trim(), code }); });
    });
  });
}

async function setup() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS });
  });
  console.log('Connected');

  // Check Node version
  await exec(conn, 'node -v');

  // Install PM2 globally
  console.log('\n=== Installing PM2 ===');
  await exec(conn, 'npm install -g pm2 2>&1 | tail -3', 180000);

  // Check if Nginx is installed
  const nginx = await exec(conn, 'nginx -v 2>&1 || echo "NGINX_MISSING"');
  if (nginx.out.includes('NGINX_MISSING')) {
    console.log('\n=== Installing Nginx ===');
    await exec(conn, 'apt-get update -qq && apt-get install -y nginx 2>&1 | tail -3', 180000);
  }

  // Configure Nginx
  console.log('\n=== Configuring Nginx ===');
  const nginxConf = `server {
    listen 80;
    server_name neuzalanches.com.br www.neuzalanches.com.br;

    root /var/www/neuzalanches/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /var/www/neuzalanches/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}`;

  await exec(conn, `cat > /etc/nginx/sites-available/neuzalanches << 'NGINX_EOF'
${nginxConf}
NGINX_EOF`);

  await exec(conn, 'ln -sf /etc/nginx/sites-available/neuzalanches /etc/nginx/sites-enabled/neuzalanches');
  await exec(conn, 'rm -f /etc/nginx/sites-enabled/default');
  await exec(conn, 'nginx -t 2>&1');
  await exec(conn, 'systemctl restart nginx');

  // Start app with PM2
  console.log('\n=== Starting app with PM2 ===');
  await exec(conn, 'pm2 kill 2>/dev/null; true');
  await exec(conn, 'cd /var/www/neuzalanches && NODE_ENV=production pm2 start server/index.js --name neuzalanches');
  await exec(conn, 'pm2 save');
  await exec(conn, 'pm2 startup systemd -u root --hp /root 2>&1 | tail -3');

  // Test
  console.log('\n=== Verifying ===');
  await exec(conn, 'sleep 2 && curl -s -o /dev/null -w "API: %{http_code}" http://localhost:3002/api/produtos && echo');
  await exec(conn, 'curl -s -o /dev/null -w "Nginx: %{http_code}" http://localhost/ && echo');
  await exec(conn, 'pm2 logs neuzalanches --lines 5 --nostream 2>&1');

  // SSL with Certbot
  console.log('\n=== Setting up SSL ===');
  const certbot = await exec(conn, 'certbot --version 2>&1 || echo "CERTBOT_MISSING"');
  if (certbot.out.includes('CERTBOT_MISSING')) {
    await exec(conn, 'apt-get install -y certbot python3-certbot-nginx 2>&1 | tail -3', 180000);
  }
  await exec(conn, 'certbot --nginx -d neuzalanches.com.br -d www.neuzalanches.com.br --non-interactive --agree-tos --email admin@neuzalanches.com.br --redirect 2>&1', 120000);

  console.log('\n✅ Setup complete! Site: https://neuzalanches.com.br');
  conn.end();
}

setup().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
