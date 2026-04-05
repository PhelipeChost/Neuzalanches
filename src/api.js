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
  if (res.status === 401) {
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
  login: (email, senha) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, senha }) }),
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
    atualizarStatus: (id, status) => request(`/pedidos/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    contarPendentes: () => request("/pedidos/pendentes/count"),
  },
};
