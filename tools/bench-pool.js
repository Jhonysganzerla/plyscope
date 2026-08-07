/* Mede o ganho real do pool de motores — com o Stockfish de verdade.
   ------------------------------------------------------------------
   Sem número medido não existe afirmação de desempenho. Este script roda
   a MESMA análise da MESMA partida pelos dois caminhos, na mesma máquina,
   um depois do outro, e imprime os tempos lado a lado.

   Como funciona: abre o index.html no jsdom (o app inteiro, sem recorte),
   com o motor versionado em engine/ rodando como processo Node no lugar
   do Web Worker. A única coisa que muda entre uma configuração e outra é
   `navigator.hardwareConcurrency` — quem decide o tamanho do pool
   continua sendo o código de produção (Pool.planeja), não o teste.

   Cada configuração roda num PROCESSO SEPARADO: um app por medição, sem
   motor da rodada anterior sobrando na CPU.

       cd tools && node bench-pool.js
       node bench-pool.js ../docs/exemplos/opera-1858.pgn 12 2,4,5,9

   Argumentos: PGN, profundidade, lista de NÚCLEOS a fingir. Quem traduz
   núcleos em número de motores é Pool.planeja() no app — 2 núcleos caem
   no caminho antigo, 4 núcleos dão 3 motores, 9 núcleos batem no teto 6.
   O 4º argumento finge `navigator.deviceMemory` (GB): abaixo de 4 GB o
   orçamento de memória do app aperta o pool para 2 motores, e é assim que
   se mede um pool pequeno numa máquina pequena.

   O que sai por configuração:
     tempo      relógio de parede da análise inteira (as duas passadas)
     aquecimento  do clique até o primeiro "go" (subir os motores)
     motores    quantos workers o app criou
     pico       máximo de buscas EM VOO ao mesmo tempo (a prova do paralelismo)
     precisão / selos   para conferir que os números continuam de pé
*/
const fs = require("fs");
const path = require("path");
const { spawn, fork } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const ENGINE = path.join(ROOT, "engine", "stockfish-lite-single.js");

const PGN_PATH = process.argv[2] || path.join(ROOT, "docs", "exemplos", "opera-1858.pgn");
const PROF = process.argv[3] || "12";
const CONFIGS = (process.argv[4] || "2,4,5,9").split(",").map((s) => +s.trim());   // núcleos
const MEM_GB = process.argv[5] ? +process.argv[5] : null;   // navigator.deviceMemory, opcional

/* ================= filho: uma medição ================= */
if (process.env.BENCH_N !== undefined) {
  const { JSDOM, VirtualConsole } = require("jsdom");
  const N = +process.env.BENCH_N;

  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  const dom = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/",
  });
  const { window } = dom;

  /* Só isto muda entre uma configuração e outra. Quantos motores subir a
     partir daqui é decisão do app (Pool.planeja), não do teste. */
  Object.defineProperty(window.navigator, "hardwareConcurrency", { value: N, configurable: true });
  if (MEM_GB) Object.defineProperty(window.navigator, "deviceMemory", { value: MEM_GB, configurable: true });

  let criados = 0, emVoo = 0, pico = 0, buscas = 0, primeiroGo = 0;
  const vivos = new Set();
  window.Worker = class {
    constructor() {
      criados++;
      this.p = spawn("node", [ENGINE]);
      vivos.add(this.p);
      this.buf = "";
      this.p.stdout.on("data", (d) => {
        this.buf += d.toString();
        let i;
        while ((i = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (!line) continue;
          if (line.startsWith("bestmove")) { emVoo--; }
          if (this.onmessage) this.onmessage({ data: line });
        }
      });
    }
    postMessage(cmd) {
      if (/^go\b/.test(cmd)) {
        buscas++;
        if (!primeiroGo) primeiroGo = Date.now();
        emVoo++;
        if (emVoo > pico) pico = emVoo;
      }
      this.p.stdin.write(cmd + "\n");
    }
    terminate() { vivos.delete(this.p); this.p.kill(); }
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

    const t0 = Date.now();
    $("btnAnalyze").click();
    while ($("btnAnalyze").textContent !== rotulo && Date.now() - t0 < 900000) await wait(100);
    const ms = Date.now() - t0;

    const prec = [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / ");
    const selos = [...window.document.querySelectorAll(".mv .ic title")].map((e) => e.textContent.trim());
    const cps = [...window.document.querySelectorAll(".mv .ev")].map((e) => e.textContent.trim());
    const modo = (($("engineMode") || {}).textContent || "").trim();
    process.send({
      n: N, ms, aquecimento: primeiroGo ? primeiroGo - t0 : 0,
      criados, pico, buscas, prec, selos: selos.join(" "), cps: cps.join(" "),
      modo, noLote: +((modo.match(/(\d+) (?:motores|engines)/) || [])[1] || 1),
    }, () => {                       // só sai depois que a medição chegou ao pai
      vivos.forEach((p) => p.kill());
      process.exit(0);
    });
  })();
  return;
}

/* ================= pai: roda as configurações ================= */
const roda = (n) => new Promise((resolve, reject) => {
  const f = fork(__filename, process.argv.slice(2), { env: { ...process.env, BENCH_N: String(n) } });
  let r = null;
  const prazo = setTimeout(() => { f.kill("SIGKILL"); }, 15 * 60 * 1000);
  f.on("message", (m) => { r = m; });
  f.on("exit", (c) => {
    clearTimeout(prazo);
    // uma pausa entre configurações: sem motor da rodada anterior na CPU
    setTimeout(() => (r ? resolve(r) : reject(new Error("configuração " + n + " saiu com " + c))), 1500);
  });
});

(async () => {
  console.log("partida:", path.basename(PGN_PATH), "| profundidade:", PROF);
  console.log("núcleos desta máquina:", require("os").cpus().length);
  console.log("");
  const saidas = [];
  for (const n of CONFIGS) {
    const r = await roda(n);
    saidas.push(r);
    const rot = n + " núcleos → " + (r.noLote > 1 ? "pool de " + r.noLote : "motor único (caminho antigo)");
    console.log("== " + rot + " ==");
    console.log("  tempo ..........", (r.ms / 1000).toFixed(1) + "s");
    console.log("  aquecimento ....", (r.aquecimento / 1000).toFixed(1) + "s (clique → 1ª busca)");
    console.log("  motores no lote.", r.noLote, "| workers criados (com o interativo):", r.criados);
    console.log("  buscas .........", r.buscas, "| PICO DE BUSCAS EM VOO:", r.pico);
    console.log("  precisão .......", r.prec);
    console.log("  aba motor ......", r.modo.trim());
  }
  const base = saidas[0];
  console.log("\n== comparação (base: " + base.n + " núcleos, " + base.noLote + " motor(es) no lote) ==");
  for (const r of saidas) {
    const g = base.ms / r.ms;
    console.log("  " + String(r.n + " núcleos / " + r.noLote + " motores").padEnd(24),
      (r.ms / 1000).toFixed(1) + "s", " ganho:", g.toFixed(2) + "x",
      " precisão:", r.prec,
      " selos iguais à base:", r.selos === base.selos ? "sim" : "NÃO");
  }
})().catch((e) => { console.error(e); process.exit(1); });
