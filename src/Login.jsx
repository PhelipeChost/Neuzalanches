import { useState } from "react";
import { api } from "./api";

const lbl = { display: "block", fontSize: 11, color: "#78716c", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 5 };
const inp = { width: "100%", padding: "10px 14px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: "none", color: "#1c1917", background: "#fff" };

function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ModalAuth({ onLogin, onClose, defaultMode = "registro" }) {
  const [modo, setModo] = useState(defaultMode);
  const [form, setForm] = useState({ nome: "", telefone: "", senha: "", email: "" });
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      let result;
      if (modo === "login") {
        const tel = form.telefone.replace(/\D/g, "");
        const loginData = tel ? { telefone: tel, senha: form.senha } : { email: form.email, senha: form.senha };
        result = await api.login(loginData);
      } else {
        if (!form.nome) { setErro("Nome é obrigatório"); setCarregando(false); return; }
        const tel = form.telefone.replace(/\D/g, "");
        if (!tel || tel.length < 10) { setErro("Telefone válido é obrigatório"); setCarregando(false); return; }
        result = await api.registro({
          nome: form.nome,
          telefone: tel,
          senha: form.senha,
          email: form.email || undefined,
        });
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px 30px", width: 420, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", position: "relative" }} onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#a8a29e", lineHeight: 1 }}>x</button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/logo.png" alt="NeuzaLanches" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700 }}>
            {modo === "login" ? "Entrar na conta" : "Crie sua conta"}
          </div>
          <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 2 }}>
            {modo === "login" ? "Acesse com seu telefone ou email" : "Para adicionar itens ao carrinho"}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f5f5f4", borderRadius: 8, padding: 3 }}>
          {[["registro", "Criar conta"], ["login", "Ja tenho conta"]].map(([k, v]) => (
            <button key={k} onClick={() => { setModo(k); setErro(""); }}
              style={{ flex: 1, padding: "8px", border: "none", borderRadius: 6, background: modo === k ? "#fff" : "transparent", color: modo === k ? "#15803d" : "#78716c", fontWeight: modo === k ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: modo === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              {v}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {modo === "registro" && (
            <div>
              <label style={lbl}>NOME COMPLETO *</label>
              <input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome completo" required />
            </div>
          )}

          <div>
            <label style={lbl}>{modo === "registro" ? "TELEFONE *" : "TELEFONE"}</label>
            <input
              style={inp}
              type="tel"
              value={form.telefone}
              onChange={e => setForm({ ...form, telefone: formatPhone(e.target.value) })}
              placeholder="(92) 99999-0000"
              required={modo === "registro"}
            />
          </div>

          {modo === "login" && (
            <div>
              <label style={lbl}>EMAIL</label>
              <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ou use seu email" />
              <div style={{ fontSize: 10, color: "#a8a29e", marginTop: 4 }}>Use telefone ou email para entrar</div>
            </div>
          )}

          {modo === "registro" && (
            <div>
              <label style={lbl}>EMAIL (OPCIONAL)</label>
              <input style={inp} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" />
            </div>
          )}

          <div>
            <label style={lbl}>SENHA *</label>
            <input style={inp} type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="••••••••" required minLength={4} />
          </div>

          {erro && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626" }}>
              {erro}
            </div>
          )}

          <button type="submit" disabled={carregando}
            style={{ padding: 12, background: "#F38C24", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: carregando ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", color: "#fff", marginTop: 4, opacity: carregando ? 0.7 : 1, transition: "opacity 0.15s" }}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
