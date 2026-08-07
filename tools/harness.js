/* Teste ponta a ponta do app em jsdom, com Stockfish real via processo Node. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const { spawn } = require("child_process");

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const ENGINE = path.join(ROOT, "engine", "stockfish-lite-single.js");

const PGN = process.env.PLYSCOPE_PGN || process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : `
[Event "Teste"]
[White "Jhony"]
[Black "Adversario"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4
8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 O-O
14. Nxh7 Kxh7 15. Qh5+ Kg8 16. Rh4 f5 17. Qh7# 1-0`;

const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.error("JSDOM ERR:", e.message));
vc.on("error", (...a) => console.error("console.error:", ...a));

const dom = new JSDOM(fs.readFileSync(HTML, "utf8"), {
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/",
});
const { window } = dom;

/* --- stub de Worker: engine real rodando como processo --- */
let buscasNoMotor = 0;              // quantos "go ..." o app pediu ao motor
/* Esta suíte fixa o caminho de UM motor: é ele que os números do relatório
   congelam (96,2 / 83,0 na Ópera). O pool tem cobertura própria em test-pool.js,
   com motor de mentira e avaliação determinística — aqui ele só somaria N
   processos de Stockfish concorrendo pelos mesmos núcleos e tornaria a suíte
   lenta e sensível à máquina. jsdom não define hardwareConcurrency; fixamos em 2,
   que é o que o Pool.planeja() já recusa por "poucos núcleos". */
Object.defineProperty(window.navigator, "hardwareConcurrency", { value: 2, configurable: true });

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
  postMessage(cmd) { if (/^go\b/.test(cmd)) buscasNoMotor++; this.p.stdin.write(cmd + "\n"); }
  terminate() { this.p.kill(); }
};

const $ = (id) => window.document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- asserções ----------
   Toda conferência passa por aqui: o resultado vai para `ok`, sai no
   resumo do fim e UMA falha derruba a suíte (exit 1). Enquanto isto era
   só console.log, a suíte imprimia "FALHOU" e saía com código 0 — que é
   o mesmo que não ter teste. */
const ok = [];
const conf = (rot, cond, extra) => {
  ok.push(!!cond);
  console.log(" ", (cond ? "ok  " : "FALHOU ") + rot, extra === undefined ? "" : extra);
  return !!cond;
};
/* Os números exatos (33 lances, 96,2 / 83,0, 3 brilhantes) são da partida
   da Ópera; com outro PGN só valem as conferências que não dependem dela. */
const OPERA = /Paul Morphy/.test(PGN);
const t1 = (el) => (el || { textContent: "" }).textContent.replace(/\s+/g, " ").trim();


/* onde o app guarda as análises salvas — as duas suítes espiam esta chave */
const CHAVE = "plyscope.analises.v1";

/* jsdom não faz layout: sem isto, o clique no tabuleiro não vira casa
   (o app converte pixel → casa por getBoundingClientRect). 800×800 é o
   viewBox do SVG, então pixel e unidade coincidem. */
const board = window.document.getElementById("board");
if (board) board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800 });

module.exports = { window, dom, $: $, wait, ok, conf, PGN, OPERA, t1, CHAVE,
  buscas: () => buscasNoMotor, zeraBuscas() { buscasNoMotor = 0; } };
