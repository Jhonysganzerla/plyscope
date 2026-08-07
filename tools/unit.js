/* Testes unitários da lógica pura de classificação (src/classify.js).
   ------------------------------------------------------------------
   Rápidos e sem motor: são funções puras, então tudo aqui é entrada e
   saída. Rodam em menos de um segundo.

       cd tools && npm install        (jsdom + chess.js, uma vez)
       node --test unit.js            (ou: npm run unit)

   O que está congelado aqui é o comportamento que o app promete:
   os limiares de cada faixa de classificação, os três formatos de
   sacrifício que o Brilhante reconhece, o SEE, e a precisão da
   partida da Ópera (96,2 / 83,0). Se um número mudar, um teste cai.

   Estilo: cada `it` é uma afirmação verificável, com o valor esperado
   escrito à mão e explicado — nada de comparar a função com ela mesma. */
const { test, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const P = require(path.join(__dirname, "..", "src", "classify.js"));
const { Chess } = (() => {
  const locais = ["chess.js", path.join(__dirname, "node_modules", "chess.js")];
  for (const l of locais) { try { return require(l); } catch (e) {} }
  throw new Error("chess.js não encontrado — rode 'npm install' em tools/");
})();

const perto = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tol, `esperado ${b} (±${tol}), veio ${a}`);

/* ============================================================
   scoreToCp — avaliação do motor → centipeões, POV brancas
   ============================================================ */
describe("scoreToCp", () => {
  it("posição sem avaliação vale 0 (empate)", () => {
    assert.equal(P.scoreToCp(null), 0);
    assert.equal(P.scoreToCp(undefined), 0);
  });
  it("cp passa direto quando está dentro da escala", () => {
    assert.equal(P.scoreToCp({ cp: 0, mate: null }), 0);
    assert.equal(P.scoreToCp({ cp: 350, mate: null }), 350);
    assert.equal(P.scoreToCp({ cp: -350, mate: null }), -350);
  });
  it("cp é limitado a ±12000: vantagem absurda não vira infinito", () => {
    assert.equal(P.scoreToCp({ cp: 99999, mate: null }), 12000);
    assert.equal(P.scoreToCp({ cp: -99999, mate: null }), -12000);
    assert.equal(P.scoreToCp({ cp: 12000, mate: null }), 12000);
  });
  it("mate vale mais que qualquer cp, e mate mais curto vale mais", () => {
    assert.equal(P.scoreToCp({ cp: null, mate: 1 }), 11990);
    assert.equal(P.scoreToCp({ cp: null, mate: 5 }), 11950);
    assert.ok(P.scoreToCp({ cp: null, mate: 1 }) > P.scoreToCp({ cp: null, mate: 2 }));
    assert.ok(P.scoreToCp({ cp: null, mate: 12 }) > P.scoreToCp({ cp: 11000, mate: null }));
  });
  it("mate negativo é simétrico (mate sofrido)", () => {
    assert.equal(P.scoreToCp({ cp: null, mate: -1 }), -11990);
    assert.equal(P.scoreToCp({ cp: null, mate: -5 }), -11950);
    assert.equal(P.scoreToCp({ cp: 0, mate: -1 }), -11990);   // mate manda, não o cp
  });
});

/* ============================================================
   winPct / winFor — centipeões → chance de vitória
   ============================================================ */
describe("winPct", () => {
  it("posição equilibrada é exatamente 50%", () => {
    assert.equal(P.winPct(0), 50);
  });
  it("é simétrica: winPct(x) + winPct(-x) = 100", () => {
    for (const cp of [1, 35, 220, 900, 5000, 12000]) perto(P.winPct(cp) + P.winPct(-cp), 100, 1e-9);
  });
  it("nos extremos encosta em 100% e 0% sem passar", () => {
    assert.ok(P.winPct(12000) > 99.999 && P.winPct(12000) <= 100);
    assert.ok(P.winPct(-12000) < 0.001 && P.winPct(-12000) >= 0);
  });
  it("é monótona: mais centipeões, mais chance", () => {
    let ant = -Infinity;
    for (const cp of [-12000, -900, -100, 0, 100, 900, 12000]) {
      assert.ok(P.winPct(cp) > ant, "winPct não cresceu em cp=" + cp);
      ant = P.winPct(cp);
    }
  });
  it("um peão de vantagem vale ~59,1% (curva do app, não do chess.com)", () => {
    perto(P.winPct(100), 59.1026, 0.0001);
  });
});

describe("winFor", () => {
  it("as duas cores somam 100 em qualquer posição", () => {
    for (const s of [{ cp: 0 }, { cp: 250 }, { cp: -2500 }, { mate: 3 }, { mate: -1 }])
      perto(P.winFor("w", s) + P.winFor("b", s), 100, 1e-9);
  });
  it("mate na mão é ~100% para quem dá e ~0% para quem leva", () => {
    assert.ok(P.winFor("w", { cp: null, mate: 1 }) > 99.99);
    assert.ok(P.winFor("b", { cp: null, mate: 1 }) < 0.01);
    assert.ok(P.winFor("b", { cp: null, mate: -1 }) > 99.99);
  });
  it("posição sem avaliação é 50% para os dois", () => {
    assert.equal(P.winFor("w", null), 50);
    assert.equal(P.winFor("b", null), 50);
  });
});

/* ============================================================
   moveAccuracy — quanto de chance de vitória o lance preservou
   ============================================================ */
describe("moveAccuracy", () => {
  it("não perder nada é 100% — inclusive quando o lance melhora a posição", () => {
    assert.equal(P.moveAccuracy(50, 50), 100);
    assert.equal(P.moveAccuracy(50, 80), 100);
    assert.equal(P.moveAccuracy(0, 0), 100);
    assert.equal(P.moveAccuracy(100, 100), 100);
  });
  it("perda mínima ainda é ~100%, mas já abaixo de 100", () => {
    const a = P.moveAccuracy(50, 49.999);
    assert.ok(a < 100 && a > 99.99, "veio " + a);
  });
  it("segue a curva do app (valores exatos, não arredondados)", () => {
    perto(P.moveAccuracy(60, 50), 103.1668 * Math.exp(-0.04354 * 10) - 3.1669, 1e-9);
    perto(P.moveAccuracy(60, 50), 63.5826193, 1e-6);
    perto(P.moveAccuracy(90, 70), 40.0204270, 1e-6);
  });
  it("cai a 0 e não fica negativa quando a partida é jogada fora", () => {
    // a curva cruza o zero numa perda de ~80 pontos; daí para baixo é 0 cravado
    assert.equal(P.moveAccuracy(100, 0), 0);
    assert.equal(P.moveAccuracy(100, 19), 0);
    assert.ok(P.moveAccuracy(80, 0) < 0.01 && P.moveAccuracy(80, 0) > 0);
  });
  it("é monótona decrescente na perda", () => {
    let ant = Infinity;
    for (const perda of [0.1, 1, 5, 10, 20, 40, 80]) {
      const a = P.moveAccuracy(100, 100 - perda);
      assert.ok(a < ant, "não caiu na perda de " + perda);
      ant = a;
    }
  });
});

/* ============================================================
   SEE — quanto material se ganha capturando numa casa
   ============================================================ */
const tab = (fen) => new Chess(fen, { skipValidation: true });

describe("see", () => {
  it("casa sem atacante vale 0", () => {
    assert.equal(P.see(tab("4k3/8/8/3p4/8/8/8/4K3 w - - 0 1"), "d5", "w"), 0);
  });
  it("troca simples: peão come peão solto e ganha 100", () => {
    assert.equal(P.see(tab("4k3/8/8/4p3/3P4/8/8/4K3 b - - 0 1"), "d4", "b"), 100);
  });
  it("troca em série: peão come cavalo defendido por peão — ganha 300 e devolve 100", () => {
    // ...exd4? não existe aqui: 1...dxe5 2.dxe5 — preto fica com cavalo (300) menos peão (100)
    assert.equal(P.see(tab("4k3/8/3p4/4N3/3P4/8/8/4K3 b - - 0 1"), "e5", "b"), 200);
  });
  it("não entra em troca perdida: resultado nunca é negativo", () => {
    // dama come peão defendido por peão: quem captura sai perdendo, o SEE devolve 0
    assert.equal(P.see(tab("4k3/8/2p5/3p4/8/1Q6/8/4K3 w - - 0 1"), "d5", "w"), 0);
  });
  it("x-ray: a segunda torre da coluna entra na conta quando a primeira sai", () => {
    // Rd2/Rd1 contra o peão d5 defendido pela Td8:
    // 1.R2xd5 Rxd5 2.Rxd5 — as brancas ficam com o peão. Sem enxergar a
    // torre de trás, o SEE recusaria a troca e devolveria 0.
    const comXray = "3rk3/8/8/3p4/8/8/3R4/3RK3 w - - 0 1";
    const semXray = "3rk3/8/8/3p4/8/8/3R4/4K3 w - - 0 1";
    assert.equal(P.see(tab(comXray), "d5", "w"), 100);
    assert.equal(P.see(tab(semXray), "d5", "w"), 0);
  });
  it("rei como atacante: não captura peça defendida (seria ilegal)", () => {
    assert.equal(P.see(tab("4k3/8/2p5/3p4/4K3/8/8/8 w - - 0 1"), "d5", "w"), 0);
  });
  it("rei como atacante: captura o que está solto", () => {
    assert.equal(P.see(tab("4k3/8/8/3p4/4K3/8/8/8 w - - 0 1"), "d5", "w"), 100);
  });
  it("cravada: o SEE conta material, não legalidade — defensor cravado ainda conta", () => {
    // 1...cxd4 e o Bc3 está cravado contra o Re1 pelo Ba5: na prática as
    // pretas ganham o cavalo inteiro (300). O SEE, que só faz conta de
    // material, supõe a retomada e devolve 200. Quem cobra legalidade é o
    // sacrificeInfo (teste abaixo), e é por isso que ele existe.
    assert.equal(P.see(tab("4k3/8/8/b1p5/3N4/2B5/8/4K3 b - - 0 1"), "d4", "b"), 200);
  });
  it("devolve o tabuleiro exatamente como recebeu", () => {
    const fen = "3rk3/8/8/3p4/8/8/3R4/3RK3 w - - 0 1";
    const b = tab(fen);
    P.see(b, "d5", "w");
    assert.equal(b.fen(), fen);
  });
});

describe("hangingValue", () => {
  it("é o SEE a partir de um FEN", () => {
    assert.equal(P.hangingValue("4k3/8/8/4p3/3P4/8/8/4K3 b - - 0 1", "d4", "b"), 100);
  });
  it("FEN impossível não derruba nada: vale 0", () => {
    assert.equal(P.hangingValue("isto não é um fen", "d4", "b"), 0);
  });
});

/* ============================================================
   sacrificeInfo — os três formatos de sacrifício
   ============================================================ */
describe("sacrificeInfo", () => {
  it("sacrifício en prise: a peça movida vai para casa atacada, sem capturar nada", () => {
    // Cd5, atacado pelo peão e6 e sem defesa
    assert.deepEqual(P.sacrificeInfo("4k3/8/4p3/3N4/8/8/8/4K3 b - - 0 1", "w"),
      { risked: 300, square: "d5" });
  });
  it("sacrifício por captura: o lance captura e convida a recaptura", () => {
    // Cxb5 na casa do peão; o peão c6 retoma
    assert.deepEqual(P.sacrificeInfo("4k3/8/2p5/1N6/8/8/8/4K3 b - - 0 1", "w"),
      { risked: 300, square: "b5" });
  });
  it("ignora a ameaça: quem fica em oferta é outra peça, não a que moveu", () => {
    // a torre h5 está pendurada para o Bd1; o sacrificeInfo mede oferta, não
    // olha qual peça se mexeu — é assim que a família IgnoresThreat cai aqui
    assert.deepEqual(P.sacrificeInfo("4k3/8/8/7R/8/8/8/3bK3 b - - 0 1", "w"),
      { risked: 500, square: "h5" });
  });
  it("fica com a oferta mais cara quando há mais de uma", () => {
    // a dama a5 (pendurada para a Ta8) e o cavalo h5 (pendurado para o Bd1)
    assert.deepEqual(P.sacrificeInfo("r3k3/8/8/Q6N/8/8/8/3bK3 b - - 0 1", "w"),
      { risked: 900, square: "a5" });
  });
  it("nada pendurado é oferta zero", () => {
    assert.deepEqual(P.sacrificeInfo("4k3/8/8/8/8/8/8/4K1NR b - - 0 1", "w"),
      { risked: 0, square: null });
  });
  it("captura ilegal não é oferta: o capturador cravado não conta", () => {
    // o peão c6 tomaria o Cd5, mas está cravado pelo Ba4 contra o Re8
    assert.deepEqual(P.sacrificeInfo("4k3/8/2p5/3N4/B7/8/8/4K3 b - - 0 1", "w"),
      { risked: 0, square: null });
    // sem a cravada, a mesma posição vira sacrifício de cavalo
    assert.deepEqual(P.sacrificeInfo("4k3/8/2p5/3N4/8/8/8/4K3 b - - 0 1", "w"),
      { risked: 300, square: "d5" });
  });
  it("se não é a vez do adversário, não há o que oferecer", () => {
    assert.deepEqual(P.sacrificeInfo("4k3/8/4p3/3N4/8/8/8/4K3 w - - 0 1", "w"),
      { risked: 0, square: null });
  });
  it("FEN impossível não derruba a análise", () => {
    assert.deepEqual(P.sacrificeInfo("nada disso", "w"), { risked: 0, square: null });
  });
});

/* ============================================================
   ofertaAnterior — o lance nulo que separa oferecer de não ter arrumado
   ============================================================ */
describe("ofertaAnterior", () => {
  it("peça que JÁ estava pendurada antes do lance: a oferta não é nova", () => {
    // o cavalo b5 já podia ser tomado pelo peão c6 antes de as brancas jogarem
    assert.equal(P.ofertaAnterior("4k3/8/2p5/1N6/8/8/8/4K3 w - - 0 1", "w", "b5"), 300);
  });
  it("casa que ninguém alcançava antes: a oferta nasceu do lance", () => {
    // com o cavalo ainda em b4, nada podia ser capturado em b5
    assert.equal(P.ofertaAnterior("4k3/8/2p5/8/1N6/8/8/4K3 w - - 0 1", "w", "b5"), 0);
  });
  it("sem casa não há pergunta a fazer", () => {
    assert.equal(P.ofertaAnterior("4k3/8/2p5/1N6/8/8/8/4K3 w - - 0 1", "w", null), 0);
  });
  it("FEN impossível vale 0", () => {
    assert.equal(P.ofertaAnterior("xxx", "w", "b5"), 0);
  });
});

/* ============================================================
   classifyMove — o limite de cada faixa
   ============================================================ */
const CTX = (extra) => Object.assign({
  legal: 30, isBest: false, loss: 0, winBefore: 50, winAfter: 50,
  gapSegundo: null, sac: { risked: 0, square: null }, capturado: null, recaptura: false,
}, extra);
const cls = (extra) => P.classifyMove(CTX(extra));

describe("classifyMove — faixas de perda", () => {
  it("lance único é Forçado, custe o que custar", () => {
    assert.equal(cls({ legal: 1 }), "forcado");
    assert.equal(cls({ legal: 1, loss: 90 }), "forcado");
    assert.equal(cls({ legal: 1, isBest: true }), "forcado");
  });
  it("perda < 2: Melhor quando é o lance do motor, Ótimo quando não é", () => {
    assert.equal(cls({ loss: 0, isBest: true }), "melhor");
    assert.equal(cls({ loss: 0, isBest: false }), "otimo");
    assert.equal(cls({ loss: 1.999, isBest: true }), "melhor");
    assert.equal(cls({ loss: 1.999, isBest: false }), "otimo");
  });
  it("limite 2,0: vira Bom — inclusive para o lance do motor", () => {
    assert.equal(cls({ loss: 2 }), "bom");
    assert.equal(cls({ loss: 2, isBest: true }), "bom");
    assert.equal(cls({ loss: 4.999 }), "bom");
  });
  it("limite 5,0: vira Impreciso", () => {
    assert.equal(cls({ loss: 5 }), "impreciso");
    assert.equal(cls({ loss: 9.999 }), "impreciso");
  });
  it("limite 10,0: vira Erro", () => {
    assert.equal(cls({ loss: 10 }), "erro");
    assert.equal(cls({ loss: 19.999 }), "erro");
  });
  it("limite 20,0: vira Capivarada", () => {
    assert.equal(cls({ loss: 20 }), "capivarada");
    assert.equal(cls({ loss: 99 }), "capivarada");
  });
});

describe("classifyMove — posição já perdida não castiga tanto", () => {
  it("abaixo de 8% de chance, Erro e Capivarada viram Impreciso", () => {
    assert.equal(cls({ loss: 30, winBefore: 7.999 }), "impreciso");
    assert.equal(cls({ loss: 12, winBefore: 0 }), "impreciso");
  });
  it("no limite de 8% o castigo volta a valer", () => {
    assert.equal(cls({ loss: 30, winBefore: 8 }), "capivarada");
    assert.equal(cls({ loss: 12, winBefore: 8 }), "erro");
  });
  it("o alívio nunca piora um lance bom", () => {
    assert.equal(cls({ loss: 0, winBefore: 1, isBest: true }), "melhor");
    assert.equal(cls({ loss: 3, winBefore: 1 }), "bom");
    assert.equal(cls({ loss: 6, winBefore: 1 }), "impreciso");
  });
});

describe("classifyMove — Excelente", () => {
  it("único lance que segura a posição: melhor lance com 10 pontos de folga", () => {
    assert.equal(cls({ isBest: true, legal: 2, gapSegundo: 10 }), "excelente");
  });
  it("abaixo de 10 de folga continua sendo só o melhor lance", () => {
    assert.equal(cls({ isBest: true, legal: 2, gapSegundo: 9.999 }), "melhor");
  });
  it("não vale para quem não jogou o melhor lance", () => {
    assert.equal(cls({ isBest: false, legal: 2, gapSegundo: 40 }), "otimo");
  });
  it("não vale quando o lance era o único legal (aí é Forçado)", () => {
    assert.equal(cls({ isBest: true, legal: 1, gapSegundo: 40 }), "forcado");
  });
  it("sem segunda linha medida (gapSegundo nulo) não há como saber", () => {
    assert.equal(cls({ isBest: true, legal: 2, gapSegundo: null }), "melhor");
  });
  it("promove até um lance que custou alguma coisa", () => {
    assert.equal(cls({ isBest: true, legal: 2, loss: 3, gapSegundo: 15 }), "excelente");
  });
});

describe("classifyMove — Brilhante", () => {
  const SAC = (extra) => Object.assign({
    legal: 30, isBest: false, loss: 0, winBefore: 60, winAfter: 60,
    gapSegundo: null, sac: { risked: 300, square: "d5" }, capturado: null, recaptura: false,
  }, extra);
  const b = (extra) => P.classifyMove(SAC(extra));

  it("sacrifício de peça em posição de pé é Brilhante", () => {
    assert.equal(b({}), "brilhante");
  });
  it("limite riscoMin = 150: exatamente 150 conta, 149 não", () => {
    assert.equal(P.BRI.riscoMin, 150);
    assert.equal(b({ sac: { risked: 150, square: "d5" } }), "brilhante");
    assert.equal(b({ sac: { risked: 149, square: "d5" } }), "otimo");
  });
  it("limite liquidoMin = 100: o que o lance capturou desconta da oferta", () => {
    assert.equal(P.BRI.liquidoMin, 100);
    // oferece 200, embolsou um peão (100) → líquido 100: passa
    assert.equal(b({ sac: { risked: 200, square: "d5" }, capturado: "p" }), "brilhante");
    // oferece 199, embolsou um peão → líquido 99: não passa
    assert.equal(b({ sac: { risked: 199, square: "d5" }, capturado: "p" }), "otimo");
    // troca de damas não é sacrifício: oferece 900, embolsou 900 → líquido 0
    assert.equal(b({ sac: { risked: 900, square: "d5" }, capturado: "q" }), "otimo");
  });
  it("limite perdaMax = 6,0 de chance de vitória", () => {
    assert.equal(P.BRI.perdaMax, 6.0);
    assert.equal(b({ loss: 6.0 }), "brilhante");
    assert.equal(b({ loss: 6.01 }), "impreciso");
  });
  it("limite winAntesMin = 40: sacrificar em posição já perdida não é brilhante", () => {
    assert.equal(P.BRI.winAntesMin, 40);
    assert.equal(b({ winBefore: 40, winAfter: 40 }), "brilhante");
    assert.equal(b({ winBefore: 39.99, winAfter: 39.99 }), "otimo");
  });
  it("limite winDepoisMin = 35: depois do sacrifício ainda tem que estar de pé", () => {
    assert.equal(P.BRI.winDepoisMin, 35);
    assert.equal(b({ winBefore: 41, winAfter: 35 }), "brilhante");
    assert.equal(b({ winBefore: 41, winAfter: 34.99 }), "otimo");
  });
  it("limite vitoriaMax = 97: com a partida ganha só vale peça inteira", () => {
    assert.equal(P.BRI.vitoriaMax, 97);
    assert.equal(P.BRI.liquidoGrande, 220);
    assert.equal(b({ winBefore: 97, winAfter: 97, sac: { risked: 150, square: "d5" } }), "brilhante");
    // 97,01% e líquido 219: volta olímpica, não sacrifício
    assert.equal(b({ winBefore: 97.01, winAfter: 97, sac: { risked: 219, square: "d5" } }), "otimo");
    // presente grego: oferece o bispo (320), leva um peão (100) → líquido 220
    assert.equal(b({ winBefore: 99, winAfter: 98, sac: { risked: 320, square: "h7" }, capturado: "p" }),
      "brilhante");
  });
  it("retomada: só conta se a oferta nasceu do próprio lance", () => {
    // a peça já estava pendurada na mesma casa antes: mérito nenhum
    assert.equal(b({ recaptura: true, sacPrevio: 300 }), "otimo");
    assert.equal(b({ recaptura: true, sacPrevio: 301 }), "otimo");
    // retomar de propósito com a peça errada: a oferta cresceu com o lance
    assert.equal(b({ recaptura: true, sacPrevio: 299 }), "brilhante");
    assert.equal(b({ recaptura: true, sacPrevio: 0 }), "brilhante");
  });
  it("lance único nunca é Brilhante (é Forçado)", () => {
    assert.equal(b({ legal: 1 }), "forcado");
  });
  it("Brilhante manda em cima de Excelente", () => {
    assert.equal(b({ isBest: true, gapSegundo: 40 }), "brilhante");
  });
});

/* ============================================================
   gameAccuracy — precisão da partida
   ============================================================ */
describe("gameAccuracy", () => {
  /* Caso conhecido: a Ópera (Morphy × Duque Karl / Conde Isouard, 1858)
     analisada pelo próprio app na profundidade 12. É o número que o
     relatório mostra e que tools/test.js confere na tela; aqui ele fica
     congelado como regressão da conta pura.
     A entrada foi capturada pelo tools/gerar-fixture-precisao.js. */
  const opera = require("./fixtures/opera-1858.json");

  it("a Ópera dá 96,2 para Morphy e 83,0 para o Duque", () => {
    const a = P.gameAccuracy(opera.positions, opera.moves, opera.perMove);
    assert.equal(a.w.toFixed(1), "96.2");
    assert.equal(a.b.toFixed(1), "83.0");
  });
  it("e os valores cheios continuam os mesmos (a conta não pode andar)", () => {
    const a = P.gameAccuracy(opera.positions, opera.moves, opera.perMove);
    perto(a.w, 96.20379082572975, 1e-9);
    perto(a.b, 82.98172139712150, 1e-9);
  });
  it("o caso congelado é a partida inteira", () => {
    assert.equal(opera.moves.length, 33);
    assert.equal(opera.positions.length, 34);
    assert.equal(opera.perMove.filter(Boolean).length, 33);
  });
  it("lado sem lance nenhum devolve null, não 0", () => {
    const a = P.gameAccuracy([{ cp: 0 }, { cp: 0 }], [{ color: "w" }], [{ accuracy: 100 }]);
    assert.equal(a.w, 100);
    assert.equal(a.b, null);
  });
  it("partida perfeita dá 100, partida jogada fora dá perto de 0", () => {
    const pos = Array.from({ length: 11 }, () => ({ cp: 0 }));
    const mvs = Array.from({ length: 10 }, (_, i) => ({ color: i % 2 ? "b" : "w" }));
    const cem = mvs.map(() => ({ accuracy: 100 }));
    assert.equal(P.gameAccuracy(pos, mvs, cem).w, 100);
    const zero = mvs.map(() => ({ accuracy: 0 }));
    assert.ok(P.gameAccuracy(pos, mvs, zero).w < 1);
  });
  it("lance sem classificação (posição não avaliada) fica de fora da média", () => {
    const pos = [{ cp: 0 }, { cp: 0 }, { cp: 0 }];
    const mvs = [{ color: "w" }, { color: "w" }];
    const a = P.gameAccuracy(pos, mvs, [{ accuracy: 100 }, null]);
    assert.equal(a.w, 100);
  });
  it("não lê estado global nenhum: mesma entrada, mesma saída", () => {
    const a = P.gameAccuracy(opera.positions, opera.moves, opera.perMove);
    const b = P.gameAccuracy(opera.positions.slice(), opera.moves.slice(), opera.perMove.slice());
    assert.deepEqual(a, b);
  });
});

/* ============================================================
   Constantes que o benchmark mediu — mudar aqui é mudar o número
   publicado em docs/BENCHMARK.md
   ============================================================ */
describe("parâmetros calibrados", () => {
  it("BRI é exatamente o que está documentado", () => {
    assert.deepEqual(P.BRI, {
      perdaMax: 6.0, riscoMin: 150, liquidoMin: 100,
      winAntesMin: 40, winDepoisMin: 35, vitoriaMax: 97, liquidoGrande: 220,
    });
  });
  it("os valores das peças são os do SEE", () => {
    assert.deepEqual(P.PV_VAL, { p: 100, n: 300, b: 320, r: 500, q: 900, k: 20000 });
  });
  it("as nove classificações existem e estão em ordem", () => {
    assert.deepEqual(P.CLS_ORDER, ["brilhante", "excelente", "melhor", "otimo", "bom",
      "forcado", "impreciso", "erro", "capivarada"]);
    assert.equal(Object.keys(P.CLS).length, 9);
  });
});
