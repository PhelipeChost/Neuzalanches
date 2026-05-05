import { Client } from 'ssh2';

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  const nginxConfig = `server {
    server_name neuzalanches.com.br www.neuzalanches.com.br;

    root /var/www/neuzalanches/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /whatsapp {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /apostilas/ {
        alias /var/www/neuzalanches/apostilas/;
        expires 7d;
        add_header Cache-Control "public";
        add_header Content-Disposition "inline";
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

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/neuzalanches.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/neuzalanches.com.br/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = www.neuzalanches.com.br) {
        return 301 https://$host$request_uri;
    }

    if ($host = neuzalanches.com.br) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name neuzalanches.com.br www.neuzalanches.com.br;
    return 404;
}`;

  // Write config using Python to avoid shell escaping issues
  const pyCmd = `python3 -c "
import sys
config = sys.stdin.read()
with open('/etc/nginx/sites-enabled/neuzalanches', 'w') as f:
    f.write(config)
print('Written OK')
" << 'PYEOF'
${nginxConfig}
PYEOF`;

  console.log('=== Escrevendo nginx config ===');
  await exec(conn, pyCmd);

  console.log('\n=== Testando config ===');
  await exec(conn, 'nginx -t 2>&1');

  console.log('\n=== Recarregando nginx ===');
  await exec(conn, 'systemctl reload nginx 2>&1');

  console.log('\n=== Testando /whatsapp via https ===');
  await exec(conn, 'curl -sk https://neuzalanches.com.br/whatsapp | head -10 2>&1');

  console.log('\n✅ Nginx atualizado! Acesse: https://neuzalanches.com.br/whatsapp');
  conn.end();
});

conn.connect({ host: '145.223.31.205', port: 22, username: 'root', password: '31976hibridosF@' });
