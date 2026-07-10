// ─── Wrapper de banco: sql.js (SQLite via WASM) ──────────────────────────────
// Zero dependência nativa (nada de node-gyp / prebuild / ABI do Electron).
// Expõe uma API no estilo better-sqlite3:
//   db.prepare(sql).get(...p) / .all(...p) / .run(...p)
//   db.exec(sql)             — múltiplos statements
//   db.transaction(fn)       — retorna função; BEGIN/COMMIT/ROLLBACK + save síncrono
//   db.pragma(str)
// Persistência: grava o arquivo .db no disco com debounce (~100ms) a cada
// escrita; após transactions o save é síncrono (garante durabilidade).
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export async function abrirBanco(dbPath) {
  const SQL = await initSqlJs({
    // resolve o sql-wasm.wasm de dentro do pacote (funciona empacotado no Electron)
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const existente = fs.existsSync(dbPath) ? new Uint8Array(fs.readFileSync(dbPath)) : null;
  const sqldb = existente ? new SQL.Database(existente) : new SQL.Database();

  let saveTimer = null;
  let emTransacao = false;

  function saveSync() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const data = Buffer.from(sqldb.export());
    // grava em arquivo temporário e renomeia — nunca deixa um .db pela metade
    const tmp = dbPath + ".tmp";
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, dbPath);
  }

  function agendarSave() {
    if (emTransacao) return; // transaction faz save síncrono no commit
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSync, 100);
  }

  function bindParams(stmt, params) {
    if (params.length === 1 && params[0] !== null && typeof params[0] === "object" && !Array.isArray(params[0])) {
      // parâmetros nomeados: prepare("... @nome").run({ nome: 1 })
      const obj = {};
      for (const [k, v] of Object.entries(params[0])) obj["@" + k] = v ?? null;
      stmt.bind(obj);
    } else if (params.length > 0) {
      stmt.bind(params.map(p => p ?? null));
    }
  }

  const db = {
    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqldb.prepare(sql);
          try {
            bindParams(stmt, params);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally { stmt.free(); }
        },
        all(...params) {
          const stmt = sqldb.prepare(sql);
          try {
            bindParams(stmt, params);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally { stmt.free(); }
        },
        run(...params) {
          const stmt = sqldb.prepare(sql);
          try {
            bindParams(stmt, params);
            stmt.step();
          } finally { stmt.free(); }
          const changes = sqldb.getRowsModified();
          agendarSave();
          return { changes };
        },
      };
    },

    exec(sql) {
      sqldb.exec(sql);
      agendarSave();
    },

    pragma(str) {
      sqldb.exec(`PRAGMA ${str};`);
    },

    transaction(fn) {
      return (...args) => {
        if (emTransacao) return fn(...args); // transação aninhada: reaproveita a externa
        emTransacao = true;
        sqldb.exec("BEGIN");
        try {
          const resultado = fn(...args);
          sqldb.exec("COMMIT");
          emTransacao = false;
          saveSync(); // durabilidade imediata após transaction
          return resultado;
        } catch (err) {
          try { sqldb.exec("ROLLBACK"); } catch { /* já revertida */ }
          emTransacao = false;
          throw err;
        }
      };
    },

    saveSync,
    close() {
      saveSync();
      sqldb.close();
    },
  };

  // saves de segurança na saída do processo
  process.on("exit", () => { try { saveSync(); } catch { /* ignore */ } });
  process.on("SIGINT", () => { try { saveSync(); } catch { /* ignore */ } process.exit(0); });
  process.on("SIGTERM", () => { try { saveSync(); } catch { /* ignore */ } process.exit(0); });

  return db;
}
