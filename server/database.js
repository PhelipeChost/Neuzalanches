import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomBytes, createCipheriv, createDecipheriv, createHash, createSign, X509Certificate } from "crypto";
import { request as httpsRequest } from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Caminho do banco: configurável por env (o app desktop aponta para uma pasta
// gravável do usuário — %APPDATA%). Default = comportamento do servidor web.
const DB_PATH = process.env.FLUXO_DB_PATH || join(__dirname, "..", "fluxo-caixa.db");

const db = new Database(DB_PATH);

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
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado')),
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
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario REAL NOT NULL,
    custo_unitario REAL NOT NULL DEFAULT 0,
    adicionais TEXT DEFAULT '[]',
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
`);

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
}

// ─── MIGRAÇÃO: cardapios ganha imagem (foto para tela de seleção) ────────────
{
  const colsCard = db.prepare("PRAGMA table_info(cardapios)").all().map(c => c.name);
  if (!colsCard.includes("imagem")) db.exec("ALTER TABLE cardapios ADD COLUMN imagem TEXT DEFAULT ''");
}

// Inserir chave PIX padrão se não existir
const existePix = db.prepare("SELECT 1 FROM config WHERE key = 'pix_key'").get();
if (!existePix) {
  db.prepare("INSERT INTO config (key, value) VALUES ('pix_key', '11999999999')").run();
}
const existePixNome = db.prepare("SELECT 1 FROM config WHERE key = 'pix_nome'").get();
if (!existePixNome) {
  db.prepare("INSERT INTO config (key, value) VALUES ('pix_nome', 'Neuza Lanches')").run();
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

export function criarLancamento({ tipo, descricao, valor, data, cat, status, obs, custo }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs, custo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, tipo, descricao, valor, data, cat, status, obs || "", custo != null ? Number(custo) : null);
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

// Reconhece um certificado A1 (.pfx/.p12) usando o OpenSSL do servidor.
// Retorna { ok, cnpj, titular, validade_fim, erro }. Não deixa a senha na
// linha de comando (passa via variável de ambiente CERTPW).
export function lerCertificadoA1(pfxBase64, senha) {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), "nexus-cert-"));
    const pfxPath = join(dir, "c.pfx");
    writeFileSync(pfxPath, Buffer.from(pfxBase64, "base64"));

    const extrairPem = (comLegacy) => {
      const args = ["pkcs12", "-in", pfxPath, "-nokeys", "-clcerts", "-passin", "env:CERTPW"];
      if (comLegacy) args.push("-legacy");
      return execFileSync("openssl", args, {
        env: { ...process.env, CERTPW: senha || "" },
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
    };

    let pem;
    try { pem = extrairPem(false); }
    catch (e1) {
      // OpenSSL 3.x pode exigir -legacy para .pfx com algoritmos antigos (comum no ICP-Brasil)
      try { pem = extrairPem(true); }
      catch (e2) {
        const msg = String((e2 && e2.stderr) || (e1 && e1.stderr) || "");
        if (/mac verify|invalid password|wrong|verification failure/i.test(msg)) {
          return { ok: false, erro: "Senha do certificado incorreta." };
        }
        if (/ENOENT|not found/i.test(String(e1))) {
          return { ok: false, erro: "OpenSSL não disponível no servidor — não foi possível validar o certificado." };
        }
        return { ok: false, erro: "Não foi possível ler o certificado (arquivo inválido ou senha errada)." };
      }
    }

    const info = execFileSync("openssl", ["x509", "-noout", "-enddate", "-subject"], {
      input: pem, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"],
    });

    // notAfter=Aug 12 23:59:59 2026 GMT
    const mEnd = info.match(/notAfter=(.+)/);
    let validade_fim = "";
    if (mEnd) {
      const d = new Date(mEnd[1].trim());
      if (!isNaN(d)) validade_fim = d.toISOString();
    }
    // ICP-Brasil: CN geralmente "EMPRESA LTDA:12345678000199"
    const mCnpj = info.match(/(\d{14})/);
    const cnpj = mCnpj ? mCnpj[1] : "";
    const mCn = info.match(/CN\s*=\s*([^,/\n]+)/i);
    const titular = mCn ? mCn[1].trim().replace(/:\d{14}$/, "") : "";

    return { ok: true, cnpj, titular, validade_fim };
  } catch (e) {
    return { ok: false, erro: "Falha ao processar o certificado: " + (e.message || "erro desconhecido") };
  } finally {
    if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
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
  };
  db.prepare(`UPDATE fiscal_config SET
    nfce_habilitado=@nfce_habilitado, ambiente=@ambiente, cnpj=@cnpj, razao_social=@razao_social,
    nome_fantasia=@nome_fantasia, inscricao_estadual=@inscricao_estadual, regime_tributario=@regime_tributario,
    cep=@cep, logradouro=@logradouro, numero=@numero, bairro=@bairro, municipio=@municipio,
    codigo_municipio=@codigo_municipio, uf=@uf, csc=@csc, csc_id=@csc_id, serie=@serie,
    proximo_numero=@proximo_numero, provedor=@provedor, provedor_token=@provedor_token,
    antigo_habilitado=@antigo_habilitado, antigo_serie=@antigo_serie,
    antigo_proximo_numero=@antigo_proximo_numero, ncm_padrao=@ncm_padrao, cfop_padrao=@cfop_padrao,
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
  const itens = (pedido.itens || []).map((it, i) => {
    const adicionais = (it.adicionais || []);
    const valorAdic = adicionais.reduce((s, a) => s + (a.preco || 0) * (a.quantidade || 1), 0);
    const valorUnit = (it.preco_unitario || 0) + valorAdic;
    return {
      numero_item: i + 1,
      codigo: it.produto_id || String(i + 1),
      descricao: it.produto_nome + (adicionais.length ? " (" + adicionais.map(a => a.nome).join(", ") + ")" : ""),
      ncm: it.ncm || "00000000",           // TODO: cadastrar NCM no produto
      cfop: it.cfop || "5102",             // venda de mercadoria dentro do estado
      unidade: "UN",
      quantidade: it.quantidade || 1,
      valor_unitario: Math.round(valorUnit * 100) / 100,
      valor_total: Math.round(valorUnit * (it.quantidade || 1) * 100) / 100,
      // grupo de impostos deixado a cargo do provedor (Simples: CSOSN; reforma: IBS/CBS)
      regime: fisc.regime_tributario,
    };
  });
  const valorTotal = itens.reduce((s, it) => s + it.valor_total, 0);
  const mapaPgto = { pix: "17", credito: "03", debito: "04", dinheiro: "01", cartao: "99" };
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
// Quando um provedor for configurado, aqui entra a chamada REST real.
export function emitirNFCe(pedidoId, { simulado = false } = {}) {
  const fisc = db.prepare("SELECT * FROM fiscal_config WHERE id = 1").get() || {};
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
  } else {
    // ─────────────────────────────────────────────────────────────────────────
    // TODO (agosto): chamada REST ao provedor configurado.
    //   const resp = await chamarProvedor(fisc.provedor, decrypt(fisc.provedor_token), payload, certParaProvedor);
    //   grava chave/protocolo/status/qr a partir de resp.
    // Cada provedor tem endpoints próprios (Focus NFe, PlugNotas, etc.).
    // ─────────────────────────────────────────────────────────────────────────
    throw new Error(`Emissão real via provedor "${fisc.provedor}" ainda não implementada. Use o modo simulado por enquanto.`);
  }

  // Avança o número da NFC-e
  db.prepare("UPDATE fiscal_config SET proximo_numero = ? WHERE id = 1").run(numero + 1);
  return registro;
}

export function listarNFCe(limit = 20) {
  return db.prepare("SELECT id, pedido_id, numero, serie, ambiente, chave, status, motivo, valor_total, qr_code_url, provedor, created_at FROM nfce_emitidas WHERE COALESCE(motor,'novo') = 'novo' ORDER BY created_at DESC LIMIT ?").all(limit);
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

// Texto "fiscal": sem quebras, espaços colapsados, tamanho limitado
function txtFiscal(s, max = 120) {
  return xmlEsc(String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max));
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

// Extrai chave privada + certificado (PEM) do A1 guardado, via OpenSSL do servidor.
// Retorna { keyPem, certPem, chainPem, certB64 } — certB64 = DER base64 p/ o KeyInfo.
function extrairMaterialA1() {
  const r = db.prepare("SELECT cert_data, cert_senha FROM fiscal_config WHERE id = 1").get() || {};
  const pfxB64 = fiscDecriptar(r.cert_data);
  const senha = fiscDecriptar(r.cert_senha);
  if (!pfxB64) throw new Error("Certificado A1 não enviado. Envie o .pfx na aba Fiscal / NFC-e.");

  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), "nexus-a1-"));
    const pfxPath = join(dir, "c.pfx");
    writeFileSync(pfxPath, Buffer.from(pfxB64, "base64"));
    const env = { ...process.env, CERTPW: senha || "" };
    const run = (args) => execFileSync("openssl", args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const tentar = (args) => {
      try { return run(args); }
      catch { return run([...args, "-legacy"]); } // OpenSSL 3.x + pfx ICP-Brasil antigo
    };

    const keyPem = tentar(["pkcs12", "-in", pfxPath, "-nocerts", "-nodes", "-passin", "env:CERTPW"]);
    const certOut = tentar(["pkcs12", "-in", pfxPath, "-clcerts", "-nokeys", "-passin", "env:CERTPW"]);
    let chainPem = "";
    try { chainPem = tentar(["pkcs12", "-in", pfxPath, "-cacerts", "-nokeys", "-passin", "env:CERTPW"]); } catch { /* sem cadeia embutida */ }

    const mCert = certOut.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
    const mKey = keyPem.match(/-----BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |ENCRYPTED )?PRIVATE KEY-----/);
    if (!mCert || !mKey) throw new Error("Não foi possível extrair chave/certificado do A1.");
    const certPem = mCert[0];
    const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    return { keyPem: mKey[0], certPem, chainPem, certB64 };
  } finally {
    if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
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
  if (!fisc.uf) faltas.push("UF");
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
  const cUF = String(UF_CODIGO[fisc.uf] || 35);
  const nNF = String(numero);
  let cNF;
  do { cNF = String(Math.floor(Math.random() * 1e8)).padStart(8, "0"); }
  while (cNF === nNF.padStart(8, "0"));
  const chave = gerarChaveAcesso({ cUF, cnpj, modelo: "65", serie, numero, tpEmis: "1", cNF, aammEmissao: aamm });
  const cDV = chave.slice(-1);

  const ncmPadrao = (fisc.ncm_padrao || "21069090").padStart(8, "0");
  const cfopPadrao = fisc.cfop_padrao || "5102";
  const crt = fisc.regime_tributario === "mei" ? "4" : "1";

  // Itens
  const itens = (pedido.itens || []).map((it, i) => {
    const adicionais = it.adicionais || [];
    const vAdic = adicionais.reduce((s, a) => s + (a.preco || 0) * (a.quantidade || 1), 0);
    const vUnit = Math.round(((it.preco_unitario || 0) + vAdic) * 100) / 100;
    const qtd = it.quantidade || 1;
    const vProd = Math.round(vUnit * qtd * 100) / 100;
    const nomeCompleto = it.produto_nome + (adicionais.length ? " c/ " + adicionais.map(a => a.nome).join(", ") : "");
    const xProd = (tpAmb === "2" && i === 0) ? HOMOLOG_XPROD : txtFiscal(nomeCompleto);
    return { seq: i + 1, cProd: txtFiscal(it.produto_id || String(i + 1), 60), xProd, ncm: (it.ncm || ncmPadrao), cfop: (it.cfop || cfopPadrao), qtd, vUnit, vProd };
  });
  const vNF = Math.round(itens.reduce((s, it) => s + it.vProd, 0) * 100) / 100;

  const detXml = itens.map(it =>
    `<det nItem="${it.seq}">` +
    `<prod>` +
    `<cProd>${it.cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.xProd}</xProd>` +
    `<NCM>${it.ncm}</NCM><CFOP>${it.cfop}</CFOP>` +
    `<uCom>UN</uCom><qCom>${dec(it.qtd, 4)}</qCom><vUnCom>${dec(it.vUnit)}</vUnCom><vProd>${dec(it.vProd)}</vProd>` +
    `<cEANTrib>SEM GTIN</cEANTrib><uTrib>UN</uTrib><qTrib>${dec(it.qtd, 4)}</qTrib><vUnTrib>${dec(it.vUnit)}</vUnTrib>` +
    `<indTot>1</indTot>` +
    `</prod>` +
    `<imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>` +
    `</det>`
  ).join("");

  // Pagamento (regras vigentes: tPag; 99 exige xPag)
  const mapaPgto = { pix: "17", credito: "03", debito: "04", dinheiro: "01" };
  const tPag = mapaPgto[pedido.metodo_pagamento] || "99";
  const trocoPara = Number(pedido.troco_para || 0);
  const temTroco = tPag === "01" && trocoPara > vNF;
  const vPag = temTroco ? trocoPara : vNF;
  const pagXml =
    `<pag><detPag><indPag>0</indPag><tPag>${tPag}</tPag>` +
    (tPag === "99" ? `<xPag>Outros</xPag>` : "") +
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
    `<UF>${fisc.uf}</UF><CEP>${(fisc.cep || "").replace(/\D/g, "")}</CEP>` +
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
  let cStat = "", xMotivo = "", nProt = "", retorno = "", status = "erro";
  try {
    const wsdl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
    retorno = await postSefaz(urls.autorizacao, `${wsdl}/nfeAutorizacaoLote`, soap12(wsdl, enviNFe), material);
    const prot = (retorno.match(/<protNFe[\s\S]*?<\/protNFe>/) || [""])[0];
    cStat = xmlTag(prot, "cStat") || xmlTag(retorno, "cStat");
    xMotivo = xmlTag(prot, "xMotivo") || xmlTag(retorno, "xMotivo") || "(sem retorno da SEFAZ)";
    nProt = xmlTag(prot, "nProt");
    status = cStat === "100" ? "autorizada" : "rejeitada";
  } catch (err) {
    status = "erro";
    xMotivo = err.message || "Falha de comunicação com a SEFAZ";
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

export function obterXmlNFCeAntigo(id) {
  const r = db.prepare("SELECT numero, serie, chave, xml_assinado FROM nfce_emitidas WHERE id = ? AND motor = 'antigo'").get(id);
  if (!r || !r.xml_assinado) return null;
  return r;
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

export function listarCategorias() {
  return db.prepare("SELECT * FROM categorias WHERE deleted_at IS NULL ORDER BY ordem ASC, nome ASC").all();
}

export function buscarCategoria(id) {
  return db.prepare("SELECT * FROM categorias WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function buscarCategoriaPorNome(nome) {
  return db.prepare("SELECT * FROM categorias WHERE nome = ? AND deleted_at IS NULL").get(nome);
}

export function criarCategoria({ nome, permite_adicionais }) {
  const id = gerarId();
  // Nova categoria entra no fim
  const max = db.prepare("SELECT COALESCE(MAX(ordem), -1) AS m FROM categorias WHERE deleted_at IS NULL").get().m;
  db.prepare(
    "INSERT INTO categorias (id, nome, permite_adicionais, ordem) VALUES (?, ?, ?, ?)"
  ).run(id, nome, permite_adicionais ? 1 : 0, max + 1);
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

export function listarAdicionais(apenasDisponiveis = false) {
  const sql = apenasDisponiveis
    ? "SELECT * FROM adicionais WHERE disponivel = 1 AND deleted_at IS NULL ORDER BY nome"
    : "SELECT * FROM adicionais WHERE deleted_at IS NULL ORDER BY nome";
  return db.prepare(sql).all();
}

export function buscarAdicional(id) {
  return db.prepare("SELECT * FROM adicionais WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function criarAdicional({ nome, preco, custo, disponivel, max_quantidade, categoria_id }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO adicionais (id, nome, preco, custo, disponivel, max_quantidade, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, nome, preco, custo || 0,
    disponivel !== undefined ? (disponivel ? 1 : 0) : 1,
    Math.max(0, parseInt(max_quantidade, 10) || 0),
    categoria_id || null
  );
  return buscarAdicional(id);
}

export function atualizarAdicional(id, { nome, preco, custo, disponivel, max_quantidade, categoria_id }) {
  const result = db.prepare(
    "UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ?, max_quantidade = ?, categoria_id = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(
    nome, preco, custo || 0,
    disponivel ? 1 : 0,
    Math.max(0, parseInt(max_quantidade, 10) || 0),
    categoria_id || null,
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

export function criarProduto({ nome, descricao, preco, custo, categoria, imagem, disponivel }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO produtos (id, nome, descricao, preco, custo, categoria, imagem, disponivel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, nome, descricao || "", preco, custo || 0, categoria || "", imagem || "", disponivel !== undefined ? (disponivel ? 1 : 0) : 1);
  return buscarProduto(id);
}

export function atualizarProduto(id, { nome, descricao, preco, custo, categoria, imagem, disponivel }) {
  const result = db.prepare(
    "UPDATE produtos SET nome = ?, descricao = ?, preco = ?, custo = ?, categoria = ?, imagem = ?, disponivel = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(nome, descricao || "", preco, custo || 0, categoria || "", imagem || "", disponivel ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarProduto(id);
}

export function excluirProduto(id) {
  return db.prepare("UPDATE produtos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
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

export function criarPedido({ cliente_id, cliente_nome, cliente_telefone, cliente_email, itens, obs, tipo, metodo_pagamento, troco_para, tipo_entrega, endereco }) {
  const id = gerarId();

  // Calcular total considerando adicionais
  const total = itens.reduce((s, item) => {
    const adicionaisTotal = (item.adicionais || []).reduce((a, ad) => a + ad.preco * (ad.quantidade || 1), 0);
    return s + (item.preco_unitario + adicionaisTotal) * item.quantidade;
  }, 0);

  const end = endereco || {};

  const inserirPedido = db.prepare(
    "INSERT INTO pedidos (id, cliente_id, cliente_nome, cliente_telefone, cliente_email, total, obs, tipo, metodo_pagamento, troco_para, tipo_entrega, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_referencia, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now'))"
  );
  const inserirItem = db.prepare(
    "INSERT INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    const tipoEnt = ['retirada', 'casa'].includes(tipo_entrega) ? tipo_entrega : 'entrega';
    inserirPedido.run(id, cliente_id || null, cliente_nome || "", cliente_telefone || "", cliente_email || "", total, obs || "", tipo || "online", metodo_pagamento || "", (troco_para && Number(troco_para) > 0) ? Number(troco_para) : null, tipoEnt, end.cep || "", end.rua || "", end.numero || "", end.bairro || "", end.referencia || "");
    for (const item of itens) {
      // Buscar custo do produto no banco
      const produtoDB = buscarProduto(item.produto_id);
      const custoProduto = produtoDB ? produtoDB.custo : 0;
      // Somar custos dos adicionais
      const adicionaisComCusto = (item.adicionais || []).map(ad => {
        const adDB = buscarAdicional(ad.id);
        return { ...ad, custo: adDB ? adDB.custo : 0 };
      });
      const custoAdicionais = adicionaisComCusto.reduce((s, a) => s + (a.custo || 0) * (a.quantidade || 1), 0);
      const custoTotal = custoProduto + custoAdicionais;

      inserirItem.run(
        gerarId(), id, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario,
        custoTotal, JSON.stringify(adicionaisComCusto)
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
      const ins = db.prepare("INSERT OR IGNORE INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const it of p.itens) {
        ins.run(it.id || gerarId(), p.id, it.produto_id || "", it.produto_nome || "", it.quantidade || 1,
          it.preco_unitario || 0, it.custo_unitario || 0, typeof it.adicionais === "string" ? it.adicionais : JSON.stringify(it.adicionais || []));
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

// ─── SINCRONIZAÇÃO DE CATÁLOGO (push-catalogo) ──────────────────────────────
// Recebe categorias, adicionais e produtos do PDV remoto e faz upsert local.
// Last-write-wins por ID. Transacional para consistência.
export function upsertCatalogoSync({ categorias = [], adicionais = [], produtos = [] }) {
  const resultado = { categorias: { inserido: 0, atualizado: 0 }, adicionais: { inserido: 0, atualizado: 0 }, produtos: { inserido: 0, atualizado: 0 } };

  const tx = db.transaction(() => {
    for (const c of categorias) {
      if (!c || !c.id) continue;
      // nome é UNIQUE em categorias — dois catálogos independentes costumam ter
      // nomes iguais (ex.: "Bebidas") com ids diferentes. Casa por id OU nome
      // pra não colidir com a constraint; senão insere como categoria nova.
      const porId = db.prepare("SELECT id FROM categorias WHERE id = ?").get(c.id);
      const porNome = porId ? null : db.prepare("SELECT id FROM categorias WHERE nome = ?").get(c.nome);
      const alvo = porId || porNome;
      if (alvo) {
        db.prepare("UPDATE categorias SET nome = ?, permite_adicionais = ?, ordem = ? WHERE id = ?")
          .run(c.nome, c.permite_adicionais ?? 0, c.ordem ?? 0, alvo.id);
        resultado.categorias.atualizado++;
      } else {
        db.prepare("INSERT INTO categorias (id, nome, permite_adicionais, ordem) VALUES (?, ?, ?, ?)")
          .run(c.id, c.nome, c.permite_adicionais ?? 0, c.ordem ?? 0);
        resultado.categorias.inserido++;
      }
    }

    for (const a of adicionais) {
      if (!a || !a.id) continue;
      const existe = db.prepare("SELECT id FROM adicionais WHERE id = ?").get(a.id);
      if (existe) {
        db.prepare("UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ?, max_quantidade = ?, categoria_id = ? WHERE id = ?")
          .run(a.nome, a.preco, a.custo ?? 0, a.disponivel ?? 1, a.max_quantidade ?? 0, a.categoria_id ?? null, a.id);
        resultado.adicionais.atualizado++;
      } else {
        db.prepare("INSERT INTO adicionais (id, nome, preco, custo, disponivel, max_quantidade, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(a.id, a.nome, a.preco, a.custo ?? 0, a.disponivel ?? 1, a.max_quantidade ?? 0, a.categoria_id ?? null);
        resultado.adicionais.inserido++;
      }
    }

    for (const p of produtos) {
      if (!p || !p.id) continue;
      const existe = db.prepare("SELECT id FROM produtos WHERE id = ?").get(p.id);
      if (existe) {
        db.prepare("UPDATE produtos SET nome = ?, descricao = ?, preco = ?, custo = ?, categoria = ?, imagem = ?, disponivel = ? WHERE id = ?")
          .run(p.nome, p.descricao ?? "", p.preco, p.custo ?? 0, p.categoria ?? "", p.imagem ?? "", p.disponivel ?? 1, p.id);
        resultado.produtos.atualizado++;
      } else {
        db.prepare("INSERT INTO produtos (id, nome, descricao, preco, custo, categoria, imagem, disponivel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(p.id, p.nome, p.descricao ?? "", p.preco, p.custo ?? 0, p.categoria ?? "", p.imagem ?? "", p.disponivel ?? 1);
        resultado.produtos.inserido++;
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
    WHERE ei.deleted_at IS NULL
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

export function criarEstoqueItem({ codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual }) {
  const id = gerarId();
  db.prepare(`
    INSERT INTO estoque_itens (id, codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, Number(custo_manual) || 0);
  return buscarEstoqueItem(id);
}

export function atualizarEstoqueItem(id, { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo, custo_manual }) {
  // custo_manual é opcional: só atualiza se vier no payload
  const setCusto = custo_manual !== undefined ? ", custo_manual=?" : "";
  const params = [codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, ativo !== false ? 1 : 0];
  if (custo_manual !== undefined) params.push(Number(custo_manual) || 0);
  params.push(id);
  const r = db.prepare(`
    UPDATE estoque_itens SET codigo=?, nome=?, unidade=?, categoria_id=?, fornecedor_id=?,
    estoque_minimo=?, estoque_maximo=?, ativo=?${setCusto} WHERE id=? AND deleted_at IS NULL
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

  return db.prepare("SELECT * FROM estoque_entradas WHERE id = ?").get(id);
}

export function registrarEntradaLote(entradas) {
  // entradas = [{ item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs }]
  const resultado = [];
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
    }
  });
  txn();
  // Atualiza o CMV dos produtos que usam os itens que receberam entrada
  [...new Set(entradas.map(e => e.item_id).filter(Boolean))].forEach(itemId => recalcularCMVPorInsumo(itemId));
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

export function criarCardapio({ nome, descricao, icone, cor, imagem }) {
  const id = crypto.randomUUID();
  const max = db.prepare("SELECT COALESCE(MAX(ordem), -1) AS m FROM cardapios").get().m;
  db.prepare(
    "INSERT INTO cardapios (id, nome, descricao, icone, cor, ordem, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, nome, descricao || "", icone || "📋", cor || "#15803d", max + 1, imagem || "");
  return { id, nome };
}

export function atualizarCardapio(id, { nome, descricao, icone, cor, ativo, ordem, imagem }) {
  const atual = db.prepare("SELECT * FROM cardapios WHERE id = ?").get(id);
  if (!atual) throw new Error("Cardápio não encontrado");
  db.prepare(
    "UPDATE cardapios SET nome = ?, descricao = ?, icone = ?, cor = ?, ativo = ?, ordem = ?, imagem = ? WHERE id = ?"
  ).run(
    nome ?? atual.nome,
    descricao ?? atual.descricao,
    icone ?? atual.icone,
    cor ?? atual.cor,
    ativo !== undefined ? (ativo ? 1 : 0) : atual.ativo,
    ordem ?? atual.ordem,
    imagem ?? atual.imagem,
    id
  );
}

export function excluirCardapio(id) {
  db.prepare("DELETE FROM cardapio_categorias WHERE cardapio_id = ?").run(id);
  db.prepare("DELETE FROM cardapio_adicionais WHERE cardapio_id = ?").run(id);
  db.prepare("DELETE FROM cardapios WHERE id = ?").run(id);
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
    "INSERT INTO comandas (id, mesa_id, numero, cliente_nome, pessoas) VALUES (?, ?, ?, ?, ?)"
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
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado'
     WHERE c.id = ?
     GROUP BY c.id`
  ).get(id);
  return c || null;
}

export function buscarComandaPorMesa(mesa_id) {
  const c = db.prepare(
    `SELECT c.*, m.numero AS mesa_numero,
            COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total,
            COUNT(ci.id) AS total_itens
     FROM comandas c
     JOIN mesas m ON m.id = c.mesa_id
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado'
     WHERE c.mesa_id = ? AND c.status = 'aberta'
     GROUP BY c.id`
  ).get(mesa_id);
  return c || null;
}

export function fecharComanda(id) {
  const c = buscarComanda(id);
  if (!c) throw new Error("Comanda não encontrada");
  db.prepare("UPDATE comandas SET status = 'fechada', closed_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE mesas SET status = 'livre', reserva_nome = '', reserva_hora = '', reserva_pessoas = 0 WHERE id = ?").run(c.mesa_id);
  return buscarComanda(id);
}

export function cancelarComanda(id) {
  const c = buscarComanda(id);
  if (!c) throw new Error("Comanda não encontrada");
  db.prepare("UPDATE comandas SET status = 'cancelada', closed_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE mesas SET status = 'livre', reserva_nome = '', reserva_hora = '', reserva_pessoas = 0 WHERE id = ?").run(c.mesa_id);
  return buscarComanda(id);
}

export function pedirConta(mesa_id) {
  db.prepare("UPDATE mesas SET status = 'fechar' WHERE id = ?").run(mesa_id);
  return buscarMesa(mesa_id);
}

// ─── COMANDA ITENS ──────────────────────────────────────────────────────────

export function listarItensComanda(comanda_id) {
  return db.prepare("SELECT * FROM comanda_itens WHERE comanda_id = ? ORDER BY created_at ASC").all(comanda_id);
}

export function adicionarItemComanda({ comanda_id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem }) {
  const id = gerarId();
  db.prepare(
    `INSERT INTO comanda_itens (id, comanda_id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, comanda_id, produto_id || null, produto_nome, quantidade || 1, preco_unitario, JSON.stringify(adicionais || []), obs || "", origem || "caixa");
  return db.prepare("SELECT * FROM comanda_itens WHERE id = ?").get(id);
}

export function atualizarStatusItemComanda(id, status) {
  db.prepare("UPDATE comanda_itens SET status = ? WHERE id = ?").run(status, id);
  return db.prepare("SELECT * FROM comanda_itens WHERE id = ?").get(id);
}

export function removerItemComanda(id) {
  return db.prepare("DELETE FROM comanda_itens WHERE id = ?").run(id).changes > 0;
}

export function listarFilaCozinha() {
  return db.prepare(
    `SELECT ci.*, c.numero AS comanda_numero, m.numero AS mesa_numero
     FROM comanda_itens ci
     JOIN comandas c ON c.id = ci.comanda_id
     JOIN mesas m ON m.id = c.mesa_id
     WHERE ci.status IN ('pendente', 'preparando') AND c.status = 'aberta'
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
      label: p.tipo_entrega === "retirada" ? "Retirada" : p.tipo_entrega === "casa" ? "No local" : "Delivery",
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

export default db;
