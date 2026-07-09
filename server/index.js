import "dotenv/config";
import fs from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { reportarReceitaNexo } from "./services/nexo.js";
import { notificarPedidoConfirmado, notificarStatusPedido, enviarMensagem } from "./services/whatsapp.js";
import {
  criarUsuario, buscarUsuarioPorEmail, buscarUsuarioPorTelefone, buscarUsuarioPorId,
  isEmailAdmin, buscarAdminEmail, listarAdminEmails, adicionarAdminEmail, atualizarAdminEmail, removerAdminEmail, isAdminPrincipal,
  listarLancamentos, buscarLancamento, criarLancamento, atualizarLancamento, excluirLancamento,
  listarLixeira, restaurarItemLixeira, excluirDefinitivoLixeira,
  obterConfig, salvarConfig,
  listarCategorias, buscarCategoria, criarCategoria, atualizarCategoria, reordenarCategorias, excluirCategoria,
  listarAdicionais, buscarAdicional, criarAdicional, atualizarAdicional, excluirAdicional,
  listarProdutos, buscarProduto, criarProduto, atualizarProduto, excluirProduto,
  listarPromocoes, listarPromocoesAtivas, criarPromocao, atualizarPromocao,
  listarPedidos, listarPedidosPorTelefone, buscarPedido, buscarItensPedido, criarPedido, atualizarStatusPedido, excluirPedido, contarPedidosPendentes,
  pedidosAlteradosDesde, upsertPedidoSync, upsertCatalogoSync,
  listarEnderecos, buscarEndereco, criarEndereco, excluirEndereco,
  listarInsumos, buscarInsumo, criarInsumo, atualizarInsumo, excluirInsumo,
  listarComposicaoProduto, salvarComposicaoProduto,
  listarCustosFixos, buscarCustoFixo, criarCustoFixo, atualizarCustoFixo, excluirCustoFixo, gerarLancamentosCustosFixos,
  listarCategoriasFinanceiro, criarCategoriaFinanceiro, atualizarCategoriaFinanceiro, excluirCategoriaFinanceiro,
  criarEmprestimo,
  listarEstoqueCategorias, criarEstoqueCategoria, excluirEstoqueCategoria,
  listarFornecedores, buscarFornecedor, criarFornecedor, atualizarFornecedor, excluirFornecedor,
  listarEstoqueItens, buscarEstoqueItem, criarEstoqueItem, atualizarEstoqueItem, excluirEstoqueItem,
  listarEstoqueEntradas, registrarEntrada, registrarEntradaLote,
  listarEstoqueSaidas, registrarSaida,
  listarEstoqueAjustes, registrarAjuste,
  estoqueDashboard,
  listarImagensProduto, adicionarImagemProduto, removerImagemProduto, reordenarImagensProduto,
  listarMesas, buscarMesa, buscarMesaPorNumero, criarMesa, atualizarMesa, excluirMesa,
  abrirComanda, buscarComanda, buscarComandaPorMesa, fecharComanda, cancelarComanda, pedirConta,
  listarItensComanda, adicionarItemComanda, atualizarStatusItemComanda, removerItemComanda,
  listarFilaCozinha, listarFilaCozinhaUnificada, estatisticasCaixa,
  registrarVisita, getCardapioStats, getRankingVendas,
  obterFiscalConfig, salvarFiscalConfig, salvarCertificadoA1, removerCertificadoA1,
  emitirNFCe, listarNFCe,
  consultarStatusSefazAntigo, emitirNFCeAntigo, listarNFCeAntigo, obterXmlNFCeAntigo,
  obterSessaoAberta, abrirCaixa, registrarMovimentoCaixa, fecharCaixa, listarMovimentosCaixa,
  listarCardapios, criarCardapio, atualizarCardapio, excluirCardapio,
  definirCategoriasCardapio, definirAdicionaisCardapio, garantirCardapioPrincipal,
  listarCardapiosPorCategoria, listarCardapiosPorAdicional,
} from "./database.js";

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "fluxo-caixa-secret-key-2026";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────

// PDV desktop (Electron seta NEXUS_DESKTOP=1): login é OPCIONAL — desligado por
// padrão, o operador entra direto como admin. A ativação fica em Configurações.
// No servidor online essa env nunca existe, então login é sempre obrigatório.
const IS_DESKTOP_APP = process.env.NEXUS_DESKTOP === "1";
function loginNecessario() {
  return !IS_DESKTOP_APP || obterConfig("login_ativo") === "1";
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
      return next();
    } catch {
      if (loginNecessario()) return res.status(401).json({ error: "Token inválido" });
    }
  } else if (loginNecessario()) {
    return res.status(401).json({ error: "Token não fornecido" });
  }
  // Desktop com login desativado: operador local age como admin (sem email —
  // ações restritas ao suporte Nexus continuam bloqueadas).
  req.user = { id: "local", nome: "Operador", email: null, tipo: "admin", setores: null };
  next();
}

function adminOnly(req, res, next) {
  if (req.user.tipo !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a administradores" });
  }
  next();
}

// Token fixo de sincronização (não expira, diferente do JWT de login que vence em
// 7 dias). É o que uma outra instalação deve colar em "Conexão remota" para enviar
// catálogo pra cá — evita ter que copiar um JWT de sessão do DevTools do admin.
function garantirTokenSincronizacao() {
  let tok = obterConfig("sync_receive_token");
  if (!tok) {
    tok = randomBytes(24).toString("hex");
    salvarConfig("sync_receive_token", tok);
  }
  return tok;
}

function syncTokenOrAdmin(req, res, next) {
  const header = req.headers.authorization;
  const bearer = header && header.startsWith("Bearer ") ? header.split(" ")[1] : null;
  const tokenSincronizacao = obterConfig("sync_receive_token");
  if (bearer && tokenSincronizacao && bearer === tokenSincronizacao) {
    req.user = { tipo: "admin", viaSyncToken: true };
    return next();
  }
  return authMiddleware(req, res, () => adminOnly(req, res, next));
}

// Setores válidos do sistema (cada um corresponde a uma "função" no hub).
const SETORES_VALIDOS = ["caixa", "cozinha", "produtos", "estoque", "financeiro", "config"];
function normalizarSetores(setores) {
  if (!Array.isArray(setores)) return null;  // null = todos os setores (acesso completo)
  const filtrados = setores.filter(s => SETORES_VALIDOS.includes(s));
  return filtrados.length > 0 ? filtrados : null;
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
  const adminEntry = email ? buscarAdminEmail(email) : null;
  const tipo = adminEntry ? "admin" : "cliente";
  const hash = await bcrypt.hash(senha, 10);
  const usuario = criarUsuario({ nome, email: email || null, senha: hash, tipo, telefone });
  const setores = adminEntry ? adminEntry.setores : null;
  const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, setores }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, telefone: usuario.telefone, setores }, token });
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

  // Funcionário pré-cadastrado pelo dono (admin_emails com senha): cria a conta no 1º login
  if (!usuario && email) {
    const adminEntry = buscarAdminEmail(email);
    if (adminEntry && adminEntry.senha_hash) {
      const valid = await bcrypt.compare(senha, adminEntry.senha_hash);
      if (!valid) return res.status(401).json({ error: "Credenciais inválidas" });
      usuario = criarUsuario({
        nome: adminEntry.nome || email.split("@")[0],
        email,
        senha: adminEntry.senha_hash,
        tipo: "admin",
        telefone: null,
      });
      const setores = adminEntry.setores;
      const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: "admin", setores }, JWT_SECRET, { expiresIn: "7d" });
      return res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: "admin", telefone: usuario.telefone, setores }, token });
    }
  }

  if (!usuario) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const valid = await bcrypt.compare(senha, usuario.senha);
  if (!valid) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const adminEntry = usuario.email ? buscarAdminEmail(usuario.email) : null;
  const setores = adminEntry ? adminEntry.setores : null;
  const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, setores }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo, telefone: usuario.telefone, setores }, token });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const usuario = buscarUsuarioPorId(req.user.id);
  if (!usuario) return res.status(404).json({ error: "Usuário não encontrado" });
  const adminEntry = usuario.email ? buscarAdminEmail(usuario.email) : null;
  res.json({ ...usuario, setores: adminEntry ? adminEntry.setores : null });
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
  res.json({
    saldo_inicial: parseFloat(obterConfig("saldo_inicial") || "0"),
    nome_estabelecimento: obterConfig("nome_estabelecimento") || "",
    whatsapp: obterConfig("whatsapp") || "",
    logo: obterConfig("logo") || "",
    link_exibicao: obterConfig("link_exibicao") || "",
    mensagem_alerta: obterConfig("mensagem_alerta") || "",
  });
});

app.put("/api/config", authMiddleware, adminOnly, (req, res) => {
  const { saldo_inicial, nome_estabelecimento, whatsapp, logo, link_exibicao, mensagem_alerta } = req.body;
  if (saldo_inicial !== undefined) {
    if (typeof saldo_inicial !== "number") {
      return res.status(400).json({ error: "saldo_inicial deve ser um número" });
    }
    salvarConfig("saldo_inicial", saldo_inicial);
  }
  if (nome_estabelecimento !== undefined) {
    salvarConfig("nome_estabelecimento", String(nome_estabelecimento).trim().slice(0, 60));
  }
  if (whatsapp !== undefined) {
    salvarConfig("whatsapp", String(whatsapp).trim().slice(0, 30));
  }
  if (logo !== undefined) {
    // Logotipo em base64 (data URL). Limite de segurança ~3MB.
    salvarConfig("logo", String(logo).slice(0, 3_500_000));
  }
  if (link_exibicao !== undefined) {
    // Link de exibição (bot WhatsApp): usado na saudação e nas notificações
    salvarConfig("link_exibicao", String(link_exibicao).trim().slice(0, 200));
  }
  if (mensagem_alerta !== undefined) {
    // Mensagem de alerta (adversidade): vazia = sem alerta ativo
    salvarConfig("mensagem_alerta", String(mensagem_alerta).trim().slice(0, 600));
  }
  res.json({
    saldo_inicial: parseFloat(obterConfig("saldo_inicial") || "0"),
    nome_estabelecimento: obterConfig("nome_estabelecimento") || "",
    whatsapp: obterConfig("whatsapp") || "",
    logo: obterConfig("logo") || "",
    link_exibicao: obterConfig("link_exibicao") || "",
    mensagem_alerta: obterConfig("mensagem_alerta") || "",
  });
});

// Dados públicos do estabelecimento (usado nas impressões, telas do cliente e
// pelo bot do WhatsApp no n8n — inclui link de exibição, alerta e status aberto)
app.get("/api/config/estabelecimento", (req, res) => {
  const hCfg = getHorarioConfig();
  res.json({
    nome_estabelecimento: obterConfig("nome_estabelecimento") || "",
    whatsapp: obterConfig("whatsapp") || "",
    logo: obterConfig("logo") || "",
    link_exibicao: obterConfig("link_exibicao") || "",
    mensagem_alerta: obterConfig("mensagem_alerta") || "",
    aberto: isAbertoAgora(hCfg),
    horario: { dias: hCfg.dias, abertura: hCfg.abertura, fechamento: hCfg.fechamento },
  });
});

// ─── LOGIN OPCIONAL (PDV desktop) ────────────────────────────────────────────

// Público: o frontend consulta antes de decidir se mostra a tela de login.
app.get("/api/config/login-status", (req, res) => {
  res.json({
    login_necessario: loginNecessario(),
    desktop: IS_DESKTOP_APP,
    login_ativo: obterConfig("login_ativo") === "1",
  });
});

// Liga/desliga a exigência de login no PDV (aba "Login" das Configurações).
app.put("/api/config/login", authMiddleware, adminOnly, (req, res) => {
  salvarConfig("login_ativo", req.body?.ativo ? "1" : "0");
  res.json({
    login_ativo: obterConfig("login_ativo") === "1",
    login_necessario: loginNecessario(),
  });
});

// ─── PERFIL / SETUP DO ESTABELECIMENTO ──────────────────────────────────────
// Persiste a escolha de modo (mesas/balcão), módulos opcionais e nome.
// Usado pelo Setup Wizard no primeiro acesso e pela adaptação do Hub.

app.get("/api/perfil", authMiddleware, adminOnly, (req, res) => {
  let modulos = [];
  try { modulos = JSON.parse(obterConfig("perfil_modulos") || "[]"); } catch {}
  res.json({
    modo: obterConfig("perfil_modo") || "",
    modulos,
    configurado: obterConfig("perfil_configurado") === "1",
    nome_estabelecimento: obterConfig("nome_estabelecimento") || "",
  });
});

app.put("/api/perfil", authMiddleware, adminOnly, (req, res) => {
  const { modo, modulos, nome_estabelecimento } = req.body;
  if (modo && ["mesas", "balcao"].includes(modo)) {
    // Depois de configurado, o modo de operação é estrutural: só o suporte
    // Nexus (conta principal) pode alterar.
    const jaConfigurado = obterConfig("perfil_configurado") === "1";
    const modoAtual = obterConfig("perfil_modo") || "";
    if (jaConfigurado && modoAtual && modo !== modoAtual && !isAdminPrincipal(req.user.email)) {
      return res.status(403).json({ error: "O modo de operação (mesas/balcão) só pode ser alterado pelo suporte Nexus." });
    }
    salvarConfig("perfil_modo", modo);
  }
  if (Array.isArray(modulos)) salvarConfig("perfil_modulos", JSON.stringify(modulos));
  if (nome_estabelecimento !== undefined) salvarConfig("nome_estabelecimento", String(nome_estabelecimento).trim().slice(0, 60));
  salvarConfig("perfil_configurado", "1");
  // Cria o "Cardápio Principal" default (idempotente — só cria se não houver nenhum).
  try { garantirCardapioPrincipal(); } catch { /* não bloqueia o wizard */ }
  let mods = [];
  try { mods = JSON.parse(obterConfig("perfil_modulos") || "[]"); } catch {}
  res.json({
    modo: obterConfig("perfil_modo") || "",
    modulos: mods,
    configurado: true,
    nome_estabelecimento: obterConfig("nome_estabelecimento") || "",
  });
});

// ─── SESSÃO DE CAIXA ────────────────────────────────────────────────────────
// Abrir caixa (saldo inicial), sangria, suprimento, fechamento cego.

app.get("/api/caixa/sessao", authMiddleware, adminOnly, (req, res) => {
  const sessao = obterSessaoAberta();
  res.json(sessao || { aberta: false });
});

app.post("/api/caixa/abrir", authMiddleware, adminOnly, (req, res) => {
  const aberta = obterSessaoAberta();
  if (aberta) return res.status(400).json({ error: "Já existe um caixa aberto." });
  const { saldo_inicial } = req.body;
  const sessao = abrirCaixa(req.user.email || req.user.nome, Number(saldo_inicial) || 0);
  res.json(sessao);
});

app.post("/api/caixa/sangria", authMiddleware, adminOnly, (req, res) => {
  const aberta = obterSessaoAberta();
  if (!aberta) return res.status(400).json({ error: "Abra o caixa primeiro." });
  const { valor, obs } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ error: "Valor inválido." });
  registrarMovimentoCaixa(aberta.id, "sangria", Number(valor), obs || "");
  res.json({ ok: true });
});

app.post("/api/caixa/suprimento", authMiddleware, adminOnly, (req, res) => {
  const aberta = obterSessaoAberta();
  if (!aberta) return res.status(400).json({ error: "Abra o caixa primeiro." });
  const { valor, obs } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ error: "Valor inválido." });
  registrarMovimentoCaixa(aberta.id, "suprimento", Number(valor), obs || "");
  res.json({ ok: true });
});

app.post("/api/caixa/fechar", authMiddleware, adminOnly, (req, res) => {
  const aberta = obterSessaoAberta();
  if (!aberta) return res.status(400).json({ error: "Não há caixa aberto." });
  const { saldo_informado } = req.body;
  const resultado = fecharCaixa(aberta.id, Number(saldo_informado) || 0);
  res.json(resultado);
});

app.get("/api/caixa/movimentos", authMiddleware, adminOnly, (req, res) => {
  const aberta = obterSessaoAberta();
  if (!aberta) return res.json([]);
  res.json(listarMovimentosCaixa(aberta.id));
});

// ─── ADMIN EMAILS (convites) ────────────────────────────────────────────────

app.get("/api/admin-emails", authMiddleware, adminOnly, (req, res) => {
  res.json(listarAdminEmails());
});

app.post("/api/admin-emails", authMiddleware, adminOnly, async (req, res) => {
  const { email, nome, senha, setores } = req.body;
  if (!email) return res.status(400).json({ error: "Email é obrigatório" });
  const setoresNorm = normalizarSetores(setores);
  const senhaHash = senha ? await bcrypt.hash(String(senha), 10) : undefined;
  adicionarAdminEmail(email, req.user.email, { nome, senhaHash, setores: setoresNorm });
  res.status(201).json({ success: true, email, nome: nome || "", setores: setoresNorm, tem_senha: !!senhaHash });
});

app.put("/api/admin-emails/:email", authMiddleware, adminOnly, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  // Protege contra auto-trancamento: admin não pode editar a própria conta
  // (a não ser que o pedido venha sem alterar setores).
  if (email && req.user.email && email.toLowerCase() === req.user.email.toLowerCase()) {
    return res.status(403).json({ error: "Não é possível editar a própria conta pelo painel — você poderia se trancar fora." });
  }
  const { nome, senha, setores } = req.body;
  // Conta principal Nexus: sempre tem acesso completo — bloqueia limitar setores
  if (isAdminPrincipal(email) && Array.isArray(setores) && setores.length > 0) {
    return res.status(403).json({ error: "A conta principal Nexus sempre tem acesso completo." });
  }
  const setoresNorm = setores === undefined ? undefined : normalizarSetores(setores);
  const senhaHash = senha ? await bcrypt.hash(String(senha), 10) : undefined;
  atualizarAdminEmail(email, { nome, senhaHash, setores: setoresNorm });
  res.json({ success: true, email });
});

app.delete("/api/admin-emails/:email", authMiddleware, adminOnly, (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (isAdminPrincipal(email)) {
    return res.status(403).json({ error: "A conta principal Nexus não pode ser removida." });
  }
  if (email && req.user.email && email.toLowerCase() === req.user.email.toLowerCase()) {
    return res.status(403).json({ error: "Não é possível remover a própria conta." });
  }
  removerAdminEmail(email);
  res.json({ success: true });
});

// ─── CARDÁPIOS ──────────────────────────────────────────────────────────────

app.get("/api/cardapios", (req, res) => {
  try { res.json(listarCardapios()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/cardapios", authMiddleware, adminOnly, (req, res) => {
  const { nome, descricao, icone, cor, imagem } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  try { res.json(criarCardapio({ nome, descricao, icone, cor, imagem })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/cardapios/:id", authMiddleware, adminOnly, (req, res) => {
  try { atualizarCardapio(req.params.id, req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/cardapios/:id", authMiddleware, adminOnly, (req, res) => {
  try { excluirCardapio(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/cardapios/:id/categorias", authMiddleware, adminOnly, (req, res) => {
  const { categorias } = req.body;
  if (!Array.isArray(categorias)) return res.status(400).json({ error: "categorias deve ser um array" });
  try { definirCategoriasCardapio(req.params.id, categorias); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/cardapios/:id/adicionais", authMiddleware, adminOnly, (req, res) => {
  const { adicionais } = req.body;
  if (!Array.isArray(adicionais)) return res.status(400).json({ error: "adicionais deve ser um array" });
  try { definirAdicionaisCardapio(req.params.id, adicionais); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
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

app.put("/api/categorias/reordenar", authMiddleware, adminOnly, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids deve ser um array" });
  res.json(reordenarCategorias(ids));
});

app.put("/api/categorias/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, permite_adicionais, ordem } = req.body;
  if (nome !== undefined && !nome) return res.status(400).json({ error: "Nome inválido" });
  const c = atualizarCategoria(req.params.id, { nome, permite_adicionais, ordem });
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
  const { nome, preco, custo, disponivel, max_quantidade, categoria_id } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço são obrigatórios" });
  if (typeof preco !== "number" || preco < 0) return res.status(400).json({ error: "Preço inválido" });
  res.status(201).json(criarAdicional({ nome, preco, custo: custo || 0, disponivel, max_quantidade, categoria_id }));
});

app.put("/api/adicionais/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, preco, custo, disponivel, max_quantidade, categoria_id } = req.body;
  if (!nome || preco === undefined) return res.status(400).json({ error: "Nome e preço obrigatórios" });
  const a = atualizarAdicional(req.params.id, { nome, preco, custo: custo || 0, disponivel, max_quantidade, categoria_id });
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

// ─── PROMOÇÕES ─────────────────────────────────────────────────────────────

// Pública — só promoções vigentes agora (cardápio cliente)
app.get("/api/promocoes/ativas", (req, res) => {
  res.json(listarPromocoesAtivas());
});

// Admin — todas as promoções (incluindo agendadas e expiradas)
app.get("/api/promocoes", authMiddleware, adminOnly, (req, res) => {
  res.json(listarPromocoes());
});

app.post("/api/promocoes", authMiddleware, adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.nome || b.preco === undefined) {
    return res.status(400).json({ error: "Nome e preço são obrigatórios" });
  }
  if (typeof b.preco !== "number" || b.preco < 0) {
    return res.status(400).json({ error: "Preço inválido" });
  }
  if (b.preco_de !== undefined && b.preco_de !== null && (typeof b.preco_de !== "number" || b.preco_de < 0)) {
    return res.status(400).json({ error: "Preço original inválido" });
  }
  if (b.promo_data_inicio && b.promo_data_fim && b.promo_data_inicio > b.promo_data_fim) {
    return res.status(400).json({ error: "Data de início não pode ser após data de fim" });
  }
  res.status(201).json(criarPromocao(b));
});

app.put("/api/promocoes/:id", authMiddleware, adminOnly, (req, res) => {
  const b = req.body || {};
  if (b.preco !== undefined && (typeof b.preco !== "number" || b.preco < 0)) {
    return res.status(400).json({ error: "Preço inválido" });
  }
  if (b.promo_data_inicio && b.promo_data_fim && b.promo_data_inicio > b.promo_data_fim) {
    return res.status(400).json({ error: "Data de início não pode ser após data de fim" });
  }
  const p = atualizarPromocao(req.params.id, b);
  if (!p) return res.status(404).json({ error: "Promoção não encontrada" });
  res.json(p);
});

// Exclusão usa a mesma rota de produto (vai pra lixeira igual)
// DELETE /api/produtos/:id já cobre

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

// Listagem pública dos pedidos do cliente, autenticada pelo telefone
// (read-only — usado na tela "Meus Pedidos")
app.get("/api/pedidos/publico/cliente/:telefone", (req, res) => {
  const telefone = String(req.params.telefone || "").replace(/\D/g, "");
  if (telefone.length < 10) {
    return res.status(400).json({ error: "Telefone inválido" });
  }
  const pedidos = listarPedidosPorTelefone(telefone);
  const result = pedidos.map(p => ({ ...p, itens: buscarItensPedido(p.id) }));
  res.json(result);
});

// Pedido público (sem autenticação — cliente envia dados inline)
app.post("/api/pedidos/publico", (req, res) => {
  const { itens, obs, cliente_nome, cliente_telefone, cliente_email, metodo_pagamento, troco_para, tipo_entrega, endereco } = req.body;
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
    troco_para: troco_para || null,
    tipo_entrega: ['retirada', 'casa'].includes(tipo_entrega) ? tipo_entrega : 'entrega',
    endereco: ['retirada', 'casa'].includes(tipo_entrega) ? {} : (endereco || {}),
  });

  // Notificar cliente via WhatsApp (não bloqueia a resposta)
  notificarPedidoConfirmado(pedido).catch(() => {});

  res.status(201).json(pedido);
});

app.post("/api/pedidos", authMiddleware, (req, res) => {
  const { itens, obs, cliente_nome, tipo, metodo_pagamento, troco_para, endereco, tipo_entrega } = req.body;
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
    troco_para: troco_para || null,
    tipo_entrega: tipo_entrega || "entrega",
    endereco: ["retirada", "casa"].includes(tipo_entrega) ? {} : enderecoFinal,
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

  // Notificar cliente via WhatsApp em TODA mudança de status (exceto pendente, que é o estado inicial)
  if (status !== "pendente") {
    notificarStatusPedido(pedido, status).catch(() => {});
  }

  if (status === "entregue") {
    // Data do lançamento = data do PEDIDO em BRT (UTC-3), não "agora UTC".
    // Isso garante que o financeiro bate com o que aparece na aba de pedidos
    // (que agrupa por created_at em BRT). Antes usava UTC e pedidos de
    // 19h–01h BRT caíam no dia seguinte no financeiro.
    const dataPedidoBRT = (() => {
      const utc = pedido.created_at || new Date().toISOString();
      const d = new Date(utc.includes("T") ? utc : utc.replace(" ", "T") + "Z");
      d.setUTCHours(d.getUTCHours() - 3);
      return d.toISOString().slice(0, 10);
    })();

    // CMV (custo de produção) — embutido na venda como atributo, NÃO como
    // lançamento separado. O feed mostra venda + custo + margem em 1 linha.
    // O CMV continua no DRE (calculado a partir dos pedidos), só sai do feed.
    const itens = buscarItensPedido(pedido.id);
    const cmvTotal = itens.reduce((s, item) => {
      return s + (item.custo_unitario * item.quantidade);
    }, 0);

    // Lançamento de RECEITA (entrada) — carrega o custo (CMV) da venda
    criarLancamento({
      tipo: "entrada",
      descricao: `Pedido #${pedido.id.slice(0, 6)} — ${pedido.cliente_nome || "Cliente"}`,
      valor: pedido.total,
      data: dataPedidoBRT,
      cat: "Vendas",
      status: "realizado",
      obs: `Pedido ${pedido.tipo} entregue automaticamente`,
      custo: cmvTotal > 0 ? cmvTotal : null,
    });

    // Reportar receita para NEXO (não bloqueia, não quebra o fluxo)
    reportarReceitaNexo({
      amount: pedido.total,
      description: `Pedido #${pedido.id.slice(0, 6)}`,
      source: pedido.tipo === 'online' ? 'online' : 'presencial',
    });
  }

  res.json({ ...pedido, itens: buscarItensPedido(pedido.id) });
});

app.delete("/api/pedidos/:id", authMiddleware, adminOnly, (req, res) => {
  const ok = excluirPedido(req.params.id);
  if (!ok) return res.status(404).json({ error: "Pedido não encontrado" });
  res.json({ success: true });
});

// ─── SINCRONIZAÇÃO (cozinha simultânea local ↔ nuvem) ────────────────────────
// PULL: quem chama recebe os pedidos alterados desde um cursor (ISO). Serve tanto
// pro desktop puxar da VPS quanto pra VPS puxar do desktop (mesmo código).
app.get("/api/sync/pull", syncTokenOrAdmin, (req, res) => {
  try {
    const desde = req.query.desde || "1970-01-01T00:00:00";
    const pedidos = pedidosAlteradosDesde(desde);
    // cursor = maior updated_at retornado (ou o próprio 'desde' se vazio)
    const cursor = pedidos.reduce((m, p) => {
      const t = p.updated_at || p.created_at || "";
      return t > m ? t : m;
    }, desde);
    res.json({ pedidos, cursor, servidor_agora: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUSH: recebe um lote de pedidos e faz upsert (last-write-wins), sem efeitos
// colaterais. Idempotente por id.
app.post("/api/sync/push", syncTokenOrAdmin, (req, res) => {
  try {
    const lote = Array.isArray(req.body?.pedidos) ? req.body.pedidos : [];
    const resultado = { inserido: 0, atualizado: 0, ignorado: 0 };
    for (const p of lote) {
      const r = upsertPedidoSync(p);
      resultado[r] = (resultado[r] || 0) + 1;
    }
    res.json({ ok: true, ...resultado, recebidos: lote.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SYNC CONFIG + CATÁLOGO ─────────────────────────────────────────────────

app.get("/api/config/sync", authMiddleware, adminOnly, (req, res) => {
  res.json({
    url: obterConfig("sync_url") || "",
    token: obterConfig("sync_token") || "",
    enabled: obterConfig("sync_enabled") === "1",
    last_sync: obterConfig("sync_last") || null,
    last_sync_result: obterConfig("sync_last_result") || null,
  });
});

app.put("/api/config/sync", authMiddleware, adminOnly, (req, res) => {
  const { url, token, enabled } = req.body;
  if (url !== undefined) salvarConfig("sync_url", String(url).trim());
  if (token !== undefined) salvarConfig("sync_token", String(token).trim());
  if (enabled !== undefined) salvarConfig("sync_enabled", enabled ? "1" : "0");
  // Re-inicia (ou para) o motor de sync de pedidos com a nova config
  try { iniciarSyncPedidos(); } catch {}
  res.json({
    url: obterConfig("sync_url") || "",
    token: obterConfig("sync_token") || "",
    enabled: obterConfig("sync_enabled") === "1",
  });
});

// Token que ESTA instalação expõe para que OUTRAS instalações se conectem a ela
// (o campo "TOKEN DE AUTENTICAÇÃO" que o outro lado cola). Não expira.
app.get("/api/config/sync-token", authMiddleware, adminOnly, (req, res) => {
  res.json({ token: garantirTokenSincronizacao() });
});

app.post("/api/config/sync-token/regenerar", authMiddleware, adminOnly, (req, res) => {
  const tok = randomBytes(24).toString("hex");
  salvarConfig("sync_receive_token", tok);
  res.json({ token: tok });
});

app.post("/api/sync/test", authMiddleware, adminOnly, async (req, res) => {
  const url = obterConfig("sync_url");
  if (!url) return res.status(400).json({ error: "URL do servidor não configurada" });
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/api/config/estabelecimento`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json({ ok: true, nome: data.nome_estabelecimento || "(sem nome)" });
  } catch (err) {
    res.status(502).json({ error: `Falha: ${err.message}` });
  }
});

app.post("/api/sync/produtos", authMiddleware, adminOnly, async (req, res) => {
  const url = obterConfig("sync_url");
  const token = obterConfig("sync_token");
  if (!url || !token) return res.status(400).json({ error: "Conexão não configurada" });
  try {
    const produtos = listarProdutos();
    const categorias = listarCategorias();
    const adicionais = listarAdicionais();
    const baseUrl = url.replace(/\/+$/, "");
    const r = await fetch(`${baseUrl}/api/sync/push-catalogo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ produtos, categorias, adicionais }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    const result = await r.json();
    const agora = new Date().toISOString();
    salvarConfig("sync_last", agora);
    salvarConfig("sync_last_result", `${produtos.length} produtos, ${categorias.length} categorias, ${adicionais.length} adicionais`);
    syncCatalogoHash = JSON.stringify({ p: produtos.length, c: categorias.length, a: adicionais.length,
      ids: produtos.map(p => `${p.id}:${p.updated_at || p.nome}`).sort().join(",") });
    res.json({ ok: true, ...result, sincronizado_em: agora });
  } catch (err) {
    salvarConfig("sync_last", new Date().toISOString());
    salvarConfig("sync_last_result", `Erro: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/sync/push-catalogo", syncTokenOrAdmin, (req, res) => {
  try {
    const { categorias = [], adicionais = [], produtos = [] } = req.body;
    const resultado = upsertCatalogoSync({ categorias, adicionais, produtos });
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LIXEIRA (admin only) ────────────────────────────────────────────────────

app.get("/api/lixeira", authMiddleware, adminOnly, (req, res) => {
  res.json(listarLixeira());
});

app.post("/api/lixeira/:tipo/:id/restaurar", authMiddleware, adminOnly, (req, res) => {
  try {
    const ok = restaurarItemLixeira(req.params.tipo, req.params.id);
    if (!ok) return res.status(404).json({ error: "Item não encontrado na lixeira" });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/lixeira/:tipo/:id", authMiddleware, adminOnly, (req, res) => {
  try {
    const ok = excluirDefinitivoLixeira(req.params.tipo, req.params.id);
    if (!ok) return res.status(404).json({ error: "Item não encontrado na lixeira" });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── CUSTOS FIXOS (admin only) ───────────────────────────────────────────────

app.get("/api/custos-fixos", authMiddleware, adminOnly, (req, res) => {
  res.json(listarCustosFixos());
});

app.post("/api/custos-fixos", authMiddleware, adminOnly, (req, res) => {
  const { nome, valor, categoria, ativo, tipo, diaria, qtd } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  // Custo variável: validar diaria/qtd no lugar de valor
  if (tipo === "variavel") {
    if (typeof diaria !== "number" || diaria < 0) return res.status(400).json({ error: "Valor da diária inválido" });
    if (typeof qtd !== "number" || qtd < 0)       return res.status(400).json({ error: "Quantidade inválida" });
  } else {
    if (typeof valor !== "number" || valor < 0) return res.status(400).json({ error: "Valor inválido" });
  }
  res.status(201).json(criarCustoFixo({ nome, valor: valor || 0, categoria, ativo, tipo, diaria, qtd }));
});

app.put("/api/custos-fixos/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, valor, categoria, ativo, tipo, diaria, qtd } = req.body;
  if (!nome && nome !== undefined) return res.status(400).json({ error: "Nome é obrigatório" });
  const cf = atualizarCustoFixo(req.params.id, { nome, valor, categoria, ativo, tipo, diaria, qtd });
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

// ─── CATEGORIAS FINANCEIRO (admin only) ──────────────────────────────────────
app.get("/api/categorias-financeiro", authMiddleware, adminOnly, (req, res) => {
  res.json(listarCategoriasFinanceiro({ incluirArquivadas: req.query.incluir_arquivadas === "1" }));
});

app.post("/api/categorias-financeiro", authMiddleware, adminOnly, (req, res) => {
  const { nome, cor, tipo } = req.body;
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: "Nome é obrigatório" });
  try {
    res.status(201).json(criarCategoriaFinanceiro({ nome, cor, tipo }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/categorias-financeiro/:id", authMiddleware, adminOnly, (req, res) => {
  const { nome, cor, tipo, arquivada } = req.body;
  const cat = atualizarCategoriaFinanceiro(req.params.id, { nome, cor, tipo, arquivada });
  if (!cat) return res.status(404).json({ error: "Categoria não encontrada" });
  res.json(cat);
});

app.delete("/api/categorias-financeiro/:id", authMiddleware, adminOnly, (req, res) => {
  if (!excluirCategoriaFinanceiro(req.params.id)) return res.status(404).json({ error: "Categoria não encontrada" });
  res.json({ success: true });
});

// ─── EMPRÉSTIMO INTELIGENTE ──────────────────────────────────────────────────
// POST recebe { descricao, valor, data, cat, juros_pct, n_parcelas, dia_pagamento }
// Cria 1 entrada (recebimento) + N saídas previstas (parcelas)
app.post("/api/lancamentos/emprestimo", authMiddleware, adminOnly, (req, res) => {
  try {
    const pai = criarEmprestimo(req.body || {});
    res.status(201).json(pai);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
  const { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual } = req.body;
  if (!codigo || !nome) return res.status(400).json({ error: "Código e nome são obrigatórios" });
  try {
    res.status(201).json(criarEstoqueItem({ codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, custo_manual }));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Código já existe" });
    throw err;
  }
});

app.put("/api/estoque/itens/:id", authMiddleware, adminOnly, (req, res) => {
  const { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo, custo_manual } = req.body;
  if (!codigo || !nome) return res.status(400).json({ error: "Código e nome são obrigatórios" });
  const item = atualizarEstoqueItem(req.params.id, { codigo, nome, unidade, categoria_id, fornecedor_id, estoque_minimo, estoque_maximo, ativo, custo_manual });
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
  status: 'auto',                 // 'auto' | 'aberto' | 'fechado'
  dias: [0, 1, 2, 3, 4, 5, 6],    // 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sab — default do template: todos os dias ativos
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

// ─── ANALYTICS DO CARDÁPIO (T10) ─────────────────────────────────────────────
// POST público — registra uma visita ao cardápio (cliente faz ping 1x por sessão)
app.post('/api/public/visita', (req, res) => {
  try { registrarVisita(); } catch { /* não bloqueia o cliente */ }
  res.json({ ok: true });
});

// GET autenticado — estatísticas do cardápio para o admin
app.get('/api/cardapio/stats', authMiddleware, (req, res) => {
  res.json(getCardapioStats());
});

// GET autenticado — ranking de vendas (produtos e adicionais) para o admin
app.get('/api/relatorios/ranking', authMiddleware, (req, res) => {
  res.json(getRankingVendas());
});

// ─── FISCAL / NFC-e (admin only) ─────────────────────────────────────────────
app.get("/api/fiscal/config", authMiddleware, adminOnly, (req, res) => {
  res.json(obterFiscalConfig());
});

app.put("/api/fiscal/config", authMiddleware, adminOnly, (req, res) => {
  try {
    res.json(salvarFiscalConfig(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Upload do certificado A1: { nome_arquivo, pfx_base64, senha }
app.post("/api/fiscal/certificado", authMiddleware, adminOnly, (req, res) => {
  const { nome_arquivo, pfx_base64, senha } = req.body || {};
  if (!pfx_base64) return res.status(400).json({ error: "Envie o arquivo do certificado (.pfx)." });
  try {
    res.json(salvarCertificadoA1({ nome_arquivo, pfx_base64, senha }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/fiscal/certificado", authMiddleware, adminOnly, (req, res) => {
  res.json(removerCertificadoA1());
});

// NFC-e: emitir a partir de um pedido (ou teste sem pedido) + listar
app.post("/api/fiscal/nfce/emitir", authMiddleware, adminOnly, (req, res) => {
  const { pedido_id, simulado } = req.body || {};
  try {
    res.status(201).json(emitirNFCe(pedido_id || null, { simulado: !!simulado }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Teste rápido de emissão simulada (sem pedido real)
app.post("/api/fiscal/nfce/teste", authMiddleware, adminOnly, (req, res) => {
  try {
    res.status(201).json(emitirNFCe(null, { simulado: true }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/fiscal/nfce", authMiddleware, adminOnly, (req, res) => {
  res.json(listarNFCe(Number(req.query.limit) || 20));
});

// ─── NFC-e ANTIGO (motor próprio — regras vigentes, emissão direta na SEFAZ) ─

// Testa conectividade + certificado contra o serviço de status da SEFAZ
app.post("/api/fiscal/antigo/status", authMiddleware, adminOnly, async (req, res) => {
  try {
    res.json(await consultarStatusSefazAntigo());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Emissão REAL (homologação ou produção conforme o ambiente configurado).
// Sem pedido_id emite nota de teste de R$ 1,00.
app.post("/api/fiscal/antigo/emitir", authMiddleware, adminOnly, async (req, res) => {
  try {
    res.status(201).json(await emitirNFCeAntigo(req.body?.pedido_id || null));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/fiscal/antigo/nfce", authMiddleware, adminOnly, (req, res) => {
  res.json(listarNFCeAntigo(Number(req.query.limit) || 20));
});

// XML assinado/autorizado da nota (p/ conferência e guarda fiscal)
app.get("/api/fiscal/antigo/nfce/:id/xml", authMiddleware, adminOnly, (req, res) => {
  const r = obterXmlNFCeAntigo(req.params.id);
  if (!r) return res.status(404).json({ error: "XML não encontrado" });
  res.json({ numero: r.numero, serie: r.serie, chave: r.chave, xml: r.xml_assinado });
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

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';

app.get('/whatsapp', async (req, res) => {
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
  <title>WhatsApp — Conexão</title>
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
  <h1>WhatsApp Business</h1>
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

// Extrai o número de telefone REAL do remetente.
// Prioridade:
//   1. key.senderPn  (quando remoteJid vem como @lid, este campo traz o número real)
//   2. key.participantPn
//   3. data.sender
//   4. remoteJid se já for @s.whatsapp.net / @c.us
// NUNCA tenta adivinhar via foto de perfil (isso causava respostas no número errado).
function extrairNumeroReal(data) {
  const key = data?.key || {};

  // Evolution v2.3.7+ com Baileys novo: quando addressingMode === "lid",
  // o número real do remetente vem em key.remoteJidAlt
  const candidatos = [
    key.senderPn,
    key.participantPn,
    key.remoteJidAlt,        // ← número real quando remoteJid é @lid
    key.participant,
    data?.sender,
    data?.senderPn,
    data?.remoteJidAlt,
    key.remoteJid,
  ].filter(Boolean);

  for (const cand of candidatos) {
    // Só aceita JIDs reais (@s.whatsapp.net ou @c.us). Ignora @lid e @g.us.
    if (typeof cand !== 'string') continue;
    if (cand.includes('@g.us')) continue;
    if (cand.endsWith('@lid')) continue;
    const numero = cand.split('@')[0];
    // Tem que ser só dígitos e ter tamanho de telefone
    if (/^\d{8,15}$/.test(numero)) return numero;
  }
  return null;
}

// Cache temporário do QR Code para setup inicial da Evolution
let _lastQrBase64 = null;
let _lastQrAt = 0;

// ── Cooldown de saudação por número ────────────────────────────────────────────
// Depois que o bot saúda um cliente, fica em silêncio por X horas pra esse número.
// Se o DONO responder manualmente (fromMe:true), renova o cooldown — assim o bot
// não interrompe o atendimento humano.
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas
const ultimaSaudacao = new Map(); // numero -> timestamp ms
const saudandoAgora = new Set();  // numeros sendo saudados nesse instante (anti race)

function emCooldown(numero) {
  const ts = ultimaSaudacao.get(numero);
  if (!ts) return false;
  if (Date.now() - ts > COOLDOWN_MS) {
    ultimaSaudacao.delete(numero);
    return false;
  }
  return true;
}

// Limpa entradas antigas a cada hora pra Map não crescer infinitamente
setInterval(() => {
  const now = Date.now();
  for (const [num, ts] of ultimaSaudacao) {
    if (now - ts > COOLDOWN_MS) ultimaSaudacao.delete(num);
  }
}, 60 * 60 * 1000);

// ── Saudações do bot — 100% a partir das CONFIGURAÇÕES da plataforma ─────────
const DIAS_BOT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function montarSaudacaoBot() {
  const nome = obterConfig('nome_estabelecimento') || 'nosso estabelecimento';
  const link = (obterConfig('link_exibicao') || '').trim();
  const alerta = (obterConfig('mensagem_alerta') || '').trim();
  const hCfg = getHorarioConfig();
  const aberto = isAbertoAgora(hCfg);

  const blocoLink = link ? `\n\nAcesse nosso cardápio e faça seu pedido pelo link abaixo:\n🌐 *${link}*` : '';

  // 1) Alerta ativo (adversidade: chapa queimou, falta de energia, etc.)
  if (alerta) {
    return `Olá! 👋 Aqui é da *${nome}*.\n\n⚠️ *Aviso importante:*\n${alerta}\n\nPedimos desculpas pelo transtorno e agradecemos a sua compreensão. 🙏${blocoLink}`;
  }

  // 2) Fechado — horário vem da config
  if (!aberto) {
    const dias = (hCfg.dias || []).map(d => DIAS_BOT[d]);
    const diasStr = dias.length === 7 ? 'Todos os dias' : dias.join(', ');
    return `🔒 *Olá! No momento a ${nome} está fechada.*\n\nNosso horário de funcionamento:\n📅 *${diasStr}*\n🕐 *${hCfg.abertura} às ${hCfg.fechamento}*${blocoLink}\n\n_Te esperamos em breve!_ 😊`;
  }

  // 3) Aberto — saudação padrão + apresentação + link
  return `Olá! 👋 Seja bem-vindo(a) à *${nome}*! 🍔${blocoLink}\n\n_Após finalizar o pedido, você receberá as atualizações aqui pelo WhatsApp!_ 📲`;
}

// Mensagem de alerta em massa: envia para todos os clientes com pedido EM
// ANDAMENTO (pendente/confirmado/preparando/pronto). Quem mandar mensagem nova
// também recebe o alerta, pois montarSaudacaoBot() prioriza o alerta ativo.
app.post('/api/whatsapp/alerta', authMiddleware, adminOnly, async (req, res) => {
  try {
    const mensagem = String(req.body?.mensagem ?? obterConfig('mensagem_alerta') ?? '').trim();
    if (!mensagem) return res.status(400).json({ error: 'Escreva a mensagem de alerta antes de enviar.' });
    // Se veio mensagem nova no corpo, salva na config (o bot passa a respondê-la também)
    if (req.body?.mensagem !== undefined) salvarConfig('mensagem_alerta', mensagem.slice(0, 600));

    const nome = obterConfig('nome_estabelecimento') || 'nosso estabelecimento';
    const texto = `Olá! 👋 Aqui é da *${nome}*.\n\n⚠️ *Aviso importante:*\n${mensagem}\n\nPedimos desculpas pelo transtorno e agradecemos a sua compreensão. 🙏`;

    const ATIVOS = ['pendente', 'confirmado', 'preparando', 'pronto'];
    const pedidos = listarPedidos().filter(p => ATIVOS.includes(p.status) && p.cliente_telefone);
    const numeros = [...new Set(pedidos.map(p => String(p.cliente_telefone).replace(/\D/g, '')).filter(n => n.length >= 10))];

    let enviados = 0;
    for (const n of numeros) {
      if (await enviarMensagem(n, texto)) enviados++;
    }
    res.json({ enviados, total: numeros.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bot/qr', async (req, res) => {
  // Busca QR direto da Evolution (mais confiável que o cache do webhook)
  let qrFromApi = null;
  let estado = 'desconhecido';
  try {
    const stateResp = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_KEY },
    });
    const stateJson = await stateResp.json();
    estado = stateJson?.instance?.state || 'desconhecido';

    if (estado !== 'open') {
      const r = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, {
        headers: { 'apikey': EVOLUTION_KEY },
      });
      const j = await r.json();
      const b64 = j?.base64 || j?.qrcode?.base64 || null;
      if (b64) qrFromApi = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64.split(',').pop()}`;
    }
  } catch (err) {
    console.error('[bot/qr] erro ao consultar Evolution:', err.message);
  }

  // Fallback: usa cache do webhook se a API direta não retornou
  const qrFinal = qrFromApi || _lastQrBase64;
  const fonte = qrFromApi ? 'tempo real' : 'cache (' + Math.round((Date.now() - _lastQrAt) / 1000) + 's)';

  if (estado === 'open') {
    return res.send(`<!doctype html><html><body style="background:#0d1f0d;color:#a7f3d0;text-align:center;font-family:sans-serif;padding:60px">
<h1>✅ Bot conectado!</h1>
<p>O WhatsApp já está pareado. Não precisa escanear nada.</p>
</body></html>`);
  }

  if (!qrFinal) {
    return res.status(503).send(`<!doctype html><html><body style="background:#111;color:#eee;text-align:center;font-family:sans-serif;padding:40px">
<h2>⏳ Aguardando QR Code…</h2>
<p>Estado: <b>${estado}</b></p>
<p>Atualize a página em alguns segundos.</p>
<script>setTimeout(()=>location.reload(), 4000)</script>
</body></html>`);
  }

  res.send(`<!doctype html><html><head><meta http-equiv="refresh" content="20"></head><body style="background:#111;color:#eee;text-align:center;font-family:sans-serif">
<h2>QR Code Evolution — escaneie no WhatsApp</h2>
<p>Estado: <b>${estado}</b> · Fonte: ${fonte} · A página recarrega sozinha a cada 20s</p>
<img src="${qrFinal}" style="background:white;padding:16px;border-radius:8px;max-width:400px"/>
<p style="font-size:14px;color:#aaa">No celular novo: WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho</p>
</body></html>`);
});

app.post('/api/bot/webhook', async (req, res) => {
  // Responde imediatamente para não dar timeout
  res.json({ status: 'ok' });

  try {
    const body = req.body;
    const event = body.event || '';
    const data = body.data || {};

    // LOG DEBUG: tudo que chega
    console.log('[bot/webhook] EVENT:', event, 'fromMe:', data?.key?.fromMe, 'remoteJid:', data?.key?.remoteJid?.slice(0, 30));

    // Captura QR code se vier
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const qr = data.qrcode || data;
      const b64 = qr?.base64 || qr?.code || data?.base64;
      if (b64) {
        _lastQrBase64 = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64.split(',').pop()}`;
        _lastQrAt = Date.now();
        console.log('[bot/webhook] QR atualizado, disponível em /api/bot/qr');
      }
      return;
    }

    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      console.log('[bot/webhook] connection.update:', JSON.stringify(data).slice(0, 200));
      return;
    }

    const key = data.key  || {};

    // Ignora grupos
    if (key.remoteJid && key.remoteJid.includes('@g.us')) return;

    const remoteJid = key.remoteJid || '';
    if (!remoteJid) return;

    const numero = extrairNumeroReal(data);
    if (!numero) {
      console.error('[bot/webhook] não conseguiu extrair numero. data=', JSON.stringify(data).slice(0, 500));
      return;
    }

    // Se a mensagem foi enviada PELO DONO (fromMe), renova o cooldown do destinatário
    // para o bot ficar em silêncio enquanto o atendimento humano está rolando.
    if (key.fromMe) {
      ultimaSaudacao.set(numero, Date.now());
      console.log('[bot/webhook] dono respondeu para', numero, '— cooldown de 6h renovado');
      return;
    }

    // Cliente mandou mensagem: se já saudamos nas últimas 6h, não saúda de novo
    if (emCooldown(numero)) {
      console.log('[bot/webhook] cliente', numero, 'em cooldown, ignorando mensagem');
      return;
    }

    // Anti race condition: se já estamos saudando esse cliente nesse instante, ignora
    if (saudandoAgora.has(numero)) {
      console.log('[bot/webhook] cliente', numero, 'já está sendo saudado, ignorando duplicata');
      return;
    }
    saudandoAgora.add(numero);

    console.log('[bot/webhook] enviando saudação para:', numero, '(remoteJid:', remoteJid, ')');

    // ── Mensagens montadas a partir das CONFIGURAÇÕES da plataforma ────────────
    // (nome do estabelecimento, link de exibição, horário e mensagem de alerta)
    const texto = montarSaudacaoBot();

    const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '';
    const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';

    try {
      // Evolution API v2 usa { number, text } direto (não mais textMessage.text)
      const r = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
        body: JSON.stringify({ number: numero, text: texto }),
      });
      if (r.ok) {
        // SÓ marca cooldown se a saudação foi enviada com sucesso
        ultimaSaudacao.set(numero, Date.now());
        console.log('[bot/webhook] saudação enviada para', numero, '— cooldown ativo por 6h');
      } else {
        const errBody = await r.text();
        console.error('[bot/webhook] sendText falhou:', r.status, errBody.slice(0, 300));
        // NÃO marca cooldown — próxima mensagem do cliente vai tentar de novo
      }
    } finally {
      saudandoAgora.delete(numero);
    }
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
    const EVOLUTION_KEY = process.env.EVOLUTION_KEY || '';
    const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';

    // Evolution API v2 usa { number, text } direto
    const r = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number, text }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FRENTE DE CAIXA: MESAS ─────────────────────────────────────────────────

app.get('/api/mesas', authMiddleware, (req, res) => {
  try { res.json(listarMesas()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/mesas', authMiddleware, adminOnly, (req, res) => {
  try {
    const { numero, lugares } = req.body;
    if (!numero) return res.status(400).json({ error: "Número da mesa é obrigatório" });
    res.status(201).json(criarMesa({ numero, lugares }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/mesas/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const mesa = atualizarMesa(req.params.id, req.body);
    if (!mesa) return res.status(404).json({ error: "Mesa não encontrada" });
    res.json(mesa);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/mesas/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    if (!excluirMesa(req.params.id)) return res.status(404).json({ error: "Mesa não encontrada" });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── FRENTE DE CAIXA: COMANDAS ──────────────────────────────────────────────

app.post('/api/comandas', authMiddleware, (req, res) => {
  try {
    const { mesa_id, cliente_nome, pessoas } = req.body;
    if (!mesa_id) return res.status(400).json({ error: "mesa_id é obrigatório" });
    res.status(201).json(abrirComanda({ mesa_id, cliente_nome, pessoas }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/comandas/:id', authMiddleware, (req, res) => {
  try {
    const c = buscarComanda(req.params.id);
    if (!c) return res.status(404).json({ error: "Comanda não encontrada" });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/comandas/mesa/:mesa_id', authMiddleware, (req, res) => {
  try {
    const c = buscarComandaPorMesa(req.params.mesa_id);
    res.json(c || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comandas/:id/fechar', authMiddleware, (req, res) => {
  try { res.json(fecharComanda(req.params.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/comandas/:id/cancelar', authMiddleware, (req, res) => {
  try { res.json(cancelarComanda(req.params.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/mesas/:id/pedir-conta', authMiddleware, (req, res) => {
  try { res.json(pedirConta(req.params.id)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── FRENTE DE CAIXA: ITENS DA COMANDA ──────────────────────────────────────

app.get('/api/comandas/:id/itens', authMiddleware, (req, res) => {
  try { res.json(listarItensComanda(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comandas/:id/itens', authMiddleware, (req, res) => {
  try {
    const { produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem } = req.body;
    if (!produto_nome || preco_unitario == null) return res.status(400).json({ error: "produto_nome e preco_unitario obrigatórios" });
    res.status(201).json(adicionarItemComanda({ comanda_id: req.params.id, produto_id, produto_nome, quantidade, preco_unitario, adicionais, obs, origem }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/comanda-itens/:id/status', authMiddleware, (req, res) => {
  try {
    const { status } = req.body;
    res.json(atualizarStatusItemComanda(req.params.id, status));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/comanda-itens/:id', authMiddleware, (req, res) => {
  try {
    if (!removerItemComanda(req.params.id)) return res.status(404).json({ error: "Item não encontrado" });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── FRENTE DE CAIXA: FILA DA COZINHA & STATS ──────────────────────────────

app.get('/api/cozinha/fila', authMiddleware, (req, res) => {
  try { res.json(listarFilaCozinha()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cozinha/fila-unificada', authMiddleware, (req, res) => {
  try { res.json(listarFilaCozinhaUnificada()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cozinha/atualizar-status', authMiddleware, (req, res) => {
  const { grupo_id, status } = req.body;
  if (!grupo_id) return res.status(400).json({ error: "grupo_id obrigatório" });
  if (!status || !["preparando", "pronto"].includes(status)) return res.status(400).json({ error: "status deve ser 'preparando' ou 'pronto'" });
  try {
    if (grupo_id.startsWith("comanda_")) {
      const comandaId = grupo_id.replace("comanda_", "");
      const filtro = status === "preparando" ? ["pendente"] : ["pendente", "preparando"];
      const itens = listarItensComanda(comandaId).filter(i => filtro.includes(i.status));
      for (const item of itens) atualizarStatusItemComanda(item.id, status);
      res.json({ ok: true, tipo: "mesa", marcados: itens.length, status });
    } else if (grupo_id.startsWith("pedido_")) {
      const pedidoId = grupo_id.replace("pedido_", "");
      const pedido = atualizarStatusPedido(pedidoId, status);
      if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });
      res.json({ ok: true, tipo: "delivery", pedido_id: pedidoId, status });
    } else {
      res.status(400).json({ error: "grupo_id inválido" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/caixa/stats', authMiddleware, (req, res) => {
  try { res.json(estatisticasCaixa()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MESA QR CODE — ROTAS PÚBLICAS (sem auth) ──────────────────────────────

// Info da mesa + cardápio (produtos + categorias + adicionais)
app.get('/api/mesa/:numero/info', (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (isNaN(numero)) return res.status(400).json({ error: "Número de mesa inválido" });
  const mesa = buscarMesaPorNumero(numero);
  if (!mesa) return res.status(404).json({ error: "Mesa não encontrada" });
  const produtos = listarProdutos(true);
  const cats = listarCategorias();
  const adds = listarAdicionais(true);
  const comanda = buscarComandaPorMesa(mesa.id);
  res.json({ mesa, produtos, categorias: cats, adicionais: adds, comanda });
});

// Pedido público via mesa (auto-abre comanda se não existir)
app.post('/api/mesa/:numero/pedido', (req, res) => {
  const numero = parseInt(req.params.numero, 10);
  if (isNaN(numero)) return res.status(400).json({ error: "Número de mesa inválido" });
  const mesa = buscarMesaPorNumero(numero);
  if (!mesa) return res.status(404).json({ error: "Mesa não encontrada" });

  const { itens, cliente_nome } = req.body;
  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Pedido deve ter ao menos um item" });
  }
  for (const item of itens) {
    if (!item.produto_nome || item.preco_unitario == null) {
      return res.status(400).json({ error: "Cada item precisa de produto_nome e preco_unitario" });
    }
  }

  try {
    let comanda = buscarComandaPorMesa(mesa.id);
    if (!comanda) {
      comanda = abrirComanda({ mesa_id: mesa.id, cliente_nome: cliente_nome || "Cliente QR", pessoas: 1 });
    }

    const itensAdicionados = [];
    for (const item of itens) {
      const added = adicionarItemComanda({
        comanda_id: comanda.id,
        produto_id: item.produto_id || null,
        produto_nome: item.produto_nome,
        quantidade: item.quantidade || 1,
        preco_unitario: item.preco_unitario,
        adicionais: item.adicionais || [],
        obs: item.obs || "",
        origem: "qr",
      });
      itensAdicionados.push(added);
    }

    const comandaAtualizada = buscarComanda(comanda.id);
    res.status(201).json({ comanda: comandaAtualizada, itens: itensAdicionados });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── SERVIR FRONTEND (SPA fallback para produção) ──────────────────────────

// Pasta do frontend buildado: configurável por env (o app desktop aponta para
// o build com base "/"). Default = ./dist relativo ao CWD (servidor web).
const distPath = process.env.FLUXO_DIST_PATH || join(process.cwd(), "dist");
const distIndex = join(distPath, "index.html");
if (fs.existsSync(distIndex)) {
  app.use(express.static(distPath));
  const indexHtml = fs.readFileSync(distIndex, "utf-8");
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.type("html").send(indexHtml);
    } else {
      next();
    }
  });
}

// ─── MOTOR DE SYNC DE PEDIDOS (cozinha simultânea) ──────────────────────────
// Quando a conexão remota está configurada (URL + token + enabled), faz pull/push
// de pedidos a cada 5s — cozinha simultânea entre duas instalações via HTTP.
// Mesma lógica do desktop/sync/motor.js, mas rodando inline no Express.
let syncPedidosCursor = { pull: "1970-01-01T00:00:00", push: "1970-01-01T00:00:00" };
let syncPedidosTimer = null;

function iniciarSyncPedidos() {
  if (syncPedidosTimer) clearInterval(syncPedidosTimer);
  syncPedidosTimer = null;

  const url = (obterConfig("sync_url") || "").replace(/\/+$/, "");
  const token = obterConfig("sync_token") || "";
  const enabled = obterConfig("sync_enabled") === "1";
  if (!url || !token || !enabled) return;

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function tick() {
    try {
      // PULL — baixa pedidos novos/alterados do remoto
      const pullUrl = `${url}/api/sync/pull?desde=${encodeURIComponent(syncPedidosCursor.pull)}`;
      const pullR = await fetch(pullUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (pullR.ok) {
        const { pedidos = [], cursor } = await pullR.json();
        for (const p of pedidos) upsertPedidoSync(p);
        if (cursor && cursor > syncPedidosCursor.pull) syncPedidosCursor.pull = cursor;
      }

      // PUSH — envia pedidos locais novos/alterados para o remoto
      const locais = pedidosAlteradosDesde(syncPedidosCursor.push);
      if (locais.length > 0) {
        const pushR = await fetch(`${url}/api/sync/push`, {
          method: "POST", headers, body: JSON.stringify({ pedidos: locais }),
          signal: AbortSignal.timeout(8000),
        });
        if (pushR.ok) {
          const novo = locais.reduce((m, p) => {
            const t = p.updated_at || p.created_at || "";
            return t > m ? t : m;
          }, syncPedidosCursor.push);
          if (novo > syncPedidosCursor.push) syncPedidosCursor.push = novo;
        }
      }
    } catch { /* offline — tenta de novo no próximo tick */ }
  }

  syncPedidosTimer = setInterval(tick, 5000);
  tick();
  console.log(`[sync-pedidos] iniciado → ${url}`);
}

// ─── MOTOR DE AUTO-SYNC DO CATÁLOGO ─────────────────────────────────────────
// Quando a conexão remota está configurada, empurra produtos/categorias/adicionais
// para o servidor online a cada 10 min (apenas mudanças detectadas por hash).
let syncCatalogoTimer = null;
let syncCatalogoHash = "";

function iniciarSyncCatalogo() {
  if (syncCatalogoTimer) clearInterval(syncCatalogoTimer);
  syncCatalogoTimer = null;

  const url = (obterConfig("sync_url") || "").replace(/\/+$/, "");
  const token = obterConfig("sync_token") || "";
  const enabled = obterConfig("sync_enabled") === "1";
  if (!url || !token || !enabled) return;

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function tick() {
    try {
      const produtos = listarProdutos();
      const categorias = listarCategorias();
      const adicionais = listarAdicionais();
      const hash = JSON.stringify({ p: produtos.length, c: categorias.length, a: adicionais.length,
        ids: produtos.map(p => `${p.id}:${p.updated_at || p.nome}`).sort().join(",") });
      if (hash === syncCatalogoHash) return;
      const r = await fetch(`${url}/api/sync/push-catalogo`, {
        method: "POST", headers,
        body: JSON.stringify({ produtos, categorias, adicionais }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        syncCatalogoHash = hash;
        salvarConfig("sync_last", new Date().toISOString());
        salvarConfig("sync_last_result", `${produtos.length} produtos, ${categorias.length} categorias, ${adicionais.length} adicionais`);
        console.log(`[sync-catalogo] push ok — ${produtos.length} prod, ${categorias.length} cat, ${adicionais.length} adic`);
      }
    } catch { /* offline — tenta de novo no próximo tick */ }
  }

  syncCatalogoTimer = setInterval(tick, 10 * 60_000);
  setTimeout(tick, 5000);
  console.log(`[sync-catalogo] iniciado → ${url} (a cada 10 min)`);
}

// Re-inicia os motores quando a config de sync muda
app.post("/api/sync/reiniciar", authMiddleware, adminOnly, (_req, res) => {
  iniciarSyncPedidos();
  iniciarSyncCatalogo();
  res.json({ ok: true });
});

// ─── START ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor API rodando em http://localhost:${PORT}`);
  if (fs.existsSync(distIndex)) {
    console.log(`Frontend servido em http://localhost:${PORT} (build de produção)`);
    console.log(`  → Cardápio:  http://localhost:${PORT}/`);
    console.log(`  → Admin:     http://localhost:${PORT}/admin`);
    console.log(`  → Caixa:     http://localhost:${PORT}/caixa`);
  } else {
    console.log(`Frontend: rode "npm run dev" ou "npm run build" para servir a interface`);
  }

  // Inicia sync automaticamente se configurado
  try { iniciarSyncPedidos(); } catch (e) { console.error("[sync-pedidos] falha ao iniciar:", e.message); }
  try { iniciarSyncCatalogo(); } catch (e) { console.error("[sync-catalogo] falha ao iniciar:", e.message); }
});