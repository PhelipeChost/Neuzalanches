# Nexus PDV — Desktop (Electron, offline-first)

Versão desktop da plataforma. Roda o **mesmo** servidor Express + SQLite localmente
(banco na pasta do usuário, funciona sem internet) e abre a interface numa janela.
Antes de iniciar, passa por um **gate de licença RS256** — sem licença válida, o
sistema não sobe (tela de bloqueio).

## Arquitetura

```
main.js (Electron)
 ├─ 1. GATE DE LICENÇA  (licenca/verificar.js)
 │     lê %APPDATA%/Nexus PDV/licenca.lic → verifica assinatura RS256 (chave pública
 │     embutida) → checa fingerprint (se o token amarrar) → exp + grace_days
 │        • ativo      → segue
 │        • tolerancia → segue + aviso "assinatura vencida"
 │        • bloqueado  → abre ui/bloqueio.html (colar licença / abrir .lic)
 ├─ 2. SERVIDOR LOCAL
 │     importa ../server/index.js com env:
 │        FLUXO_DB_PATH   = %APPDATA%/Nexus PDV/fluxo-caixa.db   (banco gravável)
 │        FLUXO_DIST_PATH = desktop/app-dist                     (frontend base "/")
 │        PORT            = 41730
 └─ 3. JANELA  → http://127.0.0.1:41730
```

A **chave privada** que assina as licenças fica **só no servidor da Nexus**. O app só
tem a **pública** (`licenca/chavePublica.js`) — não consegue forjar licença.

## Contrato de licença (implementado)

Token JWT **RS256**. Claims usados: `exp`, `fingerprint` (nullable), `grace_days`,
`cliente`, `plano`, `client_id`, `features`, `iat`. Ordem de validação:
1. `jwt.verify(..., { algorithms: ['RS256'], ignoreExpiration: true })` — assinatura
   obrigatória; `ignoreExpiration` só para aplicar o `grace_days` manualmente.
2. Se `fingerprint != null`, compara com o código desta máquina.
3. `exp`: `<= exp` = ativo · `exp < agora <= exp+grace` = tolerância · além = bloqueado.

Testes (18 casos, inclui ataques): `npm run test:licenca`.

## Rodar em desenvolvimento

Pré-requisitos: Node + o `node_modules` da pasta principal já instalado.

```bash
# 1. (na pasta principal) gerar o frontend do desktop (base = "/")
MSYS_NO_PATHCONV=1 npx vite build --base=/ --outDir desktop/app-dist --emptyOutDir

# 2. instalar Electron + ferramentas (baixa ~250 MB)
cd desktop
npm install

# 3. recompilar o better-sqlite3 para o ABI do Electron (IMPORTANTE — módulo nativo)
npm run rebuild

# 4. abrir o app
npm start
```

> **Módulo nativo:** o `better-sqlite3` é compilado para o Node do sistema. Para rodar
> sob Electron é preciso recompilá-lo (`npm run rebuild`, usa `@electron/rebuild`).
> No Windows isso exige as *Build Tools* do Visual Studio + Python (node-gyp).

## Gerar o instalador (.exe)

```bash
cd desktop
npm run dist        # electron-builder → dist-installer/NexusPDV-Setup-1.0.0.exe
```

Empacota o frontend (`app-dist`), o servidor (`../server`) e o `node_modules` como
recursos. Gera instalador NSIS com atalho na área de trabalho.

## Ativação no cliente

1. O cliente instala e abre → tela de bloqueio mostra o **fingerprint** da máquina.
2. Você (Nexus) gera a licença `.lic` no painel (amarrada ou não ao fingerprint).
3. Cliente cola a licença ou abre o `.lic` → app valida, salva e reinicia ativo.
4. Se a assinatura vencer e não for renovada, entra em tolerância e depois bloqueia
   sozinho — sem precisar de acesso à máquina.

## Auto-atualização

O app se atualiza sozinho (electron-updater). Ao abrir (e a cada 4h), ele consulta
`https://reinonexusideal.com.br/prototipocompleto/updates/latest.yml`; se houver
versão nova, baixa em segundo plano e instala quando o programa é fechado (ou na
hora, se o operador escolher "Reiniciar agora"). Não interrompe o caixa.

### Publicar uma atualização (fluxo do dono)

1. Edite `"version"` em `desktop/package.json` (ex.: `1.0.0` → `1.0.1`).
2. Na raiz do projeto, rode:
   ```bash
   node _publicar-atualizacao.mjs
   ```
   Isso builda o instalador e sobe 3 arquivos (`latest.yml`, o `.exe` e o
   `.blockmap`) para `/var/www/prototipocompleto/updates/` na VPS.
   - `--no-build` sobe o que já está em `dist-installer/` sem rebuildar.
3. Pronto. Todos os PDVs recebem a atualização sozinhos ao abrir.

Infra na VPS: `location /prototipocompleto/updates/` no nginx (`sites-enabled/nexo`)
com `alias /var/www/prototipocompleto/updates/` e `Cache-Control: no-cache`.

## Próximo passo (quando a Nexus expor os endpoints)

O contrato já prevê `POST /api/licenca/ativar` e `/heartbeat`. Quando o painel
publicar as URLs, dá para adicionar o **"ligar em casa"** automático (renova o token
sozinho + reporta atividade/versão) — hoje a ativação é por arquivo/colar, o que
já cobre o offline-first e o kill-switch por vencimento.
