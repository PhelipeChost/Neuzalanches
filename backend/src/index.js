// ─── Nexus PDV Mercado — servidor ────────────────────────────────────────────
// PORT (default 3002) e DB_PATH (default ./data/mercado.db) via env.
// CORS_ORIGINS: lista separada por vírgula (credentials: true).
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { abrirBanco } from "./db.js";
import { criarSchema, seedInicial } from "./schema.js";
import { criarRotas } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3002;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "mercado.db");

const db = await abrirBanco(DB_PATH);
criarSchema(db);
seedInicial(db);

const app = express();
app.use(express.json({ limit: "5mb" }));

const origins = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins, credentials: true } : { origin: true, credentials: true }));

app.get("/api/health", (req, res) => res.json({ ok: true, app: "nexus-mercado", uptime: process.uptime() }));
app.use("/api", criarRotas(db));

// Serve o frontend buildado (produção): frontend/dist ou FRONTEND_DIST via env
const distPath = process.env.FRONTEND_DIST || path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// erro central: nunca derruba o processo por causa de uma rota
app.use((err, req, res, next) => {
  console.error("[mercado] erro:", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`[mercado] Nexus PDV Mercado rodando em http://localhost:${PORT}`);
  console.log(`[mercado] banco: ${DB_PATH}`);
});
