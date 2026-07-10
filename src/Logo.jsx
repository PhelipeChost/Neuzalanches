// Componente único para logo do estabelecimento.
// Prioriza a logo salva na config (base64) → fallback pra placeholder Nexus.
// Usado em vez de <img src="/logo.png"> (que era a logo antiga da Neuza).
import { useEffect, useState } from "react";

let cacheSrc = null;
let inflight = null;

async function carregar() {
  if (cacheSrc !== null) return cacheSrc;
  if (inflight) return inflight;
  inflight = fetch("/api/config/estabelecimento")
    .then(r => r.ok ? r.json() : {})
    .then(e => { cacheSrc = (e && e.logo) ? String(e.logo) : ""; return cacheSrc; })
    .catch(() => { cacheSrc = ""; return ""; })
    .finally(() => { inflight = null; });
  return inflight;
}

export function limparCacheLogo() { cacheSrc = null; }

export default function Logo({ size = 64, style = {}, alt = "Logo", radius = "50%" }) {
  const [src, setSrc] = useState(cacheSrc);
  useEffect(() => { carregar().then(s => setSrc(s)); }, []);

  const base = {
    width: size, height: size, borderRadius: radius,
    objectFit: "cover", flexShrink: 0,
    ...style,
  };

  if (src) {
    return <img src={src} alt={alt} style={base} onError={e => { e.currentTarget.style.display = "none"; }} />;
  }
  // Placeholder Nexus PDV: círculo verde escuro com "N" branco
  return (
    <div style={{
      ...base,
      background: "linear-gradient(135deg, #15803d 0%, #14532d 100%)",
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', sans-serif", fontWeight: 800,
      fontSize: Math.round(size * 0.42),
      letterSpacing: -1,
      userSelect: "none",
    }} aria-label={alt}>N</div>
  );
}
