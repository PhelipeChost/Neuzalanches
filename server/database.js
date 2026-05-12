import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "fluxo-caixa.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    tipo_entrega TEXT DEFAULT 'entrega' CHECK(tipo_entrega IN ('entrega','retirada')),
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
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
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
`);

// Inserir saldo inicial padrão se não existir
const existeConfig = db.prepare("SELECT 1 FROM config WHERE key = 'saldo_inicial'").get();
if (!existeConfig) {
  db.prepare("INSERT INTO config (key, value) VALUES ('saldo_inicial', '0')").run();
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
const ADMINS_SEED = [
  { nome: "Felipe", email: "felipe.contasc@gmail.com", senha: "31076hibridos" },
  { nome: "Gabriel Viana", email: "gabrielllll1010jhony@gmail.com", senha: "Gv54321@" },
  { nome: "Antônio", email: "joalissoncosta0721@gmail.com", senha: "ANTOnio100%$$" },

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
  }
  db.prepare(
    "INSERT OR IGNORE INTO admin_emails (email, adicionado_por) VALUES (?, 'seed')"
  ).run(admin.email);
}

export function gerarId() {
  return randomBytes(6).toString("hex");
}

// ─── ADMIN EMAILS ──────────────────────────────────────────────────────────

export function isEmailAdmin(email) {
  return !!db.prepare("SELECT 1 FROM admin_emails WHERE email = ?").get(email);
}

export function listarAdminEmails() {
  return db.prepare("SELECT * FROM admin_emails ORDER BY created_at").all();
}

export function adicionarAdminEmail(email, adicionadoPor) {
  db.prepare(
    "INSERT OR IGNORE INTO admin_emails (email, adicionado_por) VALUES (?, ?)"
  ).run(email, adicionadoPor || "");
  db.prepare("UPDATE usuarios SET tipo = 'admin' WHERE email = ?").run(email);
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

export function criarLancamento({ tipo, descricao, valor, data, cat, status, obs }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, tipo, descricao, valor, data, cat, status, obs || "");
  return buscarLancamento(id);
}

export function atualizarLancamento(id, { tipo, descricao, valor, data, cat, status, obs }) {
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
  if (apenasDisponiveis) {
    return db.prepare("SELECT * FROM adicionais WHERE disponivel = 1 AND deleted_at IS NULL ORDER BY nome").all();
  }
  return db.prepare("SELECT * FROM adicionais WHERE deleted_at IS NULL ORDER BY nome").all();
}

export function buscarAdicional(id) {
  return db.prepare("SELECT * FROM adicionais WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function criarAdicional({ nome, preco, custo, disponivel }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO adicionais (id, nome, preco, custo, disponivel) VALUES (?, ?, ?, ?, ?)"
  ).run(id, nome, preco, custo || 0, disponivel !== undefined ? (disponivel ? 1 : 0) : 1);
  return buscarAdicional(id);
}

export function atualizarAdicional(id, { nome, preco, custo, disponivel }) {
  const result = db.prepare(
    "UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(nome, preco, custo || 0, disponivel ? 1 : 0, id);
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
    "INSERT INTO pedidos (id, cliente_id, cliente_nome, cliente_telefone, cliente_email, total, obs, tipo, metodo_pagamento, troco_para, tipo_entrega, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_referencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const inserirItem = db.prepare(
    "INSERT INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    const tipoEnt = tipo_entrega === 'retirada' ? 'retirada' : 'entrega';
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
  const result = db.prepare("UPDATE pedidos SET status = ? WHERE id = ? AND deleted_at IS NULL").run(status, id);
  if (result.changes === 0) return null;
  return buscarPedido(id);
}

export function excluirPedido(id) {
  // Soft delete — pedido_itens permanece junto e volta junto na restauração
  return db.prepare("UPDATE pedidos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
}

// ─── CUSTOS FIXOS ────────────────────────────────────────────────────────────

export function listarCustosFixos() {
  return db.prepare("SELECT * FROM custos_fixos WHERE deleted_at IS NULL ORDER BY categoria, nome").all();
}

export function buscarCustoFixo(id) {
  return db.prepare("SELECT * FROM custos_fixos WHERE id = ? AND deleted_at IS NULL").get(id);
}

export function criarCustoFixo({ nome, valor, categoria, ativo }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO custos_fixos (id, nome, valor, categoria, ativo) VALUES (?, ?, ?, ?, ?)"
  ).run(id, nome, valor || 0, categoria || "Outros", ativo !== false ? 1 : 0);
  return buscarCustoFixo(id);
}

export function atualizarCustoFixo(id, { nome, valor, categoria, ativo }) {
  const result = db.prepare(
    "UPDATE custos_fixos SET nome = ?, valor = ?, categoria = ?, ativo = ? WHERE id = ? AND deleted_at IS NULL"
  ).run(nome, valor || 0, categoria || "Outros", ativo ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarCustoFixo(id);
}

export function excluirCustoFixo(id) {
  // Soft delete: também marca lançamentos previstos deste custo como deletados
  db.prepare("UPDATE lancamentos SET deleted_at = datetime('now') WHERE custo_fixo_id = ? AND status = 'previsto' AND deleted_at IS NULL").run(id);
  return db.prepare("UPDATE custos_fixos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id).changes > 0;
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
      db.prepare(
        "INSERT INTO lancamentos (id, tipo, descricao, valor, data, cat, status, obs, custo_fixo_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, "saida", cf.nome, cf.valor, dia, cf.categoria, "previsto", "Custo fixo mensal", cf.id);
      gerados.push(buscarLancamento(id));
    }
  }
  return gerados;
}

// ─── INSUMOS ─────────────────────────────────────────────────────────────────

export function listarInsumos() {
  return db.prepare("SELECT * FROM insumos ORDER BY nome").all();
}

export function buscarInsumo(id) {
  return db.prepare("SELECT * FROM insumos WHERE id = ?").get(id);
}

export function criarInsumo({ nome, unidade, preco_unitario }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO insumos (id, nome, unidade, preco_unitario) VALUES (?, ?, ?, ?)"
  ).run(id, nome, unidade || "un", preco_unitario || 0);
  return buscarInsumo(id);
}

export function atualizarInsumo(id, { nome, unidade, preco_unitario }) {
  const result = db.prepare(
    "UPDATE insumos SET nome = ?, unidade = ?, preco_unitario = ? WHERE id = ?"
  ).run(nome, unidade || "un", preco_unitario || 0, id);
  if (result.changes === 0) return null;
  // Recalcular CMV de todos os produtos que usam este insumo
  recalcularCMVPorInsumo(id);
  return buscarInsumo(id);
}

export function excluirInsumo(id) {
  // produto_insumos é deletado em cascata pelo FK
  const ok = db.prepare("DELETE FROM insumos WHERE id = ?").run(id).changes > 0;
  return ok;
}

// ─── COMPOSIÇÃO (FICHA TÉCNICA) ───────────────────────────────────────────────

export function listarComposicaoProduto(produtoId) {
  return db.prepare(`
    SELECT pi.id, pi.produto_id, pi.insumo_id, pi.quantidade,
           i.nome AS insumo_nome, i.unidade, i.preco_unitario
    FROM produto_insumos pi
    JOIN insumos i ON i.id = pi.insumo_id
    WHERE pi.produto_id = ?
    ORDER BY i.nome
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

export function criarEstoqueItem({ codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo }) {
  const id = gerarId();
  db.prepare(`
    INSERT INTO estoque_itens (id, codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0);
  return buscarEstoqueItem(id);
}

export function atualizarEstoqueItem(id, { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo }) {
  const r = db.prepare(`
    UPDATE estoque_itens SET codigo=?, nome=?, unidade=?, categoria_id=?, fornecedor_id=?,
    estoque_minimo=?, estoque_maximo=?, ativo=? WHERE id=? AND deleted_at IS NULL
  `).run(codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, ativo !== false ? 1 : 0, id);
  if (r.changes === 0) return null;
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
      label: p.tipo_entrega === "retirada" ? "Retirada" : "Delivery",
      cliente_nome: p.cliente_nome,
      status: p.status,
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

export function estatisticasCaixa() {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  const mesas = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'livre' THEN 1 ELSE 0 END) AS livres, SUM(CASE WHEN status = 'ocupada' THEN 1 ELSE 0 END) AS ocupadas, SUM(CASE WHEN status = 'fechar' THEN 1 ELSE 0 END) AS fechando FROM mesas").get();

  const faturamento = db.prepare(
    `SELECT COALESCE(SUM(ci.quantidade * ci.preco_unitario), 0) AS total, COUNT(DISTINCT c.id) AS pedidos
     FROM comandas c
     JOIN comanda_itens ci ON ci.comanda_id = c.id AND ci.status != 'cancelado'
     WHERE c.status = 'fechada' AND date(c.closed_at) = ?`
  ).get(hojeStr);

  const mesasHoje = db.prepare(
    `SELECT COUNT(DISTINCT mesa_id) AS total FROM comandas WHERE date(opened_at) = ?`
  ).get(hojeStr);

  return { mesas, faturamento: { ...faturamento, mesas_atendidas: mesasHoje.total } };
}

export default db;
