// Simula o cardápio digital online localmente (bundle VITE_ONLINE=1). Só para testes.
import { fileURLToPath } from "url";
process.env.PORT = "5512";
process.env.JWT_SECRET = "test-onl";
process.env.NODE_ENV = "production";
process.env.FLUXO_DB_PATH = "C:/Users/Felipe/AppData/Local/Temp/claude/C--Users-Felipe-Desktop-NEXO-Clientes-FRENTE-DE-CAIXA---PROT-TIPO/d6b77edf-836a-4a68-bd65-24406a34a59e/scratchpad/testdb/onl.db";
process.env.FLUXO_DIST_PATH = fileURLToPath(new URL("./dist-online-test", import.meta.url));
await import("./server/index.js");
