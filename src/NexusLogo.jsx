// Logo da Nexus (SVG inline) — usada na tela de login do PDV e como avatar
// da conta admin irremovível ([[reinonexusideal@gmail.com]]) na sidebar.
// Fica embutida no bundle, sem depender de arquivo externo.
export default function NexusLogo({ size = 72, style = {}, title = "Nexus" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="nxLogoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="55%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#052e16" />
        </linearGradient>
        <linearGradient id="nxLogoStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bbf7d0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#nxLogoBg)" />
      {/* Halo interno */}
      <rect x="10" y="10" width="80" height="80" rx="18" fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
      {/* N estilizado */}
      <path
        d="M30 74 V26 L70 74 V26"
        fill="none"
        stroke="url(#nxLogoStroke)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Ponto/asterisco Nexus (referência à identidade "estrela nascente") */}
      <circle cx="70" cy="26" r="3.8" fill="#f59e0b" />
    </svg>
  );
}
