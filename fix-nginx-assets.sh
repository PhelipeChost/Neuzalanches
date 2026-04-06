#!/bin/bash

# Script para corrigir Nginx - servir assets corretamente

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

    # Root para Vite build
    root /var/www/neuzalanches/dist;

    # Rota raiz - servir index.html
    location = / {
        try_files /index.html =404;
        add_header Cache-Control "public, max-age=3600";
    }

    # Arquivos estáticos do frontend - servir diretamente com cache longo
    location ~* \.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot)$ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        expires 1y;
        access_log off;
    }

    # Pasta assets
    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        expires 1y;
    }

    # API - proxy para Node.js
    location /api/ {
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

    # SPA fallback - redirecionar para index.html para rotas React não encontradas
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=3600";
    }

    # Compressão
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml application/atom+xml image/svg+xml;
    gzip_min_length 1000;

    # Logs
    access_log /var/log/nginx/neuzalanches_access.log;
    error_log /var/log/nginx/neuzalanches_error.log;
}
EOL

echo "Testando configuração..."
nginx -t

if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo "✅ Nginx recarregado com sucesso"
else
    echo "❌ Erro na configuração"
    exit 1
fi
