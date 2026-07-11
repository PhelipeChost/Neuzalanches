// Simula o PDV desktop localmente (NEXUS_DESKTOP=1 + bundle desktop). Só para testes.
import { fileURLToPath } from "url";
process.env.PORT = "5511";
process.env.NEXUS_DESKTOP = "1";
process.env.JWT_SECRET = "test-desk";
process.env.NODE_ENV = "production";
process.env.FLUXO_DB_PATH = "C:/Users/Felipe/AppData/Local/Temp/claude/C--Users-Felipe-Desktop-NEXO-Clientes-FRENTE-DE-CAIXA---PROT-TIPO/d6b77edf-836a-4a68-bd65-24406a34a59e/scratchpad/testdb/desk.db";
process.env.FLUXO_DIST_PATH = fileURLToPath(new URL("./desktop/app-dist", import.meta.url));
process.env.MERCADO_URL = "http://localhost:3202"; // PDV Mercado do dev (launch.json)
await import("./server/index.js");
