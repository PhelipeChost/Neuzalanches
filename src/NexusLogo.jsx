// Logo da Nexus (PNG oficial — livro com gráfico de crescimento) — usada na
// tela de login do PDV e como avatar da conta admin irremovível
// (reinonexusideal@gmail.com) na sidebar. Empacotada no bundle via Vite.
import logoNexus from "./assets/nexus-logo.png";

export default function NexusLogo({ size = 72, style = {}, title = "Nexus", radius = null }) {
  return (
    <img
      src={logoNexus}
      alt={title}
      width={size}
      height={size}
      style={{
        display: "block",
        flexShrink: 0,
        objectFit: "cover",
        // O PNG tem fundo escuro sólido — cantos arredondados pra parecer app icon
        borderRadius: radius != null ? radius : Math.round(size * 0.24),
        ...style,
      }}
    />
  );
}
