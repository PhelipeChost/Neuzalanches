// Gerador de ZIP mínimo, sem dependências (método "store" — sem compressão).
// Existe pra empacotar os XMLs fiscais + resumo num único download sem precisar
// instalar `archiver`/`jszip` (que puxariam binários/árvore grande no Electron).
// CRC32 é implementado à mão pra não depender de zlib.crc32 (que só existe em
// Node ≥ 20.15 / 22.2 — nem toda versão do Electron tem).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Data/hora no formato DOS (usado nos headers do ZIP).
function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() / 2) & 0x1F);
  const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
  return { time: time & 0xFFFF, date: date & 0xFFFF };
}

// entradas: [{ nome: "arquivo.xml", conteudo: string | Buffer }]
export function montarZip(entradas) {
  const { time, date } = dosDateTime();
  const locais = [];
  const central = [];
  let offset = 0;

  for (const e of entradas) {
    const nomeBuf = Buffer.from(e.nome, "utf8");
    const dados = Buffer.isBuffer(e.conteudo) ? e.conteudo : Buffer.from(String(e.conteudo), "utf8");
    const crc = crc32(dados);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);   // assinatura
    lfh.writeUInt16LE(20, 4);           // versão necessária
    lfh.writeUInt16LE(0, 6);            // flags
    lfh.writeUInt16LE(0, 8);            // método (0 = store)
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(date, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(dados.length, 18);  // tamanho comprimido = original
    lfh.writeUInt32LE(dados.length, 22);  // tamanho original
    lfh.writeUInt16LE(nomeBuf.length, 26);
    lfh.writeUInt16LE(0, 28);           // extra length
    locais.push(lfh, nomeBuf, dados);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);   // assinatura
    cdh.writeUInt16LE(20, 4);           // versão criadora
    cdh.writeUInt16LE(20, 6);           // versão necessária
    cdh.writeUInt16LE(0, 8);            // flags
    cdh.writeUInt16LE(0, 10);           // método
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(date, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(dados.length, 20);
    cdh.writeUInt32LE(dados.length, 24);
    cdh.writeUInt16LE(nomeBuf.length, 28);
    cdh.writeUInt16LE(0, 30);           // extra
    cdh.writeUInt16LE(0, 32);           // comentário
    cdh.writeUInt16LE(0, 34);           // disco inicial
    cdh.writeUInt16LE(0, 36);           // atributos internos
    cdh.writeUInt32LE(0, 38);           // atributos externos
    cdh.writeUInt32LE(offset, 42);      // offset do header local
    central.push(cdh, nomeBuf);

    offset += lfh.length + nomeBuf.length + dados.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                    // disco
  eocd.writeUInt16LE(0, 6);                    // disco do início do CD
  eocd.writeUInt16LE(entradas.length, 8);      // entradas neste disco
  eocd.writeUInt16LE(entradas.length, 10);     // total de entradas
  eocd.writeUInt32LE(centralBuf.length, 12);   // tamanho do CD
  eocd.writeUInt32LE(offset, 16);              // offset do CD
  eocd.writeUInt16LE(0, 20);                   // comentário

  return Buffer.concat([...locais, centralBuf, eocd]);
}
