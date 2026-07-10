// ─── Contexto de autenticação ────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const salvo = localStorage.getItem("mercado_user");
    const token = localStorage.getItem("mercado_token");
    if (!salvo || !token) { setLoading(false); return; }
    setUser(JSON.parse(salvo));
    // valida o token em background (expirado → request faz logout + reload)
    api.me().then(u => setUser(u)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const r = await api.login(username, password);
    localStorage.setItem("mercado_token", r.token);
    localStorage.setItem("mercado_user", JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  };

  const logout = () => {
    localStorage.removeItem("mercado_token");
    localStorage.removeItem("mercado_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
