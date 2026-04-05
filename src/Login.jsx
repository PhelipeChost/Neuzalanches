import { useState } from "react";
import { api } from "./api";

const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "10px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

export default function Login({ onLogin }) {
  const [modo, setModo] = useState("login"); // login | registro
  const [form, setForm] = useState({ nome: "", email: "", senha: "", telefone: "", tipo: "cliente" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      let result;
      if (modo === "login") {
        result = await api.login(form.email, form.senha);
      } else {
        if (!form.nome) { setErro("Nome é obrigatório"); setCarregando(false); return; }
        result = await api.registro({ nome: form.nome, email: form.email, senha: form.senha, telefone: form.telefone });
      }
      localStorage.setItem("token", result.token);
      localStorage.setItem("usuario", JSON.stringify(result.usuario));
      onLogin(result.usuario, result.token);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f5f5f4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,500;0,600;1,300&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      <div style={{ background: "#fff", borderRadius: 16, padding: "36px 34px", width: 420, border: "1px solid #e7e5e4", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, background: "#15803d", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <span style={{ color: "#fff", fontSize: 22 }}>$</span>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600 }}>Fluxo de Caixa</div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4 }}>
            {modo === "login" ? "Acesse sua conta" : "Crie sua conta"}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f5f5f4", borderRadius: 8, padding: 3 }}>
          {[["login", "Entrar"], ["registro", "Criar conta"]].map(([k, v]) => (
            <button key={k} onClick={() => { setModo(k); setErro(""); }}
              style={{ flex: 1, padding: "8px", border: "none", borderRadius: 6, background: modo === k ? "#fff" : "transparent", color: modo === k ? "#15803d" : "#78716c", fontWeight: modo === k ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: modo === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              {v}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {modo === "registro" && (
            <>
              <div>
                <label style={lbl}>Nome</label>
                <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome completo" required />
              </div>
              <div>
                <label style={lbl}>Telefone (opcional)</label>
                <input style={inp} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 99999-0000" />
              </div>
            </>
          )}

          <div>
            <label style={lbl}>Email</label>
            <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" required />
          </div>
          <div>
            <label style={lbl}>Senha</label>
            <input style={inp} type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="••••••••" required minLength={4} />
          </div>

          {erro && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>
              {erro}
            </div>
          )}

          <button type="submit" disabled={carregando}
            style={{ padding: 12, background: "#15803d", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: carregando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", marginTop: 4, opacity: carregando ? 0.7 : 1, transition: "opacity 0.15s" }}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
