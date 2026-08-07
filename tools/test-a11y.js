/* Suíte de acessibilidade do Plyscope.
   ---------------------------------------------------------------------------
   Duas metades, e as duas provam coisas diferentes:

   1. VARREDURA ESTÁTICA do index.html gerado — e do mesmo documento depois de
      o app rodar, que é onde nascem a grade do tabuleiro, os botões de lance e
      o painel do treino. Procura interativo sem nome acessível, role inválido,
      aria-* apontando para id que não existe, focável sem foco visível e svg
      sem alternativa.

   2. TECLADO DE VERDADE. Nada aqui chama a função interna do app: o cursor
      anda porque um KeyboardEvent("keydown", {key:"ArrowUp"}) foi despachado
      na célula que tem o foco, e o lance é jogado porque um Enter chegou nela.
      É a única forma de provar que o conflito das setas (cursor de casa ×
      navegar os lances) está resolvido no lugar certo.

   ONDE ESTÁ O LIMITE DO jsdom: ele não implementa a ativação nativa — Enter
   num <button> não vira click. Então para os botões nativos (treino, abas,
   controles) o que se prova aqui é o que o navegador precisa para ativá-los:
   que são <button> mesmo e que estão na ordem de tabulação. Onde não há
   ativação nativa nenhuma — a grade do tabuleiro, que é o widget novo — tudo
   é provado por evento de teclado, porque ali não há rede de segurança.       */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const H = require("./harness.js");
const { window, $, wait, ok, conf, t1 } = H;
const doc = window.document;

const ROOT = path.resolve(__dirname, "..");

/* ===========================================================================
   Ferramentas da varredura
   =========================================================================== */

/* Papéis ARIA válidos que este app usa ou poderia usar. A lista existe para
   pegar erro de digitação ("gridCell", "tabPanel"), que não dá erro nenhum no
   navegador — só desliga a semântica em silêncio. */
const PAPEIS = new Set([
  "alert", "alertdialog", "application", "article", "banner", "button", "cell",
  "checkbox", "columnheader", "combobox", "complementary", "contentinfo",
  "definition", "dialog", "directory", "document", "feed", "figure", "form",
  "grid", "gridcell", "group", "heading", "img", "link", "list", "listbox",
  "listitem", "log", "main", "marquee", "math", "menu", "menubar", "menuitem",
  "menuitemcheckbox", "menuitemradio", "navigation", "none", "note", "option",
  "presentation", "progressbar", "radio", "radiogroup", "region", "row",
  "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator",
  "slider", "spinbutton", "status", "switch", "tab", "table", "tablist",
  "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip", "tree",
  "treegrid", "treeitem",
]);

const IDREF = ["aria-labelledby", "aria-describedby", "aria-controls",
               "aria-owns", "aria-activedescendant", "aria-details",
               "aria-errormessage", "aria-flowto"];

/* Interativo = o que recebe foco ou o que se anuncia como acionável. */
const SEL_INTERATIVO = 'a[href],button,input,select,textarea,summary,[tabindex],' +
  '[role=button],[role=tab],[role=link],[role=checkbox],[role=gridcell],[role=option]';

const escondido = (el) => {
  for (let n = el; n && n.getAttribute; n = n.parentElement) {
    if (n.getAttribute("aria-hidden") === "true") return true;
    if (n.getAttribute("hidden") !== null) return true;
    const st = n.getAttribute("style") || "";
    if (/display\s*:\s*none/.test(st)) return true;
  }
  return false;
};

/** Texto que o leitor de tela leria do conteúdo (ignora o que é aria-hidden). */
function textoVisivel(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { s += n.textContent; continue; }
    if (n.nodeType !== 1) continue;
    if (n.getAttribute("aria-hidden") === "true") continue;
    s += textoVisivel(n);
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Nome acessível, na ordem que a especificação manda (versão curta e honesta:
    aria-labelledby → aria-label → <label> → conteúdo → title → alt/<title>). */
function nomeAcessivel(el, d) {
  const lb = el.getAttribute("aria-labelledby");
  if (lb) {
    const s = lb.split(/\s+/).map((id) => { const r = d.getElementById(id); return r ? textoVisivel(r) : ""; })
      .join(" ").trim();
    if (s) return s;
  }
  const al = (el.getAttribute("aria-label") || "").trim();
  if (al) return al;
  if (el.id) {
    const lab = [...d.querySelectorAll("label[for]")].find((l) => l.getAttribute("for") === el.id);
    if (lab && textoVisivel(lab)) return textoVisivel(lab);
  }
  for (let n = el.parentElement; n; n = n.parentElement)
    if (n.tagName === "LABEL" && textoVisivel(n)) return textoVisivel(n);
  const txt = textoVisivel(el);
  if (txt) return txt;
  const tit = el.querySelector && el.querySelector("title");
  if (tit && tit.textContent.trim()) return tit.textContent.trim();
  return (el.getAttribute("title") || el.getAttribute("alt") || "").trim();
}

/** A varredura inteira sobre um documento. Devolve as listas de problemas. */
function varrer(d) {
  const achados = { semNome: [], papel: [], idref: [], svg: [], tabindex: [] };
  const onde = (el) => el.tagName.toLowerCase() +
    (el.id ? "#" + el.id : el.getAttribute("class") ? "." + String(el.getAttribute("class")).split(" ")[0] : "");

  for (const el of d.querySelectorAll(SEL_INTERATIVO)) {
    if (escondido(el)) continue;
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (el.tagName === "INPUT" && (t === "hidden" || t === "file")) continue;
    if (el.getAttribute("role") === "presentation" || el.getAttribute("role") === "none") continue;
    // painel de aba é focável mas se nomeia pela aba; contêiner sem papel não é alvo
    if (!nomeAcessivel(el, d)) achados.semNome.push(onde(el));
    const ti = el.getAttribute("tabindex");
    if (ti != null && +ti > 0) achados.tabindex.push(onde(el) + " tabindex=" + ti);
  }
  for (const el of d.querySelectorAll("[role]")) {
    for (const p of String(el.getAttribute("role")).trim().split(/\s+/))
      if (!PAPEIS.has(p)) achados.papel.push(onde(el) + ' role="' + p + '"');
  }
  for (const attr of IDREF)
    for (const el of d.querySelectorAll("[" + attr + "]"))
      for (const id of String(el.getAttribute(attr)).trim().split(/\s+/))
        if (id && !d.getElementById(id)) achados.idref.push(onde(el) + " " + attr + "→#" + id);
  for (const el of d.querySelectorAll("svg")) {
    if (escondido(el)) continue;
    const tem = (el.getAttribute("aria-label") || "").trim() ||
      (el.getAttribute("aria-labelledby") || "").trim() ||
      [...el.children].some((c) => c.tagName.toLowerCase() === "title" && c.textContent.trim());
    if (!tem) achados.svg.push(onde(el));
  }
  return achados;
}

/** Focável sem foco visível. Feito sobre o texto da folha, porque o jsdom não
    calcula estilo de pseudo-classe: procura (a) a regra global de :focus-visible
    que pinta o foco de todo mundo e (b) quem apaga o contorno com outline:none
    e não repõe NADA num :focus do mesmo seletor — contorno, sombra, borda ou
    fundo servem, o que não serve é apagar e ficar por isso mesmo. */
function focoSemPintura(css) {
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].replace(/\s+/g, " ").trim(), corpo: m[2] }));
  const global = regras.some((r) => /(^|,)\s*:focus-visible\s*$/.test(r.sel) &&
    /outline\s*:\s*[^;]*(solid|auto)/.test(r.corpo));
  const repoe = /(outline|box-shadow|border-color|background)\s*:\s*(?!none\b|0\b)/;
  const orfas = regras
    .filter((r) => /outline\s*:\s*(none|0)\b/.test(r.corpo) && !/:focus/.test(r.sel))
    .map((r) => r.sel)
    .filter((sel) => {
      const base = sel.split(",")[0].trim();
      return !regras.some((r) => /:focus/.test(r.sel) && r.sel.indexOf(base) >= 0 &&
        repoe.test(r.corpo));
    });
  return { global, orfas };
}

function relatorio(rot, a) {
  const total = a.semNome.length + a.papel.length + a.idref.length + a.svg.length + a.tabindex.length;
  console.log("  " + rot);
  console.log("    interativo sem nome acessível : " + (a.semNome.length || "0") +
    (a.semNome.length ? " → " + a.semNome.join(", ") : ""));
  console.log("    role inválido                 : " + (a.papel.length || "0") +
    (a.papel.length ? " → " + a.papel.join(", ") : ""));
  console.log("    aria-* para id inexistente    : " + (a.idref.length || "0") +
    (a.idref.length ? " → " + a.idref.join(", ") : ""));
  console.log("    svg sem alternativa           : " + (a.svg.length || "0") +
    (a.svg.length ? " → " + a.svg.join(", ") : ""));
  console.log("    tabindex positivo             : " + (a.tabindex.length || "0") +
    (a.tabindex.length ? " → " + a.tabindex.join(", ") : ""));
  return total;
}

/* ===========================================================================
   Teclado
   =========================================================================== */
const tecla = (el, key, extra) => {
  const ev = new window.KeyboardEvent("keydown",
    Object.assign({ key, bubbles: true, cancelable: true }, extra || {}));
  el.dispatchEvent(ev);
  return ev;
};
/** Manda a tecla para quem tem o foco — é assim que o navegador faz. */
const teclaNoFoco = (key) => tecla(doc.activeElement || doc.body, key);
const celFocada = () => (doc.activeElement && doc.activeElement.classList &&
  doc.activeElement.classList.contains("sq")) ? doc.activeElement : null;
const casaFocada = () => (celFocada() || { dataset: {} }).dataset.sq || null;
const celDoTab = () => doc.querySelector('#boardGrid .sq[tabindex="0"]');
/* o tabuleiro girado se lê na primeira letra de coordenada desenhada */
const virado = () => (($("gCoords").childNodes[0] || {}).textContent === "h");
/** Anda com as SETAS até a casa pedida — girado ou não, é o que o dedo faria. */
const irPara = (sq) => {
  for (let i = 0; i < 60 && casaFocada() !== sq; i++) {
    const at = casaFocada(), inv = virado();
    if (at[0] !== sq[0]) teclaNoFoco((at[0] > sq[0]) !== inv ? "ArrowLeft" : "ArrowRight");
    else teclaNoFoco((+at[1] > +sq[1]) !== inv ? "ArrowDown" : "ArrowUp");
  }
  return casaFocada();
};
const rotulo = (sq) => {
  const c = [...doc.querySelectorAll("#boardGrid .sq")].find((e) => e.dataset.sq === sq);
  return c ? c.getAttribute("aria-label") : null;
};
const plyAtual = () => (doc.querySelector(".mv.on") || { dataset: {} }).dataset.ply || "0";

/* a região viva é observada, não lida: o que interessa é QUANTAS vezes ela
   mudou, que é quantas vezes o leitor de tela abriria a boca. */
const avisos = [];
new window.MutationObserver(() => {
  const s = $("live").textContent.trim();
  if (s) avisos.push(s);
}).observe($("live"), { childList: true, characterData: true, subtree: true });
const zerarAvisos = () => { avisos.length = 0; };

(async () => {
  await wait(300);
  $("btnLangPt").click();
  await wait(60);
  const ROTULO_ANALISAR = $("btnAnalyze").textContent;

  /* =========================================================================
     1. Varredura estática do index.html gerado
     ========================================================================= */
  console.log("\n== varredura estática do index.html gerado ==");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const cru = new JSDOM(html).window.document;      // sem rodar script nenhum
  const totalCru = relatorio("index.html como sai do build.py:", varrer(cru));
  conf("index.html entregue sem problema de acessibilidade na varredura", totalCru === 0,
    "| " + totalCru + " achados");

  const css = [...cru.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  const foco = focoSemPintura(css);
  console.log("    regra global de foco visível  : " + (foco.global ? "sim (:focus-visible com outline)" : "NÃO"));
  console.log("    outline apagado sem reposição : " + (foco.orfas.length || "0") +
    (foco.orfas.length ? " → " + foco.orfas.join(", ") : ""));
  conf("todo focável tem foco visível (regra global + nenhum outline órfão)",
    foco.global && foco.orfas.length === 0);

  /* =========================================================================
     2. Semântica do tabuleiro
     ========================================================================= */
  console.log("\n== semântica do tabuleiro ==");
  const grade = $("boardGrid");
  conf("o tabuleiro tem papel e rótulo",
    !!grade && grade.getAttribute("role") === "grid" &&
    (grade.getAttribute("aria-label") || "").length > 3,
    "| role=" + (grade && grade.getAttribute("role")) +
    ' aria-label="' + (grade && grade.getAttribute("aria-label")) + '"');
  conf("o SVG do desenho sai da árvore de acessibilidade em vez de virar imagem muda",
    $("board").getAttribute("aria-hidden") === "true");
  conf("8 linhas e 64 casas com papel de grade",
    doc.querySelectorAll('#boardGrid [role="row"]').length === 8 &&
    doc.querySelectorAll('#boardGrid [role="gridcell"]').length === 64);
  console.log("  rótulos na posição inicial:",
    ["a1", "e1", "d8", "e4"].map((s) => JSON.stringify(rotulo(s))).join(" · "));
  conf("cada casa anuncia coordenada e conteúdo",
    rotulo("a1") === "a1, torre branca" && rotulo("e1") === "e1, rei branco" &&
    rotulo("d8") === "d8, dama preta" && rotulo("e4") === "e4, vazia");
  conf("uma única parada de tabulação para as 64 casas (tabindex rotativo)",
    doc.querySelectorAll('#boardGrid .sq[tabindex="0"]').length === 1);

  /* =========================================================================
     3. O cursor anda por evento de teclado
     ========================================================================= */
  console.log("\n== cursor de casa por teclado ==");
  celDoTab().focus();
  conf("Tab pousa numa casa do tabuleiro", !!celFocada(), "| casa: " + casaFocada());
  const partida = casaFocada();
  teclaNoFoco("ArrowUp");
  const cima = casaFocada();
  teclaNoFoco("ArrowRight");
  const dir = casaFocada();
  teclaNoFoco("ArrowDown");
  teclaNoFoco("ArrowLeft");
  conf("as setas movem o cursor e ele volta ao ponto de partida",
    cima === "e2" && dir === "f2" && casaFocada() === partida,
    "| " + partida + " →↑ " + cima + " →→ " + dir + " →↓← " + casaFocada());
  conf("o foco acompanha o cursor (é ele que faz o leitor de tela ler a casa)",
    celDoTab() === doc.activeElement);

  // borda: o cursor não sai do tabuleiro
  for (let i = 0; i < 9; i++) teclaNoFoco("ArrowDown");
  const fundo = casaFocada();
  for (let i = 0; i < 9; i++) teclaNoFoco("ArrowLeft");
  conf("o cursor para na borda em vez de sair do tabuleiro",
    fundo === "e1" && casaFocada() === "a1", "| " + fundo + " → " + casaFocada());

  // tabuleiro girado: as setas continuam andando para onde APONTAM na tela
  irPara("e4");
  $("btnFlip").click(); await wait(30);
  conf("girar o tabuleiro leva o cursor junto com a casa, e o foco com ele",
    casaFocada() === "e4" && celDoTab() === doc.activeElement && virado(),
    "| casa: " + casaFocada());
  teclaNoFoco("ArrowUp");
  const giradoCima = casaFocada();
  conf("girado, ↑ na tela desce no tabuleiro: e4 → e3 (e não e5)",
    giradoCima === "e3", "| e4 →↑ " + giradoCima);
  $("btnFlip").click(); await wait(30);
  conf("desgirar não mexe no cursor, e ↑ volta a subir: e3 → e4",
    casaFocada() === "e3" && (teclaNoFoco("ArrowUp"), casaFocada() === "e4"),
    "| " + casaFocada());

  /* =========================================================================
     4. O conflito das setas
     ========================================================================= */
  console.log("\n== conflito das setas: quem tem o foco manda ==");
  $("pgnBox").value = `[Event "A11y"]
[White "Teste"]
[Black "Vitima"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
  $("btnLoadPgn").click(); await wait(150);
  $("btnStart").click(); await wait(40);

  celDoTab().focus();
  const plyAntes = plyAtual();
  const evGrade = teclaNoFoco("ArrowRight");
  await wait(20);
  conf("com o tabuleiro em foco, a seta move o cursor e NÃO passa o lance",
    plyAtual() === plyAntes && evGrade.defaultPrevented,
    "| ply " + plyAntes + " → " + plyAtual() + " | cursor: " + casaFocada());

  doc.activeElement.blur();
  tecla(doc.body, "ArrowRight"); await wait(40);
  conf("fora do tabuleiro, a mesma seta passa o lance",
    plyAtual() === "1", "| ply " + plyAtual() + " | " + t1(doc.querySelector(".mv.on")));

  const aba = doc.querySelector('.tabs [role="tab"][data-tab="report"]');
  aba.focus();
  const plyAba = plyAtual();
  tecla(aba, "ArrowRight"); await wait(30);
  conf("com uma aba em foco, a seta troca de aba e não mexe na partida",
    plyAtual() === plyAba && doc.activeElement.dataset.tab === "moves" &&
    doc.activeElement.getAttribute("aria-selected") === "true",
    "| aba agora: " + doc.activeElement.dataset.tab + " | ply " + plyAtual());
  doc.querySelector('.tabs [data-tab="report"]').click();

  /* =========================================================================
     5. Selecionar e jogar um lance — só com o teclado
     ========================================================================= */
  console.log("\n== jogar um lance no modo exploração, sem mouse ==");
  $("btnStart").click(); await wait(40);
  celDoTab().focus();
  conf("o cursor chega a e2 só com as setas", irPara("e2") === "e2", "| " + casaFocada());
  zerarAvisos();
  teclaNoFoco("Enter"); await wait(30);
  conf("Enter seleciona a peça da casa",
    /selecionada$/.test(rotulo("e2") || "") && $("gHigh").childNodes.length > 0,
    "| rótulo de e2: " + JSON.stringify(rotulo("e2")));
  conf("a região viva diz quantos destinos existem, uma vez só",
    avisos.length === 1 && /e2/.test(avisos[0]), "| " + JSON.stringify(avisos));
  conf("os destinos legais entram no rótulo das casas de destino",
    /destino/.test(rotulo("e4") || "") && !/destino/.test(rotulo("e5") || ""),
    "| e4: " + JSON.stringify(rotulo("e4")) + " | e5: " + JSON.stringify(rotulo("e5")));

  zerarAvisos();
  teclaNoFoco("Escape"); await wait(20);
  conf("Esc cancela a seleção e avisa uma vez",
    rotulo("e2") === "e2, peão branco" && avisos.length === 1,
    "| " + JSON.stringify(avisos));

  teclaNoFoco("Enter"); await wait(20);        // seleciona e2 de novo
  irPara("e4");
  zerarAvisos();
  teclaNoFoco("Enter"); await wait(80);
  conf("Enter na casa de destino JOGA o lance (modo exploração aberto)",
    rotulo("e4") === "e4, peão branco" && rotulo("e2") === "e2, vazia" &&
    $("exploreBar").classList.contains("on"),
    "| e2: " + JSON.stringify(rotulo("e2")) + " | e4: " + JSON.stringify(rotulo("e4")));
  conf("o lance jogado é anunciado uma vez só",
    avisos.length === 1 && /e4/.test(avisos[0]), "| " + JSON.stringify(avisos));
  $("btnBackToGame").click(); await wait(40);

  /* =========================================================================
     6. Região viva ao navegar a partida
     ========================================================================= */
  console.log("\n== região viva ==");
  const live = $("live");
  conf("a região viva é discreta, polida e fora do corpo traduzido do app",
    live.getAttribute("aria-live") === "polite" && live.getAttribute("role") === "status" &&
    live.className.indexOf("sr-only") >= 0 && !doc.querySelector(".app").contains(live),
    '| role=status aria-live=polite class="' + live.className + '"');
  $("btnStart").click(); await wait(40);
  zerarAvisos();
  tecla(doc.body, "ArrowRight"); await wait(40);
  conf("navegar um lance anuncia SAN + selo, uma vez",
    avisos.length === 1 && /e4/.test(avisos[0]), "| " + JSON.stringify(avisos));
  const dito = avisos[0];
  zerarAvisos();
  doc.querySelector('.mv[data-ply="1"]').click(); await wait(40);
  conf("voltar ao MESMO lance não anuncia de novo", avisos.length === 0,
    "| repetiria: " + JSON.stringify(dito));
  zerarAvisos();
  tecla(doc.body, "ArrowLeft"); await wait(40);
  conf("voltar ao início anuncia a posição inicial, uma vez",
    avisos.length === 1, "| " + JSON.stringify(avisos));

  conf("o rótulo do botão do lance diz o mesmo que a região viva",
    doc.querySelector('.mv[data-ply="1"]').getAttribute("aria-label") === dito,
    "| " + JSON.stringify(dito));
  conf("a lista de lances é feita de botões, não de divs clicáveis",
    [...doc.querySelectorAll(".mv")].every((e) => e.tagName === "BUTTON"),
    "| " + doc.querySelectorAll(".mv").length + " lances");

  /* =========================================================================
     7. Ordem de tabulação
     ========================================================================= */
  console.log("\n== ordem de tabulação ==");
  const focaveis = [...doc.querySelectorAll(SEL_INTERATIVO)]
    .filter((el) => !escondido(el))
    .filter((el) => el.getAttribute("tabindex") !== "-1")
    .filter((el) => !(el.tagName === "INPUT" && el.getAttribute("type") === "file"));
  const ids = focaveis.map((e) => e.id || (e.dataset && e.dataset.tab ? "aba:" + e.dataset.tab : "") ||
    (e.classList.contains("sq") ? "casa:" + e.dataset.sq : e.tagName.toLowerCase()));
  console.log("  " + focaveis.length + " paradas:", ids.join(" → "));
  const precisa = ["btnLangPt", "btnLangEn", "depth", "btnFlip", "btnNew", "btnAnalyze",
    "btnStart", "btnPrev", "btnPlay", "btnNext", "btnEnd", "speed", "btnSound",
    "btnCopyFen", "btnCopyPgn", "pgnBox", "btnLoadPgn", "btnPickFile", "site",
    "userBox", "btnFetch"];
  const faltam = precisa.filter((id) => ids.indexOf(id) < 0);
  conf("a tabulação alcança tudo que é interativo", faltam.length === 0,
    "| faltam: " + (faltam.join(", ") || "(nada)"));
  conf("o tabuleiro é UMA parada, entre a barra de cima e os controles",
    ids.filter((s) => /^casa:/.test(s)).length === 1 &&
    ids.indexOf("btnAnalyze") < ids.findIndex((s) => /^casa:/.test(s)) &&
    ids.findIndex((s) => /^casa:/.test(s)) < ids.indexOf("btnStart"));
  conf("nenhum tabindex positivo desarrumando a ordem",
    focaveis.every((e) => !(+e.getAttribute("tabindex") > 0)));
  conf("as abas são um tablist com uma parada só",
    doc.querySelectorAll('.tabs [role="tab"]').length === 4 &&
    doc.querySelectorAll('.tabs [role="tab"]:not([tabindex="-1"])').length === 1 &&
    doc.querySelector(".tabs").getAttribute("role") === "tablist");

  /* =========================================================================
     8. Treino completável pelo teclado
     ========================================================================= */
  console.log("\n== treino: aprenda com seus erros, sem mouse ==");
  $("depth").value = "12";
  $("btnAnalyze").click();
  const t0 = Date.now();
  while ($("btnAnalyze").textContent !== ROTULO_ANALISAR && Date.now() - t0 < 240000) await wait(400);
  console.log("  partida analisada em", ((Date.now() - t0) / 1000).toFixed(1) + "s");

  // gabarito lido da tela, como na suíte do treino: a seta azul é o melhor lance
  const casaXY = (x, y) => {
    let f = Math.round((x - 50) / 100), r = Math.round((y - 50) / 100);
    if (virado()) { f = 7 - f; r = 7 - r; }
    return "abcdefgh"[f] + (8 - r);
  };
  const setaAzul = () => {
    const filhos = [...$("gArrows").childNodes];
    const ln = filhos.find((e) => e.tagName === "line" && e.getAttribute("stroke") === "#5f90b8");
    const pg = filhos.find((e) => e.tagName === "polygon" && e.getAttribute("fill") === "#5f90b8");
    if (!ln || !pg) return null;
    const p = pg.getAttribute("points").split(" ")[0].split(",").map(Number);
    return { de: casaXY(+ln.getAttribute("x1"), +ln.getAttribute("y1")), para: casaXY(p[0], p[1]) };
  };
  const errados = [...doc.querySelectorAll(".mv")]
    .filter((e) => /^(Erro|Capivarada)$/.test(t1(e.querySelector(".ic title"))))
    .map((e) => +e.dataset.ply);
  conf("a partida de teste tem pelo menos um erro para treinar", errados.length > 0,
    "| plies: " + errados.join(", "));
  doc.querySelector('.mv[data-ply="' + errados[0] + '"]').click(); await wait(40);
  $("btnPrev").click(); await wait(40);
  const gabarito = setaAzul();
  conf("o gabarito sai do próprio tabuleiro (seta azul)", !!gabarito,
    "| " + (gabarito ? gabarito.de + gabarito.para : "?"));

  doc.querySelector('.tabs [data-tab="report"]').click(); await wait(40);
  conf("o relatório oferece o treino", !!$("btnTrainStart"));
  $("btnTrainStart").click(); await wait(80);
  conf("entrar no treino leva o foco para o tabuleiro (o botão sumiu com as abas)",
    !!celFocada(), "| foco em: " + (doc.activeElement.id || doc.activeElement.className));

  conf("o cursor chega à casa de origem do lance certo só com as setas",
    irPara(gabarito.de) === gabarito.de, "| " + casaFocada());
  teclaNoFoco("Enter"); await wait(30);
  conf("Enter seleciona a peça dentro do treino",
    /selecionada$/.test(rotulo(gabarito.de) || ""), "| " + JSON.stringify(rotulo(gabarito.de)));
  irPara(gabarito.para);
  zerarAvisos();
  teclaNoFoco("Enter"); await wait(120);
  conf("Enter na casa de destino resolve o exercício",
    !!doc.querySelector(".train-note.good"),
    "| " + t1(doc.querySelector(".train-note.good")));
  conf("o veredito do treino é anunciado uma vez só",
    avisos.length === 1, "| " + JSON.stringify(avisos));
  conf("o exercício resolvido oferece o próximo passo em botão de teclado",
    !!$("btnTrainNext") && $("btnTrainNext").tagName === "BUTTON",
    "| " + t1($("btnTrainNext")));

  /* O caminho do teclado até um <button> é focar e acionar. O jsdom faz a
     primeira metade de verdade; a segunda (Enter → click) é do navegador e ele
     não implementa, então o clique entra no lugar dela. O que fica provado é
     o que estava em risco: que o botão recebe foco e que o app continua de pé
     com o foco vindo de lá. */
  const acionar = (el) => { el.focus(); el.click(); };
  acionar($("btnTrainNext")); await wait(200);
  if (!$("btnTrainDone") && $("btnTrainShow")) { acionar($("btnTrainShow")); await wait(2500); }
  if (!$("btnTrainDone") && $("btnTrainNext")) { acionar($("btnTrainNext")); await wait(200); }
  conf("o treino chega ao fim sem mouse", !!$("btnTrainDone"), "| " + t1($("trainCount")));
  acionar($("btnTrainDone") || $("btnTrainExit")); await wait(60);
  conf("sair do treino devolve o foco para a aba que reabriu",
    doc.activeElement && doc.activeElement.getAttribute("role") === "tab",
    "| foco em: " + (doc.activeElement.dataset.tab || doc.activeElement.id));

  /* =========================================================================
     9. A mesma varredura, agora com o app cheio de conteúdo gerado
     ========================================================================= */
  console.log("\n== varredura do documento vivo (grade, lances, relatório) ==");
  const totalVivo = relatorio("documento depois de analisar e treinar:", varrer(doc));
  conf("nada de acessibilidade quebrou no que o app gera em tempo de execução",
    totalVivo === 0, "| " + totalVivo + " achados");

  /* ---------- o veredito ---------- */
  const falhas = ok.filter((x) => !x).length;
  console.log("\n== resumo ==");
  console.log(ok.length + " asserções, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
