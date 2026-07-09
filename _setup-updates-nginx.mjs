// Adiciona (com segurança) a location /prototipocompleto/updates/ ao nginx do
// servidor compartilhado e cria a pasta de updates. Faz backup, valida com
// `nginx -t` e só recarrega se passar — senão restaura o backup.
import { Client } from "ssh2";

const HOST = "177.153.62.21", USER = "root", PASS = "A@Xn8felipe";
// ATENÇÃO: sites-enabled/nexo é um ARQUIVO comum (não symlink) — é o que o nginx
// realmente carrega. Editar sites-available/nexo não tem efeito.
const F = "/etc/nginx/sites-enabled/nexo";

const script = `
set -e
F="${F}"
if grep -q "prototipocompleto/updates/" "$F"; then
  echo "LOCATION_JA_EXISTE"
else
  BK="$F.bak-updates-$(date +%s)"
  cp "$F" "$BK"
  echo "backup: $BK"
  awk '/^    location \\/prototipocompleto\\/assets\\/ \\{/ && !d {
    print "    location /prototipocompleto/updates/ {";
    print "        alias /var/www/prototipocompleto/updates/;";
    print "        add_header Cache-Control \\"no-cache\\";";
    print "        autoindex off;";
    print "    }";
    print "";
    d=1
  } { print }' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
  if nginx -t 2>&1; then
    systemctl reload nginx && echo "RELOAD_OK"
  else
    echo "NGINX_TEST_FALHOU_RESTAURANDO"
    cp "$BK" "$F"
    nginx -t 2>&1 && echo "restaurado_e_valido"
  fi
fi
mkdir -p /var/www/prototipocompleto/updates
chmod 755 /var/www/prototipocompleto/updates
echo "PASTA:"; ls -ld /var/www/prototipocompleto/updates
echo "TESTE_LOCATION:"; grep -A4 "prototipocompleto/updates/" "$F" | head -6
`;

const conn = new Client();
conn.on("ready", () => {
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on("data", d => process.stdout.write(d));
    stream.stderr.on("data", d => process.stderr.write(d));
    stream.on("close", () => conn.end());
  });
});
conn.on("error", e => { console.error("SSH:", e.message); process.exitCode = 1; });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000 });
