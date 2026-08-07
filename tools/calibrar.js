/* Calibração do detector de "Brilhante" contra o Brilliant Move Benchmark.
   Uso:
     node calibrar.js recall [depth]     -> mede acerto nos 100 lances brilhantes
     node calibrar.js precisao [nJogos]  -> conta brilhantes marcados em partidas inteiras
     node calibrar.js tune               -> varre parâmetros usando só o cache
*/
const fs = require("fs");
const { spawn } = require("child_process");
const { Chess } = require("chess.js");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.PLYSCOPE_OUT || path.join(__dirname, "saida");
const BENCH = process.env.PLYSCOPE_BENCH || path.join(OUT, "bench.json");
fs.mkdirSync(OUT, { recursive: true });
const ENGINE = path.join(ROOT, "engine", "stockfish-lite-single.js");
const CACHE = path.join(OUT, "evalcache.json");

/* ---------- a lógica pura, o mesmo módulo que roda no navegador ----------
   src/classify.js é injetado no index.html pelo marcador /*__CLASSIFY__*\/ do
   shell.html e carregado aqui por require(): não existe segunda implementação
   da regra, nem recorte de texto por comentário, para medir. */
const P = require(path.join(ROOT, "src", "classify.js"));

/* ---------- motor ---------- */
let eng, buf = "", waiting = null;
function engStart() {
  eng = spawn("node", [ENGINE]);
  eng.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (waiting) waiting(line);
    }
  });
  eng.stdin.write("uci\n");
}
function go(fen, depth, multipv) {
  return new Promise((resolve) => {
    const store = {};
    waiting = (line) => {
      if (line.startsWith("info ") && line.includes(" pv ") &&
          !line.includes("lowerbound") && !line.includes("upperbound")) {
        const t = line.split(" ");
        let d = 0, mpv = 1, cp = null, mate = null, pv = null;
        for (let i = 1; i < t.length; i++) {
          if (t[i] === "depth") d = +t[++i];
          else if (t[i] === "multipv") mpv = +t[++i];
          else if (t[i] === "score") { if (t[i+1] === "cp") { cp = +t[i+2]; i += 2; } else if (t[i+1] === "mate") { mate = +t[i+2]; i += 2; } }
          else if (t[i] === "pv") { pv = t.slice(i + 1); i = t.length; }
        }
        if (pv && (cp !== null || mate !== null) && !(store[mpv] && store[mpv].depth > d)) store[mpv] = { depth: d, cp, mate, pv };
      } else if (line.startsWith("bestmove")) {
        const bm = line.split(" ")[1];
        waiting = null;
        resolve({ lines: store, bestmove: bm === "(none)" ? null : bm });
      }
    };
    eng.stdin.write("setoption name MultiPV value " + multipv + "\n");
    eng.stdin.write("position fen " + fen + "\n");
    eng.stdin.write("go depth " + depth + "\n");
  });
}

/* ---------- cache de avaliações ---------- */
let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
let dirty = 0;
function saveCache() { fs.writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; }
async function evalPos(fen, depth, multipv) {
  const key = fen + "|" + depth + "|" + multipv;
  if (cache[key]) return cache[key];
  const c = new Chess(fen);
  let entry;
  if (c.isGameOver()) {
    entry = c.isCheckmate()
      ? { cp: c.turn() === "w" ? -12000 : 12000, mate: null, best: null, pv: [], mateEnd: true }
      : { cp: 0, mate: null, best: null, pv: [] };
  } else {
    const res = await go(fen, depth, multipv);
    const l1 = res.lines[1], l2 = res.lines[2];
    const sign = c.turn() === "w" ? 1 : -1;
    entry = {
      cp: l1 && l1.cp != null ? l1.cp * sign : null,
      mate: l1 && l1.mate != null ? l1.mate * sign : null,
      best: res.bestmove || (l1 && l1.pv[0]) || null,
      pv: (l1 && l1.pv) || [], depth: l1 ? l1.depth : depth,
    };
    if (l2) {
      const s2 = { cp: l2.cp != null ? l2.cp * sign : null, mate: l2.mate != null ? l2.mate * sign : null };
      entry.secondWin = P.winFor(c.turn(), s2);
    }
  }
  cache[key] = entry;
  if (++dirty >= 4) saveCache();
  return entry;
}

/* ---------- avalia um lance ---------- */
/** `anterior` é o lance anterior da partida (verbose do chess.js), quando se sabe. */
function julgar(fenBefore, uci, posB, posA, anterior) {
  const c = new Chess(fenBefore);
  const legal = c.moves().length;
  const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  const fenAfter = c.fen();
  const color = mv.color;
  const winBefore = P.winFor(color, posB), winAfter = P.winFor(color, posA);
  const loss = Math.max(0, winBefore - winAfter);
  const sac = P.sacrificeInfo(fenAfter, color);
  const recaptura = !!(mv.captured && anterior && anterior.captured && anterior.to === mv.to);
  const sacPrevio = recaptura && sac.risked > 0 ? P.ofertaAnterior(fenBefore, color, sac.square) : 0;
  const ctx = {
    legal, isBest: !!(posB.best && posB.best.toLowerCase() === uci.toLowerCase()),
    loss, winBefore, winAfter,
    gapSegundo: posB.secondWin != null ? winBefore - posB.secondWin : null,
    sac, capturado: mv.captured || null, recaptura, sacPrevio,
  };
  return { cls: P.classifyMove(ctx), ctx, san: mv.san, fenAfter };
}
/** Reconstrói o lance anterior a partir do PGN do caso (o recall só tem a FEN). */
function lanceAnterior(pgn, ply) {
  if (!pgn || ply < 2) return null;
  try {
    const c = new Chess();
    c.loadPgn(pgn, { strict: false });
    return c.history({ verbose: true })[ply - 2] || null;
  } catch (e) { return null; }
}

/* ============================ modos ============================ */
async function recall(depth) {
  const bench = JSON.parse(fs.readFileSync(BENCH, "utf8")).filter((c) => c.results && c.results.chesscom);
  engStart();
  const linhas = [];
  for (let i = 0; i < bench.length; i++) {
    const b = bench[i];
    const posB = await evalPos(b.fen, depth, 2);
    const c = new Chess(b.fen);
    c.move({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), promotion: b.uci[4] || "q" });
    const posA = await evalPos(c.fen(), depth, 1);
    const r = julgar(b.fen, b.uci, posB, posA, lanceAnterior(b.pgn, b.ply));
    linhas.push({ san: r.san, cls: r.cls, ...r.ctx, sacRisked: r.ctx.sac.risked,
      chessigma: b.results["chessigma@v75"], gameId: b.gameId, ply: b.ply, fen: b.fen, uci: b.uci });
    if ((i + 1) % 10 === 0) process.stderr.write("  " + (i + 1) + "/" + bench.length + "\n");
  }
  saveCache();
  fs.writeFileSync(path.join(OUT,"recall.json"), JSON.stringify(linhas, null, 1));
  relatorioRecall(linhas);
  process.exit(0);
}
function relatorioRecall(linhas) {
  const hit = linhas.filter((l) => l.cls === "brilhante").length;
  console.log("\n=== RECALL: " + hit + "/" + linhas.length + " lances brilhantes detectados ===");
  const porMotivo = {};
  for (const l of linhas) {
    if (l.cls === "brilhante") continue;
    const ganho = l.capturado ? P.PV_VAL[l.capturado] : 0;
    const liquido = l.sacRisked - ganho;
    let motivo;
    if (l.legal === 1) motivo = "lance forçado";
    else if (l.recaptura && l.sacRisked > 0 && (l.sacPrevio || 0) >= l.sacRisked)
      motivo = "retomada sem oferta nova (já pendurado: " + l.sacPrevio + ")";
    else if (l.loss > P.BRI.perdaMax) motivo = "perda de win% alta (" + l.loss.toFixed(1) + ")";
    else if (l.sacRisked < P.BRI.riscoMin) motivo = "nada em oferta (SEE " + l.sacRisked + ")";
    else if (liquido < P.BRI.liquidoMin) motivo = "líquido baixo (" + liquido + ")";
    else if (l.winBefore < P.BRI.winAntesMin) motivo = "posição já perdida antes (" + l.winBefore.toFixed(0) + "%)";
    else if (l.winAfter < P.BRI.winDepoisMin) motivo = "posição perdida depois (" + l.winAfter.toFixed(0) + "%)";
    else motivo = "já ganho (" + l.winBefore.toFixed(0) + "%, líquido " + liquido + ")";
    (porMotivo[motivo] = porMotivo[motivo] || []).push(l.san);
  }
  Object.entries(porMotivo).sort((a, b) => b[1].length - a[1].length)
    .forEach(([m, v]) => console.log("  " + String(v.length).padStart(3) + "  " + m + "  [" + v.slice(0, 8).join(" ") + "]"));
}

async function precisao(nJogos, depth) {
  const bench = JSON.parse(fs.readFileSync(BENCH, "utf8")).filter((c) => c.pgn && c.pgn.startsWith("[Event"));
  const jogos = bench.slice(0, nJogos);
  engStart();
  let totalLances = 0, totalBri = 0, esperados = 0, achouEsperado = 0;
  const extras = [];
  const todos = [];       // contexto de TODO lance, para o tune offline
  for (let gi = 0; gi < jogos.length; gi++) {
    const b = jogos[gi];
    const c = new Chess();
    try { c.loadPgn(b.pgn, { strict: false }); } catch (e) { continue; }
    const hist = c.history({ verbose: true });
    const rep = new Chess(); const fens = [rep.fen()]; const mvs = [];
    for (const h of hist) { const m = rep.move(h.san); mvs.push(m); fens.push(rep.fen()); }
    const pos = [];
    for (let i = 0; i < fens.length; i++) pos.push(await evalPos(fens[i], depth, 2));
    esperados++;
    for (let i = 0; i < mvs.length; i++) {
      const uci = mvs[i].from + mvs[i].to + (mvs[i].promotion || "");
      const r = julgar(fens[i], uci, pos[i], pos[i + 1], i > 0 ? mvs[i - 1] : null);
      totalLances++;
      todos.push({ san: r.san, gameId: b.gameId, ply: i + 1, gabarito: uci === b.uci,
        fen: fens[i], uci, legal: r.ctx.legal, isBest: r.ctx.isBest, loss: r.ctx.loss,
        winBefore: r.ctx.winBefore, winAfter: r.ctx.winAfter, gapSegundo: r.ctx.gapSegundo,
        sac: r.ctx.sac, sacRisked: r.ctx.sac.risked, capturado: r.ctx.capturado,
        recaptura: r.ctx.recaptura, sacPrevio: r.ctx.sacPrevio });
      fs.writeFileSync(path.join(OUT,"jogos.json"), JSON.stringify(todos));
      if (r.cls === "brilhante") {
        totalBri++;
        const ehOEsperado = (i + 1) === b.ply || i === b.ply || (i + 1) === b.ply + 1;
        if (uci === b.uci) achouEsperado++;
        else extras.push(b.gameId + " lance " + (i + 1) + " " + r.san +
          " (risco " + r.ctx.sac.risked + ", perda " + r.ctx.loss.toFixed(1) + ", win " + r.ctx.winBefore.toFixed(0) + "→" + r.ctx.winAfter.toFixed(0) + ")");
      }
    }
    saveCache();
    process.stderr.write("  jogo " + (gi + 1) + "/" + jogos.length + " (" + totalBri + " brilhantes até agora)\n");
  }
  console.log("\n=== PRECISÃO em " + esperados + " partidas (" + totalLances + " lances) ===");
  console.log("brilhantes marcados: " + totalBri + " | dos quais o do gabarito: " + achouEsperado + " | extras: " + extras.length);
  console.log("média de extras por partida: " + (extras.length / esperados).toFixed(2));
  extras.slice(0, 30).forEach((e) => console.log("   + " + e));
  process.exit(0);
}

function tune() {
  const linhas = JSON.parse(fs.readFileSync(path.join(OUT,"recall.json"), "utf8"));
  const extras = fs.existsSync(path.join(OUT,"extras.json")) ? JSON.parse(fs.readFileSync(path.join(OUT,"extras.json"), "utf8")) : [];
  const grid = [];
  for (const perdaMax of [2, 3, 4, 5, 6])
    for (const riscoMin of [150, 200, 250, 300])
      for (const liquidoMin of [50, 100, 150, 200])
        for (const vitoriaMin of [8, 12, 20])
          for (const vitoriaMax of [95, 97, 99, 100]) {
            Object.assign(P.BRI, { perdaMax, riscoMin, liquidoMin, vitoriaMin, vitoriaMax });
            const hit = linhas.filter((l) => P.classifyMove(l) === "brilhante").length;
            const fp = extras.filter((l) => P.classifyMove(l) === "brilhante").length;
            grid.push({ perdaMax, riscoMin, liquidoMin, vitoriaMin, vitoriaMax, hit, fp });
          }
  grid.sort((a, b) => (b.hit - b.fp * 2) - (a.hit - a.fp * 2));
  console.log("melhores combinações (acertos - 2*falsos positivos):");
  grid.slice(0, 15).forEach((g) => console.log("  acerto " + String(g.hit).padStart(3) + "  fp " + String(g.fp).padStart(3) +
    "  perda≤" + g.perdaMax + " risco≥" + g.riscoMin + " líquido≥" + g.liquidoMin + " win≥" + g.vitoriaMin + " winAntes≤" + g.vitoriaMax));
}

const modo = process.argv[2] || "recall";
if (modo === "recall") recall(+(process.argv[3] || 16));
else if (modo === "precisao") precisao(+(process.argv[3] || 10), +(process.argv[4] || 16));
else if (modo === "tune") tune();
else if (modo === "relatorio") relatorioRecall(JSON.parse(fs.readFileSync(path.join(OUT,"recall.json"), "utf8")));
