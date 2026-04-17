import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { reportarReceitaNexo } from "./services/nexo.js";
import {
  criarUsuario, buscarUsuarioPorEmail, buscarUsuarioPorTelefone, buscarUsuarioPorId,
  isEmailAdmin, listarAdminEmails, adicionarAdminEmail, removerAdminEmail,
  listarLancamentos, buscarLancamento, criarLancamento, atualizarLancamento, excluirLancamento,
  obterConfig, salvarConfig,
  listarCategorias, buscarCategoria, criarCategoria, atualizarCategoria, excluirCategoria,
  listarAdicionais, buscarAdicional, criarAdicional, atualizarAdicional, excluirAdicional,
  listarProdutos, buscarProduto, criarProduto, atualizarProduto, excluirProduto,
  listarPedidos, buscarPedido, buscarItensPedido, criarPedido, atualizarStatusPedido, excluirPedido, contarPedidosPendentes,
  listarEnderecos, buscarEndereco, criarEndereco, excluirEndereco,
  listarInsumos, buscarInsumo, criarInsumo, atualizarInsumo, excluirInsumo,
  listarComposicaoProduto, salvarComposicaoProduto,
  listarCustosFixos, buscarCustoFixo, criarCustoFixo, atualizarCustoFixo, excluirCustoFixo, gerarLancamentosCustosFixos,
  listarEstoqueCategorias, criarEstoqueCategoria, excluirEstoqueCategoria,
  listarFornecedores, buscarFornecedor, criarFornecedor, atualizarFornecedor, excluirFornecedor,
  listarEstoqueItens, buscarEstoqueItem, criarEstoqueItem, atualizarEstoqueItem, excluirEstoqueItem,
  listarEstoqueEntradas, registrarEntrada, registrarEntradaLote,
  listarEstoqueSaidas, registrarSaida,
  listarEstoqueAjustes, registrarAjuste,
  estoqueDashboard,
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
  if (!nome || !telefone || !senha) {
    return res.status(400).json({ error: "Nome, telefone e senha são obrigatórios" });
  }
  // Check duplicate by phone
  if (buscarUsuarioPorTelefone(telefone)) {
    return res.status(409).json({ error: "Telefone já cadastrado" });
  }
  // Check duplicate by email if provided
  if (email && buscarUsuarioPorEmail(email)) {
    return res.status(409).json({ error: "Email já cadastrado" });
  }
  const tipo = email && isEmailAdmin(email) ? "admin" : "cliente";
  const hash = await bcrypt.hash(senha, 10);
  const usuario = criarUsuario({ nome, email: email || null, senha: hash, tipo, telefone });
  const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, telefone: usuario.telefone }, token });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, senha, telefone } = req.body;
  // Login by phone or email
  const identifier = telefone || email;
  if (!identifier || !senha) {
    return res.status(400).json({ error: "Telefone (ou email) e senha são obrigatórios" });
  }
  // Try phone first, then email
  let usuario = telefone ? buscarUsuarioPorTelefone(telefone) : null;
  if (!usuario && email) usuario = buscarUsuarioPorEmail(email);
  if (!usuario) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const valid = await bcrypt.compare(senha, usuario.senha);
  if (!valid) {
    return res.status(401).json({ error: "Credenciais inválidas" });
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

// ─── CEP (proxy para ViaCEP) ────────────────────────────────────────────

app.get("/api/cep/:cep", async (req, res) => {
  const cep = req.params.cep.replace(/\D/g, "");
  if (cep.length !== 8) return res.status(400).json({ error: "CEP inválido" });
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await resp.json();
    if (data.erro) return res.status(404).json({ error: "CEP não encontrado" });
    res.json({ cep: data.cep, rua: data.logradouro, bairro: data.bairro, cidade: data.localidade, uf: data.uf });
  } catch {
    res.status(500).json({ error: "Erro ao consultar CEP" });
  }
});

// ─── ENDERECOS (cliente) ────────────────────────────────────────────────

app.get("/api/enderecos", authMiddleware, (req, res) => {
  res.json(listarEnderecos(req.user.id));
});

app.post("/api/enderecos", authMiddleware, (req, res) => {
  const { cep, rua, numero, bairro, referencia } = req.body;
  if (!rua || !bairro) return res.status(400).json({ error: "Rua e bairro são obrigatórios" });
  const endereco = criarEndereco({ cliente_id: req.user.id, cep, rua, numero, bairro, referencia });
  res.status(201).json(endereco);
});

app.delete("/api/enderecos/:id", authMiddleware, (req, res) => {
  const end = buscarEndereco(req.params.id);
  if (!end) return res.status(404).json({ error: "Endereço não encontrado" });
  if (end.cliente_id !== req.user.id && req.user.tipo !== "admin") {
    return res.status(403).json({ error: "Acesso negado" });
  }
  excluirEndereco(req.params.id);
  res.json({ success: true });
});

// ─── CONFIG PIX (público para leitura, admin para escrita) ─────────────

app.get("/api/config/pix", (req, res) => {
  res.json({
    pix_key: obterConfig("pix_key") || "",
    pix_nome: obterConfig("pix_nome") || "",
  });
});

app.put("/api/config/pix", authMiddleware, adminOnly, (req, res) => {
  const { pix_key, pix_nome } = req.body;
  if (pix_key !== undefined) salvarConfig("pix_key", pix_key);
  if (pix_nome !== undefined) salvarConfig("pix_nome", pix_nome);
  res.json({
    pix_key: obterConfig("pix_key") || "",
    pix_nome: obterConfig("pix_nome") || "",
  });
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

// Pedido público (sem autenticação — cliente envia dados inline)
app.post("/api/pedidos/publico", (req, res) => {
  const { itens, obs, cliente_nome, cliente_telefone, cliente_email, metodo_pagamento, endereco } = req.body;
  if (!cliente_nome || !cliente_telefone) {
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  }
  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Pedido deve ter ao menos um item" });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || !item.preco_unitario || !item.produto_nome) {
      return res.status(400).json({ error: "Cada item precisa de produto_id, produto_nome, quantidade e preco_unitario" });
    }
  }
  const pedido = criarPedido({
    cliente_id: null,
    cliente_nome,
    cliente_telefone,
    cliente_email: cliente_email || "",
    itens,
    obs,
    tipo: "online",
    metodo_pagamento: metodo_pagamento || "",
    endereco: endereco || {},
  });
  res.status(201).json(pedido);
});

app.post("/api/pedidos", authMiddleware, (req, res) => {
  const { itens, obs, cliente_nome, tipo, metodo_pagamento, endereco } = req.body;
  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Pedido deve ter ao menos um item" });
  }
  for (const item of itens) {
    if (!item.produto_id || !item.quantidade || !item.preco_unitario || !item.produto_nome) {
      return res.status(400).json({ error: "Cada item precisa de produto_id, produto_nome, quantidade e preco_unitario" });
    }
  }
  const isAdmin = req.user.tipo === "admin";

  // Se o cliente enviou um endereco_id, buscar o endereço salvo
  let enderecoFinal = endereco || {};
  if (endereco && endereco.endereco_id) {
    const endSalvo = buscarEndereco(endereco.endereco_id);
    if (endSalvo) {
      enderecoFinal = { cep: endSalvo.cep, rua: endSalvo.rua, numero: endSalvo.numero, bairro: endSalvo.bairro, referencia: endSalvo.referencia };
    }
  }

  // Se o cliente pediu para salvar o endereço novo
  if (endereco && endereco.salvar && !isAdmin && endereco.rua) {
    criarEndereco({ cliente_id: req.user.id, cep: endereco.cep, rua: endereco.rua, numero: endereco.numero, bairro: endereco.bairro, referencia: endereco.referencia });
  }

  const pedido = criarPedido({
    cliente_id: isAdmin ? null : req.user.id,
    cliente_nome: isAdmin ? (cliente_nome || "Pedido presencial") : req.user.nome,
    itens,
    obs,
    tipo: isAdmin ? (tipo || "presencial") : "online",
    metodo_pagamento: metodo_pagamento || "",
    endereco: enderecoFinal,
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

    // Reportar receita para NEXO (não bloqueia, não quebra o fluxo)
    reportarReceitaNexo({
      amount: pedido.total,
      description: `Pedido #${pedido.id.slice(0, 6)}`,
      source: pedido.tipo === 'online' ? 'online' : 'presencial',
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

app.delete("/api/pedidos/:id", authMiddleware, adminOnly, (req, res) => {
  const ok = excluirPedido(req.params.id);
  if (!ok) return res.status(404).json({ error: "Pedido não encontrado" });
  res.json({ success: true });
});

// ─── CUSTOS FIXOS (admin only) ───────────────────────────────────────────────

app.get("/api/custos-fixos", authMiddleware, adminOnly, (req, res) => {
  res.json(listarCustosFixos());
});

app.post("/api/custos-fixos", authMiddleware, adminOnly, (req, res) => {
  const { nome, valor, categoria, ativo } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (typeof valor !== "number" || valor < 0) return res.status(400).json({ error: "Valor inválido" });
  res.status(201).json(criarCustoFixo({ nome, valor, categoria, ativo }));
});

app.put("/api/custos-fixos/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, valor, categoria, ativo } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (typeof valor !== "number" || valor < 0) return res.status(400).json({ error: "Valor inválido" });
  const cf = atualizarCustoFixo(req.params.id, { nome, valor, categoria, ativo });
  if (!cf) return res.status(404).json({ error: "Custo fixo não encontrado" });
  res.json(cf);
});

app.delete("/api/custos-fixos/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirCustoFixo(req.params.id)) return res.status(404).json({ error: "Custo fixo não encontrado" });
  res.json({ success: true });
});

// Gera lançamentos previsto para o mês informado (YYYY-MM)
app.post("/api/custos-fixos/gerar/:mes", authMiddleware, adminOnly, (req, res) => {
  const { mes } = req.params;
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "Mês inválido (use YYYY-MM)" });
  const gerados = gerarLancamentosCustosFixos(mes);
  res.json({ gerados: gerados.length, lancamentos: gerados });
});

// ─── INSUMOS (admin only) ────────────────────────────────────────────────────

app.get("/api/insumos", authMiddleware, adminOnly, (req, res) => {
  res.json(listarInsumos());
});

app.post("/api/insumos", authMiddleware, adminOnly, (req, res) => {
  const { nome, unidade, preco_unitario } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (typeof preco_unitario !== "number" || preco_unitario < 0)
    return res.status(400).json({ error: "Preço inválido" });
  res.status(201).json(criarInsumo({ nome, unidade, preco_unitario }));
});

app.put("/api/insumos/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, unidade, preco_unitario } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (typeof preco_unitario !== "number" || preco_unitario < 0)
    return res.status(400).json({ error: "Preço inválido" });
  const ins = atualizarInsumo(req.params.id, { nome, unidade, preco_unitario });
  if (!ins) return res.status(404).json({ error: "Insumo não encontrado" });
  // Retorna o insumo atualizado + lista de produtos afetados com novo CMV
  res.json(ins);
});

app.delete("/api/insumos/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirInsumo(req.params.id)) return res.status(404).json({ error: "Insumo não encontrado" });
  res.json({ success: true });
});

// ─── COMPOSIÇÃO DE PRODUTO (ficha técnica) ────────────────────────────────────

app.get("/api/produtos/:id/composicao", authMiddleware, adminOnly, (req, res) => {
  res.json(listarComposicaoProduto(req.params.id));
});

app.put("/api/produtos/:id/composicao", authMiddleware, adminOnly, (req, res) => {
  const { itens } = req.body;
  if (!Array.isArray(itens)) return res.status(400).json({ error: "itens deve ser um array" });
  const composicao = salvarComposicaoProduto(req.params.id, itens);
  // Retorna a composição salva + o produto atualizado (com novo custo)
  const produto = buscarProduto(req.params.id);
  res.json({ composicao, produto });
});

// ─── ESTOQUE: CATEGORIAS ─────────────────────────────────────────────────────

app.get("/api/estoque/categorias", authMiddleware, adminOnly, (req, res) => {
  res.json(listarEstoqueCategorias());
});

app.post("/api/estoque/categorias", authMiddleware, adminOnly, (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  try {
    res.status(201).json(criarEstoqueCategoria({ nome }));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Categoria já existe" });
    throw err;
  }
});

app.delete("/api/estoque/categorias/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirEstoqueCategoria(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── ESTOQUE: FORNECEDORES ────────────────────────────────────────────────────

app.get("/api/estoque/fornecedores", authMiddleware, adminOnly, (req, res) => {
  res.json(listarFornecedores());
});

app.post("/api/estoque/fornecedores", authMiddleware, adminOnly, (req, res) => {
  const { nome, telefone, email, obs } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  res.status(201).json(criarFornecedor({ nome, telefone, email, obs }));
});

app.put("/api/estoque/fornecedores/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, telefone, email, obs } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  const f = atualizarFornecedor(req.params.id, { nome, telefone, email, obs });
  if (!f) return res.status(404).json({ error: "Não encontrado" });
  res.json(f);
});

app.delete("/api/estoque/fornecedores/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirFornecedor(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── ESTOQUE: ITENS ───────────────────────────────────────────────────────────

app.get("/api/estoque/itens", authMiddleware, adminOnly, (req, res) => {
  res.json(listarEstoqueItens());
});

app.get("/api/estoque/itens/:id", authMiddleware, adminOnly, (req, res) => {
  const item = buscarEstoqueItem(req.params.id);
  if (!item) return res.status(404).json({ error: "Item não encontrado" });
  res.json(item);
});

app.post("/api/estoque/itens", authMiddleware, adminOnly, (req, res) => {
  const { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo } = req.body;
  if (!codigo || !nome) return res.status(400).json({ error: "Código e nome são obrigatórios" });
  try {
    res.status(201).json(criarEstoqueItem({ codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo }));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Código já existe" });
    throw err;
  }
});

app.put("/api/estoque/itens/:id", authMiddleware, adminOnly, (req, res) => {
  const { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo } = req.body;
  if (!codigo || !nome) return res.status(400).json({ error: "Código e nome são obrigatórios" });
  const item = atualizarEstoqueItem(req.params.id, { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo });
  if (!item) return res.status(404).json({ error: "Não encontrado" });
  res.json(item);
});

app.delete("/api/estoque/itens/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirEstoqueItem(req.params.id)) return res.status(404).json({ error: "Não encontrado" });
  res.json({ success: true });
});

// ─── ESTOQUE: ENTRADAS ────────────────────────────────────────────────────────

app.get("/api/estoque/entradas", authMiddleware, adminOnly, (req, res) => {
  const { item_id } = req.query;
  res.json(listarEstoqueEntradas(item_id || null));
});

app.post("/api/estoque/entradas", authMiddleware, adminOnly, (req, res) => {
  const { item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs } = req.body;
  if (!item_id || !quantidade) return res.status(400).json({ error: "item_id e quantidade são obrigatórios" });
  if (parseFloat(quantidade) <= 0) return res.status(400).json({ error: "Quantidade deve ser positiva" });
  try {
    res.status(201).json(registrarEntrada({ item_id, quantidade, custo_unitario, fornecedor_id, data, nf, obs }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/estoque/entradas/lote", authMiddleware, adminOnly, (req, res) => {
  const { entradas } = req.body;
  if (!Array.isArray(entradas) || entradas.length === 0) {
    return res.status(400).json({ error: "Forneça um array de entradas" });
  }
  try {
    const resultado = registrarEntradaLote(entradas);
    res.status(201).json({ processadas: resultado.length, entradas: resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── ESTOQUE: SAIDAS ──────────────────────────────────────────────────────────

app.get("/api/estoque/saidas", authMiddleware, adminOnly, (req, res) => {
  const { item_id } = req.query;
  res.json(listarEstoqueSaidas(item_id || null));
});

app.post("/api/estoque/saidas", authMiddleware, adminOnly, (req, res) => {
  const { item_id, quantidade, motivo, data, obs } = req.body;
  if (!item_id || !quantidade) return res.status(400).json({ error: "item_id e quantidade são obrigatórios" });
  if (parseFloat(quantidade) <= 0) return res.status(400).json({ error: "Quantidade deve ser positiva" });
  try {
    res.status(201).json(registrarSaida({ item_id, quantidade, motivo, data, obs }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── ESTOQUE: AJUSTES ─────────────────────────────────────────────────────────

app.get("/api/estoque/ajustes", authMiddleware, adminOnly, (req, res) => {
  const { item_id } = req.query;
  res.json(listarEstoqueAjustes(item_id || null));
});

app.post("/api/estoque/ajustes", authMiddleware, adminOnly, (req, res) => {
  const { item_id, saldo_novo, motivo, data, obs } = req.body;
  if (!item_id || saldo_novo === undefined) return res.status(400).json({ error: "item_id e saldo_novo são obrigatórios" });
  if (parseFloat(saldo_novo) < 0) return res.status(400).json({ error: "Saldo não pode ser negativo" });
  try {
    res.status(201).json(registrarAjuste({ item_id, saldo_novo, motivo, data, obs }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── ESTOQUE: DASHBOARD ───────────────────────────────────────────────────────

app.get("/api/estoque/dashboard", authMiddleware, adminOnly, (req, res) => {
  res.json(estoqueDashboard());
});

// ─── START ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor API rodando em http://localhost:${PORT}`);
});