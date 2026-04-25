import "dotenv/config";
import fs from "fs";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { reportarReceitaNexo } from "./services/nexo.js";
import { notificarPedidoConfirmado, notificarStatusPedido } from "./services/whatsapp.js";
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
  listarImagensProduto, adicionarImagemProduto, removerImagemProduto, reordenarImagensProduto,
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

// ─── PRODUTO IMAGENS ──────────────────────────────────────────────────────────

// GET público — cliente precisa ver as fotos no cardápio
app.get("/api/produtos/:id/imagens", (req, res) => {
  res.json(listarImagensProduto(req.params.id));
});

app.post("/api/produtos/:id/imagens", authMiddleware, adminOnly, (req, res) => {
  const { imagem, ordem } = req.body;
  if (!imagem) return res.status(400).json({ error: "Imagem obrigatória" });
  const img = adicionarImagemProduto({ produto_id: req.params.id, imagem, ordem: ordem ?? 0 });
  res.status(201).json(img);
});

app.delete("/api/produtos/:id/imagens/:imagemId", authMiddleware, adminOnly, (req, res) => {
  const ok = removerImagemProduto(req.params.imagemId);
  if (!ok) return res.status(404).json({ error: "Imagem não encontrada" });
  res.json({ ok: true });
});

app.put("/api/produtos/:id/imagens/reordenar", authMiddleware, adminOnly, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids deve ser array" });
  reordenarImagensProduto(req.params.id, ids);
  res.json({ ok: true });
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

  // Notificar cliente via WhatsApp (não bloqueia a resposta)
  notificarPedidoConfirmado(pedido).catch(() => {});

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

    // Notificar cliente via WhatsApp sobre mudança de status
  notificarStatusPedido(pedido, status).catch(() => {});

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

// ─── HORÁRIO DE FUNCIONAMENTO ────────────────────────────────────────────────

const HORARIO_DEFAULT = {
  status: 'auto',           // 'auto' | 'aberto' | 'fechado'
  dias: [0, 2, 3, 4, 5, 6], // 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sab
  abertura: '19:00',
  fechamento: '01:00',
};

function getHorarioConfig() {
  try {
    const raw = obterConfig('horario_funcionamento');
    return raw ? JSON.parse(raw) : HORARIO_DEFAULT;
  } catch {
    return HORARIO_DEFAULT;
  }
}

function isAbertoAgora(cfg) {
  if (cfg.status === 'aberto') return true;
  if (cfg.status === 'fechado') return false;

  // Modo automático — horário de Brasília
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const sp = new Date(utc + (-3 * 3600000));
  const day = sp.getDay();
  const hour = sp.getHours();
  const min = sp.getMinutes();
  const totalMin = hour * 60 + min;

  const [hAb, mAb] = cfg.abertura.split(':').map(Number);
  const [hFe, mFe] = cfg.fechamento.split(':').map(Number);
  const abMin = hAb * 60 + mAb;
  const feMin = hFe * 60 + mFe;

  const diasValidos = cfg.dias || HORARIO_DEFAULT.dias;

  // Período cruza meia-noite (ex: 19:00 → 01:00)
  if (abMin > feMin) {
    if (totalMin >= abMin) {
      return diasValidos.includes(day);
    } else if (totalMin < feMin) {
      const ontem = day === 0 ? 6 : day - 1;
      return diasValidos.includes(ontem);
    }
    return false;
  }

  // Período no mesmo dia (ex: 08:00 → 22:00)
  return diasValidos.includes(day) && totalMin >= abMin && totalMin < feMin;
}

// GET público — plataforma cliente e bot consultam
app.get('/api/config/horario', (req, res) => {
  const cfg = getHorarioConfig();
  res.json({ ...cfg, aberto: isAbertoAgora(cfg) });
});

// PUT autenticado — admin salva configuração
app.put('/api/config/horario', authMiddleware, (req, res) => {
  const { status, dias, abertura, fechamento } = req.body;
  const cfg = {
    status: ['auto', 'aberto', 'fechado'].includes(status) ? status : 'auto',
    dias: Array.isArray(dias) ? dias : HORARIO_DEFAULT.dias,
    abertura: abertura || HORARIO_DEFAULT.abertura,
    fechamento: fechamento || HORARIO_DEFAULT.fechamento,
  };
  salvarConfig('horario_funcionamento', JSON.stringify(cfg));
  res.json({ ...cfg, aberto: isAbertoAgora(cfg) });
});

// ─── WHATSAPP QR CODE PAGE ──────────────────────────────────────────────────

app.get('/whatsapp', async (req, res) => {
  const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
  const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'neuzalanches-secret-key-2024';
  const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'neuzalanches';

  let qrData = null;
  let status = 'desconhecido';
  let erro = null;

  try {
    const r = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_KEY },
    });
    const json = await r.json();
    status = json?.instance?.state || json?.state || 'desconhecido';
  } catch (e) {
    erro = e.message;
  }

  if (status !== 'open') {
    try {
      const r = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, {
        headers: { 'apikey': EVOLUTION_KEY },
      });
      const json = await r.json();
      qrData = json?.base64 || json?.qrcode?.base64 || null;
    } catch (e) {
      erro = e.message;
    }
  }

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp — Neuzalanches</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #f0fdf4; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 20px; padding: 40px; max-width: 480px; width: 90%; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.10); }
    .logo { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 700; color: #1c1917; margin-bottom: 6px; }
    .sub { font-size: 14px; color: #78716c; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .badge.connected { background: #dcfce7; color: #16a34a; }
    .badge.disconnected { background: #fee2e2; color: #dc2626; }
    .badge.waiting { background: #fef3c7; color: #d97706; }
    .qr-wrap { background: #f5f5f4; border-radius: 16px; padding: 24px; margin-bottom: 24px; display: inline-block; }
    .qr-wrap img { display: block; width: 240px; height: 240px; }
    .instructions { background: #eff6ff; border-radius: 10px; padding: 16px; text-align: left; font-size: 13px; color: #1e40af; line-height: 1.7; margin-bottom: 24px; }
    .btn { display: inline-block; padding: 12px 28px; background: #16a34a; color: #fff; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; border: none; font-family: inherit; }
    .btn:hover { background: #15803d; }
    .error { background: #fee2e2; border-radius: 10px; padding: 14px; color: #dc2626; font-size: 13px; margin-bottom: 20px; }
    .connected-box { background: #dcfce7; border-radius: 14px; padding: 28px; margin-bottom: 24px; }
    .connected-box .icon { font-size: 48px; margin-bottom: 10px; }
    .connected-box p { color: #15803d; font-size: 15px; font-weight: 600; }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">🍔</div>
  <h1>Neuzalanches — WhatsApp</h1>
  <p class="sub">Conexão do WhatsApp Business via Evolution API</p>

  ${status === 'open' ? `
    <span class="badge connected">✅ WhatsApp Conectado</span>
    <div class="connected-box">
      <div class="icon">📱</div>
      <p>WhatsApp conectado com sucesso!<br>O bot está ativo e pronto para atender.</p>
    </div>
    <p style="font-size:13px;color:#78716c;margin-bottom:20px;">Os clientes já podem enviar mensagens e receber notificações automáticas de pedido.</p>
  ` : `
    <span class="badge ${qrData ? 'waiting' : 'disconnected'}">${qrData ? '⏳ Aguardando escaneamento' : '❌ Desconectado'}</span>
    ${erro ? `<div class="error">Erro ao conectar na Evolution API: ${erro}</div>` : ''}
    ${qrData ? `
    <div class="qr-wrap">
      <img src="${qrData}" alt="QR Code WhatsApp" />
    </div>
    <div class="instructions">
      <strong>Como conectar:</strong><br>
      1. Abra o WhatsApp no celular<br>
      2. Toque em <strong>⋮ Menu → Aparelhos conectados</strong><br>
      3. Toque em <strong>"Conectar um aparelho"</strong><br>
      4. Escaneie o QR Code acima
    </div>
    <p style="font-size:12px;color:#a8a29e;margin-bottom:20px;">O QR Code expira em alguns minutos. Recarregue a página se necessário.</p>
    ` : `
    <div class="error">QR Code não disponível. Verifique se a Evolution API está rodando.</div>
    `}
  `}

  <button class="btn" onclick="location.reload()">🔄 Atualizar status</button>
</div>
</body>
</html>`);
});

// ─── BOT WHATSAPP — webhook direto da Evolution API ──────────────────────────

// Resolve @lid → número de telefone real lendo o store da Evolution API
async function resolverNumero(remoteJid, instanceName = 'neuzalanches') {
  // Se não é @lid, extrai direto
  if (!remoteJid.endsWith('@lid')) {
    return remoteJid.split('@')[0];
  }

  try {
    const storeDir = `/var/evolution-api/store/contacts/${instanceName}`;
    const lidFile = `${storeDir}/${remoteJid}.json`;

    if (!fs.existsSync(lidFile)) return null;
    const lidContact = JSON.parse(fs.readFileSync(lidFile, 'utf8'));
    const lidPic = lidContact.profilePictureUrl;

    // Procura contato @s.whatsapp.net com mesma foto de perfil
    const files = fs.readdirSync(storeDir);
    for (const f of files) {
      if (!f.endsWith('@s.whatsapp.net.json')) continue;
      const c = JSON.parse(fs.readFileSync(`${storeDir}/${f}`, 'utf8'));
      if (lidPic && c.profilePictureUrl === lidPic) {
        return c.id.split('@')[0]; // retorna só o número
      }
    }

    // Fallback: pushName igual (menos confiável)
    for (const f of files) {
      if (!f.endsWith('@s.whatsapp.net.json')) continue;
      const c = JSON.parse(fs.readFileSync(`${storeDir}/${f}`, 'utf8'));
      if (c.pushName && c.pushName === lidContact.pushName) {
        return c.id.split('@')[0];
      }
    }
  } catch (e) {
    console.error('[bot/webhook] erro ao resolver LID:', e.message);
  }
  return null;
}

app.post('/api/bot/webhook', async (req, res) => {
  // Responde imediatamente para não dar timeout
  res.json({ status: 'ok' });

  try {
    const body = req.body;
    const data = body.data || {};
    const key  = data.key  || {};

    // Ignora mensagens enviadas pelo próprio bot e grupos
    if (key.fromMe) return;
    if (key.remoteJid && key.remoteJid.includes('@g.us')) return;

    const remoteJid = key.remoteJid || '';
    if (!remoteJid) return;

    const numero = await resolverNumero(remoteJid);
    if (!numero) {
      console.error('[bot/webhook] não conseguiu resolver numero para:', remoteJid);
      return;
    }
    console.log('[bot/webhook] enviando para:', numero, '(de:', remoteJid, ')');

    // ── Verificar horário de funcionamento (Ter–Dom, 19h–01h, Brasília) ────────
    function isAberto() {
      const now  = new Date();
      const utc  = now.getTime() + now.getTimezoneOffset() * 60000;
      const sp   = new Date(utc + (-3 * 3600000));
      const day  = sp.getDay();
      const hour = sp.getHours();
      const diasAbertos = [0, 2, 3, 4, 5, 6];
      if (hour >= 19) return diasAbertos.includes(day);
      if (hour < 1)  return diasAbertos.includes(day === 0 ? 6 : day - 1);
      return false;
    }

    const aberto = isAberto();
    const texto = aberto
      ? 'Olá! 👋 Seja bem-vindo(a) à *Neuzalanches*! 🍔\n\nAcesse nosso cardápio e faça seu pedido pelo link abaixo:\n\n🌐 *neuzalanches.com.br*\n\n_Após finalizar o pedido no site, você receberá as atualizações aqui pelo WhatsApp!_ 📲'
      : '🔒 *Olá! No momento estamos fechados.*\n\nNosso horário de funcionamento é:\n📅 *Terça a Domingo*\n🕕 *19h00 às 01h00*\n\nQuando estivermos abertos, acesse nosso cardápio em:\n🌐 *neuzalanches.com.br*\n\n_Te esperamos em breve!_ 😊';

    const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'neuzalanches-secret-key-2024';
    const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'neuzalanches';

    await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: numero, textMessage: { text: texto } }),
    });
  } catch (err) {
    console.error('[bot/webhook] erro:', err.message);
  }
});

// ─── PROXY WHATSAPP (N8N → Evolution API) ───────────────────────────────────
app.post('/api/bot/enviar', async (req, res) => {
  try {
    const { number, text } = req.body;
    if (!number || !text) return res.status(400).json({ error: 'number e text são obrigatórios' });

    const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'neuzalanches-secret-key-2024';
    const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'neuzalanches';

    const r = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number, textMessage: { text } }),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor API rodando em http://localhost:${PORT}`);
});