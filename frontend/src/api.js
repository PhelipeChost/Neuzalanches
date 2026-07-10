// ─── Cliente da API do Mercado ───────────────────────────────────────────────
const BASE = "/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("mercado_token");
  const resp = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (resp.status === 401) {
    localStorage.removeItem("mercado_token");
    localStorage.removeItem("mercado_user");
    if (!path.startsWith("/auth")) window.location.reload();
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

export const api = {
  login: (username, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request("/auth/me"),

  users: {
    listar: () => request("/users"),
    criar: (d) => request("/users", { method: "POST", body: JSON.stringify(d) }),
    atualizar: (id, d) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    excluir: (id) => request(`/users/${id}`, { method: "DELETE" }),
  },

  products: {
    listar: (params = "") => request(`/products${params}`),
    categorias: () => request("/products/categories"),
    porBarcode: (code) => request(`/products/barcode/${encodeURIComponent(code)}`),
    criar: (d) => request("/products", { method: "POST", body: JSON.stringify(d) }),
    atualizar: (id, d) => request(`/products/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    excluir: (id) => request(`/products/${id}`, { method: "DELETE" }),
  },

  suppliers: {
    listar: () => request("/suppliers"),
    criar: (d) => request("/suppliers", { method: "POST", body: JSON.stringify(d) }),
    atualizar: (id, d) => request(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    excluir: (id) => request(`/suppliers/${id}`, { method: "DELETE" }),
  },

  cash: {
    atual: () => request("/cash/current"),
    abrir: (opening_amount) => request("/cash/open", { method: "POST", body: JSON.stringify({ opening_amount }) }),
    fechar: (counted, notes) => request("/cash/close", { method: "POST", body: JSON.stringify({ counted, notes }) }),
    historico: () => request("/cash/history"),
  },

  sales: {
    criar: (d) => request("/sales", { method: "POST", body: JSON.stringify(d) }),
    listar: (params = "") => request(`/sales${params}`),
    cancelar: (id, reason) => request(`/sales/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  },

  returns: {
    criar: (d) => request("/returns", { method: "POST", body: JSON.stringify(d) }),
    listar: () => request("/returns"),
  },

  stock: {
    entrada: (d) => request("/stock/entry", { method: "POST", body: JSON.stringify(d) }),
    ajuste: (d) => request("/stock/adjust", { method: "POST", body: JSON.stringify(d) }),
    movimentos: (params = "") => request(`/stock/movements${params}`),
  },

  inventory: {
    atual: () => request("/inventory/current"),
    abrir: (notes) => request("/inventory/open", { method: "POST", body: JSON.stringify({ notes }) }),
    contar: (id, product_id, counted_qty) => request(`/inventory/${id}/count`, { method: "POST", body: JSON.stringify({ product_id, counted_qty }) }),
    finalizar: (id) => request(`/inventory/${id}/finish`, { method: "POST" }),
    cancelar: (id) => request(`/inventory/${id}/cancel`, { method: "POST" }),
  },

  expenses: {
    listar: () => request("/expenses"),
    criar: (d) => request("/expenses", { method: "POST", body: JSON.stringify(d) }),
    pagar: (id) => request(`/expenses/${id}/pay`, { method: "POST" }),
    excluir: (id) => request(`/expenses/${id}`, { method: "DELETE" }),
  },

  dashboard: () => request("/dashboard"),

  finance: {
    resumo: (from, to) => request(`/finance/summary?from=${from}&to=${to}`),
    abc: (from, to) => request(`/finance/abc?from=${from}&to=${to}`),
  },

  print: {
    impressoras: () => request("/print/printers"),
    cupom: (saleId) => request(`/print/receipt/${saleId}`, { method: "POST" }),
  },

  settings: {
    obter: () => request("/settings"),
    salvar: (d) => request("/settings", { method: "PUT", body: JSON.stringify(d) }),
  },
};
