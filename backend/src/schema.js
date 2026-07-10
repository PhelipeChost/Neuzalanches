// ─── Schema + migrações + seed do PDV Mercado ────────────────────────────────
import crypto from "crypto";
import bcrypt from "bcryptjs";

export const gerarId = () => crypto.randomBytes(6).toString("hex");

// Categorias FIXAS de produto (setores do mercado)
export const CATEGORIAS = [
  "Hortifruti / FLV",
  "Açougue, Aves e Peixaria",
  "Frios, Laticínios e Embutidos",
  "Padaria e Confeitaria",
  "Mercearia e Despensa",
  "Doces, Chocolates e Biscoitos",
  "Bebidas",
  "Bebidas Alcoólicas",
  "Congelados e Pratos Prontos",
  "Higiene e Beleza",
  "Limpeza da Casa",
  "Pet Shop",
  "Utilidades e Bazar",
  "Outros",
];

export const FORMAS_PAGAMENTO = ["dinheiro", "pix", "credito", "debito", "vale"];

export function criarSchema(db) {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_admin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      cnpj TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Outros',
      unit TEXT NOT NULL DEFAULT 'un',
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      supplier_id TEXT DEFAULT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    -- múltiplos códigos de barra por produto; qty_multiplier permite
    -- "fardo com 12" (bipa 1 código, baixa 12 do estoque)
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      qty_multiplier REAL NOT NULL DEFAULT 1,
      label TEXT DEFAULT '',
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY,
      opened_by TEXT NOT NULL,
      opened_at TEXT DEFAULT (datetime('now')),
      opening_amount REAL NOT NULL DEFAULT 0,
      closed_by TEXT DEFAULT NULL,
      closed_at TEXT DEFAULT NULL,
      expected_json TEXT DEFAULT NULL,   -- { dinheiro: X, pix: Y, ... } calculado
      counted_json TEXT DEFAULT NULL,    -- o que o operador conferiu
      difference REAL DEFAULT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',  -- open | closed
      FOREIGN KEY (opened_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'done', -- done | cancelled
      nfce_url TEXT DEFAULT '',
      nfce_chave TEXT DEFAULT '',
      cancel_reason TEXT DEFAULT '',
      cancelled_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES cash_sessions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,   -- dinheiro | pix | credito | debito | vale
      amount REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL,
      sale_item_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE
    );

    -- entradas de estoque, ajustes, vendas, estornos, inventário — trilha única
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      type TEXT NOT NULL,            -- entrada | ajuste | venda | estorno | inventario
      qty REAL NOT NULL,             -- positivo entra, negativo sai
      unit_cost REAL DEFAULT NULL,
      supplier_id TEXT DEFAULT NULL,
      reference_id TEXT DEFAULT NULL, -- sale_id / return_id / inventory_session_id
      reason TEXT DEFAULT '',
      user_id TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open',  -- open | done | cancelled
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT DEFAULT NULL,
      user_id TEXT NOT NULL,
      notes TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_counts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      expected_qty REAL NOT NULL DEFAULT 0,
      counted_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- contas a pagar (com recorrência simples)
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'Geral',
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT DEFAULT NULL,
      recurrence TEXT NOT NULL DEFAULT 'none',  -- none | weekly | monthly
      supplier_id TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ── Migrações idempotentes: ALTER TABLE em try/catch (coluna já existe = ok)
  const migracoes = [
    "ALTER TABLE products ADD COLUMN ncm TEXT DEFAULT ''",
    "ALTER TABLE products ADD COLUMN cfop TEXT DEFAULT '5102'",
    "ALTER TABLE sales ADD COLUMN change_given REAL DEFAULT 0",
  ];
  for (const sql of migracoes) {
    try { db.exec(sql); } catch { /* coluna já existe — ignora */ }
  }
}

export function seedInicial(db) {
  // 1 usuário admin
  const temUser = db.prepare("SELECT 1 FROM users LIMIT 1").get();
  if (!temUser) {
    const hash = bcrypt.hashSync("admin123", 10);
    db.prepare(
      "INSERT INTO users (id, name, username, password_hash, permissions, is_admin) VALUES (?, ?, ?, ?, ?, 1)"
    ).run(gerarId(), "Administrador", "admin", hash, JSON.stringify(["dashboard", "pdv", "products", "stock", "suppliers", "finance", "settings"]));
    console.log("[mercado] usuário admin criado (admin / admin123 — troque a senha!)");
  }

  // fornecedores de exemplo
  const temSup = db.prepare("SELECT 1 FROM suppliers LIMIT 1").get();
  if (!temSup) {
    const ins = db.prepare("INSERT INTO suppliers (id, name, contact, phone) VALUES (?, ?, ?, ?)");
    ins.run(gerarId(), "Distribuidora Central de Alimentos", "Carlos", "(11) 4002-8922");
    ins.run(gerarId(), "Atacadão Bebidas LTDA", "Fernanda", "(11) 97777-1234");
    console.log("[mercado] fornecedores de exemplo criados");
  }

  // produtos de exemplo (com códigos de barra)
  const temProd = db.prepare("SELECT 1 FROM products LIMIT 1").get();
  if (!temProd) {
    const exemplos = [
      { name: "Arroz Branco 5kg",        category: "Mercearia e Despensa", price: 24.90, cost: 18.50, stock: 40, barcode: "7896006711131" },
      { name: "Feijão Carioca 1kg",      category: "Mercearia e Despensa", price: 8.49,  cost: 6.10,  stock: 60, barcode: "7896006744441" },
      { name: "Leite Integral 1L",       category: "Frios, Laticínios e Embutidos", price: 5.99, cost: 4.20, stock: 120, barcode: "7891000100103" },
      { name: "Refrigerante Cola 2L",    category: "Bebidas",              price: 9.99,  cost: 6.80,  stock: 80, barcode: "7894900011517" },
      { name: "Detergente Neutro 500ml", category: "Limpeza da Casa",      price: 2.79,  cost: 1.60,  stock: 90, barcode: "7891022100112" },
      { name: "Banana Prata (kg)",       category: "Hortifruti / FLV", unit: "kg", price: 6.98, cost: 4.00, stock: 25, barcode: "2000000000017" },
    ];
    const insP = db.prepare("INSERT INTO products (id, name, category, unit, price, cost, stock) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insB = db.prepare("INSERT INTO product_barcodes (id, product_id, barcode, qty_multiplier) VALUES (?, ?, ?, 1)");
    for (const p of exemplos) {
      const id = gerarId();
      insP.run(id, p.name, p.category, p.unit || "un", p.price, p.cost, p.stock);
      insB.run(gerarId(), id, p.barcode);
    }
    console.log("[mercado] produtos de exemplo criados");
  }

  // settings padrão
  const DEFAULTS = {
    store_name: "Meu Mercado",
    opening_time: "08:00",
    closing_time: "20:00",
    open_days: JSON.stringify([1, 2, 3, 4, 5, 6]),
    printer_name: "",
    print_mode: "agent",         // local | agent
    default_opening_amount: "200",
  };
  const insS = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULTS)) insS.run(k, v);
}
