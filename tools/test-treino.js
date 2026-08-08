/* Suíte do modo "Aprenda com seus erros". Separada da principal porque roda
   uma segunda análise completa — as duas no mesmo processo passavam do limite
   de tempo do ambiente de desenvolvimento. Mesmo preparo, mesmo veredito. */
const H = require("./harness.js");
const { window, $, wait, ok, conf, t1, CHAVE } = H;

(async () => {
  await wait(300);

  /* O jsdom se apresenta como en-US e o app abre em inglês; o treino é
     conferido em português, como na suíte principal. O rótulo do botão
     é o sinal de "acabou de analisar". */
  $("btnLangPt").click();
  await wait(50);
  const ROTULO_ANALISAR = $("btnAnalyze").textContent;

  /* ================= treino: aprenda com seus erros =================
     A partida da Ópera não tem Erro nem Capivarada (o Duque só foi
     impreciso), então o treino é exercitado numa segunda partida: o
     final da Imortal, que começa por um FEN e tem erro dos dois lados. */
  console.log("\n== treino: aprenda com seus erros ==");
  const errosDaTela = () => [...window.document.querySelectorAll(".mv")]
    .filter((e) => /^(Erro|Capivarada)$/.test(t1(e.querySelector(".ic title"))))
    .map((e) => +e.dataset.ply);

  conf("partida sem Erro nem Capivarada não oferece treino",
    errosDaTela().length === 0 && !$("btnTrainStart"),
    "| erros na lista: " + errosDaTela().length);

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
  conf("a partida de treino (final da Imortal) analisou os 15 meios-lances",
    window.document.querySelectorAll(".mv").length === 15);

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
  conf("o gabarito sai do próprio tabuleiro (seta azul), sem espiar o estado",
    gab.length > 0 && gab.every((g) => g.melhor && g.jogado),
    "| " + gab.map((g) => g.ply + ":" + (g.melhor ? g.melhor.de + g.melhor.para : "?")).join(" "));

  const contaRel = {};
  [...window.document.querySelectorAll(".report-grid .r")].forEach((r) => {
    contaRel[t1(r.children[1])] = (+t1(r.children[0]) || 0) + (+t1(r.children[2]) || 0);
  });
  const alvo = (contaRel["Erro"] || 0) + (contaRel["Capivarada"] || 0);

  conf("com erros na partida, o relatório chama para o treino",
    !!$("btnTrainStart") && t1($("btnTrainStart")).length > 0, "| " + t1($("btnTrainStart")));
  const goTreino = H.buscas();
  $("btnTrainStart").click(); await wait(80);
  const naFila = +(t1($("trainCount")).match(/(\d+)\s*$/) || [0, 0])[1];
  conf("entrar no treino abre o painel e recolhe o deck",
    $("panelTrain").style.display === ""
    && window.document.querySelector(".panel-main").style.display === "none",
    "| contador: " + t1($("trainCount")));
  conf("a fila do treino bate com o relatório e com os selos da lista",
    naFila === alvo && naFila === plies.length,
    "| fila " + naFila + " · relatório " + alvo + " · selos " + plies.length);
  conf("o exercício abre na posição do erro, sem entregar a resposta",
    !!realceDoUltimo() && $("gArrows").childNodes.length === 0,
    "| lance do adversário realçado: " + JSON.stringify(realceDoUltimo()));
  conf("o enunciado explica o que fazer", t1($("trainBody")).length > 20);
  console.log("enunciado:", t1($("trainBody")).slice(0, 150));

  /* ---- 1º item: erra, pede dica, pede a resposta ---- */
  clicarCasa(gab[0].jogado.de); await wait(20);
  clicarCasa(gab[0].jogado.para); await wait(80);
  conf("jogar o lance da partida (o errado) é recusado",
    !!window.document.querySelector(".train-note.bad"),
    "| " + t1(window.document.querySelector(".train-note.bad")));
  conf("errar não avança a fila e oferece tentar de novo, dica e resposta",
    !!$("btnTrainRetry") && !!$("btnTrainHint") && !!$("btnTrainShow"),
    "| " + t1($("trainCount")));
  await wait(700);
  console.log("  o lance errado sai do tabuleiro sozinho:",
    $("gPieces").childNodes.length, "peças, vez de quem errou de novo");
  $("btnTrainRetry").click(); await wait(40);
  conf("tentar de novo limpa o aviso", !window.document.querySelector(".train-note.bad"),
    "| segue em " + t1($("trainCount")));
  $("btnTrainHint").click(); await wait(30);
  const dica = (t1($("trainBody")).match(/A peça certa[^.]*\./) || [""])[0];
  conf("a dica diz a peça e não entrega a casa",
    dica.length > 0 && !/[a-h][1-8]/.test(dica), "| " + (dica || "(nenhuma)"));
  $("btnTrainShow").click(); await wait(60);
  const passos0 = window.document.querySelectorAll(".train-line span.on").length;
  conf("ver a resposta mostra o melhor lance e a continuação",
    !!window.document.querySelector(".train-note.good") && !!window.document.querySelector(".train-line"),
    "| " + t1(window.document.querySelector(".train-line")));
  await wait(2000);
  const passos1 = window.document.querySelectorAll(".train-line span.on").length;
  conf("a continuação anda sozinha no tabuleiro", passos1 > passos0,
    "| " + passos0 + " → " + passos1 + " meios-lances");
  $("btnTrainNext").click(); await wait(60);
  conf("o botão leva ao próximo exercício", /2\D+\d/.test(t1($("trainCount"))), "| " + t1($("trainCount")));

  /* ---- 2º item: acerta ---- */
  clicarCasa(gab[1].melhor.de); await wait(20);
  clicarCasa(gab[1].melhor.para); await wait(80);
  conf("acertar o melhor lance é reconhecido e mostra a continuação",
    !!window.document.querySelector(".train-note.good") && !!window.document.querySelector(".train-line"),
    "| " + t1(window.document.querySelector(".train-line")));

  /* ---- troca de idioma no meio do exercício ---- */
  $("btnLangEn").click(); await wait(90);
  console.log("\nem inglês no meio do treino:", t1($("trainBody")).slice(0, 130));
  conf("trocar de idioma no meio do treino traduz sem perder o item",
    /[A-Za-z]/.test(t1($("trainCount"))) && !/de\s/.test(t1($("btnTrainExit")))
    && !!window.document.querySelector(".train-line"),
    "| " + t1($("trainCount")) + " | " + t1($("btnTrainExit")));
  $("btnLangPt").click(); await wait(60);
  conf("de volta ao português o treino continua no mesmo item",
    !!window.document.querySelector(".train-line") && t1($("trainCount")).length > 0,
    "| " + t1($("trainCount")) + " | " + t1($("btnTrainNext")));

  /* ---- resto da fila na base do "ver a resposta" ---- */
  let voltas = 0;
  while (!/Fim do treino/.test(t1($("trainCount"))) && voltas++ < 40) {
    if ($("btnTrainNext")) { $("btnTrainNext").click(); await wait(50); }
    if ($("btnTrainShow")) { $("btnTrainShow").click(); await wait(50); }
  }
  const somas = [...window.document.querySelectorAll(".train-sum .v")].map((e) => +e.textContent);
  console.log("\nresumo:", t1($("trainCount")), "|", t1($("trainBody")).slice(0, 120));
  conf("no fim, o placar fecha com o tamanho da fila",
    somas.length === 3 && somas.reduce((a, b) => a + b, 0) === naFila,
    "| de primeira / com dica / passou batido: " + somas.join(" / "));
  $("btnTrainRedo").click(); await wait(60);
  conf("refazer volta só com os que faltaram",
    t1($("trainCount")).indexOf(String(naFila - 1)) >= 0,
    "| " + t1($("trainCount")) + " | esperado " + (naFila - 1));

  /* ---- sair: a análise continua onde estava ---- */
  $("btnTrainExit").click(); await wait(60);
  conf("sair do treino fecha o painel e devolve o deck",
    $("panelTrain").style.display === "none"
    && window.document.querySelector(".panel-main").style.display === "");
  conf("a análise continua onde estava e o treino inteiro não usou o motor",
    window.document.querySelectorAll(".mv .ic").length === 15
    && H.buscas() - goTreino === 0 && !!$("btnTrainStart"),
    "| precisão: " + [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / ") +
    " | buscas: " + (H.buscas() - goTreino));

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
  $("paneImport").open = true;
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  const goSalva = H.buscas();
  $("btnTrainStart").click(); await wait(60);
  $("btnTrainShow").click(); await wait(60);
  conf("reabrir a análise salva devolve o treino com a continuação guardada",
    !!window.document.querySelector(".train-line") && H.buscas() - goSalva === 0,
    "| " + t1($("trainCount")) + " | " + (t1(window.document.querySelector(".train-line")) || "(nenhuma)"));
  $("btnTrainExit").click(); await wait(40);

  /* ---- registro de versão anterior: sem pvt, o treino continua de pé ---- */
  const listaV = JSON.parse(window.localStorage.getItem(CHAVE) || "[]");
  delete listaV[0].pvt;
  window.localStorage.setItem(CHAVE, JSON.stringify(listaV));
  $("paneImport").open = true;
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  $("btnTrainStart").click(); await wait(60);
  clicarCasa(gab[0].melhor.de); await wait(20);
  clicarCasa(gab[0].melhor.para); await wait(80);
  conf("registro de versão anterior (sem pv): o treino funciona e explica a falta",
    !!window.document.querySelector(".train-note.good") && !window.document.querySelector(".train-line")
    && t1($("trainBody")).indexOf("versão anterior") >= 0 && !!$("btnTrainNext")
    && H.buscas() - goSalva === 0);
  $("btnTrainExit").click(); await wait(40);

  /* ---- perspectiva conhecida: só os erros do usuário entram na fila ---- */
  const listaU = JSON.parse(window.localStorage.getItem(CHAVE) || "[]");
  listaU[0].us = "Adolf Anderssen";          // como fica quando a partida veio da busca
  window.localStorage.setItem(CHAVE, JSON.stringify(listaU));
  $("paneImport").open = true;
  window.document.querySelector("#savedList [data-open]").click(); await wait(200);
  conf("com perspectiva conhecida, a chamada já anuncia só os erros dele",
    /2/.test(t1($("btnTrainStart"))), "| " + t1($("btnTrainStart")));
  $("btnTrainStart").click(); await wait(60);
  conf("a fila fica só com os erros do usuário, em segunda pessoa",
    /\b2\b/.test(t1($("trainCount"))) && /Você jogou/.test(t1($("trainBody"))),
    "| " + t1($("trainCount")));
  $("btnTrainExit").click(); await wait(40);

  $("btnCopyFen").click(); $("btnCopyPgn").click(); await wait(50);
  conf("copiar sem clipboard avisa em vez de quebrar", $("toast").textContent.length > 0,
    "| " + $("toast").textContent);
  /* Era "as quatro abas abrem", uma de cada vez. Agora as três que se
     consultam o tempo todo têm que estar na tela JUNTAS — nenhuma escondendo
     a outra — e a quarta, importar, a um clique no resumo do painel. */
  $("paneImport").open = false;
  const naTela = (id) => {
    const el = $(id);
    for (let n = el; n; n = n.parentElement) {
      if (n.tagName === "DETAILS" && !n.open) return false;
      if (/display:\s*none/.test(n.getAttribute && n.getAttribute("style") || "")) return false;
    }
    return true;
  };
  conf("relatório, lances e motor ficam visíveis ao mesmo tempo, sem trocar de painel",
    ["reportBody", "movesBody", "engineLines"].every(naTela) &&
    window.document.querySelectorAll(".mv").length > 0 &&
    window.document.querySelectorAll(".accbox .v").length === 2,
    "| lances: " + window.document.querySelectorAll(".mv").length +
    " | motor: " + t1($("engineLines")).slice(0, 40));
  conf("importar sai do caminho e volta com um clique no resumo",
    !naTela("pgnBox") &&
    (window.document.querySelector("#paneImport > summary").click(), naTela("pgnBox")),
    "| " + t1(window.document.querySelector("#paneImport > summary")));

  /* ---------- o veredito ---------- */
  const falhas = ok.filter((x) => !x).length;
  console.log("\n== resumo ==");
  console.log(ok.length + " asserções, " + falhas + " falhas");
  process.exit(falhas ? 1 : 0);
})();
