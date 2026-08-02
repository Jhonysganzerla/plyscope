/*
 * gerar-aberturas.js — compacta a base ECO da lichess-org/chess-openings (CC0)
 * no formato próprio usado pelo Plyscope e escreve src/data/openings.js.
 *
 * Os dados vêm do pacote npm `chess-openings` (WTFPL), que redistribui a
 * classificação ECO do Lichess (repositório lichess-org/chess-openings, CC0 1.0
 * — domínio público). Só reaproveitamos os dados, nada do código do pacote.
 *
 *   cd /tmp && npm pack chess-openings && tar xzf chess-openings-*.tgz
 *   node tools/gerar-aberturas.js /tmp/package/dist/chess/openings/eco.js
 *
 * Formato de saída (tudo em strings ASCII base64, sem JSON):
 *   H  hash FNV-1a 32 bits da posição normalizada, em ordem crescente,
 *      guardado como delta de 24 bits (4 caracteres cada);
 *   E  código ECO, 2 caracteres (índice = (letra-'A')*100 + número);
 *   N  nome: fluxo de códigos de token, terminado pelo caractere A[31];
 *      tokens 0..30 ocupam 1 caractere (A[i]); os demais ocupam 2
 *      (A[32+q] seguido de A[r], token = 31 + q*64 + r);
 *   D  dicionário de tokens separados por espaço, do mais ao menos frequente.
 *
 * A posição normalizada é "peças lado roques" — sem casa de en passant e sem
 * contadores. Isso faz a busca ser por posição (e não por sequência de lances),
 * então transposições caem na mesma entrada.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const TERM = A[31];

/* Nome de família (o trecho antes do primeiro ":") em português do Brasil.
   Só a família é traduzida: os sub-nomes são nomes próprios (Najdorf, Winawer,
   Marshall…) e traduzi-los automaticamente daria resultado ruim. */
const FAMILIA_PT = {
  "Sicilian Defense": "Defesa Siciliana",
  "Ruy Lopez": "Ruy López (Espanhola)",
  "French Defense": "Defesa Francesa",
  "Italian Game": "Abertura Italiana",
  "Queen's Gambit": "Gambito da Dama",
  "Queen's Gambit Declined": "Gambito da Dama Recusado",
  "Queen's Gambit Accepted": "Gambito da Dama Aceito",
  "English Opening": "Abertura Inglesa",
  "King's Gambit": "Gambito do Rei",
  "King's Gambit Accepted": "Gambito do Rei Aceito",
  "King's Gambit Declined": "Gambito do Rei Recusado",
  "King's Indian Defense": "Defesa Índia do Rei",
  "King's Indian Attack": "Ataque Índio do Rei",
  "Caro-Kann Defense": "Defesa Caro-Kann",
  "Nimzo-Indian Defense": "Defesa Nimzo-Índia",
  "Dutch Defense": "Defesa Holandesa",
  "Semi-Slav Defense": "Defesa Semi-Eslava",
  "Slav Defense": "Defesa Eslava",
  "Benoni Defense": "Defesa Benoni",
  "Queen's Pawn Game": "Abertura do Peão da Dama",
  "King's Pawn Game": "Abertura do Peão do Rei",
  "King's Pawn Opening": "Abertura do Peão do Rei",
  "Grünfeld Defense": "Defesa Grünfeld",
  "Neo-Grünfeld Defense": "Defesa Neo-Grünfeld",
  "Alekhine Defense": "Defesa Alekhine",
  "Scotch Game": "Abertura Escocesa",
  "Indian Defense": "Defesa Índia",
  "Old Indian Defense": "Defesa Índia Antiga",
  "Queen's Indian Defense": "Defesa Índia da Dama",
  "Bogo-Indian Defense": "Defesa Bogo-Índia",
  "Petrov's Defense": "Defesa Petrov",
  "Zukertort Opening": "Abertura Zukertort",
  "Zukertort Defense": "Defesa Zukertort",
  "Four Knights Game": "Abertura dos Quatro Cavalos",
  "Three Knights Opening": "Abertura dos Três Cavalos",
  "King's Knight Opening": "Abertura do Cavalo do Rei",
  "Scandinavian Defense": "Defesa Escandinava",
  "Philidor Defense": "Defesa Philidor",
  "Nimzowitsch Defense": "Defesa Nimzowitsch",
  "Vienna Game": "Abertura Vienense",
  "Vienna Gambit": "Gambito Vienense",
  "Bishop's Opening": "Abertura do Bispo",
  "Modern Defense": "Defesa Moderna",
  "Pterodactyl Defense": "Defesa Pterodáctilo",
  "Van Geet Opening": "Abertura Van Geet",
  "Réti Opening": "Abertura Réti",
  "Catalan Opening": "Abertura Catalã",
  "Bird Opening": "Abertura Bird",
  "Pirc Defense": "Defesa Pirc",
  "Tarrasch Defense": "Defesa Tarrasch",
  "Polish Opening": "Abertura Polonesa",
  "Grob Opening": "Abertura Grob",
  "Hungarian Opening": "Abertura Húngara",
  "Nimzo-Larsen Attack": "Ataque Nimzo-Larsen",
  "Center Game": "Abertura do Centro",
  "Blackmar-Diemer Gambit": "Gambito Blackmar-Diemer",
  "Blackmar-Diemer Gambit Accepted": "Gambito Blackmar-Diemer Aceito",
  "Blackmar-Diemer Gambit Declined": "Gambito Blackmar-Diemer Recusado",
  "Latvian Gambit": "Gambito Letão",
  "Latvian Gambit Accepted": "Gambito Letão Aceito",
  "Ponziani Opening": "Abertura Ponziani",
  "Rat Defense": "Defesa Rat",
  "Trompowsky Attack": "Ataque Trompowsky",
  "Benko Gambit": "Gambito Benko",
  "Benko Gambit Accepted": "Gambito Benko Aceito",
  "Benko Gambit Declined": "Gambito Benko Recusado",
  "Kádas Opening": "Abertura Kádas",
  "Englund Gambit": "Gambito Englund",
  "Englund Gambit Declined": "Gambito Englund Recusado",
  "Owen Defense": "Defesa Owen",
  "Richter-Veresov Attack": "Ataque Richter-Veresov",
  "Ware Opening": "Abertura Ware",
  "English Defense": "Defesa Inglesa",
  "Barnes Opening": "Abertura Barnes",
  "Torre Attack": "Ataque Torre",
  "Danish Gambit": "Gambito Dinamarquês",
  "Danish Gambit Accepted": "Gambito Dinamarquês Aceito",
  "Danish Gambit Declined": "Gambito Dinamarquês Recusado",
  "Rubinstein Opening": "Abertura Rubinstein",
  "Van't Kruijs Opening": "Abertura Van't Kruijs",
  "Borg Defense": "Defesa Borg",
  "Lion Defense": "Defesa Lion",
  "Mieses Opening": "Abertura Mieses",
  "Sodium Attack": "Ataque Sódio",
  "Mikenas Defense": "Defesa Mikenas",
  "London System": "Sistema Londres",
  "Colle System": "Sistema Colle",
  "St. George Defense": "Defesa São Jorge",
  "Elephant Gambit": "Gambito do Elefante",
  "Amar Opening": "Abertura Amar",
  "Portuguese Opening": "Abertura Portuguesa",
  "Rapport-Jobava System": "Sistema Rapport-Jobava",
  "Blumenfeld Countergambit": "Contragambito Blumenfeld",
  "Anderssen's Opening": "Abertura Anderssen",
  "Clemenz Opening": "Abertura Clemenz",
  "Australian Defense": "Defesa Australiana",
  "Global Opening": "Abertura Global",
  "Saragossa Opening": "Abertura Saragoça",
  "Crab Opening": "Abertura Caranguejo",
  "Gedult's Opening": "Abertura Gedult",
  "Guatemala Defense": "Defesa Guatemala",
  "Hippopotamus Defense": "Defesa Hipopótamo",
  "Horwitz Defense": "Defesa Horwitz",
  "Carr Defense": "Defesa Carr",
  "Goldsmith Defense": "Defesa Goldsmith",
  "Lemming Defense": "Defesa Lemming",
  "Duras Gambit": "Gambito Duras",
  "Fried Fox Defense": "Defesa Raposa Frita",
  "Creepy Crawly Formation": "Formação Creepy Crawly",
  "Grünfeld Defense Declined": "Defesa Grünfeld Recusada",
};

/* Substantivo que encabeça o trecho, com o gênero, para concordar o adjetivo. */
const NUCLEO = {
  Variation: ["Variante", "f"], Defense: ["Defesa", "f"], Defence: ["Defesa", "f"],
  Attack: ["Ataque", "m"], Gambit: ["Gambito", "m"], Countergambit: ["Contragambito", "m"],
  System: ["Sistema", "m"], Line: ["Linha", "f"], Opening: ["Abertura", "f"],
  Game: ["Partida", "f"], Formation: ["Formação", "f"], Bind: ["Amarra", "f"],
};
/* Adjetivos/qualificadores comuns; o que não estiver aqui é nome próprio e fica como está. */
const ADJ = {
  Classical: ["Clássica", "Clássico"], Modern: ["Moderna", "Moderno"],
  Closed: ["Fechada", "Fechado"], Open: ["Aberta", "Aberto"],
  Symmetrical: ["Simétrica", "Simétrico"], Orthodox: ["Ortodoxa", "Ortodoxo"],
  Quiet: ["Tranquila", "Tranquilo"], Normal: ["Normal", "Normal"],
  Main: ["Principal", "Principal"], Traditional: ["Tradicional", "Tradicional"],
  Old: ["Antiga", "Antigo"], Delayed: ["Adiada", "Adiado"],
  Exchange: ["das Trocas", "das Trocas"], Advance: ["do Avanço", "do Avanço"],
  Wing: ["da Ala", "da Ala"], Center: ["do Centro", "do Centro"],
  Dragon: ["do Dragão", "do Dragão"], "Poisoned Pawn": ["do Peão Envenenado", "do Peão Envenenado"],
  "Two Knights": ["dos Dois Cavalos", "dos Dois Cavalos"],
  "Three Knights": ["dos Três Cavalos", "dos Três Cavalos"],
  "Four Knights": ["dos Quatro Cavalos", "dos Quatro Cavalos"],
  "Four Pawns": ["dos Quatro Peões", "dos Quatro Peões"],
  "Bishop's": ["do Bispo", "do Bispo"], "Knight's": ["do Cavalo", "do Cavalo"],
  "Queen's": ["da Dama", "da Dama"], "King's": ["do Rei", "do Rei"],
  English: ["Inglesa", "Inglês"], Spanish: ["Espanhola", "Espanhol"],
  Italian: ["Italiana", "Italiano"], French: ["Francesa", "Francês"],
  Russian: ["Russa", "Russo"], Czech: ["Tcheca", "Tcheco"],
  Dutch: ["Holandesa", "Holandês"], Polish: ["Polonesa", "Polonês"],
  Hungarian: ["Húngara", "Húngaro"], Danish: ["Dinamarquesa", "Dinamarquês"],
  Swedish: ["Sueca", "Sueco"], Latvian: ["Letã", "Letão"],
  Portuguese: ["Portuguesa", "Português"], Austrian: ["Austríaca", "Austríaco"],
  Yugoslav: ["Iugoslava", "Iugoslavo"], Scandinavian: ["Escandinava", "Escandinavo"],
  Sicilian: ["Siciliana", "Siciliano"], Indian: ["Índia", "Índio"],
  Scotch: ["Escocesa", "Escocês"], Vienna: ["Vienense", "Vienense"],
  Berlin: ["Berlim", "Berlim"], Leningrad: ["Leningrado", "Leningrado"],
  Stonewall: ["Stonewall", "Stonewall"], Accelerated: ["Acelerada", "Acelerado"],
};
/* Trechos inteiros sem núcleo, traduzidos por igualdade exata. */
const SEGMENTO_PT = {
  Closed: "Fechada", Open: "Aberta", Accepted: "Aceito", Declined: "Recusado",
  Classical: "Clássica", Modern: "Moderna", Exchange: "Variante das Trocas",
  Sicilian: "Siciliana", "Accelerated Dragon": "Dragão Acelerado",
  Fianchetto: "Fianchetto", "Main Line": "Linha Principal", "with": "com",
};

function traduzSeg(seg) {
  if (SEGMENTO_PT[seg]) return SEGMENTO_PT[seg];
  let m = seg.match(/^(.+?) (Accepted|Declined)$/);
  if (m) {
    const base = traduzSeg(m[1]);
    const fem = /^(Defesa|Variante|Linha|Abertura|Partida|Formação|Amarra)\b/.test(base);
    const suf = m[2] === "Accepted" ? (fem ? "Aceita" : "Aceito") : (fem ? "Recusada" : "Recusado");
    return base + " " + suf;
  }
  m = seg.match(/^(.+) (Variation|Defense|Defence|Attack|Gambit|Countergambit|System|Line|Opening|Game|Formation|Bind)$/);
  if (!m) return seg;
  const [nuc, gen] = NUCLEO[m[2]];
  const a = ADJ[m[1]];
  return nuc + " " + (a ? a[gen === "f" ? 0 : 1] : m[1]);
}

function traduzir(nome) {
  const i = nome.indexOf(": ");
  let fam = i < 0 ? nome : nome.slice(0, i);
  const resto = i < 0 ? "" : nome.slice(i + 2);
  let famPt;
  if (FAMILIA_PT[fam]) famPt = FAMILIA_PT[fam];
  else {
    const j = fam.indexOf(", ");
    if (j > 0 && FAMILIA_PT[fam.slice(0, j)]) famPt = FAMILIA_PT[fam.slice(0, j)] + fam.slice(j);
    else famPt = fam.split(", ").map(traduzSeg).join(", ");
  }
  if (!resto) return famPt;
  return famPt + ": " + resto.split(", ").map(traduzSeg).join(", ");
}

function hash32(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const normalizar = (fen) => { const p = fen.split(" "); return p[0] + " " + p[1] + " " + p[2]; };
const b64 = (v, n) => { let s = ""; for (let i = n - 1; i >= 0; i--) s += A[(v >>> (6 * i)) & 63]; return s; };

/* ---------- entrada ---------- */
const fonte = process.argv[2] || "/tmp/package/dist/chess/openings/eco.js";
const { eco } = require(path.resolve(fonte));

const porChave = new Map();
for (const epd of Object.keys(eco)) {
  const k = normalizar(epd);
  if (!porChave.has(k)) porChave.set(k, { eco: eco[epd].eco, name: traduzir(eco[epd].name) });
}
const linhas = [...porChave.entries()]
  .map(([k, v]) => ({ h: hash32(k), eco: v.eco, name: v.name }))
  .sort((a, b) => a.h - b.h);

const dup = linhas.filter((r, i) => i && r.h === linhas[i - 1].h).length;
if (dup) throw new Error("colisão de hash: " + dup + " entradas");

/* ---------- dicionário de tokens por frequência ---------- */
const freq = new Map();
for (const r of linhas) for (const t of r.name.split(" ")) freq.set(t, (freq.get(t) || 0) + 1);
const dic = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map((x) => x[0]);
if (dic.length > 31 + 32 * 64) throw new Error("dicionário grande demais: " + dic.length);
const idx = new Map(dic.map((t, i) => [t, i]));

/* ---------- montagem ---------- */
let H = "", E = "", N = "", prev = 0;
for (const r of linhas) {
  const d = r.h - prev; prev = r.h;
  if (d >= 1 << 24) throw new Error("delta de hash não cabe em 24 bits: " + d);
  H += b64(d, 4);
  E += b64((r.eco.charCodeAt(0) - 65) * 100 + +r.eco.slice(1), 2);
  for (const t of r.name.split(" ")) {
    const i = idx.get(t);
    N += i < 31 ? A[i] : A[32 + ((i - 31) >> 6)] + A[(i - 31) & 63];
  }
  N += TERM;
}
const D = dic.join(" ");

const saida = `/* Base de aberturas ECO — gerada por tools/gerar-aberturas.js, não edite à mão.
   Dados: lichess-org/chess-openings (CC0 1.0, domínio público), via o pacote npm
   chess-openings@0.1.1 (WTFPL). ${linhas.length} posições, códigos ECO e nomes.
   Busca por posição normalizada (peças + lado + roques), o que faz transposições
   de lances caírem naturalmente na mesma entrada. */
window.Aberturas = (function () {
  "use strict";
  const A = "${A}";
  const H = "${H}";
  const E = "${E}";
  const N = "${N}";
  const D = "${D}";

  const v = new Array(128).fill(0);
  for (let i = 0; i < 64; i++) v[A.charCodeAt(i)] = i;
  let hs = null, dic = null, ini = null;

  function montar() {
    hs = new Uint32Array(H.length / 4);
    let acc = 0;
    for (let i = 0, k = 0; i < H.length; i += 4, k++) {
      acc = (acc + ((v[H.charCodeAt(i)] << 18) | (v[H.charCodeAt(i + 1)] << 12) |
        (v[H.charCodeAt(i + 2)] << 6) | v[H.charCodeAt(i + 3)])) >>> 0;
      hs[k] = acc;
    }
    dic = D.split(" ");
    ini = new Int32Array(hs.length);           // onde começa cada nome em N
    for (let i = 0, k = 0; k < hs.length; k++) { ini[k] = i; while (v[N.charCodeAt(i)] !== 31) i += v[N.charCodeAt(i)] < 31 ? 1 : 2; i++; }
  }

  function hash32(s) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function chave(fen) { const p = String(fen).split(" "); return p[0] + " " + p[1] + " " + p[2]; }

  function nome(k) {
    let s = "", i = ini[k];
    for (;;) {
      const c = v[N.charCodeAt(i)];
      if (c === 31) break;
      if (c < 31) { s += (s ? " " : "") + dic[c]; i++; }
      else { s += (s ? " " : "") + dic[31 + ((c - 32) << 6) + v[N.charCodeAt(i + 1)]]; i += 2; }
    }
    return s;
  }

  /* Procura a posição na base. Devolve {eco, nome} ou null. */
  function buscar(fen) {
    if (!hs) montar();
    const alvo = hash32(chave(fen));
    let lo = 0, hi = hs.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (hs[m] === alvo) {
        const e = (v[E.charCodeAt(m * 2)] << 6) | v[E.charCodeAt(m * 2 + 1)];
        return { eco: String.fromCharCode(65 + Math.floor(e / 100)) + String(e % 100).padStart(2, "0"), nome: nome(m) };
      }
      if (hs[m] < alvo) lo = m + 1; else hi = m - 1;
    }
    return null;
  }

  /* Percorre as posições da partida e devolve a correspondência mais profunda
     (a abertura é a última que bate, não a primeira). fens[0] é a posição
     inicial; o resultado traz o lance (ply) em que a teoria termina. */
  function detectar(fens, maxPly) {
    const lim = Math.min(fens.length - 1, maxPly || 30);
    let achado = null;
    for (let p = 1; p <= lim; p++) {
      const r = buscar(fens[p]);
      if (r) { achado = r; achado.ply = p; }
    }
    return achado;
  }

  return { buscar, detectar, total: H.length / 4 };
})();
`;

const dest = path.resolve(__dirname, "..", "src", "data", "openings.js");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, saida, "utf8");
console.log("posições:", linhas.length, "| tokens:", dic.length);
console.log("H", H.length, "| E", E.length, "| N", N.length, "| D", D.length);
console.log("ok:", dest, Buffer.byteLength(saida, "utf8"), "bytes (" + (Buffer.byteLength(saida, "utf8") / 1024).toFixed(1) + " KB)");
