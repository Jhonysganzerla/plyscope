/* ============================================================
   Plyscope — classificação de lances (lógica pura)
   ------------------------------------------------------------
   ONDE MORA: arquivo próprio, injetado no index.html pelo marcador
   /*__CLASSIFY__*\/ do shell.html, logo depois do chess.js. É o mesmo
   padrão do dicionário (src/i18n.js) e da base de aberturas
   (src/data/openings.js): nada é buscado pela rede, no fim continua
   um arquivo único que abre offline.

   POR QUE FORA DO app.js: é a alma do produto — win%, precisão, SEE,
   sacrifício e o veredito de cada lance — e é 100% pura: entra número
   e FEN, sai número e rótulo. Sem DOM, sem estado global, sem motor.
   Isolada, ela roda em Node em milissegundos, e é assim que os testes
   unitários (tools/unit.js) e a calibração (tools/calibrar.js,
   tools/tune.js) a exercitam. Antes, essas ferramentas recortavam o
   texto do app.js por comentários literais: renomear um comentário
   quebrava a calibração em silêncio.

   O QUE RODA NO NAVEGADOR É ESTE ARQUIVO: o mesmo módulo, byte a byte,
   que o build embute no index.html. Não existe uma segunda
   implementação da regra para medir.

   DEPENDÊNCIA: chess.js — window.Chess no navegador, require("chess.js")
   em Node. Só o SEE e a detecção de sacrifício precisam dele.
   ============================================================ */
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) {           // Node
    module.exports = fabrica(chessDoNode());
  } else {                                                      // navegador
    raiz.PlyClassify = fabrica(raiz.Chess);
  }
  /* As dependências de desenvolvimento moram em tools/node_modules
     (ver tools/package.json), então procura lá também — assim
     `cd tools && npm install` basta, de onde quer que se rode. */
  function chessDoNode() {
    const locais = ["chess.js",
      require("path").join(__dirname, "..", "tools", "node_modules", "chess.js")];
    for (const l of locais) { try { return require(l).Chess; } catch (e) {} }
    throw new Error("chess.js não encontrado — rode 'npm install' em tools/");
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chess) {
"use strict";

/* ---------- classificações ----------
   As chaves (brilhante, capivarada…) são identidade interna e vão para o
   armazenamento e para os NAG do PGN: não mudam com o idioma. A cor e o
   símbolo acompanham a chave; o nome que aparece na tela vem do dicionário
   (clsNome(), no app.js). */
const CLS = {
  brilhante : { cor:"#26c2a3", sym:"!!", ord:0 },
  excelente : { cor:"#5b8bb0", sym:"!",  ord:1 },
  melhor    : { cor:"#81b64c", sym:"★",  ord:2 },
  otimo     : { cor:"#95bb4a", sym:"✓",  ord:3 },
  bom       : { cor:"#96af8b", sym:"✓",  ord:4 },
  forcado   : { cor:"#8b8987", sym:"=",  ord:5 },
  impreciso : { cor:"#f7c631", sym:"?!", ord:6 },
  erro      : { cor:"#ffa459", sym:"?",  ord:7 },
  capivarada: { cor:"#fa412d", sym:"??", ord:8 },
};
const CLS_ORDER = Object.keys(CLS).sort((a,b)=>CLS[a].ord-CLS[b].ord);

/* ============================================================
   Avaliação → win% → precisão
   ============================================================ */
function scoreToCp(s) {           // s = {cp, mate} (POV brancas)
  if (s == null) return 0;
  if (s.mate != null) return s.mate > 0 ? 12000 - s.mate * 10 : -12000 - s.mate * 10;
  return Math.max(-12000, Math.min(12000, s.cp));
}
function winPct(cp) {             // 0..100 para as brancas
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function winFor(color, s) {
  const w = winPct(scoreToCp(s));
  return color === "w" ? w : 100 - w;
}
function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const v = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, v));
}

/* ---------- SEE simplificado (detecta sacrifícios) ---------- */
const PV_VAL = { p:100, n:300, b:320, r:500, q:900, k:20000 };
function leastValuableAttacker(board, sq, side) {
  let best = null;
  let atk;
  try { atk = board.attackers(sq, side); } catch (e) { return null; }
  for (const from of atk || []) {
    const p = board.get(from);
    if (!p) continue;
    if (!best || PV_VAL[p.type] < PV_VAL[best.type]) best = { square: from, type: p.type };
  }
  return best;
}
function see(board, sq, side) {
  const att = leastValuableAttacker(board, sq, side);
  if (!att) return 0;
  const target = board.get(sq);
  const val = target ? PV_VAL[target.type] : 0;
  if (att.type === "k" && (board.attackers(sq, side === "w" ? "b" : "w") || []).length) return 0;
  board.remove(att.square);
  board.remove(sq);
  board.put({ type: att.type, color: side }, sq);
  const score = Math.max(0, val - see(board, sq, side === "w" ? "b" : "w"));
  board.remove(sq);
  if (target) board.put(target, sq);
  board.put({ type: att.type, color: side }, att.square);
  return score;
}
/** Quanto material o adversário ganha capturando em `sq` na posição `fen`. */
function hangingValue(fen, sq, oppColor) {
  try {
    const b = new Chess(fen, { skipValidation: true });
    return see(b, sq, oppColor);
  } catch (e) { return 0; }
}

/**
 * Material que o jogador deixou em oferta depois do lance.
 * Cobre os três casos que o chess.com marca como brilhante:
 *  - a peça movida vai para uma casa onde pode ser capturada (en prise);
 *  - o lance captura algo e convida a recaptura (sacrifício por captura);
 *  - o lance ignora uma ameaça e deixa outra peça pendurada.
 * Só conta se a captura for LEGAL de verdade (cravadas, xeques e táticas
 * que impedem a tomada não valem como oferta).
 */
function sacrificeInfo(fenAfter, moverColor) {
  const opp = moverColor === "w" ? "b" : "w";
  let board;
  try { board = new Chess(fenAfter); } catch (e) { return { risked: 0, square: null }; }
  if (board.turn() !== opp) return { risked: 0, square: null };
  let best = { risked: 0, square: null };
  const vistos = new Set();
  for (const m of board.moves({ verbose: true })) {
    if (!m.captured || vistos.has(m.to)) continue;
    vistos.add(m.to);
    const v = hangingValue(fenAfter, m.to, opp);
    if (v > best.risked) best = { risked: v, square: m.to };
  }
  return best;
}

/**
 * Material que o adversário JÁ conseguia ganhar nessa casa ANTES do lance —
 * um lance nulo: passa a vez sem mexer em nada.
 * Depois do lance, "peça em oferta" e "peça que já estava pendurada e
 * continuou pendurada" têm exatamente a mesma cara para o `sacrificeInfo`.
 * Só quem sabe distinguir as duas é a posição anterior.
 */
function ofertaAnterior(fenBefore, moverColor, sq) {
  if (!sq) return 0;
  const opp = moverColor === "w" ? "b" : "w";
  const campos = fenBefore.split(" ");
  campos[1] = opp;   // passa a vez
  campos[3] = "-";   // o en passant herdado não sobrevive ao lance nulo
  const nulo = campos.join(" ");
  let b;
  try { b = new Chess(nulo); } catch (e) { return 0; }
  if (b.turn() !== opp) return 0;
  let podeTomar = false;
  try {
    for (const m of b.moves({ verbose: true })) {
      if (m.captured && m.to === sq) { podeTomar = true; break; }
    }
  } catch (e) { return 0; }
  return podeTomar ? hangingValue(nulo, sq, opp) : 0;
}

/* ----------------------------------------------------------------------
   Parâmetros calibrados nos 100 lances do Brilliant Move Benchmark
   (os brilhantes que o chess.com marcou em 100 partidas reais).
   Medição: 88 dos 100 detectados, com 3 marcações extras em 416 lances
   comuns de 8 partidas completas.
   ---------------------------------------------------------------------- */
const BRI = {
  perdaMax: 6.0,      // quanto de chance de vitória o lance pode custar
  riscoMin: 150,      // material que precisa estar realmente em oferta
  liquidoMin: 100,    // oferta menos o que o próprio lance capturou
  winAntesMin: 40,    // sacrificar em posição já perdida não é brilhante
  winDepoisMin: 35,   // e depois do sacrifício ainda tem que estar de pé
  vitoriaMax: 97,     // com a partida já ganha não vale…
  // …a menos que a oferta seja de peça inteira. O corte era 250, que deixava
  // de fora o presente grego (Bxh7+): oferece um bispo, leva um peão, 220
  // líquido. É o sacrifício brilhante mais conhecido do xadrez e não tinha
  // por que cair do lado errado de um limiar.
  liquidoGrande: 220,
};

function classifyMove(ctx) {
  const { legal, isBest, loss, winBefore, winAfter, gapSegundo, sac, capturado, recaptura } = ctx;
  const sacPrevio = ctx.sacPrevio || 0;
  let cls;
  if (legal === 1) cls = "forcado";
  else if (loss < 2)   cls = isBest ? "melhor" : "otimo";
  else if (loss < 5)   cls = "bom";
  else if (loss < 10)  cls = "impreciso";
  else if (loss < 20)  cls = "erro";
  else                 cls = "capivarada";

  // posição já perdida: não castiga tanto
  if (winBefore < 8 && CLS[cls].ord > CLS.impreciso.ord) cls = "impreciso";

  // Excelente: único lance que segura a posição
  if (isBest && legal > 1 && gapSegundo != null && gapSegundo >= 10) cls = "excelente";

  // Brilhante: sacrifício correto.
  // Retomar não é oferecer: quando o lance só pega de volta o que o adversário
  // acabou de capturar, o que ficou em oferta depois dele só conta se tiver
  // nascido do próprio lance. Se o adversário já podia ganhar o mesmo naquela
  // casa antes, a peça já estava pendurada e o mérito não é da retomada.
  // (Vetar toda retomada, como antes, jogava fora o sacrifício clássico de
  // retomar com a peça errada de propósito — Bxc4, Qxc5, Nxe6+ e companhia.)
  const retomadaSemOferta = recaptura && sac.risked > 0 && sacPrevio >= sac.risked;
  if (legal > 1 && !retomadaSemOferta && loss <= BRI.perdaMax) {
    const ganho = capturado ? PV_VAL[capturado] : 0;
    const liquido = sac.risked - ganho;
    if (sac.risked >= BRI.riscoMin && liquido >= BRI.liquidoMin &&
        winBefore >= BRI.winAntesMin && winAfter >= BRI.winDepoisMin &&
        (winBefore <= BRI.vitoriaMax || liquido >= BRI.liquidoGrande)) cls = "brilhante";
  }
  return cls;
}

/* ---------- precisão da partida (média ponderada + harmônica) ---------- */
function gameAccuracy(positions, moves, perMove) {
  const wins = positions.map((p) => winPct(scoreToCp(p)));  // POV brancas
  const out = { w: 0, b: 0 };
  for (const color of ["w", "b"]) {
    const accs = [], weights = [];
    const win = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].color !== color) continue;
      const pm = perMove[i];
      if (!pm) continue;
      accs.push(pm.accuracy);
      const a = Math.max(0, i - win), b = Math.min(wins.length - 1, i + win);
      const slice = wins.slice(a, b + 1);
      const mean = slice.reduce((x, y) => x + y, 0) / slice.length;
      const sd = Math.sqrt(slice.reduce((x, y) => x + (y - mean) ** 2, 0) / slice.length);
      weights.push(Math.max(0.5, Math.min(12, sd)));
    }
    if (!accs.length) { out[color] = null; continue; }
    const wm = accs.reduce((s, a, k) => s + a * weights[k], 0) / weights.reduce((s, w) => s + w, 0);
    const hm = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
    out[color] = Math.max(0, Math.min(100, (wm + hm) / 2));
  }
  return out;
}

return {
  CLS, CLS_ORDER,
  scoreToCp, winPct, winFor, moveAccuracy,
  PV_VAL, leastValuableAttacker, see, hangingValue, sacrificeInfo, ofertaAnterior,
  BRI, classifyMove, gameAccuracy,
};
});
