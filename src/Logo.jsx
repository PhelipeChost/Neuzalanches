// Componente único para logo do estabelecimento.
// Prioriza a logo salva na config (base64) → fallback pra placeholder Nexus.
// Usado em vez de <img src="/logo.png"> (que era a logo antiga da Neuza).
import { useEffect, useState } from "react";
import { BRAND } from "./brand";
import { API_URL } from "./api";

let cacheSrc = null;
let inflight = null;

async function carregar() {
  if (cacheSrc !== null) return cacheSrc;
  if (inflight) return inflight;
  inflight = fetch(`${API_URL}/config/estabelecimento`)
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
  // Fallback da marca (enquanto o cliente não sobe a logo dele). Com emblema
  // definido (ex.: peixaria), usa o emoji no gradiente da marca; senão cai no
  // "N" verde do Nexus PDV.
  if (BRAND?.emblema) {
    const p = BRAND.tema.light;
    return (
      <div style={{
        ...base,
        background: `linear-gradient(135deg, ${p.dark} 0%, ${p.brand} 140%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.5), userSelect: "none",
      }} aria-label={alt}>{BRAND.emblema}</div>
    );
  }
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
