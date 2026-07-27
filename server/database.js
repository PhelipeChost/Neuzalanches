import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import forge from "node-forge";
import { randomBytes, createCipheriv, createDecipheriv, createHash, createSign, X509Certificate } from "crypto";
import { request as httpsRequest } from "https";
import tls from "tls";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Caminho do banco: configurável por env (o app desktop aponta para uma pasta
// gravável do usuário — %APPDATA%). Default = comportamento do servidor web.
const DB_PATH = process.env.FLUXO_DB_PATH || join(__dirname, "..", "fluxo-caixa.db");

const db = new Database(DB_PATH);

// ─── BACKUP ──────────────────────────────────────────────────────────────────
// db.backup() do better-sqlite3 é seguro com WAL (snapshot consistente).
export function caminhoBanco() { return DB_PATH; }
export function backupBanco(destinoArquivo) { return db.backup(destinoArquivo); }

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── CONFIGURAÇÃO FISCAL / NFC-e (linha única) ───────────────────────────────
// Guarda a identidade fiscal do estabelecimento + o certificado A1 (criptografado).
// O motor de emissão (provedor ou direto) pluga aqui em agosto, quando o layout
// IBS/CBS entrar em produção. Ver seção "Fiscal / NFC-e" em Configurações.
db.exec(`
  CREATE TABLE IF NOT EXISTS fiscal_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nfce_habilitado INTEGER DEFAULT 0,
    ambiente TEXT DEFAULT 'homologacao',       -- homologacao | producao
    -- identidade fiscal
    cnpj TEXT DEFAULT '',
    razao_social TEXT DEFAULT '',
    nome_fantasia TEXT DEFAULT '',
    inscricao_estadual TEXT DEFAULT '',
    regime_tributario TEXT DEFAULT 'simples',  -- simples | mei | normal
    -- endereço fiscal
    cep TEXT DEFAULT '',
    logradouro TEXT DEFAULT '',
    numero TEXT DEFAULT '',
    bairro TEXT DEFAULT '',
    municipio TEXT DEFAULT '',
    codigo_municipio TEXT DEFAULT '',          -- código IBGE (7 dígitos)
    uf TEXT DEFAULT '',
    -- NFC-e
    csc TEXT DEFAULT '',                        -- guardado criptografado (enc:...)
    csc_id TEXT DEFAULT '',
    serie TEXT DEFAULT '1',
    proximo_numero INTEGER DEFAULT 1,
    -- provedor de API fiscal (linkado depois)
    provedor TEXT DEFAULT 'nenhum',            -- nenhum | focus | plugnotas | nfeio | webmania
    provedor_token TEXT DEFAULT '',            -- guardado criptografado (enc:...)
    -- certificado A1
    cert_nome_arquivo TEXT DEFAULT '',
    cert_data TEXT DEFAULT '',                  -- .pfx em base64, criptografado (enc:...)
    cert_senha TEXT DEFAULT '',                 -- criptografada (enc:...)
    cert_cnpj TEXT DEFAULT '',                  -- extraído do certificado
    cert_titular TEXT DEFAULT '',              -- CN do certificado
    cert_validade_fim TEXT DEFAULT '',         -- ISO date
    cert_atualizado_em TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO fiscal_config (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS nfce_emitidas (
    id TEXT PRIMARY KEY,
    pedido_id TEXT DEFAULT NULL,
    numero INTEGER NOT NULL,
    serie TEXT NOT NULL,
    modelo TEXT DEFAULT '65',
    ambiente TEXT DEFAULT 'homologacao',
    chave TEXT DEFAULT '',
    status TEXT DEFAULT 'simulada',          -- simulada | autorizada | rejeitada | cancelada | erro
    protocolo TEXT DEFAULT '',
    motivo TEXT DEFAULT '',
    valor_total REAL DEFAULT 0,
    qr_code_url TEXT DEFAULT '',
    provedor TEXT DEFAULT 'nenhum',
    payload_json TEXT DEFAULT '',            -- payload "natural" enviado ao provedor
    retorno_json TEXT DEFAULT '',            -- resposta bruta do provedor (quando real)
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── CRIAR TABELAS ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    senha TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'cliente' CHECK(tipo IN ('admin', 'cliente')),
    telefone TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_emails (
    email TEXT PRIMARY KEY,
    adicionado_por TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lancamentos (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada', 'saida')),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    data TEXT NOT NULL,
    cat TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('realizado', 'previsto')),
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nome TEXT UNIQUE NOT NULL,
    permite_adicionais INTEGER DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cardapios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    icone TEXT DEFAULT '📋',
    cor TEXT DEFAULT '#15803d',
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cardapio_categorias (
    cardapio_id TEXT NOT NULL,
    categoria_id TEXT NOT NULL,
    PRIMARY KEY (cardapio_id, categoria_id),
    FOREIGN KEY (cardapio_id) REFERENCES cardapios(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cardapio_adicionais (
    cardapio_id TEXT NOT NULL,
    adicional_id TEXT NOT NULL,
    PRIMARY KEY (cardapio_id, adicional_id),
    FOREIGN KEY (cardapio_id) REFERENCES cardapios(id) ON DELETE CASCADE,
    FOREIGN KEY (adicional_id) REFERENCES adicionais(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS adicionais (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    custo REAL NOT NULL DEFAULT 0,
    disponivel INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    preco REAL NOT NULL,
    custo REAL NOT NULL DEFAULT 0,
    categoria TEXT DEFAULT '',
    imagem TEXT DEFAULT '',
    disponivel INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enderecos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    cep TEXT DEFAULT '',
    rua TEXT DEFAULT '',
    numero TEXT DEFAULT '',
    bairro TEXT DEFAULT '',
    referencia TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT,
    cliente_nome TEXT DEFAULT '',
    cliente_telefone TEXT DEFAULT '',
    cliente_email TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'confirmado', 'preparando', 'pronto', 'aguardando_confirmacao', 'entregue', 'cancelado')),
    total REAL NOT NULL DEFAULT 0,
    obs TEXT DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'online' CHECK(tipo IN ('online', 'presencial')),
    metodo_pagamento TEXT DEFAULT '',
    troco_para REAL DEFAULT NULL,
    tipo_entrega TEXT DEFAULT 'entrega' CHECK(tipo_entrega IN ('entrega','retirada','casa')),
    endereco_cep TEXT DEFAULT '',
    endereco_rua TEXT DEFAULT '',
    endereco_numero TEXT DEFAULT '',
    endereco_bairro TEXT DEFAULT '',
    endereco_referencia TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_itens (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL,
    produto_id TEXT NOT NULL,
    produto_nome TEXT NOT NULL,
    quantidade REAL NOT NULL DEFAULT 1,
    preco_unitario REAL NOT NULL,
    custo_unitario REAL NOT NULL DEFAULT 0,
    adicionais TEXT DEFAULT '[]',
    por_peso INTEGER NOT NULL DEFAULT 0,
    peso_desejado_kg REAL DEFAULT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custos_fixos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    valor REAL NOT NULL DEFAULT 0,
    categoria TEXT NOT NULL DEFAULT 'Outros',
    ativo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insumos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'un',
    preco_unitario REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS produto_insumos (
    id TEXT PRIMARY KEY,
    produto_id TEXT NOT NULL,
    insumo_id TEXT NOT NULL,
    quantidade REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE,
    UNIQUE(produto_id, insumo_id)
  );

  CREATE TABLE IF NOT EXISTS produto_imagens (
    id TEXT PRIMARY KEY,
    produto_id TEXT NOT NULL,
    imagem TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS estoque_categorias (
    id TEXT PRIMARY KEY,
    nome TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fornecedores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    telefone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS estoque_itens (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'un',
    categoria_id TEXT DEFAULT NULL,
    fornecedor_id TEXT DEFAULT NULL,
    saldo_atual REAL NOT NULL DEFAULT 0,
    custo_medio REAL NOT NULL DEFAULT 0,
    estoque_minimo REAL DEFAULT 0,
    estoque_maximo REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (categoria_id) REFERENCES estoque_categorias(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  CREATE TABLE IF NOT EXISTS estoque_entradas (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    quantidade REAL NOT NULL,
    custo_unitario REAL NOT NULL DEFAULT 0,
    fornecedor_id TEXT DEFAULT NULL,
    data TEXT NOT NULL,
    nf TEXT DEFAULT '',
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES estoque_itens(id),
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );

  CREATE TABLE IF NOT EXISTS estoque_saidas (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    quantidade REAL NOT NULL,
    motivo TEXT DEFAULT 'consumo',
    data TEXT NOT NULL,
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES estoque_itens(id)
  );

  CREATE TABLE IF NOT EXISTS estoque_ajustes (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    saldo_anterior REAL NOT NULL,
    saldo_novo REAL NOT NULL,
    motivo TEXT DEFAULT '',
    data TEXT NOT NULL,
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES estoque_itens(id)
  );

  CREATE TABLE IF NOT EXISTS visitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Trilha de impressão da cozinha (relatório do Suporte).
  -- Um pedido pode ter várias linhas (tentativa 1 falhou / tentativa 2 OK).
  CREATE TABLE IF NOT EXISTS impressao_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id TEXT,
    status TEXT NOT NULL,       -- ok | erro | enfileirado
    modo TEXT,                  -- agente | usb | manual | auto
    impressora TEXT,            -- nome/porta reportado pelo agente
    tentativa INTEGER DEFAULT 1,
    bytes INTEGER DEFAULT 0,    -- tamanho do payload ESC/POS
    erro TEXT,                  -- mensagem quando status = erro
    detalhes TEXT,              -- JSON extra (opcional)
    origem TEXT,                -- "cozinha-auto" | "cozinha-manual" | "suporte"
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_impressao_eventos_pedido ON impressao_eventos(pedido_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_impressao_eventos_created ON impressao_eventos(created_at DESC)`);

// Inserir saldo inicial padrão se não existir
const existeConfig = db.prepare("SELECT 1 FROM config WHERE key = 'saldo_inicial'").get();
if (!existeConfig) {
  db.prepare("INSERT INTO config (key, value) VALUES ('saldo_inicial', '0')").run();
}

// ─── MIGRAÇÃO: colunas de funcionário em admin_emails ────────────────────────
// nome, senha_hash (opcional — dono define senha do funcionário) e setores
// (JSON array com os setores permitidos; ausente/null = todos).
{
  const colsAE = db.prepare("PRAGMA table_info(admin_emails)").all().map(c => c.name);
  if (!colsAE.includes("nome"))       db.exec("ALTER TABLE admin_emails ADD COLUMN nome TEXT DEFAULT ''");
  if (!colsAE.includes("senha_hash")) db.exec("ALTER TABLE admin_emails ADD COLUMN senha_hash TEXT DEFAULT NULL");
  if (!colsAE.includes("setores"))    db.exec("ALTER TABLE admin_emails ADD COLUMN setores TEXT DEFAULT NULL");
}

// ─── MIGRAÇÃO: custos_fixos ganham tipo (fixo|variavel) + diaria + qtd ───────
// Custo variável: total = diaria * qtd no mês. Cobre garçom diarista, freelancer etc.
{
  const colsCF = db.prepare("PRAGMA table_info(custos_fixos)").all().map(c => c.name);
  if (!colsCF.includes("tipo"))      db.exec("ALTER TABLE custos_fixos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'fixo'");
  if (!colsCF.includes("diaria"))    db.exec("ALTER TABLE custos_fixos ADD COLUMN diaria REAL DEFAULT 0");
  if (!colsCF.includes("qtd"))       db.exec("ALTER TABLE custos_fixos ADD COLUMN qtd REAL DEFAULT 0");
}

// ─── MIGRAÇÃO: categorias_financeiro (separadas das categorias de produto) ───
db.exec(`
  CREATE TABLE IF NOT EXISTS categorias_financeiro (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cor TEXT DEFAULT '#78716c',
    tipo TEXT NOT NULL DEFAULT 'ambos' CHECK(tipo IN ('entrada','saida','ambos')),
    arquivada INTEGER DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Seed inicial de categorias se vazio
{
  const count = db.prepare("SELECT COUNT(*) AS c FROM categorias_financeiro").get().c;
  if (count === 0) {
    const seed = [
      { nome: "Vendas",        cor: "#15A056", tipo: "entrada" },
      { nome: "Investimento",  cor: "#2D6FE8", tipo: "entrada" },
      { nome: "Empréstimo",    cor: "#7C5CFC", tipo: "ambos"   },
      { nome: "Fornecedores",  cor: "#F2741A", tipo: "saida"   },
      { nome: "Folha",         cor: "#7C5CFC", tipo: "saida"   },
      { nome: "Aluguel",       cor: "#2D6FE8", tipo: "saida"   },
      { nome: "Impostos",      cor: "#E03B3B", tipo: "saida"   },
      { nome: "Marketing",     cor: "#E879A6", tipo: "saida"   },
      { nome: "Outros",        cor: "#78716c", tipo: "ambos"   },
    ];
    const ins = db.prepare("INSERT INTO categorias_financeiro (id, nome, cor, tipo, ordem) VALUES (?, ?, ?, ?, ?)");
    seed.forEach((c, i) => ins.run(randomBytes(6).toString("hex"), c.nome, c.cor, c.tipo, i));
  }
}

// ─── MIGRAÇÃO: lancamentos ganham tipo_lancamento + parent_id + juros_pct ────
// tipo_lancamento: 'simples' | 'emprestimo' | 'parcela' (parcela tem parent_id apontando para um lançamento pai do tipo emprestimo)
{
  const colsL = db.prepare("PRAGMA table_info(lancamentos)").all().map(c => c.name);
  if (!colsL.includes("tipo_lancamento")) db.exec("ALTER TABLE lancamentos ADD COLUMN tipo_lancamento TEXT NOT NULL DEFAULT 'simples'");
  if (!colsL.includes("parent_id"))       db.exec("ALTER TABLE lancamentos ADD COLUMN parent_id TEXT DEFAULT NULL");
  if (!colsL.includes("juros_pct"))       db.exec("ALTER TABLE lancamentos ADD COLUMN juros_pct REAL DEFAULT 0");
  if (!colsL.includes("parcela_n"))       db.exec("ALTER TABLE lancamentos ADD COLUMN parcela_n INTEGER DEFAULT 0");
  if (!colsL.includes("parcela_total"))   db.exec("ALTER TABLE lancamentos ADD COLUMN parcela_total INTEGER DEFAULT 0");
}

// ─── MIGRAÇÃO: adicionais ganham max_quantidade + categoria_id ───────────────
// max_quantidade: 0 = sem limite. categoria_id: NULL = aparece em todas as
// categorias de produto (compatível com o que já existia).
{
  const colsAd = db.prepare("PRAGMA table_info(adicionais)").all().map(c => c.name);
  if (!colsAd.includes("max_quantidade")) db.exec("ALTER TABLE adicionais ADD COLUMN max_quantidade INTEGER DEFAULT 0");
  if (!colsAd.includes("categoria_id"))   db.exec("ALTER TABLE adicionais ADD COLUMN categoria_id TEXT DEFAULT NULL");
  // Multi-categorias (JSON array de category ids). Substitui o categoria_id
  // solo: o operador marca quais categorias de produto podem usar o adicional.
  // Se NULL, cai no legacy `categoria_id` (que continua funcionando pra quem
  // ainda tem o modelo antigo). Se preenchido e vazio (`"[]"`), NÃO aparece em
  // nenhuma categoria — solução pro "bebida entrando no meio de comida" que
  // acontecia quando o cliente deixava "todas as categorias" por engano.
  if (!colsAd.includes("categorias_ids")) db.exec("ALTER TABLE adicionais ADD COLUMN categorias_ids TEXT DEFAULT NULL");
}

// ─── MIGRAÇÃO: cardapios ganha imagem (foto para tela de seleção) ────────────
{
  const colsCard = db.prepare("PRAGMA table_info(cardapios)").all().map(c => c.name);
  if (!colsCard.includes("imagem")) db.exec("ALTER TABLE cardapios ADD COLUMN imagem TEXT DEFAULT ''");
}

// ─── MIGRAÇÃO: segmentos por cardápio (multiestabelecimento) ─────────────────
// cardapios.tipo   = establishment_type (snack_bar, pizzeria, acai_shop…)
// cardapios.config = JSON por segmento (bordas, regra de preço meio a meio,
//                    complementos inclusos…)
// produtos.config  = JSON por produto (tamanhos com preço próprio…)
{
  const colsCard = db.prepare("PRAGMA table_info(cardapios)").all().map(c => c.name);
  if (!colsCard.includes("tipo"))   db.exec("ALTER TABLE cardapios ADD COLUMN tipo TEXT DEFAULT 'snack_bar'");
  if (!colsCard.includes("config")) db.exec("ALTER TABLE cardapios ADD COLUMN config TEXT DEFAULT '{}'");
  const colsProd = db.prepare("PRAGMA table_info(produtos)").all().map(c => c.name);
  if (!colsProd.includes("config")) db.exec("ALTER TABLE produtos ADD COLUMN config TEXT DEFAULT '{}'");
}

// ─── MIGRAÇÃO: campos fiscais no produto + tipo no estoque_item ──────────────
// NCM/CEST/UM permitem NFC-e correta por produto (não hardcode). codigo_barras
// = GTIN/EAN do leitor. pertence_estoque=1 cria/atualiza um estoque_item de
// revenda espelhado por código. tipo no estoque_item separa revenda × insumo ×
// interno (uso do estabelecimento — sacolas, papel, etc.).
{
  const cp = db.prepare("PRAGMA table_info(produtos)").all().map(c => c.name);
  if (!cp.includes("codigo_barras"))    db.exec("ALTER TABLE produtos ADD COLUMN codigo_barras TEXT DEFAULT ''");
  if (!cp.includes("ncm"))              db.exec("ALTER TABLE produtos ADD COLUMN ncm TEXT DEFAULT ''");
  if (!cp.includes("cest"))             db.exec("ALTER TABLE produtos ADD COLUMN cest TEXT DEFAULT ''");
  if (!cp.includes("um"))               db.exec("ALTER TABLE produtos ADD COLUMN um TEXT DEFAULT 'un'");
  if (!cp.includes("pertence_estoque")) db.exec("ALTER TABLE produtos ADD COLUMN pertence_estoque INTEGER DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras)");
  const ei = db.prepare("PRAGMA table_info(estoque_itens)").all().map(c => c.name);
  if (!ei.includes("tipo")) {
    db.exec("ALTER TABLE estoque_itens ADD COLUMN tipo TEXT DEFAULT 'revenda'");
    // Migra o legado: itens marcados como insumo (eh_insumo=1) viram tipo='insumo'.
    // Os demais continuam como 'revenda' (default). 'interno' é escolhido manualmente.
    if (ei.includes("eh_insumo")) {
      db.exec("UPDATE estoque_itens SET tipo = CASE WHEN eh_insumo = 1 THEN 'insumo' ELSE 'revenda' END WHERE tipo IS NULL OR tipo = 'revenda'");
    }
  }
  // Mesmos campos fiscais/cadastrais do produto, espelhados no item de estoque
  // (preenchidos automaticamente por sincronizarEspelhoEstoqueDoProduto para
  // itens de revenda; editáveis manualmente para insumo/interno).
  if (!ei.includes("codigo_barras")) db.exec("ALTER TABLE estoque_itens ADD COLUMN codigo_barras TEXT DEFAULT ''");
  if (!ei.includes("ncm"))           db.exec("ALTER TABLE estoque_itens ADD COLUMN ncm TEXT DEFAULT ''");
  if (!ei.includes("cest"))          db.exec("ALTER TABLE estoque_itens ADD COLUMN cest TEXT DEFAULT ''");
  if (!ei.includes("descricao"))     db.exec("ALTER TABLE estoque_itens ADD COLUMN descricao TEXT DEFAULT ''");
  if (!ei.includes("preco_venda"))   db.exec("ALTER TABLE estoque_itens ADD COLUMN preco_venda REAL DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS idx_estoque_itens_codigo_barras ON estoque_itens(codigo_barras)");

  // Emissão de NFC-e passa a ser opcional por venda: o caixa decide no balcão
  // (padrão ligado) e o cliente decide no cardápio (padrão desligado — opt-in).
  // cliente_cpf permite pedir a nota com CPF (Nota Fiscal Paulista).
  const cp2 = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
  if (!cp2.includes("emitir_nfce")) db.exec("ALTER TABLE pedidos ADD COLUMN emitir_nfce INTEGER DEFAULT 1");
  if (!cp2.includes("cliente_cpf")) db.exec("ALTER TABLE pedidos ADD COLUMN cliente_cpf TEXT DEFAULT ''");
}

// Inserir chave PIX padrão se não existir
const existePix = db.prepare("SELECT 1 FROM config WHERE key = 'pix_key'").get();
if (!existePix) {
  db.prepare("INSERT INTO config (key, value) VALUES ('pix_key', '11999999999')").run();
}
const existePixNome = db.prepare("SELECT 1 FROM config WHERE key = 'pix_nome'").get();
if (!existePixNome) {
  db.prepare("INSERT INTO config (key, value) VALUES ('pix_nome', '')").run();
}

// Migração: permitir email NULL e telefone UNIQUE na tabela usuarios (para bancos já existentes)
try {
  const colsUsuarios = db.prepare("PRAGMA table_info(usuarios)").all();
  const emailCol = colsUsuarios.find(c => c.name === "email");
  if (emailCol && emailCol.notnull === 1) {
    db.exec(`
      CREATE TABLE usuarios_new (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE,
        senha TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'cliente' CHECK(tipo IN ('admin', 'cliente')),
        telefone TEXT UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO usuarios_new SELECT id, nome, NULLIF(email,''), senha, tipo, NULLIF(telefone,''), created_at FROM usuarios;
      DROP TABLE usuarios;
      ALTER TABLE usuarios_new RENAME TO usuarios;
    `);
  }
} catch (e) { /* migration already done */ }

// Migração: adicionar custo_fixo_id na tabela lancamentos (para bancos já existentes)
const colsLanc = db.prepare("PRAGMA table_info(lancamentos)").all().map(c => c.name);
if (!colsLanc.includes("custo_fixo_id")) {
  db.exec("ALTER TABLE lancamentos ADD COLUMN custo_fixo_id TEXT DEFAULT NULL");
}
// Migração: custo (CMV embutido na venda) — feed mostra venda+custo+margem em 1 linha
if (!colsLanc.includes("custo")) {
  db.exec("ALTER TABLE lancamentos ADD COLUMN custo REAL DEFAULT NULL");
}
if (!colsLanc.includes("pedido_id")) {
  db.exec("ALTER TABLE lancamentos ADD COLUMN pedido_id TEXT DEFAULT NULL");
}

// Migração: motor "NFC-e antigo" (emissão direta na SEFAZ, regras vigentes pré-reforma)
const colsFiscal = db.prepare("PRAGMA table_info(fiscal_config)").all().map(c => c.name);
if (!colsFiscal.includes("antigo_habilitado")) {
  db.exec(`
    ALTER TABLE fiscal_config ADD COLUMN antigo_habilitado INTEGER DEFAULT 0;
    ALTER TABLE fiscal_config ADD COLUMN antigo_serie TEXT DEFAULT '1';
    ALTER TABLE fiscal_config ADD COLUMN antigo_proximo_numero INTEGER DEFAULT 1;
    ALTER TABLE fiscal_config ADD COLUMN ncm_padrao TEXT DEFAULT '21069090';
    ALTER TABLE fiscal_config ADD COLUMN cfop_padrao TEXT DEFAULT '5102';
  `);
}
const colsNfceEm = db.prepare("PRAGMA table_info(nfce_emitidas)").all().map(c => c.name);
if (!colsNfceEm.includes("motor")) {
  db.exec("ALTER TABLE nfce_emitidas ADD COLUMN motor TEXT DEFAULT 'novo'");
  db.exec("ALTER TABLE nfce_emitidas ADD COLUMN xml_assinado TEXT DEFAULT ''");
}

// Migração: integração com provedor real (Focus NFe) + relatório fiscal mensal
if (!colsFiscal.includes("focus_empresa_id")) {
  db.exec(`
    ALTER TABLE fiscal_config ADD COLUMN focus_empresa_id TEXT DEFAULT '';
    ALTER TABLE fiscal_config ADD COLUMN email_contabilidade TEXT DEFAULT '';
    ALTER TABLE fiscal_config ADD COLUMN relatorio_dia_mes INTEGER DEFAULT 5;
    ALTER TABLE fiscal_config ADD COLUMN n8n_webhook_relatorio TEXT DEFAULT '';
    ALTER TABLE fiscal_config ADD COLUMN relatorio_ultimo_mes_enviado TEXT DEFAULT '';
  `);
}

// Migração: adicionar colunas novas na tabela pedidos (para bancos já existentes)
const colsPedidos = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
if (!colsPedidos.includes("metodo_pagamento")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN metodo_pagamento TEXT DEFAULT ''");
}
if (!colsPedidos.includes("troco_para")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN troco_para REAL DEFAULT NULL");
}
if (!colsPedidos.includes("tipo_entrega")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN tipo_entrega TEXT DEFAULT 'entrega'");
}
if (!colsPedidos.includes("endereco_cep")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_cep TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_rua TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_numero TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_bairro TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_referencia TEXT DEFAULT ''");
}
if (!colsPedidos.includes("cliente_telefone")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN cliente_telefone TEXT DEFAULT ''");
}
if (!colsPedidos.includes("cliente_email")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN cliente_email TEXT DEFAULT ''");
}
// Migração: updated_at em pedidos — usado pela sincronização (last-write-wins).
// Só pode existir UMA fonte da verdade por status; o mais recente vence.
if (!colsPedidos.includes("updated_at")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN updated_at TEXT");
  db.exec("UPDATE pedidos SET updated_at = COALESCE(updated_at, created_at, datetime('now'))");
}
// Desconto do pedido (R$) — subtraído do total. Aplicável na Frente de Caixa (F3).
if (!colsPedidos.includes("desconto")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN desconto REAL DEFAULT 0");
}

// Migração: remover a FK produto_id de pedido_itens. Os dados do item já são
// denormalizados (nome/preço/custo na própria linha), então a FK não é necessária
// e IMPEDE a sincronização de pedidos entre bancos com cadastros de produto
// diferentes (ex.: pedido do cardápio online chegando no PDV). Mantém a FK de
// pedido_id (ON DELETE CASCADE).
try {
  const fksItens = db.prepare("PRAGMA foreign_key_list(pedido_itens)").all();
  if (fksItens.some(f => f.table === "produtos")) {
    db.pragma("foreign_keys = OFF");   // pragma FORA da transação (regra do SQLite)
    const _rebuildItens = db.transaction(() => {   // atômico: se falhar, rollback total
    db.exec(`
      CREATE TABLE pedido_itens_new (
        id TEXT PRIMARY KEY,
        pedido_id TEXT NOT NULL,
        produto_id TEXT NOT NULL,
        produto_nome TEXT NOT NULL,
        quantidade INTEGER NOT NULL DEFAULT 1,
        preco_unitario REAL NOT NULL,
        custo_unitario REAL NOT NULL DEFAULT 0,
        adicionais TEXT DEFAULT '[]',
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
      );
      INSERT INTO pedido_itens_new (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais)
        SELECT id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais FROM pedido_itens;
      DROP TABLE pedido_itens;
      ALTER TABLE pedido_itens_new RENAME TO pedido_itens;
    `);
    });
    _rebuildItens();
    db.pragma("foreign_keys = ON");
  }
} catch (e) { db.pragma("foreign_keys = ON"); /* já migrado ou rollback */ }

// Migration: coluna 'ordem' em categorias
const colsCategorias = db.prepare("PRAGMA table_info(categorias)").all().map(c => c.name);
if (!colsCategorias.includes("ordem")) {
  db.exec("ALTER TABLE categorias ADD COLUMN ordem INTEGER DEFAULT 0");
  // Inicializa ordem com base alfabética para preservar comportamento atual
  const existentes = db.prepare("SELECT id FROM categorias ORDER BY nome").all();
  const upd = db.prepare("UPDATE categorias SET ordem = ? WHERE id = ?");
  existentes.forEach((c, i) => upd.run(i, c.id));
}

// ─── MIGRAÇÃO LIXEIRA — adiciona deleted_at em todas as tabelas relevantes ──
const TABELAS_LIXEIRA = [
  "lancamentos", "pedidos", "produtos", "categorias",
  "adicionais", "custos_fixos", "estoque_itens", "fornecedores",
];
for (const tabela of TABELAS_LIXEIRA) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes("deleted_at")) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN deleted_at TEXT DEFAULT NULL`);
  }
}
// Índice opcional para acelerar queries de lixeira
for (const tabela of TABELAS_LIXEIRA) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${tabela}_deleted_at ON ${tabela}(deleted_at)`);
}

// ─── MIGRAÇÃO: adicionar 'casa' ao CHECK de tipo_entrega ─────────────────
{
  const sqlCreate = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
  if (sqlCreate && sqlCreate.sql && !sqlCreate.sql.includes("'casa'")) {
    db.exec(`
      CREATE TABLE pedidos_new AS SELECT * FROM pedidos;
      DROP TABLE pedidos;
      CREATE TABLE pedidos (
        id TEXT PRIMARY KEY,
        cliente_id TEXT,
        cliente_nome TEXT DEFAULT '',
        cliente_telefone TEXT DEFAULT '',
        cliente_email TEXT DEFAULT '',
        total REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','preparando','pronto','entregue','cancelado')),
        obs TEXT DEFAULT '',
        tipo TEXT NOT NULL DEFAULT 'online' CHECK(tipo IN ('online', 'presencial')),
        metodo_pagamento TEXT DEFAULT '',
        troco_para REAL DEFAULT NULL,
        tipo_entrega TEXT DEFAULT 'entrega' CHECK(tipo_entrega IN ('entrega','retirada','casa')),
        endereco_cep TEXT DEFAULT '',
        endereco_rua TEXT DEFAULT '',
        endereco_numero TEXT DEFAULT '',
        endereco_bairro TEXT DEFAULT '',
        endereco_referencia TEXT DEFAULT '',
        deleted_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    // Copia só as colunas presentes em ambos os schemas — instalações que já rodaram
    // outras migrações (ex.: updated_at) antes desta podem ter colunas extras.
    const colsOrigemCasa = db.prepare("PRAGMA table_info(pedidos_new)").all().map(c => c.name);
    const colsDestinoCasa = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
    const comunsCasa = colsDestinoCasa.filter(c => colsOrigemCasa.includes(c));
    db.exec(`INSERT INTO pedidos (${comunsCasa.join(", ")}) SELECT ${comunsCasa.join(", ")} FROM pedidos_new;`);
    if (colsOrigemCasa.includes("updated_at") && !colsDestinoCasa.includes("updated_at")) {
      db.exec("ALTER TABLE pedidos ADD COLUMN updated_at TEXT");
      db.exec("UPDATE pedidos SET updated_at = (SELECT updated_at FROM pedidos_new WHERE pedidos_new.id = pedidos.id)");
    }
    db.exec("DROP TABLE pedidos_new; CREATE INDEX IF NOT EXISTS idx_pedidos_deleted_at ON pedidos(deleted_at);");
  }
}

// ─── MIGRAÇÃO: adicionar 'aguardando_confirmacao' ao CHECK de status ─────
// Produtos por peso podem entrar em espera de confirmação do cliente quando
// a peça pesada real diverge muito do peso pedido (>20%).
{
  const sqlCreate = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
  if (sqlCreate && sqlCreate.sql && !sqlCreate.sql.includes("'aguardando_confirmacao'")) {
    // Idempotente: se uma tentativa anterior travou entre `CREATE TABLE pedidos_new AS`
    // e `DROP TABLE pedidos`, dropa a tabela órfã antes de tentar de novo.
    db.exec("DROP TABLE IF EXISTS pedidos_new");
    db.exec(`
      CREATE TABLE pedidos_new AS SELECT * FROM pedidos;
      DROP TABLE pedidos;
      CREATE TABLE pedidos (
        id TEXT PRIMARY KEY,
        cliente_id TEXT,
        cliente_nome TEXT DEFAULT '',
        cliente_telefone TEXT DEFAULT '',
        cliente_email TEXT DEFAULT '',
        total REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','preparando','pronto','aguardando_confirmacao','entregue','cancelado')),
        obs TEXT DEFAULT '',
        tipo TEXT NOT NULL DEFAULT 'online' CHECK(tipo IN ('online', 'presencial')),
        metodo_pagamento TEXT DEFAULT '',
        troco_para REAL DEFAULT NULL,
        tipo_entrega TEXT DEFAULT 'entrega' CHECK(tipo_entrega IN ('entrega','retirada','casa')),
        endereco_cep TEXT DEFAULT '',
        endereco_rua TEXT DEFAULT '',
        endereco_numero TEXT DEFAULT '',
        endereco_bairro TEXT DEFAULT '',
        endereco_referencia TEXT DEFAULT '',
        deleted_at TEXT DEFAULT NULL,
        desconto REAL DEFAULT 0,
        emitir_nfce INTEGER DEFAULT 1,
        cliente_cpf TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const colsOrigemPeso = db.prepare("PRAGMA table_info(pedidos_new)").all().map(c => c.name);
    let colsDestinoPeso = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
    // Blindagem: qualquer coluna que exista na tabela antiga e NÃO esteja no
    // schema hardcoded acima (esquecida aqui, ou adicionada por uma migração
    // futura antes desta) é preservada via ALTER TABLE genérico — evita repetir
    // o bug de perder 'desconto'/'emitir_nfce'/'cliente_cpf' se algo mais faltar.
    const infoOrigemPeso = db.prepare("PRAGMA table_info(pedidos_new)").all();
    for (const col of infoOrigemPeso) {
      if (col.name === "id" || colsDestinoPeso.includes(col.name)) continue;
      const tipo = col.type || "TEXT";
      db.exec(`ALTER TABLE pedidos ADD COLUMN ${col.name} ${tipo}`);
      console.log(`[migração] pedidos: coluna '${col.name}' preservada automaticamente (não estava no schema hardcoded)`);
    }
    colsDestinoPeso = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
    const comunsPeso = colsDestinoPeso.filter(c => colsOrigemPeso.includes(c));
    db.exec(`INSERT INTO pedidos (${comunsPeso.join(", ")}) SELECT ${comunsPeso.join(", ")} FROM pedidos_new;`);
    if (colsOrigemPeso.includes("updated_at") && !colsDestinoPeso.includes("updated_at")) {
      db.exec("ALTER TABLE pedidos ADD COLUMN updated_at TEXT");
      db.exec("UPDATE pedidos SET updated_at = (SELECT updated_at FROM pedidos_new WHERE pedidos_new.id = pedidos.id)");
    }
    db.exec("DROP TABLE pedidos_new; CREATE INDEX IF NOT EXISTS idx_pedidos_deleted_at ON pedidos(deleted_at);");
    console.log("[migração] pedidos.status agora aceita 'aguardando_confirmacao' (venda por peso)");
  }
}

// ─── MIGRAÇÃO: adicionar 'balcao' ao CHECK de tipo_entrega ───────────────
// Pedidos criados no FrenteCaixa (venda balcão) recebem tipo_entrega='balcao'
// pra aparecerem na cozinha como "Balcão" em vez de "Retirada" — o operador
// vê que é venda de comprador presencial, não pedido pra buscar depois.
{
  const sqlCreate = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
  if (sqlCreate && sqlCreate.sql && !sqlCreate.sql.includes("'balcao'")) {
    db.exec("DROP TABLE IF EXISTS pedidos_new");
    db.exec(`
      CREATE TABLE pedidos_new AS SELECT * FROM pedidos;
      DROP TABLE pedidos;
      CREATE TABLE pedidos (
        id TEXT PRIMARY KEY,
        cliente_id TEXT,
        cliente_nome TEXT DEFAULT '',
        cliente_telefone TEXT DEFAULT '',
        cliente_email TEXT DEFAULT '',
        total REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','confirmado','preparando','pronto','aguardando_confirmacao','entregue','cancelado')),
        obs TEXT DEFAULT '',
        tipo TEXT NOT NULL DEFAULT 'online' CHECK(tipo IN ('online', 'presencial')),
        metodo_pagamento TEXT DEFAULT '',
        troco_para REAL DEFAULT NULL,
        tipo_entrega TEXT DEFAULT 'entrega' CHECK(tipo_entrega IN ('entrega','retirada','casa','balcao')),
        endereco_cep TEXT DEFAULT '',
        endereco_rua TEXT DEFAULT '',
        endereco_numero TEXT DEFAULT '',
        endereco_bairro TEXT DEFAULT '',
        endereco_referencia TEXT DEFAULT '',
        deleted_at TEXT DEFAULT NULL,
        desconto REAL DEFAULT 0,
        emitir_nfce INTEGER DEFAULT 1,
        cliente_cpf TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const colsOrigemBalcao = db.prepare("PRAGMA table_info(pedidos_new)").all().map(c => c.name);
    let colsDestinoBalcao = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
    const infoOrigemBalcao = db.prepare("PRAGMA table_info(pedidos_new)").all();
    for (const col of infoOrigemBalcao) {
      if (col.name === "id" || colsDestinoBalcao.includes(col.name)) continue;
      const tipo = col.type || "TEXT";
      db.exec(`ALTER TABLE pedidos ADD COLUMN ${col.name} ${tipo}`);
    }
    colsDestinoBalcao = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
    const comunsBalcao = colsDestinoBalcao.filter(c => colsOrigemBalcao.includes(c));
    db.exec(`INSERT INTO pedidos (${comunsBalcao.join(", ")}) SELECT ${comunsBalcao.join(", ")} FROM pedidos_new;`);
    db.exec("DROP TABLE pedidos_new; CREATE INDEX IF NOT EXISTS idx_pedidos_deleted_at ON pedidos(deleted_at);");
    console.log("[migração] pedidos.tipo_entrega agora aceita 'balcao' (venda no caixa)");
  }
}

// ─── MIGRAÇÃO: pedido_itens.quantidade → REAL + colunas de peso ─────────
// Pedidos por peso guardam quantidade fracionária (0.350 kg) — INTEGER trunca
// dependendo da type affinity. Também adiciona `por_peso` (flag) e
// `peso_desejado_kg` (imutável, guarda o peso ORIGINAL pedido pelo cliente
// pra calcular a tolerância quando o lojista informa o peso real).
{
  const cols = db.prepare("PRAGMA table_info(pedido_itens)").all();
  const colQtd = cols.find(c => c.name === "quantidade");
  const temPorPeso = cols.some(c => c.name === "por_peso");
  const temPesoDesejado = cols.some(c => c.name === "peso_desejado_kg");
  const precisaRebuild = colQtd && String(colQtd.type).toUpperCase() !== "REAL";

  if (precisaRebuild) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS pedido_itens_new");
      db.exec(`
        CREATE TABLE pedido_itens_new (
          id TEXT PRIMARY KEY,
          pedido_id TEXT NOT NULL,
          produto_id TEXT NOT NULL,
          produto_nome TEXT NOT NULL,
          quantidade REAL NOT NULL DEFAULT 1,
          preco_unitario REAL NOT NULL,
          custo_unitario REAL NOT NULL DEFAULT 0,
          adicionais TEXT DEFAULT '[]',
          por_peso INTEGER NOT NULL DEFAULT 0,
          peso_desejado_kg REAL DEFAULT NULL,
          FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
        );
        INSERT INTO pedido_itens_new (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais)
          SELECT id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais FROM pedido_itens;
        DROP TABLE pedido_itens;
        ALTER TABLE pedido_itens_new RENAME TO pedido_itens;
      `);
    })();
    db.pragma("foreign_keys = ON");
    console.log("[migração] pedido_itens: quantidade agora é REAL + colunas por_peso/peso_desejado_kg");
  } else {
    if (!temPorPeso)      db.exec("ALTER TABLE pedido_itens ADD COLUMN por_peso INTEGER NOT NULL DEFAULT 0");
    if (!temPesoDesejado) db.exec("ALTER TABLE pedido_itens ADD COLUMN peso_desejado_kg REAL DEFAULT NULL");
  }
}

// ─── MIGRAÇÃO PROMOÇÕES — colunas extras em produtos ───────────────────────
const PROMO_COLS = [
  ["eh_promocao",       "INTEGER DEFAULT 0"],            // 1 = é promoção, 0 = produto normal
  ["preco_de",          "REAL DEFAULT NULL"],            // preço original (riscado)
  ["promo_data_inicio", "TEXT DEFAULT NULL"],            // YYYY-MM-DD
  ["promo_data_fim",    "TEXT DEFAULT NULL"],            // YYYY-MM-DD
  ["promo_dias_semana", "TEXT DEFAULT NULL"],            // JSON [0..6] (0=Dom)
  ["promo_hora_inicio", "TEXT DEFAULT NULL"],            // HH:MM
  ["promo_hora_fim",    "TEXT DEFAULT NULL"],            // HH:MM
  ["promo_destaque",    "INTEGER DEFAULT 1"],            // aparece em "Destaques do dia"
  ["promo_descricao",   "TEXT DEFAULT NULL"],            // descrição própria da promo (opcional, sobrescreve descricao base)
  ["codigo",            "TEXT DEFAULT ''"],              // código próprio (SKU/EAN) usado pela busca do PDV
];
const colsProdutosAtuais = db.prepare("PRAGMA table_info(produtos)").all().map(c => c.name);
for (const [col, def] of PROMO_COLS) {
  if (!colsProdutosAtuais.includes(col)) {
    db.exec(`ALTER TABLE produtos ADD COLUMN ${col} ${def}`);
  }
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_produtos_promocao ON produtos(eh_promocao)`);

// Categoria reservada "Promoções" — todo produto com eh_promocao=1 fica nela
const SEED_CAT_PROMO = "Promoções";
{
  const existe = db.prepare("SELECT 1 FROM categorias WHERE nome = ? AND deleted_at IS NULL").get(SEED_CAT_PROMO);
  if (!existe) {
    const id = randomBytes(6).toString("hex");
    db.prepare(
      "INSERT INTO categorias (id, nome, permite_adicionais, ordem) VALUES (?, ?, 0, -1)"
    ).run(id, SEED_CAT_PROMO);
  }
}

// ─── MIGRAÇÃO: NF-e de Entrada (controle fiscal de compras) ────────────────
// Armazena XMLs de NF-e de fornecedores + itens extraídos. Cada item pode ser
// vinculado a um estoque_itens (revenda/insumo) para rastreio fiscal entrada→saída.
db.exec(`
  CREATE TABLE IF NOT EXISTS notas_entrada (
    id TEXT PRIMARY KEY,
    chave_acesso TEXT DEFAULT '',
    numero_nf TEXT DEFAULT '',
    serie TEXT DEFAULT '',
    data_emissao TEXT DEFAULT '',
    fornecedor_nome TEXT DEFAULT '',
    fornecedor_cnpj TEXT DEFAULT '',
    fornecedor_ie TEXT DEFAULT '',
    valor_total REAL DEFAULT 0,
    xml_original TEXT DEFAULT '',
    origem TEXT DEFAULT 'xml' CHECK(origem IN ('xml','manual')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notas_entrada_itens (
    id TEXT PRIMARY KEY,
    nota_id TEXT NOT NULL,
    num_item INTEGER DEFAULT 1,
    produto_nome TEXT DEFAULT '',
    codigo TEXT DEFAULT '',
    ncm TEXT DEFAULT '',
    cfop TEXT DEFAULT '',
    unidade TEXT DEFAULT 'un',
    quantidade REAL DEFAULT 0,
    valor_unitario REAL DEFAULT 0,
    valor_total REAL DEFAULT 0,
    estoque_item_id TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (nota_id) REFERENCES notas_entrada(id) ON DELETE CASCADE,
    FOREIGN KEY (estoque_item_id) REFERENCES estoque_itens(id)
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notas_entrada_data ON notas_entrada(data_emissao)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notas_entrada_cnpj ON notas_entrada(fornecedor_cnpj)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notas_entrada_itens_nota ON notas_entrada_itens(nota_id)`);

// ─── SEED CATEGORIAS PRÉ-DEFINIDAS ─────────────────────────────────────────
const CATEGORIAS_SEED = [
  { nome: "Lanches", permite_adicionais: 1 },
  { nome: "Bebidas", permite_adicionais: 0 },
];

for (const cat of CATEGORIAS_SEED) {
  const existe = db.prepare("SELECT 1 FROM categorias WHERE nome = ?").get(cat.nome);
  if (!existe) {
    const id = randomBytes(6).toString("hex");
    db.prepare(
      "INSERT INTO categorias (id, nome, permite_adicionais) VALUES (?, ?, ?)"
    ).run(id, cat.nome, cat.permite_adicionais);
    console.log(`Categoria criada: ${cat.nome}`);
  }
}

// ─── SEED ADMIN PRÉ-DEFINIDO ───────────────────────────────────────────────
// Conta principal Nexus: sempre re-semeada (irremovível) e protegida contra exclusão.
export const ADMIN_PRINCIPAL = "reinonexusideal@gmail.com";
export const isAdminPrincipal = (email) => String(email || "").toLowerCase() === ADMIN_PRINCIPAL;

const ADMINS_SEED = [
  { nome: "Nexus", email: ADMIN_PRINCIPAL, senha: "31076hibridos" },
];

for (const admin of ADMINS_SEED) {
  const existe = db.prepare("SELECT 1 FROM usuarios WHERE email = ?").get(admin.email);
  if (!existe) {
    const id = randomBytes(6).toString("hex");
    const hash = bcrypt.hashSync(admin.senha, 10);
    db.prepare(
      "INSERT INTO usuarios (id, nome, email, senha, tipo) VALUES (?, ?, ?, ?, 'admin')"
    ).run(id, admin.nome, admin.email, hash);
    console.log(`Admin criado: ${admin.email}`);
  } else {
    // Conta principal já existia (ex.: registrada como cliente) — garante admin.
    db.prepare("UPDATE usuarios SET tipo = 'admin' WHERE email = ?").run(admin.email);
  }
  db.prepare(
    "INSERT OR IGNORE INTO admin_emails (email, adicionado_por) VALUES (?, 'seed')"
  ).run(admin.email);
}

// Migração one-time: deixar APENAS a conta principal Nexus como admin
// (remove Felipe/Gabriel/Antônio e quaisquer outros admins do banco já existente).
// Roda só uma vez — admins cadastrados manualmente depois disso são preservados.
if (obterConfig("nexus_admin_reset_v1") !== "1") {
  db.prepare("DELETE FROM usuarios WHERE tipo = 'admin' AND email != ?").run(ADMIN_PRINCIPAL);
  db.prepare("DELETE FROM admin_emails WHERE email != ?").run(ADMIN_PRINCIPAL);
  salvarConfig("nexus_admin_reset_v1", "1");
  console.log("Reset de admins: mantida apenas a conta principal Nexus");
}

export function gerarId() {
  return randomBytes(6).toString("hex");
}

// ─── ADMIN EMAILS ──────────────────────────────────────────────────────────

export function isEmailAdmin(email) {
  return !!db.prepare("SELECT 1 FROM admin_emails WHERE email = ?").get(email);
}

export function buscarAdminEmail(email) {
  if (!email) return null;
  const row = db.prepare("SELECT * FROM admin_emails WHERE email = ?").get(email);
  if (!row) return null;
  let setores = null;
  try { if (row.setores) setores = JSON.parse(row.setores); } catch {}
  return { ...row, setores };
}

export function listarAdminEmails() {
  const rows = db.prepare("SELECT email, nome, adicionado_por, created_at, setores, senha_hash FROM admin_emails ORDER BY created_at").all();
  return rows.map(r => {
    let setores = null;
    try { if (r.setores) setores = JSON.parse(r.setores); } catch {}
    return {
      email: r.email,
      nome: r.nome || "",
      adicionado_por: r.adicionado_por || "",
      created_at: r.created_at,
      setores,                          // null = todos os setores
      tem_senha: !!r.senha_hash,        // não devolve o hash, só se existe
    };
  });
}

// Adiciona/atualiza um funcionário admin. Se vier nome/senha/setores, salva.
// Se vier senhaHash (já em bcrypt) define também a senha em `usuarios` (se já existir).
export function adicionarAdminEmail(email, adicionadoPor, opts = {}) {
  const { nome, senhaHash, setores } = opts;
  const setoresJson = Array.isArray(setores) ? JSON.stringify(setores) : null;
  const existente = db.prepare("SELECT email FROM admin_emails WHERE email = ?").get(email);
  if (existente) {
    // Atualiza só o que vier
    if (nome !== undefined)     db.prepare("UPDATE admin_emails SET nome = ? WHERE email = ?").run(nome || "", email);
    if (setores !== undefined)  db.prepare("UPDATE admin_emails SET setores = ? WHERE email = ?").run(setoresJson, email);
    if (senhaHash)              db.prepare("UPDATE admin_emails SET senha_hash = ? WHERE email = ?").run(senhaHash, email);
  } else {
    db.prepare(
      "INSERT INTO admin_emails (email, nome, adicionado_por, senha_hash, setores) VALUES (?, ?, ?, ?, ?)"
    ).run(email, nome || "", adicionadoPor || "", senhaHash || null, setoresJson);
  }
  // Se já houver um usuário registrado com esse email, vira admin e sincroniza a senha.
  db.prepare("UPDATE usuarios SET tipo = 'admin' WHERE email = ?").run(email);
  if (senhaHash) {
    db.prepare("UPDATE usuarios SET senha = ? WHERE email = ?").run(senhaHash, email);
  }
}

export function atualizarAdminEmail(email, { nome, senhaHash, setores }) {
  return adicionarAdminEmail(email, null, { nome, senhaHash, setores });
}

export function removerAdminEmail(email) {
  db.prepare("DELETE FROM admin_emails WHERE email = ?").run(email);
  db.prepare("UPDATE usuarios SET tipo = 'cliente' WHERE email = ?").run(email);
}

// ─── USUARIOS ───────────────────────────────────────────────────────────────

export function criarUsuario({ nome, email, senha, tipo, telefone }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO usuarios (id, nome, email, senha, tipo, telefone) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, nome, email || null, senha, tipo || "cliente", telefone || null);
  return buscarUsuarioPorId(id);
}

export function buscarUsuarioPorEmail(email) {
  if (!email) return null;
  return db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email);
}

export function buscarUsuarioPorTelefone(telefone) {
  if (!telefone) return null;
  return db.prepare("SELECT * FROM usuarios WHERE telefone = ?").get(telefone);
}

export function buscarUsuarioPorId(id) {
  const u = db.prepare("SELECT id, nome, email, tipo, telefone, created_at FROM usuarios WHERE id = ?").get(id);
  return u || null;
}

// ─── LANCAMENTOS ────────────────────────────────────────────────────────────

export function listarLancamentos() {
  return db.prepare("SELECT * FROM lancamentos WHERE deleted_at IS NULL ORDER BY data DESC, created_at DESC").all();
}

export function buscarLancamento(id) {
  return db.prepare("SELECT * FROM lancamentos WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function criarLancamento({ tipo, descricao, valor, data, cat, status, obs, custo, pedido_id }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs, custo, pedido_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, tipo, descricao, valor, data, cat, status, obs || "", custo != null ? Number(custo) : null, pedido_id || null);
  return buscarLancamento(id);
}

export function atualizarLancamento(id, { tipo, descricao, valor, data, cat, status, obs }) {
  // custo não é editável pela UI — preservado (vem da venda/pedido)
  const result = db.prepare(
    "UPDATE lancamentos SET tipo = ?, descricao = ?, valor = ?, data = ?, cat = ?, status = ?, obs = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(tipo, descricao, valor, data, cat, status, obs || "", id);
  if (result.changes === 0) return null;
  return buscarLancamento(id);
}

export function excluirLancamento(id) {
  // Soft delete — vai para a lixeira
  return db.prepare("UPDATE lancamentos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── CONFIG ─────────────────────────────────────────────────────────────────

export function obterConfig(key) {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function salvarConfig(key, value) {
  db.prepare(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

// ─── FISCAL / NFC-e ──────────────────────────────────────────────────────────
// Criptografia simétrica (AES-256-GCM) para dados sensíveis (senha do A1, CSC,
// token do provedor e o próprio .pfx). Chave derivada do segredo do servidor.
const FISCAL_KEY = createHash("sha256")
  .update(process.env.FISCAL_SECRET || process.env.JWT_SECRET || "nexus-fiscal-fallback-2026")
  .digest();

function fiscEncriptar(txt) {
  if (txt == null || txt === "") return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", FISCAL_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(txt), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "enc:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

function fiscDecriptar(blob) {
  if (!blob || !String(blob).startsWith("enc:")) return blob || "";
  try {
    const raw = Buffer.from(String(blob).slice(4), "base64");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", FISCAL_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// Erros de senha errada do node-forge (MAC do PFX ou decrypt de um bag específico).
const RE_SENHA_ERRADA = /invalid password|mac could not be verified|wrong password|failed to decrypt/i;

// Decodifica o PKCS#12 (.pfx/.p12) em memória — sem tocar disco nem depender
// de binário externo (node-forge é JS puro, funciona igual em qualquer SO).
function decodificarPkcs12(pfxBase64, senha) {
  const der = forge.util.decode64(pfxBase64);
  const asn1 = forge.asn1.fromDer(der);
  return forge.pkcs12.pkcs12FromAsn1(asn1, senha || "");
}

// Separa o certificado do titular (subscriber) da cadeia (CAs intermediárias/raiz)
// olhando basicConstraints.cA — replica o clcerts/cacerts que o OpenSSL fazia.
function extrairCertLeaf(p12) {
  const mapa = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = (mapa[forge.pki.oids.certBag] || []).map(b => b.cert).filter(Boolean);
  if (certs.length === 0) throw new Error("Nenhum certificado encontrado no arquivo .pfx.");
  let leaf = certs.find(c => {
    const bc = c.getExtension("basicConstraints");
    return !bc || bc.cA !== true;
  });
  if (!leaf) leaf = certs[0];
  return { leaf, chain: certs.filter(c => c !== leaf) };
}

function infoDoCertificado(cert) {
  const validade_fim = cert.validity.notAfter.toISOString();
  // ICP-Brasil: CN geralmente "EMPRESA LTDA:12345678000199"
  const subjectStr = cert.subject.attributes.map(a => String(a.value)).join(" ");
  const mCnpj = subjectStr.match(/(\d{14})/);
  const cnpj = mCnpj ? mCnpj[1] : "";
  const cnAttr = cert.subject.getField("CN");
  const titular = cnAttr ? String(cnAttr.value).replace(/:\d{14}$/, "").trim() : "";
  return { cnpj, titular, validade_fim };
}

// Reconhece um certificado A1 (.pfx/.p12) usando node-forge (parsing em memória,
// sem depender de OpenSSL instalado na máquina do cliente). Retorna
// { ok, cnpj, titular, validade_fim, erro }.
export function lerCertificadoA1(pfxBase64, senha) {
  try {
    const p12 = decodificarPkcs12(pfxBase64, senha);
    const { leaf } = extrairCertLeaf(p12);
    return { ok: true, ...infoDoCertificado(leaf) };
  } catch (e) {
    const msg = String((e && e.message) || "");
    if (RE_SENHA_ERRADA.test(msg)) return { ok: false, erro: "Senha do certificado incorreta." };
    return { ok: false, erro: "Não foi possível ler o certificado (arquivo inválido ou senha errada)." };
  }
}

// Retorna a config fiscal SEM segredos (nunca expõe senha/pfx/token/csc).
export function obterFiscalConfig() {
  const r = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  return {
    nfce_habilitado: !!r.nfce_habilitado,
    ambiente: r.ambiente || "homologacao",
    cnpj: r.cnpj || "",
    razao_social: r.razao_social || "",
    nome_fantasia: r.nome_fantasia || "",
    inscricao_estadual: r.inscricao_estadual || "",
    regime_tributario: r.regime_tributario || "simples",
    cep: r.cep || "", logradouro: r.logradouro || "", numero: r.numero || "",
    bairro: r.bairro || "", municipio: r.municipio || "",
    codigo_municipio: r.codigo_municipio || "", uf: r.uf || "",
    csc_id: r.csc_id || "",
    csc_preenchido: !!(r.csc && r.csc.length),        // não devolve o CSC, só se existe
    serie: r.serie || "1",
    proximo_numero: r.proximo_numero || 1,
    provedor: r.provedor || "nenhum",
    provedor_token_preenchido: !!(r.provedor_token && r.provedor_token.length),
    // certificado (metadados públicos, nunca o arquivo/senha)
    cert_presente: !!(r.cert_data && r.cert_data.length),
    cert_nome_arquivo: r.cert_nome_arquivo || "",
    cert_cnpj: r.cert_cnpj || "",
    cert_titular: r.cert_titular || "",
    cert_validade_fim: r.cert_validade_fim || "",
    cert_atualizado_em: r.cert_atualizado_em || "",
    // motor "NFC-e antigo" (regras vigentes, emissão direta na SEFAZ)
    antigo_habilitado: !!r.antigo_habilitado,
    antigo_serie: r.antigo_serie || "1",
    antigo_proximo_numero: r.antigo_proximo_numero || 1,
    ncm_padrao: r.ncm_padrao || "21069090",
    cfop_padrao: r.cfop_padrao || "5102",
    // relatório fiscal mensal (envio automático via n8n)
    email_contabilidade: r.email_contabilidade || "",
    relatorio_dia_mes: r.relatorio_dia_mes || 5,
    n8n_webhook_relatorio: r.n8n_webhook_relatorio || "",
  };
}

// Salva os campos de identidade/config (não mexe no certificado).
export function salvarFiscalConfig(dados) {
  const atual = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  const campos = {
    nfce_habilitado: dados.nfce_habilitado != null ? (dados.nfce_habilitado ? 1 : 0) : atual.nfce_habilitado,
    ambiente: (dados.ambiente === "producao" || dados.ambiente === "homologacao") ? dados.ambiente : atual.ambiente,
    cnpj: dados.cnpj ?? atual.cnpj,
    razao_social: dados.razao_social ?? atual.razao_social,
    nome_fantasia: dados.nome_fantasia ?? atual.nome_fantasia,
    inscricao_estadual: dados.inscricao_estadual ?? atual.inscricao_estadual,
    regime_tributario: dados.regime_tributario ?? atual.regime_tributario,
    cep: dados.cep ?? atual.cep,
    logradouro: dados.logradouro ?? atual.logradouro,
    numero: dados.numero ?? atual.numero,
    bairro: dados.bairro ?? atual.bairro,
    municipio: dados.municipio ?? atual.municipio,
    codigo_municipio: dados.codigo_municipio ?? atual.codigo_municipio,
    uf: dados.uf ?? atual.uf,
    // CSC e token só sobrescrevem se vier valor não-vazio (senão preserva)
    csc: (dados.csc != null && dados.csc !== "") ? fiscEncriptar(dados.csc) : atual.csc,
    csc_id: dados.csc_id ?? atual.csc_id,
    serie: dados.serie ?? atual.serie,
    proximo_numero: dados.proximo_numero != null ? parseInt(dados.proximo_numero, 10) || 1 : atual.proximo_numero,
    provedor: dados.provedor ?? atual.provedor,
    provedor_token: (dados.provedor_token != null && dados.provedor_token !== "") ? fiscEncriptar(dados.provedor_token) : atual.provedor_token,
    antigo_habilitado: dados.antigo_habilitado != null ? (dados.antigo_habilitado ? 1 : 0) : atual.antigo_habilitado,
    antigo_serie: dados.antigo_serie ?? atual.antigo_serie,
    antigo_proximo_numero: dados.antigo_proximo_numero != null ? parseInt(dados.antigo_proximo_numero, 10) || 1 : atual.antigo_proximo_numero,
    ncm_padrao: dados.ncm_padrao != null ? String(dados.ncm_padrao).replace(/\D/g, "").slice(0, 8) : atual.ncm_padrao,
    cfop_padrao: dados.cfop_padrao != null ? String(dados.cfop_padrao).replace(/\D/g, "").slice(0, 4) : atual.cfop_padrao,
    email_contabilidade: dados.email_contabilidade ?? atual.email_contabilidade,
    relatorio_dia_mes: dados.relatorio_dia_mes != null ? Math.min(28, Math.max(1, parseInt(dados.relatorio_dia_mes, 10) || 5)) : atual.relatorio_dia_mes,
    n8n_webhook_relatorio: dados.n8n_webhook_relatorio ?? atual.n8n_webhook_relatorio,
  };
  db.prepare(`UPDATE fiscal_config SET
    nfce_habilitado=@nfce_habilitado, ambiente=@ambiente, cnpj=@cnpj, razao_social=@razao_social,
    nome_fantasia=@nome_fantasia, inscricao_estadual=@inscricao_estadual, regime_tributario=@regime_tributario,
    cep=@cep, logradouro=@logradouro, numero=@numero, bairro=@bairro, municipio=@municipio,
    codigo_municipio=@codigo_municipio, uf=@uf, csc=@csc, csc_id=@csc_id, serie=@serie,
    proximo_numero=@proximo_numero, provedor=@provedor, provedor_token=@provedor_token,
    antigo_habilitado=@antigo_habilitado, antigo_serie=@antigo_serie,
    antigo_proximo_numero=@antigo_proximo_numero, ncm_padrao=@ncm_padrao, cfop_padrao=@cfop_padrao,
    email_contabilidade=@email_contabilidade, relatorio_dia_mes=@relatorio_dia_mes,
    n8n_webhook_relatorio=@n8n_webhook_relatorio,
    updated_at=datetime('now') WHERE id = 1`).run(campos);
  return obterFiscalConfig();
}

// Recebe o .pfx (base64) + senha, reconhece e salva criptografado.
export function salvarCertificadoA1({ nome_arquivo, pfx_base64, senha }) {
  if (!pfx_base64) throw new Error("Arquivo do certificado ausente.");
  const info = lerCertificadoA1(pfx_base64, senha);
  if (!info.ok) throw new Error(info.erro || "Certificado inválido.");
  db.prepare(`UPDATE fiscal_config SET
    cert_nome_arquivo=?, cert_data=?, cert_senha=?, cert_cnpj=?, cert_titular=?,
    cert_validade_fim=?, cert_atualizado_em=datetime('now') WHERE id = 1`)
    .run(
      nome_arquivo || "certificado.pfx",
      fiscEncriptar(pfx_base64),
      fiscEncriptar(senha || ""),
      info.cnpj || "",
      info.titular || "",
      info.validade_fim || "",
    );
  return obterFiscalConfig();
}

export function removerCertificadoA1() {
  db.prepare(`UPDATE fiscal_config SET
    cert_nome_arquivo='', cert_data='', cert_senha='', cert_cnpj='', cert_titular='',
    cert_validade_fim='', cert_atualizado_em='' WHERE id = 1`).run();
  return obterFiscalConfig();
}

// ─── MOTOR DE EMISSÃO NFC-e (esqueleto + modo simulado) ──────────────────────
// Fluxo real: venda → montar payload "natural" → provedor calcula impostos,
// assina com o A1 e transmite à SEFAZ → devolve chave + protocolo + QR Code.
// Enquanto não há provedor, o modo SIMULADO gera uma NFC-e fictícia (com chave
// de acesso estruturalmente válida) para testar o fluxo ponta a ponta.

const UF_CODIGO = { RO:11, AC:12, AM:13, RR:14, PA:15, AP:16, TO:17, MA:21, PI:22, CE:23, RN:24, PB:25, PE:26, AL:27, SE:28, BA:29, MG:31, ES:32, RJ:33, SP:35, PR:41, SC:42, RS:43, MS:50, MT:51, GO:52, DF:53 };

// Dígito verificador da chave de acesso (módulo 11, pesos 2..9 da direita p/ esquerda)
function dvChaveAcesso(chave43) {
  let peso = 2, soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

// Monta a chave de 44 dígitos: cUF+AAMM+CNPJ+mod+serie+nNF+tpEmis+cNF+cDV
// aammEmissao (opcional, "AAMM"): deve casar com o dhEmi da nota
function gerarChaveAcesso({ cUF, cnpj, modelo, serie, numero, tpEmis, cNF, aammEmissao }) {
  const now = new Date();
  const aamm = aammEmissao || (String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0"));
  const base =
    String(cUF).padStart(2, "0") +
    aamm +
    String(cnpj).padStart(14, "0") +
    String(modelo).padStart(2, "0") +
    String(serie).padStart(3, "0") +
    String(numero).padStart(9, "0") +
    String(tpEmis).padStart(1, "0") +
    String(cNF).padStart(8, "0");
  return base + dvChaveAcesso(base);
}

// Constrói o payload "natural" da NFC-e a partir de um pedido do sistema.
// É esse objeto que será enviado ao provedor (que calcula ICMS/PIS/COFINS e,
// a partir de agosto, IBS/CBS). Campos fiscais por item (NCM/CFOP) ainda não
// existem no cadastro de produto — usamos defaults e sinalizamos como pendência.
export function montarPayloadNFCe(pedido, fisc) {
  const ncmPadrao = (fisc.ncm_padrao && String(fisc.ncm_padrao).replace(/\D/g, "")) || "00000000";
  const cfopPadrao = (fisc.cfop_padrao && String(fisc.cfop_padrao).replace(/\D/g, "")) || "5102";
  const itens = (pedido.itens || []).map((it, i) => {
    const adicionais = (it.adicionais || []);
    const valorAdic = adicionais.reduce((s, a) => s + (a.preco || 0) * (a.quantidade || 1), 0);
    const valorUnit = (it.preco_unitario || 0) + valorAdic;
    // Busca dados fiscais e venda-por-peso do produto uma vez. Ordem de precedência:
    //  1) campo no item (se o pedido carregou snapshot)
    //  2) cadastro do produto (produtos.ncm/cest/um)
    //  3) default do estabelecimento (fiscal_config.ncm_padrao/cfop_padrao)
    let prod = null;
    if (it.produto_id) {
      try { prod = buscarProduto(it.produto_id); } catch { /* produto sumiu do cadastro */ }
    }
    let porPeso = false;
    if (prod) {
      try {
        const cfg = typeof prod.config === "string" ? JSON.parse(prod.config || "{}") : (prod.config || {});
        porPeso = cfg.venda_por_peso === true;
      } catch {}
    }
    const umProduto = (prod?.um || "").trim().toUpperCase();
    const unidadeFiscal = porPeso ? "KG" : (umProduto || "UN");
    return {
      numero_item: i + 1,
      codigo: it.codigo || prod?.codigo || it.produto_id || String(i + 1),
      codigo_barras: it.codigo_barras || prod?.codigo_barras || "",
      descricao: it.produto_nome + (adicionais.length ? " (" + adicionais.map(a => a.nome).join(", ") + ")" : ""),
      ncm: (it.ncm && String(it.ncm).replace(/\D/g, "")) || (prod?.ncm && String(prod.ncm).replace(/\D/g, "")) || ncmPadrao,
      cest: (it.cest && String(it.cest).replace(/\D/g, "")) || (prod?.cest && String(prod.cest).replace(/\D/g, "")) || "",
      cfop: it.cfop || cfopPadrao,             // venda de mercadoria dentro do estado
      unidade: unidadeFiscal,
      quantidade: it.quantidade || 1,
      valor_unitario: Math.round(valorUnit * 100) / 100,
      valor_total: Math.round(valorUnit * (it.quantidade || 1) * 100) / 100,
      // grupo de impostos deixado a cargo do provedor (Simples: CSOSN; reforma: IBS/CBS)
      regime: fisc.regime_tributario,
    };
  });
  const valorTotal = itens.reduce((s, it) => s + it.valor_total, 0);
  const mapaPgto = { pix: "17", dinheiro: "01", credito: "99", debito: "99", cartao: "99" };
  return {
    ambiente: fisc.ambiente,
    modelo: "65",
    serie: fisc.serie || "1",
    numero: fisc.proximo_numero || 1,
    emitente: {
      cnpj: fisc.cnpj, razao_social: fisc.razao_social, nome_fantasia: fisc.nome_fantasia,
      inscricao_estadual: fisc.inscricao_estadual, regime_tributario: fisc.regime_tributario,
      endereco: { cep: fisc.cep, logradouro: fisc.logradouro, numero: fisc.numero, bairro: fisc.bairro, municipio: fisc.municipio, codigo_municipio: fisc.codigo_municipio, uf: fisc.uf },
    },
    consumidor: { cpf: pedido.cliente_cpf || null, nome: pedido.cliente_nome || null },
    itens,
    pagamento: { forma: mapaPgto[pedido.metodo_pagamento] || "99", valor: valorTotal },
    valor_total: Math.round(valorTotal * 100) / 100,
  };
}

// Emite a NFC-e. Em modo simulado (ou provedor 'nenhum') gera uma nota fictícia.
// Quando um provedor for configurado, chama a API REST do provedor (Focus NFe).
export async function emitirNFCe(pedidoId, { simulado = false } = {}) {
  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};

  // Motor SEFAZ direto (grátis, sem intermediário) tem prioridade quando
  // habilitado — o provedor terceirizado (Focus) é uma opção alternativa,
  // não obrigatória. Vale tanto pra venda real quanto pro botão de teste,
  // já que emitirNFCeAntigo cobre o pedido de teste sozinho (pedidoId=null).
  if (fisc.antigo_habilitado) {
    return emitirNFCeAntigo(pedidoId);
  }

  const ehSimulado = simulado || (fisc.provedor || "nenhum") === "nenhum";

  // Carrega o pedido (ou usa um sintético no teste sem pedido)
  let pedido;
  if (pedidoId) {
    pedido = buscarPedido(pedidoId);
    if (!pedido) throw new Error("Pedido não encontrado.");
    pedido.itens = buscarItensPedido(pedidoId);
  } else {
    pedido = { id: null, cliente_nome: "CONSUMIDOR TESTE", metodo_pagamento: "dinheiro",
      itens: [{ produto_id: "TESTE", produto_nome: "Item de teste", quantidade: 1, preco_unitario: 10, adicionais: [] }] };
  }

  // Validações mínimas (só no modo real; no simulado deixamos passar p/ testar)
  if (!ehSimulado) {
    if (!fisc.cnpj) throw new Error("Configure o CNPJ na aba Fiscal antes de emitir.");
    if (!fisc.cert_data) throw new Error("Envie o certificado A1 antes de emitir.");
    if (!fisc.csc || !fisc.csc_id) throw new Error("Configure o CSC e o ID do CSC (portal da SEFAZ).");
  }

  const cfgPub = obterFiscalConfig();
  const payload = montarPayloadNFCe(pedido, cfgPub);
  const numero = fisc.proximo_numero || 1;
  const serie = fisc.serie || "1";
  const id = gerarId();

  let registro;
  if (ehSimulado) {
    const cUF = UF_CODIGO[fisc.uf] || (fisc.codigo_municipio ? fisc.codigo_municipio.slice(0, 2) : "35");
    const cnpj = (fisc.cnpj || "").replace(/\D/g, "") || "00000000000000";
    const cNF = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const chave = gerarChaveAcesso({ cUF, cnpj, modelo: "65", serie, numero, tpEmis: "1", cNF });
    const amb = fisc.ambiente === "producao" ? "1" : "2";
    const qr = `https://www.homologacao.nfce.fazenda.gov.br/consulta?chNFe=${chave}&tpAmb=${amb}`;
    db.prepare(`INSERT INTO nfce_emitidas
      (id, pedido_id, numero, serie, modelo, ambiente, chave, status, protocolo, motivo, valor_total, qr_code_url, provedor, payload_json)
      VALUES (?, ?, ?, ?, '65', ?, ?, 'simulada', ?, 'Emissão simulada (sem valor fiscal)', ?, ?, 'nenhum', ?)`)
      .run(id, pedidoId || null, numero, serie, fisc.ambiente, chave,
        "SIM" + Date.now(), payload.valor_total, qr, JSON.stringify(payload));
    registro = db.prepare("SELECT * FROM nfce_emitidas WHERE id = ?").get(id);
  } else if (fisc.provedor === "focus") {
    db.prepare(`INSERT INTO nfce_emitidas
      (id, pedido_id, numero, serie, modelo, ambiente, status, valor_total, provedor, payload_json)
      VALUES (?, ?, ?, ?, '65', ?, 'processando', ?, 'focus', ?)`)
      .run(id, pedidoId || null, numero, serie, fisc.ambiente, payload.valor_total, JSON.stringify(payload));
    try {
      const resp = await emitirNFCeFocus(id, payload, fisc);
      db.prepare("UPDATE nfce_emitidas SET retorno_json = ? WHERE id = ?").run(JSON.stringify(resp), id);
    } catch (e) {
      db.prepare("UPDATE nfce_emitidas SET status = 'erro', motivo = ? WHERE id = ?").run(e.message, id);
      throw e;
    }
    registro = db.prepare("SELECT * FROM nfce_emitidas WHERE id = ?").get(id);
  } else {
    throw new Error(`Emissão real via provedor "${fisc.provedor}" ainda não implementada. Use o modo simulado por enquanto.`);
  }

  // Avança o número da NFC-e
  db.prepare("UPDATE fiscal_config SET proximo_numero = ? WHERE id = 1").run(numero + 1);
  return registro;
}

// Dispara a emissão da NFC-e de uma venda de balcão/presencial sem bloquear
// a resposta pro caixa — nunca deixa uma falha fiscal impedir a venda.
// Só emite quando "Habilitar emissão de NFC-e" está ligado na config.
export function dispararNFCeAutomatica(pedidoId) {
  const fisc = db.prepare("SELECT nfce_habilitado FROM fiscal_config WHERE id = 1").get();
  if (!fisc?.nfce_habilitado) return;
  emitirNFCe(pedidoId).catch(e => console.error(`[fiscal] emissão automática do pedido ${pedidoId} falhou:`, e.message));
}

// Busca a nota (de qualquer motor) ligada a um pedido — usado pra reimpressão
// no histórico de vendas. Um pedido só deveria ter 1 nota "viva", mas em caso
// de reemissão pega a mais recente.
export function buscarNFCePorPedido(pedidoId) {
  return db.prepare("SELECT * FROM nfce_emitidas WHERE pedido_id = ? ORDER BY created_at DESC LIMIT 1").get(pedidoId) || null;
}

export function listarNFCe(limit = 20) {
  return db.prepare("SELECT id, pedido_id, numero, serie, ambiente, chave, status, motivo, valor_total, qr_code_url, provedor, created_at FROM nfce_emitidas WHERE COALESCE(motor,'novo') = 'novo' ORDER BY created_at DESC LIMIT ?").all(limit);
}

// ─── Integração real: Focus NFe (provedor terceirizado) ──────────────────────
// Focus NFe processa a emissão de forma assíncrona: aqui só disparamos a
// chamada e gravamos como 'processando'; verificarPendentesFocus() (polling)
// consulta o status depois e atualiza o registro. Preferimos polling a webhook
// porque o PDV roda na máquina do lojista, que normalmente não tem IP público
// pra receber notificação de volta.
const FOCUS_URL_PRODUCAO = "https://api.focusnfe.com.br/v2";
const FOCUS_URL_HOMOLOG = "https://homologacao.focusnfe.com.br/v2";
const focusBaseUrl = (ambiente) => (ambiente === "producao" ? FOCUS_URL_PRODUCAO : FOCUS_URL_HOMOLOG);
// Focus NFe autentica via HTTP Basic usando o token como usuário (sem senha).
const focusAuthHeader = (token) => "Basic " + Buffer.from(`${token}:`).toString("base64");
// Focus NFe: 1=Simples Nacional, 3=Lucro Presumido/Real (MEI cai no Simples).
const focusRegime = (regime) => (regime === "normal" ? 3 : 1);

async function focusGarantirEmpresaCadastrada(fisc) {
  if (fisc.focus_empresa_id) return fisc.focus_empresa_id;

  const token = fiscDecriptar(fisc.provedor_token);
  if (!token) throw new Error("Configure o token do Focus NFe na aba Fiscal.");
  const pfxBase64 = fiscDecriptar(fisc.cert_data);
  const senhaCert = fiscDecriptar(fisc.cert_senha);
  if (!pfxBase64) throw new Error("Envie o certificado A1 antes de emitir.");

  const form = new FormData();
  form.append("nome", fisc.razao_social || fisc.nome_fantasia || "");
  form.append("nome_fantasia", fisc.nome_fantasia || "");
  form.append("cnpj", (fisc.cnpj || "").replace(/\D/g, ""));
  form.append("inscricao_estadual", fisc.inscricao_estadual || "");
  form.append("regime_tributario", String(focusRegime(fisc.regime_tributario)));
  form.append("logradouro", fisc.logradouro || "");
  form.append("numero", fisc.numero || "");
  form.append("bairro", fisc.bairro || "");
  form.append("municipio", fisc.municipio || "");
  form.append("uf", fisc.uf || "");
  form.append("cep", (fisc.cep || "").replace(/\D/g, ""));
  form.append("habilita_nfce", "true");
  form.append("arquivo_certificado_base64", pfxBase64);
  form.append("senha_certificado", senhaCert);

  const r = await fetch(`${focusBaseUrl(fisc.ambiente)}/empresas`, {
    method: "POST",
    headers: { Authorization: focusAuthHeader(token) },
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.mensagem || data.erro || `Focus NFe: falha ao cadastrar empresa (HTTP ${r.status})`);

  const empresaId = String(data.id || "");
  if (empresaId) db.prepare("UPDATE fiscal_config SET focus_empresa_id = ? WHERE id = 1").run(empresaId);
  return empresaId;
}

// Mapeia o payload "natural" (montarPayloadNFCe) pro schema esperado pela Focus NFe.
function montarPayloadFocus(payload) {
  return {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    presenca_comprador: "1",
    modalidade_frete: "9",
    cnpj_emitente: (payload.emitente.cnpj || "").replace(/\D/g, ""),
    valor_produtos: payload.valor_total,
    valor_total: payload.valor_total,
    cpf_destinatario: payload.consumidor?.cpf || undefined,
    nome_destinatario: payload.consumidor?.nome || undefined,
    forma_pagamento: "0", // à vista
    formas_pagamento: [{ forma_pagamento: payload.pagamento?.forma || "99", valor_pagamento: payload.pagamento?.valor || payload.valor_total }],
    items: payload.itens.map(it => ({
      numero_item: it.numero_item,
      codigo_produto: it.codigo,
      descricao: it.descricao,
      cfop: it.cfop,
      ncm: it.ncm,
      quantidade_comercial: it.quantidade,
      valor_unitario_comercial: it.valor_unitario,
      quantidade_tributavel: it.quantidade,
      valor_unitario_tributavel: it.valor_unitario,
      unidade_comercial: it.unidade || "UN",
      unidade_tributavel: it.unidade || "UN",
      valor_bruto: it.valor_total,
      icms_origem: "0",
      icms_situacao_tributaria: "102", // Simples Nacional sem permissão de crédito
    })),
  };
}

async function emitirNFCeFocus(id, payload, fisc) {
  await focusGarantirEmpresaCadastrada(fisc);
  const token = fiscDecriptar(fisc.provedor_token);
  const corpo = montarPayloadFocus(payload);
  const r = await fetch(`${focusBaseUrl(fisc.ambiente)}/nfce?ref=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { Authorization: focusAuthHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const data = await r.json().catch(() => ({}));
  // 202 = aceito, ainda processando (comportamento normal e esperado aqui)
  if (!r.ok && r.status !== 202) {
    throw new Error(data.mensagem || data.erro || `Focus NFe: falha ao emitir (HTTP ${r.status})`);
  }
  return data;
}

// Varre as notas 'processando' do motor Focus e consulta o status atual —
// chamado periodicamente por um setInterval em server/index.js.
export async function verificarPendentesFocus() {
  const pendentes = db.prepare("SELECT * FROM nfce_emitidas WHERE COALESCE(motor,'novo') = 'novo' AND provedor = 'focus' AND status = 'processando'").all();
  if (pendentes.length === 0) return { verificadas: 0 };
  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  const token = fiscDecriptar(fisc.provedor_token);
  if (!token) return { verificadas: 0 };

  let atualizadas = 0;
  for (const nota of pendentes) {
    try {
      const r = await fetch(`${focusBaseUrl(fisc.ambiente)}/nfce/${encodeURIComponent(nota.id)}`, {
        headers: { Authorization: focusAuthHeader(token) },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const statusFocus = data.status; // processando_autorizacao | autorizado | erro_autorizacao | cancelado
      if (statusFocus === "processando_autorizacao") continue;
      const statusLocal = statusFocus === "autorizado" ? "autorizada" : (statusFocus === "cancelado" ? "cancelada" : "rejeitada");
      db.prepare(`UPDATE nfce_emitidas SET status = ?, protocolo = ?, motivo = ?, chave = ?, qr_code_url = ?, retorno_json = ? WHERE id = ?`)
        .run(statusLocal, data.numero_recibo || "", data.mensagem_sefaz || "", data.chave_nfe || "", data.caminho_danfe || "", JSON.stringify(data), nota.id);
      atualizadas++;
    } catch { /* tenta de novo no próximo ciclo */ }
  }
  return { verificadas: pendentes.length, atualizadas };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR "NFC-e ANTIGO" — emissão DIRETA na SEFAZ nas regras vigentes
// (pré-reforma): layout 4.00 sem grupos IBS/CBS, Simples Nacional (CSOSN 102),
// QR Code versão 2, assinatura XMLDSig com o certificado A1 e transporte SOAP
// (NFeAutorizacao4 / NFeStatusServico4). Sem provedor — o A1 assina e
// transmite daqui. Homologação = sem valor fiscal, ideal p/ testes reais.
// ═══════════════════════════════════════════════════════════════════════════

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const HOMOLOG_XPROD = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

// Cadeia ICP-Brasil (raiz + intermediária) que assina o cert TLS de
// homologacao.nfce.fazenda.sp.gov.br / nfce.fazenda.sp.gov.br (autorização e
// status) — "AC SOLUTI SSL EV G4", emitida por "Autoridade Certificadora Raiz
// Brasileira v10" (raiz self-signed do ITI). Node não traz raízes ICP-Brasil
// no bundle padrão (são PKI de governo, fora do WebTrust/Mozilla) → toda
// chamada dava "unable to get local issuer certificate" e a nota caía em
// contingência sem nunca ser autorizada. Confirmado (2026-07-15): apenas o
// intermediário NÃO resolve — o Node ainda tenta validar o issuer DELE
// (X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT); precisa da raiz self-signed também
// pra fechar a cadeia. Intermediário extraído via `openssl s_client -connect
// homologacao.nfce.fazenda.sp.gov.br:443 -showcerts`; raiz baixada de
// http://acraiz.icpbrasil.gov.br/ICP-Brasilv10.crt (repositório oficial do
// ITI). Ambas válidas até 2032-07-01 — se vencer/for reemitida, reextrair com
// o mesmo comando e atualizar aqui. NÃO afeta qrcode/consulta
// (www.*.nfce.fazenda.sp.gov.br usam GlobalSign, já confiável por padrão) nem
// a validação em si — são trust anchors adicionais, `rejectUnauthorized`
// continua true.
const ICP_BRASIL_AC_SOLUTI_SSL_EV_G4 = `-----BEGIN CERTIFICATE-----
MIIHtDCCBZygAwIBAgIJANjGl6F55VD+MA0GCSqGSIb3DQEBDQUAMIGYMQswCQYD
VQQGEwJCUjETMBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRv
IE5hY2lvbmFsIGRlIFRlY25vbG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMG
A1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2
MTAwHhcNMjMwMzIyMTgwOTExWhcNMzIwNzAxMTIwMDU5WjB3MQswCQYDVQQGEwJC
UjETMBEGA1UEChMKSUNQLUJyYXNpbDE1MDMGA1UECxMsQXV0b3JpZGFkZSBDZXJ0
aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2MTAxHDAaBgNVBAMTE0FDIFNPTFVU
SSBTU0wgRVYgRzQwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDHv3Kv
oEPrNrzImIPn17GI5vdoVxghsm6EVLMUjnM4JdCpDED+0BqZF0kycyZaiWt7jqSR
vcGm66RKzSGcHJlUgahp9qcXAmSwMn00pwvgBKb+4htp48vQc1/5MWpaBzQW4Di/
tWvNkh9URtMyhtltf2u3s9r5vgF12ff7mCu3oj0bDBIaGs/a9EtMKoCfw/ziKUp7
11JYu1fbIWVOgbW9iHE24oiE33LGLm+uToCWpjGL3n9D+q+ryfIYFoes6gPCYYSt
udDUB9lfpe83IOVcVslL3DmYd2oEncGCogO3qzaMSH3OVLMO4Rg5edERpMw5U0tA
MeyO0k5/tmnFfUM476lZl+ce2Ol56p7R2yjKxHJizeCOSmwDE5FXz7ll+Zq9C7QW
UzoPQtyT739UGEeBRTAz4KsO77frCtdifGRvX3lMfI8qeMnfvf08BK9e2dRkCHwD
iv23Aw7QIixDS9PiSsMxObgjHwroEqAAN2Mwz1B1zAuzZVUH7k6MyQQ/II/GDUpT
jT4VKnhjdIfz5aEFHx7By2XjMkx1hyeONLS/2SoDnKitE9yY/PASqWDCPCpSoJ+x
fEdyZvoawEbJfL+CMhU5I7IXgf9f7gibghIc2CG4bf6dfVAdPcGkYkcjw21dtq/G
1V2dHpOX67BbihThAVr8Z7NTgVAv4nC6MPpAywIDAQABo4ICHzCCAhswggEHBgNV
HSAEgf8wgfwwQwYFYEwBAQAwOjA4BggrBgEFBQcCARYsaHR0cDovL2FjcmFpei5p
Y3BicmFzaWwuZ292LmJyL0RQQ2FjcmFpei5wZGYwUAYGYEwBAYECMEYwRAYIKwYB
BQUHAgEWOGh0dHA6Ly9jY2QuYWNzb2x1dGkuY29tLmJyL2RvY3MvZHBjLWFjLXNv
bHV0aS1zc2wtZXYucGRmMFAGBmBMAQIBcDBGMEQGCCsGAQUFBwIBFjhodHRwOi8v
Y2NkLmFjc29sdXRpLmNvbS5ici9kb2NzL2RwYy1hYy1zb2x1dGktc3NsLWV2LnBk
ZjAHBgVngQwBATAIBgZngQwBAgIwQAYDVR0fBDkwNzA1oDOgMYYvaHR0cDovL2Fj
cmFpei5pY3BicmFzaWwuZ292LmJyL0xDUmFjcmFpenYxMC5jcmwwHwYDVR0jBBgw
FoAUdPN+//yfU3rxfOurPqSm2hi6RWMwHQYDVR0OBBYEFP4GuSyVfi/m0Lio8S+3
8i6F1dfAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQW
MBQGCCsGAQUFBwMBBggrBgEFBQcDAjBMBggrBgEFBQcBAQRAMD4wPAYIKwYBBQUH
MAKGMGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9JQ1AtQnJhc2lsdjEw
LmNydDANBgkqhkiG9w0BAQ0FAAOCAgEAABxayeHitwL18QeXSQvRZ2eiNb82IlYT
uvER4JRMzZDWoamKOqmD7KXSSj+sdBThYiRkkNiVFiMn2qoYAdylI2I4w1npbxyr
ukfXQ7tadTEiMCFva0uHHw9lpBx+oyy9rcLM7qC5qquksyhC222Yt3WbqC6Fla+L
o3GlTOpogqexeyc9hgvAQxeMmq+xyDcjSLzKmmRmMKQ9y3w7wpufXTO/0K5uOLLZ
sfyXZTw+MYYeIk2+GNv1qQBbWo3gmwlD1W0pJEHe+/KxiCRkDHpJY7Lk2Rm4bSDZ
Rr4Bn8bk/XJWpiu7Fm9b8piPKjTtstDYTzu40ccPRh9UCWDUz4nKF97dXjIgYf+a
TA0vnKdlnpPUDeBVpfyXavhGf/akFh5AO7/v6xkzWOUlawn5g614mWhOQ6ITwmua
y1spnpBO684d0bynFQfMoZGS5fdKoYKKDzp29xhBm3s9WD1f/oP79Ie0eDribpOv
j3Xsjz72MTG4+UVxuv0OIYuXDc8x1foMzVOco6DxuLel6KG5RH+m0tWmX4ouCgBK
TNUQC70AWHBa4PCF5YA7H8qVnH2EUBPo3rxOY0wN6GzyMbg9+D9l5e2Xcg7/ytqY
BIBnZKLPjzS3OqUsM9UgUKGwcEnaHnmRxH8vyVEMGnoK1cZNf9uDM9sMGgQUzKwV
wixwyINOM8U=
-----END CERTIFICATE-----`;

// Raiz self-signed "Autoridade Certificadora Raiz Brasileira v10" (ITI) —
// emissora do intermediário acima. Baixada de acraiz.icpbrasil.gov.br. Sem
// ela, o Node ainda falha em fechar a cadeia mesmo confiando no intermediário.
const ICP_BRASIL_RAIZ_V10 = `-----BEGIN CERTIFICATE-----
MIIGrDCCBJSgAwIBAgIJANLVi0S/gZNCMA0GCSqGSIb3DQEBDQUAMIGYMQswCQYD
VQQGEwJCUjETMBEGA1UECgwKSUNQLUJyYXNpbDE9MDsGA1UECww0SW5zdGl0dXRv
IE5hY2lvbmFsIGRlIFRlY25vbG9naWEgZGEgSW5mb3JtYWNhbyAtIElUSTE1MDMG
A1UEAwwsQXV0b3JpZGFkZSBDZXJ0aWZpY2Fkb3JhIFJhaXogQnJhc2lsZWlyYSB2
MTAwHhcNMTkwNzAxMTkxNTU5WhcNMzIwNzAxMTIwMDU5WjCBmDELMAkGA1UEBhMC
QlIxEzARBgNVBAoMCklDUC1CcmFzaWwxPTA7BgNVBAsMNEluc3RpdHV0byBOYWNp
b25hbCBkZSBUZWNub2xvZ2lhIGRhIEluZm9ybWFjYW8gLSBJVEkxNTAzBgNVBAMM
LEF1dG9yaWRhZGUgQ2VydGlmaWNhZG9yYSBSYWl6IEJyYXNpbGVpcmEgdjEwMIIC
IjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAk3AxKl1ZtP0pNyjChqO7qNkn
+/sClZeqiV/Kd7KnnbkDbI2y3VWcUG7feCE/deIxot6GH6JXncRG794UZl+4doD0
D0/cEwBd4DvrDSZm0RT40xhmYYOTxZDJxv+coTHdmsT5aNmSkktfjzYX4HQHh/7M
em+kTOpT/3E4K6B7KVs9HkOT7nXx5yU1qYbVWqI0qpJM9mOTSFx8C9HiKcHvLCvt
1ioXKPAmFuHPkayOcXP2MXeb+VRNjWKU4E+L2t5uZPKVx1M/9i1DztlLb4K8OfYg
GaPDUSF1sxnoGk5qZHLleO6KjCpmuQepmgsBvxi2YNO7X2YUwQQx1AXNSolgtkAR
5gt+1WzxhbFUhItQqlhqxgWHefLmiT5T/Ctz/P2v+zSO4efkkIzsi1iwD+ypZvM2
lnIvB24RcSN6jzmCahLPX4CwjwIK6JsSoMVxIhpZHCguUP4LXqP8IWUZ6WgS/4zB
7B9E0EICl2rM1PRy+6ulv+ZOW256e8a0pijUB+hXM1msUq9L92476FAAX8va3sP7
+Uut94+bGHmubcTLImWUPrxNT7QyrvE3FyHicfiHioeFL2oV4cXTLZrEq2wS8R4P
KPdSzNn5Z9e2uMEGYQaSNO+OwvVycpIhOBOqrm12wJ9ZhWKtM5UOo34/o37r5ZBI
TYXAGbhqQDB9mWXwH+0CAwEAAaOB9jCB8zBOBgNVHSAERzBFMEMGBWBMAQEAMDow
OAYIKwYBBQUHAgEWLGh0dHA6Ly9hY3JhaXouaWNwYnJhc2lsLmdvdi5ici9EUENh
Y3JhaXoucGRmMEAGA1UdHwQ5MDcwNaAzoDGGL2h0dHA6Ly9hY3JhaXouaWNwYnJh
c2lsLmdvdi5ici9MQ1JhY3JhaXp2MTAuY3JsMB8GA1UdIwQYMBaAFHTzfv/8n1N6
8Xzrqz6kptoYukVjMB0GA1UdDgQWBBR0837//J9TevF866s+pKbaGLpFYzAPBgNV
HRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQ0FAAOCAgEA
eCNhBSuy/Ih/T+1VOtAJju85SrtoE3vET1qXASpmjQllDHG/ph7VFNRAkC+gha+B
CbjoA5oJ/8wwl+Qdp1KGz6nXXFTLx3osU+kjm0srmBf9nyXHPqvFyvBeB0A7sYb7
TmII9GKD20oCxsdkccR/oE/JuTaNnGq0GYZ2aDb5v62uLi21Y6P9UBiTxZqQ4ojW
ET6kXNjlK238jpXv17FR8Sg3VusCvX7Q8eJkavvHHZDeWck2fSA+ycAc2JeL2Z0B
MSxGWpH32WM9J8+6XqCJUXHiWEV0zCE8wDYiYC+047pTxQI/gB/FcU7jvylh98DJ
kQPHd/Tp6Og3ynlDA9n9uBbxYHVRZs9vsZ/7xTFaxRe+zk8dhgKgZ/3RrcMFB570
2t8LFbyuUE/kQVY6rZ0QJ9qMWQ7VPLRwRhiMeU3k8WDJb/tBbOXHBqldTbWyQ+mp
MEDWhbrzE/IED82wAuO23Tb05cYk2xC7+Izef8fSc3XdJDuPSbcDpWukzyCDtSEH
isLiGEtIbYRiPsF3czlQPsnIEVoTTCWxHCH1zYR6zScSv18Qh69qVe2J40K5jZoP
GEOhq/oKhVJQAdvAFW5Odp7mF3Tk9nivjjsctJSxY26LFiV5GRV+07SSse4ti0aO
jO5PLg5SWjfcOtBG2rz02EIvQAmLcb0kGBtfdj0lW/w=
-----END CERTIFICATE-----`;

// Endpoints por UF. O cliente está em SP; outras UFs entram sob demanda.
const SEFAZ_NFCE_URLS = {
  SP: {
    autorizacao: {
      homologacao: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
      producao: "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
    },
    status: {
      homologacao: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
      producao: "https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
    },
    qrcode: {
      homologacao: "https://homologacao.nfce.fazenda.sp.gov.br/qrcode",
      producao: "https://www.nfce.fazenda.sp.gov.br/qrcode",
    },
    consulta: {
      homologacao: "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta",
      producao: "https://www.nfce.fazenda.sp.gov.br/consulta",
    },
  },
};

function sefazUrlsNFCe(uf, ambiente) {
  const cfg = SEFAZ_NFCE_URLS[(uf || "").toUpperCase()];
  if (!cfg) return null;
  const amb = ambiente === "producao" ? "producao" : "homologacao";
  return {
    autorizacao: cfg.autorizacao[amb], status: cfg.status[amb],
    qrcode: cfg.qrcode[amb], consulta: cfg.consulta[amb],
  };
}

// Escapa texto p/ XML (o mesmo escape do C14N: & < > nos textos, " em atributos)
function xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // controles inválidos em XML
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/\r/g, "&#xD;");
}

// Texto "fiscal": sem quebras, espaços colapsados, tamanho limitado, restrito à
// faixa de caracteres que o schema da NFe aceita (TString: \x21-\xFF). Textos
// colados de Word/WhatsApp costumam trazer travessão "–", aspas curvas "" '',
// reticências "…" ou emoji — fora dessa faixa, e a SEFAZ rejeita o lote inteiro
// com 225 "Falha no Schema XML" sem apontar o campo culpado.
function txtFiscal(s, max = 120) {
  const normalizado = String(s == null ? "" : s)
    .normalize("NFC")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x21-\xFF]/g, " ");
  return xmlEsc(normalizado.replace(/\s+/g, " ").trim().slice(0, max));
}

const dec = (v, casas = 2) => (Math.round(Number(v || 0) * 10 ** casas) / 10 ** casas).toFixed(casas);

// Data/hora de emissão em horário de Brasília (SP não tem mais horário de verão)
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // UTC-3 fixo
  const iso = d.toISOString();
  return {
    dhEmi: iso.slice(0, 19) + "-03:00",
    aamm: iso.slice(2, 4) + iso.slice(5, 7),
  };
}

// Extrai chave privada + certificado (PEM) do A1 guardado, via node-forge (em
// memória, sem OpenSSL). Retorna { keyPem, certPem, chainPem, certB64 } —
// certB64 = DER base64 p/ o KeyInfo da assinatura XMLDSig.
function extrairMaterialA1() {
  const r = db.prepare("SELECT cert_data, cert_senha FROM fiscal_config WHERE id = 1").get() || {};
  const pfxB64 = fiscDecriptar(r.cert_data);
  const senha = fiscDecriptar(r.cert_senha);
  if (!pfxB64) throw new Error("Certificado A1 não enviado. Envie o .pfx na aba Fiscal / NFC-e.");

  let p12;
  try {
    p12 = decodificarPkcs12(pfxB64, senha);
  } catch (e) {
    const msg = String((e && e.message) || "");
    throw new Error(RE_SENHA_ERRADA.test(msg) ? "Senha do certificado incorreta." : "Não foi possível ler o certificado A1: " + msg);
  }

  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
  const keyBag = shrouded[0] || plain[0];
  if (!keyBag || !keyBag.key) throw new Error("Não foi possível extrair a chave privada do certificado A1.");

  const { leaf, chain } = extrairCertLeaf(p12);
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certPem = forge.pki.certificateToPem(leaf);
  const chainPem = chain.map(c => forge.pki.certificateToPem(c)).join("\n");
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  return { keyPem, certPem, chainPem, certB64 };
}

// Assinatura XMLDSig da infNFe (C14N inclusiva + RSA-SHA1, padrão NF-e).
// A infNFe é gerada já em forma canônica (xmlns declarado, sem espaços,
// atributos em ordem), então o digest é sobre a própria string.
export function assinarInfNFe(infNFeXml, chave, keyPem, certB64) {
  const digest = createHash("sha1").update(infNFeXml, "utf8").digest("base64");
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#NFe${chave}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;
  const assinatura = createSign("RSA-SHA1").update(signedInfo, "utf8").sign(keyPem, "base64");
  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo.replace(` xmlns="http://www.w3.org/2000/09/xmldsig#"`, "") +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

// QR Code v2 (emissão online): p = chave|2|tpAmb|idCSC|SHA1(chave|2|tpAmb|idCSC + CSC)
export function montarQrCodeV2(chave, tpAmb, cscId, csc, urlQr) {
  const idCsc = String(parseInt(cscId, 10) || 0); // sem zeros à esquerda
  const dados = `${chave}|2|${tpAmb}|${idCsc}`;
  const hash = createHash("sha1").update(dados + csc, "utf8").digest("hex").toUpperCase();
  return `${urlQr}?p=${dados}|${hash}`;
}

// POST SOAP 1.2 na SEFAZ com TLS mútuo (chave/cert do A1 em PEM)
function postSefaz(url, soapAction, xmlBody, { keyPem, certPem, chainPem }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = Buffer.from(xmlBody, "utf8");
    const req = httpsRequest({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      key: keyPem,
      cert: certPem + (chainPem ? "\n" + chainPem : ""),
      // Trust anchors extra p/ verificar o cert TLS do servidor da SEFAZ (raiz
      // ICP-Brasil, fora do bundle padrão do Node) — ver comentário nas constantes.
      ca: [...tls.rootCertificates, ICP_BRASIL_AC_SOLUTI_SSL_EV_G4, ICP_BRASIL_RAIZ_V10],
      minVersion: "TLSv1.2",
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
        "Content-Length": body.length,
      },
      timeout: 30000,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
      });
    });
    req.on("timeout", () => { req.destroy(new Error("Tempo esgotado ao falar com a SEFAZ (30s).")); });
    req.on("error", reject);
    req.end(body);
  });
}

const soap12 = (wsdlNs, inner) =>
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
  `<soap12:Body><nfeDadosMsg xmlns="${wsdlNs}">${inner}</nfeDadosMsg></soap12:Body>` +
  `</soap12:Envelope>`;

const xmlTag = (xml, nome) => {
  const m = String(xml || "").match(new RegExp(`<(?:[\\w]+:)?${nome}[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${nome}>`));
  return m ? m[1].trim() : "";
};

// Valida a config p/ emissão real e devolve tudo pronto (lança erro claro se faltar algo)
function prepararEmissaoAntigo() {
  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  const faltas = [];
  const cnpj = (fisc.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) faltas.push("CNPJ (14 dígitos)");
  if (!fisc.razao_social) faltas.push("Razão social");
  if (!fisc.inscricao_estadual || /isento/i.test(fisc.inscricao_estadual)) faltas.push("Inscrição Estadual válida (NFC-e exige IE)");
  if (!fisc.logradouro || !fisc.numero || !fisc.bairro || !fisc.municipio) faltas.push("Endereço fiscal completo");
  if ((fisc.codigo_municipio || "").replace(/\D/g, "").length !== 7) faltas.push("Código IBGE do município (7 dígitos)");
  if ((fisc.cep || "").replace(/\D/g, "").length !== 8) faltas.push("CEP (8 dígitos)");
  fisc.uf = String(fisc.uf || "").trim().toUpperCase();
  if (!UF_CODIGO[fisc.uf]) faltas.push("UF (sigla válida de 2 letras, ex.: SP)");
  if (!fisc.cert_data) faltas.push("Certificado A1 (aba Fiscal / NFC-e)");
  if (!fisc.csc || !fisc.csc_id) faltas.push("CSC e ID do CSC (gerados no portal da SEFAZ — homologação tem CSC próprio)");
  if (!["simples", "mei"].includes(fisc.regime_tributario || "simples")) faltas.push("Regime: o motor antigo cobre Simples Nacional/MEI (CSOSN 102)");
  if (faltas.length) throw new Error("Complete antes de emitir: " + faltas.join(" · "));

  if (fisc.cert_validade_fim && new Date(fisc.cert_validade_fim) < new Date()) {
    throw new Error("Certificado A1 vencido em " + new Date(fisc.cert_validade_fim).toLocaleDateString("pt-BR") + ".");
  }
  const urls = sefazUrlsNFCe(fisc.uf, fisc.ambiente);
  if (!urls) throw new Error(`UF ${fisc.uf} ainda não suportada pelo motor próprio (disponível: SP).`);
  return { fisc, cnpj, urls, csc: fiscDecriptar(fisc.csc) };
}

// Monta a infNFe canônica (regras vigentes) + dados auxiliares
export function montarXmlNFCeAntigo(pedido, fisc, cnpj, { numero, serie, tpAmb }) {
  const { dhEmi, aamm } = agoraBrasilia();
  const uf = String(fisc.uf || "").trim().toUpperCase();
  const cUF = String(UF_CODIGO[uf] || 35);
  const nNF = String(numero);
  let cNF;
  do { cNF = String(Math.floor(Math.random() * 1e8)).padStart(8, "0"); }
  while (cNF === nNF.padStart(8, "0"));
  const chave = gerarChaveAcesso({ cUF, cnpj, modelo: "65", serie, numero, tpEmis: "1", cNF, aammEmissao: aamm });
  const cDV = chave.slice(-1);

  const ncmPadrao = (fisc.ncm_padrao || "21069090").padStart(8, "0");
  const cfopPadrao = fisc.cfop_padrao || "5102";
  const crt = fisc.regime_tributario === "mei" ? "4" : "1";

  // Itens — puxa NCM/CEST/UM/EAN do cadastro do produto quando existir.
  // Precedência: item (snapshot) → cadastro → default do estabelecimento.
  const itens = (pedido.itens || []).map((it, i) => {
    const adicionais = it.adicionais || [];
    const vAdic = adicionais.reduce((s, a) => s + (a.preco || 0) * (a.quantidade || 1), 0);
    const vUnit = Math.round(((it.preco_unitario || 0) + vAdic) * 100) / 100;
    const qtd = it.quantidade || 1;
    const vProd = Math.round(vUnit * qtd * 100) / 100;
    const nomeCompleto = it.produto_nome + (adicionais.length ? " c/ " + adicionais.map(a => a.nome).join(", ") : "");
    const xProd = (tpAmb === "2" && i === 0) ? HOMOLOG_XPROD : txtFiscal(nomeCompleto);
    let prod = null;
    if (it.produto_id) { try { prod = buscarProduto(it.produto_id); } catch {} }
    let porPeso = false;
    if (prod) {
      try { const cfg = typeof prod.config === "string" ? JSON.parse(prod.config || "{}") : (prod.config || {}); porPeso = cfg.venda_por_peso === true; } catch {}
    }
    const umProduto = (prod?.um || "").trim().toUpperCase();
    const um = porPeso ? "KG" : (umProduto || "UN");
    const ncm = ((it.ncm || prod?.ncm || ncmPadrao) + "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
    const cest = ((it.cest || prod?.cest || "") + "").replace(/\D/g, "").slice(0, 7);
    const ean = ((it.codigo_barras || prod?.codigo_barras || "") + "").replace(/\D/g, "");
    const cEAN = /^(\d{8}|\d{12,14})$/.test(ean) ? ean : "SEM GTIN";
    return { seq: i + 1, cProd: txtFiscal(prod?.codigo || it.codigo || it.produto_id || String(i + 1), 60), xProd, ncm, cest, cEAN, cfop: (it.cfop || cfopPadrao), um, qtd, vUnit, vProd };
  });
  const vNF = Math.round(itens.reduce((s, it) => s + it.vProd, 0) * 100) / 100;

  const detXml = itens.map(it =>
    `<det nItem="${it.seq}">` +
    `<prod>` +
    `<cProd>${it.cProd}</cProd><cEAN>${it.cEAN}</cEAN><xProd>${it.xProd}</xProd>` +
    `<NCM>${it.ncm}</NCM>` +
    (it.cest ? `<CEST>${it.cest.padStart(7, "0")}</CEST>` : "") +
    `<CFOP>${it.cfop}</CFOP>` +
    `<uCom>${it.um}</uCom><qCom>${dec(it.qtd, 4)}</qCom><vUnCom>${dec(it.vUnit)}</vUnCom><vProd>${dec(it.vProd)}</vProd>` +
    `<cEANTrib>${it.cEAN}</cEANTrib><uTrib>${it.um}</uTrib><qTrib>${dec(it.qtd, 4)}</qTrib><vUnTrib>${dec(it.vUnit)}</vUnTrib>` +
    `<indTot>1</indTot>` +
    `</prod>` +
    // PIS/COFINS são obrigatórios pelo XSD em TODO item (minOccurs=1), mesmo
    // no Simples Nacional — sem eles a SEFAZ rejeita com 225 "Falha no Schema
    // XML do lote de NFe" antes de checar qualquer regra de negócio. CST 49
    // ("Outras Operações de Saída", valores zerados) é o default seguro mais
    // usado por emissores de Simples Nacional — não exige justificar uma
    // isenção específica.
    `<imposto>` +
    `<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>` +
    `<PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>` +
    `<COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>` +
    `</imposto>` +
    `</det>`
  ).join("");

  // Pagamento (regras vigentes: tPag; 99 exige xPag)
  // Cartão débito/crédito → 99 (Outros) porque não há terminal integrado;
  // a adquirente (Stone/Cielo) já reporta a transação à Receita separadamente.
  const mapaPgto = { pix: "17", dinheiro: "01", credito: "99", debito: "99" };
  const xPagDesc = { credito: "Cartao Credito", debito: "Cartao Debito" };
  const tPag = mapaPgto[pedido.metodo_pagamento] || "99";
  const xPag = xPagDesc[pedido.metodo_pagamento] || "Outros";
  const trocoPara = Number(pedido.troco_para || 0);
  const temTroco = tPag === "01" && trocoPara > vNF;
  const vPag = temTroco ? trocoPara : vNF;
  const pagXml =
    `<pag><detPag><tPag>${tPag}</tPag>` +
    (tPag === "99" ? `<xPag>${xPag}</xPag>` : "") +
    `<vPag>${dec(vPag)}</vPag></detPag>` +
    (temTroco ? `<vTroco>${dec(trocoPara - vNF)}</vTroco>` : "") +
    `</pag>`;

  // Destinatário: só quando há CPF (NFC-e permite consumidor não identificado)
  const cpf = String(pedido.cliente_cpf || "").replace(/\D/g, "");
  const destXml = cpf.length === 11
    ? `<dest><CPF>${cpf}</CPF><xNome>${tpAmb === "2" ? xmlEsc("NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL") : txtFiscal(pedido.cliente_nome || "CONSUMIDOR", 60)}</xNome><indIEDest>9</indIEDest></dest>`
    : "";

  const ideXml =
    `<ide>` +
    `<cUF>${cUF}</cUF><cNF>${cNF}</cNF><natOp>VENDA AO CONSUMIDOR</natOp>` +
    `<mod>65</mod><serie>${parseInt(serie, 10) || 1}</serie><nNF>${nNF}</nNF>` +
    `<dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest>` +
    `<cMunFG>${(fisc.codigo_municipio || "").replace(/\D/g, "")}</cMunFG>` +
    `<tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${cDV}</cDV><tpAmb>${tpAmb}</tpAmb>` +
    `<finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres>` +
    `<procEmi>0</procEmi><verProc>NEXUS-FDC 1.0</verProc>` +
    `</ide>`;

  const emitXml =
    `<emit>` +
    `<CNPJ>${cnpj}</CNPJ><xNome>${txtFiscal(fisc.razao_social, 60)}</xNome>` +
    (fisc.nome_fantasia ? `<xFant>${txtFiscal(fisc.nome_fantasia, 60)}</xFant>` : "") +
    `<enderEmit>` +
    `<xLgr>${txtFiscal(fisc.logradouro, 60)}</xLgr><nro>${txtFiscal(fisc.numero, 60)}</nro>` +
    `<xBairro>${txtFiscal(fisc.bairro, 60)}</xBairro>` +
    `<cMun>${(fisc.codigo_municipio || "").replace(/\D/g, "")}</cMun><xMun>${txtFiscal(fisc.municipio, 60)}</xMun>` +
    `<UF>${uf}</UF><CEP>${(fisc.cep || "").replace(/\D/g, "")}</CEP>` +
    `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
    `</enderEmit>` +
    `<IE>${(fisc.inscricao_estadual || "").replace(/\D/g, "")}</IE><CRT>${crt}</CRT>` +
    `</emit>`;

  const totalXml =
    `<total><ICMSTot>` +
    `<vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP>` +
    `<vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>` +
    `<vProd>${dec(vNF)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>` +
    `<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>` +
    `<vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${dec(vNF)}</vNF>` +
    `</ICMSTot></total>`;

  const infAdicXml = pedido.id
    ? `<infAdic><infCpl>${txtFiscal("Pedido " + String(pedido.id).slice(0, 6) + " - NEXUS Frente de Caixa", 200)}</infCpl></infAdic>`
    : "";

  const infNFe =
    `<infNFe xmlns="${NFE_NS}" Id="NFe${chave}" versao="4.00">` +
    ideXml + emitXml + destXml + detXml + totalXml +
    `<transp><modFrete>9</modFrete></transp>` +
    pagXml + infAdicXml +
    `</infNFe>`;

  return { infNFe, chave, vNF, dhEmi };
}

// Consulta o status do serviço na SEFAZ (teste real de conectividade + certificado).
// Exige apenas certificado A1 + UF suportada — dá pra testar antes de completar o resto.
export async function consultarStatusSefazAntigo() {
  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  if (!fisc.cert_data) throw new Error("Envie o certificado A1 na aba Fiscal / NFC-e antes de testar.");
  const urls = sefazUrlsNFCe(fisc.uf, fisc.ambiente);
  if (!urls) throw new Error(`UF "${fisc.uf || "—"}" ainda não suportada pelo motor próprio (disponível: SP). Configure a UF no endereço fiscal.`);
  const material = extrairMaterialA1();
  const tpAmb = fisc.ambiente === "producao" ? "1" : "2";
  const cUF = String(UF_CODIGO[fisc.uf] || 35);
  const cons = `<consStatServ xmlns="${NFE_NS}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const wsdl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4";
  const resp = await postSefaz(urls.status, `${wsdl}/nfeStatusServicoNF`, soap12(wsdl, cons), material);
  const cStat = xmlTag(resp, "cStat");
  const xMotivo = xmlTag(resp, "xMotivo");
  return {
    ok: cStat === "107",
    cStat, motivo: xMotivo || "(sem retorno)",
    tempo_medio: xmlTag(resp, "tMed"),
    ambiente: fisc.ambiente, uf: fisc.uf,
  };
}

// Emite uma NFC-e REAL pelo motor antigo (regras vigentes). pedidoId opcional:
// sem pedido, emite uma nota de teste de R$ 1,00 (use homologação!).
export async function emitirNFCeAntigo(pedidoId) {
  const { fisc, cnpj, urls, csc } = prepararEmissaoAntigo();
  const tpAmb = fisc.ambiente === "producao" ? "1" : "2";

  let pedido;
  if (pedidoId) {
    pedido = buscarPedido(pedidoId);
    if (!pedido) throw new Error("Pedido não encontrado.");
    pedido.itens = buscarItensPedido(pedidoId);
    if (!pedido.itens.length) throw new Error("Pedido sem itens.");
  } else {
    pedido = {
      id: null, cliente_nome: "", cliente_cpf: "", metodo_pagamento: "dinheiro", troco_para: 0,
      itens: [{ produto_id: "TESTE", produto_nome: "PRODUTO TESTE", quantidade: 1, preco_unitario: 1.0, adicionais: [] }],
    };
  }

  const numero = fisc.antigo_proximo_numero || 1;
  const serie = fisc.antigo_serie || "1";
  const material = extrairMaterialA1();

  const { infNFe, chave, vNF } = montarXmlNFCeAntigo(pedido, fisc, cnpj, { numero, serie, tpAmb });
  const signature = assinarInfNFe(infNFe, chave, material.keyPem, material.certB64);
  const qrUrl = montarQrCodeV2(chave, tpAmb, fisc.csc_id, csc, urls.qrcode);
  const infNFeSupl = `<infNFeSupl><qrCode>${xmlEsc(qrUrl)}</qrCode><urlChave>${xmlEsc(urls.consulta)}</urlChave></infNFeSupl>`;
  const nfeXml = `<NFe xmlns="${NFE_NS}">${infNFe}${infNFeSupl}${signature}</NFe>`;
  const enviNFe = `<enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${Date.now()}</idLote><indSinc>1</indSinc>${nfeXml}</enviNFe>`;

  const id = gerarId();
  let cStat = "", xMotivo = "", nProt = "", retorno = "", status = "pendente";
  try {
    const wsdl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
    retorno = await postSefaz(urls.autorizacao, `${wsdl}/nfeAutorizacaoLote`, soap12(wsdl, enviNFe), material);
    const prot = (retorno.match(/<protNFe[\s\S]*?<\/protNFe>/) || [""])[0];
    cStat = xmlTag(prot, "cStat") || xmlTag(retorno, "cStat");
    xMotivo = xmlTag(prot, "xMotivo") || xmlTag(retorno, "xMotivo") || "(sem retorno da SEFAZ)";
    nProt = xmlTag(prot, "nProt");
    status = cStat === "100" ? "autorizada" : "rejeitada";
    if (status === "rejeitada") {
      console.error(`[fiscal-antigo] REJEITADA cStat=${cStat} xMotivo=${xMotivo}`);
      console.error(`[fiscal-antigo] enviNFe (primeiros 2000 chars):\n${enviNFe.slice(0, 2000)}`);
    }
  } catch (err) {
    // Falha de COMUNICAÇÃO (timeout, SEFAZ fora do ar, sem internet) — não é uma
    // rejeição de dados. Contingência: a nota fica assinada e "pendente"; a venda
    // segue normal e um job em background (reenviarPendentesAntigo) tenta de novo
    // periodicamente até a SEFAZ autorizar. Nunca lança erro pra quem chamou —
    // quem fecha a venda não pode travar esperando a SEFAZ responder.
    status = "pendente";
    xMotivo = "Contingência: " + (err.message || "falha de comunicação com a SEFAZ") + " — será reenviada automaticamente.";
  }

  // XML guardado: nfeProc quando autorizada; senão a NFe assinada (p/ diagnóstico)
  const protBloco = (retorno.match(/<protNFe[\s\S]*?<\/protNFe>/) || [""])[0];
  const xmlGuardado = status === "autorizada"
    ? `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${nfeXml}${protBloco}</nfeProc>`
    : `<?xml version="1.0" encoding="UTF-8"?>` + nfeXml;

  db.prepare(`INSERT INTO nfce_emitidas
    (id, pedido_id, numero, serie, modelo, ambiente, chave, status, protocolo, motivo, valor_total, qr_code_url, provedor, payload_json, retorno_json, motor, xml_assinado)
    VALUES (?, ?, ?, ?, '65', ?, ?, ?, ?, ?, ?, ?, 'sefaz-direto', ?, ?, 'antigo', ?)`)
    .run(
      id, pedidoId || null, numero, serie, fisc.ambiente, chave, status, nProt,
      (cStat ? cStat + " - " : "") + xMotivo, vNF, qrUrl,
      JSON.stringify({ numero, serie, tpAmb, vNF, itens: pedido.itens.length }),
      String(retorno).slice(0, 60000), xmlGuardado
    );

  // Avança a numeração quando a SEFAZ consumiu o número (autorizada ou duplicidade)
  if (["100", "150", "204"].includes(cStat)) {
    db.prepare("UPDATE fiscal_config SET antigo_proximo_numero = ? WHERE id = 1").run(numero + 1);
  }

  return db.prepare("SELECT id, pedido_id, numero, serie, ambiente, chave, status, protocolo, motivo, valor_total, qr_code_url, created_at FROM nfce_emitidas WHERE id = ?").get(id);
}

export function listarNFCeAntigo(limit = 20) {
  return db.prepare("SELECT id, pedido_id, numero, serie, ambiente, chave, status, protocolo, motivo, valor_total, qr_code_url, created_at FROM nfce_emitidas WHERE motor = 'antigo' ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function diagnosticoNFCeAntigo() {
  return db.prepare(
    `SELECT id, numero, serie, ambiente, chave, status, motivo, valor_total, retorno_json, created_at
     FROM nfce_emitidas WHERE motor = 'antigo' ORDER BY created_at DESC LIMIT 5`
  ).all();
}

export function obterXmlNFCeAntigo(id) {
  const r = db.prepare("SELECT numero, serie, chave, xml_assinado FROM nfce_emitidas WHERE id = ? AND motor = 'antigo'").get(id);
  if (!r || !r.xml_assinado) return null;
  return r;
}

// Reenvia notas em contingência (status='pendente') pra SEFAZ-SP — chamado
// periodicamente via setInterval em index.js. Reusa o XML já assinado (não
// re-assina, não gera número novo): é a MESMA nota tentando de novo.
export async function reenviarPendentesAntigo() {
  const pendentes = db.prepare("SELECT * FROM nfce_emitidas WHERE motor = 'antigo' AND status = 'pendente'").all();
  if (!pendentes.length) return;

  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  let material;
  try { material = extrairMaterialA1(); } catch { return; } // sem certificado — tenta de novo no próximo tick
  const urls = sefazUrlsNFCe(fisc.uf, fisc.ambiente);
  if (!urls) return;
  const wsdl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";

  for (const nota of pendentes) {
    const nfeXml = (nota.xml_assinado || "").match(/<NFe[\s\S]*?<\/NFe>/)?.[0];
    if (!nfeXml) continue;
    if (!/<PIS>/.test(nfeXml)) {
      db.prepare("UPDATE nfce_emitidas SET status='erro', motivo='XML gerado antes da correção de PIS/COFINS — não pode ser reenviado' WHERE id=?").run(nota.id);
      console.log(`[fiscal-antigo] nota ${nota.numero}/${nota.serie} descartada: XML antigo sem PIS/COFINS`);
      continue;
    }
    const enviNFe = `<enviNFe xmlns="${NFE_NS}" versao="4.00"><idLote>${Date.now()}</idLote><indSinc>1</indSinc>${nfeXml}</enviNFe>`;
    try {
      const retorno = await postSefaz(urls.autorizacao, `${wsdl}/nfeAutorizacaoLote`, soap12(wsdl, enviNFe), material);
      const prot = (retorno.match(/<protNFe[\s\S]*?<\/protNFe>/) || [""])[0];
      const cStat = xmlTag(prot, "cStat") || xmlTag(retorno, "cStat");
      const xMotivo = xmlTag(prot, "xMotivo") || xmlTag(retorno, "xMotivo") || "(sem retorno da SEFAZ)";
      const nProt = xmlTag(prot, "nProt");
      const status = cStat === "100" ? "autorizada" : "rejeitada";
      const xmlFinal = status === "autorizada"
        ? `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NFE_NS}" versao="4.00">${nfeXml}${prot}</nfeProc>`
        : nota.xml_assinado;
      db.prepare("UPDATE nfce_emitidas SET status=?, protocolo=?, motivo=?, retorno_json=?, xml_assinado=? WHERE id=?")
        .run(status, nProt, (cStat ? cStat + " - " : "") + xMotivo, String(retorno).slice(0, 60000), xmlFinal, nota.id);
      console.log(`[fiscal-antigo] contingência resolvida: nota ${nota.numero}/${nota.serie} → ${status}`);
    } catch {
      // Ainda sem resposta — continua pendente, tenta de novo no próximo tick.
    }
  }
}

// ─── RELATÓRIO FISCAL MENSAL (envio automático pra contabilidade via n8n) ────
// Reúne as notas autorizadas do mês (dos dois motores) pra montar o e-mail.
export function montarRelatorioFiscalMensal(anoMes) {
  const notas = db.prepare(
    `SELECT id, numero, serie, motor, chave, valor_total, qr_code_url, created_at
     FROM nfce_emitidas
     WHERE status = 'autorizada' AND strftime('%Y-%m', created_at) = ?
     ORDER BY created_at ASC`
  ).all(anoMes);
  const total = notas.reduce((s, n) => s + (n.valor_total || 0), 0);
  return { periodo: anoMes, quantidade: notas.length, total, notas };
}

export function marcarRelatorioFiscalEnviado(anoMes) {
  db.prepare("UPDATE fiscal_config SET relatorio_ultimo_mes_enviado = ? WHERE id = 1").run(anoMes);
}

// Verifica se o relatório do mês anterior já deve ser enviado (dia configurado
// já passou) e ainda não foi (evita duplicar). Retorna null se não é hora ainda.
export function verificarEnvioRelatorioFiscalPendente() {
  const r = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
  if (!r.email_contabilidade || !r.n8n_webhook_relatorio) return null;
  if (new Date().getDate() < (r.relatorio_dia_mes || 5)) return null;
  const d = new Date();
  d.setDate(1);              // evita overflow de mês (ex: dia 31 - 1 mês vira mês errado)
  d.setMonth(d.getMonth() - 1);
  const mesReferencia = d.toISOString().slice(0, 7); // YYYY-MM
  if (r.relatorio_ultimo_mes_enviado === mesReferencia) return null;
  return { mesReferencia, email_contabilidade: r.email_contabilidade, n8n_webhook_relatorio: r.n8n_webhook_relatorio };
}

// ─── DOCUMENTOS FISCAIS DO MÊS (download no Suporte) ─────────────────────────
// Meses que têm ao menos uma nota autorizada — alimenta a navegação entre meses.
export function mesesComNotasFiscais() {
  return db.prepare(
    `SELECT strftime('%Y-%m', created_at) AS mes, COUNT(*) AS quantidade,
            COALESCE(SUM(valor_total), 0) AS total
     FROM nfce_emitidas
     WHERE status = 'autorizada'
     GROUP BY mes ORDER BY mes DESC`
  ).all();
}

// Notas AUTORIZADAS do mês (dos dois motores), com o XML assinado quando existe.
// Base tanto do resumo (meta) quanto do pacote .zip pra download.
export function documentosFiscaisDoMes(anoMes) {
  const notas = db.prepare(
    `SELECT id, numero, serie, motor, chave, status, valor_total, qr_code_url,
            xml_assinado, created_at
     FROM nfce_emitidas
     WHERE status = 'autorizada' AND strftime('%Y-%m', created_at) = ?
     ORDER BY numero ASC, created_at ASC`
  ).all(anoMes);
  const total = notas.reduce((s, n) => s + (n.valor_total || 0), 0);
  const comXml = notas.filter(n => (n.xml_assinado || "").trim()).length;
  return { periodo: anoMes, quantidade: notas.length, total, com_xml: comXml, notas };
}

// ─── ANALYTICS DO CARDÁPIO (T10) ─────────────────────────────────────────────

export function registrarVisita() {
  db.prepare("INSERT INTO visitas DEFAULT VALUES").run();
}

export function getCardapioStats() {
  const c = (sql, ...p) => db.prepare(sql).get(...p);
  const visitasTotal = c("SELECT COUNT(*) v FROM visitas").v;
  const visitas7d = c("SELECT COUNT(*) v FROM visitas WHERE created_at >= datetime('now','-7 days')").v;
  const pedidosTotal = c("SELECT COUNT(*) v FROM pedidos").v;
  const pedidos7d = c("SELECT COUNT(*) v FROM pedidos WHERE created_at >= datetime('now','-7 days')").v;
  const receita7d = c("SELECT COALESCE(SUM(total),0) v FROM pedidos WHERE created_at >= datetime('now','-7 days') AND status != 'cancelado'").v;
  const serie = db.prepare(
    "SELECT date(created_at) d, COUNT(*) c FROM visitas WHERE created_at >= datetime('now','-7 days') GROUP BY date(created_at) ORDER BY d"
  ).all();
  return {
    visitasTotal, visitas7d, pedidosTotal, pedidos7d, receita7d,
    conversao: visitasTotal > 0 ? pedidosTotal / visitasTotal : 0,
    conversao7d: visitas7d > 0 ? pedidos7d / visitas7d : 0,
    serie,
  };
}

// ─── RANKING DE VENDAS (produtos e adicionais) ───────────────────────────────
// Agrega itens de pedidos (online/delivery/retirada) + comandas (mesa),
// ignorando os cancelados. Retorna métricas por produto e por adicional.
export function getRankingVendas() {
  const pedidoRows = db.prepare(`
    SELECT pi.produto_id, pi.produto_nome, pi.quantidade, pi.preco_unitario, pi.custo_unitario, pi.adicionais
    FROM pedido_itens pi JOIN pedidos p ON p.id = pi.pedido_id
    WHERE p.status != 'cancelado'
  `).all();
  const comandaRows = db.prepare(`
    SELECT ci.produto_id, ci.produto_nome, ci.quantidade, ci.preco_unitario, ci.adicionais
    FROM comanda_itens ci JOIN comandas c ON c.id = ci.comanda_id
    WHERE c.status != 'cancelada' AND ci.status != 'cancelado'
  `).all();

  // Mapa de produtos para categoria + custo de referência
  const prods = db.prepare("SELECT id, nome, categoria, custo FROM produtos").all();
  const prodById = {}, prodByNome = {};
  for (const p of prods) { prodById[p.id] = p; prodByNome[(p.nome || "").toLowerCase()] = p; }

  const porProduto = {};
  const porAdicional = {};

  const acumular = (row, temCusto) => {
    const prod = (row.produto_id && prodById[row.produto_id]) || prodByNome[(row.produto_nome || "").toLowerCase()];
    const key = row.produto_id || ("nome:" + (row.produto_nome || ""));
    if (!porProduto[key]) {
      porProduto[key] = {
        produto_id: row.produto_id || null,
        nome: row.produto_nome || (prod && prod.nome) || "Sem nome",
        categoria: (prod && prod.categoria) || "Sem categoria",
        quantidade: 0, faturamento: 0, custo: 0, ocorrencias: 0,
      };
    }
    const it = porProduto[key];
    const qtd = Number(row.quantidade) || 0;
    const preco = Number(row.preco_unitario) || 0;
    it.quantidade += qtd;
    it.faturamento += qtd * preco;
    const custoU = (temCusto && row.custo_unitario != null) ? Number(row.custo_unitario) : (prod ? Number(prod.custo) || 0 : 0);
    it.custo += qtd * custoU;
    it.ocorrencias += 1;

    let ads = [];
    try { ads = JSON.parse(row.adicionais || "[]"); } catch { ads = []; }
    for (const a of ads) {
      const nome = a.nome || "Adicional";
      const aKey = nome.toLowerCase();
      if (!porAdicional[aKey]) porAdicional[aKey] = { nome, quantidade: 0, faturamento: 0, ocorrencias: 0 };
      const aq = (Number(a.quantidade) || 1) * qtd;
      porAdicional[aKey].quantidade += aq;
      porAdicional[aKey].faturamento += aq * (Number(a.preco) || 0);
      porAdicional[aKey].ocorrencias += 1;
    }
  };

  for (const r of pedidoRows) acumular(r, true);
  for (const r of comandaRows) acumular(r, false);

  const produtos = Object.values(porProduto).map(p => ({ ...p, margem: p.faturamento - p.custo }));
  const adicionais = Object.values(porAdicional);
  const categorias = [...new Set(produtos.map(p => p.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { produtos, adicionais, categorias };
}

// ─── CATEGORIAS ─────────────────────────────────────────────────────────────

export function listarCategorias({ cardapio_id, incluirCardapios = false } = {}) {
  let rows;
  if (cardapio_id) {
    rows = db.prepare(`
      SELECT c.* FROM categorias c
      INNER JOIN cardapio_categorias cc ON cc.categoria_id = c.id
      WHERE cc.cardapio_id = ? AND c.deleted_at IS NULL
      ORDER BY c.ordem ASC, c.nome ASC
    `).all(cardapio_id);
  } else {
    rows = db.prepare("SELECT * FROM categorias WHERE deleted_at IS NULL ORDER BY ordem ASC, nome ASC").all();
  }
  // Anexa lista de cardápios de cada categoria (útil pra view "Todos") e sinaliza órfãs.
  if (incluirCardapios) {
    const cardStmt = db.prepare(`
      SELECT ca.id, ca.nome, ca.icone FROM cardapios ca
      INNER JOIN cardapio_categorias cc ON cc.cardapio_id = ca.id
      WHERE cc.categoria_id = ?
      ORDER BY ca.ordem ASC, ca.nome ASC
    `);
    for (const r of rows) {
      r.cardapios = cardStmt.all(r.id);
      r.orfao = r.cardapios.length === 0;
    }
  }
  return rows;
}

export function buscarCategoria(id) {
  return db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function buscarCategoriaPorNome(nome) {
  return db.prepare("SELECT * FROM categorias WHERE nome = ? AND deleted_at IS NULL").get(nome);
}

export function criarCategoria({ nome, permite_adicionais, cardapio_id }) {
  const id = gerarId();
  // Nova categoria entra no fim
  const max = db.prepare("SELECT COALESCE(MAX(ordem), -1) AS m FROM categorias WHERE deleted_at IS NULL").get().m;
  db.prepare(
    "INSERT INTO categorias (id, nome, permite_adicionais, ordem) VALUES (?, ?, ?, ?)"
  ).run(id, nome, permite_adicionais ? 1 : 0, max + 1);
  // Vincula automaticamente ao cardápio ativo se enviado
  if (cardapio_id) {
    try {
      db.prepare("INSERT OR IGNORE INTO cardapio_categorias (cardapio_id, categoria_id) VALUES (?, ?)").run(cardapio_id, id);
    } catch { /* ignore */ }
  }
  return buscarCategoria(id);
}

export function atualizarCategoria(id, { nome, permite_adicionais, ordem }) {
  const atual = buscarCategoria(id);
  if (!atual) return null;
  const novoNome = nome !== undefined ? nome : atual.nome;
  const novoPerm = permite_adicionais !== undefined ? (permite_adicionais ? 1 : 0) : atual.permite_adicionais;
  const novaOrdem = ordem !== undefined && ordem !== null ? Number(ordem) : atual.ordem;
  db.prepare(
    "UPDATE categorias SET nome = ?, permite_adicionais = ?, ordem = ? WHERE id = ?"
  ).run(novoNome, novoPerm, novaOrdem, id);
  return buscarCategoria(id);
}

export function reordenarCategorias(ids) {
  // ids: array de IDs na ordem desejada
  const upd = db.prepare("UPDATE categorias SET ordem = ? WHERE id = ?");
  const tx = db.transaction((arr) => {
    arr.forEach((id, i) => upd.run(i, id));
  });
  tx(ids);
  return listarCategorias();
}

export function excluirCategoria(id) {
  // Soft delete: como nome é UNIQUE, anexa __del__{epoch} pra liberar o nome
  // (na restauração, o sufixo é removido)
  const atual = db.prepare("SELECT nome FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!atual) return false;
  const novoNome = `${atual.nome}__del__${Date.now()}`;
  return db.prepare("UPDATE categorias SET nome = ?, deleted_at = datetime('now') WHERE id = ?").run(novoNome, id).changes > 0;
}

// ─── ADICIONAIS ─────────────────────────────────────────────────────────────

// Parse do JSON de categorias_ids antes de devolver pro frontend. Se null
// (adicional legacy), mantém null — o front decide o fallback pro categoria_id
// solo. Se preenchido, retorna array de ids (mesmo vazio).
function _parseAdicionalRow(r) {
  if (!r) return r;
  let cats = null;
  if (r.categorias_ids != null) {
    try { cats = JSON.parse(r.categorias_ids); } catch { cats = null; }
    if (!Array.isArray(cats)) cats = null;
  }
  return { ...r, categorias_ids: cats };
}

export function listarAdicionais(apenasDisponiveis = false, { cardapio_id, incluirCardapios = false } = {}) {
  const filtroDisp = apenasDisponiveis ? "AND a.disponivel = 1" : "";
  let rows;
  if (cardapio_id) {
    rows = db.prepare(`
      SELECT a.* FROM adicionais a
      INNER JOIN cardapio_adicionais ca ON ca.adicional_id = a.id
      WHERE ca.cardapio_id = ? AND a.deleted_at IS NULL ${filtroDisp}
      ORDER BY a.nome
    `).all(cardapio_id);
  } else {
    const sql = apenasDisponiveis
      ? "SELECT * FROM adicionais a WHERE a.disponivel = 1 AND a.deleted_at IS NULL ORDER BY a.nome"
      : "SELECT * FROM adicionais a WHERE a.deleted_at IS NULL ORDER BY a.nome";
    rows = db.prepare(sql).all();
  }
  rows = rows.map(_parseAdicionalRow);
  if (incluirCardapios) {
    const cardStmt = db.prepare(`
      SELECT ca.id, ca.nome, ca.icone FROM cardapios ca
      INNER JOIN cardapio_adicionais cac ON cac.cardapio_id = ca.id
      WHERE cac.adicional_id = ?
      ORDER BY ca.ordem ASC, ca.nome ASC
    `);
    for (const r of rows) {
      r.cardapios = cardStmt.all(r.id);
      r.orfao = r.cardapios.length === 0;
    }
  }
  return rows;
}

export function buscarAdicional(id) {
  return _parseAdicionalRow(db.prepare("SELECT * FROM adicionais WHERE id = ? AND deleted_at IS NULL").get(id));
}

// Normaliza categorias_ids vindo do front: null (não mexeu) = mantém legado,
// [] = explicitamente NENHUMA categoria, [ids] = essas categorias específicas.
function _serializarCategoriasIds(v) {
  if (v === undefined || v === null) return null; // não define — mantém legacy
  if (!Array.isArray(v)) return null;
  return JSON.stringify(v.filter(x => typeof x === "string" && x.length > 0));
}

export function criarAdicional({ nome, preco, custo, disponivel, max_quantidade, categoria_id, categorias_ids, cardapio_id }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO adicionais (id, nome, preco, custo, disponivel, max_quantidade, categoria_id, categorias_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, nome, preco, custo || 0,
    disponivel !== undefined ? (disponivel ? 1 : 0) : 1,
    Math.max(0, parseInt(max_quantidade, 10) || 0),
    categoria_id || null,
    _serializarCategoriasIds(categorias_ids),
  );
  // Vincula automaticamente ao cardápio ativo se enviado
  if (cardapio_id) {
    try {
      db.prepare("INSERT OR IGNORE INTO cardapio_adicionais (cardapio_id, adicional_id) VALUES (?, ?)").run(cardapio_id, id);
    } catch { /* ignore */ }
  }
  return buscarAdicional(id);
}

export function atualizarAdicional(id, { nome, preco, custo, disponivel, max_quantidade, categoria_id, categorias_ids }) {
  const result = db.prepare(
    "UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ?, max_quantidade = ?, categoria_id = ?, categorias_ids = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(
    nome, preco, custo || 0,
    disponivel ? 1 : 0,
    Math.max(0, parseInt(max_quantidade, 10) || 0),
    categoria_id || null,
    _serializarCategoriasIds(categorias_ids),
    id
  );
  if (result.changes === 0) return null;
  return buscarAdicional(id);
}

export function excluirAdicional(id) {
  return db.prepare("UPDATE adicionais SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── PRODUTOS ───────────────────────────────────────────────────────────────

export function listarProdutos(apenasDisponiveis = false) {
  if (apenasDisponiveis) {
    return db.prepare("SELECT * FROM produtos WHERE disponivel = 1 AND deleted_at IS NULL ORDER BY categoria, nome").all();
  }
  return db.prepare("SELECT * FROM produtos WHERE deleted_at IS NULL ORDER BY categoria, nome").all();
}

export function buscarProduto(id) {
  return db.prepare("SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL").get(id);
}

// config: JSON por segmento (ex.: { tamanhos: [{nome,preco}] }). Aceita objeto ou string.
function normalizarConfigJson(config) {
  if (config == null) return null;
  if (typeof config === "string") { try { JSON.parse(config); return config; } catch { return null; } }
  try { return JSON.stringify(config); } catch { return null; }
}

// Mapeia (ou cria) categoria de estoque a partir do nome de categoria do produto.
// Espelho por categoria mantém o filtro do Estoque ("Por cardápio") coerente.
function garantirCategoriaEstoquePorNome(nomeCat) {
  const n = (nomeCat || "").trim();
  if (!n) return null;
  const ex = db.prepare("SELECT id FROM estoque_categorias WHERE lower(nome) = lower(?)").get(n);
  if (ex) return ex.id;
  const id = gerarId();
  try { db.prepare("INSERT INTO estoque_categorias (id, nome) VALUES (?, ?)").run(id, n); return id; }
  catch { const r = db.prepare("SELECT id FROM estoque_categorias WHERE lower(nome) = lower(?)").get(n); return r?.id || null; }
}

// Sincroniza um estoque_item de REVENDA espelhado por código do produto.
// Chamado ao salvar produto com pertence_estoque=1. Sem código próprio nem
// código de barras não faz nada (sem chave estável não dá pra espelhar).
export function sincronizarEspelhoEstoqueDoProduto(produto) {
  if (!produto) return null;
  const chave = String(produto.codigo || produto.codigo_barras || "").trim();
  if (!chave) return null;
  const catId = garantirCategoriaEstoquePorNome(produto.categoria);
  const existente = db.prepare("SELECT * FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(chave);
  const um = (produto.um || "un").trim();
  const custo = Number(produto.custo) || 0;
  const codigoBarras = (produto.codigo_barras || "").trim();
  const ncm = (produto.ncm || "").trim();
  const cest = (produto.cest || "").trim();
  const descricao = (produto.descricao || "").trim();
  const precoVenda = Number(produto.preco) || 0;
  if (existente) {
    db.prepare(`UPDATE estoque_itens
      SET nome = ?, unidade = ?, custo_manual = ?,
          categoria_id = COALESCE(?, categoria_id),
          tipo = CASE WHEN tipo IN ('insumo','interno') THEN tipo ELSE 'revenda' END,
          ativo = 1,
          codigo_barras = ?, ncm = ?, cest = ?, descricao = ?, preco_venda = ?
      WHERE id = ?`)
      .run(produto.nome, um, custo, catId, codigoBarras, ncm, cest, descricao, precoVenda, existente.id);
    return existente.id;
  }
  const id = gerarId();
  db.prepare(`INSERT INTO estoque_itens (id, codigo, nome, unidade, categoria_id, saldo_atual, custo_manual, ativo, eh_insumo, tipo, codigo_barras, ncm, cest, descricao, preco_venda)
              VALUES (?, ?, ?, ?, ?, 0, ?, 1, 0, 'revenda', ?, ?, ?, ?, ?)`)
    .run(id, chave, produto.nome, um, catId, custo, codigoBarras, ncm, cest, descricao, precoVenda);
  return id;
}

// Desativa o espelho quando o cliente desmarca "Pertence ao estoque" — não apaga
// pra preservar histórico de movimentações do item.
function desativarEspelhoEstoqueDoProduto(produto) {
  const chave = String(produto?.codigo || produto?.codigo_barras || "").trim();
  if (!chave) return;
  db.prepare("UPDATE estoque_itens SET ativo = 0 WHERE codigo = ? AND deleted_at IS NULL AND tipo = 'revenda'").run(chave);
}

export function criarProduto({ nome, descricao, preco, custo, categoria, imagem, disponivel, codigo, config,
                               codigo_barras, ncm, cest, um, pertence_estoque }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO produtos (id, nome, descricao, preco, custo, categoria, imagem, disponivel, codigo, config, codigo_barras, ncm, cest, um, pertence_estoque) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, nome, descricao || "", preco, custo || 0, categoria || "", imagem || "",
    disponivel !== undefined ? (disponivel ? 1 : 0) : 1,
    (codigo || "").trim(), normalizarConfigJson(config) || "{}",
    (codigo_barras || "").trim(), (ncm || "").trim(), (cest || "").trim(),
    (um || "un").trim(), pertence_estoque ? 1 : 0
  );
  const criado = buscarProduto(id);
  if (pertence_estoque) sincronizarEspelhoEstoqueDoProduto(criado);
  return criado;
}

export function atualizarProduto(id, { nome, descricao, preco, custo, categoria, imagem, disponivel, codigo, config,
                                        codigo_barras, ncm, cest, um, pertence_estoque }) {
  const anterior = buscarProduto(id);
  if (!anterior) return null;
  const result = db.prepare(
    `UPDATE produtos SET
       nome = ?, descricao = ?, preco = ?, custo = ?, categoria = ?, imagem = ?, disponivel = ?,
       codigo = COALESCE(?, codigo),
       config = COALESCE(?, config),
       codigo_barras = COALESCE(?, codigo_barras),
       ncm = COALESCE(?, ncm),
       cest = COALESCE(?, cest),
       um = COALESCE(?, um),
       pertence_estoque = COALESCE(?, pertence_estoque)
     WHERE id = ? AND deleted_at IS NULL`
  ).run(
    nome, descricao || "", preco, custo || 0, categoria || "", imagem || "", disponivel ? 1 : 0,
    codigo != null ? String(codigo).trim() : null,
    normalizarConfigJson(config),
    codigo_barras != null ? String(codigo_barras).trim() : null,
    ncm != null ? String(ncm).trim() : null,
    cest != null ? String(cest).trim() : null,
    um != null ? String(um).trim() : null,
    pertence_estoque != null ? (pertence_estoque ? 1 : 0) : null,
    id
  );
  if (result.changes === 0) return null;
  const atualizado = buscarProduto(id);
  // Espelho de estoque: liga/desliga só quando muda o flag pertence_estoque.
  if (pertence_estoque != null) {
    if (pertence_estoque) sincronizarEspelhoEstoqueDoProduto(atualizado);
    else if (anterior.pertence_estoque) desativarEspelhoEstoqueDoProduto(atualizado);
  } else if (atualizado.pertence_estoque) {
    // Não mudou o flag mas está ligado — reflete nome/UM/custo/categoria no espelho.
    sincronizarEspelhoEstoqueDoProduto(atualizado);
  }
  return atualizado;
}

export function buscarProdutoPorCodigo(codigo) {
  const c = (codigo || "").trim();
  if (!c) return null;
  // Bate tanto no código interno quanto no EAN — a mesma rota serve pra leitor de código de barras.
  return db.prepare("SELECT * FROM produtos WHERE (codigo = ? OR codigo_barras = ?) AND deleted_at IS NULL AND disponivel = 1").get(c, c);
}

export function excluirProduto(id) {
  return db.prepare("UPDATE produtos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── IMPORTAÇÃO EM LOTE ─────────────────────────────────────────────────────
// Recebe { itens: [...], cardapio_id }. Idempotente: se o produto já existe
// pelo mesmo `codigo`, atualiza. Se veio categoria nova, cria e vincula ao
// cardápio informado. Retorna resumo (criados/atualizados/erros/categorias).
export function importarProdutosEmLote({ itens, cardapio_id }) {
  const relatorio = { criados: 0, atualizados: 0, erros: [], categorias_criadas: [] };
  if (!Array.isArray(itens) || itens.length === 0) return relatorio;

  // Cache de categorias existentes por nome (case-insensitive) — evita 1 query por linha
  const cats = db.prepare("SELECT id, nome FROM categorias WHERE deleted_at IS NULL").all();
  const catPorNome = new Map(cats.map(c => [c.nome.toLowerCase(), c]));

  const vinculaCat = cardapio_id
    ? db.prepare("INSERT OR IGNORE INTO cardapio_categorias (cardapio_id, categoria_id) VALUES (?, ?)")
    : null;

  const garantirCategoria = (nomeCat) => {
    const n = (nomeCat || "").trim();
    if (!n) return "";
    let c = catPorNome.get(n.toLowerCase());
    if (!c) {
      const nova = criarCategoria({ nome: n, permite_adicionais: false, cardapio_id });
      c = { id: nova.id, nome: nova.nome };
      catPorNome.set(n.toLowerCase(), c);
      relatorio.categorias_criadas.push(nova.nome);
    } else if (vinculaCat) {
      try { vinculaCat.run(cardapio_id, c.id); } catch {}
    }
    return c.nome;
  };

  for (const [i, raw] of itens.entries()) {
    try {
      const nome = String(raw.nome || "").trim();
      const preco = Number(raw.preco);
      if (!nome) { relatorio.erros.push({ linha: i + 1, msg: "sem nome" }); continue; }
      if (!isFinite(preco) || preco < 0) { relatorio.erros.push({ linha: i + 1, msg: `preço inválido em "${nome}"` }); continue; }

      const categoriaNome = garantirCategoria(raw.categoria);
      const payload = {
        nome, preco,
        descricao: raw.descricao || "",
        custo: Number(raw.custo) || 0,
        categoria: categoriaNome,
        imagem: "",
        disponivel: raw.disponivel !== false,
        codigo: String(raw.codigo || "").trim(),
        codigo_barras: String(raw.codigo_barras || "").trim(),
        ncm: String(raw.ncm || "").trim(),
        cest: String(raw.cest || "").trim(),
        um: String(raw.um || "un").trim(),
        pertence_estoque: raw.pertence_estoque ? 1 : 0,
      };

      // Idempotência: se veio código, tenta reaproveitar produto existente.
      const chaveCodigo = payload.codigo || payload.codigo_barras;
      const existente = chaveCodigo
        ? db.prepare("SELECT id FROM produtos WHERE (codigo = ? OR codigo_barras = ?) AND deleted_at IS NULL").get(chaveCodigo, chaveCodigo)
        : null;

      if (existente) {
        atualizarProduto(existente.id, payload);
        relatorio.atualizados++;
      } else {
        const criado = criarProduto(payload);
        // Saldo inicial no espelho (opcional)
        const saldoIni = Number(raw.estoque_inicial);
        const minimo = Number(raw.estoque_minimo);
        if (payload.pertence_estoque && (isFinite(saldoIni) || isFinite(minimo))) {
          const chave = payload.codigo || payload.codigo_barras;
          if (chave) {
            const item = db.prepare("SELECT id FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(chave);
            if (item) {
              const sets = [];
              const vals = [];
              if (isFinite(saldoIni)) { sets.push("saldo_atual = ?"); vals.push(saldoIni); }
              if (isFinite(minimo)) { sets.push("estoque_minimo = ?"); vals.push(minimo); }
              vals.push(item.id);
              db.prepare(`UPDATE estoque_itens SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
            }
          }
        }
        relatorio.criados++;
      }
    } catch (err) {
      relatorio.erros.push({ linha: i + 1, msg: err.message });
    }
  }
  return relatorio;
}

// ─── PROMOÇÕES (produtos com eh_promocao = 1) ───────────────────────────────

// Lista todas as promoções cadastradas (independente de vigência) — admin
export function listarPromocoes() {
  return db.prepare(
    "SELECT * FROM produtos WHERE eh_promocao = 1 AND deleted_at IS NULL ORDER BY promo_data_fim DESC, nome ASC"
  ).all();
}

// Lista somente promoções "ativas agora" — usadas no cardápio público
// Vigência: janela datetime contínua [inicio, fim]
//   inicio = promo_data_inicio + promo_hora_inicio (default 00:00)
//   fim    = promo_data_fim    + promo_hora_fim    (default 23:59)
// Isso modela corretamente promoções que atravessam meia-noite
// (ex: começa Sex 19:00 → termina Sáb 01:00 = bloco contínuo de 6h).
export function listarPromocoesAtivas() {
  const promos = db.prepare(
    "SELECT * FROM produtos WHERE eh_promocao = 1 AND disponivel = 1 AND deleted_at IS NULL"
  ).all();

  // Datetime atual em BRT (UTC-3) — formato YYYY-MM-DDTHH:MM
  const agora = new Date();
  agora.setUTCHours(agora.getUTCHours() - 3);
  const agoraIso = agora.toISOString().slice(0, 16);

  return promos.filter(p => {
    const inicio = p.promo_data_inicio
      ? `${p.promo_data_inicio}T${p.promo_hora_inicio || "00:00"}`
      : null;
    const fim = p.promo_data_fim
      ? `${p.promo_data_fim}T${p.promo_hora_fim || "23:59"}`
      : null;
    if (inicio && agoraIso < inicio) return false;
    if (fim    && agoraIso > fim)    return false;
    return true;
  });
}

// Cria uma promoção. Recebe os campos de produto + os de promoção.
// A categoria é fixada em "Promoções".
export function criarPromocao(dados) {
  const id = gerarId();
  // Garante categoria "Promoções"
  const cat = db.prepare("SELECT nome FROM categorias WHERE nome = 'Promoções' AND deleted_at IS NULL").get();
  const categoriaPromo = cat ? cat.nome : "Promoções";

  db.prepare(`
    INSERT INTO produtos (
      id, nome, descricao, preco, custo, categoria, imagem, disponivel,
      eh_promocao, preco_de, promo_data_inicio, promo_data_fim,
      promo_dias_semana, promo_hora_inicio, promo_hora_fim, promo_destaque, promo_descricao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dados.nome,
    dados.descricao || "",
    Number(dados.preco) || 0,
    Number(dados.custo) || 0,
    categoriaPromo,
    dados.imagem || "",
    dados.disponivel === false ? 0 : 1,
    dados.preco_de != null ? Number(dados.preco_de) : null,
    dados.promo_data_inicio || null,
    dados.promo_data_fim || null,
    dados.promo_dias_semana ? JSON.stringify(dados.promo_dias_semana) : null,
    dados.promo_hora_inicio || null,
    dados.promo_hora_fim || null,
    dados.promo_destaque === false ? 0 : 1,
    dados.promo_descricao || null,
  );
  return buscarProduto(id);
}

export function atualizarPromocao(id, dados) {
  const atual = buscarProduto(id);
  if (!atual || !atual.eh_promocao) return null;
  const novo = (k, fallback) => dados[k] !== undefined ? dados[k] : fallback;

  db.prepare(`
    UPDATE produtos SET
      nome = ?, descricao = ?, preco = ?, custo = ?, imagem = ?, disponivel = ?,
      preco_de = ?, promo_data_inicio = ?, promo_data_fim = ?,
      promo_dias_semana = ?, promo_hora_inicio = ?, promo_hora_fim = ?,
      promo_destaque = ?, promo_descricao = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(
    novo("nome", atual.nome),
    novo("descricao", atual.descricao || ""),
    Number(novo("preco", atual.preco)),
    Number(novo("custo", atual.custo)),
    novo("imagem", atual.imagem || ""),
    novo("disponivel", atual.disponivel) ? 1 : 0,
    dados.preco_de !== undefined ? (dados.preco_de != null ? Number(dados.preco_de) : null) : atual.preco_de,
    dados.promo_data_inicio !== undefined ? (dados.promo_data_inicio || null) : atual.promo_data_inicio,
    dados.promo_data_fim    !== undefined ? (dados.promo_data_fim    || null) : atual.promo_data_fim,
    dados.promo_dias_semana !== undefined
      ? (dados.promo_dias_semana ? JSON.stringify(dados.promo_dias_semana) : null)
      : atual.promo_dias_semana,
    dados.promo_hora_inicio !== undefined ? (dados.promo_hora_inicio || null) : atual.promo_hora_inicio,
    dados.promo_hora_fim    !== undefined ? (dados.promo_hora_fim    || null) : atual.promo_hora_fim,
    dados.promo_destaque !== undefined ? (dados.promo_destaque ? 1 : 0) : atual.promo_destaque,
    dados.promo_descricao !== undefined ? (dados.promo_descricao || null) : atual.promo_descricao,
    id,
  );
  return buscarProduto(id);
}

// ─── PRODUTO IMAGENS ──────────────────────────────────────────────────────────

export function listarImagensProduto(produtoId) {
  return db.prepare("SELECT id, produto_id, ordem, imagem FROM produto_imagens WHERE produto_id = ? ORDER BY ordem ASC, created_at ASC").all(produtoId);
}

export function adicionarImagemProduto({ produto_id, imagem, ordem = 0 }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO produto_imagens (id, produto_id, imagem, ordem) VALUES (?, ?, ?, ?)"
  ).run(id, produto_id, imagem, ordem);
  return { id, produto_id, imagem, ordem };
}

export function removerImagemProduto(id) {
  return db.prepare("DELETE FROM produto_imagens WHERE id = ?").run(id).changes > 0;
}

export function reordenarImagensProduto(produtoId, ids) {
  const update = db.prepare("UPDATE produto_imagens SET ordem = ? WHERE id = ? AND produto_id = ?");
  const tx = db.transaction(() => { ids.forEach((id, i) => update.run(i, id, produtoId)); });
  tx();
}

// ─── ENDERECOS ─────────────────────────────────────────────────────────

export function listarEnderecos(clienteId) {
  return db.prepare("SELECT * FROM enderecos WHERE cliente_id = ? ORDER BY created_at DESC").all(clienteId);
}

export function buscarEndereco(id) {
  return db.prepare("SELECT * FROM enderecos WHERE id = ?").get(id);
}

export function criarEndereco({ cliente_id, cep, rua, numero, bairro, referencia }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO enderecos (id, cliente_id, cep, rua, numero, bairro, referencia) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, cliente_id, cep || "", rua || "", numero || "", bairro || "", referencia || "");
  return buscarEndereco(id);
}

export function excluirEndereco(id) {
  return db.prepare("DELETE FROM enderecos WHERE id = ?").run(id).changes > 0;
}

// ─── PEDIDOS ────────────────────────────────────────────────────────────────

export function listarPedidos(clienteId = null) {
  if (clienteId) {
    return db.prepare("SELECT * FROM pedidos WHERE cliente_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(clienteId);
  }
  return db.prepare("SELECT * FROM pedidos WHERE deleted_at IS NULL ORDER BY created_at DESC").all();
}

// Busca pedidos pelo telefone do cliente (compara só os dígitos, ignora máscara/DDI 55)
export function listarPedidosPorTelefone(telefone) {
  const numeros = String(telefone || "").replace(/\D/g, "");
  if (!numeros) return [];
  // Variantes possíveis: com/sem DDI 55, últimos 10 ou 11 dígitos
  const sufixo = numeros.length > 11 ? numeros.slice(-11) : numeros;
  // Compara dígitos extraídos do telefone armazenado com sufixo do telefone consultado
  return db.prepare(
    `SELECT * FROM pedidos
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cliente_telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
       AND deleted_at IS NULL
     ORDER BY created_at DESC`
  ).all(`%${sufixo}%`);
}

export function buscarPedido(id) {
  return db.prepare("SELECT * FROM pedidos WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function buscarItensPedido(pedidoId) {
  return db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(pedidoId).map(item => ({
    ...item,
    adicionais: JSON.parse(item.adicionais || "[]"),
  }));
}

export function contarPedidosPendentes() {
  const row = db.prepare("SELECT COUNT(*) as count FROM pedidos WHERE status = 'pendente' AND deleted_at IS NULL").get();
  return row.count;
}

export function criarPedido({ cliente_id, cliente_nome, cliente_telefone, cliente_email, itens, obs, tipo, metodo_pagamento, troco_para, tipo_entrega, endereco, desconto, emitir_nfce, cliente_cpf }) {
  const id = gerarId();

  // Calcular total considerando adicionais
  const bruto = itens.reduce((s, item) => {
    const adicionaisTotal = (item.adicionais || []).reduce((a, ad) => a + ad.preco * (ad.quantidade || 1), 0);
    return s + (item.preco_unitario + adicionaisTotal) * item.quantidade;
  }, 0);
  const desc = Math.max(0, Math.min(Number(desconto) || 0, bruto));
  const total = Math.max(0, bruto - desc);

  const end = endereco || {};

  const inserirPedido = db.prepare(
    "INSERT INTO pedidos (id, cliente_id, cliente_nome, cliente_telefone, cliente_email, total, desconto, obs, tipo, metodo_pagamento, troco_para, tipo_entrega, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_referencia, emitir_nfce, cliente_cpf, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now'))"
  );
  const inserirItem = db.prepare(
    "INSERT INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais, por_peso, peso_desejado_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    const tipoEnt = ['retirada', 'casa', 'balcao'].includes(tipo_entrega) ? tipo_entrega : 'entrega';
    inserirPedido.run(id, cliente_id || null, cliente_nome || "", cliente_telefone || "", cliente_email || "", total, desc, obs || "", tipo || "online", metodo_pagamento || "", (troco_para && Number(troco_para) > 0) ? Number(troco_para) : null, tipoEnt, end.cep || "", end.rua || "", end.numero || "", end.bairro || "", end.referencia || "", emitir_nfce ? 1 : 0, (cliente_cpf || "").replace(/\D/g, ""));
    for (const item of itens) {
      // Buscar custo do produto no banco. Se o frontend enviou custo_unitario
      // (pizzaria v2 com multiplicador por tamanho), usa esse valor no lugar
      // do custo base do produto.
      const produtoDB = buscarProduto(item.produto_id);
      const custoProduto = (item.custo_unitario != null && !isNaN(Number(item.custo_unitario)))
        ? Number(item.custo_unitario)
        : (produtoDB ? produtoDB.custo : 0);
      // Somar custos dos adicionais
      const adicionaisComCusto = (item.adicionais || []).map(ad => {
        const adDB = buscarAdicional(ad.id);
        return { ...ad, custo: adDB ? adDB.custo : 0 };
      });
      const custoAdicionais = adicionaisComCusto.reduce((s, a) => s + (a.custo || 0) * (a.quantidade || 1), 0);
      const custoTotal = custoProduto + custoAdicionais;

      // Item por peso (peixaria/açougue): quantidade = kg pedido pelo cliente;
      // peso_desejado_kg guarda o valor ORIGINAL imutável pra calcular tolerância
      // depois que o lojista pesar a peça real.
      const porPeso = item.por_peso ? 1 : 0;
      const pesoDesejadoKg = porPeso ? Number(item.quantidade) : null;

      inserirItem.run(
        gerarId(), id, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario,
        custoTotal, JSON.stringify(adicionaisComCusto), porPeso, pesoDesejadoKg
      );
    }
  });

  transaction();
  return { ...buscarPedido(id), itens: buscarItensPedido(id) };
}

export function atualizarStatusPedido(id, status) {
  const result = db.prepare("UPDATE pedidos SET status = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ? AND deleted_at IS NULL").run(status, id);
  if (result.changes === 0) return null;
  return buscarPedido(id);
}

export function excluirPedido(id) {
  // Soft delete — pedido_itens permanece junto e volta junto na restauração
  return db.prepare("UPDATE pedidos SET deleted_at = datetime('now'), updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── VENDA POR PESO — pesagem, tolerância, confirmação ────────────────────
// Tolerância fixa em 20% (LTS): peça pesada dentro de ±20% do peso pedido segue
// direto (ajusta e avisa); fora disso trava o pedido em 'aguardando_confirmacao'
// pra o cliente aprovar via WhatsApp.
const TOLERANCIA_PESO_PCT = 0.20;

export function pedidoTemPorPeso(pedidoId) {
  const r = db.prepare("SELECT COUNT(*) AS c FROM pedido_itens WHERE pedido_id = ? AND por_peso = 1").get(pedidoId);
  return (r?.c || 0) > 0;
}

// Recalcula o total do pedido a partir dos itens (usado depois de ajustar peso).
// Mesma matemática do `criarPedido`: total = Σ (preço + adicionais) × quantidade − desconto.
function recalcularTotalPedido(pedidoId) {
  const itens = db.prepare("SELECT quantidade, preco_unitario, adicionais FROM pedido_itens WHERE pedido_id = ?").all(pedidoId);
  const p = db.prepare("SELECT desconto FROM pedidos WHERE id = ?").get(pedidoId) || {};
  const desc = Number(p.desconto || 0);
  const bruto = itens.reduce((s, it) => {
    let ads = 0;
    try { ads = (JSON.parse(it.adicionais || "[]")).reduce((a, x) => a + (Number(x.preco) || 0) * (Number(x.quantidade) || 1), 0); } catch {}
    return s + ((Number(it.preco_unitario) || 0) + ads) * Number(it.quantidade || 0);
  }, 0);
  const total = Math.max(0, bruto - Math.max(0, Math.min(desc, bruto)));
  db.prepare("UPDATE pedidos SET total = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(total, pedidoId);
  return total;
}

// Confere se TODOS os itens por_peso do pedido estão dentro da tolerância —
// usado pra decidir se dá pra destravar um pedido 'aguardando_confirmacao'
// depois de corrigir o peso de um item (pedido pode ter mais de um item por peso).
function todosItensDentroTolerancia(pedidoId) {
  const itens = db.prepare("SELECT quantidade, peso_desejado_kg FROM pedido_itens WHERE pedido_id = ? AND por_peso = 1").all(pedidoId);
  return itens.every(it => {
    const desejado = Number(it.peso_desejado_kg || 0);
    if (desejado <= 0) return true;
    const diferenca = Math.abs(Number(it.quantidade || 0) - desejado) / desejado;
    return diferenca <= TOLERANCIA_PESO_PCT;
  });
}

// Registra o peso REAL medido na balança pra um item por_peso. Pode ser chamada
// mais de uma vez pro mesmo item (reajuste, ex: lojista pesou errado ou o
// cliente trocou de peça) — cada chamada sobrescreve a `quantidade` anterior.
// Retorna { pedido, item, dentro_tolerancia, diferenca_pct, novo_status, total_anterior, total_novo, eh_ajuste }.
// - Dentro da tolerância → mantém o status atual (o lojista segue o fluxo normal).
//   Se o pedido já estava 'aguardando_confirmacao' e TODOS os itens por peso
//   agora estão dentro da tolerância, destrava de volta pra 'confirmado'.
// - Fora da tolerância → move o pedido pra 'aguardando_confirmacao' (trava até o
//   cliente responder pelo WhatsApp e o lojista clicar Confirmou/Recusou).
export function registrarPesoItem(pedidoId, itemId, pesoRealKg) {
  const peso = Number(pesoRealKg);
  if (!peso || peso <= 0) throw new Error("Peso inválido");
  const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(pedidoId);
  if (!pedido) throw new Error("Pedido não encontrado");
  if (pedido.status === "entregue" || pedido.status === "cancelado") {
    throw new Error("Pedido já finalizado — não é possível ajustar o peso");
  }
  const item = db.prepare("SELECT * FROM pedido_itens WHERE id = ? AND pedido_id = ?").get(itemId, pedidoId);
  if (!item) throw new Error("Item não encontrado");
  if (!item.por_peso) throw new Error("Item não é vendido por peso");
  const desejado = Number(item.peso_desejado_kg || item.quantidade || 0);
  if (desejado <= 0) throw new Error("Peso desejado do item não registrado");

  const ehAjuste = Number(item.quantidade) !== desejado;
  const totalAnterior = Number((db.prepare("SELECT total FROM pedidos WHERE id = ?").get(pedidoId) || {}).total || 0);

  db.prepare("UPDATE pedido_itens SET quantidade = ? WHERE id = ?").run(peso, itemId);
  const totalNovo = recalcularTotalPedido(pedidoId);

  const diferencaPct = Math.abs(peso - desejado) / desejado;
  const dentro = diferencaPct <= TOLERANCIA_PESO_PCT;

  let novoStatus = null;
  if (!dentro) {
    db.prepare("UPDATE pedidos SET status = 'aguardando_confirmacao', updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(pedidoId);
    novoStatus = "aguardando_confirmacao";
  } else if (pedido.status === "aguardando_confirmacao" && todosItensDentroTolerancia(pedidoId)) {
    db.prepare("UPDATE pedidos SET status = 'confirmado', updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(pedidoId);
    novoStatus = "confirmado";
  }

  return {
    pedido: buscarPedido(pedidoId),
    item: db.prepare("SELECT * FROM pedido_itens WHERE id = ?").get(itemId),
    dentro_tolerancia: dentro,
    diferenca_pct: diferencaPct,
    novo_status: novoStatus,
    total_anterior: totalAnterior,
    total_novo: totalNovo,
    peso_desejado_kg: desejado,
    peso_real_kg: peso,
    eh_ajuste: ehAjuste,
  };
}

// Cliente aprovou o ajuste de peso via WhatsApp — lojista destrava o pedido
// (volta pra 'confirmado' pra seguir pra entrega).
export function confirmarPesagem(pedidoId) {
  const p = buscarPedido(pedidoId);
  if (!p) throw new Error("Pedido não encontrado");
  if (p.status !== "aguardando_confirmacao") throw new Error("Pedido não está aguardando confirmação");
  db.prepare("UPDATE pedidos SET status = 'confirmado', updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(pedidoId);
  return buscarPedido(pedidoId);
}

// Cliente recusou — cancela o pedido.
export function recusarPesagem(pedidoId, motivo) {
  const p = buscarPedido(pedidoId);
  if (!p) throw new Error("Pedido não encontrado");
  if (p.status !== "aguardando_confirmacao") throw new Error("Pedido não está aguardando confirmação");
  const obs = (motivo && String(motivo).trim()) ? String(motivo).slice(0, 200) : "Cliente recusou o ajuste de peso";
  db.prepare("UPDATE pedidos SET status = 'cancelado', obs = CASE WHEN obs = '' THEN ? ELSE obs || ' | ' || ? END, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(obs, obs, pedidoId);
  return buscarPedido(pedidoId);
}

// ─── SINCRONIZAÇÃO local ↔ nuvem (cozinha simultânea) ────────────────────────
// Mirror de pedidos entre o PDV desktop e a plataforma online, por updated_at.

// Pedidos alterados desde um instante ISO (inclui excluídos p/ propagar remoção).
export function pedidosAlteradosDesde(desdeIso) {
  const desde = desdeIso || "1970-01-01T00:00:00";
  const linhas = db.prepare(
    "SELECT * FROM pedidos WHERE COALESCE(updated_at, created_at) > ? ORDER BY COALESCE(updated_at, created_at) ASC LIMIT 500"
  ).all(desde);
  return linhas.map(p => ({
    ...p,
    deleted: !!p.deleted_at,
    itens: db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(p.id),
  }));
}

// Upsert de um pedido vindo do outro lado. NÃO dispara efeitos colaterais
// (lançamento financeiro / NFC-e) — é só espelho de dados. Last-write-wins.
// Retorna 'inserido' | 'atualizado' | 'ignorado'.
export function upsertPedidoSync(p) {
  if (!p || !p.id) return "ignorado";
  const existente = db.prepare("SELECT id, updated_at, created_at FROM pedidos WHERE id = ?").get(p.id);
  const incomingTs = p.updated_at || p.created_at || "1970-01-01T00:00:00";

  const cols = [
    "cliente_id", "cliente_nome", "cliente_telefone", "cliente_email", "status", "total", "obs",
    "tipo", "metodo_pagamento", "troco_para", "tipo_entrega", "endereco_cep", "endereco_rua",
    "endereco_numero", "endereco_bairro", "endereco_referencia", "created_at", "updated_at", "deleted_at",
  ];
  const valores = {
    cliente_id: p.cliente_id ?? null, cliente_nome: p.cliente_nome ?? "", cliente_telefone: p.cliente_telefone ?? "",
    cliente_email: p.cliente_email ?? "", status: p.status ?? "pendente", total: p.total ?? 0, obs: p.obs ?? "",
    tipo: p.tipo ?? "online", metodo_pagamento: p.metodo_pagamento ?? "", troco_para: p.troco_para ?? null,
    tipo_entrega: p.tipo_entrega ?? "entrega", endereco_cep: p.endereco_cep ?? "", endereco_rua: p.endereco_rua ?? "",
    endereco_numero: p.endereco_numero ?? "", endereco_bairro: p.endereco_bairro ?? "", endereco_referencia: p.endereco_referencia ?? "",
    created_at: p.created_at ?? incomingTs, updated_at: incomingTs, deleted_at: p.deleted ? (p.deleted_at || incomingTs) : null,
  };

  const gravarItens = () => {
    // itens são imutáveis após a criação: só insere se ainda não houver
    const jaTem = db.prepare("SELECT COUNT(*) c FROM pedido_itens WHERE pedido_id = ?").get(p.id).c;
    if (jaTem === 0 && Array.isArray(p.itens)) {
      const ins = db.prepare("INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais, por_peso, peso_desejado_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      // Proteção defensiva: se o produto_id vindo do sync não existe local
      // (cardápio online do cliente tem produtos diferentes do PDV desktop),
      // troca por "" — pedido_itens.produto_id é NOT NULL sem FK aqui, mas
      // a coluna vazia sinaliza "produto externo" e o nome preserva a info.
      const produtoExiste = db.prepare("SELECT 1 FROM produtos WHERE id = ? AND deleted_at IS NULL");
      for (const it of p.itens) {
        let produtoId = it.produto_id || "";
        if (produtoId && !produtoExiste.get(produtoId)) produtoId = "";
        ins.run(it.id || gerarId(), p.id, produtoId, it.produto_nome || "", it.quantidade || 1,
          it.preco_unitario || 0, it.custo_unitario || 0, typeof it.adicionais === "string" ? it.adicionais : JSON.stringify(it.adicionais || []),
          it.por_peso ? 1 : 0, it.peso_desejado_kg ?? null);
      }
    }
  };

  const tx = db.transaction(() => {
    if (!existente) {
      db.prepare(`INSERT INTO pedidos (id, ${cols.join(", ")}) VALUES (@id, ${cols.map(c => "@" + c).join(", ")})`).run({ id: p.id, ...valores });
      gravarItens();
      return "inserido";
    }
    const localTs = existente.updated_at || existente.created_at || "1970-01-01T00:00:00";
    if (incomingTs < localTs) return "ignorado"; // versão local é mais nova
    db.prepare(`UPDATE pedidos SET ${cols.map(c => c + " = @" + c).join(", ")} WHERE id = @id`).run({ id: p.id, ...valores });
    gravarItens();
    return "atualizado";
  });
  return tx();
}

// ─── SINCRONIZAÇÃO local ↔ nuvem — COMANDAS + ITENS DE MESA ─────────────────
// Necessário porque o QR das mesas aponta para a URL da nuvem — quando o cliente
// escaneia, o pedido é criado no banco da nuvem. Sem esse sync, o PDV local
// nunca vê a comanda nem os itens.

export function comandasAlteradasDesde(desdeIso) {
  const desde = desdeIso || "1970-01-01T00:00:00";
  const rows = db.prepare(
    `SELECT c.*, m.numero AS mesa_numero
     FROM comandas c
     JOIN mesas m ON m.id = c.mesa_id
     WHERE COALESCE(c.updated_at, c.opened_at) > ?
     ORDER BY COALESCE(c.updated_at, c.opened_at) ASC LIMIT 300`
  ).all(desde);
  return rows.map(c => ({
    ...c,
    deleted: !!c.deleted_at,
    itens: db.prepare(
      "SELECT * FROM comanda_itens WHERE comanda_id = ? ORDER BY created_at ASC"
    ).all(c.id).map(i => ({ ...i, deleted: !!i.deleted_at })),
  }));
}

// Upsert de uma comanda vinda do outro lado. Resolve mesa_id pelo mesa_numero
// (os IDs de mesa divergem entre instalações). Last-write-wins pela comanda,
// mas itens são upsertados individualmente também (a comanda ganha itens novos
// depois de aberta — o sync precisa acompanhar).
export function upsertComandaSync(c) {
  if (!c || !c.id || !c.mesa_numero) {
    console.log("[sync-comanda] ignorada: payload inválido", { id: c?.id, mesa_numero: c?.mesa_numero });
    return "ignorado";
  }
  const mesa = db.prepare("SELECT id FROM mesas WHERE numero = ?").get(c.mesa_numero);
  if (!mesa) {
    console.log(`[sync-comanda] ignorada: mesa ${c.mesa_numero} não existe no PDV local (cadastre a mesa ou verifique o sync-catalogo)`);
    return "ignorado";
  }
  const mesaId = mesa.id;

  const incomingTs = c.updated_at || c.opened_at || "1970-01-01T00:00:00";
  const existente = db.prepare("SELECT id, updated_at, opened_at, status FROM comandas WHERE id = ?").get(c.id);

  const upsertItens = () => {
    if (!Array.isArray(c.itens)) return;
    const jaExiste = db.prepare("SELECT id, updated_at, created_at FROM comanda_itens WHERE id = ?");
    const produtoExiste = db.prepare("SELECT 1 FROM produtos WHERE id = ? AND deleted_at IS NULL");
    const insertItem = db.prepare(
      `INSERT INTO comanda_itens (id, comanda_id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, status, origem, created_at, updated_at, deleted_at)
       VALUES (@id, @comanda_id, @produto_id, @produto_nome, @quantidade, @preco_unitario, @adicionais, @obs, @status, @origem, @created_at, @updated_at, @deleted_at)`
    );
    const updateItem = db.prepare(
      `UPDATE comanda_itens SET quantidade=@quantidade, preco_unitario=@preco_unitario, adicionais=@adicionais,
              obs=@obs, status=@status, updated_at=@updated_at, deleted_at=@deleted_at WHERE id=@id`
    );
    for (const it of c.itens) {
      if (!it || !it.id) continue;
      const itemTs = it.updated_at || it.created_at || incomingTs;
      // Se o produto_id vindo do online não existe no PDV local, nulla ele.
      // A FK comanda_itens.produto_id → produtos(id) barra inserts órfãos com
      // "FOREIGN KEY constraint failed" — o que acontecia quando o cardápio
      // online tem produtos que o PDV local ainda não tem sincronizados (ou
      // no cenário atual, quando cada cliente tem seu próprio backend online
      // com produtos diferentes do PDV desktop). O produto_nome já vem no
      // payload, então a comanda aparece com nome, preço e adicionais certos —
      // só perde o link pra editar produto no cadastro local (que nem faz
      // sentido, já que o produto original não é daqui).
      let produtoId = it.produto_id || null;
      if (produtoId && !produtoExiste.get(produtoId)) produtoId = null;
      const payload = {
        id: it.id,
        comanda_id: c.id,
        produto_id: produtoId,
        produto_nome: it.produto_nome || "",
        quantidade: it.quantidade || 1,
        preco_unitario: it.preco_unitario || 0,
        adicionais: typeof it.adicionais === "string" ? it.adicionais : JSON.stringify(it.adicionais || []),
        obs: it.obs || "",
        status: it.status || "pendente",
        origem: it.origem || "qr",
        created_at: it.created_at || itemTs,
        updated_at: itemTs,
        deleted_at: it.deleted ? (it.deleted_at || itemTs) : null,
      };
      const existe = jaExiste.get(it.id);
      if (!existe) {
        insertItem.run(payload);
      } else {
        const localTs = existe.updated_at || existe.created_at || "1970-01-01T00:00:00";
        if (itemTs >= localTs) updateItem.run(payload);
      }
    }
  };

  const tx = db.transaction(() => {
    if (!existente) {
      db.prepare(
        `INSERT INTO comandas (id, mesa_id, numero, cliente_nome, pessoas, status, opened_at, closed_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(c.id, mesaId, c.numero || 0, c.cliente_nome || "", c.pessoas || 1,
            c.status || "aberta", c.opened_at || incomingTs, c.closed_at || null,
            incomingTs, c.deleted ? (c.deleted_at || incomingTs) : null);
      // Marca a mesa como ocupada quando a comanda vem aberta.
      if ((c.status || "aberta") === "aberta" && !c.deleted) {
        db.prepare("UPDATE mesas SET status = 'ocupada' WHERE id = ?").run(mesaId);
      }
      upsertItens();
      return "inserido";
    }
    const localTs = existente.updated_at || existente.opened_at || "1970-01-01T00:00:00";
    if (incomingTs < localTs) {
      // Mesmo que a comanda seja "mais antiga" que a local, ainda pode trazer
      // itens novos (o QR adicionou um item enquanto a comanda local também
      // mudou). Faz upsert dos itens independentemente.
      upsertItens();
      return "ignorado";
    }
    db.prepare(
      `UPDATE comandas SET mesa_id=?, numero=?, cliente_nome=?, pessoas=?, status=?, opened_at=?, closed_at=?, updated_at=?, deleted_at=? WHERE id=?`
    ).run(mesaId, c.numero || 0, c.cliente_nome || "", c.pessoas || 1,
          c.status || "aberta", c.opened_at || incomingTs, c.closed_at || null,
          incomingTs, c.deleted ? (c.deleted_at || incomingTs) : null, c.id);
    // Refleti mudanças de status no mesa (fechada/cancelada libera a mesa)
    if (c.status && c.status !== "aberta") {
      db.prepare("UPDATE mesas SET status = 'livre', reserva_nome='', reserva_hora='', reserva_pessoas=0 WHERE id = ? AND status != 'reservada'").run(mesaId);
    }
    upsertItens();
    return "atualizado";
  });
  return tx();
}

// ─── SINCRONIZAÇÃO DE CATÁLOGO (push-catalogo) ──────────────────────────────
// Recebe categorias, adicionais e produtos do PDV remoto e faz upsert local.
// Last-write-wins por ID. Transacional para consistência.
export function upsertCatalogoSync({ categorias = [], adicionais = [], produtos = [], cardapios = [], mesas = null }) {
  const resultado = { categorias: { inserido: 0, atualizado: 0 }, adicionais: { inserido: 0, atualizado: 0 }, produtos: { inserido: 0, atualizado: 0 }, cardapios: { inserido: 0, atualizado: 0, removido: 0 }, mesas: { inserido: 0, atualizado: 0, removido: 0 } };

  const tx = db.transaction(() => {
    const catIdsRecebidos = new Set();
    // id da categoria no PDV → id da categoria local (pode divergir quando o
    // match foi por nome); usado pra remapear os vínculos dos cardápios.
    const mapaCatId = {};
    for (const c of categorias) {
      if (!c || !c.id) continue;
      catIdsRecebidos.add(c.id);
      const porId = db.prepare("SELECT id FROM categorias WHERE id = ?").get(c.id);
      const porNome = porId ? null : db.prepare("SELECT id FROM categorias WHERE nome = ?").get(c.nome);
      const alvo = porId || porNome;
      mapaCatId[c.id] = alvo ? alvo.id : c.id;
      if (alvo) {
        catIdsRecebidos.add(alvo.id);
        db.prepare("UPDATE categorias SET nome = ?, permite_adicionais = ?, ordem = ? WHERE id = ?")
          .run(c.nome, c.permite_adicionais ?? 0, c.ordem ?? 0, alvo.id);
        resultado.categorias.atualizado++;
      } else {
        db.prepare("INSERT INTO categorias (id, nome, permite_adicionais, ordem) VALUES (?, ?, ?, ?)")
          .run(c.id, c.nome, c.permite_adicionais ?? 0, c.ordem ?? 0);
        resultado.categorias.inserido++;
      }
    }

    const adicIdsRecebidos = new Set();
    for (const a of adicionais) {
      if (!a || !a.id) continue;
      adicIdsRecebidos.add(a.id);
      const existe = db.prepare("SELECT id FROM adicionais WHERE id = ?").get(a.id);
      if (existe) {
        // deleted_at = NULL: estar presente neste push significa que o item está
        // ativo no PDV — reverte uma poda (removido) de uma sincronização anterior.
        db.prepare("UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ?, max_quantidade = ?, categoria_id = ?, deleted_at = NULL WHERE id = ?")
          .run(a.nome, a.preco, a.custo ?? 0, a.disponivel ?? 1, a.max_quantidade ?? 0, a.categoria_id ?? null, a.id);
        resultado.adicionais.atualizado++;
      } else {
        db.prepare("INSERT INTO adicionais (id, nome, preco, custo, disponivel, max_quantidade, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(a.id, a.nome, a.preco, a.custo ?? 0, a.disponivel ?? 1, a.max_quantidade ?? 0, a.categoria_id ?? null);
        resultado.adicionais.inserido++;
      }
    }

    const prodIdsRecebidos = new Set();
    for (const p of produtos) {
      if (!p || !p.id) continue;
      prodIdsRecebidos.add(p.id);
      const existe = db.prepare("SELECT id FROM produtos WHERE id = ?").get(p.id);
      if (existe) {
        // deleted_at = NULL: estar presente neste push significa que o produto está
        // ativo no PDV — reverte uma poda (removido) de uma sincronização anterior.
        db.prepare("UPDATE produtos SET nome = ?, descricao = ?, preco = ?, custo = ?, categoria = ?, imagem = ?, disponivel = ?, codigo = COALESCE(?, codigo), config = ?, deleted_at = NULL WHERE id = ?")
          .run(p.nome, p.descricao ?? "", p.preco, p.custo ?? 0, p.categoria ?? "", p.imagem ?? "", p.disponivel ?? 1, p.codigo != null ? String(p.codigo).trim() : null, typeof p.config === "string" ? p.config : JSON.stringify(p.config || {}), p.id);
        resultado.produtos.atualizado++;
      } else {
        db.prepare("INSERT INTO produtos (id, nome, descricao, preco, custo, categoria, imagem, disponivel, codigo, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(p.id, p.nome, p.descricao ?? "", p.preco, p.custo ?? 0, p.categoria ?? "", p.imagem ?? "", p.disponivel ?? 1, (p.codigo || "").trim(), typeof p.config === "string" ? p.config : JSON.stringify(p.config || {}));
        resultado.produtos.inserido++;
      }
    }

    if (produtos.length > 0) {
      const orfaos = db.prepare("SELECT id FROM produtos WHERE deleted_at IS NULL").all();
      resultado.produtos.removido = 0;
      for (const o of orfaos) {
        if (!prodIdsRecebidos.has(o.id)) {
          db.prepare("UPDATE produtos SET deleted_at = datetime('now') WHERE id = ?").run(o.id);
          resultado.produtos.removido++;
        }
      }
    }
    if (adicionais.length > 0) {
      const orfaos = db.prepare("SELECT id FROM adicionais WHERE deleted_at IS NULL").all();
      resultado.adicionais.removido = 0;
      for (const o of orfaos) {
        if (!adicIdsRecebidos.has(o.id)) {
          db.prepare("UPDATE adicionais SET deleted_at = datetime('now') WHERE id = ?").run(o.id);
          resultado.adicionais.removido++;
        }
      }
    }

    // ── Cardápios + vínculos (a home do cardápio online precisa deles) ──────
    if (cardapios.length > 0) {
      const cardIdsRecebidos = new Set();
      for (const c of cardapios) {
        if (!c || !c.id) continue;
        cardIdsRecebidos.add(c.id);
        const existe = db.prepare("SELECT id FROM cardapios WHERE id = ?").get(c.id);
        const tipoCard = c.tipo || "snack_bar";
        const cfgCard = typeof c.config === "string" ? c.config : JSON.stringify(c.config || {});
        if (existe) {
          db.prepare("UPDATE cardapios SET nome = ?, descricao = ?, icone = ?, cor = ?, ativo = ?, ordem = ?, imagem = ?, tipo = ?, config = ? WHERE id = ?")
            .run(c.nome, c.descricao ?? "", c.icone ?? "📋", c.cor ?? "#15803d", c.ativo ?? 1, c.ordem ?? 0, c.imagem ?? "", tipoCard, cfgCard, c.id);
          resultado.cardapios.atualizado++;
        } else {
          db.prepare("INSERT INTO cardapios (id, nome, descricao, icone, cor, ativo, ordem, imagem, tipo, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(c.id, c.nome, c.descricao ?? "", c.icone ?? "📋", c.cor ?? "#15803d", c.ativo ?? 1, c.ordem ?? 0, c.imagem ?? "", tipoCard, cfgCard);
          resultado.cardapios.inserido++;
        }
        // Vínculos: substitui pelos do PDV (fonte da verdade). Remapeia ids de
        // categoria (match por nome pode divergir) e só insere se o alvo existe
        // localmente — FK ligada derrubaria a transação inteira.
        db.prepare("DELETE FROM cardapio_categorias WHERE cardapio_id = ?").run(c.id);
        for (const catId of (c.categorias || [])) {
          const realId = mapaCatId[catId] || catId;
          const ok = db.prepare("SELECT 1 FROM categorias WHERE id = ?").get(realId);
          if (ok) db.prepare("INSERT OR IGNORE INTO cardapio_categorias (cardapio_id, categoria_id) VALUES (?, ?)").run(c.id, realId);
        }
        db.prepare("DELETE FROM cardapio_adicionais WHERE cardapio_id = ?").run(c.id);
        for (const adId of (c.adicionais || [])) {
          const ok = db.prepare("SELECT 1 FROM adicionais WHERE id = ?").get(adId);
          if (ok) db.prepare("INSERT OR IGNORE INTO cardapio_adicionais (cardapio_id, adicional_id) VALUES (?, ?)").run(c.id, adId);
        }
      }
      // Cardápios que não existem mais no PDV somem daqui também
      const orfaos = db.prepare("SELECT id FROM cardapios").all();
      for (const o of orfaos) {
        if (!cardIdsRecebidos.has(o.id)) {
          db.prepare("DELETE FROM cardapio_categorias WHERE cardapio_id = ?").run(o.id);
          db.prepare("DELETE FROM cardapio_adicionais WHERE cardapio_id = ?").run(o.id);
          db.prepare("DELETE FROM cardapios WHERE id = ?").run(o.id);
          resultado.cardapios.removido++;
        }
      }
    }

    // ── Mesas (PDV é a fonte da verdade — o online precisa da MESMA lista
    // pro QR e pro Atender Mesas). Match por número; nunca remove mesa com
    // comanda aberta pra não órfã-la no meio do atendimento.
    if (Array.isArray(mesas)) {
      const numerosRecebidos = new Set();
      for (const m of mesas) {
        const numero = parseInt(m?.numero, 10);
        if (isNaN(numero)) continue;
        numerosRecebidos.add(numero);
        const existe = db.prepare("SELECT id FROM mesas WHERE numero = ?").get(numero);
        if (existe) {
          db.prepare("UPDATE mesas SET lugares = ? WHERE numero = ?").run(m.lugares || 4, numero);
          resultado.mesas.atualizado++;
        } else {
          db.prepare("INSERT INTO mesas (id, numero, lugares) VALUES (?, ?, ?)")
            .run(crypto.randomUUID(), numero, m.lugares || 4);
          resultado.mesas.inserido++;
        }
      }
      const locais = db.prepare("SELECT id, numero FROM mesas").all();
      for (const l of locais) {
        if (numerosRecebidos.has(l.numero)) continue;
        const comandaAberta = db.prepare("SELECT 1 FROM comandas WHERE mesa_id = ? AND status = 'aberta' AND deleted_at IS NULL LIMIT 1").get(l.id);
        if (comandaAberta) continue;
        db.prepare("DELETE FROM mesas WHERE id = ?").run(l.id);
        resultado.mesas.removido++;
      }
    }
  });

  tx();
  return resultado;
}

// ─── CUSTOS FIXOS ────────────────────────────────────────────────────────────

export function listarCustosFixos() {
  return db.prepare("SELECT * FROM custos_fixos WHERE deleted_at IS NULL ORDER BY categoria, nome").all();
}

export function buscarCustoFixo(id) {
  return db.prepare("SELECT * FROM custos_fixos WHERE id = ? AND deleted_at IS NULL").get(id);
}

// Custo total efetivo de uma linha (fixo = valor; variável = diaria * qtd)
export function custoTotalDeCusto(cf) {
  if (!cf) return 0;
  if (cf.tipo === "variavel") return (Number(cf.diaria) || 0) * (Number(cf.qtd) || 0);
  return Number(cf.valor) || 0;
}

export function criarCustoFixo({ nome, valor, categoria, ativo, tipo, diaria, qtd }) {
  const id = gerarId();
  const t = tipo === "variavel" ? "variavel" : "fixo";
  db.prepare(
    "INSERT INTO custos_fixos (id, nome, valor, categoria, ativo, tipo, diaria, qtd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, nome,
    Number(valor) || 0,
    categoria || "Outros",
    ativo !== false ? 1 : 0,
    t,
    Number(diaria) || 0,
    Number(qtd) || 0
  );
  return buscarCustoFixo(id);
}

export function atualizarCustoFixo(id, { nome, valor, categoria, ativo, tipo, diaria, qtd }) {
  // Se tipo veio, usa ele; senão preserva o atual (parcial update)
  const atual = buscarCustoFixo(id);
  if (!atual) return null;
  const t = (tipo === "fixo" || tipo === "variavel") ? tipo : (atual.tipo || "fixo");
  const result = db.prepare(
    "UPDATE custos_fixos SET nome = ?, valor = ?, categoria = ?, ativo = ?, tipo = ?, diaria = ?, qtd = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(
    nome ?? atual.nome,
    valor != null ? (Number(valor) || 0) : atual.valor,
    categoria ?? atual.categoria,
    ativo ? 1 : 0,
    t,
    diaria != null ? (Number(diaria) || 0) : (atual.diaria || 0),
    qtd != null ? (Number(qtd) || 0) : (atual.qtd || 0),
    id
  );
  if (result.changes === 0) return null;
  return buscarCustoFixo(id);
}

export function excluirCustoFixo(id) {
  // Soft delete: também marca lançamentos previstos deste custo como deletados
  db.prepare("UPDATE lancamentos SET deleted_at = datetime('now') WHERE custo_fixo_id = ? AND status = 'previsto' AND deleted_at IS NULL").run(id);
  return db.prepare("UPDATE custos_fixos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── CATEGORIAS FINANCEIRAS (separadas das categorias de produto) ────────────

export function listarCategoriasFinanceiro({ incluirArquivadas = false } = {}) {
  const sql = incluirArquivadas
    ? "SELECT * FROM categorias_financeiro ORDER BY arquivada ASC, ordem ASC, nome ASC"
    : "SELECT * FROM categorias_financeiro WHERE arquivada = 0 ORDER BY ordem ASC, nome ASC";
  return db.prepare(sql).all();
}

export function criarCategoriaFinanceiro({ nome, cor, tipo }) {
  if (!nome || !String(nome).trim()) throw new Error("Nome obrigatório");
  const id = gerarId();
  const maxOrd = db.prepare("SELECT COALESCE(MAX(ordem),0) AS m FROM categorias_financeiro").get().m;
  db.prepare(
    "INSERT INTO categorias_financeiro (id, nome, cor, tipo, ordem) VALUES (?, ?, ?, ?, ?)"
  ).run(id, String(nome).trim(), cor || "#78716c", tipo || "ambos", maxOrd + 1);
  return db.prepare("SELECT * FROM categorias_financeiro WHERE id = ?").get(id);
}

export function atualizarCategoriaFinanceiro(id, { nome, cor, tipo, arquivada }) {
  const atual = db.prepare("SELECT * FROM categorias_financeiro WHERE id = ?").get(id);
  if (!atual) return null;
  db.prepare(
    "UPDATE categorias_financeiro SET nome = ?, cor = ?, tipo = ?, arquivada = ? WHERE id = ?"
  ).run(
    nome != null ? String(nome).trim() : atual.nome,
    cor != null ? cor : atual.cor,
    (tipo === "entrada" || tipo === "saida" || tipo === "ambos") ? tipo : atual.tipo,
    arquivada != null ? (arquivada ? 1 : 0) : atual.arquivada,
    id
  );
  return db.prepare("SELECT * FROM categorias_financeiro WHERE id = ?").get(id);
}

export function excluirCategoriaFinanceiro(id) {
  // Soft delete: marca como arquivada (não deleta pra preservar histórico)
  return db.prepare("UPDATE categorias_financeiro SET arquivada = 1 WHERE id = ?").run(id).changes > 0;
}

// ─── EMPRÉSTIMO: gerar lançamento pai + N parcelas previstas ─────────────────
// Cria 1 entrada (o empréstimo recebido) + N saídas previstas mensais
// com juros compostos: parcela = valor * (1+j)^n / n
export function criarEmprestimo({ descricao, valor, data, cat, juros_pct, n_parcelas, dia_pagamento }) {
  const v = Number(valor) || 0;
  const j = (Number(juros_pct) || 0) / 100;
  const n = Math.max(1, Math.min(360, parseInt(n_parcelas, 10) || 1));
  if (v <= 0) throw new Error("Valor do empréstimo inválido");

  const totalComJuros = j > 0 ? v * Math.pow(1 + j, n) : v;
  const valorParcela = Math.round((totalComJuros / n) * 100) / 100;

  const dataIso = data || new Date().toISOString().slice(0, 10);
  const dataObj = new Date(dataIso + "T00:00:00");
  const diaPg = parseInt(dia_pagamento, 10) || dataObj.getUTCDate();

  const paiId = gerarId();
  const tx = db.transaction(() => {
    // Lançamento pai: entrada do empréstimo
    db.prepare(`INSERT INTO lancamentos
      (id, tipo, descricao, valor, data, cat, status, obs, tipo_lancamento, juros_pct, parcela_total)
      VALUES (?, 'entrada', ?, ?, ?, ?, 'realizado', ?, 'emprestimo', ?, ?)`
    ).run(paiId, descricao || "Empréstimo", v, dataIso, cat || "Empréstimo",
      `Empréstimo ${n}x · juros ${(Number(juros_pct) || 0).toFixed(2)}% a.m.`,
      Number(juros_pct) || 0, n);

    // Parcelas (saídas previstas)
    for (let i = 1; i <= n; i++) {
      const venc = new Date(Date.UTC(dataObj.getUTCFullYear(), dataObj.getUTCMonth() + i, diaPg));
      const dataVenc = venc.toISOString().slice(0, 10);
      db.prepare(`INSERT INTO lancamentos
        (id, tipo, descricao, valor, data, cat, status, obs, tipo_lancamento, parent_id, parcela_n, parcela_total)
        VALUES (?, 'saida', ?, ?, ?, ?, 'previsto', ?, 'parcela', ?, ?, ?)`
      ).run(
        gerarId(),
        `${descricao || "Empréstimo"} — parcela ${i}/${n}`,
        valorParcela, dataVenc, cat || "Empréstimo",
        `Parcela ${i} de ${n} (${(Number(juros_pct) || 0).toFixed(2)}% a.m.)`,
        paiId, i, n
      );
    }
  });
  tx();
  return buscarLancamento(paiId);
}

// Gera lançamentos previsto para custos fixos ativos no mês informado (YYYY-MM)
// Evita duplicatas: verifica se já existe lançamento do mesmo custo_fixo_id no mês
export function gerarLancamentosCustosFixos(mes) {
  const ativos = db.prepare("SELECT * FROM custos_fixos WHERE ativo = 1 AND deleted_at IS NULL").all();
  const gerados = [];
  for (const cf of ativos) {
    // Verifica se já existe lançamento para este custo fixo neste mês
    const jaExiste = db.prepare(
      "SELECT 1 FROM lancamentos WHERE custo_fixo_id = ? AND data LIKE ?"
    ).get(cf.id, `${mes}%`);
    if (!jaExiste) {
      const dia = `${mes}-01`;
      const id = gerarId();
      const valorEfetivo = custoTotalDeCusto(cf);
      const obs = cf.tipo === "variavel"
        ? `Custo variável: ${Number(cf.diaria || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} × ${cf.qtd || 0}`
        : "Custo fixo mensal";
      db.prepare(
        "INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs, custo_fixo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, "saida", cf.nome, valorEfetivo, dia, cf.categoria, "previsto", obs, cf.id);
      gerados.push(buscarLancamento(id));
    }
  }
  return gerados;
}

// ─── INSUMOS (unificado com Estoque — os itens do estoque SÃO os insumos) ─────
// Custo efetivo p/ ficha técnica: custo médio das entradas; se não houver
// entradas (custo_medio = 0), usa o custo de referência manual (custo_manual).
const CUSTO_EFETIVO_SQL = "(CASE WHEN ei.custo_medio > 0 THEN ei.custo_medio ELSE COALESCE(ei.custo_manual, 0) END)";

export function listarInsumos() {
  return db.prepare(`
    SELECT ei.id, ei.nome, ei.unidade, ${CUSTO_EFETIVO_SQL} AS preco_unitario,
           ei.custo_medio, ei.custo_manual, ei.saldo_atual
    FROM estoque_itens ei
    WHERE ei.deleted_at IS NULL AND ei.eh_insumo = 1
    ORDER BY ei.nome
  `).all();
}

export function buscarInsumo(id) {
  return db.prepare(`
    SELECT ei.id, ei.nome, ei.unidade, ${CUSTO_EFETIVO_SQL} AS preco_unitario,
           ei.custo_medio, ei.custo_manual, ei.saldo_atual
    FROM estoque_itens ei
    WHERE ei.id = ? AND ei.deleted_at IS NULL
  `).get(id);
}

// Mantidas por compatibilidade da API: operam no estoque (fonte única de verdade)
export function criarInsumo({ nome, unidade, preco_unitario }) {
  const codigo = "INS-" + gerarId().slice(0, 10);
  const item = criarEstoqueItem({ codigo, nome, unidade });
  if (preco_unitario != null) {
    db.prepare("UPDATE estoque_itens SET custo_manual = ? WHERE id = ?").run(Number(preco_unitario) || 0, item.id);
  }
  return buscarInsumo(item.id);
}

export function atualizarInsumo(id, { nome, unidade, preco_unitario }) {
  const result = db.prepare(
    "UPDATE estoque_itens SET nome = ?, unidade = ?, custo_manual = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(nome, unidade || "un", Number(preco_unitario) || 0, id);
  if (result.changes === 0) return null;
  recalcularCMVPorInsumo(id); // CMV dos produtos que usam este item
  return buscarInsumo(id);
}

export function excluirInsumo(id) {
  return excluirEstoqueItem(id);
}

// ─── COMPOSIÇÃO (FICHA TÉCNICA) ───────────────────────────────────────────────

export function listarComposicaoProduto(produtoId) {
  return db.prepare(`
    SELECT pi.id, pi.produto_id, pi.insumo_id, pi.quantidade,
           ei.nome AS insumo_nome, ei.unidade, ${CUSTO_EFETIVO_SQL} AS preco_unitario
    FROM produto_insumos pi
    JOIN estoque_itens ei ON ei.id = pi.insumo_id
    WHERE pi.produto_id = ?
    ORDER BY ei.nome
  `).all(produtoId);
}

export function salvarComposicaoProduto(produtoId, itens) {
  // itens = [{ insumo_id, quantidade }]
  const transacao = db.transaction(() => {
    db.prepare("DELETE FROM produto_insumos WHERE produto_id = ?").run(produtoId);
    for (const item of itens) {
      if (!item.insumo_id || !item.quantidade) continue;
      db.prepare(
        "INSERT OR REPLACE INTO produto_insumos (id, produto_id, insumo_id, quantidade) VALUES (?, ?, ?, ?)"
      ).run(gerarId(), produtoId, item.insumo_id, item.quantidade);
    }
    recalcularCMVProduto(produtoId);
  });
  transacao();
  return listarComposicaoProduto(produtoId);
}

export function recalcularCMVProduto(produtoId) {
  const composicao = listarComposicaoProduto(produtoId);
  if (composicao.length === 0) return; // sem ficha técnica: CMV manual
  const cmv = composicao.reduce((s, row) => s + row.preco_unitario * row.quantidade, 0);
  db.prepare("UPDATE produtos SET custo = ? WHERE id = ?").run(
    Math.round(cmv * 100) / 100,
    produtoId
  );
}

export function recalcularCMVPorInsumo(insumoId) {
  // Busca todos os produtos que usam este insumo e recalcula o CMV de cada um
  const produtos = db.prepare(
    "SELECT DISTINCT produto_id FROM produto_insumos WHERE insumo_id = ?"
  ).all(insumoId);
  for (const { produto_id } of produtos) {
    recalcularCMVProduto(produto_id);
  }
}

// ─── ESTOQUE CATEGORIAS ───────────────────────────────────────────────────────

export function listarEstoqueCategorias() {
  return db.prepare("SELECT * FROM estoque_categorias ORDER BY nome").all();
}

export function criarEstoqueCategoria({ nome }) {
  const id = gerarId();
  db.prepare("INSERT INTO estoque_categorias (id, nome) VALUES (?, ?)").run(id, nome);
  return db.prepare("SELECT * FROM estoque_categorias WHERE id = ?").get(id);
}

export function excluirEstoqueCategoria(id) {
  return db.prepare("DELETE FROM estoque_categorias WHERE id = ?").run(id).changes > 0;
}

// ─── FORNECEDORES ─────────────────────────────────────────────────────────────

export function listarFornecedores() {
  return db.prepare("SELECT * FROM fornecedores WHERE deleted_at IS NULL ORDER BY nome").all();
}

export function buscarFornecedor(id) {
  return db.prepare("SELECT * FROM fornecedores WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function criarFornecedor({ nome, telefone, email, obs }) {
  const id = gerarId();
  db.prepare("INSERT INTO fornecedores (id, nome, telefone, email, obs) VALUES (?, ?, ?, ?, ?)")
    .run(id, nome, telefone || "", email || "", obs || "");
  return buscarFornecedor(id);
}

export function atualizarFornecedor(id, { nome, telefone, email, obs }) {
  const r = db.prepare("UPDATE fornecedores SET nome=?, telefone=?, email=?, obs=? WHERE id=? AND deleted_at IS NULL")
    .run(nome, telefone || "", email || "", obs || "", id);
  if (r.changes === 0) return null;
  return buscarFornecedor(id);
}

export function excluirFornecedor(id) {
  return db.prepare("UPDATE fornecedores SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── ESTOQUE ITENS ────────────────────────────────────────────────────────────

export function listarEstoqueItens() {
  return db.prepare(`
    SELECT ei.*, ec.nome AS categoria_nome, f.nome AS fornecedor_nome
    FROM estoque_itens ei
    LEFT JOIN estoque_categorias ec ON ec.id = ei.categoria_id
    LEFT JOIN fornecedores f ON f.id = ei.fornecedor_id
    WHERE ei.deleted_at IS NULL
    ORDER BY ei.nome
  `).all();
}

export function buscarEstoqueItem(id) {
  return db.prepare(`
    SELECT ei.*, ec.nome AS categoria_nome, f.nome AS fornecedor_nome
    FROM estoque_itens ei
    LEFT JOIN estoque_categorias ec ON ec.id = ei.categoria_id
    LEFT JOIN fornecedores f ON f.id = ei.fornecedor_id
    WHERE ei.id = ? AND ei.deleted_at IS NULL
  `).get(id);
}

export function buscarEstoqueItemPorCodigo(codigo) {
  return db.prepare("SELECT * FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(codigo);
}

// Código curto alfanumérico (7 chars, sem 0/1/O/I pra evitar confusão visual)
function gerarCodigoEstoque() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 7; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export function criarEstoqueItem({ codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual, eh_insumo, tipo,
                                    codigo_barras, ncm, cest, descricao, preco_venda }) {
  const id = gerarId();
  // Auto-gera código quando o cliente não informar (nova UX: o cliente não
  // precisa mais decorar/inventar SKU). Retenta em caso de colisão.
  let codigoFinal = codigo && String(codigo).trim() ? String(codigo).trim().toUpperCase() : null;
  if (!codigoFinal) {
    for (let tent = 0; tent < 20; tent++) {
      const cand = gerarCodigoEstoque();
      if (!db.prepare("SELECT 1 FROM estoque_itens WHERE codigo = ?").get(cand)) {
        codigoFinal = cand;
        break;
      }
    }
    if (!codigoFinal) codigoFinal = gerarCodigoEstoque() + Date.now().toString(36).slice(-3).toUpperCase();
  }
  // Novo modelo: `tipo` explícito (revenda|insumo|interno). Fallback pro legado `eh_insumo`
  // se o cliente veio de uma versão antiga. Insumo mantém eh_insumo=1 pra não quebrar as
  // fichas técnicas existentes.
  const tipoFinal = (tipo && ["revenda", "insumo", "interno"].includes(tipo))
    ? tipo
    : (eh_insumo ? "insumo" : "revenda");
  const insumoInt = tipoFinal === "insumo" ? 1 : (eh_insumo ? 1 : 0);
  db.prepare(`
    INSERT INTO estoque_itens (id, codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual, eh_insumo, tipo, codigo_barras, ncm, cest, descricao, preco_venda)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, codigoFinal, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, Number(custo_manual) || 0,
    insumoInt, tipoFinal,
    (codigo_barras || "").trim(), (ncm || "").trim(), (cest || "").trim(), (descricao || "").trim(), Number(preco_venda) || 0);
  return buscarEstoqueItem(id);
}

export function atualizarEstoqueItem(id, { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo, custo_manual, eh_insumo, tipo,
                                            codigo_barras, ncm, cest, descricao, preco_venda }) {
  // custo_manual, eh_insumo e tipo são opcionais: só atualizam se vierem no payload.
  // Se veio `tipo`, sincroniza `eh_insumo` (revenda/interno → 0, insumo → 1) pra
  // manter consistência com ficha técnica antiga.
  const setCusto = custo_manual !== undefined ? ", custo_manual=?" : "";
  const setInsumo = (eh_insumo !== undefined || tipo !== undefined) ? ", eh_insumo=?" : "";
  const setTipo = tipo !== undefined ? ", tipo=?" : "";
  const setEan = codigo_barras !== undefined ? ", codigo_barras=?" : "";
  const setNcm = ncm !== undefined ? ", ncm=?" : "";
  const setCest = cest !== undefined ? ", cest=?" : "";
  const setDescricao = descricao !== undefined ? ", descricao=?" : "";
  const setPreco = preco_venda !== undefined ? ", preco_venda=?" : "";
  const params = [codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, ativo !== false ? 1 : 0];
  if (custo_manual !== undefined) params.push(Number(custo_manual) || 0);
  if (eh_insumo !== undefined || tipo !== undefined) {
    const insumoInt = tipo !== undefined
      ? (tipo === "insumo" ? 1 : 0)
      : (eh_insumo ? 1 : 0);
    params.push(insumoInt);
  }
  if (tipo !== undefined) params.push(tipo);
  if (codigo_barras !== undefined) params.push((codigo_barras || "").trim());
  if (ncm !== undefined) params.push((ncm || "").trim());
  if (cest !== undefined) params.push((cest || "").trim());
  if (descricao !== undefined) params.push((descricao || "").trim());
  if (preco_venda !== undefined) params.push(Number(preco_venda) || 0);
  params.push(id);
  const r = db.prepare(`
    UPDATE estoque_itens SET codigo=?, nome=?, unidade=?, categoria_id=?, fornecedor_id=?,
    estoque_minimo=?, estoque_maximo=?, ativo=?${setCusto}${setInsumo}${setTipo}${setEan}${setNcm}${setCest}${setDescricao}${setPreco} WHERE id=? AND deleted_at IS NULL
  `).run(...params);
  if (r.changes === 0) return null;
  recalcularCMVPorInsumo(id); // mantém o CMV dos produtos em dia com o custo do item
  return buscarEstoqueItem(id);
}

export function excluirEstoqueItem(id) {
  // Soft delete: codigo é UNIQUE, então renomeia o codigo p/ liberar p/ um novo item
  const atual = db.prepare("SELECT codigo FROM estoque_itens WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!atual) return false;
  const novoCodigo = `${atual.codigo}__del__${Date.now()}`;
  return db.prepare("UPDATE estoque_itens SET codigo = ?, deleted_at = datetime('now') WHERE id = ?").run(novoCodigo, id).changes > 0;
}

// ─── ESTOQUE ENTRADAS ─────────────────────────────────────────────────────────

export function listarEstoqueEntradas(itemId = null) {
  if (itemId) {
    return db.prepare(`
      SELECT ee.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade,
             f.nome AS fornecedor_nome
      FROM estoque_entradas ee
      JOIN estoque_itens ei ON ei.id = ee.item_id
      LEFT JOIN fornecedores f ON f.id = ee.fornecedor_id
      WHERE ee.item_id = ?
      ORDER BY ee.data DESC, ee.created_at DESC
    `).all(itemId);
  }
  return db.prepare(`
    SELECT ee.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade,
           f.nome AS fornecedor_nome
    FROM estoque_entradas ee
    JOIN estoque_itens ei ON ei.id = ee.item_id
    LEFT JOIN fornecedores f ON f.id = ee.fornecedor_id
    ORDER BY ee.data DESC, ee.created_at DESC
    LIMIT 200
  `).all();
}

export function registrarEntrada({ item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs }) {
  const item = db.prepare("SELECT * FROM estoque_itens WHERE id = ?").get(item_id);
  if (!item) throw new Error("Item não encontrado");

  const qtd = parseFloat(quantidade);
  const custo = parseFloat(custo_unitario) || 0;

  // Custo médio ponderado
  const novoSaldo = item.saldo_atual + qtd;
  const novoCustoMedio = novoSaldo > 0
    ? (item.saldo_atual * item.custo_medio + qtd * custo) / novoSaldo
    : custo;

  const id = gerarId();
  const txn = db.transaction(() => {
    db.prepare("INSERT INTO estoque_entradas (id, item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, item_id, qtd, custo, fornecedor_id || null, data || new Date().toISOString().split("T")[0], nf || "", obs || "");
    db.prepare("UPDATE estoque_itens SET saldo_atual=?, custo_medio=? WHERE id=?")
      .run(Math.round(novoSaldo * 1000) / 1000, Math.round(novoCustoMedio * 100) / 100, item_id);
  });
  txn();
  recalcularCMVPorInsumo(item_id); // entrada mudou o custo médio → atualiza CMV dos produtos

  // Integração Estoque↔Financeiro (opt-in): a entrada vira uma saída realizada
  // no Financeiro do mês (compra de mercadoria/insumo). Categoria auto: "Estoque".
  try {
    if (obterConfig("estoque_conectado_financeiro") === "1") {
      const valorTotal = Math.round(qtd * custo * 100) / 100;
      if (valorTotal > 0) {
        criarLancamento({
          tipo: "saida",
          descricao: `Entrada de estoque — ${item.nome}${nf ? " · NF " + nf : ""}`,
          valor: valorTotal,
          data: data || new Date().toISOString().split("T")[0],
          cat: "Estoque / Insumos",
          status: "realizado",
          obs: `Auto: ${qtd} ${item.unidade || "un"} × R$ ${custo.toFixed(2)}${obs ? " · " + obs : ""}`,
        });
      }
    }
  } catch (e) { /* falha na integração não deve reverter a entrada */ }

  return db.prepare("SELECT * FROM estoque_entradas WHERE id = ?").get(id);
}

export function registrarEntradaLote(entradas) {
  // entradas = [{ item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs }]
  const resultado = [];
  const itensProcessados = new Map(); // item_id → { nome, unidade, totalValor, entradaData }
  const txn = db.transaction(() => {
    for (const e of entradas) {
      if (!e.item_id || !e.quantidade) continue;
      const item = db.prepare("SELECT * FROM estoque_itens WHERE id = ?").get(e.item_id);
      if (!item) continue;
      const qtd = parseFloat(e.quantidade);
      const custo = parseFloat(e.custo_unitario) || 0;
      const novoSaldo = item.saldo_atual + qtd;
      const novoCustoMedio = novoSaldo > 0
        ? (item.saldo_atual * item.custo_medio + qtd * custo) / novoSaldo
        : custo;
      const id = gerarId();
      db.prepare("INSERT INTO estoque_entradas (id, item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, e.item_id, qtd, custo, e.fornecedor_id || null, e.data || new Date().toISOString().split("T")[0], e.nf || "", e.obs || "");
      db.prepare("UPDATE estoque_itens SET saldo_atual=?, custo_medio=? WHERE id=?")
        .run(Math.round(novoSaldo * 1000) / 1000, Math.round(novoCustoMedio * 100) / 100, e.item_id);
      resultado.push(db.prepare("SELECT * FROM estoque_entradas WHERE id = ?").get(id));
      const acc = itensProcessados.get(e.item_id) || { nome: item.nome, unidade: item.unidade, qtd: 0, valor: 0, data: e.data || new Date().toISOString().split("T")[0], nfs: [] };
      acc.qtd += qtd;
      acc.valor += qtd * custo;
      if (e.nf && !acc.nfs.includes(e.nf)) acc.nfs.push(e.nf);
      itensProcessados.set(e.item_id, acc);
    }
  });
  txn();
  // Atualiza o CMV dos produtos que usam os itens que receberam entrada
  [...new Set(entradas.map(e => e.item_id).filter(Boolean))].forEach(itemId => recalcularCMVPorInsumo(itemId));

  // Integração Estoque↔Financeiro: um lançamento por item processado (o lote
  // pode ter várias entradas do mesmo item — soma-se em uma linha só).
  try {
    if (obterConfig("estoque_conectado_financeiro") === "1") {
      for (const [_itemId, acc] of itensProcessados) {
        const valorTotal = Math.round(acc.valor * 100) / 100;
        if (valorTotal > 0) {
          criarLancamento({
            tipo: "saida",
            descricao: `Entrada de estoque — ${acc.nome}${acc.nfs.length ? " · NF " + acc.nfs.join("/") : ""}`,
            valor: valorTotal,
            data: acc.data,
            cat: "Estoque / Insumos",
            status: "realizado",
            obs: `Auto: ${acc.qtd} ${acc.unidade || "un"}`,
          });
        }
      }
    }
  } catch (e) { /* falha na integração não deve reverter as entradas */ }

  return resultado;
}

// ─── ESTOQUE SAIDAS ───────────────────────────────────────────────────────────

export function listarEstoqueSaidas(itemId = null) {
  if (itemId) {
    return db.prepare(`
      SELECT es.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade
      FROM estoque_saidas es
      JOIN estoque_itens ei ON ei.id = es.item_id
      WHERE es.item_id = ?
      ORDER BY es.data DESC, es.created_at DESC
    `).all(itemId);
  }
  return db.prepare(`
    SELECT es.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade
    FROM estoque_saidas es
    JOIN estoque_itens ei ON ei.id = es.item_id
    ORDER BY es.data DESC, es.created_at DESC
    LIMIT 200
  `).all();
}

export function registrarSaida({ item_id, quantidade, motivo, data, obs }) {
  const item = db.prepare("SELECT * FROM estoque_itens WHERE id = ?").get(item_id);
  if (!item) throw new Error("Item não encontrado");
  const qtd = parseFloat(quantidade);
  if (item.saldo_atual < qtd) throw new Error("Saldo insuficiente");

  const id = gerarId();
  const txn = db.transaction(() => {
    db.prepare("INSERT INTO estoque_saidas (id, item_id, quantidade, motivo, data, obs) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, item_id, qtd, motivo || "consumo", data || new Date().toISOString().split("T")[0], obs || "");
    db.prepare("UPDATE estoque_itens SET saldo_atual=? WHERE id=?")
      .run(Math.round((item.saldo_atual - qtd) * 1000) / 1000, item_id);
  });
  txn();
  return db.prepare("SELECT * FROM estoque_saidas WHERE id = ?").get(id);
}

// ─── ESTOQUE AJUSTES ──────────────────────────────────────────────────────────

export function listarEstoqueAjustes(itemId = null) {
  if (itemId) {
    return db.prepare(`
      SELECT ea.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade
      FROM estoque_ajustes ea
      JOIN estoque_itens ei ON ei.id = ea.item_id
      WHERE ea.item_id = ?
      ORDER BY ea.data DESC, ea.created_at DESC
    `).all(itemId);
  }
  return db.prepare(`
    SELECT ea.*, ei.nome AS item_nome, ei.codigo AS item_codigo, ei.unidade
    FROM estoque_ajustes ea
    JOIN estoque_itens ei ON ei.id = ea.item_id
    ORDER BY ea.data DESC, ea.created_at DESC
    LIMIT 200
  `).all();
}

export function registrarAjuste({ item_id, saldo_novo, motivo, data, obs }) {
  const item = db.prepare("SELECT * FROM estoque_itens WHERE id = ?").get(item_id);
  if (!item) throw new Error("Item não encontrado");
  const novoSaldo = parseFloat(saldo_novo);
  const id = gerarId();
  const txn = db.transaction(() => {
    db.prepare("INSERT INTO estoque_ajustes (id, item_id, saldo_anterior, saldo_novo, motivo, data, obs) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, item_id, item.saldo_atual, novoSaldo, motivo || "", data || new Date().toISOString().split("T")[0], obs || "");
    db.prepare("UPDATE estoque_itens SET saldo_atual=? WHERE id=?")
      .run(Math.round(novoSaldo * 1000) / 1000, item_id);
  });
  txn();
  return db.prepare("SELECT * FROM estoque_ajustes WHERE id = ?").get(id);
}

// ─── ESTOQUE DASHBOARD ────────────────────────────────────────────────────────

export function estoqueDashboard() {
  const itens = db.prepare("SELECT * FROM estoque_itens WHERE ativo = 1 AND deleted_at IS NULL").all();
  const totalItens = itens.length;
  const estoqueValor = itens.reduce((s, i) => s + i.saldo_atual * i.custo_medio, 0);
  const itensBaixos = itens.filter(i => i.estoque_minimo > 0 && i.saldo_atual <= i.estoque_minimo);
  const itensSemEstoque = itens.filter(i => i.saldo_atual <= 0);
  const ultimasEntradas = db.prepare(`
    SELECT ee.*, ei.nome AS item_nome FROM estoque_entradas ee
    JOIN estoque_itens ei ON ei.id = ee.item_id
    ORDER BY ee.created_at DESC LIMIT 10
  `).all();
  const ultimasSaidas = db.prepare(`
    SELECT es.*, ei.nome AS item_nome FROM estoque_saidas es
    JOIN estoque_itens ei ON ei.id = es.item_id
    ORDER BY es.created_at DESC LIMIT 10
  `).all();
  return { totalItens, estoqueValor, itensBaixos, itensSemEstoque, ultimasEntradas, ultimasSaidas };
}

// ─── LIXEIRA ─────────────────────────────────────────────────────────────────

// Mapeia tipo → metadata da tabela. Cada entrada define como listar, restaurar
// e excluir definitivamente, além de gerar um resumo legível pra UI.
const LIXEIRA_TIPOS = {
  lancamentos: {
    label: "Lançamento financeiro",
    listSql: "SELECT * FROM lancamentos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => `${r.tipo === "entrada" ? "+" : "−"} R$ ${Number(r.valor || 0).toFixed(2)} · ${r.descricao}`,
    detalhe: (r) => `${r.cat} · ${r.data} · ${r.status}${r.obs ? ` · ${r.obs}` : ""}`,
    restaurar: (id) => db.prepare("UPDATE lancamentos SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM lancamentos WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  pedidos: {
    label: "Pedido",
    listSql: "SELECT * FROM pedidos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => `#${(r.id || "").slice(0, 6).toUpperCase()} · R$ ${Number(r.total || 0).toFixed(2)} · ${r.cliente_nome || "Cliente"}`,
    detalhe: (r) => `${r.status} · ${r.tipo_entrega || r.tipo} · ${r.metodo_pagamento || "-"} · criado em ${(r.created_at || "").slice(0, 16)}`,
    restaurar: (id) => db.prepare("UPDATE pedidos SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => {
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM pedido_itens WHERE pedido_id = ?").run(id);
        return db.prepare("DELETE FROM pedidos WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0;
      });
      return tx();
    },
  },
  produtos: {
    label: "Produto",
    listSql: "SELECT * FROM produtos WHERE deleted_at IS NOT NULL AND eh_promocao = 0 ORDER BY deleted_at DESC",
    resumo: (r) => `${r.nome} · R$ ${Number(r.preco || 0).toFixed(2)}`,
    detalhe: (r) => `${r.categoria || "(sem categoria)"} · custo R$ ${Number(r.custo || 0).toFixed(2)}`,
    restaurar: (id) => db.prepare("UPDATE produtos SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM produtos WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  promocoes: {
    label: "Promoção",
    listSql: "SELECT * FROM produtos WHERE deleted_at IS NOT NULL AND eh_promocao = 1 ORDER BY deleted_at DESC",
    resumo: (r) => `🔥 ${r.nome} · R$ ${Number(r.preco || 0).toFixed(2)}${r.preco_de ? ` (de R$ ${Number(r.preco_de).toFixed(2)})` : ""}`,
    detalhe: (r) => {
      const validade = (r.promo_data_inicio || r.promo_data_fim)
        ? `${r.promo_data_inicio || "sempre"} → ${r.promo_data_fim || "sempre"}`
        : "sem prazo";
      return `Vigência: ${validade}`;
    },
    restaurar: (id) => db.prepare("UPDATE produtos SET deleted_at = NULL WHERE id = ? AND eh_promocao = 1").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM produtos WHERE id = ? AND deleted_at IS NOT NULL AND eh_promocao = 1").run(id).changes > 0,
  },
  categorias: {
    label: "Categoria",
    listSql: "SELECT * FROM categorias WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => limparSufixoDel(r.nome),
    detalhe: (r) => r.permite_adicionais ? "permite adicionais" : "sem adicionais",
    restaurar: (id) => {
      const r = db.prepare("SELECT nome FROM categorias WHERE id = ? AND deleted_at IS NOT NULL").get(id);
      if (!r) return false;
      const nomeOriginal = limparSufixoDel(r.nome);
      // Conflito: já existe categoria ativa com mesmo nome?
      const conflito = db.prepare("SELECT 1 FROM categorias WHERE nome = ? AND deleted_at IS NULL").get(nomeOriginal);
      if (conflito) throw new Error(`Já existe uma categoria ativa chamada "${nomeOriginal}". Renomeie a existente antes de restaurar.`);
      return db.prepare("UPDATE categorias SET nome = ?, deleted_at = NULL WHERE id = ?").run(nomeOriginal, id).changes > 0;
    },
    hardDelete: (id) => db.prepare("DELETE FROM categorias WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  adicionais: {
    label: "Adicional",
    listSql: "SELECT * FROM adicionais WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => `${r.nome} · R$ ${Number(r.preco || 0).toFixed(2)}`,
    detalhe: (r) => `custo R$ ${Number(r.custo || 0).toFixed(2)}`,
    restaurar: (id) => db.prepare("UPDATE adicionais SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM adicionais WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  custos_fixos: {
    label: "Custo fixo",
    listSql: "SELECT * FROM custos_fixos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => `${r.nome} · R$ ${Number(r.valor || 0).toFixed(2)}/mês`,
    detalhe: (r) => `${r.categoria}${r.ativo ? "" : " · inativo"}`,
    restaurar: (id) => db.prepare("UPDATE custos_fixos SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM custos_fixos WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  estoque_itens: {
    label: "Item de estoque",
    listSql: "SELECT * FROM estoque_itens WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => `${limparSufixoDel(r.codigo)} · ${r.nome}`,
    detalhe: (r) => `saldo ${r.saldo_atual} ${r.unidade}`,
    restaurar: (id) => {
      const r = db.prepare("SELECT codigo FROM estoque_itens WHERE id = ? AND deleted_at IS NOT NULL").get(id);
      if (!r) return false;
      const codigoOriginal = limparSufixoDel(r.codigo);
      const conflito = db.prepare("SELECT 1 FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(codigoOriginal);
      if (conflito) throw new Error(`Já existe um item de estoque com código "${codigoOriginal}". Renomeie o existente antes de restaurar.`);
      return db.prepare("UPDATE estoque_itens SET codigo = ?, deleted_at = NULL WHERE id = ?").run(codigoOriginal, id).changes > 0;
    },
    hardDelete: (id) => db.prepare("DELETE FROM estoque_itens WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
  fornecedores: {
    label: "Fornecedor",
    listSql: "SELECT * FROM fornecedores WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    resumo: (r) => r.nome,
    detalhe: (r) => [r.telefone, r.email].filter(Boolean).join(" · ") || "-",
    restaurar: (id) => db.prepare("UPDATE fornecedores SET deleted_at = NULL WHERE id = ?").run(id).changes > 0,
    hardDelete: (id) => db.prepare("DELETE FROM fornecedores WHERE id = ? AND deleted_at IS NOT NULL").run(id).changes > 0,
  },
};

// Remove o sufixo "__del__{epoch}" gerado no soft-delete de campos UNIQUE
function limparSufixoDel(valor) {
  if (typeof valor !== "string") return valor;
  return valor.replace(/__del__\d+$/, "");
}

export function listarLixeira() {
  const result = {};
  for (const [tipo, meta] of Object.entries(LIXEIRA_TIPOS)) {
    const rows = db.prepare(meta.listSql).all();
    result[tipo] = {
      label: meta.label,
      itens: rows.map(r => ({
        id: r.id,
        resumo: meta.resumo(r),
        detalhe: meta.detalhe(r),
        deleted_at: r.deleted_at,
      })),
    };
  }
  return result;
}

export function restaurarItemLixeira(tipo, id) {
  const meta = LIXEIRA_TIPOS[tipo];
  if (!meta) throw new Error(`Tipo desconhecido: ${tipo}`);
  return meta.restaurar(id);
}

export function excluirDefinitivoLixeira(tipo, id) {
  const meta = LIXEIRA_TIPOS[tipo];
  if (!meta) throw new Error(`Tipo desconhecido: ${tipo}`);
  return meta.hardDelete(id);
}

// Apaga TODOS os itens da lixeira, de todas as categorias. Retorna quanto
// removeu por tipo (útil pra mostrar no toast). Chamado pelo botão
// "Limpar Lixeira" na aba Lixeira das Configurações.
export function esvaziarLixeira() {
  const contagem = {};
  for (const [tipo, meta] of Object.entries(LIXEIRA_TIPOS)) {
    const itens = db.prepare(meta.listSql).all();
    let ok = 0;
    for (const it of itens) {
      try { if (meta.hardDelete(it.id)) ok++; } catch { /* segue */ }
    }
    contagem[tipo] = { label: meta.label, removidos: ok };
  }
  return contagem;
}

// ─── MESAS (Frente de Caixa) ────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS mesas (
    id TEXT PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    lugares INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'livre' CHECK(status IN ('livre', 'ocupada', 'fechar', 'reservada')),
    reserva_nome TEXT DEFAULT '',
    reserva_hora TEXT DEFAULT '',
    reserva_pessoas INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comandas (
    id TEXT PRIMARY KEY,
    mesa_id TEXT NOT NULL,
    numero INTEGER NOT NULL,
    cliente_nome TEXT DEFAULT '',
    pessoas INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta', 'fechada', 'cancelada')),
    opened_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT DEFAULT NULL,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id)
  );

  CREATE TABLE IF NOT EXISTS comanda_itens (
    id TEXT PRIMARY KEY,
    comanda_id TEXT NOT NULL,
    produto_id TEXT DEFAULT NULL,
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario REAL NOT NULL,
    adicionais TEXT DEFAULT '[]',
    obs TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'preparando', 'pronto', 'entregue', 'cancelado')),
    origem TEXT DEFAULT 'caixa',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );
`);

// Migração: updated_at em comandas e comanda_itens — usados pelo sync nuvem↔local.
// Sem isso, pedidos feitos pelo QR (que caem na nuvem) nunca chegam no PDV local.
{
  const colsComandas = db.prepare("PRAGMA table_info(comandas)").all().map(c => c.name);
  if (!colsComandas.includes("updated_at")) {
    db.exec("ALTER TABLE comandas ADD COLUMN updated_at TEXT");
    db.exec("UPDATE comandas SET updated_at = COALESCE(updated_at, opened_at, datetime('now'))");
  }
  if (!colsComandas.includes("deleted_at")) {
    db.exec("ALTER TABLE comandas ADD COLUMN deleted_at TEXT DEFAULT NULL");
  }
  const colsItens = db.prepare("PRAGMA table_info(comanda_itens)").all().map(c => c.name);
  if (!colsItens.includes("updated_at")) {
    db.exec("ALTER TABLE comanda_itens ADD COLUMN updated_at TEXT");
    db.exec("UPDATE comanda_itens SET updated_at = COALESCE(updated_at, created_at, datetime('now'))");
  }
  if (!colsItens.includes("deleted_at")) {
    db.exec("ALTER TABLE comanda_itens ADD COLUMN deleted_at TEXT DEFAULT NULL");
  }
}

// Seed mesas padrão (12 mesas) se tabela vazia
{
  const count = db.prepare("SELECT COUNT(*) AS c FROM mesas").get().c;
  if (count === 0) {
    const ins = db.prepare("INSERT INTO mesas (id, numero, lugares) VALUES (?, ?, ?)");
    const lugaresDefault = [2, 4, 4, 2, 4, 6, 2, 4, 2, 6, 2, 4];
    for (let i = 0; i < 12; i++) {
      ins.run(gerarId(), i + 1, lugaresDefault[i]);
    }
    console.log("12 mesas criadas automaticamente");
  }
}

// Sequence para número da comanda
{
  const exists = db.prepare("SELECT 1 FROM config WHERE key = 'comanda_seq'").get();
  if (!exists) {
    db.prepare("INSERT INTO config (key, value) VALUES ('comanda_seq', '0')").run();
  }
}

// ─── MIGRAÇÃO: unificar Insumos dentro do Estoque (Estoque é o dono) ──────────
// Cada insumo vira um item de estoque; a ficha técnica (produto_insumos) passa a
// referenciar estoque_itens. Roda uma única vez (guardada por flag em config).
{
  const flag = db.prepare("SELECT value FROM config WHERE key = 'merge_estoque_insumos'").get();
  if (!flag) {
    // Garante a coluna de custo de referência (usada quando não há entradas no estoque)
    const cols = db.prepare("PRAGMA table_info(estoque_itens)").all();
    if (!cols.some(c => c.name === "custo_manual")) {
      db.exec("ALTER TABLE estoque_itens ADD COLUMN custo_manual REAL DEFAULT 0");
    }

    db.pragma("foreign_keys = OFF");
    try {
      const migrar = db.transaction(() => {
        // 1) Cada insumo -> um item de estoque (sem duplicar em reexecuções)
        const insumos = db.prepare("SELECT * FROM insumos").all();
        const mapa = {}; // insumo_id antigo -> estoque_item_id
        for (const ins of insumos) {
          const codigo = "INS-" + String(ins.id).slice(0, 10);
          let item = db.prepare("SELECT id FROM estoque_itens WHERE codigo = ?").get(codigo);
          if (!item) {
            const id = gerarId();
            db.prepare(`INSERT INTO estoque_itens (id, codigo, nome, unidade, custo_manual, saldo_atual, custo_medio, ativo)
                        VALUES (?, ?, ?, ?, ?, 0, 0, 1)`)
              .run(id, codigo, ins.nome, ins.unidade || "un", ins.preco_unitario || 0);
            item = { id };
          }
          mapa[ins.id] = item.id;
        }

        // 2) Recria produto_insumos apontando p/ estoque_itens, repontando os ids
        const pis = db.prepare("SELECT * FROM produto_insumos").all();
        const validos = new Set(db.prepare("SELECT id FROM estoque_itens").all().map(r => r.id));
        db.exec("DROP TABLE IF EXISTS produto_insumos");
        db.exec(`CREATE TABLE produto_insumos (
          id TEXT PRIMARY KEY,
          produto_id TEXT NOT NULL,
          insumo_id TEXT NOT NULL,
          quantidade REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
          FOREIGN KEY (insumo_id) REFERENCES estoque_itens(id) ON DELETE CASCADE,
          UNIQUE(produto_id, insumo_id)
        )`);
        const insPI = db.prepare("INSERT OR IGNORE INTO produto_insumos (id, produto_id, insumo_id, quantidade) VALUES (?, ?, ?, ?)");
        for (const pi of pis) {
          const novo = mapa[pi.insumo_id] || pi.insumo_id;
          if (!validos.has(novo)) continue; // pula referências órfãs
          insPI.run(pi.id, pi.produto_id, novo, pi.quantidade);
        }

        db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('merge_estoque_insumos', 'done')").run();
      });
      migrar();
      console.log("Migração Estoque+Insumos concluída.");
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }
}

// ─── MIGRAÇÃO: nem todo item de estoque é insumo ──────────────────────────────
// eh_insumo controla se o item aparece na ficha técnica (Insumos). Itens antigos
// continuam como insumo (comportamento anterior); novos escolhem no cadastro.
{
  const cols = db.prepare("PRAGMA table_info(estoque_itens)").all();
  if (!cols.some(c => c.name === "eh_insumo")) {
    db.exec("ALTER TABLE estoque_itens ADD COLUMN eh_insumo INTEGER DEFAULT 1");
  }
}

// ─── SEED: categorias padrão do estoque (ramo alimentício) ───────────────────
// Roda uma única vez (flag em config) — o admin pode apagar/criar as dele depois.
{
  const flag = db.prepare("SELECT 1 FROM config WHERE key = 'seed_estoque_categorias'").get();
  if (!flag) {
    const CATEGORIAS_PADRAO = [
      "Proteínas e Carnes", "Pães e Massas", "Hortifruti", "Frios e Laticínios",
      "Molhos e Condimentos", "Bebidas", "Congelados", "Embalagens e Descartáveis",
      "Limpeza e Higiene", "Outros",
    ];
    const insCat = db.prepare("INSERT OR IGNORE INTO estoque_categorias (id, nome) VALUES (?, ?)");
    for (const nome of CATEGORIAS_PADRAO) insCat.run(gerarId(), nome);
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('seed_estoque_categorias', 'done')").run();
    console.log("Categorias padrão do estoque criadas.");
  }
}

// ─── CARDÁPIOS: CRUD ─────────────────────────────────────────────────────────

export function listarCardapios() {
  const cardapios = db.prepare("SELECT * FROM cardapios ORDER BY ordem ASC, created_at ASC").all();
  for (const c of cardapios) {
    c.categorias = db.prepare(
      "SELECT categoria_id FROM cardapio_categorias WHERE cardapio_id = ?"
    ).all(c.id).map(r => r.categoria_id);
    c.adicionais = db.prepare(
      "SELECT adicional_id FROM cardapio_adicionais WHERE cardapio_id = ?"
    ).all(c.id).map(r => r.adicional_id);
  }
  return cardapios;
}

// Utilitário: dado um categoria_id ou adicional_id, retorna a lista de cardapio_id que o contêm.
export function listarCardapiosPorCategoria(categoriaId) {
  return db.prepare("SELECT cardapio_id FROM cardapio_categorias WHERE categoria_id = ?")
    .all(categoriaId).map(r => r.cardapio_id);
}
export function listarCardapiosPorAdicional(adicionalId) {
  return db.prepare("SELECT cardapio_id FROM cardapio_adicionais WHERE adicional_id = ?")
    .all(adicionalId).map(r => r.cardapio_id);
}

export function criarCardapio({ nome, descricao, icone, cor, imagem, tipo, config }) {
  const id = crypto.randomUUID();
  const max = db.prepare("SELECT COALESCE(MAX(ordem), -1) AS m FROM cardapios").get().m;
  db.prepare(
    "INSERT INTO cardapios (id, nome, descricao, icone, cor, ordem, imagem, tipo, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, nome, descricao || "", icone || "📋", cor || "#15803d", max + 1, imagem || "",
    tipo || "snack_bar", normalizarConfigJson(config) || "{}");
  return { id, nome };
}

export function atualizarCardapio(id, { nome, descricao, icone, cor, ativo, ordem, imagem, tipo, config }) {
  const atual = db.prepare("SELECT * FROM cardapios WHERE id = ?").get(id);
  if (!atual) throw new Error("Cardápio não encontrado");
  db.prepare(
    "UPDATE cardapios SET nome = ?, descricao = ?, icone = ?, cor = ?, ativo = ?, ordem = ?, imagem = ?, tipo = ?, config = ? WHERE id = ?"
  ).run(
    nome ?? atual.nome,
    descricao ?? atual.descricao,
    icone ?? atual.icone,
    cor ?? atual.cor,
    ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo,
    ordem ?? atual.ordem,
    imagem ?? atual.imagem,
    tipo ?? atual.tipo ?? "snack_bar",
    normalizarConfigJson(config) ?? atual.config ?? "{}",
    id
  );
}

// Preview: quantas categorias/adicionais SUMIRIAM se este cardápio fosse
// excluído em cascata (i.e., não pertencem a nenhum outro cardápio).
// Usado pelo dialog de confirmação de exclusão.
export function contarOrfaosCardapio(cardapioId) {
  const cats = db.prepare(`
    SELECT c.id, c.nome FROM categorias c
    INNER JOIN cardapio_categorias cc ON cc.categoria_id = c.id AND cc.cardapio_id = ?
    WHERE c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM cardapio_categorias cc2
        WHERE cc2.categoria_id = c.id AND cc2.cardapio_id != ?
      )
  `).all(cardapioId, cardapioId);
  const adis = db.prepare(`
    SELECT a.id, a.nome FROM adicionais a
    INNER JOIN cardapio_adicionais ca ON ca.adicional_id = a.id AND ca.cardapio_id = ?
    WHERE a.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM cardapio_adicionais ca2
        WHERE ca2.adicional_id = a.id AND ca2.cardapio_id != ?
      )
  `).all(cardapioId, cardapioId);
  return { categoriasExclusivas: cats, adicionaisExclusivos: adis };
}

export function excluirCardapio(id, { cascade = false } = {}) {
  // Se cascade, primeiro colhe as categorias/adicionais exclusivas deste
  // cardápio (antes de destruir os vínculos) e apaga em soft-delete.
  let orfaos = { categoriasExclusivas: [], adicionaisExclusivos: [] };
  if (cascade) {
    orfaos = contarOrfaosCardapio(id);
  }
  db.prepare("DELETE FROM cardapio_categorias WHERE cardapio_id = ?").run(id);
  db.prepare("DELETE FROM cardapio_adicionais WHERE cardapio_id = ?").run(id);
  db.prepare("DELETE FROM cardapios WHERE id = ?").run(id);
  if (cascade) {
    for (const c of orfaos.categoriasExclusivas) excluirCategoria(c.id);
    for (const a of orfaos.adicionaisExclusivos) excluirAdicional(a.id);
  }
  return {
    categoriasRemovidas: orfaos.categoriasExclusivas.length,
    adicionaisRemovidos: orfaos.adicionaisExclusivos.length,
  };
}

// ─── EXCLUSÃO EM CASCATA (cardápio ou categoria) ────────────────────────────
// Preview: mostra o impacto antes de confirmar. Não altera nada.
export function previewExclusaoCascata(tipo, id) {
  let categorias = [];
  let adicionais = [];

  if (tipo === "cardapio") {
    const orfaos = contarOrfaosCardapio(id);
    categorias = orfaos.categoriasExclusivas;
    adicionais = orfaos.adicionaisExclusivos;
  } else if (tipo === "categoria") {
    const cat = db.prepare("SELECT id, nome FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
    if (!cat) return null;
    categorias = [cat];
  } else return null;

  const catNomes = categorias.map(c => c.nome);
  let produtos = [];
  for (const nome of catNomes) {
    produtos.push(
      ...db.prepare("SELECT id, nome, codigo, codigo_barras FROM produtos WHERE categoria = ? AND deleted_at IS NULL").all(nome)
    );
  }

  if (produtos.length === 0) {
    return {
      categorias, adicionais,
      produtos: [], totalProdutos: 0,
      totalEstoque: 0, totalEntradas: 0, totalNotasEntrada: 0,
      totalFichas: 0, totalPedidoItens: 0,
    };
  }

  const prodIds = produtos.map(p => p.id);
  const codigos = produtos.map(p => (p.codigo || p.codigo_barras || "").trim()).filter(Boolean);

  let estoqueIds = [];
  for (const cod of codigos) {
    const ei = db.prepare("SELECT id FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(cod);
    if (ei) estoqueIds.push(ei.id);
  }

  const phProd = prodIds.map(() => "?").join(",");
  const totalFichas = db.prepare(`SELECT COUNT(*) as n FROM produto_insumos WHERE produto_id IN (${phProd})`).get(...prodIds).n;

  let totalEntradas = 0, totalNotasEntrada = 0;
  for (const eiId of estoqueIds) {
    totalEntradas += db.prepare("SELECT COUNT(*) as n FROM estoque_entradas WHERE item_id = ?").get(eiId).n;
    totalNotasEntrada += db.prepare("SELECT COUNT(*) as n FROM notas_entrada_itens WHERE estoque_item_id = ?").get(eiId).n;
  }

  const totalPedidoItens =
    db.prepare(`SELECT COUNT(*) as n FROM pedido_itens WHERE produto_id IN (${phProd})`).get(...prodIds).n +
    db.prepare(`SELECT COUNT(*) as n FROM comanda_itens WHERE produto_id IN (${phProd}) AND deleted_at IS NULL`).get(...prodIds).n;

  return {
    categorias, adicionais,
    produtos: produtos.map(p => ({ id: p.id, nome: p.nome })),
    totalProdutos: produtos.length,
    totalEstoque: estoqueIds.length,
    totalEntradas,
    totalNotasEntrada,
    totalFichas,
    totalPedidoItens,
  };
}

// Executa exclusão + limpeza conforme opções selecionadas pelo usuário.
export function executarExclusaoCascata(tipo, id, opcoes = {}) {
  const {
    excluirProdutos = true,
    limparEstoque = false,
    excluirFichas = false,
    desvincularNotas = false,
  } = opcoes;

  let categorias = [];
  if (tipo === "cardapio") {
    categorias = contarOrfaosCardapio(id).categoriasExclusivas;
  } else if (tipo === "categoria") {
    const cat = db.prepare("SELECT id, nome FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
    if (!cat) return { ok: false, error: "Categoria não encontrada" };
    categorias = [cat];
  } else return { ok: false, error: "Tipo inválido" };

  const catNomes = categorias.map(c => c.nome);
  let produtos = [];
  for (const nome of catNomes) {
    produtos.push(...db.prepare("SELECT * FROM produtos WHERE categoria = ? AND deleted_at IS NULL").all(nome));
  }

  const codigos = produtos.map(p => (p.codigo || p.codigo_barras || "").trim()).filter(Boolean);
  let estoqueIds = [];
  for (const cod of codigos) {
    const ei = db.prepare("SELECT id FROM estoque_itens WHERE codigo = ? AND deleted_at IS NULL").get(cod);
    if (ei) estoqueIds.push(ei.id);
  }

  return db.transaction(() => {
    const removidos = { produtos: 0, estoque: 0, entradas: 0, fichas: 0, notas: 0 };

    // 1. Desvincular notas de entrada (sempre antes de limpar estoque)
    if (desvincularNotas || limparEstoque) {
      for (const eiId of estoqueIds) {
        removidos.notas += db.prepare("UPDATE notas_entrada_itens SET estoque_item_id = NULL WHERE estoque_item_id = ?").run(eiId).changes;
      }
    }

    // 2. Limpar estoque (entradas + itens)
    if (limparEstoque) {
      for (const eiId of estoqueIds) {
        removidos.entradas += db.prepare("DELETE FROM estoque_entradas WHERE item_id = ?").run(eiId).changes;
        removidos.estoque += db.prepare("DELETE FROM estoque_itens WHERE id = ?").run(eiId).changes;
      }
    }

    // 3. Fichas técnicas
    if (excluirFichas) {
      for (const p of produtos) {
        removidos.fichas += db.prepare("DELETE FROM produto_insumos WHERE produto_id = ?").run(p.id).changes;
      }
    }

    // 4. Soft-delete produtos (lixeira)
    if (excluirProdutos) {
      for (const p of produtos) {
        if (excluirProduto(p.id)) removidos.produtos++;
      }
    }

    // 5. Exclusão original (cardápio hard-delete + categorias/adicionais, ou soft-delete categoria)
    if (tipo === "cardapio") {
      excluirCardapio(id, { cascade: true });
    } else {
      excluirCategoria(id);
    }

    return { ok: true, removidos };
  })();
}

export function definirCategoriasCardapio(cardapioId, categoriaIds) {
  const del = db.prepare("DELETE FROM cardapio_categorias WHERE cardapio_id = ?");
  const ins = db.prepare("INSERT INTO cardapio_categorias (cardapio_id, categoria_id) VALUES (?, ?)");
  db.transaction(() => {
    del.run(cardapioId);
    for (const catId of categoriaIds) ins.run(cardapioId, catId);
  })();
}

export function definirAdicionaisCardapio(cardapioId, adicionalIds) {
  const del = db.prepare("DELETE FROM cardapio_adicionais WHERE cardapio_id = ?");
  const ins = db.prepare("INSERT INTO cardapio_adicionais (cardapio_id, adicional_id) VALUES (?, ?)");
  db.transaction(() => {
    del.run(cardapioId);
    for (const adId of adicionalIds) ins.run(cardapioId, adId);
  })();
}

// Cria (idempotente) o "Cardápio Principal" default. Usado pelo SetupWizard
// e como fallback quando o usuário nunca criou um cardápio manualmente.
export function garantirCardapioPrincipal() {
  const existe = db.prepare("SELECT COUNT(*) AS n FROM cardapios").get().n;
  if (existe > 0) return null;
  const nova = criarCardapio({ nome: "Cardápio Principal", icone: "📋", cor: "#15803d" });
  // Vincula todas as categorias e adicionais existentes por padrão
  const cats = db.prepare("SELECT id FROM categorias WHERE deleted_at IS NULL").all().map(r => r.id);
  const ads = db.prepare("SELECT id FROM adicionais WHERE deleted_at IS NULL").all().map(r => r.id);
  definirCategoriasCardapio(nova.id, cats);
  definirAdicionaisCardapio(nova.id, ads);
  return nova;
}

// Soma dos adicionais de UMA comanda (JSON por item × quantidade do item).
// Os totais SQL (SUM(qtd*preco)) não enxergam o JSON de adicionais — sem isso
// bordas de pizza, complementos de açaí e adicionais clássicos sumiam da conta.
function totalAdicionaisComanda(comandaId) {
  const rows = db.prepare(
    "SELECT adicionais, quantidade FROM comanda_itens WHERE comanda_id = ? AND status != 'cancelado' AND deleted_at IS NULL"
  ).all(comandaId);
  let total = 0;
  for (const r of rows) {
    try {
      const ads = JSON.parse(r.adicionais || "[]");
      if (Array.isArray(ads)) {
        const porUnidade = ads.reduce((s, a) => s + (Number(a.preco) || 0) * (Number(a.quantidade) || 1), 0);
        total += porUnidade * (r.quantidade || 1);
      }
    } catch { /* JSON inválido → ignora */ }
  }
  return total;
}

export function listarMesas() {
  const mesas = db.prepare("SELECT * FROM mesas ORDER BY numero ASC").all();
  const comandaAberta = db.prepare(
    `SELECT c.id, c.numero, c.cliente_nome, c.pessoas, c.opened_at,
            COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total,
            COUNT(ci.id) AS total_itens
     FROM comandas c
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado'
     WHERE c.mesa_id = ? AND c.status = 'aberta'
     GROUP BY c.id
     LIMIT 1`
  );
  return mesas.map(m => {
    const comanda = comandaAberta.get(m.id);
    if (comanda) comanda.total += totalAdicionaisComanda(comanda.id);
    return { ...m, comanda: comanda || null };
  });
}

export function buscarMesa(id) {
  return db.prepare("SELECT * FROM mesas WHERE id = ?").get(id);
}

export function buscarMesaPorNumero(numero) {
  return db.prepare("SELECT * FROM mesas WHERE numero = ?").get(numero);
}

export function criarMesa({ numero, lugares }) {
  const id = gerarId();
  db.prepare("INSERT INTO mesas (id, numero, lugares) VALUES (?, ?, ?)").run(id, numero, lugares || 4);
  return buscarMesa(id);
}

export function atualizarMesa(id, { lugares, status, reserva_nome, reserva_hora, reserva_pessoas }) {
  const atual = buscarMesa(id);
  if (!atual) return null;
  db.prepare(
    `UPDATE mesas SET lugares = ?, status = ?, reserva_nome = ?, reserva_hora = ?, reserva_pessoas = ? WHERE id = ?`
  ).run(
    lugares ?? atual.lugares,
    status ?? atual.status,
    reserva_nome ?? atual.reserva_nome,
    reserva_hora ?? atual.reserva_hora,
    reserva_pessoas ?? atual.reserva_pessoas,
    id
  );
  return buscarMesa(id);
}

export function excluirMesa(id) {
  return db.prepare("DELETE FROM mesas WHERE id = ?").run(id).changes > 0;
}

// ─── COMANDAS ───────────────────────────────────────────────────────────────

function proximoNumeroComanda() {
  const row = db.prepare("SELECT value FROM config WHERE key = 'comanda_seq'").get();
  const next = parseInt(row.value, 10) + 1;
  db.prepare("UPDATE config SET value = ? WHERE key = 'comanda_seq'").run(String(next));
  return next;
}

export function abrirComanda({ mesa_id, cliente_nome, pessoas }) {
  const mesa = buscarMesa(mesa_id);
  if (!mesa) throw new Error("Mesa não encontrada");
  const existente = db.prepare("SELECT 1 FROM comandas WHERE mesa_id = ? AND status = 'aberta'").get(mesa_id);
  if (existente) throw new Error("Mesa já possui comanda aberta");
  const id = gerarId();
  const numero = proximoNumeroComanda();
  db.prepare(
    "INSERT INTO comandas (id, mesa_id, numero, cliente_nome, pessoas, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now'))"
  ).run(id, mesa_id, numero, cliente_nome || "", pessoas || 1);
  db.prepare("UPDATE mesas SET status = 'ocupada' WHERE id = ?").run(mesa_id);
  return buscarComanda(id);
}

export function buscarComanda(id) {
  const c = db.prepare(
    `SELECT c.*, m.numero AS mesa_numero,
            COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total,
            COUNT(ci.id) AS total_itens
     FROM comandas c
     JOIN mesas m ON m.id = c.mesa_id
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado' AND ci.deleted_at IS NULL
     WHERE c.id = ? AND c.deleted_at IS NULL
     GROUP BY c.id`
  ).get(id);
  if (c) c.total += totalAdicionaisComanda(c.id);
  return c || null;
}

export function buscarComandaPorMesa(mesa_id) {
  const c = db.prepare(
    `SELECT c.*, m.numero AS mesa_numero,
            COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total,
            COUNT(ci.id) AS total_itens
     FROM comandas c
     JOIN mesas m ON m.id = c.mesa_id
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado' AND ci.deleted_at IS NULL
     WHERE c.mesa_id = ? AND c.status = 'aberta' AND c.deleted_at IS NULL
     GROUP BY c.id`
  ).get(mesa_id);
  if (c) c.total += totalAdicionaisComanda(c.id);
  return c || null;
}

export function fecharComanda(id) {
  const c = buscarComanda(id);
  if (!c) throw new Error("Comanda não encontrada");
  db.prepare("UPDATE comandas SET status = 'fechada', closed_at = datetime('now'), updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(id);
  db.prepare("UPDATE mesas SET status = 'livre', reserva_nome = '', reserva_hora = '', reserva_pessoas = 0 WHERE id = ?").run(c.mesa_id);
  return buscarComanda(id);
}

export function cancelarComanda(id) {
  const c = buscarComanda(id);
  if (!c) throw new Error("Comanda não encontrada");
  db.prepare("UPDATE comandas SET status = 'cancelada', closed_at = datetime('now'), updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(id);
  db.prepare("UPDATE mesas SET status = 'livre', reserva_nome = '', reserva_hora = '', reserva_pessoas = 0 WHERE id = ?").run(c.mesa_id);
  return buscarComanda(id);
}

export function pedirConta(mesa_id) {
  db.prepare("UPDATE mesas SET status = 'fechar' WHERE id = ?").run(mesa_id);
  return buscarMesa(mesa_id);
}

// ─── COMANDA ITENS ──────────────────────────────────────────────────────────

// Parse do JSON de adicionais antes de devolver pro frontend.
// SEM isso, o front recebe string ("[]" ou '[{...}]') e crasha em .map/.reduce
// — o clássico causa da "tela branca" na comanda ao clicar na mesa.
function _parseItemComanda(item) {
  if (!item) return item;
  let ads = [];
  try { ads = typeof item.adicionais === "string" ? JSON.parse(item.adicionais || "[]") : (item.adicionais || []); }
  catch { ads = []; }
  return { ...item, adicionais: Array.isArray(ads) ? ads : [] };
}

export function listarItensComanda(comanda_id) {
  return db.prepare("SELECT * FROM comanda_itens WHERE comanda_id = ? AND deleted_at IS NULL ORDER BY created_at ASC")
    .all(comanda_id).map(_parseItemComanda);
}

export function adicionarItemComanda({ comanda_id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem }) {
  const id = gerarId();
  db.prepare(
    `INSERT INTO comanda_itens (id, comanda_id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now'))`
  ).run(id, comanda_id, produto_id || null, produto_nome, quantidade || 1, preco_unitario, JSON.stringify(adicionais || []), obs || "", origem || "caixa");
  // Marca a comanda como alterada — sync leva itens novos junto no próximo tick.
  db.prepare("UPDATE comandas SET updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(comanda_id);
  return _parseItemComanda(db.prepare("SELECT * FROM comanda_itens WHERE id = ?").get(id));
}

export function atualizarStatusItemComanda(id, status) {
  db.prepare("UPDATE comanda_itens SET status = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(status, id);
  const item = db.prepare("SELECT * FROM comanda_itens WHERE id = ?").get(id);
  if (item) db.prepare("UPDATE comandas SET updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(item.comanda_id);
  return _parseItemComanda(item);
}

export function removerItemComanda(id) {
  const item = db.prepare("SELECT comanda_id FROM comanda_itens WHERE id = ?").get(id);
  // Soft delete pra sync propagar remoção
  const ok = db.prepare("UPDATE comanda_itens SET deleted_at = datetime('now'), updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
  if (ok && item) db.prepare("UPDATE comandas SET updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?").run(item.comanda_id);
  return ok;
}

export function listarFilaCozinha() {
  return db.prepare(
    `SELECT ci.*, c.numero AS comanda_numero, m.numero AS mesa_numero
     FROM comanda_itens ci
     JOIN comandas c ON c.id = ci.comanda_id
     JOIN mesas m ON m.id = c.mesa_id
     WHERE ci.status IN ('pendente', 'preparando') AND c.status = 'aberta'
       AND ci.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY ci.created_at ASC`
  ).all();
}

export function listarFilaCozinhaUnificada() {
  const mesaItens = db.prepare(
    `SELECT ci.id, ci.produto_nome, ci.quantidade, ci.obs, ci.status, ci.origem, ci.created_at, ci.adicionais,
            c.id AS comanda_id, c.numero AS comanda_numero, c.cliente_nome,
            m.numero AS mesa_numero
     FROM comanda_itens ci
     JOIN comandas c ON c.id = ci.comanda_id
     JOIN mesas m ON m.id = c.mesa_id
     WHERE ci.status IN ('pendente', 'preparando') AND c.status = 'aberta'
       AND ci.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY ci.created_at ASC`
  ).all();

  const deliveryPedidos = db.prepare(
    `SELECT p.id, p.cliente_nome, p.cliente_telefone, p.tipo_entrega, p.status, p.obs, p.created_at
     FROM pedidos p
     WHERE p.status IN ('confirmado', 'preparando') AND p.deleted_at IS NULL
     ORDER BY p.created_at ASC`
  ).all();

  const grupos = [];

  // Agrupar itens de mesa por comanda
  const porComanda = {};
  for (const item of mesaItens) {
    if (!porComanda[item.comanda_id]) {
      porComanda[item.comanda_id] = {
        grupo_id: `comanda_${item.comanda_id}`,
        tipo: "mesa",
        label: `Mesa ${item.mesa_numero}`,
        mesa_numero: item.mesa_numero,
        comanda_numero: item.comanda_numero,
        cliente_nome: item.cliente_nome,
        created_at: item.created_at,
        itens: [],
      };
    }
    porComanda[item.comanda_id].itens.push({
      id: item.id,
      tipo_item: "comanda_item",
      produto_nome: item.produto_nome,
      quantidade: item.quantidade,
      obs: item.obs,
      status: item.status,
      origem: item.origem,
      adicionais: item.adicionais,
      created_at: item.created_at,
    });
  }
  for (const g of Object.values(porComanda)) {
    const todosPreparando = g.itens.every(i => i.status === "preparando");
    g.status_grupo = todosPreparando ? "preparando" : "pendente";
  }
  grupos.push(...Object.values(porComanda));

  // Pedidos delivery/retirada
  for (const p of deliveryPedidos) {
    const itens = db.prepare(
      "SELECT id, produto_nome, quantidade, adicionais FROM pedido_itens WHERE pedido_id = ?"
    ).all(p.id);
    grupos.push({
      grupo_id: `pedido_${p.id}`,
      tipo: "delivery",
      tipo_entrega: p.tipo_entrega,
      label: p.tipo_entrega === "balcao" ? "Balcão"
           : p.tipo_entrega === "retirada" ? "Retirada"
           : p.tipo_entrega === "casa" ? "No local"
           : "Delivery",
      cliente_nome: p.cliente_nome,
      status: p.status,
      status_grupo: p.status === "preparando" ? "preparando" : "pendente",
      obs: p.obs,
      created_at: p.created_at,
      pedido_id: p.id,
      itens: itens.map(i => ({
        id: i.id,
        tipo_item: "pedido_item",
        produto_nome: i.produto_nome,
        quantidade: i.quantidade,
        adicionais: i.adicionais,
        obs: "",
        status: p.status,
        origem: "online",
        created_at: p.created_at,
      })),
    });
  }

  grupos.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return grupos;
}

// ─── SESSÃO DE CAIXA (abrir/fechar/sangria/suprimento) ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sessoes_caixa (
    id TEXT PRIMARY KEY,
    operador TEXT NOT NULL DEFAULT '',
    saldo_inicial REAL NOT NULL DEFAULT 0,
    saldo_informado REAL DEFAULT NULL,
    saldo_sistema REAL DEFAULT NULL,
    diferenca REAL DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','fechada')),
    aberta_em TEXT DEFAULT (datetime('now')),
    fechada_em TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS movimentos_caixa (
    id TEXT PRIMARY KEY,
    sessao_id TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('sangria','suprimento','venda','cancelamento')),
    valor REAL NOT NULL,
    obs TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sessao_id) REFERENCES sessoes_caixa(id)
  );
`);

export function obterSessaoAberta() {
  const s = db.prepare("SELECT * FROM sessoes_caixa WHERE status = 'aberta' ORDER BY aberta_em DESC LIMIT 1").get();
  if (!s) return null;
  const movs = db.prepare("SELECT tipo, SUM(valor) AS total FROM movimentos_caixa WHERE sessao_id = ? GROUP BY tipo").all(s.id);
  const totais = {};
  for (const m of movs) totais[m.tipo] = m.total;
  const saldo_atual = s.saldo_inicial + (totais.suprimento || 0) + (totais.venda || 0) - (totais.sangria || 0) - (totais.cancelamento || 0);
  return { ...s, aberta: true, saldo_atual, totais };
}

export function abrirCaixa(operador, saldo_inicial) {
  const id = gerarId();
  db.prepare("INSERT INTO sessoes_caixa (id, operador, saldo_inicial) VALUES (?, ?, ?)").run(id, operador, saldo_inicial);
  return obterSessaoAberta();
}

export function registrarMovimentoCaixa(sessao_id, tipo, valor, obs) {
  const id = gerarId();
  db.prepare("INSERT INTO movimentos_caixa (id, sessao_id, tipo, valor, obs) VALUES (?, ?, ?, ?, ?)").run(id, sessao_id, tipo, valor, obs || "");
}

export function fecharCaixa(sessao_id, saldo_informado) {
  const s = db.prepare("SELECT * FROM sessoes_caixa WHERE id = ?").get(sessao_id);
  if (!s) return null;
  const movs = db.prepare("SELECT tipo, SUM(valor) AS total FROM movimentos_caixa WHERE sessao_id = ? GROUP BY tipo").all(sessao_id);
  const totais = {};
  for (const m of movs) totais[m.tipo] = m.total;
  const saldo_sistema = s.saldo_inicial + (totais.suprimento || 0) + (totais.venda || 0) - (totais.sangria || 0) - (totais.cancelamento || 0);
  const diferenca = saldo_informado - saldo_sistema;
  db.prepare("UPDATE sessoes_caixa SET status = 'fechada', fechada_em = datetime('now'), saldo_informado = ?, saldo_sistema = ?, diferenca = ? WHERE id = ?")
    .run(saldo_informado, saldo_sistema, diferenca, sessao_id);
  return { ...db.prepare("SELECT * FROM sessoes_caixa WHERE id = ?").get(sessao_id), totais, saldo_sistema, diferenca };
}

export function listarMovimentosCaixa(sessao_id) {
  return db.prepare("SELECT * FROM movimentos_caixa WHERE sessao_id = ? ORDER BY created_at ASC").all(sessao_id);
}

export function estatisticasCaixa() {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  const mesas = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'livre' THEN 1 ELSE 0 END) AS livres, SUM(CASE WHEN status = 'ocupada' THEN 1 ELSE 0 END) AS ocupadas, SUM(CASE WHEN status = 'fechar' THEN 1 ELSE 0 END) AS fechando FROM mesas").get();

  const fatComandas = db.prepare(
    `SELECT COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total, COUNT(DISTINCT c.id) AS pedidos
     FROM comandas c
     JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado'
     WHERE c.status = 'fechada' AND date(c.closed_at) = ?`
  ).get(hojeStr);
  // Adicionais (JSON por item) não entram no SUM acima — soma à parte
  const fechadasHoje = db.prepare(
    "SELECT id FROM comandas WHERE status = 'fechada' AND date(closed_at) = ?"
  ).all(hojeStr);
  for (const c of fechadasHoje) fatComandas.total += totalAdicionaisComanda(c.id);

  const fatPedidos = db.prepare(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS pedidos
     FROM pedidos WHERE status = 'entregue' AND date(created_at) = ?`
  ).get(hojeStr);

  const mesasHoje = db.prepare(
    `SELECT COUNT(DISTINCT mesa_id) AS total FROM comandas WHERE date(opened_at) = ?`
  ).get(hojeStr);

  const pedidosHoje = db.prepare(
    `SELECT COUNT(*) AS total FROM pedidos WHERE date(created_at) = ?`
  ).get(hojeStr);

  return {
    mesas,
    faturamento: {
      total: fatComandas.total + fatPedidos.total,
      pedidos: fatComandas.pedidos + fatPedidos.pedidos,
      mesas_atendidas: mesasHoje.total,
      pedidos_balcao: pedidosHoje.total,
    },
  };
}

// ─── IMPRESSÃO: eventos ──────────────────────────────────────────────────────
// Cada tentativa (sucesso ou falha) da Cozinha vira uma linha aqui — vira base
// do relatório do Suporte "Lista de Impressão".
export function registrarImpressaoEvento(dados) {
  const {
    pedido_id = null, status, modo = null, impressora = null,
    tentativa = 1, bytes = 0, erro = null, detalhes = null, origem = "cozinha-auto",
  } = dados || {};
  if (!status) throw new Error("status é obrigatório");
  const info = db.prepare(`
    INSERT INTO impressao_eventos (
      pedido_id, status, modo, impressora, tentativa, bytes, erro, detalhes, origem
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pedido_id, status, modo, impressora, tentativa, bytes,
    erro || null,
    detalhes ? (typeof detalhes === "string" ? detalhes : JSON.stringify(detalhes)) : null,
    origem,
  );
  return { id: info.lastInsertRowid };
}

export function listarImpressaoEventos({ limite = 200, pedido_id = null } = {}) {
  const conds = [];
  const params = [];
  if (pedido_id) { conds.push("pedido_id = ?"); params.push(String(pedido_id)); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const lim = Math.max(1, Math.min(1000, Number(limite) || 200));
  return db.prepare(`
    SELECT * FROM impressao_eventos
    ${where}
    ORDER BY id DESC
    LIMIT ${lim}
  `).all(...params);
}

// ─── NF-e DE ENTRADA (controle fiscal de compras) ──────────────────────────

export function parseNFeXml(xmlStr) {
  const t = (tag) => {
    const m = xmlStr.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  const allMatches = (tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const results = [];
    let m;
    while ((m = re.exec(xmlStr)) !== null) results.push(m[1]);
    return results;
  };

  const ide = t("ide");
  const emit = t("emit");
  const total = t("ICMSTot");

  const chaveMatch = xmlStr.match(/Id="NFe(\d{44})"/);
  const chave = chaveMatch ? chaveMatch[1] : "";

  const tIde = (tag) => { const m = ide.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };
  const tEmit = (tag) => { const m = emit.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };
  const tTotal = (tag) => { const m = total.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };

  const enderEmit = t("enderEmit");
  const tEnder = (tag) => { const m = enderEmit.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };

  const nota = {
    chave_acesso: chave,
    numero_nf: tIde("nNF"),
    serie: tIde("serie"),
    data_emissao: tIde("dhEmi").slice(0, 10),
    fornecedor_nome: tEmit("xNome"),
    fornecedor_cnpj: tEmit("CNPJ"),
    fornecedor_ie: tEmit("IE"),
    fornecedor_cidade: tEnder("xMun"),
    fornecedor_uf: tEnder("UF"),
    valor_total: parseFloat(tTotal("vNF")) || 0,
  };

  const dets = allMatches("det");
  const itens = dets.map((det, i) => {
    const prod = det.match(/<prod>([\s\S]*?)<\/prod>/);
    const p = prod ? prod[1] : "";
    const tP = (tag) => { const m = p.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };
    return {
      num_item: i + 1,
      produto_nome: tP("xProd"),
      codigo: tP("cProd"),
      ncm: tP("NCM"),
      cfop: tP("CFOP"),
      unidade: tP("uCom"),
      quantidade: parseFloat(tP("qCom")) || 0,
      valor_unitario: parseFloat(tP("vUnCom")) || 0,
      valor_total: parseFloat(tP("vProd")) || 0,
    };
  });

  return { nota, itens };
}

export function salvarNotaEntrada(nota, itens, xmlOriginal = "") {
  const id = randomBytes(8).toString("hex");
  db.prepare(`
    INSERT INTO notas_entrada (id, chave_acesso, numero_nf, serie, data_emissao,
      fornecedor_nome, fornecedor_cnpj, fornecedor_ie, valor_total, xml_original, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, nota.chave_acesso || "", nota.numero_nf || "", nota.serie || "",
    nota.data_emissao || "", nota.fornecedor_nome || "", nota.fornecedor_cnpj || "",
    nota.fornecedor_ie || "", nota.valor_total || 0, xmlOriginal, nota.origem || "xml",
  );

  const insItem = db.prepare(`
    INSERT INTO notas_entrada_itens (id, nota_id, num_item, produto_nome, codigo, ncm,
      cfop, unidade, quantidade, valor_unitario, valor_total, estoque_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const itensIds = [];
  for (const it of itens) {
    const itemId = randomBytes(8).toString("hex");
    insItem.run(
      itemId, id, it.num_item || 0, it.produto_nome || "", it.codigo || "",
      it.ncm || "", it.cfop || "", it.unidade || "un",
      it.quantidade || 0, it.valor_unitario || 0, it.valor_total || 0,
      it.estoque_item_id || null,
    );
    itensIds.push(itemId);
  }

  return { id, itensIds };
}

export function listarNotasEntrada({ limite = 100, offset = 0, mes = null } = {}) {
  let where = "";
  const params = [];
  if (mes) {
    where = "WHERE strftime('%Y-%m', data_emissao) = ?";
    params.push(mes);
  }
  params.push(Math.min(500, Math.max(1, Number(limite) || 100)));
  params.push(Math.max(0, Number(offset) || 0));
  const notas = db.prepare(`
    SELECT id, chave_acesso, numero_nf, serie, data_emissao, fornecedor_nome,
           fornecedor_cnpj, valor_total, origem, created_at
    FROM notas_entrada ${where}
    ORDER BY data_emissao DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM notas_entrada ${where}`).get(
    ...(mes ? [mes] : [])
  ).c;
  return { notas, total };
}

export function buscarNotaEntrada(id) {
  const nota = db.prepare("SELECT * FROM notas_entrada WHERE id = ?").get(id);
  if (!nota) return null;
  const itens = db.prepare(
    "SELECT * FROM notas_entrada_itens WHERE nota_id = ? ORDER BY num_item"
  ).all(id);
  return { ...nota, itens };
}

export function excluirNotaEntrada(id) {
  return db.prepare("DELETE FROM notas_entrada WHERE id = ?").run(id);
}

export function vincularItemEntradaAoEstoque(itemEntradaId, estoqueItemId) {
  return db.prepare(
    "UPDATE notas_entrada_itens SET estoque_item_id = ? WHERE id = ?"
  ).run(estoqueItemId, itemEntradaId);
}

export function criarEstoqueAPartirDeEntrada(itemEntrada, tipo = "revenda") {
  const codigo = itemEntrada.codigo || ("NF-" + randomBytes(4).toString("hex"));
  const existente = db.prepare("SELECT id FROM estoque_itens WHERE codigo = ? AND (deleted_at IS NULL OR deleted_at = '')").get(codigo);
  if (existente) return existente.id;

  const id = randomBytes(6).toString("hex");
  db.prepare(`
    INSERT INTO estoque_itens (id, codigo, nome, unidade, saldo_atual, custo_medio, tipo, ncm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, codigo, itemEntrada.produto_nome || "Produto importado",
    itemEntrada.unidade || "un", itemEntrada.quantidade || 0,
    itemEntrada.valor_unitario || 0, tipo, itemEntrada.ncm || "",
  );

  const entradaId = randomBytes(6).toString("hex");
  db.prepare(`
    INSERT INTO estoque_entradas (id, item_id, quantidade, custo_unitario, data, nf, obs)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entradaId, id, itemEntrada.quantidade || 0, itemEntrada.valor_unitario || 0,
    new Date().toISOString().slice(0, 10), itemEntrada.codigo || "", "Importado de NF-e de entrada",
  );

  return id;
}

export function notasEntradaDoMes(anoMes) {
  return db.prepare(`
    SELECT id, chave_acesso, numero_nf, serie, data_emissao, fornecedor_nome,
           fornecedor_cnpj, valor_total, xml_original, origem, created_at
    FROM notas_entrada
    WHERE strftime('%Y-%m', data_emissao) = ?
    ORDER BY data_emissao ASC
  `).all(anoMes);
}

// ─── RELATÓRIO FISCAL CONSOLIDADO ───────────────────────────────────────────

export function relatorioFiscal({ mes, nivel = "resumo", tipo = "todos" } = {}) {
  const anoMes = mes || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();

  const saida = { quantidade: 0, total: 0, produtos: [] };
  const entrada = { quantidade: 0, total: 0, itens: [] };

  // ── SAÍDA (NFC-e autorizadas) ──
  if (tipo === "todos" || tipo === "saida") {
    const nfces = db.prepare(`
      SELECT id, numero, serie, chave, motor, valor_total, created_at
      FROM nfce_emitidas
      WHERE status = 'autorizada' AND strftime('%Y-%m', created_at) = ?
    `).all(anoMes);

    saida.quantidade = nfces.length;
    saida.total = nfces.reduce((s, n) => s + (n.valor_total || 0), 0);

    if (nivel === "produto" || nivel === "completo") {
      const porProduto = {};
      for (const nfce of nfces) {
        const pedido = db.prepare("SELECT id, metodo_pagamento FROM pedidos WHERE id = (SELECT pedido_id FROM nfce_emitidas WHERE id = ?)").get(nfce.id);
        if (!pedido) continue;
        const itens = db.prepare("SELECT produto_id, produto_nome, quantidade, preco_unitario, custo_unitario FROM pedido_itens WHERE pedido_id = ?").all(pedido.id);
        for (const it of itens) {
          const key = it.produto_id || it.produto_nome;
          if (!porProduto[key]) {
            porProduto[key] = { produto_id: it.produto_id, nome: it.produto_nome, quantidade: 0, faturamento: 0, custo: 0, ocorrencias: 0 };
          }
          const qtd = Number(it.quantidade) || 0;
          porProduto[key].quantidade += qtd;
          porProduto[key].faturamento += qtd * (Number(it.preco_unitario) || 0);
          porProduto[key].custo += qtd * (Number(it.custo_unitario) || 0);
          porProduto[key].ocorrencias += 1;
        }
      }
      saida.produtos = Object.values(porProduto).sort((a, b) => b.faturamento - a.faturamento);
      if (nivel === "completo") {
        for (const p of saida.produtos) {
          p.margem = p.faturamento - p.custo;
          p.margem_pct = p.faturamento > 0 ? ((p.margem / p.faturamento) * 100) : 0;
        }
      }
    }
  }

  // ── ENTRADA (NF-e de fornecedores) ──
  if (tipo === "todos" || tipo === "entrada") {
    const nfes = db.prepare(`
      SELECT id, numero_nf, fornecedor_nome, fornecedor_cnpj, valor_total, data_emissao, origem
      FROM notas_entrada
      WHERE strftime('%Y-%m', data_emissao) = ?
    `).all(anoMes);

    entrada.quantidade = nfes.length;
    entrada.total = nfes.reduce((s, n) => s + (n.valor_total || 0), 0);

    if (nivel === "produto" || nivel === "completo") {
      for (const nfe of nfes) {
        const itensNfe = db.prepare("SELECT produto_nome, ncm, quantidade, valor_unitario, valor_total, unidade FROM notas_entrada_itens WHERE nota_id = ?").all(nfe.id);
        entrada.itens.push({
          nota_id: nfe.id,
          numero_nf: nfe.numero_nf,
          fornecedor: nfe.fornecedor_nome,
          cnpj: nfe.fornecedor_cnpj,
          data: nfe.data_emissao,
          origem: nfe.origem,
          valor_nota: nfe.valor_total,
          produtos: itensNfe,
        });
      }
    }
  }

  return {
    periodo: anoMes,
    nivel,
    tipo,
    saida,
    entrada,
    saldo: saida.total - entrada.total,
  };
}

export default db;
