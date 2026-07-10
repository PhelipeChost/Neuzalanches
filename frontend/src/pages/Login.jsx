import { useState } from "react";
import { useAuth } from "../AuthContext";
import { s, cores } from "../styles";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro(""); setCarregando(true);
    try { await login(username, password); }
    catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      background: "radial-gradient(1000px 600px at 20% 10%, #0f2b1e 0%, #0a1712 50%, #050a08 100%)",
    }}>
      <div style={{
        width: 420, maxWidth: "94vw", padding: "40px 36px", borderRadius: 20,
        background: "rgba(20,32,26,0.75)", border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#fff" }}>Nexus PDV Mercado</div>
          <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>Ponto de venda · Reino Nexus Ideal</div>
        </div>
        <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ ...s.label, color: "#a8a29e" }}>Usuário</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus
              style={{ ...s.input, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#f5f5f4" }} />
          </div>
          <div>
            <label style={{ ...s.label, color: "#a8a29e" }}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ ...s.input, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#f5f5f4" }} />
          </div>
          {erro && (
            <div style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.35)", borderRadius: 9, padding: "9px 13px", fontSize: 12.5, color: "#fca5a5" }}>{erro}</div>
          )}
          <button type="submit" disabled={carregando} style={{ ...s.btn, padding: 13, marginTop: 4, opacity: carregando ? 0.7 : 1 }}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
