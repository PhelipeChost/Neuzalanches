// ─── Autenticação JWT + permissões por página ────────────────────────────────
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "nexus-mercado-dev-secret";
const EXPIRA = "12h";

export function gerarToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      username: user.username,
      is_admin: !!user.is_admin,
      permissions: JSON.parse(user.permissions || "[]"),
    },
    JWT_SECRET,
    { expiresIn: EXPIRA }
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Sessão expirada — faça login novamente" });
  }
}

export function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Apenas administradores" });
  next();
}

// exige que o usuário tenha a página liberada (admins passam sempre)
export function requerPermissao(pagina) {
  return (req, res, next) => {
    if (req.user?.is_admin) return next();
    const perms = req.user?.permissions || [];
    if (!perms.includes(pagina)) return res.status(403).json({ error: `Sem permissão: ${pagina}` });
    next();
  };
}
