/* ============================================================
   Plyscope — dicionário bilíngue (pt-BR / en) e troca de idioma
   ------------------------------------------------------------
   ONDE MORA: arquivo próprio, injetado no index.html pelo marcador
   /*__I18N__*\/ do shell.html, logo antes do app.js. Nada é buscado
   pela rede: no fim continua um arquivo único que abre offline.

   POR QUE FORA DO app.js: são ~180 chaves × 2 línguas. Dentro do
   app.js elas dobrariam o topo do arquivo e afogariam a lógica no
   diff. Separado, o tradutor mexe num arquivo só, e o app.js só
   ganha as chamadas. É o mesmo padrão que a base de aberturas já
   usa (src/data/openings.js + marcador no build).

   FORMATO: um dicionário só, com as duas línguas lado a lado —
   ["português", "english"]. Assim é impossível uma chave existir
   numa língua e faltar na outra, que é o defeito clássico de
   manter dois objetos separados.

   PLACEHOLDERS: {nome} é trocado pelos parâmetros de t().
   ============================================================ */
window.PlyI18n = (function () {
"use strict";

const CHAVE = "plyscope.idioma";
const IDIOMAS = ["pt", "en"];
const HTML_LANG = { pt: "pt-BR", en: "en" };

/* ------------------------------------------------------------------
   O que NÃO está aqui, de propósito:
   notação de xadrez (SAN/FEN/PGN/ECO), nomes de jogadores e de
   torneio, o exemplo de PGN do campo de importação e a avaliação
   numérica do motor (+1.24 / M3), que é escrita com ponto em
   qualquer idioma, como fazem Lichess, Chess.com e o próprio UCI.
   ------------------------------------------------------------------ */
const STR = {

  /* ---------- cabeça do documento ---------- */
  "app.titulo":        ["Plyscope · Análise de Xadrez", "Plyscope · Chess Analysis"],
  "app.descricao":     ["Plyscope — cada lance sob a lupa: revisão de partidas de xadrez com Stockfish, 100% no seu navegador.",
                        "Plyscope — every move under the lens: chess game review with Stockfish, 100% in your browser."],

  /* ---------- topo ---------- */
  "marca.tagline":     ["Cada lance sob a lupa · motor local", "Every move under the lens · local engine"],
  "idioma.grupo":      ["Idioma da interface", "Interface language"],
  "idioma.pt":         ["Ver a interface em português do Brasil", "Show the interface in Brazilian Portuguese"],
  "idioma.en":         ["Ver a interface em inglês", "Show the interface in English"],
  "topo.profundidade": ["Profundidade", "Depth"],
  "topo.profundidade.dica": ["Profundidade da análise", "Analysis depth"],
  "prof.12":           ["Rápida · prof. 12", "Fast · depth 12"],
  "prof.16":           ["Padrão · prof. 16", "Standard · depth 16"],
  "prof.20":           ["Profunda · prof. 20", "Deep · depth 20"],
  "btn.girar":         ["Girar tabuleiro (F)", "Flip board (F)"],
  "btn.girar.aria":    ["Girar tabuleiro", "Flip board"],
  "btn.nova":          ["Nova partida", "New game"],
  "btn.analisar":      ["Analisar partida", "Analyze game"],
  "btn.parar":         ["Parar análise", "Stop analysis"],

  /* ---------- palco ---------- */
  "lado.brancas":      ["Brancas", "White"],
  "lado.pretas":       ["Pretas", "Black"],
  "explorar.titulo":   ["Explorando variação", "Exploring a variation"],
  "explorar.voltar":   ["Voltar à partida", "Back to the game"],
  "btn.inicio":        ["Início (Home)", "Start (Home)"],
  "btn.inicio.aria":   ["Início", "Start"],
  "btn.anterior":      ["Anterior (seta esquerda)", "Previous (left arrow)"],
  "btn.anterior.aria": ["Lance anterior", "Previous move"],
  "btn.play":          ["Passar os lances automaticamente (espaço)", "Play through the moves (space)"],
  "btn.play.aria":     ["Reproduzir a partida", "Play the game"],
  "btn.pausar":        ["Pausar (espaço)", "Pause (space)"],
  "btn.proximo":       ["Próximo (seta direita)", "Next (right arrow)"],
  "btn.proximo.aria":  ["Próximo lance", "Next move"],
  "btn.fim":           ["Fim (End)", "End (End)"],
  "btn.fim.aria":      ["Fim", "End"],
  "velocidade.dica":   ["Velocidade da reprodução", "Playback speed"],
  "velocidade.aria":   ["Velocidade", "Speed"],
  "vel.600":           ["0,6 s", "0.6s"],
  "vel.1200":          ["1,2 s", "1.2s"],
  "vel.2000":          ["2 s", "2s"],
  "vel.3500":          ["3,5 s", "3.5s"],
  "btn.som":           ["Som (M)", "Sound (M)"],
  "btn.som.aria":      ["Ligar ou desligar o som", "Turn the sound on or off"],
  "btn.fen":           ["Copiar FEN da posição", "Copy the position's FEN"],
  "btn.pgn":           ["Copiar PGN da partida", "Copy the game's PGN"],

  /* ---------- status da análise ---------- */
  "status.analisando":   ["Analisando…", "Analyzing…"],
  "status.iniciando":    ["Iniciando o motor…", "Starting the engine…"],
  "status.carregando":   ["Carregando Stockfish (≈7 MB, só na primeira vez).",
                          "Loading Stockfish (≈7 MB, first time only)."],
  "status.carregandoLote": ["Subindo {n} motores (≈{mb} MB) para analisar as posições em paralelo.",
                          "Starting {n} engines (≈{mb} MB) to analyze positions in parallel."],
  "status.lance":        ["Analisando lance {i} de {n}", "Analyzing move {i} of {n}"],
  "status.restante":     ["Tempo restante ≈ {t}", "Time left ≈ {t}"],
  "status.conferindo":   ["Conferindo momentos decisivos ({k}/{n})", "Double-checking key moments ({k}/{n})"],
  "status.profundidade": ["Profundidade {d}", "Depth {d}"],
  "status.concluida":    ["Análise concluída", "Analysis complete"],
  "status.precisao":     ["Precisão — Brancas {w} · Pretas {b}", "Accuracy — White {w} · Black {b}"],

  /* ---------- abas ---------- */
  "aba.importar":  ["Importar", "Import"],
  "aba.relatorio": ["Relatório", "Report"],
  "aba.lances":    ["Lances", "Moves"],
  "aba.motor":     ["Motor", "Engine"],

  /* ---------- importar ---------- */
  "import.pgnLabel": ["PGN da partida", "Game PGN"],
  "import.pgnAjuda": ["Cole o texto completo. Vários jogos no mesmo PGN viram uma lista.",
                      "Paste the whole text. Several games in one PGN become a list."],
  "import.carregar": ["Carregar PGN", "Load PGN"],
  "import.arquivo":  ["Arquivo .pgn", ".pgn file"],
  "import.arraste":  ["arraste um arquivo .pgn aqui", "drop a .pgn file here"],

  "salvas.titulo":      ["Análises salvas", "Saved analyses"],
  "salvas.dica":        ["As análises ficam guardadas neste navegador.", "Analyses are kept in this browser."],
  "salvas.bloqueado":   ["Este navegador está com o armazenamento bloqueado — o app funciona igual, mas não guarda análises.",
                         "Storage is blocked in this browser — the app works the same, but analyses are not kept."],
  "salvas.vazio":       ["Nenhuma análise guardada ainda. Ao terminar uma análise ela aparece aqui e reabre na hora.",
                         "No analysis saved yet. When one finishes it shows up here and reopens instantly."],
  "salvas.contagem":    ["Guardadas neste navegador (as {n} mais recentes). Clique para reabrir sem analisar de novo.",
                         "Kept in this browser (the {n} most recent). Click to reopen without analyzing again."],
  "salvas.apagar":      ["Apagar", "Delete"],
  "salvas.apagar.dica": ["Apagar esta análise", "Delete this analysis"],
  "salvas.apagar.aria": ["Apagar análise", "Delete analysis"],
  "salvas.semData":     ["sem data", "no date"],
  "salvas.precisao":    ["precisão {v}", "accuracy {v}"],

  "buscar.titulo":      ["Buscar partidas online", "Fetch games online"],
  "buscar.usuario":     ["seu usuário", "your username"],
  "buscar.botao":       ["Buscar", "Fetch"],
  "buscar.dica":        ["Traz suas últimas partidas públicas. Sem login, sem custo.",
                         "Brings in your latest public games. No login, no charge."],
  "buscar.buscando":    ["Buscando…", "Fetching…"],
  "buscar.achou":       ["{n} partidas encontradas — escolha uma:", "{n} games found — pick one:"],
  "buscar.digite":      ["Digite o nome de usuário.", "Type the username."],
  "buscar.semRede":     ["Não deu certo: sem internet ou o site bloqueou a consulta.",
                         "It didn't work: no internet, or the site blocked the request."],
  "buscar.coep":        [" (Se só a busca falha, sirva o app sem os cabeçalhos COOP/COEP — veja o README.)",
                         " (If only the search fails, serve the app without the COOP/COEP headers — see the README.)"],
  "buscar.erro":        ["Não deu certo: {msg}.", "It didn't work: {msg}."],
  "buscar.semUsuario":  ["usuário não encontrado", "user not found"],
  "buscar.semPublicas": ["sem partidas públicas", "no public games"],
  "buscar.nenhuma":     ["nenhuma partida encontrada", "no games found"],

  /* ---------- relatório ---------- */
  "rel.vazio.titulo":     ["Relatório da partida", "Game report"],
  "rel.vazio.texto":      ["Carregue um PGN e clique em <b>Analisar partida</b> para ver precisão, classificação de cada lance e os momentos decisivos.",
                           "Load a PGN and click <b>Analyze game</b> to see accuracy, a badge for every move and the key moments."],
  "rel.carregada.titulo": ["Partida carregada", "Game loaded"],
  "rel.carregada.texto":  ["Clique em <b>Analisar partida</b> para gerar precisão, classificação dos lances e momentos decisivos.",
                           "Click <b>Analyze game</b> to produce accuracy, move badges and the key moments."],
  "rel.precisao":         ["precisão (%)", "accuracy (%)"],
  "rel.grafico":          ["Chance de vitória das brancas ao longo da partida — clique para navegar.",
                           "White's winning chances through the game — click to navigate."],
  "rel.momentos":         ["Momentos decisivos", "Key moments"],
  "rel.perdeu":           ["perdeu {n}% de chance de vitória", "gave up {n}% winning chances"],
  "rel.abertura.fora":    ["abertura fora da base", "opening not in the database"],
  "rel.abertura.teoria":  ["teoria até o lance {n}", "theory up to move {n}"],

  "export.pgn":      ["PGN comentado", "Annotated PGN"],
  "export.pgn.dica": ["Baixar a partida com avaliação e classificação em comentários",
                      "Download the game with evaluations and badges as comments"],
  "export.png":      ["Imagem do relatório", "Report image"],
  "export.png.dica": ["Baixar o relatório como imagem PNG", "Download the report as a PNG image"],
  "export.nota":     ["O <b>.pgn</b> abre no Lichess, Chess.com e SCID com os selos e as avaliações. O <b>.png</b> é o resumo para compartilhar.",
                      "The <b>.pgn</b> opens in Lichess, Chess.com and SCID with the badges and evaluations. The <b>.png</b> is the summary to share."],

  /* ---------- treino: aprenda com seus erros ----------
     A fila é feita dos Erros e Capivaradas da partida. Quando o lado do
     usuário é conhecido (partida buscada pelo nome dele), o treino fala
     em segunda pessoa; quando não é, diz de quem era o lance. */
  "treino.sub":          ["Treino", "Drill"],
  "treino.titulo":       ["Aprenda com seus erros", "Learn from your mistakes"],
  "treino.cta":          ["Aprenda com seus erros", "Learn from your mistakes"],
  "treino.cta.n":        ["{n} lances para revisar", "{n} moves to review"],
  "treino.cta.n1":       ["1 lance para revisar", "1 move to review"],
  "treino.explica":      ["Cada Erro e cada Capivarada volta ao tabuleiro, na posição em que aconteceu, para você procurar o lance certo.",
                          "Every Mistake and every Capivarada comes back to the board, in the position where it happened, for you to hunt down the right move."],
  "treino.sair":         ["Sair", "Leave"],
  "treino.sair.dica":    ["Sair do treino e voltar à análise", "Leave the drill and go back to the analysis"],
  "treino.contagem":     ["{k} de {n}", "{k} of {n}"],
  "treino.vazio":        ["Nenhum Erro nem Capivarada nesta partida — nada para treinar.",
                          "No Mistake and no Capivarada in this game — nothing to drill."],
  "treino.lanceN":       ["Lance {n}", "Move {n}"],
  "treino.jogou.eu":     ["Você jogou {san} e perdeu {n}% de chance de vitória.",
                          "You played {san} and gave up {n}% winning chances."],
  "treino.jogou.w":      ["As brancas jogaram {san} e perderam {n}% de chance de vitória.",
                          "White played {san} and gave up {n}% winning chances."],
  "treino.jogou.b":      ["As pretas jogaram {san} e perderam {n}% de chance de vitória.",
                          "Black played {san} and gave up {n}% winning chances."],
  "treino.turno.eu":     ["Sua vez — ache o melhor lance.", "Your turn — find the best move."],
  "treino.turno.w":      ["Jogam as brancas — ache o melhor lance.", "White to move — find the best move."],
  "treino.turno.b":      ["Jogam as pretas — ache o melhor lance.", "Black to move — find the best move."],
  "treino.acertou":      ["Isso: {san}.", "That's it: {san}."],
  "treino.eraEsse":      ["O melhor era {san}.", "The best move was {san}."],
  "treino.porque":       ["E por quê:", "And here's why:"],
  "treino.semLinha":     ["Esta análise foi salva por uma versão anterior do Plyscope, que não guardava a continuação. O lance certo continua conferido; para ver a linha, use a aba Motor.",
                          "This analysis was saved by an earlier version of Plyscope, which kept no continuation. The right move is still checked; to see the line, use the Engine tab."],
  "treino.errou":        ["{san} não é o melhor lance aqui.", "{san} isn't the best move here."],
  "treino.errouCusto.eu":    ["Foi o que você jogou na partida: custa {n}% de chance de vitória.",
                              "That's what you played in the game: it costs {n}% winning chances."],
  "treino.errouCusto.outro": ["Foi o lance jogado na partida: custa {n}% de chance de vitória.",
                              "That's the move played in the game: it costs {n}% winning chances."],
  "treino.errouSemCusto":    ["Quanto ele custa eu não sei dizer — o motor não avaliou este lance.",
                              "What it costs I can't say — the engine never looked at this move."],
  "treino.tentarDeNovo": ["Tentar de novo", "Try again"],
  "treino.dica":         ["Dica", "Hint"],
  "treino.dicaPeca":     ["A peça certa é {peca}.", "The right piece is {peca}."],
  "treino.resposta":     ["Ver a resposta", "Show the answer"],
  "treino.proximo":      ["Próximo erro", "Next mistake"],
  "treino.verResumo":    ["Ver o resumo", "See the summary"],
  "treino.resumo.titulo":   ["Fim do treino", "Drill finished"],
  "treino.resumo.primeira": ["de primeira", "first try"],
  "treino.resumo.dica":     ["com dica ou nova tentativa", "with a hint or another try"],
  "treino.resumo.resposta": ["passaram batido", "went by unsolved"],
  "treino.refazer":      ["Refazer os que faltaram", "Redo the ones I missed"],
  "treino.voltar":       ["Voltar à análise", "Back to the analysis"],

  /* nome das peças, para a dica do treino (que não diz a casa) */
  "peca.p": ["o peão", "the pawn"],
  "peca.n": ["o cavalo", "the knight"],
  "peca.b": ["o bispo", "the bishop"],
  "peca.r": ["a torre", "the rook"],
  "peca.q": ["a dama", "the queen"],
  "peca.k": ["o rei", "the king"],

  /* ---------- lances ---------- */
  "lances.vazio.titulo": ["Nenhuma partida carregada", "No game loaded"],
  "lances.vazio.texto":  ["Importe um PGN para navegar lance a lance.", "Import a PGN to step through the moves."],

  /* ---------- motor ---------- */
  "motor.vazio.titulo": ["Motor ocioso", "Engine idle"],
  "motor.vazio.texto":  ["Analise a partida ou avalie só esta posição para ver as melhores linhas.",
                         "Analyze the game, or just evaluate this position, to see the best lines."],
  "motor.semDados":     ["Sem dados para esta posição. Analise a partida ou avalie só esta posição no botão abaixo.",
                         "No data for this position. Analyze the game, or evaluate just this position with the button below."],
  "motor.fundo":        ["Analisar esta posição a fundo", "Analyze this position deeply"],
  "motor.parar":        ["Parar", "Stop"],
  "motor.nota":         ["roda <b>no seu computador</b>. Nenhuma posição é enviada para servidores.",
                         "runs <b>on your computer</b>. No position is ever sent to a server."],
  "motor.mt":           ["multi-thread, {n} threads", "multi-thread, {n} threads"],
  "motor.st":           ["1 thread", "1 thread"],
  "motor.semIsolamento": [" — sem isolamento cross-origin", " — no cross-origin isolation"],
  "motor.lote":         ["partida em {n} motores, ≈{mb} MB", "game on {n} engines, ≈{mb} MB"],
  "motor.loteCaiu":     ["Um motor da análise em paralelo parou. Refazendo a análise num motor só.",
                         "One of the parallel engines stopped. Redoing the analysis on a single engine."],
  "motor.indisponivel": ["indisponível", "unavailable"],
  "motor.carregando":   ["carregando…", "loading…"],
  "motor.prof":         ["prof. {d}", "depth {d}"],
  "motor.falhou":       ["Falha ao carregar o motor. Abra pelo atalho 'Abrir Plyscope'.",
                         "The engine failed to load. Open the app through the 'Abrir Plyscope' shortcut."],
  "motor.naoIniciou":   ["Não foi possível iniciar o motor.", "The engine could not be started."],
  "motor.offline":      ["Motor indisponível.", "Engine unavailable."],

  /* ---------- legenda e selos ----------
     "Capivarada" é o nome do selo em português, piada interna do projeto.
     Em inglês ele é "Blunder": no meio de uma escala técnica (Inaccuracy,
     Mistake…) uma palavra em português não diz nada a quem lê em inglês. */
  "legenda.titulo":       ["Legenda", "Legend"],

  /* ---------- rodapé do trilho ---------- */
  "rodape.codigo":        ["Código no GitHub", "Source on GitHub"],
  "rodape.apoiar":        ["Me pague um café", "Buy me a coffee"],
  "rodape.apoiarTitulo":  ["PIX ou GitHub Sponsors", "PIX or GitHub Sponsors"],
  "cls.brilhante":        ["Brilhante", "Brilliant"],
  "cls.excelente":        ["Excelente", "Great"],
  "cls.melhor":           ["Melhor", "Best"],
  "cls.otimo":            ["Ótimo", "Excellent"],
  "cls.bom":              ["Bom", "Good"],
  "cls.forcado":          ["Forçado", "Forced"],
  "cls.impreciso":        ["Impreciso", "Inaccuracy"],
  "cls.erro":             ["Erro", "Mistake"],
  "cls.capivarada":       ["Capivarada", "Blunder"],

  /* ---------- avisos rápidos (toast) ---------- */
  "toast.pgnIlegivel":       ["Não consegui ler esse PGN.", "I couldn't read that PGN."],
  "toast.pgnSemLances":      ["PGN sem lances.", "PGN with no moves."],
  "toast.colePgn":           ["Cole um PGN primeiro.", "Paste a PGN first."],
  "toast.carregueAntes":     ["Carregue uma partida primeiro.", "Load a game first."],
  "toast.semPartida":        ["Nenhuma partida carregada.", "No game loaded."],
  "toast.copiaIndisponivel": ["Cópia indisponível neste modo — abra pelo atalho.",
                              "Copying is unavailable in this mode — open the app through the shortcut."],
  "toast.naoCopiou":         ["Não consegui copiar.", "I couldn't copy it."],
  "toast.fenCopiado":        ["FEN copiado.", "FEN copied."],
  "toast.pgnCopiado":        ["PGN copiado.", "PGN copied."],
  "toast.salvarCheio":       ["Não deu para salvar: armazenamento do navegador cheio.",
                              "Couldn't save: the browser's storage is full."],
  "toast.analiseNaoAchada":  ["Análise não encontrada.", "Analysis not found."],
  "toast.analiseNaoBate":    ["A análise salva não bate com a partida.", "The saved analysis doesn't match the game."],
  "toast.analiseRestaurada": ["Análise restaurada do navegador — sem rodar o motor.",
                              "Analysis restored from the browser — without running the engine."],
  "toast.analiseApagada":    ["Análise apagada.", "Analysis deleted."],
  "toast.naoApagou":         ["Não consegui apagar — armazenamento indisponível.",
                              "I couldn't delete it — storage unavailable."],
  "toast.semDownload":       ["Este navegador não deixou baixar o arquivo.", "This browser wouldn't let the file download."],
  "toast.pgnBaixado":        ["PGN comentado baixado.", "Annotated PGN downloaded."],
  "toast.semArquivo":        ["Não consegui gerar o arquivo.", "I couldn't generate the file."],
  "toast.analisePrimeiro":   ["Analise a partida primeiro.", "Analyze the game first."],
  "toast.semCanvas":         ["Este navegador não desenha em canvas — exportação de imagem indisponível.",
                              "This browser doesn't draw on canvas — image export is unavailable."],
  "toast.semDesenho":        ["Não consegui desenhar a imagem.", "I couldn't draw the image."],
  "toast.imagemBaixada":     ["Imagem do relatório baixada.", "Report image downloaded."],
  "toast.semPng":            ["Não consegui gerar o PNG.", "I couldn't generate the PNG."],

  /* ---------- comentários do PGN exportado ---------- */
  "pgn.perdeu":     [" — perdeu {n}% de chance de vitória", " — gave up {n}% winning chances"],
  "pgn.melhorEra":  ["; melhor era {san}", "; better was {san}"],

  /* ---------- imagem do relatório ---------- */
  "img.tagline": ["Cada lance sob a lupa · análise local com Stockfish",
                  "Every move under the lens · local analysis with Stockfish"],
  "img.semData": ["partida sem data", "game with no date"],
  "img.grafico": ["Chance de vitória das brancas ao longo da partida · {n} lances",
                  "White's winning chances through the game · {n} moves"],
  "img.rodape":  ["· relatório gerado no navegador, sem enviar nada para servidor",
                  "· report generated in the browser, nothing sent to any server"],
};

/* ============================================================
   Estado e persistência
   ============================================================ */
let atual = "pt";
const ouvintes = new Set();

function guardado() {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return IDIOMAS.indexOf(v) >= 0 ? v : null;
  } catch (e) { return null; }
}
/** Escolha salva > navigator.language (pt* → pt) > inglês. */
function inicial() {
  const g = guardado();
  if (g) return g;
  try {
    const nav = window.navigator || {};
    const l = String(nav.language || (nav.languages && nav.languages[0]) || "").toLowerCase();
    if (l.indexOf("pt") === 0) return "pt";
  } catch (e) {}
  return "en";
}

/* ============================================================
   Tradução
   ============================================================ */
const IDX = { pt: 0, en: 1 };
function bruto(chave) {
  const par = STR[chave];
  if (!par) return null;
  return par[IDX[atual]] != null ? par[IDX[atual]] : par[0];
}
/** Texto da chave, com {placeholders} trocados. Chave desconhecida volta como está. */
function t(chave, params) {
  const s = bruto(chave);
  if (s == null) return chave;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}
/** Como t(), mas chave ausente vira "" — para textos opcionais (o "cls.*.dica"
    de um selo cujo nome precise de explicação extra em alguma língua). */
function opt(chave, params) {
  return STR[chave] ? t(chave, params) : "";
}

/* ============================================================
   Números, porcentagens, tempos e datas no formato de cada língua
   ------------------------------------------------------------
   Formatação feita à mão em vez de Intl: são só duas línguas e
   três formatos, o resultado precisa ser idêntico em qualquer
   navegador (inclusive nos testes em jsdom) e nada disso depende
   de dados de locale que o navegador possa não ter.
   ============================================================ */
function num(v, casas) {
  if (v == null || typeof v !== "number" || !isFinite(v)) return "–";
  const s = casas != null ? v.toFixed(casas) : String(v);
  return atual === "pt" ? s.replace(".", ",") : s;
}
function pct(v, casas) {
  return v == null || typeof v !== "number" || !isFinite(v) ? "–" : num(v, casas) + "%";
}
/** Segundos: "1,2 s" em português, "1.2s" em inglês. */
function seg(v, casas) {
  return num(v, casas) + (atual === "pt" ? " s" : "s");
}
/** Data de cabeçalho PGN (AAAA.MM.DD). Incompleta ou desconhecida passa direto. */
function data(s) {
  const txt = String(s == null ? "" : s).trim();
  const m = txt.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return txt.indexOf("?") >= 0 ? "" : txt;
  return atual === "pt" ? m[3] + "/" + m[2] + "/" + m[1] : m[2] + "/" + m[3] + "/" + m[1];
}

/* ============================================================
   Aplicação nos elementos marcados do HTML
   ------------------------------------------------------------
   data-i18n             → textContent
   data-i18n-html        → innerHTML (só para textos com <b> dentro,
                           todos vindos deste arquivo — nunca de fora)
   data-i18n-title       → title
   data-i18n-placeholder → placeholder
   data-i18n-aria        → aria-label
   ============================================================ */
const ATRIBUTOS = [
  ["data-i18n-html",        (el, s) => { el.innerHTML = s; }],
  ["data-i18n",             (el, s) => { el.textContent = s; }],
  ["data-i18n-title",       (el, s) => el.setAttribute("title", s)],
  ["data-i18n-placeholder", (el, s) => el.setAttribute("placeholder", s)],
  ["data-i18n-aria",        (el, s) => el.setAttribute("aria-label", s)],
];
function aplicar(raiz) {
  const r = raiz || document;
  for (const [attr, por] of ATRIBUTOS) {
    r.querySelectorAll("[" + attr + "]").forEach((el) => {
      const s = bruto(el.getAttribute(attr));
      if (s != null) por(el, s);
    });
  }
  const meta = r.querySelector && r.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("app.descricao"));
}

/* ============================================================
   Troca de idioma
   ============================================================ */
function definir(l) {
  if (IDIOMAS.indexOf(l) < 0 || l === atual) { if (l === atual) avisar(); return; }
  atual = l;
  try { window.localStorage.setItem(CHAVE, l); } catch (e) {}
  refletir();
  avisar();
}
function refletir() {
  try { document.documentElement.setAttribute("lang", HTML_LANG[atual]); } catch (e) {}
  aplicar(document);
}
function avisar() { ouvintes.forEach((fn) => { try { fn(atual); } catch (e) {} }); }

atual = inicial();
refletir();

return {
  idioma: () => atual,
  idiomas: () => IDIOMAS.slice(),
  definir,
  t, opt,
  num, pct, seg, data,
  aplicar,
  aoTrocar(fn) { ouvintes.add(fn); },
  /* exposto para o teste conferir cobertura sem depender da tela */
  chaves: () => Object.keys(STR),
};
})();
