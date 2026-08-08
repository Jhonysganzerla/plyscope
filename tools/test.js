/* Suíte de ponta a ponta: carrega o index.html num DOM falso, troca o Worker
   por um processo Node rodando o mesmo Stockfish, e exercita o app inteiro.
   O treino tem suíte própria (test-treino.js) porque roda uma segunda análise
   completa e as duas juntas passavam de 45 s. */
const H = require("./harness.js");
const { window, $, wait, ok, conf, PGN, OPERA, t1 } = H;

(async () => {
  await wait(300);

  /* O jsdom se apresenta como en-US, então o app abre em inglês. O teste
     analisa em português e só depois troca de idioma, que é o percurso a
     conferir; a escolha fica guardada no localStorage como a de um usuário. */
  console.log("== idioma ==");
  console.log("navigator.language:", window.navigator.language,
    "| idioma deduzido:", window.document.documentElement.lang,
    "| botão analisar:", $("btnAnalyze").textContent.trim());
  conf("navegador en-US abre o app em inglês",
    window.navigator.language === "en-US" && window.document.documentElement.lang === "en"
    && $("btnAnalyze").textContent.trim() === "Analyze game");
  $("btnLangPt").click();
  await wait(50);
  const ROTULO_ANALISAR = $("btnAnalyze").textContent;
  console.log("depois de escolher PT:", window.document.documentElement.lang,
    "|", ROTULO_ANALISAR, "| guardado:", window.localStorage.getItem("plyscope.idioma"));
  conf("escolher português troca a tela e fica guardado",
    window.document.documentElement.lang === "pt-BR"
    && ROTULO_ANALISAR.trim() === "Analisar partida"
    && window.localStorage.getItem("plyscope.idioma") === "pt");

  console.log("\n== carregando PGN ==");
  $("pgnBox").value = PGN;
  $("btnLoadPgn").click();
  await wait(200);

  const nMoves = window.document.querySelectorAll(".mv").length;
  console.log("lances na lista:", nMoves);
  console.log("peças no tabuleiro (posição inicial):", $("gPieces").childNodes.length);
  console.log("jogadores:", $("nmBot").textContent, "vs", $("nmTop").textContent);
  conf("PGN vira lista de lances e tabuleiro cheio",
    nMoves > 0 && $("gPieces").childNodes.length === 32);
  if (OPERA) conf("a Ópera tem 33 meios-lances e os dois jogadores no lugar",
    nMoves === 33 && $("nmBot").textContent === "Paul Morphy"
    && $("nmTop").textContent === "Duque Karl / Conde Isouard");

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
  const precisao = [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / ");
  console.log("  precisão:", precisao);
  const linhasRel = [...window.document.querySelectorAll(".report-grid .r")]
    .map((r) => [...r.children].slice(0, 3).map((c) => c.textContent.trim()).join(" ")).join(" | ");
  conf("todo lance recebeu selo", window.document.querySelectorAll(".mv .ic").length === nMoves);
  if (OPERA) {
    conf("precisão da Ópera", precisao === "96,2 / 83,0", "| " + precisao);
    conf("relatório da Ópera lance a lance",
      linhasRel === "3 Brilhante 0 | 4 Excelente 0 | 8 Melhor 3 | 0 Ótimo 1 | 1 Bom 5 | 0 Forçado 1 | 1 Impreciso 6",
      "| " + linhasRel);
    const brilhantes = [...window.document.querySelectorAll(".mv")]
      .filter((e) => t1(e.querySelector(".ic title")) === "Brilhante")
      .map((e) => t1(e.querySelector("span:not(.ev)")));
    conf("os três sacrifícios de Morphy saem como Brilhante",
      brilhantes.join(" ") === "Nxb5 Rxd7 Qb8+", "| " + brilhantes.join(" "));
  }
  console.log("  " + [...window.document.querySelectorAll("[data-goto]")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).join("\n  "));

  console.log("\n== lances classificados ==");
  const rows = [...window.document.querySelectorAll(".mv")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
  console.log(rows.join(" | "));

  console.log("\n== amostra interna ==");
  // navega até o fim e checa desenho
  $("btnEnd").click();
  await wait(100);
  console.log("setas desenhadas:", $("gArrows").childNodes.length, "| selo:", $("gBadge").childNodes.length);
  conf("no fim da partida o lance jogado ganha selo e não há seta de melhor lance",
    $("gBadge").childNodes.length === 1 && $("gArrows").childNodes.length === 0);
  $("btnPrev").click(); await wait(50);
  console.log("painel do motor:", $("engineLines").textContent.replace(/\s+/g, " ").trim().slice(0, 200));
  conf("o painel do motor mostra avaliação e profundidade",
    /prof\.\s*\d+/.test($("engineLines").textContent));

  console.log("\n== interações ==");
  $("btnFlip").click(); await wait(50);
  console.log("flip: barra altura =", $("evalWhite").style.height, "| ancora top =", $("evalWhite").style.top);
  conf("girado, a barra de avaliação ancora em cima",
    $("evalWhite").style.top === "0px" && $("evalWhite").style.bottom === "auto");
  $("btnFlip").click(); await wait(50);

  // clique numa peça e depois num destino legal (modo exploração)
  $("btnStart").click(); await wait(30);
  const click = (sq) => {
    const f = "abcdefgh".indexOf(sq[0]), r = 8 - +sq[1];
    const ev = new window.MouseEvent("click", { clientX: f * 100 + 50, clientY: r * 100 + 50, bubbles: true });
    Object.defineProperty(ev, "currentTarget", { value: $("board") });
    $("board").dispatchEvent(ev);
  };
  click("e2"); await wait(30);
  console.log("após clicar e2 — realces:", $("gHigh").childNodes.length);
  conf("clicar numa peça realça a casa e os destinos legais",
    $("gHigh").childNodes.length > 0);
  click("e4"); await wait(2500);
  console.log("modo exploração ativo:", $("exploreBar").className,
    "| barra:", $("evalWhite").style.height, "| motor:", $("engineLines").textContent.replace(/\s+/g," ").trim().slice(0,80));
  conf("lance no tabuleiro entra em modo exploração e o motor responde",
    /\bon\b/.test($("exploreBar").className) && $("engineLines").textContent.trim().length > 0);

  // clique num lance da linha do motor
  const pv = window.document.querySelector(".pvmove");
  conf("a linha do motor tem lances clicáveis", !!pv);
  if (pv) {
    pv.click(); await wait(1500);
    console.log("clique na PV ok — peças:", $("gPieces").childNodes.length);
    conf("seguir a variação do motor mantém o tabuleiro de pé",
      $("gPieces").childNodes.length > 0);
  }

  $("btnBackToGame").click(); await wait(50);

  // play automático
  $("btnStart").click(); await wait(30);
  $("speed").value = "600";
  $("btnPlay").click(); await wait(1400);
  const plyAgora = () => (window.document.querySelector(".mv.on") || { dataset: {} }).dataset.ply;
  const plyPlay = plyAgora();
  conf("reprodução automática anda sozinha", $("btnPlay").className.includes("on") && +plyPlay > 0,
    "| lance atual: " + plyPlay);
  $("btnPlay").click(); await wait(700);
  conf("clicar de novo para a reprodução onde estava",
    !$("btnPlay").className.includes("on") && plyAgora() === plyPlay, "| parou no lance: " + plyAgora());
  $("btnNext").click(); await wait(30);
  conf("navegação manual ainda funciona", +plyAgora() === +plyPlay + 1, "| lance " + plyAgora());
  $("btnSound").click();
  conf("botão de som muda para mudo", $("btnSound").className.includes("off"));
  $("btnSound").click();

  /* ================= análises salvas ================= */
  console.log("\n== análises salvas ==");
  const CHAVE = "plyscope.analises.v1";
  const bruto = window.localStorage.getItem(CHAVE);
  const lista = JSON.parse(bruto || "[]");
  conf("a análise é salva sozinha ao terminar", lista.length === 1,
    "| chave: " + CHAVE + " | total no armazenamento: " + (bruto || "").length + " B");
  const rec = lista[0] || {};
  const bytes = JSON.stringify(rec).length;
  console.log("uma análise de", (rec.pm || []).length, "lances ocupa", bytes, "B",
    "(" + (bytes / 1024).toFixed(1) + " KB) · ~" +
    Math.round((bytes / Math.max(1, (rec.pm || []).length)) * 80 / 1024 * 10) / 10 + " KB por 80 lances");
  /* as linhas do motor continuam fora do registro; a única variação guardada
     é a das posições de erro, que é a resposta do treino (ver "treino" abaixo) */
  conf("o registro não carrega as linhas do motor", !/"pv"/.test(bruto || ""),
    "| variação guardada: " + (rec.pvt ? Object.keys(rec.pvt).length + " posições de erro"
                                       : "(esta partida não tem erro grave)"));
  const itens = window.document.querySelectorAll("#savedList .saved");
  conf("a análise aparece na lista de salvas", itens.length === 1,
    "| " + (itens[0] || { textContent: "" }).textContent.replace(/\s+/g, " ").trim());

  /* ================= troca de idioma com a análise na tela ================= */
  console.log("\n== troca de idioma (com análise aberta) ==");
  const txt1 = t1;
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
    /* As abas viraram os nomes das seções do trilho (relatório, lances,
       motor) mais o resumo dos painéis recolhíveis (importar, ajuda): é o
       mesmo texto de navegação, no lugar novo. */
    abas:      [...window.document.querySelectorAll(".sec-h h2, .rail details.disc > summary")]
                 .map((b) => b.textContent.trim()).join("|"),
    abertura:  txt1(window.document.querySelector(".opening .nm")),
    teoria:    txt1(window.document.querySelector(".opening .hint")),
    relLbl:    [...window.document.querySelectorAll(".report-grid .lbl")].map((e) => e.textContent.trim()).join(", "),
    relUnid:   txt1(window.document.querySelector(".accbox .u")),
    precisao:  [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent.trim()).join(" / "),
    /* o texto por extenso do momento decisivo é o rótulo acessível do botão;
       o que se vê é o −24%, que é igual nas duas línguas */
    momentos:  [...window.document.querySelectorAll("[data-goto]")]
                 .map((e) => (e.getAttribute("aria-label") || "").trim()).join(" | "),
    grafico:   (window.document.querySelector("#graph") || { getAttribute: () => "" })
                 .getAttribute("aria-label") || "",
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

  /* O dicionário inteiro nas duas línguas, para a varredura mais abaixo:
     só dá para fotografar cada língua enquanto ela está ativa. */
  const dicDaLinguaAtiva = () => {
    const d = {};
    window.PlyI18n.chaves().forEach((k) => { d[k] = window.PlyI18n.t(k); });
    return d;
  };

  const pt1 = foto();
  const dicPt = dicDaLinguaAtiva();
  $("btnLangEn").click(); await wait(150);
  const en = foto();
  const dicEn = dicDaLinguaAtiva();

  const par = (rot, a, b) => console.log("  " + (rot + ":").padEnd(15), a, "\n" + " ".repeat(18) + "→", b);
  par("html lang", pt1.lang, en.lang);
  par("title", pt1.titulo, en.titulo);
  par("topo", pt1.tagline + " · " + pt1.analisar + " · " + pt1.nova,
              en.tagline + " · " + en.analisar + " · " + en.nova);
  par("profundidade", pt1.prof, en.prof);
  par("velocidade", pt1.vel, en.vel);
  par("seções", pt1.abas, en.abas);
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
  conf("TOPO mudou", mudou(pt1.titulo, en.titulo) && mudou(pt1.tagline, en.tagline) &&
    mudou(pt1.analisar, en.analisar) && mudou(pt1.nova, en.nova) && mudou(pt1.prof, en.prof) &&
    mudou(pt1.vel, en.vel), "| <html lang>: " + pt1.lang + " → " + en.lang);
  conf("NOMES DAS SEÇÕES E DOS PAINÉIS mudaram", mudou(pt1.abas, en.abas),
    "| " + pt1.abas + " → " + en.abas);
  conf("RELATÓRIO mudou", mudou(pt1.relLbl, en.relLbl) && mudou(pt1.relUnid, en.relUnid) &&
    mudou(pt1.grafico, en.grafico) && mudou(pt1.abertura, en.abertura));
  conf("momentos decisivos mudaram", pt1.momentos ? mudou(pt1.momentos, en.momentos) : true,
    pt1.momentos ? "" : "| (esta partida não tem)");
  conf("SELOS DA LISTA mudaram", mudou(pt1.selos.join("|"), en.selos.join("|")));
  conf("ANÁLISES SALVAS mudaram", mudou(pt1.salvasDica, en.salvasDica) && mudou(pt1.salvasItem, en.salvasItem));
  conf("selo do pior lance — pt Capivarada / en Blunder",
    /Capivarada/.test(pt1.legenda) && /Blunder/.test(en.legenda) && !/Capivarada/.test(en.legenda),
    "| legenda pt: " + JSON.stringify(pt1.capiTip) + " | en: " + JSON.stringify(en.capiTip));

  conf("ANÁLISE INTACTA: mesmos selos, mesmo SAN, mesmo lance selecionado",
    pt1.nSelos === en.nSelos && pt1.nSelos > 0 && pt1.san === en.san && pt1.ply === en.ply
    && pt1.momentos.split(" | ").length === en.momentos.split(" | ").length,
    "| selos: " + pt1.nSelos + " → " + en.nSelos);
  conf("mesma precisão, formato de cada língua",
    pt1.precisao.replace(/,/g, ".") === en.precisao && pt1.precisao !== en.precisao,
    "| " + pt1.precisao + " → " + en.precisao);
  conf("seleções preservadas (profundidade e velocidade)",
    pt1.profVal === en.profVal && pt1.velVal === en.velVal,
    "| prof. " + en.profVal + " · vel. " + en.velVal);

  // sobras: palavras que não podem sobrar na tela em modo inglês
  const RESTOS = ["precisão", "Precisão", "análise", "Análise", "Partida", "partida", "lance",
                  "Brancas", "Pretas", "Relatório", "Importar", "Nenhuma", "perdeu", "teoria",
                  "Momentos", "Legenda", "Buscar", "Carregar", "Apagar", "Voltar", "Analisar"];
  const naTela = () => window.document.querySelector(".app").textContent.replace(/\s+/g, " ");
  const sobras = RESTOS.filter((w) => naTela().indexOf(w) >= 0);
  conf("nenhuma sobra em português na tela em inglês", sobras.length === 0,
    "| " + (sobras.length ? sobras.join(", ") : "(nenhuma)"));

  /* A mesma varredura, agora tirada do dicionário e nos dois sentidos: para
     cada chave, o texto da língua ERRADA não pode estar escrito na tela.
     Trechos curtos, com HTML ou iguais nas duas línguas ficam de fora — não
     distinguem nada (notação, "1 thread", "0,6 s"). */
  const trechos = (s) => String(s).replace(/<[^>]+>/g, " ").split(/\{\w+\}/)
    .map((p) => p.trim()).filter((p) => p.length >= 8);
  const varrer = (errado, certo) => {
    const tela = naTela();
    return Object.keys(errado).filter((k) => errado[k] && errado[k] !== certo[k] &&
      trechos(errado[k]).some((p) => tela.indexOf(p) >= 0))
      .map((k) => k + " " + JSON.stringify(errado[k].slice(0, 40)));
  };
  const restoPt = varrer(dicPt, dicEn);
  conf("varredura pelo dicionário: nada de português na tela em inglês", restoPt.length === 0,
    "| " + (restoPt.length ? restoPt.join(" | ") : "(nenhuma)"));

  $("btnLangPt").click(); await wait(150);
  const restoEn = varrer(dicEn, dicPt);
  conf("varredura pelo dicionário: nada de inglês na tela em português", restoEn.length === 0,
    "| " + (restoEn.length ? restoEn.join(" | ") : "(nenhuma)"));
  const pt2 = foto();
  const voltou = JSON.stringify(pt1) === JSON.stringify(pt2);
  conf("de volta ao português, tela idêntica à de antes", voltou);
  if (!voltou) {
    Object.keys(pt1).forEach((k) => {
      if (JSON.stringify(pt1[k]) !== JSON.stringify(pt2[k]))
        console.log("    difere:", k, JSON.stringify(pt1[k]), "≠", JSON.stringify(pt2[k]));
    });
  }
  conf("idioma guardado é o último escolhido",
    window.localStorage.getItem("plyscope.idioma") === "pt");

  // limpa a tela recarregando o PGN cru: sem selos, sem precisão
  $("btnLoadPgn").click(); await wait(200);
  const selosAntes = window.document.querySelectorAll(".mv .ic").length;
  conf("recarregar o PGN cru limpa selos e precisão",
    selosAntes === 0 && window.document.querySelectorAll(".accbox .v").length === 0);

  // reabre a análise salva: nada de motor
  const goAntes = H.buscas();
  // a lista de salvas mora no painel recolhível de importar; abrir é um clique
  $("paneImport").open = true;
  window.document.querySelector("#savedList [data-open]").click();
  await wait(300);
  const selosDepois = window.document.querySelectorAll(".mv .ic").length;
  const precisaoReaberta = [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / ");
  conf("reabrir a análise salva restaura tudo sem encostar no motor",
    selosDepois === nMoves && H.buscas() - goAntes === 0,
    "| selos: " + selosDepois + " | precisão: " + precisaoReaberta + " | buscas: " + (H.buscas() - goAntes));
  if (OPERA) conf("a precisão reaberta é a mesma de antes", precisaoReaberta === "96,2 / 83,0");
  conf("sem usuário conhecido a reaberta abre com brancas embaixo",
    $("evalWhite").style.bottom !== "auto",
    "| " + $("nmBot").textContent + " embaixo / " + $("nmTop").textContent + " em cima");
  /* Não há mais aba para "cair" em cima: o relatório está sempre na tela.
     O que se confere agora é o mesmo de antes, um passo mais fundo — que ele
     está de fato preenchido (precisão dos dois lados), com gráfico e com o
     painel de exportar disponível. */
  conf("reabrir devolve o relatório preenchido, com gráfico e exportação à mão",
    precisaoReaberta.split(" / ").filter((v) => /\d/.test(v)).length === 2
    && !!$("graph") && $("exportRow").style.display === ""
    && $("exportRow").querySelector("summary") && !!$("btnExportPgn"),
    "| precisão: " + precisaoReaberta);
  conf("reabrir não duplica o registro",
    JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length === 1);

  /* ================= exportar PGN comentado ================= */
  console.log("\n== PGN comentado ==");
  const BlobReal = window.Blob;
  let capturado = null;
  window.Blob = function (partes, opts) { capturado = { partes, opts }; return new BlobReal(partes, opts); };
  try { window.URL.createObjectURL = () => "blob:teste"; window.URL.revokeObjectURL = () => {}; } catch (e) {}
  $("btnExportPgn").click(); await wait(100);
  const pgnAnot = capturado ? capturado.partes.join("") : "";
  conf("o arquivo sai como PGN", capturado && capturado.opts &&
    /^application\/x-chess-pgn(;|$)/.test(capturado.opts.type),
    "| " + (capturado && capturado.opts && capturado.opts.type));
  conf('tem [Annotator "Plyscope"] e os cabeçalhos originais',
    /\[Annotator "Plyscope"\]/.test(pgnAnot) && /\[White "/.test(pgnAnot) && /\[Black "/.test(pgnAnot));
  const comentarios = pgnAnot.match(/\{[^}]*\}/g) || [];
  const comEval = comentarios.filter((c) => /\[%eval (-?\d+\.\d\d|#-?\d+)\]/.test(c));
  conf("todo lance vira comentário, quase todos com [%eval] numa linha",
    comentarios.length === window.document.querySelectorAll(".mv").length && comEval.length > 0,
    "| " + comentarios.length + " comentários, " + comEval.length + " com eval, " +
    (comentarios.length - comEval.length) + " sem (mate no tabuleiro)");
  const nags = (pgnAnot.match(/\$\d+/g) || []);
  conf("os selos viram NAG padrão de PGN", nags.length > 0 && nags.every((x) => /^\$\d+$/.test(x)),
    "| usados: " + ([...new Set(nags)].sort().join(" ") || "(nenhum)") + " | total: " + nags.length);
  conf("comentário de erro traz a perda em chance de vitória",
    /\{ \[%eval [^\]]+\] (Impreciso|Erro|Capivarada)[^}]*perdeu \d+% de chance de vitória/.test(pgnAnot));
  conf("nenhuma linha passa de 80 colunas",
    pgnAnot.split("\n").filter((l) => l.length > 80).length === 0);
  // o PGN gerado tem que voltar a ser lido por um parser de verdade
  let relido = -1;
  try {
    const c2 = new (require("chess.js").Chess)();
    c2.loadPgn(pgnAnot, { strict: false });
    relido = c2.history().length;
  } catch (e) { console.log("relido por chess.js: FALHOU —", e.message); }
  conf("o PGN anotado volta a ser lido por um parser de verdade",
    relido === window.document.querySelectorAll(".mv").length, "| " + relido + " lances");
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
  conf("exportado em inglês, o comentário de erro fala inglês",
    /\{ \[%eval [^\]]+\] (Inaccuracy|Mistake|Blunder)[^}]*gave up \d+% winning chances/.test(pgnEn));
  conf("notação e NAG não mudam com o idioma",
    (pgnEn.match(/\$\d+/g) || []).join(" ") === nags.join(" ") &&
    (pgnEn.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ")) === (pgnAnot.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ")));
  console.log("  amostra:", (pgnEn.match(/\{[^}]*(gave up|better was)[^}]*\}/) || ["(nenhuma)"])[0]);
  $("btnLangPt").click(); await wait(80);
  window.Blob = BlobReal;

  /* ================= exportar imagem ================= */
  console.log("\n== imagem do relatório ==");
  // 1) do jeito que o jsdom é de fábrica: sem getContext, o app só avisa
  $("btnExportPng").click(); await wait(100);
  conf("sem canvas o app avisa em vez de quebrar", $("toast").textContent.length > 0,
    "| " + $("toast").textContent);

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
  conf("com um contexto 2D o PNG é gerado em alta resolução",
    !!png && png.w >= 1200 && png.tipo === "image/png",
    "| " + (png && png.w + "x" + png.h) + " | " + $("toast").textContent);
  conf("o desenho tem fundo opaco, formas e texto",
    desenho.fillRect > 0 && desenho.fill > 0 && desenho.arc > 0 && desenho.textos.length > 0,
    "| formas: " + desenho.fill + " | círculos: " + desenho.arc + " | textos: " + desenho.textos.length);
  const txt = desenho.textos.join(" | ");
  conf("a imagem mostra o nome do app e os tipos de lance",
    /Plyscope/.test(txt) && /Brilhante/.test(txt) && /Impreciso/.test(txt));
  if (OPERA) {
    conf("a imagem mostra os dois jogadores e a precisão de cada um",
      txt.indexOf("Paul Morphy") >= 0 && /Duque Karl/.test(txt) &&
      /precisão \(%\)/.test(txt) && /\b96,2\b/.test(txt) && /\b83,0\b/.test(txt));
    conf("números e data no formato pt-BR", /96,2/.test(txt) && /02\/11\/1858/.test(txt),
      "| trechos: " + (txt.match(/9\d,\d|8\d,\d|\d\d\/\d\d\/\d{4}/g) || []).join(" "));
  }

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
  conf("QuotaExceededError não derruba o app e não perde o registro",
    !quebrou && JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length === 1,
    "| aviso: " + $("toast").textContent);
  $("btnNext").click();
  conf("navegação continua funcionando depois do erro de gravação",
    window.document.querySelectorAll(".mv").length === nMoves);

  /* ================= apagar ================= */
  window.document.querySelector("#savedList [data-del]").click(); await wait(50);
  console.log("\n== apagar ==");
  conf("apagar tira o registro do armazenamento e da lista",
    JSON.parse(window.localStorage.getItem(CHAVE) || "[]").length === 0
    && window.document.querySelectorAll("#savedList .saved").length === 0
    && $("savedHint").textContent.trim().length > 0,
    "| aviso: " + $("savedHint").textContent.slice(0, 30) + "…");

  /* ================= perspectiva do tabuleiro ================= */
  console.log("\n== perspectiva de quem está estudando ==");
  const partida = (brancas, pretas) => `[Event "Perspectiva"]
[White "${brancas}"]
[Black "${pretas}"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;
  const abrir = async (pgn) => { $("pgnBox").value = pgn; $("btnLoadPgn").click(); await wait(150); };
  // o tabuleiro girado é o que troca os nomes de lugar e ancora a barra em cima
  const girado = () => $("evalWhite").style.bottom === "auto";
  const lados = () => $("nmBot").textContent + " embaixo / " + $("nmTop").textContent + " em cima";

  await abrir(partida("Paul Morphy", "Duque Karl"));
  conf("sem usuário guardado o tabuleiro não gira", girado() === false, "| " + lados());

  // é na busca online que a pessoa diz quem é; o nome fica guardado
  $("userBox").value = "MinhaConta";
  $("btnFetch").click(); await wait(120);
  conf("o nome digitado na busca fica guardado no navegador",
    window.localStorage.getItem("plyscope.usuario") === "MinhaConta",
    "| " + JSON.stringify(window.localStorage.getItem("plyscope.usuario")));

  await abrir(partida("Magnus", "minhaconta"));   // maiúsculas não importam
  conf("usuário das pretas: gira, e os nomes trocam de lado",
    girado() === true && $("nmBot").textContent === "minhaconta"
    && $("nmTop").textContent === "Magnus", "| " + lados());

  await abrir(partida("MINHACONTA", "Magnus"));
  conf("usuário das brancas: não gira",
    girado() === false && $("nmBot").textContent === "MINHACONTA"
    && $("nmTop").textContent === "Magnus", "| " + lados());

  await abrir(partida("Paul Morphy", "Duque Karl"));
  conf("partida de terceiros: não gira", girado() === false, "| " + lados());

  // escolha manual manda: navegar, trocar de idioma e reabrir não desfazem
  $("btnFlip").click(); await wait(50);
  const manual = girado();
  $("btnNext").click(); $("btnEnd").click(); await wait(80);
  const aposNavegar = girado();
  $("btnLangEn").click(); await wait(80); $("btnLangPt").click(); await wait(80);
  conf("giro manual manda: navegar e trocar de idioma não desfazem",
    manual === true && aposNavegar === true && girado() === true);

  // partida nova recomeça a decisão (aqui, de novo, ninguém reconhecido)
  await abrir(partida("Paul Morphy", "Duque Karl"));
  conf("partida nova recomeça a decisão da perspectiva", girado() === false);

  /* ================= peças deslizando =================
     O jsdom não roda CSS: o que dá para provar aqui é que os elementos <use>
     são reaproveitados (mesma referência), que a classe de transição entra só
     no lance vizinho e que, passada a animação, cada peça está na casa que o
     FEN manda. O deslize em si (curva, 180 ms) fica para o olho. */
  console.log("\n== peças deslizando ==");
  const ChessRef = require("chess.js").Chess;
  const MS = 260;                       // 180 ms de animação + folga
  const nos    = () => [...$("gPieces").childNodes];
  const vivas  = () => nos().filter((e) => !e.classList.contains("pc-out"));
  const anim   = () => nos().filter((e) => e.classList.contains("pc-anim"));
  const saindo = () => nos().filter((e) => e.classList.contains("pc-out"));
  const entrando = () => nos().filter((e) => e.classList.contains("pc-in"));
  const em     = (sq) => vivas().find((e) => e.dataset.sq === sq);
  const noDom  = (sq) => nos().find((e) => e.dataset.sq === sq);
  const fenDom = () => {
    const g = {}; for (const e of vivas()) g[e.dataset.sq] = e.dataset.pc;
    const linhas = [];
    for (let r = 8; r >= 1; r--) {
      let l = "", v = 0;
      for (const f of "abcdefgh") {
        const p = g[f + r];
        if (!p) v++; else { if (v) { l += v; v = 0; } l += p[0] === "w" ? p[1].toUpperCase() : p[1]; }
      }
      if (v) l += v; linhas.push(l);
    }
    return linhas.join("/");
  };
  const fensDe = (pgn) => {
    const c = new ChessRef(); c.loadPgn(pgn, { strict: false });
    const h = c.history({ verbose: true }), hdr = c.getHeaders();
    const r = new ChessRef(); if (hdr.FEN) r.load(hdr.FEN);
    const out = [r.fen().split(" ")[0]];
    for (const m of h) { r.move(m.san); out.push(r.fen().split(" ")[0]); }
    return out;
  };
  const transf = (sq, flip) => {
    const f = "abcdefgh".indexOf(sq[0]), r = 8 - +sq[1];
    return "translate(" + (flip ? 7 - f : f) * 100 + "," + (flip ? 7 - r : r) * 100 + ") scale(2.5)";
  };
  const abrirPgn = async (pgn) => { $("pgnBox").value = pgn; $("btnLoadPgn").click(); await wait(200); };
  const andar = async (btn, ms) => { $(btn).click(); await wait(ms === undefined ? MS : ms); };
  const okAntesAnim = ok.length;

  /* --- 1) um lance para frente: desliza quem moveu, ninguém é recriado --- */
  const PGN_A = '[Event "t"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. Nxe5 Nxe5 1/2-1/2';
  const FA = fensDe(PGN_A);
  await abrirPgn(PGN_A);
  const antes = nos().slice(), peaoE2 = em("e2");
  await andar("btnNext", 5);
  conf("a peça que moveu recebe a transição",
    peaoE2.classList.contains("pc-anim") && anim().length === 1 && em("e4") === peaoE2,
    "| transform: " + peaoE2.getAttribute("transform"));
  conf("as outras não são recriadas nem animadas",
    nos().every((e) => antes.indexOf(e) >= 0) && nos().length === antes.length
    && nos().filter((e) => e !== peaoE2).every((e) => !e.getAttribute("class")),
    "| elementos: " + antes.length + " → " + nos().length);
  await wait(MS);
  conf("passada a animação a classe sai e a posição bate com o FEN",
    anim().length === 0 && fenDom() === FA[1], "| " + fenDom());

  /* --- 2) pulo longo: ninguém anima --- */
  await andar("btnEnd");
  conf("pulo até o fim é instantâneo", anim().length === 0 && saindo().length === 0 && fenDom() === FA[10], "| " + fenDom());
  await andar("btnStart");
  conf("pulo até o início é instantâneo", anim().length === 0 && fenDom() === FA[0]);
  const alvoPly6 = window.document.querySelector('.mv[data-ply="6"]');
  if (alvoPly6) { alvoPly6.click(); await wait(5); }
  conf("clique num lance distante é instantâneo", anim().length === 0, "| ply da lista: 6");
  await wait(MS);

  /* --- 3) roque: as duas peças deslizam --- */
  const rei = em("e1"), torre = em("h1");
  await andar("btnNext", 5);
  conf("roque anima rei e torre juntos",
    anim().length === 2 && rei.classList.contains("pc-anim") && torre.classList.contains("pc-anim")
    && rei.dataset.sq === "g1" && torre.dataset.sq === "f1");
  await wait(MS);
  conf("roque termina com os mesmos elementos nas casas certas",
    em("g1") === rei && em("f1") === torre && fenDom() === FA[7]);
  await andar("btnPrev", 5);
  conf("desfazer o roque anima de volta",
    anim().length === 2 && rei.dataset.sq === "e1" && torre.dataset.sq === "h1");
  await wait(MS);
  conf("posição depois de desfazer o roque", fenDom() === FA[6]);

  /* --- 4) captura: a capturada só some quando a outra chega --- */
  await andar("btnNext"); await andar("btnNext");        // 4.O-O e 4...Nf6; o próximo é 5.Nxe5
  const cavalo = em("f3"), peaoE5 = em("e5");
  await andar("btnNext", 5);
  conf("na captura o cavalo desliza e o peão continua no tabuleiro",
    cavalo.dataset.sq === "e5" && cavalo.classList.contains("pc-anim")
    && peaoE5.parentNode !== null && peaoE5.classList.contains("pc-out")
    && peaoE5.getAttribute("transform") === transf("e5", false));
  await wait(MS);
  conf("terminada a animação a capturada saiu do DOM",
    peaoE5.parentNode === null && fenDom() === FA[9] && nos().length === vivas().length);

  /* --- 5) voltar um lance: descaptura --- */
  await andar("btnPrev", 5);
  conf("voltar traz a capturada de volta na casa dela",
    entrando().length === 1 && noDom("e5") !== cavalo && noDom("e5").dataset.pc === "bp"
    && cavalo.dataset.sq === "f3" && cavalo.classList.contains("pc-anim"));
  await wait(MS);
  conf("posição depois de descapturar", fenDom() === FA[8] && entrando().length === 0);

  /* --- 6) en passant e promoção --- */
  const PGN_B = '[Event "t"]\n[SetUp "1"]\n[FEN "4k3/1P6/8/3pP3/8/8/8/4K3 w - d6 0 1"]\n\n1. exd6 Kd7 2. b8=Q Kc6 1-0';
  const FB = fensDe(PGN_B);
  await abrirPgn(PGN_B);
  const peaoD5 = em("d5"), peaoE5b = em("e5");
  await andar("btnNext", 5);
  conf("en passant: some o peão de d5, não o da casa de destino",
    peaoE5b.dataset.sq === "d6" && peaoD5.classList.contains("pc-out")
    && peaoD5.getAttribute("transform") === transf("d5", false) && noDom("d6") === peaoE5b);
  await wait(MS);
  conf("posição depois do en passant", fenDom() === FB[1] && peaoD5.parentNode === null);

  await andar("btnNext");
  const peaoB7 = em("b7");
  await andar("btnNext", 5);
  conf("promoção: o peão desliza ainda como peão",
    peaoB7.getAttribute("href") === "#wp" && peaoB7.dataset.sq === "b8"
    && peaoB7.classList.contains("pc-anim") && vivas().filter((e) => e.dataset.pc === "wq").length === 1);
  await wait(MS);
  conf("ao chegar vira dama (mesmo elemento)",
    em("b8") === peaoB7 && peaoB7.getAttribute("href") === "#wq" && fenDom() === FB[3]);
  await andar("btnPrev", 5);
  conf("voltar despromove antes de deslizar",
    peaoB7.getAttribute("href") === "#wp" && peaoB7.dataset.sq === "b7" && peaoB7.classList.contains("pc-anim"));
  await wait(MS);
  conf("posição depois de desfazer a promoção", fenDom() === FB[2]);

  /* --- 7) girar o tabuleiro não é lance: sem animação --- */
  $("btnFlip").click(); await wait(5);
  conf("girar não anima, só recalcula as coordenadas",
    anim().length === 0 && em("b7").getAttribute("transform") === transf("b7", true) && fenDom() === FB[2]);
  $("btnFlip").click(); await wait(5);
  conf("desgirar idem", anim().length === 0 && em("b7").getAttribute("transform") === transf("b7", false));

  /* --- 8) atropelo: seta pressionada não deixa peça no meio do caminho --- */
  await abrirPgn(PGN_A);
  $("btnNext").click(); $("btnNext").click(); $("btnNext").click(); $("btnNext").click();
  await wait(5);
  const meioDoCaminho = fenDom();
  await wait(MS);
  conf("quatro setas seguidas terminam na posição certa",
    fenDom() === FA[4] && anim().length === 0 && saindo().length === 0,
    "| já correta durante a animação: " + (meioDoCaminho === FA[4]));

  /* --- 9) reprodução automática: animação mais curta que o intervalo --- */
  await andar("btnStart");
  $("speed").value = "600"; $("btnPlay").click();
  await wait(300);
  const noVao = anim().length;
  await wait(320);
  const noLance = anim().length;
  $("btnPlay").click(); await wait(MS);
  conf("a 0,6 s a animação termina antes do próximo lance",
    noVao === 0 && noLance > 0, "| 300 ms depois do lance: " + noVao + " animando · 620 ms: " + noLance);

  /* --- 10) prefers-reduced-motion: comportamento de hoje --- */
  const mmReal = window.matchMedia;
  window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null });
  await andar("btnStart");
  const antesRM = nos().slice();
  await andar("btnNext", 5);
  conf("com prefers-reduced-motion nada anima",
    anim().length === 0 && saindo().length === 0 && entrando().length === 0 && fenDom() === FA[1]);
  conf("mas os elementos continuam sendo reaproveitados",
    nos().every((e) => antesRM.indexOf(e) >= 0));
  if (mmReal) window.matchMedia = mmReal; else delete window.matchMedia;
  await wait(MS);

  const anims = ok.slice(okAntesAnim);
  console.log("  animação das peças:", anims.every(Boolean) ? "OK"
    : "FALHOU (" + anims.filter((x) => !x).length + " de " + anims.length + ")");

  /* ================= nome de jogador hostil ================= */
  // PGN e API de terceiros mandam texto arbitrário para dentro de innerHTML e de
  // atributos (title=, data-*=). Se o escape falhar, isso vira execução de script.
  console.log("\n== nome de jogador hostil ==");
  // sem aspas de propósito: aspas encerram o valor da tag e nunca chegam ao app.
  // o que passa pelo parser de PGN é isto, e é isto que o escape precisa segurar.
  const veneno = `<img src=x onerror=window.__xss=1>`;
  const doisJogos = [1, 2].map((n) => `[Event "Injeção ${n}"]
[White "${veneno}"]
[Black "Fulano"]
[Result "*"]

1. e4 e5 *`).join("\n\n");
  $("pgnBox").value = doisJogos;
  $("btnLoadPgn").click(); await wait(200);
  conf("nada foi executado ao listar as partidas", window.__xss === undefined);
  conf("nenhum <img> injetado na lista", window.document.querySelectorAll("#gameList img").length === 0);
  const item = window.document.querySelector("#gameList button");
  conf("o nome aparece como texto", !!item && item.textContent.includes("onerror"));
  const primeiro = window.document.querySelector("#gameList button");
  if (primeiro) { primeiro.click(); await wait(200); }
  conf("na chapa do jogador também é texto", $("nmBot").textContent.includes("onerror") ||
    $("nmTop").textContent.includes("onerror"));
  conf("nada foi executado ao abrir a partida", window.__xss === undefined);

  /* ---------- o veredito ---------- */
  const falhas = ok.filter((x) => !x).length;
  console.log("\n== resumo ==");
  console.log(ok.length + " asserções, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
