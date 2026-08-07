/* Testes do pool de motores — com um motor de mentira, mas o app de verdade.
   ------------------------------------------------------------------
       cd tools && node --test test-pool.js

   POR QUE UM STUB E NÃO O STOCKFISH: aqui o assunto é o ESCALONADOR, não
   o xadrez. O stub responde a UCI, mas a avaliação que ele devolve é uma
   FUNÇÃO PURA do FEN — a mesma posição vale sempre o mesmo, não importa
   quem perguntou, quando, nem em que ordem. Com isso a comparação entre
   o caminho antigo e o pool vira uma igualdade exata: se algum resultado
   cair no índice errado, ou se a ordem de chegada vazar para o
   relatório, os números MUDAM e o teste cai. Com o Stockfish de verdade
   isso não daria para provar, porque a avaliação dele a uma profundidade
   fixa depende da tabela de transposição (ver tools/bench-pool.js).

   O stub responde FORA DE ORDEM de propósito: os atrasos são escolhidos
   para que o motor 3 termine a posição 27 antes de o motor 0 terminar a
   posição 4. É o caso ruim, e é o caso normal aqui.

   O que cada teste prova está no nome. Em resumo:
     · N posições ficam em voo ao mesmo tempo (o pool paraleliza mesmo);
     · o resultado entra no índice certo mesmo fora de ordem;
     · "Parar análise" para TODOS, sem busca órfã;
     · sem Worker, com pool que não sobe, ou com motor que morre no meio,
       o caminho de hoje assume e a análise sai inteira.
*/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const PGN = fs.readFileSync(path.join(ROOT, "docs", "exemplos", "opera-1858.pgn"), "utf8");
const { Chess } = (() => {
  const locais = ["chess.js", path.join(__dirname, "node_modules", "chess.js")];
  for (const l of locais) { try { return require(l); } catch (e) {} }
  throw new Error("chess.js não encontrado — rode 'npm install' em tools/");
})();

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ============================================================
   O motor de mentira
   ============================================================ */

/** Avaliação determinística de um FEN: mesma posição, mesmo número. */
function avaliaFen(fen) {
  let h = 2166136261;
  for (let i = 0; i < fen.length; i++) { h ^= fen.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 601) - 300;          // -300..300 centipeões
}

/** Painel compartilhado: é aqui que o teste enxerga o que os workers fizeram. */
function novoPainel() {
  return {
    instancias: [],        // um registro por Worker criado
    emVoo: 0, pico: 0,     // buscas em andamento e o máximo simultâneo
    gos: 0, stops: 0,
    posGo: [],             // ordem em que as buscas COMEÇARAM
    posFim: [],            // ordem em que TERMINARAM (fora de ordem, de propósito)
  };
}

/**
 * Fábrica da classe Worker de mentira.
 *   painel        onde registrar o que aconteceu
 *   atraso(i)     quanto cada busca demora (ms) — é o que embaralha a ordem
 *   naoSobe       quantos workers devem falhar ao subir (degradação)
 *   morreNoGo     número da busca (global) em que um worker morre no meio
 */
function fabricaWorker(painel, opts = {}) {
  const atraso = opts.atraso || ((i) => 6 + ((i * 7) % 5) * 9);   // 6..42 ms, embaralhado
  let criados = 0;
  return class WorkerFalso {
    constructor(url) {
      const meu = criados++;
      if (opts.naoSobe && meu < opts.naoSobe) throw new Error("worker recusado (teste)");
      this.url = url;
      this.morto = false;
      this.reg = { url, cmds: [], gos: 0, stops: 0, terminado: false, aberta: null };
      painel.instancias.push(this.reg);
      this.fen = null;
      this.timer = null;
      this.onmessage = null;
      this.onerror = null;
    }
    fala(linha) { if (this.onmessage && !this.morto) this.onmessage({ data: linha }); }
    postMessage(cmd) {
      if (this.morto) return;
      this.reg.cmds.push(cmd);
      if (cmd === "uci") { setTimeout(() => this.fala("uciok"), 0); return; }
      if (cmd === "isready") { setTimeout(() => this.fala("readyok"), 0); return; }
      if (cmd.startsWith("position fen ")) { this.fen = cmd.slice("position fen ".length); return; }
      if (cmd.startsWith("go")) {
        const n = painel.gos++;
        this.reg.gos++;
        painel.emVoo++;
        if (painel.emVoo > painel.pico) painel.pico = painel.emVoo;
        painel.posGo.push(this.fen);
        this.reg.aberta = this.fen;

        if (opts.morreNoGo != null && n === opts.morreNoGo) {   // o motor morre no meio da busca
          setTimeout(() => {
            painel.emVoo--;
            this.morto = true;
            this.reg.aberta = null;
            if (this.onerror) this.onerror(new Error("worker morreu (teste)"));
          }, 5);
          return;
        }
        this.timer = setTimeout(() => this.responde(cmd), atraso(n));
        return;
      }
      if (cmd === "stop") {
        this.reg.stops++; painel.stops++;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; this.responde("go depth 1", true); }
        return;
      }
    }
    responde(cmd, cortada) {
      this.timer = null;
      const prof = +(/depth (\d+)/.exec(cmd) || [0, 1])[1] || 1;
      let lances = [];
      try { lances = new Chess(this.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || "")); }
      catch (e) { lances = []; }
      lances.sort();                                  // ordem estável: nada de sorteio
      const base = avaliaFen(this.fen);
      for (let mpv = 1; mpv <= Math.min(2, lances.length); mpv++) {
        this.fala("info depth " + prof + " multipv " + mpv +
                  " score cp " + (base - (mpv - 1) * 25) + " nodes 1000 pv " + lances[mpv - 1]);
      }
      painel.emVoo--;
      painel.posFim.push(this.fen);
      this.reg.aberta = null;
      this.fala("bestmove " + (lances[0] || "(none)"));
    }
    terminate() {
      this.morto = true; this.reg.terminado = true;
      if (this.timer) { clearTimeout(this.timer); this.timer = null; painel.emVoo--; this.reg.aberta = null; }
    }
  };
}

/* ============================================================
   O app de verdade, num jsdom
   ============================================================ */
async function abrirApp({ nucleos, memoria, Worker }) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  const dom = new JSDOM(HTML, { runScripts: "dangerously", pretendToBeVisual: true,
    virtualConsole: vc, url: "http://localhost/" });
  const { window } = dom;
  Object.defineProperty(window.navigator, "hardwareConcurrency", { value: nucleos, configurable: true });
  if (memoria != null) Object.defineProperty(window.navigator, "deviceMemory", { value: memoria, configurable: true });
  window.Worker = Worker;                       // pode ser uma classe, ou não ser função nenhuma
  const $ = (id) => window.document.getElementById(id);
  await espera(250);
  $("btnLangPt").click();
  await espera(30);
  const rotulo = $("btnAnalyze").textContent;
  $("pgnBox").value = PGN;
  $("btnLoadPgn").click();
  await espera(120);
  return {
    window, dom, $, rotulo,
    async analisa(prof = 12, aoMeio) {
      $("depth").value = String(prof);
      $("btnAnalyze").click();
      if (aoMeio) await aoMeio();
      const t0 = Date.now();
      while ($("btnAnalyze").textContent !== rotulo && Date.now() - t0 < 60000) await espera(15);
      assert.equal($("btnAnalyze").textContent, rotulo, "a análise não terminou em 60 s");
    },
    /* A impressão digital do relatório: precisão, selo de cada lance e a
       avaliação escrita ao lado. Se um resultado cair no índice errado,
       alguma destas três muda. */
    digital() {
      return {
        precisao: [...window.document.querySelectorAll(".accbox .v")].map((e) => e.textContent).join(" / "),
        selos: [...window.document.querySelectorAll(".mv .ic title")].map((e) => e.textContent.trim()).join(" "),
        evals: [...window.document.querySelectorAll(".mv .ev")].map((e) => e.textContent.trim()).join(" "),
      };
    },
    modo() { return ($("engineMode") || { textContent: "" }).textContent.trim(); },
    fecha() { try { window.close(); } catch (e) {} },
  };
}

/** Quantos motores realmente pediram busca (o interativo não pede). */
const motoresDoLote = (painel) => painel.instancias.filter((r) => r.gos > 0).length;

/* ============================================================
   1. o pool paraleliza mesmo
   ============================================================ */
test("N posições ficam em voo ao mesmo tempo (e o teto de motores é respeitado)", async () => {
  const painel = novoPainel();
  const app = await abrirApp({ nucleos: 16, Worker: fabricaWorker(painel) });
  await app.analisa(12);

  // 16 núcleos: o teto do app é 6 motores, não 15
  assert.equal(motoresDoLote(painel), 6, "esperado o teto de 6 motores no lote");
  assert.equal(painel.pico, 6, "esperado 6 buscas em voo ao mesmo tempo, veio " + painel.pico);
  assert.equal(painel.emVoo, 0, "sobrou busca em voo no fim da análise");
  assert.match(app.modo(), /6 motores/, "a aba Motor precisa dizer em quantos motores a partida rodou");
  assert.match(app.modo(), /162 MB/, "a aba Motor precisa mostrar a conta de memória (6 × 27 MB)");

  // todo motor do lote recebeu Hash 16 (e não os 128 do motor interativo)
  const doLote = painel.instancias.filter((r) => r.gos > 0);
  for (const r of doLote) {
    assert.ok(r.cmds.includes("setoption name Hash value 16"),
      "motor do lote sem Hash 16: " + r.cmds.slice(0, 4).join(" | "));
  }
  app.fecha();
});

/* ============================================================
   2. determinismo: o resultado não depende da ordem de chegada
   ============================================================ */
test("respostas fora de ordem caem no índice certo: pool e motor único dão o MESMO relatório", async () => {
  const p1 = novoPainel();
  const sozinho = await abrirApp({ nucleos: 2, Worker: fabricaWorker(p1) });   // 2 núcleos: caminho antigo
  await sozinho.analisa(12);
  const base = sozinho.digital();
  assert.equal(motoresDoLote(p1), 1, "com 2 núcleos a análise tem de rodar num motor só");
  assert.equal(p1.pico, 1, "o caminho antigo não pode ter duas buscas em voo");
  sozinho.fecha();

  const p2 = novoPainel();
  const emPool = await abrirApp({ nucleos: 8, Worker: fabricaWorker(p2) });
  await emPool.analisa(12);
  const comPool = emPool.digital();
  assert.equal(motoresDoLote(p2), 6);
  assert.equal(p2.pico, 6);

  // as buscas TERMINARAM fora da ordem em que começaram — é o caso que interessa
  const foraDeOrdem = p2.posGo.some((fen, i) => p2.posFim[i] !== fen);
  assert.ok(foraDeOrdem, "o stub devia ter embaralhado a ordem das respostas");

  assert.equal(comPool.evals, base.evals, "as avaliações não bateram lance a lance");
  assert.equal(comPool.selos, base.selos, "os selos não bateram");
  assert.equal(comPool.precisao, base.precisao, "a precisão não bateu");
  assert.ok(base.precisao.length > 3, "o relatório saiu vazio — o teste não provaria nada");
  emPool.fecha();

  // e duas rodadas do pool dão exatamente a mesma coisa
  const p3 = novoPainel();
  const outra = await abrirApp({ nucleos: 8, Worker: fabricaWorker(p3) });
  await outra.analisa(12);
  assert.deepEqual(outra.digital(), comPool, "duas análises em pool deram relatórios diferentes");
  outra.fecha();
});

/* ============================================================
   3. parar precisa parar todo mundo
   ============================================================ */
test("'Parar análise' para todos os motores do lote, sem busca órfã", async () => {
  const painel = novoPainel();
  // buscas longas: dá tempo de apertar o botão com o lote a todo vapor
  const app = await abrirApp({ nucleos: 8, Worker: fabricaWorker(painel, { atraso: () => 220 }) });

  await app.analisa(12, async () => {
    await espera(400);                       // deixa o lote engrenar
    assert.ok(painel.emVoo > 1, "o lote nem chegou a engrenar (em voo: " + painel.emVoo + ")");
    app.$("btnAnalyze").click();             // "Parar análise"
  });

  const doLote = painel.instancias.filter((r) => r.gos > 0);
  assert.ok(doLote.length >= 2, "o teste precisa de pelo menos 2 motores no lote");
  for (const r of doLote) assert.ok(r.stops > 0, "um motor do lote não recebeu 'stop'");
  assert.equal(painel.emVoo, 0, "ficou busca em voo depois do Parar (worker órfão queimando CPU)");
  for (const r of painel.instancias) assert.equal(r.aberta, null, "sobrou busca aberta num worker");

  const gosNoParar = painel.gos;
  await espera(400);
  assert.equal(painel.gos, gosNoParar, "o lote continuou pedindo buscas depois do Parar");
  assert.equal(painel.emVoo, 0);
  app.fecha();
});

/* ============================================================
   4. degradação
   ============================================================ */
test("sem Worker o app não tenta pool nenhum e segue o caminho de hoje", async () => {
  const painel = novoPainel();
  // Worker não é função: é exatamente o que o navegador sem Worker oferece
  const app = await abrirApp({ nucleos: 16, Worker: undefined });
  await app.analisa(12);
  assert.equal(painel.instancias.length, 0, "nenhum worker devia ter sido criado");
  assert.doesNotMatch(app.modo(), /motores/, "não pode anunciar pool sem Worker");
  // e o app avisa que o motor não subiu, como já fazia antes do pool
  assert.match(app.modo(), /indispon|unavailable/i);
  app.fecha();
});

test("pool que não sobe cai no motor único e a análise sai inteira e igual", async () => {
  const p1 = novoPainel();
  const base = await abrirApp({ nucleos: 2, Worker: fabricaWorker(p1) });
  await base.analisa(12);
  const esperado = base.digital();
  base.fecha();

  const p2 = novoPainel();
  // os 6 primeiros new Worker() falham: o pool não sobe, o interativo sobe
  const app = await abrirApp({ nucleos: 8, Worker: fabricaWorker(p2, { naoSobe: 6 }) });
  await app.analisa(12);

  assert.equal(motoresDoLote(p2), 1, "a análise devia ter caído no motor único");
  assert.deepEqual(app.digital(), esperado, "a análise degradada não bateu com a do caminho antigo");
  app.fecha();
});

test("motor que morre no meio do lote: refaz no motor único, sem perder a análise", async () => {
  const p1 = novoPainel();
  const base = await abrirApp({ nucleos: 2, Worker: fabricaWorker(p1) });
  await base.analisa(12);
  const esperado = base.digital();
  base.fecha();

  const p2 = novoPainel();
  // a 10ª busca do lote mata o worker que a estava fazendo
  const app = await abrirApp({ nucleos: 8, Worker: fabricaWorker(p2, { morreNoGo: 10 }) });
  await app.analisa(12);

  assert.ok(p2.instancias.length > 6, "depois da queda o app precisa subir o motor interativo");
  assert.deepEqual(app.digital(), esperado,
    "depois da queda do pool o relatório tem de ser o do caminho antigo, inteiro");
  assert.equal(p2.emVoo, 0, "sobrou busca em voo depois da queda do pool");
  app.fecha();
});

/* ============================================================
   5. a análise sob demanda não fica na fila do lote
   ============================================================ */
test("com o pool rodando, 'Analisar esta posição a fundo' responde num motor dedicado", async () => {
  const painel = novoPainel();
  const app = await abrirApp({ nucleos: 8, Worker: fabricaWorker(painel, { atraso: () => 160 }) });

  let interativo = null;
  await app.analisa(12, async () => {
    await espera(500);                       // lote a todo vapor
    const doLote = painel.instancias.filter((r) => r.gos > 0).length;
    assert.ok(doLote >= 2, "o lote nem engrenou");
    // o motor interativo é o que o app sobe DEPOIS do pool, e ainda não buscou nada
    interativo = painel.instancias[painel.instancias.length - 1];
    assert.equal(interativo.gos, 0, "o motor interativo não devia estar buscando ainda");

    app.$("btnDeep").click();                // "Analisar esta posição a fundo"
    await espera(400);
    assert.ok(interativo.gos > 0,
      "o 'a fundo' não chegou ao motor interativo — está esperando a fila do lote");
    assert.ok(interativo.cmds.some((c) => /^go infinite/.test(c)),
      "a análise sob demanda devia pedir 'go infinite' ao motor dedicado");
    app.$("btnStopDeep").click();
  });

  // e o lote terminou normalmente, apesar do pedido no meio
  assert.equal(painel.emVoo, 0);
  assert.ok(app.digital().precisao.length > 3, "a análise do lote não chegou ao fim");
  app.fecha();
});

test("máquina de 2 núcleos e memória curta não entram no modo pool", async () => {
  const p1 = novoPainel();
  const dois = await abrirApp({ nucleos: 2, Worker: fabricaWorker(p1) });
  await dois.analisa(12);
  assert.equal(motoresDoLote(p1), 1, "2 núcleos: sem pool");
  dois.fecha();

  const p2 = novoPainel();
  // 8 núcleos, mas 2 GB de RAM: o orçamento cai para 64 MB, ou seja 2 motores
  const curta = await abrirApp({ nucleos: 8, memoria: 2, Worker: fabricaWorker(p2) });
  await curta.analisa(12);
  assert.equal(motoresDoLote(p2), 2, "com 2 GB de RAM o pool tem de encolher para 2 motores");
  assert.match(curta.modo(), /54 MB/, "a conta de memória tem de acompanhar o encolhimento");
  curta.fecha();
});
