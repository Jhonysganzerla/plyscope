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

  /* O jsdom se apresenta como en-US, então o app abre em inglês. O teste
     analisa em português e só depois troca de idioma, que é o percurso a
     conferir; a escolha fica guardada no localStorage como a de um usuário. */
  console.log("== idioma ==");
  console.log("navigator.language:", window.navigator.language,
    "| idioma deduzido:", window.document.documentElement.lang,
    "| botão analisar:", $("btnAnalyze").textContent.trim());
  $("btnLangPt").click();
  await wait(50);
  const ROTULO_ANALISAR = $("btnAnalyze").textContent;
  console.log("depois de escolher PT:", window.document.documentElement.lang,
    "|", ROTULO_ANALISAR, "| guardado:", window.localStorage.getItem("plyscope.idioma"));

  console.log("\n== carregando PGN ==");
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
  while ($("btnAnalyze").textContent !== ROTULO_ANALISAR && Date.now() - t0 < 600000) await wait(1000);
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
  /* as linhas do motor continuam fora do registro; a única variação guardada
     é a das posições de erro, que é a resposta do treino (ver "treino" abaixo) */
  console.log("sem as linhas do motor:", !/"pv"/.test(bruto || ""),
    "| variação guardada:", rec.pvt ? Object.keys(rec.pvt).length + " posições de erro"
                                    : "(esta partida não tem erro grave)");
  const itens = window.document.querySelectorAll("#savedList .saved");
  console.log("itens na lista de salvas:", itens.length, "|",
    (itens[0] || { textContent: "" }).textContent.replace(/\s+/g, " ").trim());

  /* ================= troca de idioma com a análise na tela ================= */
  console.log("\n== troca de idioma (com análise aberta) ==");
  const txt1 = (el) => (el || { textContent: "" }).textContent.replace(/\s+/g, " ").trim();
  const foto = () => ({
    lang:      window.document.documentElement.lang,
    titulo:    window.document.title,
    tagline:   txt1(window.document.querySelector(".brand-txt span")),
    analisar:  txt1($("btnAnalyze")),
    nova:      txt1($("btnNew")),
    prof:      [...$("depth").options].map((o) => o.text).join("|"),
    profVal:   $("depth").value,
    vel:       [...$("speed").options].map((o) => o.text).join("|"),
    velVal:    $("speed").value,
    abas:      [...window.document.querySelectorAll(".tabs button")].map((b) => b.textContent.trim()).join("|"),
    abertura:  txt1(window.document.querySelector(".opening .nm")),
    teoria:    txt1(window.document.querySelector(".opening .hint")),
    relLbl:    [...window.document.querySelectorAll(".report-grid .lbl")].map((e) => e.textContent.trim()).join(", "),
    relUnid:   txt1(window.document.querySelector(".accbox .u")),
    precisao:  [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent.trim()).join(" / "),
    momentos:  [...window.document.querySelectorAll("[data-goto] .hint")].map((e) => e.textContent.trim()).join(" | "),
    grafico:   txt1(window.document.querySelector(".caption")),
    selos:     [...window.document.querySelectorAll(".mv .ic title")].map((e) => e.textContent.trim()),
    nSelos:    window.document.querySelectorAll(".mv .ic").length,
    san:       [...window.document.querySelectorAll(".mv span:not(.ev)")].map((e) => e.textContent.trim()).join(" "),
    ply:       (window.document.querySelector(".mv.on") || { dataset: {} }).dataset.ply,
    legenda:   $("legend").textContent.replace(/\s+/g, " ").trim(),
    capiTip:   ([...$("legend").querySelectorAll("span")].pop() || { getAttribute: () => "" }).getAttribute("title"),
    salvasDica: txt1($("savedHint")),
    salvasItem: txt1($("savedList")),
    exportar:  txt1($("btnExportPgn")) + " / " + txt1($("btnExportPng")),
    motorAba:  txt1($("engineLines")).slice(0, 60),
  });

  const pt1 = foto();
  $("btnLangEn").click(); await wait(150);
  const en = foto();

  const par = (rot, a, b) => console.log("  " + (rot + ":").padEnd(15), a, "\n" + " ".repeat(18) + "→", b);
  par("html lang", pt1.lang, en.lang);
  par("title", pt1.titulo, en.titulo);
  par("topo", pt1.tagline + " · " + pt1.analisar + " · " + pt1.nova,
              en.tagline + " · " + en.analisar + " · " + en.nova);
  par("profundidade", pt1.prof, en.prof);
  par("velocidade", pt1.vel, en.vel);
  par("abas", pt1.abas, en.abas);
  par("abertura", pt1.abertura + " · " + pt1.teoria, en.abertura + " · " + en.teoria);
  par("relatório", pt1.relLbl, en.relLbl);
  par("unidade", pt1.relUnid, en.relUnid);
  par("gráfico", pt1.grafico, en.grafico);
  par("momento nº1", pt1.momentos.split(" | ")[0] || "(a partida não tem)",
                     en.momentos.split(" | ")[0] || "(a partida não tem)");
  par("selos (6)", pt1.selos.slice(0, 6).join(" "), en.selos.slice(0, 6).join(" "));
  par("legenda", pt1.legenda, en.legenda);
  par("salvas", pt1.salvasDica.slice(0, 46) + "…", en.salvasDica.slice(0, 46) + "…");
  par("salvas (item)", pt1.salvasItem, en.salvasItem);
  par("exportar", pt1.exportar, en.exportar);

  const mudou = (a, b) => !!a && !!b && a !== b;
  console.log("  TOPO mudou:", mudou(pt1.titulo, en.titulo) && mudou(pt1.tagline, en.tagline) &&
    mudou(pt1.analisar, en.analisar) && mudou(pt1.nova, en.nova) && mudou(pt1.prof, en.prof) &&
    mudou(pt1.vel, en.vel), "| <html lang>:", pt1.lang, "→", en.lang);
  console.log("  ABAS mudaram:", mudou(pt1.abas, en.abas));
  console.log("  RELATÓRIO mudou:", mudou(pt1.relLbl, en.relLbl) && mudou(pt1.relUnid, en.relUnid) &&
    mudou(pt1.grafico, en.grafico) && mudou(pt1.abertura, en.abertura),
    "| momentos decisivos:", pt1.momentos ? mudou(pt1.momentos, en.momentos) : "(esta partida não tem)");
  console.log("  SELOS DA LISTA mudaram:", mudou(pt1.selos.join("|"), en.selos.join("|")));
  console.log("  ANÁLISES SALVAS mudaram:", mudou(pt1.salvasDica, en.salvasDica) && mudou(pt1.salvasItem, en.salvasItem));
  console.log("  Capivarada nas duas línguas:",
    /Capivarada/.test(pt1.legenda) && /Capivarada/.test(en.legenda),
    "| tooltip pt:", JSON.stringify(pt1.capiTip), "| en:", JSON.stringify(en.capiTip));

  console.log("  ANÁLISE INTACTA — selos:", pt1.nSelos, "→", en.nSelos,
    "| SAN idêntico:", pt1.san === en.san,
    "| lance selecionado:", pt1.ply === en.ply,
    "| momentos decisivos:", pt1.momentos.split(" | ").length === en.momentos.split(" | ").length);
  console.log("  mesma precisão, formato de cada língua:", pt1.precisao, "→", en.precisao,
    "|", pt1.precisao.replace(/,/g, ".") === en.precisao && pt1.precisao !== en.precisao);
  console.log("  seleções preservadas — profundidade:", pt1.profVal === en.profVal, en.profVal,
    "| velocidade:", pt1.velVal === en.velVal, en.velVal);

  // sobras: palavras que não podem sobrar na tela em modo inglês
  const RESTOS = ["precisão", "Precisão", "análise", "Análise", "Partida", "partida", "lance",
                  "Brancas", "Pretas", "Relatório", "Importar", "Nenhuma", "perdeu", "teoria",
                  "Momentos", "Legenda", "Buscar", "Carregar", "Apagar", "Voltar", "Analisar"];
  const naTela = window.document.querySelector(".app").textContent.replace(/\s+/g, " ");
  const sobras = RESTOS.filter((w) => naTela.indexOf(w) >= 0);
  console.log("  sobras em português na tela em inglês:", sobras.length ? sobras.join(", ") : "(nenhuma)");

  $("btnLangPt").click(); await wait(150);
  const pt2 = foto();
  const voltou = JSON.stringify(pt1) === JSON.stringify(pt2);
  console.log("  de volta ao português, tela idêntica à de antes:", voltou);
  if (!voltou) {
    Object.keys(pt1).forEach((k) => {
      if (JSON.stringify(pt1[k]) !== JSON.stringify(pt2[k]))
        console.log("    difere:", k, JSON.stringify(pt1[k]), "≠", JSON.stringify(pt2[k]));
    });
  }
  console.log("  idioma guardado:", window.localStorage.getItem("plyscope.idioma"));

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

  // os comentários seguem o idioma ativo; notação e NAG não
  $("btnLangEn").click(); await wait(80);
  capturado = null;
  $("btnExportPgn").click(); await wait(100);
  const pgnEn = capturado ? capturado.partes.join("") : "";
  console.log("exportado em inglês — comentário de erro:",
    /\{ \[%eval [^\]]+\] (Inaccuracy|Mistake|Capivarada)[^}]*gave up \d+% winning chances/.test(pgnEn));
  console.log("  NAGs idênticos:", (pgnEn.match(/\$\d+/g) || []).join(" ") === nags.join(" "),
    "| lances idênticos:",
    (pgnEn.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ")) === (pgnAnot.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ")));
  console.log("  amostra:", (pgnEn.match(/\{[^}]*(gave up|better was)[^}]*\}/) || ["(nenhuma)"])[0]);
  $("btnLangPt").click(); await wait(80);
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
    "| precisão:", /precisão \(%\)/.test(txt) && /\b96,2\b/.test(txt) && /\b83,0\b/.test(txt),
    "| tipos de lance:", /Brilhante/.test(txt) && /Impreciso/.test(txt));
  console.log("números e data no formato pt-BR:", /96,2/.test(txt) && /02\/11\/1858/.test(txt),
    "| trechos:", (txt.match(/9\d,\d|8\d,\d|\d\d\/\d\d\/\d{4}/g) || []).join(" "));

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

  /* ================= treino: aprenda com seus erros =================
     A partida da Ópera não tem Erro nem Capivarada (o Duque só foi
     impreciso), então o treino é exercitado numa segunda partida: o
     final da Imortal, que começa por um FEN e tem erro dos dois lados. */
  console.log("\n== treino: aprenda com seus erros ==");
  const t1 = (el) => (el || { textContent: "" }).textContent.replace(/\s+/g, " ").trim();
  const errosDaTela = () => [...window.document.querySelectorAll(".mv")]
    .filter((e) => /^(Erro|Capivarada)$/.test(t1(e.querySelector(".ic title"))))
    .map((e) => +e.dataset.ply);

  window.document.querySelector('[data-tab="report"]').click();
  console.log("partida sem erro grave — na lista:", errosDaTela().length,
    "| chamada no relatório:", $("btnTrainStart") ? t1($("btnTrainStart")) : "(nenhuma, como esperado)");

  const PGN_TREINO = `[Event "A Imortal (final)"]
[Site "Londres"]
[Date "1851.06.21"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]
[SetUp "1"]
[FEN "rnb1kbnr/p2p1ppp/5q2/1p3N1P/4PBP1/3P1Q2/PPP5/RN3KR1 w kq - 1 16"]

16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8
22. Qf6+ Nxf6 23. Be7# 1-0`;
  $("pgnBox").value = PGN_TREINO;
  $("btnLoadPgn").click(); await wait(200);
  $("depth").value = "12";
  $("btnAnalyze").click();
  const tT = Date.now();
  while ($("btnAnalyze").textContent !== ROTULO_ANALISAR && Date.now() - tT < 600000) await wait(500);
  console.log("partida de treino analisada em", ((Date.now() - tT) / 1000).toFixed(1) + "s",
    "| lances:", window.document.querySelectorAll(".mv").length);

  /* gabarito lido da própria tela: seta azul = melhor lance da posição,
     realce amarelo = lance jogado na partida. Nada de espiar o estado. */
  const viradoT = () => (($("gCoords").childNodes[0] || {}).textContent === "h");
  const casaXY = (x, y) => {
    let f = Math.round((x - 50) / 100), r = Math.round((y - 50) / 100);
    if (viradoT()) { f = 7 - f; r = 7 - r; }
    return "abcdefgh"[f] + (8 - r);
  };
  const clicarCasa = (sq) => {
    let f = "abcdefgh".indexOf(sq[0]), r = 8 - +sq[1];
    if (viradoT()) { f = 7 - f; r = 7 - r; }
    const ev = new window.MouseEvent("click", { clientX: f * 100 + 50, clientY: r * 100 + 50, bubbles: true });
    Object.defineProperty(ev, "currentTarget", { value: $("board") });
    $("board").dispatchEvent(ev);
  };
  const setaDe = (cor) => {
    const filhos = [...$("gArrows").childNodes];
    const ln = filhos.find((e) => e.tagName === "line" && e.getAttribute("stroke") === cor);
    const pg = filhos.find((e) => e.tagName === "polygon" && e.getAttribute("fill") === cor);
    if (!ln || !pg) return null;
    const p = pg.getAttribute("points").split(" ")[0].split(",").map(Number);
    return { de: casaXY(+ln.getAttribute("x1"), +ln.getAttribute("y1")), para: casaXY(p[0], p[1]) };
  };
  const realceDoUltimo = () => {
    const rs = [...$("gHigh").childNodes].filter((e) => e.tagName === "rect");
    if (rs.length < 2) return null;
    return { de: casaXY(+rs[0].getAttribute("x") + 50, +rs[0].getAttribute("y") + 50),
             para: casaXY(+rs[1].getAttribute("x") + 50, +rs[1].getAttribute("y") + 50) };
  };
  const plies = errosDaTela();
  const gab = plies.map((ply) => {
    window.document.querySelector('.mv[data-ply="' + ply + '"]').click();
    const jogado = realceDoUltimo();
    $("btnPrev").click();
    return { ply, jogado, melhor: setaDe("#5f90b8") };
  });
  console.log("gabarito lido do tabuleiro:",
    gab.map((g) => g.ply + ":" + (g.melhor ? g.melhor.de + g.melhor.para : "?")).join(" "));

  const contaRel = {};
  [...window.document.querySelectorAll(".report-grid .r")].forEach((r) => {
    contaRel[t1(r.children[1])] = (+t1(r.children[0]) || 0) + (+t1(r.children[2]) || 0);
  });
  const alvo = (contaRel["Erro"] || 0) + (contaRel["Capivarada"] || 0);

  window.document.querySelector('[data-tab="report"]').click();
  console.log("chamada no relatório:", t1($("btnTrainStart")));
  const goTreino = buscasNoMotor;
  $("btnTrainStart").click(); await wait(80);
  const naFila = +(t1($("trainCount")).match(/(\d+)\s*$/) || [0, 0])[1];
  console.log("entrou no treino — painel:", $("panelTrain").style.display === "",
    "| abas dão lugar a ele:", window.document.querySelector(".panel-main").style.display === "none",
    "| contador:", t1($("trainCount")));
  console.log("fila:", naFila, "| Erro+Capivarada no relatório:", alvo,
    "| selos na lista de lances:", plies.length, "| bate:", naFila === alvo && naFila === plies.length);
  console.log("posição do 1º erro — girado para quem joga:", viradoT(),
    "| lance do adversário realçado:", JSON.stringify(realceDoUltimo()),
    "| sem seta entregando o gabarito:", $("gArrows").childNodes.length === 0);
  console.log("enunciado:", t1($("trainBody")).slice(0, 150));

  /* ---- 1º item: erra, pede dica, pede a resposta ---- */
  clicarCasa(gab[0].jogado.de); await wait(20);
  clicarCasa(gab[0].jogado.para); await wait(80);
  console.log("\njogou o lance da partida (errado) —", t1(window.document.querySelector(".train-note.bad")));
  console.log("  não avançou:", t1($("trainCount")), "| tentar de novo:", !!$("btnTrainRetry"),
    "| dica:", !!$("btnTrainHint"), "| ver a resposta:", !!$("btnTrainShow"));
  await wait(700);
  console.log("  o lance errado sai do tabuleiro sozinho:",
    $("gPieces").childNodes.length, "peças, vez de quem errou de novo");
  $("btnTrainRetry").click(); await wait(40);
  console.log("  tentar de novo limpa o aviso:", !window.document.querySelector(".train-note.bad"),
    "| segue em", t1($("trainCount")));
  $("btnTrainHint").click(); await wait(30);
  console.log("  dica:", (t1($("trainBody")).match(/A peça certa[^.]*\./) || ["(nenhuma)"])[0],
    "| sem dizer a casa:", !/[a-h][1-8]/.test((t1($("trainBody")).match(/A peça certa[^.]*\./) || [""])[0]));
  $("btnTrainShow").click(); await wait(60);
  const passos0 = window.document.querySelectorAll(".train-line span.on").length;
  console.log("  resposta:", t1(window.document.querySelector(".train-note.good")),
    "| continuação:", t1(window.document.querySelector(".train-line")));
  await wait(2000);
  console.log("  a continuação anda sozinha:", passos0, "→",
    window.document.querySelectorAll(".train-line span.on").length, "meios-lances no tabuleiro",
    "| peças:", $("gPieces").childNodes.length);
  $("btnTrainNext").click(); await wait(60);
  console.log("  próximo:", t1($("trainCount")));

  /* ---- 2º item: acerta ---- */
  clicarCasa(gab[1].melhor.de); await wait(20);
  clicarCasa(gab[1].melhor.para); await wait(80);
  console.log("\nacertou o melhor lance —", t1(window.document.querySelector(".train-note.good")));
  console.log("  mostra a continuação:", !!window.document.querySelector(".train-line"),
    "|", t1(window.document.querySelector(".train-line")),
    "| botão:", t1($("btnTrainNext")));

  /* ---- troca de idioma no meio do exercício ---- */
  $("btnLangEn").click(); await wait(90);
  console.log("\nem inglês no meio do treino:", t1($("trainBody")).slice(0, 130));
  console.log("  cabeçalho:", t1($("panelTrain").querySelector(".train-head b")), "|", t1($("trainCount")),
    "|", t1($("btnTrainExit")), "| mesmo item, continuação intacta:",
    !!window.document.querySelector(".train-line"));
  $("btnLangPt").click(); await wait(60);
  console.log("  de volta ao português:", t1($("trainCount")), "|", t1($("btnTrainNext")));

  /* ---- resto da fila na base do "ver a resposta" ---- */
  let voltas = 0;
  while (!/Fim do treino/.test(t1($("trainCount"))) && voltas++ < 40) {
    if ($("btnTrainNext")) { $("btnTrainNext").click(); await wait(50); }
    if ($("btnTrainShow")) { $("btnTrainShow").click(); await wait(50); }
  }
  const somas = [...window.document.querySelectorAll(".train-sum .v")].map((e) => +e.textContent);
  console.log("\nresumo:", t1($("trainCount")), "|", t1($("trainBody")).slice(0, 120));
  console.log("  de primeira / com dica / passou batido:", somas.join(" / "),
    "| soma bate com a fila:", somas.reduce((a, b) => a + b, 0) === naFila);
  $("btnTrainRedo").click(); await wait(60);
  console.log("  refazer só os que faltaram:", t1($("trainCount")), "| esperado", naFila - 1);

  /* ---- sair: a análise continua onde estava ---- */
  $("btnTrainExit").click(); await wait(60);
  console.log("\nsaiu do treino — painel fechado:", $("panelTrain").style.display === "none",
    "| abas de volta:", window.document.querySelector(".panel-main").style.display === "");
  console.log("  análise intacta — selos:", window.document.querySelectorAll(".mv .ic").length,
    "| precisão:", [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / "),
    "| chamada do treino de novo:", t1($("btnTrainStart")),
    "| buscas no motor no treino inteiro:", buscasNoMotor - goTreino);

  /* ---- o que o treino custou no registro salvo ---- */
  const recT = JSON.parse(window.localStorage.getItem(CHAVE) || "[]")[0] || {};
  const comPv = JSON.stringify(recT).length;
  const semPv = JSON.stringify(Object.assign({}, recT, { pvt: undefined })).length;
  const nPl = (recT.pm || []).length;
  console.log("\nregistro salvo:", comPv, "B | sem as continuações:", semPv, "B | custo:",
    comPv - semPv, "B em", Object.keys(recT.pvt || {}).length, "posições de erro |",
    ((comPv - semPv) / Math.max(1, Object.keys(recT.pvt || {}).length)).toFixed(0), "B cada");
  const porErro = (comPv - semPv) / Math.max(1, Object.keys(recT.pvt || {}).length);
  console.log("  partida de 80 lances: registro de ~", Math.round(comPv / Math.max(1, nPl) * 80),
    "B; com 8 erros o treino soma ~", Math.round(porErro * 8),
    "B; no pior caso deste trecho (1 erro a cada 3 lances) ~",
    Math.round((comPv - semPv) / Math.max(1, nPl) * 80), "B");

  /* ---- reabrir a análise salva e treinar (é onde a pv faria falta) ---- */
  window.document.querySelector('[data-tab="import"]').click();
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  const goSalva = buscasNoMotor;
  $("btnTrainStart").click(); await wait(60);
  $("btnTrainShow").click(); await wait(60);
  console.log("\nanálise salva reaberta — treino:", t1($("trainCount")),
    "| continuação guardada:", t1(window.document.querySelector(".train-line")) || "(nenhuma)");
  console.log("  buscas no motor:", buscasNoMotor - goSalva);
  $("btnTrainExit").click(); await wait(40);

  /* ---- registro de versão anterior: sem pvt, o treino continua de pé ---- */
  const listaV = JSON.parse(window.localStorage.getItem(CHAVE) || "[]");
  delete listaV[0].pvt;
  window.localStorage.setItem(CHAVE, JSON.stringify(listaV));
  window.document.querySelector('[data-tab="import"]').click();
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  $("btnTrainStart").click(); await wait(60);
  clicarCasa(gab[0].melhor.de); await wait(20);
  clicarCasa(gab[0].melhor.para); await wait(80);
  console.log("\nregistro antigo (sem pv) —", t1(window.document.querySelector(".train-note.good")),
    "| continuação:", window.document.querySelector(".train-line") ? "sim" : "não",
    "| explica:", t1($("trainBody")).indexOf("versão anterior") >= 0);
  console.log("  o exercício funciona igual:", !!$("btnTrainNext"),
    "| buscas no motor:", buscasNoMotor - goSalva);
  $("btnTrainExit").click(); await wait(40);

  /* ---- perspectiva conhecida: só os erros do usuário entram na fila ---- */
  const listaU = JSON.parse(window.localStorage.getItem(CHAVE) || "[]");
  listaU[0].us = "Adolf Anderssen";          // como fica quando a partida veio da busca
  window.localStorage.setItem(CHAVE, JSON.stringify(listaU));
  window.document.querySelector('[data-tab="import"]').click();
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  console.log("\nperspectiva conhecida (Anderssen, das brancas) — chamada:", t1($("btnTrainStart")));
  $("btnTrainStart").click(); await wait(60);
  console.log("  fila só com os erros dele:", t1($("trainCount")),
    "| em segunda pessoa:", t1($("trainBody")).slice(0, 110));
  $("btnTrainExit").click(); await wait(40);

  $("btnCopyFen").click(); $("btnCopyPgn").click(); await wait(50);
  console.log("copiar sem clipboard:", $("toast").textContent);
  ["import","report","moves","engine"].forEach((t) => window.document.querySelector('[data-tab="'+t+'"]').click());
  console.log("abas OK");
  process.exit(0);
})();
