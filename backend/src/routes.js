// ─── Rotas REST do PDV Mercado ───────────────────────────────────────────────
// Fluxo principal: abrir caixa → bipar produto → finalizar venda (pagamento
// misto) → imprimir cupom → fechar caixa no fim do dia.
import express from "express";
import bcrypt from "bcryptjs";
import { gerarId, CATEGORIAS, FORMAS_PAGAMENTO } from "./schema.js";
import { gerarToken, authMiddleware, adminOnly, requerPermissao } from "./auth.js";
import { montarCupom, listarImpressoras, imprimirLocal } from "./print.js";

export function criarRotas(db) {
  const r = express.Router();

  const getSetting = (k) => db.prepare("SELECT value FROM settings WHERE key = ?").get(k)?.value;
  const setSetting = (k, v) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(k, String(v));
  const sessaoAberta = () => db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1").get();
  const hojeISO = () => {
    const d = new Date(); d.setUTCHours(d.getUTCHours() - 3); // BRT
    return d.toISOString().slice(0, 10);
  };

  // ── AUTH ────────────────────────────────────────────────────────────────
  r.post("/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(String(username).trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }
    res.json({
      token: gerarToken(user),
      user: { id: user.id, name: user.name, username: user.username, is_admin: !!user.is_admin, permissions: JSON.parse(user.permissions || "[]") },
    });
  });

  r.get("/auth/me", authMiddleware, (req, res) => res.json(req.user));

  // ── USERS (admin) ───────────────────────────────────────────────────────
  r.get("/users", authMiddleware, adminOnly, (req, res) => {
    const users = db.prepare("SELECT id, name, username, permissions, is_admin, active, created_at FROM users ORDER BY name").all();
    res.json(users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || "[]"), is_admin: !!u.is_admin, active: !!u.active })));
  });

  r.post("/users", authMiddleware, adminOnly, (req, res) => {
    const { name, username, password, permissions, is_admin } = req.body || {};
    if (!name || !username || !password) return res.status(400).json({ error: "Nome, usuário e senha são obrigatórios" });
    const existe = db.prepare("SELECT 1 FROM users WHERE username = ?").get(String(username).trim().toLowerCase());
    if (existe) return res.status(409).json({ error: "Usuário já existe" });
    const id = gerarId();
    db.prepare("INSERT INTO users (id, name, username, password_hash, permissions, is_admin) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, name, String(username).trim().toLowerCase(), bcrypt.hashSync(password, 10),
        JSON.stringify(Array.isArray(permissions) ? permissions : []), is_admin ? 1 : 0);
    res.status(201).json({ id });
  });

  r.put("/users/:id", authMiddleware, adminOnly, (req, res) => {
    const { name, password, permissions, is_admin, active } = req.body || {};
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    db.prepare("UPDATE users SET name = ?, permissions = ?, is_admin = ?, active = ? WHERE id = ?")
      .run(name ?? u.name, JSON.stringify(Array.isArray(permissions) ? permissions : JSON.parse(u.permissions || "[]")),
        is_admin !== undefined ? (is_admin ? 1 : 0) : u.is_admin, active !== undefined ? (active ? 1 : 0) : u.active, u.id);
    if (password) db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), u.id);
    res.json({ ok: true });
  });

  r.delete("/users/:id", authMiddleware, adminOnly, (req, res) => {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Você não pode remover a si mesmo" });
    const ch = db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(req.params.id).changes;
    if (!ch) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json({ ok: true });
  });

  // ── PRODUCTS ────────────────────────────────────────────────────────────
  r.get("/products/categories", authMiddleware, (req, res) => res.json(CATEGORIAS));

  r.get("/products", authMiddleware, (req, res) => {
    const { q, category, low } = req.query;
    let sql = "SELECT * FROM products WHERE active = 1";
    const params = [];
    if (q) { sql += " AND name LIKE ?"; params.push(`%${q}%`); }
    if (category) { sql += " AND category = ?"; params.push(category); }
    if (low === "1") sql += " AND min_stock > 0 AND stock <= min_stock";
    sql += " ORDER BY name";
    const produtos = db.prepare(sql).all(...params);
    const barcodes = db.prepare("SELECT * FROM product_barcodes").all();
    const porProduto = {};
    for (const b of barcodes) (porProduto[b.product_id] ||= []).push(b);
    res.json(produtos.map(p => ({ ...p, barcodes: porProduto[p.id] || [] })));
  });

  // busca por código de barras (usada pelo PDV ao bipar)
  r.get("/products/barcode/:code", authMiddleware, (req, res) => {
    const b = db.prepare("SELECT * FROM product_barcodes WHERE barcode = ?").get(req.params.code);
    if (!b) return res.status(404).json({ error: "Código de barras não cadastrado" });
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(b.product_id);
    if (!p) return res.status(404).json({ error: "Produto inativo ou removido" });
    res.json({ ...p, qty_multiplier: b.qty_multiplier || 1 });
  });

  r.post("/products", authMiddleware, requerPermissao("products"), (req, res) => {
    const { name, category, unit, price, cost, stock, min_stock, supplier_id, barcodes } = req.body || {};
    if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
    const id = gerarId();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO products (id, name, category, unit, price, cost, stock, min_stock, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, name, category || "Outros", unit || "un", Number(price) || 0, Number(cost) || 0,
          Number(stock) || 0, Number(min_stock) || 0, supplier_id || null);
      for (const b of (Array.isArray(barcodes) ? barcodes : [])) {
        if (!b.barcode) continue;
        db.prepare("INSERT INTO product_barcodes (id, product_id, barcode, qty_multiplier, label) VALUES (?, ?, ?, ?, ?)")
          .run(gerarId(), id, String(b.barcode).trim(), Number(b.qty_multiplier) || 1, b.label || "");
      }
    });
    try { tx(); } catch (e) {
      if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Código de barras já cadastrado em outro produto" });
      throw e;
    }
    res.status(201).json({ id });
  });

  r.put("/products/:id", authMiddleware, requerPermissao("products"), (req, res) => {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!p) return res.status(404).json({ error: "Produto não encontrado" });
    const { name, category, unit, price, cost, min_stock, supplier_id, active, barcodes } = req.body || {};
    const tx = db.transaction(() => {
      db.prepare(`UPDATE products SET name=?, category=?, unit=?, price=?, cost=?, min_stock=?, supplier_id=?, active=?, updated_at=datetime('now') WHERE id=?`)
        .run(name ?? p.name, category ?? p.category, unit ?? p.unit, price !== undefined ? Number(price) : p.price,
          cost !== undefined ? Number(cost) : p.cost, min_stock !== undefined ? Number(min_stock) : p.min_stock,
          supplier_id !== undefined ? (supplier_id || null) : p.supplier_id,
          active !== undefined ? (active ? 1 : 0) : p.active, p.id);
      if (Array.isArray(barcodes)) {
        db.prepare("DELETE FROM product_barcodes WHERE product_id = ?").run(p.id);
        for (const b of barcodes) {
          if (!b.barcode) continue;
          db.prepare("INSERT INTO product_barcodes (id, product_id, barcode, qty_multiplier, label) VALUES (?, ?, ?, ?, ?)")
            .run(gerarId(), p.id, String(b.barcode).trim(), Number(b.qty_multiplier) || 1, b.label || "");
        }
      }
    });
    try { tx(); } catch (e) {
      if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Código de barras já cadastrado em outro produto" });
      throw e;
    }
    res.json({ ok: true });
  });

  r.delete("/products/:id", authMiddleware, requerPermissao("products"), (req, res) => {
    const ch = db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(req.params.id).changes;
    if (!ch) return res.status(404).json({ error: "Produto não encontrado" });
    res.json({ ok: true });
  });

  // ── SUPPLIERS ───────────────────────────────────────────────────────────
  r.get("/suppliers", authMiddleware, (req, res) => {
    res.json(db.prepare("SELECT * FROM suppliers WHERE active = 1 ORDER BY name").all());
  });
  r.post("/suppliers", authMiddleware, requerPermissao("suppliers"), (req, res) => {
    const { name, contact, phone, email, cnpj, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
    const id = gerarId();
    db.prepare("INSERT INTO suppliers (id, name, contact, phone, email, cnpj, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, contact || "", phone || "", email || "", cnpj || "", notes || "");
    res.status(201).json({ id });
  });
  r.put("/suppliers/:id", authMiddleware, requerPermissao("suppliers"), (req, res) => {
    const s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
    if (!s) return res.status(404).json({ error: "Fornecedor não encontrado" });
    const { name, contact, phone, email, cnpj, notes } = req.body || {};
    db.prepare("UPDATE suppliers SET name=?, contact=?, phone=?, email=?, cnpj=?, notes=? WHERE id=?")
      .run(name ?? s.name, contact ?? s.contact, phone ?? s.phone, email ?? s.email, cnpj ?? s.cnpj, notes ?? s.notes, s.id);
    res.json({ ok: true });
  });
  r.delete("/suppliers/:id", authMiddleware, requerPermissao("suppliers"), (req, res) => {
    const ch = db.prepare("UPDATE suppliers SET active = 0 WHERE id = ?").run(req.params.id).changes;
    if (!ch) return res.status(404).json({ error: "Fornecedor não encontrado" });
    res.json({ ok: true });
  });

  // ── CASH SESSIONS (abrir/fechar caixa) ──────────────────────────────────
  r.get("/cash/current", authMiddleware, (req, res) => {
    const s = sessaoAberta();
    if (!s) return res.json(null);
    // resumo ao vivo da sessão (vendas por método)
    const vendas = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales WHERE session_id = ? AND status = 'done'").get(s.id);
    const porMetodo = db.prepare(`
      SELECT sp.method, COALESCE(SUM(sp.amount),0) total FROM sale_payments sp
      JOIN sales sa ON sa.id = sp.sale_id
      WHERE sa.session_id = ? AND sa.status = 'done' GROUP BY sp.method
    `).all(s.id);
    res.json({ ...s, vendas_qtd: vendas.c, vendas_total: vendas.t, por_metodo: porMetodo });
  });

  r.post("/cash/open", authMiddleware, requerPermissao("pdv"), (req, res) => {
    if (sessaoAberta()) return res.status(409).json({ error: "Já existe um caixa aberto — feche antes de abrir outro" });
    const opening = Number(req.body?.opening_amount);
    const id = gerarId();
    db.prepare("INSERT INTO cash_sessions (id, opened_by, opening_amount) VALUES (?, ?, ?)")
      .run(id, req.user.id, isNaN(opening) ? Number(getSetting("default_opening_amount")) || 0 : opening);
    res.status(201).json(db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(id));
  });

  r.post("/cash/close", authMiddleware, requerPermissao("pdv"), (req, res) => {
    const s = sessaoAberta();
    if (!s) return res.status(409).json({ error: "Nenhum caixa aberto" });
    const counted = req.body?.counted || {}; // { dinheiro: 350.00, pix: 120.00, ... }

    // esperado por método: pagamentos das vendas não canceladas + fundo de troco no dinheiro
    const porMetodo = db.prepare(`
      SELECT sp.method, COALESCE(SUM(sp.amount),0) total FROM sale_payments sp
      JOIN sales sa ON sa.id = sp.sale_id
      WHERE sa.session_id = ? AND sa.status = 'done' GROUP BY sp.method
    `).all(s.id);
    const trocoDado = db.prepare("SELECT COALESCE(SUM(change_given),0) t FROM sales WHERE session_id = ? AND status = 'done'").get(s.id).t;
    const expected = {};
    for (const m of FORMAS_PAGAMENTO) expected[m] = 0;
    for (const row of porMetodo) expected[row.method] = (expected[row.method] || 0) + row.total;
    expected.dinheiro = (expected.dinheiro || 0) + (s.opening_amount || 0) - trocoDado;

    const totalExpected = Object.values(expected).reduce((a, b) => a + b, 0);
    const totalCounted = Object.values(counted).reduce((a, b) => a + (Number(b) || 0), 0);
    const difference = +(totalCounted - totalExpected).toFixed(2);

    db.prepare(`UPDATE cash_sessions SET status='closed', closed_by=?, closed_at=datetime('now'),
      expected_json=?, counted_json=?, difference=?, notes=? WHERE id=?`)
      .run(req.user.id, JSON.stringify(expected), JSON.stringify(counted), difference, req.body?.notes || "", s.id);
    res.json({ ...db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(s.id), expected, counted, difference });
  });

  r.get("/cash/history", authMiddleware, requerPermissao("finance"), (req, res) => {
    const sessoes = db.prepare(`
      SELECT cs.*, u1.name opened_by_name, u2.name closed_by_name
      FROM cash_sessions cs
      JOIN users u1 ON u1.id = cs.opened_by
      LEFT JOIN users u2 ON u2.id = cs.closed_by
      ORDER BY cs.opened_at DESC LIMIT 60
    `).all();
    res.json(sessoes);
  });

  // ── SALES (venda com itens + pagamentos múltiplos) ──────────────────────
  r.post("/sales", authMiddleware, requerPermissao("pdv"), (req, res) => {
    const s = sessaoAberta();
    if (!s) return res.status(409).json({ error: "Abra o caixa antes de vender" });
    const { items, payments, discount } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Venda sem itens" });
    if (!Array.isArray(payments) || payments.length === 0) return res.status(400).json({ error: "Informe ao menos uma forma de pagamento" });

    // valida produtos e monta itens
    const linhas = [];
    for (const it of items) {
      const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(it.product_id);
      if (!p) return res.status(400).json({ error: `Produto não encontrado: ${it.product_id}` });
      const qty = Number(it.qty) || 0;
      if (qty <= 0) return res.status(400).json({ error: `Quantidade inválida em ${p.name}` });
      const unit_price = it.unit_price !== undefined ? Number(it.unit_price) : p.price;
      linhas.push({ p, qty, unit_price, total: +(qty * unit_price).toFixed(2) });
    }
    const subtotal = +linhas.reduce((a, l) => a + l.total, 0).toFixed(2);
    const desc = Math.min(Number(discount) || 0, subtotal);
    const total = +(subtotal - desc).toFixed(2);

    // pagamentos: soma precisa cobrir o total; excesso só em dinheiro (troco)
    const pags = payments.map(pg => ({ method: pg.method, amount: +(Number(pg.amount) || 0).toFixed(2) }))
      .filter(pg => pg.amount > 0 && FORMAS_PAGAMENTO.includes(pg.method));
    const pago = +pags.reduce((a, pg) => a + pg.amount, 0).toFixed(2);
    if (pago < total) return res.status(400).json({ error: `Pagamento insuficiente: faltam R$ ${(total - pago).toFixed(2)}` });
    const excesso = +(pago - total).toFixed(2);
    const dinheiroPago = pags.filter(pg => pg.method === "dinheiro").reduce((a, pg) => a + pg.amount, 0);
    if (excesso > 0 && excesso > dinheiroPago) {
      return res.status(400).json({ error: "Troco só pode sair de pagamento em dinheiro" });
    }

    const saleId = gerarId();
    const numero = (db.prepare("SELECT COALESCE(MAX(number),0) n FROM sales").get().n) + 1;

    const tx = db.transaction(() => {
      db.prepare("INSERT INTO sales (id, number, session_id, user_id, subtotal, discount, total, change_given) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(saleId, numero, s.id, req.user.id, subtotal, desc, total, excesso);
      for (const l of linhas) {
        db.prepare("INSERT INTO sale_items (id, sale_id, product_id, name, qty, unit_price, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(gerarId(), saleId, l.p.id, l.p.name, l.qty, l.unit_price, l.p.cost, l.total);
        // baixa de estoque + trilha
        db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(l.qty, l.p.id);
        db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, reference_id, user_id) VALUES (?, ?, 'venda', ?, ?, ?)")
          .run(gerarId(), l.p.id, -l.qty, saleId, req.user.id);
      }
      for (const pg of pags) {
        db.prepare("INSERT INTO sale_payments (id, sale_id, method, amount) VALUES (?, ?, ?, ?)")
          .run(gerarId(), saleId, pg.method, pg.amount);
      }
    });
    tx();

    const venda = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
    venda.items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(saleId);
    venda.payments = db.prepare("SELECT * FROM sale_payments WHERE sale_id = ?").all(saleId);
    venda.change = excesso;
    res.status(201).json(venda);
  });

  r.get("/sales", authMiddleware, (req, res) => {
    const { date, session_id } = req.query;
    let sql = `SELECT sa.*, u.name user_name FROM sales sa JOIN users u ON u.id = sa.user_id WHERE 1=1`;
    const params = [];
    if (session_id) { sql += " AND sa.session_id = ?"; params.push(session_id); }
    if (date) { sql += " AND date(sa.created_at, '-3 hours') = ?"; params.push(date); }
    sql += " ORDER BY sa.created_at DESC LIMIT 200";
    const vendas = db.prepare(sql).all(...params);
    for (const v of vendas) {
      v.items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(v.id);
      v.payments = db.prepare("SELECT * FROM sale_payments WHERE sale_id = ?").all(v.id);
    }
    res.json(vendas);
  });

  r.post("/sales/:id/cancel", authMiddleware, requerPermissao("pdv"), (req, res) => {
    const v = db.prepare("SELECT * FROM sales WHERE id = ?").get(req.params.id);
    if (!v) return res.status(404).json({ error: "Venda não encontrada" });
    if (v.status === "cancelled") return res.status(409).json({ error: "Venda já cancelada" });
    const itens = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(v.id);
    const tx = db.transaction(() => {
      db.prepare("UPDATE sales SET status='cancelled', cancel_reason=?, cancelled_at=datetime('now') WHERE id=?")
        .run(req.body?.reason || "", v.id);
      for (const it of itens) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(it.qty, it.product_id);
        db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, reference_id, reason, user_id) VALUES (?, ?, 'estorno', ?, ?, 'cancelamento de venda', ?)")
          .run(gerarId(), it.product_id, it.qty, v.id, req.user.id);
      }
    });
    tx();
    res.json({ ok: true });
  });

  // ── RETURNS (estorno total ou parcial) ──────────────────────────────────
  r.post("/returns", authMiddleware, requerPermissao("pdv"), (req, res) => {
    const { sale_id, items, reason } = req.body || {};
    const venda = db.prepare("SELECT * FROM sales WHERE id = ? AND status = 'done'").get(sale_id);
    if (!venda) return res.status(404).json({ error: "Venda não encontrada (ou cancelada)" });
    const itensVenda = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(sale_id);
    // items: [{ sale_item_id, qty }] — se omitido, estorno TOTAL
    const solicitados = Array.isArray(items) && items.length > 0
      ? items
      : itensVenda.map(it => ({ sale_item_id: it.id, qty: it.qty }));

    // quantidade já estornada por item (não deixa estornar mais do que vendeu)
    const jaEstornado = {};
    for (const row of db.prepare(`
      SELECT ri.sale_item_id, COALESCE(SUM(ri.qty),0) q FROM return_items ri
      JOIN returns re ON re.id = ri.return_id WHERE re.sale_id = ? GROUP BY ri.sale_item_id
    `).all(sale_id)) jaEstornado[row.sale_item_id] = row.q;

    const linhas = [];
    for (const sol of solicitados) {
      const it = itensVenda.find(x => x.id === sol.sale_item_id);
      if (!it) return res.status(400).json({ error: "Item não pertence à venda" });
      const qty = Number(sol.qty) || 0;
      const disponivel = it.qty - (jaEstornado[it.id] || 0);
      if (qty <= 0 || qty > disponivel) return res.status(400).json({ error: `Quantidade inválida para ${it.name} (disponível: ${disponivel})` });
      linhas.push({ it, qty, total: +(qty * it.unit_price).toFixed(2) });
    }
    const total = +linhas.reduce((a, l) => a + l.total, 0).toFixed(2);
    const retId = gerarId();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO returns (id, sale_id, user_id, total, reason) VALUES (?, ?, ?, ?, ?)")
        .run(retId, sale_id, req.user.id, total, reason || "");
      for (const l of linhas) {
        db.prepare("INSERT INTO return_items (id, return_id, sale_item_id, product_id, qty, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(gerarId(), retId, l.it.id, l.it.product_id, l.qty, l.it.unit_price, l.total);
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(l.qty, l.it.product_id);
        db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, reference_id, reason, user_id) VALUES (?, ?, 'estorno', ?, ?, ?, ?)")
          .run(gerarId(), l.it.product_id, l.qty, retId, reason || "estorno", req.user.id);
      }
    });
    tx();
    res.status(201).json({ id: retId, total });
  });

  r.get("/returns", authMiddleware, requerPermissao("finance"), (req, res) => {
    const rets = db.prepare(`
      SELECT re.*, u.name user_name, sa.number sale_number FROM returns re
      JOIN users u ON u.id = re.user_id JOIN sales sa ON sa.id = re.sale_id
      ORDER BY re.created_at DESC LIMIT 100
    `).all();
    for (const re of rets) re.items = db.prepare("SELECT * FROM return_items WHERE return_id = ?").all(re.id);
    res.json(rets);
  });

  // ── STOCK (entrada com fornecedor + ajuste com motivo) ──────────────────
  r.post("/stock/entry", authMiddleware, requerPermissao("stock"), (req, res) => {
    const { product_id, qty, unit_cost, supplier_id } = req.body || {};
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
    if (!p) return res.status(404).json({ error: "Produto não encontrado" });
    const q = Number(qty) || 0;
    if (q <= 0) return res.status(400).json({ error: "Quantidade deve ser positiva" });
    const custo = unit_cost !== undefined ? Number(unit_cost) : null;
    const tx = db.transaction(() => {
      db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(q, product_id);
      if (custo !== null && custo > 0) db.prepare("UPDATE products SET cost = ? WHERE id = ?").run(custo, product_id);
      db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, unit_cost, supplier_id, user_id) VALUES (?, ?, 'entrada', ?, ?, ?, ?)")
        .run(gerarId(), product_id, q, custo, supplier_id || null, req.user.id);
    });
    tx();
    res.status(201).json({ ok: true, novo_saldo: db.prepare("SELECT stock FROM products WHERE id = ?").get(product_id).stock });
  });

  r.post("/stock/adjust", authMiddleware, requerPermissao("stock"), (req, res) => {
    const { product_id, new_qty, reason } = req.body || {};
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
    if (!p) return res.status(404).json({ error: "Produto não encontrado" });
    if (!reason) return res.status(400).json({ error: "Informe o motivo do ajuste" });
    const alvo = Number(new_qty);
    if (isNaN(alvo)) return res.status(400).json({ error: "Quantidade inválida" });
    const delta = +(alvo - p.stock).toFixed(3);
    const tx = db.transaction(() => {
      db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(alvo, product_id);
      db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, reason, user_id) VALUES (?, ?, 'ajuste', ?, ?, ?)")
        .run(gerarId(), product_id, delta, reason, req.user.id);
    });
    tx();
    res.json({ ok: true, novo_saldo: alvo });
  });

  r.get("/stock/movements", authMiddleware, requerPermissao("stock"), (req, res) => {
    const { product_id } = req.query;
    let sql = `
      SELECT sm.*, p.name product_name, s.name supplier_name, u.name user_name
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      LEFT JOIN suppliers s ON s.id = sm.supplier_id
      LEFT JOIN users u ON u.id = sm.user_id WHERE 1=1`;
    const params = [];
    if (product_id) { sql += " AND sm.product_id = ?"; params.push(product_id); }
    sql += " ORDER BY sm.created_at DESC LIMIT 200";
    res.json(db.prepare(sql).all(...params));
  });

  // ── INVENTORY (contagem) ────────────────────────────────────────────────
  r.get("/inventory/current", authMiddleware, requerPermissao("stock"), (req, res) => {
    const s = db.prepare("SELECT * FROM inventory_sessions WHERE status = 'open' LIMIT 1").get();
    if (!s) return res.json(null);
    s.counts = db.prepare(`
      SELECT ic.*, p.name product_name, p.unit FROM inventory_counts ic
      JOIN products p ON p.id = ic.product_id WHERE ic.session_id = ? ORDER BY p.name
    `).all(s.id);
    res.json(s);
  });

  r.post("/inventory/open", authMiddleware, requerPermissao("stock"), (req, res) => {
    if (db.prepare("SELECT 1 FROM inventory_sessions WHERE status = 'open'").get())
      return res.status(409).json({ error: "Já existe um inventário aberto" });
    const id = gerarId();
    db.prepare("INSERT INTO inventory_sessions (id, user_id, notes) VALUES (?, ?, ?)").run(id, req.user.id, req.body?.notes || "");
    res.status(201).json({ id });
  });

  r.post("/inventory/:id/count", authMiddleware, requerPermissao("stock"), (req, res) => {
    const s = db.prepare("SELECT * FROM inventory_sessions WHERE id = ? AND status = 'open'").get(req.params.id);
    if (!s) return res.status(404).json({ error: "Inventário não encontrado (ou fechado)" });
    const { product_id, counted_qty } = req.body || {};
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
    if (!p) return res.status(404).json({ error: "Produto não encontrado" });
    const existente = db.prepare("SELECT id FROM inventory_counts WHERE session_id = ? AND product_id = ?").get(s.id, product_id);
    if (existente) {
      db.prepare("UPDATE inventory_counts SET counted_qty = ?, expected_qty = ? WHERE id = ?").run(Number(counted_qty) || 0, p.stock, existente.id);
    } else {
      db.prepare("INSERT INTO inventory_counts (id, session_id, product_id, expected_qty, counted_qty) VALUES (?, ?, ?, ?, ?)")
        .run(gerarId(), s.id, product_id, p.stock, Number(counted_qty) || 0);
    }
    res.json({ ok: true });
  });

  r.post("/inventory/:id/finish", authMiddleware, requerPermissao("stock"), (req, res) => {
    const s = db.prepare("SELECT * FROM inventory_sessions WHERE id = ? AND status = 'open'").get(req.params.id);
    if (!s) return res.status(404).json({ error: "Inventário não encontrado (ou fechado)" });
    const counts = db.prepare("SELECT * FROM inventory_counts WHERE session_id = ?").all(s.id);
    const tx = db.transaction(() => {
      for (const c of counts) {
        const delta = +(c.counted_qty - c.expected_qty).toFixed(3);
        if (delta === 0) continue;
        db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(c.counted_qty, c.product_id);
        db.prepare("INSERT INTO stock_movements (id, product_id, type, qty, reference_id, reason, user_id) VALUES (?, ?, 'inventario', ?, ?, 'contagem de inventário', ?)")
          .run(gerarId(), c.product_id, delta, s.id, req.user.id);
      }
      db.prepare("UPDATE inventory_sessions SET status='done', closed_at=datetime('now') WHERE id=?").run(s.id);
    });
    tx();
    res.json({ ok: true, ajustados: counts.length });
  });

  r.post("/inventory/:id/cancel", authMiddleware, requerPermissao("stock"), (req, res) => {
    const ch = db.prepare("UPDATE inventory_sessions SET status='cancelled', closed_at=datetime('now') WHERE id=? AND status='open'").run(req.params.id).changes;
    if (!ch) return res.status(404).json({ error: "Inventário não encontrado (ou fechado)" });
    res.json({ ok: true });
  });

  // ── EXPENSES (contas a pagar) ───────────────────────────────────────────
  r.get("/expenses", authMiddleware, requerPermissao("finance"), (req, res) => {
    res.json(db.prepare(`
      SELECT e.*, s.name supplier_name FROM expenses e
      LEFT JOIN suppliers s ON s.id = e.supplier_id
      ORDER BY e.paid_at IS NOT NULL, e.due_date ASC LIMIT 300
    `).all());
  });

  r.post("/expenses", authMiddleware, requerPermissao("finance"), (req, res) => {
    const { description, category, amount, due_date, recurrence, supplier_id, notes } = req.body || {};
    if (!description || !amount || !due_date) return res.status(400).json({ error: "Descrição, valor e vencimento são obrigatórios" });
    const id = gerarId();
    db.prepare("INSERT INTO expenses (id, description, category, amount, due_date, recurrence, supplier_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, description, category || "Geral", Number(amount), due_date,
        ["weekly", "monthly"].includes(recurrence) ? recurrence : "none", supplier_id || null, notes || "");
    res.status(201).json({ id });
  });

  r.post("/expenses/:id/pay", authMiddleware, requerPermissao("finance"), (req, res) => {
    const e = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
    if (!e) return res.status(404).json({ error: "Conta não encontrada" });
    if (e.paid_at) return res.status(409).json({ error: "Conta já paga" });
    const tx = db.transaction(() => {
      db.prepare("UPDATE expenses SET paid_at = datetime('now') WHERE id = ?").run(e.id);
      // recorrência: gera a próxima ocorrência ao pagar
      if (e.recurrence !== "none") {
        const prox = new Date(e.due_date + "T12:00:00");
        if (e.recurrence === "weekly") prox.setDate(prox.getDate() + 7);
        else prox.setMonth(prox.getMonth() + 1);
        db.prepare("INSERT INTO expenses (id, description, category, amount, due_date, recurrence, supplier_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(gerarId(), e.description, e.category, e.amount, prox.toISOString().slice(0, 10), e.recurrence, e.supplier_id, e.notes);
      }
    });
    tx();
    res.json({ ok: true });
  });

  r.delete("/expenses/:id", authMiddleware, requerPermissao("finance"), (req, res) => {
    const ch = db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id).changes;
    if (!ch) return res.status(404).json({ error: "Conta não encontrada" });
    res.json({ ok: true });
  });

  // ── DASHBOARD (resumo do dia) ───────────────────────────────────────────
  r.get("/dashboard", authMiddleware, (req, res) => {
    const hoje = hojeISO();
    const vendasHoje = db.prepare(`
      SELECT COUNT(*) c, COALESCE(SUM(total),0) t, COALESCE(SUM(discount),0) d
      FROM sales WHERE status='done' AND date(created_at, '-3 hours') = ?
    `).get(hoje);
    const porMetodo = db.prepare(`
      SELECT sp.method, COALESCE(SUM(sp.amount),0) total FROM sale_payments sp
      JOIN sales sa ON sa.id = sp.sale_id
      WHERE sa.status='done' AND date(sa.created_at, '-3 hours') = ? GROUP BY sp.method
    `).all(hoje);
    const estoqueBaixo = db.prepare("SELECT COUNT(*) c FROM products WHERE active=1 AND min_stock > 0 AND stock <= min_stock").get().c;
    const contasVencendo = db.prepare("SELECT COUNT(*) c FROM expenses WHERE paid_at IS NULL AND due_date <= date('now', '+3 days')").get().c;
    const topProdutos = db.prepare(`
      SELECT si.name, SUM(si.qty) qtd, SUM(si.total) receita FROM sale_items si
      JOIN sales sa ON sa.id = si.sale_id
      WHERE sa.status='done' AND date(sa.created_at, '-3 hours') = ?
      GROUP BY si.product_id ORDER BY qtd DESC LIMIT 5
    `).all(hoje);
    res.json({
      caixa: sessaoAberta() ? "aberto" : "fechado",
      vendas_qtd: vendasHoje.c, vendas_total: vendasHoje.t, descontos: vendasHoje.d,
      por_metodo: porMetodo, estoque_baixo: estoqueBaixo, contas_vencendo: contasVencendo,
      top_produtos: topProdutos,
    });
  });

  // ── FINANCE (DRE simplificado + resumo + curva ABC) ─────────────────────
  r.get("/finance/summary", authMiddleware, requerPermissao("finance"), (req, res) => {
    const de = req.query.from || hojeISO().slice(0, 8) + "01";
    const ate = req.query.to || hojeISO();
    const receita = db.prepare(`
      SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(discount),0) d, COUNT(*) c FROM sales
      WHERE status='done' AND date(created_at, '-3 hours') BETWEEN ? AND ?
    `).get(de, ate);
    const cmv = db.prepare(`
      SELECT COALESCE(SUM(si.qty * si.unit_cost),0) t FROM sale_items si
      JOIN sales sa ON sa.id = si.sale_id
      WHERE sa.status='done' AND date(sa.created_at, '-3 hours') BETWEEN ? AND ?
    `).get(de, ate).t;
    const estornos = db.prepare(`
      SELECT COALESCE(SUM(total),0) t FROM returns WHERE date(created_at, '-3 hours') BETWEEN ? AND ?
    `).get(de, ate).t;
    const despesas = db.prepare(`
      SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE paid_at IS NOT NULL AND date(paid_at, '-3 hours') BETWEEN ? AND ?
    `).get(de, ate).t;
    const porCategoria = db.prepare(`
      SELECT p.category, SUM(si.total) receita, SUM(si.qty * si.unit_cost) custo, SUM(si.qty) qtd
      FROM sale_items si JOIN sales sa ON sa.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE sa.status='done' AND date(sa.created_at, '-3 hours') BETWEEN ? AND ?
      GROUP BY p.category ORDER BY receita DESC
    `).all(de, ate);
    const receitaLiquida = receita.t - estornos;
    const lucroBruto = receitaLiquida - cmv;
    res.json({
      periodo: { de, ate },
      dre: {
        receita_bruta: receita.t, estornos, receita_liquida: receitaLiquida,
        cmv, lucro_bruto: lucroBruto, despesas, resultado: +(lucroBruto - despesas).toFixed(2),
      },
      vendas_qtd: receita.c, descontos: receita.d,
      por_categoria: porCategoria,
    });
  });

  // Curva ABC de produtos (80/15/5 por receita no período)
  r.get("/finance/abc", authMiddleware, requerPermissao("finance"), (req, res) => {
    const de = req.query.from || hojeISO().slice(0, 8) + "01";
    const ate = req.query.to || hojeISO();
    const rows = db.prepare(`
      SELECT si.product_id, si.name, SUM(si.qty) qtd, SUM(si.total) receita
      FROM sale_items si JOIN sales sa ON sa.id = si.sale_id
      WHERE sa.status='done' AND date(sa.created_at, '-3 hours') BETWEEN ? AND ?
      GROUP BY si.product_id ORDER BY receita DESC
    `).all(de, ate);
    const total = rows.reduce((a, x) => a + x.receita, 0) || 1;
    let acumulado = 0;
    const curva = rows.map(x => {
      acumulado += x.receita;
      const pctAcum = acumulado / total;
      return { ...x, pct: +(x.receita / total * 100).toFixed(1), classe: pctAcum <= 0.8 ? "A" : pctAcum <= 0.95 ? "B" : "C" };
    });
    res.json({ periodo: { de, ate }, total, curva });
  });

  // ── PRINT (cupom XP-80 ESC/POS, linkado à NFC-e se houver) ──────────────
  r.get("/print/printers", authMiddleware, async (req, res) => {
    res.json(await listarImpressoras());
  });

  r.post("/print/receipt/:saleId", authMiddleware, requerPermissao("pdv"), async (req, res) => {
    const venda = db.prepare("SELECT sa.*, u.name user_name FROM sales sa JOIN users u ON u.id = sa.user_id WHERE sa.id = ?").get(req.params.saleId);
    if (!venda) return res.status(404).json({ error: "Venda não encontrada" });
    venda.items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(venda.id);
    venda.payments = db.prepare("SELECT * FROM sale_payments WHERE sale_id = ?").all(venda.id);
    const cupom = montarCupom(venda, {
      store_name: getSetting("store_name") || "Meu Mercado",
    });
    const modo = getSetting("print_mode") || "agent";
    if (modo === "local") {
      const impressora = getSetting("printer_name");
      const r2 = await imprimirLocal(cupom.raw, impressora);
      return res.json({ ok: r2.ok, modo, erro: r2.erro || null, texto: cupom.texto });
    }
    // modo "agent": o agente local (mesmo esquema do PDV lanchonete) busca o
    // payload e manda pra XP-80 via ESC/POS
    res.json({ ok: true, modo, payload: cupom.raw.toString("base64"), texto: cupom.texto });
  });

  // ── SETTINGS ────────────────────────────────────────────────────────────
  const CHAVES_SETTINGS = ["store_name", "opening_time", "closing_time", "open_days", "printer_name", "print_mode", "default_opening_amount"];

  r.get("/settings", authMiddleware, (req, res) => {
    const out = {};
    for (const k of CHAVES_SETTINGS) out[k] = getSetting(k) ?? "";
    res.json(out);
  });

  r.put("/settings", authMiddleware, adminOnly, (req, res) => {
    for (const k of CHAVES_SETTINGS) {
      if (req.body?.[k] !== undefined) setSetting(k, req.body[k]);
    }
    const out = {};
    for (const k of CHAVES_SETTINGS) out[k] = getSetting(k) ?? "";
    res.json(out);
  });

  return r;
}
