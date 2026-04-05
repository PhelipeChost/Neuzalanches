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
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'cliente' CHECK(tipo IN ('admin', 'cliente')),
    telefone TEXT DEFAULT '',
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
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'confirmado', 'preparando', 'pronto', 'entregue', 'cancelado')),
    total REAL NOT NULL DEFAULT 0,
    obs TEXT DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'online' CHECK(tipo IN ('online', 'presencial')),
    metodo_pagamento TEXT DEFAULT '',
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

// Migração: adicionar colunas novas na tabela pedidos (para bancos já existentes)
const colsPedidos = db.prepare("PRAGMA table_info(pedidos)").all().map(c => c.name);
if (!colsPedidos.includes("metodo_pagamento")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN metodo_pagamento TEXT DEFAULT ''");
}
if (!colsPedidos.includes("endereco_cep")) {
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_cep TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_rua TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_numero TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_bairro TEXT DEFAULT ''");
  db.exec("ALTER TABLE pedidos ADD COLUMN endereco_referencia TEXT DEFAULT ''");
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
  ).run(id, nome, email, senha, tipo || "cliente", telefone || "");
  return buscarUsuarioPorId(id);
}

export function buscarUsuarioPorEmail(email) {
  return db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email);
}

export function buscarUsuarioPorId(id) {
  const u = db.prepare("SELECT id, nome, email, tipo, telefone, created_at FROM usuarios WHERE id = ?").get(id);
  return u || null;
}

// ─── LANCAMENTOS ────────────────────────────────────────────────────────────

export function listarLancamentos() {
  return db.prepare("SELECT * FROM lancamentos ORDER BY data DESC, created_at DESC").all();
}

export function buscarLancamento(id) {
  return db.prepare("SELECT * FROM lancamentos WHERE id = ?").get(id);
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
    "UPDATE lancamentos SET tipo = ?, descricao = ?, valor = ?, data = ?, cat = ?, status = ?, obs = ? WHERE id = ?"
  ).run(tipo, descricao, valor, data, cat, status, obs || "", id);
  if (result.changes === 0) return null;
  return buscarLancamento(id);
}

export function excluirLancamento(id) {
  return db.prepare("DELETE FROM lancamentos WHERE id = ?").run(id).changes > 0;
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
  return db.prepare("SELECT * FROM categorias ORDER BY nome").all();
}

export function buscarCategoria(id) {
  return db.prepare("SELECT * FROM categorias WHERE id = ?").get(id);
}

export function buscarCategoriaPorNome(nome) {
  return db.prepare("SELECT * FROM categorias WHERE nome = ?").get(nome);
}

export function criarCategoria({ nome, permite_adicionais }) {
  const id = gerarId();
  db.prepare(
    "INSERT INTO categorias (id, nome, permite_adicionais) VALUES (?, ?, ?)"
  ).run(id, nome, permite_adicionais ? 1 : 0);
  return buscarCategoria(id);
}

export function atualizarCategoria(id, { nome, permite_adicionais }) {
  const result = db.prepare(
    "UPDATE categorias SET nome = ?, permite_adicionais = ? WHERE id = ?"
  ).run(nome, permite_adicionais ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarCategoria(id);
}

export function excluirCategoria(id) {
  return db.prepare("DELETE FROM categorias WHERE id = ?").run(id).changes > 0;
}

// ─── ADICIONAIS ─────────────────────────────────────────────────────────────

export function listarAdicionais(apenasDisponiveis = false) {
  if (apenasDisponiveis) {
    return db.prepare("SELECT * FROM adicionais WHERE disponivel = 1 ORDER BY nome").all();
  }
  return db.prepare("SELECT * FROM adicionais ORDER BY nome").all();
}

export function buscarAdicional(id) {
  return db.prepare("SELECT * FROM adicionais WHERE id = ?").get(id);
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
    "UPDATE adicionais SET nome = ?, preco = ?, custo = ?, disponivel = ? WHERE id = ?"
  ).run(nome, preco, custo || 0, disponivel ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarAdicional(id);
}

export function excluirAdicional(id) {
  return db.prepare("DELETE FROM adicionais WHERE id = ?").run(id).changes > 0;
}

// ─── PRODUTOS ───────────────────────────────────────────────────────────────

export function listarProdutos(apenasDisponiveis = false) {
  if (apenasDisponiveis) {
    return db.prepare("SELECT * FROM produtos WHERE disponivel = 1 ORDER BY categoria, nome").all();
  }
  return db.prepare("SELECT * FROM produtos ORDER BY categoria, nome").all();
}

export function buscarProduto(id) {
  return db.prepare("SELECT * FROM produtos WHERE id = ?").get(id);
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
    "UPDATE produtos SET nome = ?, descricao = ?, preco = ?, custo = ?, categoria = ?, imagem = ?, disponivel = ? WHERE id = ?"
  ).run(nome, descricao || "", preco, custo || 0, categoria || "", imagem || "", disponivel ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarProduto(id);
}

export function excluirProduto(id) {
  return db.prepare("DELETE FROM produtos WHERE id = ?").run(id).changes > 0;
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
    return db.prepare("SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC").all(clienteId);
  }
  return db.prepare("SELECT * FROM pedidos ORDER BY created_at DESC").all();
}

export function buscarPedido(id) {
  return db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id);
}

export function buscarItensPedido(pedidoId) {
  return db.prepare("SELECT * FROM pedido_itens WHERE pedido_id = ?").all(pedidoId).map(item => ({
    ...item,
    adicionais: JSON.parse(item.adicionais || "[]"),
  }));
}

export function contarPedidosPendentes() {
  const row = db.prepare("SELECT COUNT(*) as count FROM pedidos WHERE status = 'pendente'").get();
  return row.count;
}

export function criarPedido({ cliente_id, cliente_nome, itens, obs, tipo, metodo_pagamento, endereco }) {
  const id = gerarId();

  // Calcular total considerando adicionais
  const total = itens.reduce((s, item) => {
    const adicionaisTotal = (item.adicionais || []).reduce((a, ad) => a + ad.preco, 0);
    return s + (item.preco_unitario + adicionaisTotal) * item.quantidade;
  }, 0);

  const end = endereco || {};

  const inserirPedido = db.prepare(
    "INSERT INTO pedidos (id, cliente_id, cliente_nome, total, obs, tipo, metodo_pagamento, endereco_cep, endereco_rua, endereco_numero, endereco_bairro, endereco_referencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const inserirItem = db.prepare(
    "INSERT INTO pedido_itens (id, pedido_id, produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, adicionais) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    inserirPedido.run(id, cliente_id || null, cliente_nome || "", total, obs || "", tipo || "online", metodo_pagamento || "", end.cep || "", end.rua || "", end.numero || "", end.bairro || "", end.referencia || "");
    for (const item of itens) {
      // Buscar custo do produto no banco
      const produtoDB = buscarProduto(item.produto_id);
      const custoProduto = produtoDB ? produtoDB.custo : 0;
      // Somar custos dos adicionais
      const adicionaisComCusto = (item.adicionais || []).map(ad => {
        const adDB = buscarAdicional(ad.id);
        return { ...ad, custo: adDB ? adDB.custo : 0 };
      });
      const custoAdicionais = adicionaisComCusto.reduce((s, a) => s + (a.custo || 0), 0);
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
  const result = db.prepare("UPDATE pedidos SET status = ? WHERE id = ?").run(status, id);
  if (result.changes === 0) return null;
  return buscarPedido(id);
}

export default db;
