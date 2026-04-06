#!/bin/bash

# Script para configurar Nginx com SSL/HTTPS e proxy para Node.js

cat > /etc/nginx/sites-available/neuzalanches << 'EOL'
# Redirecionar HTTP para HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name neuzalanches.com.br www.neuzalanches.com.br;
    
    return 301 https://$server_name$request_uri;
}

# Configuração HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name neuzalanches.com.br www.neuzalanches.com.br;

    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/neuzalanches.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/neuzalanches.com.br/privkey.pem;

    # Configurações de segurança SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Headers de segurança
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy para a aplicação Node.js na porta 3001
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Compressão
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml application/atom+xml image/svg+xml;

    # Logs
    access_log /var/log/nginx/neuzalanches_access.log;
    error_log /var/log/nginx/neuzalanches_error.log;
}
EOL

# Remover configuração padrão se existir
rm -f /etc/nginx/sites-enabled/default

# Criar symlink
ln -sf /etc/nginx/sites-available/neuzalanches /etc/nginx/sites-enabled/neuzalanches

# Testar configuração
nginx -t

# Recarregar Nginx
systemctl reload nginx

echo "✅ Nginx configurado com SSL/HTTPS"
