import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  criarUsuario, buscarUsuarioPorEmail, buscarUsuarioPorId,
  isEmailAdmin, listarAdminEmails, adicionarAdminEmail, removerAdminEmail,
  listarLancamentos, buscarLancamento, criarLancamento, atualizarLancamento, excluirLancamento,
  obterConfig, salvarConfig,
  listarCategorias, buscarCategoria, criarCategoria, atualizarCategoria, excluirCategoria,
  listarAdicionais, buscarAdicional, criarAdicional, atualizarAdicional, excluirAdicional,
  listarProdutos, buscarProduto, criarProduto, atualizarProduto, excluirProduto,
  listarPedidos, buscarPedido, buscarItensPedido, criarPedido, atualizarStatusPedido, contarPedidosPendentes,
} from "./database.js";

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "fluxo-caixa-secret-key-2026";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.tipo !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores" });
  }
  next();
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

app.post("/api/auth/registro", async (req, res) => {
  const { nome, email, senha, telefone } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
  }
  if (buscarUsuarioPorEmail(email)) {
    return res.status(409).json({ error: "Email já cadastrado" });
  }
  const tipo = isEmailAdmin(email) ? "admin" : "cliente";
  const hash = await bcrypt.hash(senha, 10);
  const usuario = criarUsuario({ nome, email, senha: hash, tipo, telefone });
  const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, telefone: usuario.telefone }, token });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: "Email e senha são obrigatórios" });
  }
  const usuario = buscarUsuarioPorEmail(email);
  if (!usuario) {
    return res.status(401).json({ error: "Email ou senha inválidos" });
  }
  const valid = await bcrypt.compare(senha, usuario.senha);
  if (!valid) {
    return res.status(401).json({ error: "Email ou senha inválidos" });
  }
  const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, telefone: usuario.telefone }, token });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const usuario = buscarUsuarioPorId(req.user.id);
  if (!usuario) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json(usuario);
});

// ─── LANCAMENTOS (admin only) ───────────────────────────────────────────────

app.get("/api/lancamentos", authMiddleware, adminOnly, (req, res) => {
  res.json(listarLancamentos());
});

app.get("/api/lancamentos/:id", authMiddleware, adminOnly, (req, res) => {
  const l = buscarLancamento(req.params.id);
  if (!l) return res.status(404).json({ error: "Lançamento não encontrado" });
  res.json(l);
});

app.post("/api/lancamentos", authMiddleware, adminOnly, (req, res) => {
  const { tipo, descricao, valor, data, cat, status, obs } = req.body;
  if (!tipo || !descricao || !valor || !data || !cat || !status) {
    return res.status(400).json({ error: "Campos obrigatórios: tipo, descricao, valor, data, cat, status" });
  }
  if (!["entrada", "saida"].includes(tipo)) return res.status(400).json({ error: "Tipo inválido" });
  if (!["realizado", "previsto"].includes(status)) return res.status(400).json({ error: "Status inválido" });
  if (typeof valor !== "number" || valor <= 0) return res.status(400).json({ error: "Valor deve ser positivo" });
  res.status(201).json(criarLancamento({ tipo, descricao, valor, data, cat, status, obs }));
});

app.put("/api/lancamentos/:id", authMiddleware, adminOnly, (req, res) => {
  const { tipo, descricao, valor, data, cat, status, obs } = req.body;
  if (!tipo || !descricao || !valor || !data || !cat || !status) {
    return res.status(400).json({ error: "Campos obrigatórios" });
  }
  const l = atualizarLancamento(req.params.id, { tipo, descricao, valor, data, cat, status, obs });
  if (!l) return res.status(404).json({ error: "Não encontrado" });
  res.json(l);
});

app.delete("/api/lancamentos/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirLancamento(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── CONFIG (admin only) ────────────────────────────────────────────────────

app.get("/api/config", authMiddleware, adminOnly, (req, res) => {
  res.json({ saldo_inicial: parseFloat(obterConfig("saldo_inicial") || "0") });
});

app.put("/api/config", authMiddleware, adminOnly, (req, res) => {
  const { saldo_inicial } = req.body;
  if (saldo_inicial === undefined || typeof saldo_inicial !== "number") {
    return res.status(400).json({ error: "saldo_inicial deve ser um número" });
  }
  salvarConfig("saldo_inicial", saldo_inicial);
  res.json({ saldo_inicial });
});

// ─── ADMIN EMAILS (convites) ────────────────────────────────────────────────

app.get("/api/admin-emails", authMiddleware, adminOnly, (req, res) => {
  res.json(listarAdminEmails());
});

app.post("/api/admin-emails", authMiddleware, adminOnly, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email é obrigatório" });
  adicionarAdminEmail(email, req.user.email);
  res.status(201).json({ success: true, email });
});

app.delete("/api/admin-emails/:email", authMiddleware, adminOnly, (req, res) => {
  removerAdminEmail(decodeURIComponent(req.params.email));
  res.json({ success: true });
});

// ─── CATEGORIAS ─────────────────────────────────────────────────────────────

// Público: listar categorias (clientes precisam ver para o cardápio)
app.get("/api/categorias", (req, res) => {
  res.json(listarCategorias());
});

app.post("/api/categorias", authMiddleware, adminOnly, (req, res) => {
  const { nome, permite_adicionais } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  try {
    res.status(201).json(criarCategoria({ nome, permite_adicionais }));
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "Categoria já existe" });
    }
    throw err;
  }
});

app.put("/api/categorias/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, permite_adicionais } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  const c = atualizarCategoria(req.params.id, { nome, permite_adicionais });
  if (!c) return res.status(404).json({ error: "Não encontrado" });
  res.json(c);
});

app.delete("/api/categorias/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirCategoria(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── ADICIONAIS ─────────────────────────────────────────────────────────────

// Público: listar adicionais disponíveis (clientes veem ao montar pedido)
app.get("/api/adicionais", (req, res) => {
  let isAdmin = false;
  if (req.headers.authorization) {
    try {
      const decoded = jwt.verify(req.headers.authorization.split(" ")[1], JWT_SECRET);
      isAdmin = decoded.tipo === "admin";
    } catch { /* ignore */ }
  }
  res.json(listarAdicionais(!isAdmin));
});

app.post("/api/adicionais", authMiddleware, adminOnly, (req, res) => {
  const { nome, preco, custo, disponivel } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço são obrigatórios" });
  if (typeof preco !== "number" || preco < 0) return res.status(400).json({ error: "Preço inválido" });
  res.status(201).json(criarAdicional({ nome, preco, custo: custo || 0, disponivel }));
});

app.put("/api/adicionais/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, preco, custo, disponivel } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço obrigatórios" });
  const a = atualizarAdicional(req.params.id, { nome, preco, custo: custo || 0, disponivel });
  if (!a) return res.status(404).json({ error: "Não encontrado" });
  res.json(a);
});

app.delete("/api/adicionais/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirAdicional(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── PRODUTOS ───────────────────────────────────────────────────────────────

app.get("/api/produtos", (req, res) => {
  const apenasDisponiveis = !req.headers.authorization;
  let isAdmin = false;
  if (req.headers.authorization) {
    try {
      const decoded = jwt.verify(req.headers.authorization.split(" ")[1], JWT_SECRET);
      isAdmin = decoded.tipo === "admin";
    } catch { /* ignore */ }
  }
  res.json(listarProdutos(!isAdmin));
});

app.get("/api/produtos/:id", (req, res) => {
  const p = buscarProduto(req.params.id);
  if (!p) return res.status(404).json({ error: "Produto não encontrado" });
  res.json(p);
});

app.post("/api/produtos", authMiddleware, adminOnly, (req, res) => {
  const { nome, descricao, preco, custo, categoria, imagem, disponivel } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço são obrigatórios" });
  if (typeof preco !== "number" || preco < 0) return res.status(400).json({ error: "Preço inválido" });
  res.status(201).json(criarProduto({ nome, descricao, preco, custo: custo || 0, categoria, imagem, disponivel }));
});

app.put("/api/produtos/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, descricao, preco, custo, categoria, imagem, disponivel } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço obrigatórios" });
  const p = atualizarProduto(req.params.id, { nome, descricao, preco, custo: custo || 0, categoria, imagem, disponivel });
  if (!p) return res.status(404).json({ error: "Não encontrado" });
  res.json(p);
});

app.delete("/api/produtos/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirProduto(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── PEDIDOS ────────────────────────────────────────────────────────────────

app.get("/api/pedidos", authMiddleware, (req, res) => {
  const pedidos = req.user.tipo === "admin" ? listarPedidos() : listarPedidos(req.user.id);
  const result = pedidos.map(p => ({ ...p, itens: buscarItensPedido(p.id) }));
  res.json(result);
});

app.get("/api/pedidos/pendentes/count", authMiddleware, adminOnly, (req, res) => {
  res.json({ count: contarPedidosPendentes() });
});

app.get("/api/pedidos/:id", authMiddleware, (req, res) => {
  const p = buscarPedido(req.params.id);
  if (!p) return res.status(404).json({ error: "Pedido não encontrado" });
  if (req.user.tipo !== "admin" && p.cliente_id !== req.user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  res.json({ ...p, itens: buscarItensPedido(p.id) });
});

app.post("/api/pedidos", authMiddleware, (req, res) => {
  const { itens, obs, cliente_nome, tipo } = req.body;
  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Pedido deve ter ao menos um item" });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || !item.preco_unitario || !item.produto_nome) {
      return res.status(400).json({ error: "Cada item precisa de produto_id, produto_nome, quantidade e preco_unitario" });
    }
  }
  const isAdmin = req.user.tipo === "admin";
  const pedido = criarPedido({
    cliente_id: isAdmin ? null : req.user.id,
    cliente_nome: isAdmin ? (cliente_nome || "Pedido presencial") : req.user.nome,
    itens,
    obs,
    tipo: isAdmin ? (tipo || "presencial") : "online",
  });
  res.status(201).json(pedido);
});

app.put("/api/pedidos/:id/status", authMiddleware, adminOnly, (req, res) => {
  const { status } = req.body;
  const statusValidos = ["pendente", "confirmado", "preparando", "pronto", "entregue", "cancelado"];
  if (!status || !statusValidos.includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  const pedido = atualizarStatusPedido(req.params.id, status);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });

  if (status === "entregue") {
    const hoje = new Date().toISOString().split("T")[0];
    // Lançamento de RECEITA (entrada)
    criarLancamento({
      tipo: "entrada",
      descricao: `Pedido #${pedido.id.slice(0, 6)} — ${pedido.cliente_nome || "Cliente"}`,
      valor: pedido.total,
      data: hoje,
      cat: "Vendas",
      status: "realizado",
      obs: `Pedido ${pedido.tipo} entregue automaticamente`,
    });

    // Lançamento de CMV (saída) — custo de produção
    const itens = buscarItensPedido(pedido.id);
    const cmvTotal = itens.reduce((s, item) => {
      const custoAdicionais = (item.adicionais || []).reduce((a, ad) => a + (ad.custo || 0), 0);
      return s + (item.custo_unitario * item.quantidade);
    }, 0);

    if (cmvTotal > 0) {
      criarLancamento({
        tipo: "saida",
        descricao: `CMV — Pedido #${pedido.id.slice(0, 6)} — ${pedido.cliente_nome || "Cliente"}`,
        valor: cmvTotal,
        data: hoje,
        cat: "CMV",
        status: "realizado",
        obs: `Custo de produção do pedido ${pedido.tipo}`,
      });
    }
  }

  res.json({ ...pedido, itens: buscarItensPedido(pedido.id) });
});

// ─── START ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Servidor API rodando em http://localhost:${PORT}`);
});
