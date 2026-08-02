/* Busca em grade dos parâmetros de "Brilhante" usando os dois conjuntos já medidos. */
const fs = require("fs");
const { Chess } = require("chess.js");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.PLYSCOPE_OUT || path.join(__dirname, "saida");
const BENCH = process.env.PLYSCOPE_BENCH || path.join(OUT, "bench.json");
const APP = path.join(ROOT, "src", "app.js");

function loadPure() {
  const src = fs.readFileSync(APP, "utf8");
  const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return src.slice(i, j); };
  const bloco = [
    cut("const CLS = {", "const CLS_ORDER"),
    "const CLS_ORDER = Object.keys(CLS).sort((a,b)=>CLS[a].ord-CLS[b].ord);",
    cut("function scoreToCp(", "function fmtEval("),
    cut("/* ---------- SEE simplificado", "/* ============================================================\n   Classificação de lances"),
    "return { classifyMove, BRI, PV_VAL };",
  ].join("\n");
  return new Function("Chess", bloco)(Chess);
}
const P = loadPure();

/* ---- enriquece com "recaptura" ---- */
const bench = JSON.parse(fs.readFileSync(BENCH, "utf8"));
const porJogo = new Map(bench.map((b) => [b.gameId + ":" + b.ply, b]));
const rec = JSON.parse(fs.readFileSync(path.join(OUT,"recall.json"), "utf8")).map((l) => {
  const b = porJogo.get(l.gameId + ":" + l.ply);
  let recaptura = false;
  if (b && b.pgn) {
    try {
      const c = new Chess(); c.loadPgn(b.pgn, { strict: false });
      const h = c.history({ verbose: true });
      const prev = h[l.ply - 2], cur = h[l.ply - 1];
      recaptura = !!(cur && cur.captured && prev && prev.captured && prev.to === cur.to);
    } catch (e) {}
  }
  return { ...l, recaptura };
});
const jogos = JSON.parse(fs.readFileSync(path.join(OUT,"jogos.json"), "utf8"));
for (let i = 0; i < jogos.length; i++) {
  const p = jogos[i - 1];
  jogos[i].recaptura = !!(jogos[i].capturado && p && p.gameId === jogos[i].gameId &&
    p.capturado && p.uci.slice(2, 4) === jogos[i].uci.slice(2, 4));
}
const normais = jogos.filter((l) => !l.gabarito);
const gabJogos = jogos.filter((l) => l.gabarito);

/* ---- grade ---- */
const G = {
  perdaMax: [3, 4, 5, 6, 8],
  riscoMin: [150, 200, 250, 300],
  liquidoMin: [50, 100, 150, 200],
  winAntesMin: [0, 30, 40, 45],
  winDepoisMin: [20, 30, 35, 42],
  vitoriaMax: [97, 100],
};
const base = { ...P.BRI };
const res = [];
for (const perdaMax of G.perdaMax) for (const riscoMin of G.riscoMin)
for (const liquidoMin of G.liquidoMin) for (const winAntesMin of G.winAntesMin)
for (const winDepoisMin of G.winDepoisMin) for (const vitoriaMax of G.vitoriaMax) {
  Object.assign(P.BRI, base, { perdaMax, riscoMin, liquidoMin, winAntesMin, winDepoisMin, vitoriaMax });
  const hit = rec.filter((l) => P.classifyMove(l) === "brilhante").length;
  const fp = normais.filter((l) => P.classifyMove(l) === "brilhante").length;
  const hit2 = gabJogos.filter((l) => P.classifyMove(l) === "brilhante").length;
  res.push({ perdaMax, riscoMin, liquidoMin, winAntesMin, winDepoisMin, vitoriaMax, hit, hit2, fp,
    score: hit + hit2 * 2 - fp * 3 });
}
res.sort((a, b) => b.score - a.score || a.fp - b.fp);
console.log("100 brilhantes do gabarito | 8 brilhantes nas partidas completas | " + normais.length + " lances normais");
console.log("acerto  gab8  falsos  |  perda≤  risco≥  líquido≥  winAntes≥  winDepois≥  winAntes≤");
for (const r of res.slice(0, 18))
  console.log(String(r.hit).padStart(5), String(r.hit2).padStart(5), String(r.fp).padStart(6), "   |",
    String(r.perdaMax).padStart(5), String(r.riscoMin).padStart(6), String(r.liquidoMin).padStart(8),
    String(r.winAntesMin).padStart(10), String(r.winDepoisMin).padStart(11), String(r.vitoriaMax).padStart(9));
Object.assign(P.BRI, base);
console.log("\nparâmetros atuais do app:", JSON.stringify(base));
console.log("  ->", rec.filter((l) => P.classifyMove(l) === "brilhante").length + "/100,",
  gabJogos.filter((l) => P.classifyMove(l) === "brilhante").length + "/8,",
  normais.filter((l) => P.classifyMove(l) === "brilhante").length + " falsos positivos");
console.log("\nfalsos positivos atuais:");
normais.filter((l) => P.classifyMove(l) === "brilhante").forEach((l) =>
  console.log("   " + l.san + "  risco " + l.sacRisked + "  perda " + l.loss.toFixed(1) +
    "  win " + l.winBefore.toFixed(0) + "→" + l.winAfter.toFixed(0)));
