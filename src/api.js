const API = "/api";

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
  },

  // Categorias
  categorias: {
    listar: () => request("/categorias"),
    criar: (data) => request("/categorias", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/categorias/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    reordenar: (ids) => request("/categorias/reordenar", { method: "PUT", body: JSON.stringify({ ids }) }),
    excluir: (id) => request(`/categorias/${id}`, { method: "DELETE" }),
  },

  // Adicionais
  adicionais: {
    listar: () => request("/adicionais"),
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

  // Admin emails (convites)
  adminEmails: {
    listar: () => request("/admin-emails"),
    adicionar: (email) => request("/admin-emails", { method: "POST", body: JSON.stringify({ email }) }),
    remover: (email) => request(`/admin-emails/${encodeURIComponent(email)}`, { method: "DELETE" }),
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
    meusPedidos: (telefone) => fetch(`/api/pedidos/publico/cliente/${encodeURIComponent(String(telefone).replace(/\D/g, ""))}`).then(r => {
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

  // Horário de funcionamento
  horario: {
    obter: () => fetch("/api/config/horario").then(r => r.json()),
    salvar: (data) => request("/config/horario", { method: "PUT", body: JSON.stringify(data) }),
  },

  // Custos Fixos Mensais
  custosFixos: {
    listar: () => request("/custos-fixos"),
    criar: (data) => request("/custos-fixos", { method: "POST", body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/custos-fixos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    excluir: (id) => request(`/custos-fixos/${id}`, { method: "DELETE" }),
    gerar: (mes) => request(`/custos-fixos/gerar/${mes}`, { method: "POST" }),
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
    info: (numero) => fetch(`/api/mesa/${numero}/info`).then(r => { if (!r.ok) throw new Error("Mesa não encontrada"); return r.json(); }),
    pedido: (numero, data) => fetch(`/api/mesa/${numero}/pedido`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.error || "Erro ao enviar pedido"); }); return r.json(); }),
  },

  // Lixeira
  lixeira: {
    listar: () => request("/lixeira"),
    restaurar: (tipo, id) => request(`/lixeira/${tipo}/${id}/restaurar`, { method: "POST" }),
    excluirDefinitivo: (tipo, id) => request(`/lixeira/${tipo}/${id}`, { method: "DELETE" }),
  },
};
