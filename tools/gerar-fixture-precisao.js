/* Gera o caso congelado de precisão usado por tools/unit.js.
   ------------------------------------------------------------------
   O teste unitário de gameAccuracy() precisa de uma entrada REAL: as
   avaliações que o Stockfish deu à partida da Ópera na profundidade 12
   (com a segunda passada do app onde ela acontece) e a precisão de cada
   lance. Isso não dá para escrever à mão, e roubar do relatório salvo
   perderia casas decimais.

   Então este script roda o app de verdade, uma vez, e grava a entrada:
   abre o index.html no jsdom com o motor versionado em engine/, analisa
   a partida e captura S.positions / S.moves / S.perMove no instante em
   que o app chama gameAccuracy(). O resultado vai para
   tools/fixtures/opera-1858.json e daí em diante o teste é instantâneo
   e não depende de motor nenhum.

   Uso:  cd tools && node gerar-fixture-precisao.js
   (leva ~10 s; só precisa rodar de novo se a análise mudar de propósito) */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const ENGINE = path.join(ROOT, "engine", "stockfish-lite-single.js");
const PGN_PATH = path.join(ROOT, "docs", "exemplos", "opera-1858.pgn");
const DEST = path.join(__dirname, "fixtures", "opera-1858.json");
const PROF = 12;

/* A única alteração no app: um gancho que copia as três listas no
   momento exato da conta. Nada mais é tocado. */
const html = fs.readFileSync(HTML, "utf8").replace(
  "S.accuracy = gameAccuracy(S.positions, S.moves, S.perMove);",
  "window.__FIXT = { positions: S.positions, moves: S.moves, perMove: S.perMove };" +
  "S.accuracy = gameAccuracy(S.positions, S.moves, S.perMove);");
if (!/__FIXT/.test(html)) { console.error("gancho não encontrado no index.html"); process.exit(1); }

const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
  virtualConsole: vc, url: "http://localhost/" });
const { window } = dom;
window.Worker = class {
  constructor() {
    this.p = spawn("node", [ENGINE]);
    this.buf = "";
    this.p.stdout.on("data", (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line && this.onmessage) this.onmessage({ data: line });
      }
    });
  }
  postMessage(cmd) { this.p.stdin.write(cmd + "\n"); }
  terminate() { this.p.kill(); }
};

const $ = (id) => window.document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(300);
  $("btnLangPt").click(); await wait(50);
  const rotulo = $("btnAnalyze").textContent;
  $("pgnBox").value = fs.readFileSync(PGN_PATH, "utf8");
  $("btnLoadPgn").click(); await wait(200);
  $("depth").value = String(PROF);
  $("btnAnalyze").click();
  const t0 = Date.now();
  while ($("btnAnalyze").textContent !== rotulo && Date.now() - t0 < 600000) await wait(500);

  const f = window.__FIXT;
  if (!f) { console.error("a análise não chegou a calcular a precisão"); process.exit(1); }
  const precisao = [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent);
  const dados = {
    _origem: "docs/exemplos/opera-1858.pgn analisado pelo próprio app (jsdom + engine/stockfish-lite-single.js), profundidade " + PROF,
    _gerado_por: "node tools/gerar-fixture-precisao.js",
    _esperado_na_tela: precisao.join(" / "),
    prof: PROF,
    positions: f.positions.map((p) => (p ? { cp: p.cp, mate: p.mate, mateEnd: !!p.mateEnd } : null)),
    moves: f.moves.map((m) => ({ san: m.san, color: m.color })),
    perMove: f.perMove.map((pm) => (pm ? { cls: pm.cls, accuracy: pm.accuracy } : null)),
  };
  /* um item por linha: diff legível quando a análise mudar */
  const linhas = (lista) => "[\n  " + lista.map((x) => JSON.stringify(x)).join(",\n  ") + "\n ]";
  const texto = "{\n" + Object.entries(dados).map(([k, v]) =>
    ' ' + JSON.stringify(k) + ': ' + (Array.isArray(v) ? linhas(v) : JSON.stringify(v))).join(",\n") + "\n}\n";
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, texto);
  console.log("gravado:", DEST, "|", dados.positions.length, "posições,", dados.moves.length,
    "lances | precisão na tela:", dados._esperado_na_tela);
  process.exit(0);
})();
