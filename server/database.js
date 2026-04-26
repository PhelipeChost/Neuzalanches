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
  return db.prepare("SELECT * FROM categorias ORDER BY ordem ASC, nome ASC").all();
}

export function buscarCategoria(id) {
  return db.prepare("SELECT * FROM categorias WHERE id = ?").get(id);
}

export function buscarCategoriaPorNome(nome) {
  return db.prepare("SELECT * FROM categorias WHERE nome = ?").get(nome);
}

export function criarCategoria({ nome, permite_adicionais }) {
  const id = gerarId();
  // Nova categoria entra no fim
  const max = db.prepare("SELECT COALESCE(MAX(ordem), -1) AS m FROM categorias").get().m;
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
    return db.prepare("SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY created_at DESC").all(clienteId);
  }
  return db.prepare("SELECT * FROM pedidos ORDER BY created_at DESC").all();
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
     ORDER BY created_at DESC`
  ).all(`%${sufixo}%`);
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
  const result = db.prepare("UPDATE pedidos SET status = ? WHERE id = ?").run(status, id);
  if (result.changes === 0) return null;
  return buscarPedido(id);
}

export function excluirPedido(id) {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM pedido_itens WHERE pedido_id = ?").run(id);
    const result = db.prepare("DELETE FROM pedidos WHERE id = ?").run(id);
    return result.changes > 0;
  });
  return del();
}

// ─── CUSTOS FIXOS ────────────────────────────────────────────────────────────

export function listarCustosFixos() {
  return db.prepare("SELECT * FROM custos_fixos ORDER BY categoria, nome").all();
}

export function buscarCustoFixo(id) {
  return db.prepare("SELECT * FROM custos_fixos WHERE id = ?").get(id);
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
    "UPDATE custos_fixos SET nome = ?, valor = ?, categoria = ?, ativo = ? WHERE id = ?"
  ).run(nome, valor || 0, categoria || "Outros", ativo ? 1 : 0, id);
  if (result.changes === 0) return null;
  return buscarCustoFixo(id);
}

export function excluirCustoFixo(id) {
  // Remove lançamentos gerados por este custo fixo que ainda estão como previsto
  db.prepare("DELETE FROM lancamentos WHERE custo_fixo_id = ? AND status = 'previsto'").run(id);
  return db.prepare("DELETE FROM custos_fixos WHERE id = ?").run(id).changes > 0;
}

// Gera lançamentos previsto para custos fixos ativos no mês informado (YYYY-MM)
// Evita duplicatas: verifica se já existe lançamento do mesmo custo_fixo_id no mês
export function gerarLancamentosCustosFixos(mes) {
  const ativos = db.prepare("SELECT * FROM custos_fixos WHERE ativo = 1").all();
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
  return db.prepare("SELECT * FROM fornecedores ORDER BY nome").all();
}

export function buscarFornecedor(id) {
  return db.prepare("SELECT * FROM fornecedores WHERE id = ?").get(id);
}

export function criarFornecedor({ nome, telefone, email, obs }) {
  const id = gerarId();
  db.prepare("INSERT INTO fornecedores (id, nome, telefone, email, obs) VALUES (?, ?, ?, ?, ?)")
    .run(id, nome, telefone || "", email || "", obs || "");
  return buscarFornecedor(id);
}

export function atualizarFornecedor(id, { nome, telefone, email, obs }) {
  const r = db.prepare("UPDATE fornecedores SET nome=?, telefone=?, email=?, obs=? WHERE id=?")
    .run(nome, telefone || "", email || "", obs || "", id);
  if (r.changes === 0) return null;
  return buscarFornecedor(id);
}

export function excluirFornecedor(id) {
  return db.prepare("DELETE FROM fornecedores WHERE id = ?").run(id).changes > 0;
}

// ─── ESTOQUE ITENS ────────────────────────────────────────────────────────────

export function listarEstoqueItens() {
  return db.prepare(`
    SELECT ei.*, ec.nome AS categoria_nome, f.nome AS fornecedor_nome
    FROM estoque_itens ei
    LEFT JOIN estoque_categorias ec ON ec.id = ei.categoria_id
    LEFT JOIN fornecedores f ON f.id = ei.fornecedor_id
    ORDER BY ei.nome
  `).all();
}

export function buscarEstoqueItem(id) {
  return db.prepare(`
    SELECT ei.*, ec.nome AS categoria_nome, f.nome AS fornecedor_nome
    FROM estoque_itens ei
    LEFT JOIN estoque_categorias ec ON ec.id = ei.categoria_id
    LEFT JOIN fornecedores f ON f.id = ei.fornecedor_id
    WHERE ei.id = ?
  `).get(id);
}

export function buscarEstoqueItemPorCodigo(codigo) {
  return db.prepare("SELECT * FROM estoque_itens WHERE codigo = ?").get(codigo);
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
    estoque_minimo=?, estoque_maximo=?, ativo=? WHERE id=?
  `).run(codigo, nome, unidade || "un", categoria_id || null, fornecedor_id || null,
    estoque_minimo || 0, estoque_maximo || 0, ativo !== false ? 1 : 0, id);
  if (r.changes === 0) return null;
  return buscarEstoqueItem(id);
}

export function excluirEstoqueItem(id) {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM estoque_entradas WHERE item_id = ?").run(id);
    db.prepare("DELETE FROM estoque_saidas WHERE item_id = ?").run(id);
    db.prepare("DELETE FROM estoque_ajustes WHERE item_id = ?").run(id);
    return db.prepare("DELETE FROM estoque_itens WHERE id = ?").run(id).changes > 0;
  });
  return del();
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
  const itens = db.prepare("SELECT * FROM estoque_itens WHERE ativo = 1").all();
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

export default db;
