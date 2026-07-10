const _base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
const API = `${_base}/api`;

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erro na requisição");
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  registro: (data) => request("/auth/registro", { method: "POST", body: JSON.stringify(data) }),
  me: () => request("/auth/me"),

  // Lancamentos
  lancamentos: {
    listar: () => request("/lancamentos"),
    criar: (data) => request("/lancamentos", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/lancamentos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/lancamentos/${id}`, { method: "DELETE" }),
  },

  // Config
  config: {
    obter: () => request("/config"),
    salvar: (data) => request("/config", { method: "PUT", body: JSON.stringify(data) }),
    // Dados do estabelecimento (nome + whatsapp) — leitura pública, usado nas impressões
    estabelecimento: () => fetch(`${API}/config/estabelecimento`).then(r => r.json()),
  },

  // Bot WhatsApp — alerta em massa (clientes com pedido em andamento)
  whatsappBot: {
    status: () => request("/bot/status"),
    enviarAlerta: (mensagem) => request("/whatsapp/alerta", { method: "POST", body: JSON.stringify({ mensagem }) }),
  },

  // Fiscal / NFC-e (config + certificado A1)
  fiscal: {
    obter: () => request("/fiscal/config"),
    salvar: (data) => request("/fiscal/config", { method: "PUT", body: JSON.stringify(data) }),
    // dados: { nome_arquivo, pfx_base64, senha }
    enviarCertificado: (dados) => request("/fiscal/certificado", { method: "POST", body: JSON.stringify(dados) }),
    removerCertificado: () => request("/fiscal/certificado", { method: "DELETE" }),
    // NFC-e (motor de emissão — modo simulado por enquanto)
    emitirNFCe: (pedido_id, simulado = false) => request("/fiscal/nfce/emitir", { method: "POST", body: JSON.stringify({ pedido_id, simulado }) }),
    testarNFCe: () => request("/fiscal/nfce/teste", { method: "POST" }),
    listarNFCe: () => request("/fiscal/nfce"),
    // NFC-e ANTIGO — motor próprio (regras vigentes), emissão REAL direta na SEFAZ
    antigoStatus: () => request("/fiscal/antigo/status", { method: "POST" }),
    antigoEmitir: (pedido_id = null) => request("/fiscal/antigo/emitir", { method: "POST", body: JSON.stringify({ pedido_id }) }),
    antigoListar: () => request("/fiscal/antigo/nfce"),
    antigoXml: (id) => request(`/fiscal/antigo/nfce/${id}/xml`),
  },

  // Perfil / Setup do estabelecimento
  perfil: {
    obter: () => request("/perfil"),
    salvar: (data) => request("/perfil", { method: "PUT", body: JSON.stringify(data) }),
  },

  // Sessão de caixa (abrir/fechar/sangria/suprimento)
  caixa: {
    sessao: () => request("/caixa/sessao"),
    abrir: (saldo_inicial) => request("/caixa/abrir", { method: "POST", body: JSON.stringify({ saldo_inicial }) }),
    sangria: (valor, obs) => request("/caixa/sangria", { method: "POST", body: JSON.stringify({ valor, obs }) }),
    suprimento: (valor, obs) => request("/caixa/suprimento", { method: "POST", body: JSON.stringify({ valor, obs }) }),
    fechar: (saldo_informado) => request("/caixa/fechar", { method: "POST", body: JSON.stringify({ saldo_informado }) }),
    movimentos: () => request("/caixa/movimentos"),
  },

  // Cardápios
  cardapios: {
    listar: () => request("/cardapios"),
    criar: (data) => request("/cardapios", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/cardapios/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/cardapios/${id}`, { method: "DELETE" }),
    definirCategorias: (id, categorias) => request(`/cardapios/${id}/categorias`, { method: "PUT", body: JSON.stringify({ categorias }) }),
    definirAdicionais: (id, adicionais) => request(`/cardapios/${id}/adicionais`, { method: "PUT", body: JSON.stringify({ adicionais }) }),
  },

  // Categorias
  categorias: {
    listar: (opts = {}) => {
      const q = opts.cardapio_id ? `?cardapio_id=${encodeURIComponent(opts.cardapio_id)}` : "";
      return request(`/categorias${q}`);
    },
    criar: (data) => request("/categorias", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/categorias/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    reordenar: (ids) => request("/categorias/reordenar", { method: "PUT", body: JSON.stringify({ ids }) }),
    excluir: (id) => request(`/categorias/${id}`, { method: "DELETE" }),
  },

  // Adicionais
  adicionais: {
    listar: (opts = {}) => {
      const q = opts.cardapio_id ? `?cardapio_id=${encodeURIComponent(opts.cardapio_id)}` : "";
      return request(`/adicionais${q}`);
    },
    criar: (data) => request("/adicionais", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/adicionais/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/adicionais/${id}`, { method: "DELETE" }),
  },

  // Produtos
  produtos: {
    listar: () => request("/produtos"),
    criar: (data) => request("/produtos", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/produtos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/produtos/${id}`, { method: "DELETE" }),
    imagens: {
      listar: (id) => request(`/produtos/${id}/imagens`),
      adicionar: (id, imagem, ordem) => request(`/produtos/${id}/imagens`, { method: "POST", body: JSON.stringify({ imagem, ordem }) }),
      remover: (produtoId, imagemId) => request(`/produtos/${produtoId}/imagens/${imagemId}`, { method: "DELETE" }),
      reordenar: (id, ids) => request(`/produtos/${id}/imagens/reordenar`, { method: "PUT", body: JSON.stringify({ ids }) }),
    },
  },

  // Funcionários admin (acesso ao painel)
  adminEmails: {
    listar: () => request("/admin-emails"),
    // dados: { email, nome?, senha?, setores? }
    adicionar: (dados) => request("/admin-emails", { method: "POST",
      body: JSON.stringify(typeof dados === "string" ? { email: dados } : dados) }),
    atualizar: (email, dados) => request(`/admin-emails/${encodeURIComponent(email)}`, { method: "PUT", body: JSON.stringify(dados) }),
    remover: (email) => request(`/admin-emails/${encodeURIComponent(email)}`, { method: "DELETE" }),
  },

  // Funcionários e permissões (adapter sobre /admin-emails — o card usa
  // "funcoes", o servidor chama de "setores"; o email faz papel de id)
  funcionarios: {
    listar: () => request("/admin-emails").then(rows => rows.map(r => ({
      id: r.email,
      nome: r.nome || r.email,
      email: r.email,
      funcoes: r.setores,          // null = acesso completo
      tem_senha: r.tem_senha,
    }))),
    criar: ({ nome, email, senha, funcoes }) =>
      request("/admin-emails", { method: "POST", body: JSON.stringify({ email, nome, senha, setores: funcoes }) }),
    atualizar: (email, { nome, senha, funcoes }) =>
      request(`/admin-emails/${encodeURIComponent(email)}`, { method: "PUT", body: JSON.stringify({ nome, senha, setores: funcoes }) }),
    excluir: (email) => request(`/admin-emails/${encodeURIComponent(email)}`, { method: "DELETE" }),
  },

  // Pedidos
  pedidos: {
    listar: () => request("/pedidos"),
    buscar: (id) => request(`/pedidos/${id}`),
    criar: (data) => request("/pedidos", { method: "POST", body: JSON.stringify(data) }),
    criarPublico: (data) => request("/pedidos/publico", { method: "POST", body: JSON.stringify(data) }),
    atualizarStatus: (id, status) => request(`/pedidos/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    excluir: (id) => request(`/pedidos/${id}`, { method: "DELETE" }),
    contarPendentes: () => request("/pedidos/pendentes/count"),
    // Listagem pública pelo telefone (read-only para "Meus Pedidos" do cliente)
    meusPedidos: (telefone) => fetch(`${API}/pedidos/publico/cliente/${encodeURIComponent(String(telefone).replace(/\D/g, ""))}`).then(r => {
      if (!r.ok) throw new Error("Erro ao buscar pedidos");
      return r.json();
    }),
  },

  // Enderecos
  enderecos: {
    listar: () => request("/enderecos"),
    criar: (data) => request("/enderecos", { method: "POST", body: JSON.stringify(data) }),
    excluir: (id) => request(`/enderecos/${id}`, { method: "DELETE" }),
  },

  // CEP
  buscarCep: (cep) => request(`/cep/${cep.replace(/\D/g, "")}`),

  // PIX config
  pix: {
    obter: () => request("/config/pix"),
    salvar: (data) => request("/config/pix", { method: "PUT", body: JSON.stringify(data) }),
  },

  // Login opcional (PDV desktop)
  loginStatus: () => fetch(`${API}/config/login-status`).then(r => r.json()),
  loginConfig: (ativo) => request("/config/login", { method: "PUT", body: JSON.stringify({ ativo }) }),

  // Sync / Conexão remota
  sync: {
    config: () => request("/config/sync"),
    salvar: (data) => request("/config/sync", { method: "PUT", body: JSON.stringify(data) }),
    testar: () => request("/sync/test", { method: "POST" }),
    enviarProdutos: () => request("/sync/produtos", { method: "POST" }),
    meuToken: () => request("/config/sync-token"),
    regenerarMeuToken: () => request("/config/sync-token/regenerar", { method: "POST" }),
  },

  // Horário de funcionamento
  horario: {
    obter: () => fetch(`${API}/config/horario`).then(r => r.json()),
    salvar: (data) => request("/config/horario", { method: "PUT", body: JSON.stringify(data) }),
  },

  // Custos Fixos Mensais (com suporte a tipo variável: diaria × qtd)
  custosFixos: {
    listar: () => request("/custos-fixos"),
    criar: (data) => request("/custos-fixos", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/custos-fixos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/custos-fixos/${id}`, { method: "DELETE" }),
    gerar: (mes) => request(`/custos-fixos/gerar/${mes}`, { method: "POST" }),
  },

  // Categorias do financeiro (separadas das categorias de produto)
  categoriasFinanceiro: {
    listar: () => request("/categorias-financeiro"),
    criar: (data) => request("/categorias-financeiro", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/categorias-financeiro/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/categorias-financeiro/${id}`, { method: "DELETE" }),
  },

  // Empréstimo inteligente: gera entrada + N parcelas previstas
  emprestimo: {
    criar: (data) => request("/lancamentos/emprestimo", { method: "POST", body: JSON.stringify(data) }),
  },

  // Insumos (ficha técnica)
  insumos: {
    listar: () => request("/insumos"),
    criar: (data) => request("/insumos", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/insumos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/insumos/${id}`, { method: "DELETE" }),
  },

  // Composição de produto (ficha técnica por produto)
  composicao: {
    listar: (produtoId) => request(`/produtos/${produtoId}/composicao`),
    salvar: (produtoId, itens) => request(`/produtos/${produtoId}/composicao`, { method: "PUT", body: JSON.stringify({ itens }) }),
  },

  // Estoque
  estoque: {
    dashboard: () => request("/estoque/dashboard"),
    categorias: {
      listar: () => request("/estoque/categorias"),
      criar: (data) => request("/estoque/categorias", { method: "POST", body: JSON.stringify(data) }),
      excluir: (id) => request(`/estoque/categorias/${id}`, { method: "DELETE" }),
    },
    fornecedores: {
      listar: () => request("/estoque/fornecedores"),
      criar: (data) => request("/estoque/fornecedores", { method: "POST", body: JSON.stringify(data) }),
      atualizar: (id, data) => request(`/estoque/fornecedores/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      excluir: (id) => request(`/estoque/fornecedores/${id}`, { method: "DELETE" }),
    },
    itens: {
      listar: () => request("/estoque/itens"),
      buscar: (id) => request(`/estoque/itens/${id}`),
      criar: (data) => request("/estoque/itens", { method: "POST", body: JSON.stringify(data) }),
      atualizar: (id, data) => request(`/estoque/itens/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      excluir: (id) => request(`/estoque/itens/${id}`, { method: "DELETE" }),
    },
    entradas: {
      listar: (itemId) => request(`/estoque/entradas${itemId ? `?item_id=${itemId}` : ""}`),
      registrar: (data) => request("/estoque/entradas", { method: "POST", body: JSON.stringify(data) }),
      lote: (entradas) => request("/estoque/entradas/lote", { method: "POST", body: JSON.stringify({ entradas }) }),
    },
    saidas: {
      listar: (itemId) => request(`/estoque/saidas${itemId ? `?item_id=${itemId}` : ""}`),
      registrar: (data) => request("/estoque/saidas", { method: "POST", body: JSON.stringify(data) }),
    },
    ajustes: {
      listar: (itemId) => request(`/estoque/ajustes${itemId ? `?item_id=${itemId}` : ""}`),
      registrar: (data) => request("/estoque/ajustes", { method: "POST", body: JSON.stringify(data) }),
    },
  },

  // Promoções
  promocoes: {
    listar:   () => request("/promocoes"),                       // admin: todas
    ativas:   () => request("/promocoes/ativas"),                // público: vigentes agora
    criar:    (data) => request("/promocoes", { method: "POST", body: JSON.stringify(data) }),
    atualizar:(id, data) => request(`/promocoes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir:  (id) => request(`/produtos/${id}`, { method: "DELETE" }),  // reaproveita
  },

  // Frente de Caixa — Mesas
  mesas: {
    listar: () => request("/mesas"),
    criar: (data) => request("/mesas", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/mesas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/mesas/${id}`, { method: "DELETE" }),
    pedirConta: (id) => request(`/mesas/${id}/pedir-conta`, { method: "POST" }),
  },

  // Frente de Caixa — Comandas
  comandas: {
    abrir: (data) => request("/comandas", { method: "POST", body: JSON.stringify(data) }),
    buscar: (id) => request(`/comandas/${id}`),
    porMesa: (mesaId) => request(`/comandas/mesa/${mesaId}`),
    fechar: (id) => request(`/comandas/${id}/fechar`, { method: "POST" }),
    cancelar: (id) => request(`/comandas/${id}/cancelar`, { method: "POST" }),
    itens: {
      listar: (comandaId) => request(`/comandas/${comandaId}/itens`),
      adicionar: (comandaId, data) => request(`/comandas/${comandaId}/itens`, { method: "POST", body: JSON.stringify(data) }),
      atualizarStatus: (itemId, status) => request(`/comanda-itens/${itemId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
      remover: (itemId) => request(`/comanda-itens/${itemId}`, { method: "DELETE" }),
    },
  },

  // Frente de Caixa — Cozinha & Stats
  cozinha: {
    fila: () => request("/cozinha/fila"),
    filaUnificada: () => request("/cozinha/fila-unificada"),
    atualizarStatus: (grupo_id, status) => request("/cozinha/atualizar-status", { method: "POST", body: JSON.stringify({ grupo_id, status }) }),
  },
  caixaStats: () => request("/caixa/stats"),

  // Mesa pública (QR code — sem auth)
  mesaPublica: {
    info: (numero) => fetch(`${API}/mesa/${numero}/info`).then(r => { if (!r.ok) throw new Error("Mesa não encontrada"); return r.json(); }),
    pedido: (numero, data) => fetch(`${API}/mesa/${numero}/pedido`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.error || "Erro ao enviar pedido"); }); return r.json(); }),
  },

  // Lixeira
  lixeira: {
    listar: () => request("/lixeira"),
    restaurar: (tipo, id) => request(`/lixeira/${tipo}/${id}/restaurar`, { method: "POST" }),
    excluirDefinitivo: (tipo, id) => request(`/lixeira/${tipo}/${id}`, { method: "DELETE" }),
  },

  // T10 — analytics do cardápio
  cardapio: {
    registrarVisita: () => fetch(`${API}/public/visita`, { method: "POST" }).catch(() => {}),
    stats: () => request("/cardapio/stats"),
  },

  // Relatórios — ranking de vendas (produtos e adicionais)
  relatorios: {
    ranking: () => request("/relatorios/ranking"),
  },
};
