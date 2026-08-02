/* Teste ponta a ponta do app em jsdom, com Stockfish real via processo Node. */
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const { spawn } = require("child_process");

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const ENGINE = path.join(ROOT, "engine", "stockfish-lite-single.js");

const PGN = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : `
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

(async () => {
  await wait(300);
  console.log("== carregando PGN ==");
  $("pgnBox").value = PGN;
  $("btnLoadPgn").click();
  await wait(200);

  const nMoves = window.document.querySelectorAll(".mv").length;
  console.log("lances na lista:", nMoves);
  console.log("peças no tabuleiro (posição inicial):", $("gPieces").childNodes.length);
  console.log("jogadores:", $("nmBot").textContent, "vs", $("nmTop").textContent);

  console.log("== analisando (profundidade 12) ==");
  $("depth").value = "12";
  $("btnAnalyze").click();

  const t0 = Date.now();
  while ($("btnAnalyze").textContent !== "Analisar partida" && Date.now() - t0 < 600000) await wait(1000);
  console.log("tempo total:", ((Date.now() - t0) / 1000).toFixed(1) + "s");

  console.log("\n== relatório ==");
  [...window.document.querySelectorAll(".report-grid .r")].forEach((r) => {
    const c = r.children;
    console.log("  brancas " + c[0].textContent.trim().padStart(3) +
      "  " + c[1].textContent.trim().padEnd(12) + " pretas " + c[2].textContent.trim());
  });
  console.log("  precisão:", [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / "));
  console.log("  " + [...window.document.querySelectorAll("[data-goto]")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).join("\n  "));

  console.log("\n== lances classificados ==");
  const rows = [...window.document.querySelectorAll(".mv")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
  console.log(rows.join(" | "));

  console.log("\n== amostra interna ==");
  // navega até o fim e checa desenho
  $("btnEnd").click();
  await wait(100);
  console.log("setas desenhadas:", $("gArrows").childNodes.length, "| selo:", $("gBadge").childNodes.length);
  $("btnPrev").click(); await wait(50);
  console.log("aba motor:", $("engineLines").textContent.replace(/\s+/g, " ").trim().slice(0, 200));

  console.log("\n== interações ==");
  $("btnFlip").click(); await wait(50);
  console.log("flip: barra altura =", $("evalWhite").style.height, "| ancora top =", $("evalWhite").style.top);
  $("btnFlip").click(); await wait(50);

  // clique numa peça e depois num destino legal (modo exploração)
  $("btnStart").click(); await wait(30);
  const click = (sq) => {
    const f = "abcdefgh".indexOf(sq[0]), r = 8 - +sq[1];
    const ev = new window.MouseEvent("click", { clientX: f * 100 + 50, clientY: r * 100 + 50, bubbles: true });
    Object.defineProperty(ev, "currentTarget", { value: $("board") });
    $("board").dispatchEvent(ev);
  };
  $("board").getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800 });
  click("e2"); await wait(30);
  console.log("após clicar e2 — realces:", $("gHigh").childNodes.length);
  click("e4"); await wait(2500);
  console.log("modo exploração ativo:", $("exploreBar").className,
    "| barra:", $("evalWhite").style.height, "| motor:", $("engineLines").textContent.replace(/\s+/g," ").trim().slice(0,80));

  // clique num lance da linha do motor
  const pv = window.document.querySelector(".pvmove");
  if (pv) { pv.click(); await wait(1500); console.log("clique na PV ok — peças:", $("gPieces").childNodes.length); }
  else console.log("PV sem lances clicáveis");

  $("btnBackToGame").click(); await wait(50);

  // play automático
  $("btnStart").click(); await wait(30);
  $("speed").value = "600";
  $("btnPlay").click(); await wait(1400);
  const plyAgora = () => (window.document.querySelector(".mv.on") || { dataset: {} }).dataset.ply;
  console.log("play ligado:", $("btnPlay").className.includes("on"), "| lance atual:", plyAgora());
  $("btnPlay").click(); await wait(700);
  console.log("play desligado:", !$("btnPlay").className.includes("on"), "| parou no lance:", plyAgora());
  $("btnNext").click(); await wait(30);
  console.log("navegação manual ainda funciona:", plyAgora());
  $("btnSound").click(); console.log("mudo:", $("btnSound").className.includes("off"));
  $("btnSound").click();

  /* ================= análises salvas ================= */
  console.log("\n== análises salvas ==");
  const CHAVE = "plyscope.analises.v1";
  const bruto = window.localStorage.getItem(CHAVE);
  const lista = JSON.parse(bruto || "[]");
  console.log("salva automaticamente ao fim da análise:", lista.length === 1,
    "| chave:", CHAVE, "| total no armazenamento:", (bruto || "").length + " B");
  const rec = lista[0] || {};
  const bytes = JSON.stringify(rec).length;
  console.log("uma análise de", (rec.pm || []).length, "lances ocupa", bytes, "B",
    "(" + (bytes / 1024).toFixed(1) + " KB) · ~" +
    Math.round((bytes / Math.max(1, (rec.pm || []).length)) * 80 / 1024 * 10) / 10 + " KB por 80 lances");
  console.log("sem pv guardada:", !/\"pv\"/.test(bruto || "") && !/[a-h][1-8][a-h][1-8] [a-h][1-8]/.test(bruto || ""));
  const itens = window.document.querySelectorAll("#savedList .saved");
  console.log("itens na lista de salvas:", itens.length, "|",
    (itens[0] || { textContent: "" }).textContent.replace(/\s+/g, " ").trim());

  // limpa a tela recarregando o PGN cru: sem selos, sem precisão
  $("btnLoadPgn").click(); await wait(200);
  const selosAntes = window.document.querySelectorAll(".mv .ic").length;
  console.log("depois de recarregar o PGN cru — selos:", selosAntes,
    "| precisão:", window.document.querySelectorAll(".accbox .v").length);

  // reabre a análise salva: nada de motor
  const goAntes = buscasNoMotor;
  window.document.querySelector("#savedList [data-open]").click();
  await wait(300);
  const selosDepois = window.document.querySelectorAll(".mv .ic").length;
  console.log("reaberta — selos:", selosDepois, "| precisão:",
    [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / "),
    "| buscas no motor:", buscasNoMotor - goAntes);
  console.log("restaurou tudo sem o motor:",
    selosAntes === 0 && selosDepois > 0 && buscasNoMotor - goAntes === 0);
  console.log("aba ativa após reabrir:",
    (window.document.querySelector(".tabs button.on") || {}).textContent,
    "| gráfico presente:", !!$("graph"), "| botões de exportar visíveis:", $("exportRow").style.display === "");
  console.log("sem duplicar ao reabrir:",
    JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length === 1);

  /* ================= exportar PGN comentado ================= */
  console.log("\n== PGN comentado ==");
  const BlobReal = window.Blob;
  let capturado = null;
  window.Blob = function (partes, opts) { capturado = { partes, opts }; return new BlobReal(partes, opts); };
  try { window.URL.createObjectURL = () => "blob:teste"; window.URL.revokeObjectURL = () => {}; } catch (e) {}
  $("btnExportPgn").click(); await wait(100);
  const pgnAnot = capturado ? capturado.partes.join("") : "";
  console.log("tipo do arquivo:", capturado && capturado.opts && capturado.opts.type);
  console.log("tem [Annotator \"Plyscope\"]:", /\[Annotator "Plyscope"\]/.test(pgnAnot));
  console.log("tem cabeçalhos originais:", /\[White "/.test(pgnAnot) && /\[Black "/.test(pgnAnot));
  const comentarios = pgnAnot.match(/\{[^}]*\}/g) || [];
  const comEval = comentarios.filter((c) => /\[%eval (-?\d+\.\d\d|#-?\d+)\]/.test(c));
  console.log("comentários:", comentarios.length, "| com [%eval] inteiro numa linha:", comEval.length,
    "| lances:", window.document.querySelectorAll(".mv").length,
    "| sem eval (mate no tabuleiro):", comentarios.length - comEval.length);
  const nags = (pgnAnot.match(/\$\d+/g) || []);
  console.log("NAGs usados:", [...new Set(nags)].sort().join(" ") || "(nenhum)", "| total:", nags.length);
  console.log("comentário de erro tem a perda:",
    /\{ \[%eval [^\]]+\] (Impreciso|Erro|Capivarada)[^}]*perdeu \d+% de chance de vitória/.test(pgnAnot));
  console.log("linhas com mais de 80 colunas:", pgnAnot.split("\n").filter((l) => l.length > 80).length);
  // o PGN gerado tem que voltar a ser lido por um parser de verdade
  try {
    const c2 = new (require("chess.js").Chess)();
    c2.loadPgn(pgnAnot, { strict: false });
    console.log("relido por chess.js:", c2.history().length, "lances");
  } catch (e) { console.log("relido por chess.js: FALHOU —", e.message); }
  console.log("--- primeiras 10 linhas ---");
  console.log(pgnAnot.split("\n").slice(0, 10).join("\n"));
  console.log("--- início dos lances ---");
  console.log((pgnAnot.split("\n\n")[1] || "").split("\n").slice(0, 6).join("\n"));
  console.log("---");
  window.Blob = BlobReal;

  /* ================= exportar imagem ================= */
  console.log("\n== imagem do relatório ==");
  // 1) do jeito que o jsdom é de fábrica: sem getContext, o app só avisa
  $("btnExportPng").click(); await wait(100);
  console.log("sem canvas o app não quebra — aviso:", $("toast").textContent);

  // 2) com um contexto 2D de mentira, para rodar o desenho de verdade
  const desenho = { fill: 0, stroke: 0, arc: 0, fillRect: 0, textos: [] };
  const nada = () => {};
  const ctx2d = {
    save: nada, restore: nada, scale: nada, translate: nada, clip: nada, rect: nada,
    beginPath: nada, closePath: nada, moveTo: nada, lineTo: nada, arcTo: nada,
    clearRect: nada, strokeRect: nada, strokeText: nada,
    arc: () => desenho.arc++, fill: () => desenho.fill++, stroke: () => desenho.stroke++,
    fillRect: () => desenho.fillRect++,
    fillText: (t) => desenho.textos.push(String(t)),
    measureText: (t) => ({ width: String(t).length * 7 }),
  };
  let png = null;
  window.HTMLCanvasElement.prototype.getContext = function () { return ctx2d; };
  window.HTMLCanvasElement.prototype.toBlob = function (cb, tipo) {
    png = { w: this.width, h: this.height, tipo };
    cb(new window.Blob(["png"], { type: tipo || "image/png" }));
  };
  $("btnExportPng").click(); await wait(100);
  console.log("PNG gerado:", !!png, "| dimensões:", png && png.w + "x" + png.h,
    "(devicePixelRatio mínimo 2) | tipo:", png && png.tipo, "|", $("toast").textContent);
  console.log("desenhou — fundo opaco:", desenho.fillRect > 0, "| formas preenchidas:", desenho.fill,
    "| círculos (selos + erros no gráfico):", desenho.arc, "| textos:", desenho.textos.length);
  const txt = desenho.textos.join(" | ");
  console.log("mostra nome do app:", /Plyscope/.test(txt),
    "| os dois jogadores:", txt.indexOf("Paul Morphy") >= 0 && /Duque Karl/.test(txt),
    "| precisão:", /precisão \(%\)/.test(txt) && txt.indexOf("96.2") >= 0 && txt.indexOf("83.0") >= 0,
    "| tipos de lance:", /Brilhante/.test(txt) && /Impreciso/.test(txt));

  /* ================= armazenamento com problema ================= */
  console.log("\n== armazenamento recusando gravação ==");
  const proto = window.Storage.prototype;
  const setReal = proto.setItem, remReal = proto.removeItem;
  const erroCota = () => { const e = new Error("cheio"); e.name = "QuotaExceededError"; throw e; };
  proto.setItem = erroCota; proto.removeItem = erroCota;
  let quebrou = false;
  try { window.document.querySelector("#savedList [data-del]").click(); } catch (e) { quebrou = true; }
  await wait(50);
  proto.setItem = setReal; proto.removeItem = remReal;
  console.log("QuotaExceededError derrubou o app:", quebrou,
    "| registro intacto:", JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length === 1,
    "| aviso:", $("toast").textContent);
  console.log("navegação continua funcionando:", ($("btnNext").click(), true),
    "| lances na lista:", window.document.querySelectorAll(".mv").length);

  /* ================= apagar ================= */
  window.document.querySelector("#savedList [data-del]").click(); await wait(50);
  console.log("\n== apagar ==");
  console.log("registros após apagar:", JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length,
    "| itens na lista:", window.document.querySelectorAll("#savedList .saved").length,
    "| aviso:", $("savedHint").textContent.slice(0, 30) + "…");

  $("btnCopyFen").click(); $("btnCopyPgn").click(); await wait(50);
  console.log("copiar sem clipboard:", $("toast").textContent);
  ["import","report","moves","engine"].forEach((t) => window.document.querySelector('[data-tab="'+t+'"]').click());
  console.log("abas OK");
  process.exit(0);
})();
