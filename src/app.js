/* ============================================================
   Plyscope — cada lance sob a lupa: análise local de partidas com Stockfish
   ============================================================ */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const Chess = window.Chess;

/* ---------- idioma (dicionário em src/i18n.js) ----------
   Atalhos curtos porque aparecem em quase toda linha de interface.
   tr() traduz; fmtNum/fmtPct/fmtSeg/fmtData escrevem número, porcentagem,
   tempo e data no formato da língua ativa (1,2 s × 1.2s, 96,2% × 96.2%). */
const I18 = window.PlyI18n;
const tr      = (k, p) => I18.t(k, p);
const fmtNum  = (v, casas) => I18.num(v, casas);
const fmtPct  = (v, casas) => I18.pct(v, casas);
const fmtSeg  = (v, casas) => I18.seg(v, casas);
const fmtData = (s) => I18.data(s);

/* ---------- classificações ----------
   As chaves (brilhante, capivarada…) são identidade interna e vão para o
   armazenamento e para os NAG do PGN: não mudam com o idioma. O nome que
   aparece na tela vem do dicionário, por clsNome(): a chave "capivarada"
   é "Capivarada" em português e "Blunder" em inglês. */
const CLS = {
  brilhante : { cor:"#26c2a3", sym:"!!", ord:0 },
  excelente : { cor:"#5b8bb0", sym:"!",  ord:1 },
  melhor    : { cor:"#81b64c", sym:"★",  ord:2 },
  otimo     : { cor:"#95bb4a", sym:"✓",  ord:3 },
  bom       : { cor:"#96af8b", sym:"✓",  ord:4 },
  forcado   : { cor:"#8b8987", sym:"=",  ord:5 },
  impreciso : { cor:"#f7c631", sym:"?!", ord:6 },
  erro      : { cor:"#ffa459", sym:"?",  ord:7 },
  capivarada: { cor:"#fa412d", sym:"??", ord:8 },
};
const CLS_ORDER = Object.keys(CLS).sort((a,b)=>CLS[a].ord-CLS[b].ord);
const clsNome = (k) => tr("cls." + k);
/** Nome + significado entre parênteses, quando a língua precisa dele. */
function clsDica(k) {
  const extra = I18.opt("cls." + k + ".dica");
  return extra ? clsNome(k) + " (" + extra + ")" : clsNome(k);
}
/** Nome do lado quando o PGN não traz o jogador. */
const nomeLado = (v, cor) => v || tr(cor === "w" ? "lado.brancas" : "lado.pretas");

/* ---------- estado ---------- */
const S = {
  chess: new Chess(),
  headers: {},
  moves: [],        // {san, uci, from, to, color, captured, promotion, fenBefore}
  fens: [],         // fens[i] = posição após i lances (fens[0] = inicial)
  ply: 0,
  flipped: false,
  flipManual: false, // usuário girou o tabuleiro nesta partida (manda na perspectiva)
  positions: [],    // avaliação de cada posição (POV brancas)
  perMove: [],      // {cls, loss, accuracy, best, pv}
  accuracy: null,
  analyzing: false,
  cancel: false,
  explore: null,    // {chess, sanLine[]}
  sel: null,        // casa selecionada
  deep: false,
  abertura: null,   // {eco, nome, ply} — abertura identificada na base ECO
};

/* ============================================================
   Som — sintetizado no navegador (Web Audio), sem arquivos.
   Timbre de peça de madeira batendo no tabuleiro, no espírito
   dos sons de lance/captura/xeque dos sites de xadrez.
   ============================================================ */
const Snd = {
  ctx: null, mudo: false, ruido: null,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  buffer() {
    if (this.ruido) return this.ruido;
    const n = Math.floor(this.ctx.sampleRate * 0.4);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    this.ruido = b;
    return b;
  },
  /** batida seca: ruído filtrado + corpo grave curto */
  bat(o) {
    if (this.mudo || !this.ctx) return;
    const t = this.ctx.currentTime + (o.atraso || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = o.freq || 1100; bp.Q.value = o.q || 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol || 0.32, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.06));
    src.connect(bp); bp.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + (o.dur || 0.06) + 0.02);
    if (o.corpo !== 0) {
      const osc = this.ctx.createOscillator(), og = this.ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(o.corpo || 190, t);
      osc.frequency.exponentialRampToValueAtTime((o.corpo || 190) * 0.6, t + 0.05);
      og.gain.setValueAtTime((o.vol || 0.32) * 0.7, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(og); og.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.09);
    }
  },
  /** nota curta e limpa */
  nota(freq, dur, vol, tipo, desliza, atraso) {
    if (this.mudo || !this.ctx) return;
    const t = this.ctx.currentTime + (atraso || 0);
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = tipo || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (desliza) osc.frequency.exponentialRampToValueAtTime(desliza, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  lance()    { this.bat({ freq: 1150, vol: 0.30, corpo: 190 }); },
  captura()  { this.bat({ freq: 720, q: 0.8, vol: 0.42, dur: 0.085, corpo: 130 }); },
  roque()    { this.bat({ freq: 1050, vol: 0.26, corpo: 180 }); this.bat({ freq: 1000, vol: 0.24, corpo: 170, atraso: 0.1 }); },
  xeque()    { this.nota(1180, 0.1, 0.16, "triangle", 1560, 0.05); },
  promove()  { this.nota(660, 0.09, 0.15, "triangle"); this.nota(990, 0.14, 0.15, "triangle", null, 0.09); },
  brilhante(){ [1046, 1318, 1760].forEach((f, i) => this.nota(f, 0.11, 0.13, "sine", null, 0.09 + i * 0.075)); },
  erro()     { this.nota(150, 0.22, 0.2, "square", 90, 0.06); },
  fim()      { this.nota(392, 0.18, 0.16, "sine", null, 0.05); this.nota(261, 0.3, 0.16, "sine", null, 0.16); },
  pronto()   { [523, 659, 784].forEach((f, i) => this.nota(f, 0.16, 0.11, "sine", null, i * 0.09)); },
};
function somDoLance(san, cls) {
  if (!san) { Snd.lance(); return; }
  if (/^O-O/.test(san)) Snd.roque();
  else if (/=/.test(san)) Snd.promove();
  else if (/x/.test(san)) Snd.captura();
  else Snd.lance();
  if (/#/.test(san)) Snd.fim();
  else if (/\+/.test(san)) Snd.xeque();
  if (cls === "brilhante") Snd.brilhante();
  else if (cls === "capivarada") Snd.erro();
}

/* ============================================================
   Motor (Stockfish em Web Worker)

   Dois builds do mesmo Stockfish 17.1 lite:
     engine/stockfish-lite-single.js  1 thread, roda em qualquer página;
     engine/stockfish-lite.js         multi-thread, precisa de SharedArrayBuffer
                                      e portanto de página cross-origin isolated.
   O multi-thread só é tentado quando o navegador confirma o isolamento; se ele
   não subir por qualquer motivo, o boot volta sozinho para o single-thread.
   ============================================================ */
const ENGINE_MT = "engine/stockfish-lite.js";
const ENGINE_ST = "engine/stockfish-lite-single.js";
const ENGINE_NOME = "Stockfish 17.1 lite";

const Engine = {
  w: null, ready: false, listeners: new Set(), job: null, mt: false, threads: 1, erro: false,
  /** Deixa um núcleo livre para a interface e põe um teto de 8. */
  planejaThreads() {
    const n = Number((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0);
    return n > 0 ? Math.max(1, Math.min(8, n - 1)) : 1;
  },
  /** Multi-thread só compensa com isolamento cross-origin e 2 threads ou mais. */
  podeMt() {
    return typeof self !== "undefined" && self.crossOriginIsolated === true &&
      typeof SharedArrayBuffer === "function" && this.planejaThreads() >= 2;
  },
  boot() {
    if (this.w) return this.readyPromise;
    this.readyPromise = this.iniciar(this.podeMt()).catch((e) => {
      if (!this.mt) throw e;                          // single-thread falhou: não há para onde cair
      this.derruba();                                 // multi-thread falhou: repete no single-thread
      return (this.readyPromise = this.iniciar(false));
    });
    return this.readyPromise;
  },
  iniciar(mt) {
    return new Promise((resolve, reject) => {
      this.mt = !!mt; this.erro = false;
      this.threads = mt ? this.planejaThreads() : 1;
      const falhar = (e) => { if (!mt) { this.erro = true; notaMotor(); } reject(e); };
      try { this.w = new Worker(mt ? ENGINE_MT : ENGINE_ST); }
      catch (e) { falhar(e); return; }
      this.w.onerror = (e) => {
        if (!mt) toast(tr("motor.falhou"));
        falhar(e);
      };
      const prazo = setTimeout(() => { if (!this.ready) falhar(new Error("tempo esgotado ao iniciar o motor")); }, mt ? 25000 : 90000);
      this.w.onmessage = (ev) => {
        const line = typeof ev.data === "string" ? ev.data : (ev.data && ev.data.data) || "";
        if (!line) return;
        if (line === "uciok") {
          this.post("setoption name Hash value 128");
          if (this.mt && this.threads > 1) this.post("setoption name Threads value " + this.threads);
          this.post("isready");
        }
        if (line === "readyok" && !this.ready) { this.ready = true; clearTimeout(prazo); notaMotor(); resolve(); }
        this.listeners.forEach((fn) => fn(line));
      };
      this.post("uci");
    });
  },
  derruba() {
    if (this.w) { try { this.w.terminate(); } catch (e) {} }
    this.w = null; this.ready = false; this.mt = false; this.threads = 1;
  },
  post(cmd) { this.w.postMessage(cmd); },
  on(fn) { this.listeners.add(fn); },
  off(fn) { this.listeners.delete(fn); },
  stop() { if (this.w) this.post("stop"); },
};

/** Nota discreta na aba Motor: versão, modo e número de threads. */
function notaMotor() {
  const el = $("engineMode");
  if (!el) return;
  let modo;
  if (Engine.ready) {
    modo = Engine.mt
      ? tr("motor.mt", { n: Engine.threads })
      : tr("motor.st") + (self.crossOriginIsolated ? "" : tr("motor.semIsolamento"));
  } else {
    modo = tr(Engine.erro ? "motor.indisponivel" : "motor.carregando");
  }
  el.textContent = ENGINE_NOME + " (" + modo + ")";
}

function parseInfo(line, store) {
  // info depth 16 seldepth 20 multipv 1 score cp 23 nodes .. pv e2e4 e7e5
  // ignora janelas de aspiração (scores incompletos)
  if (line.indexOf("lowerbound") > 0 || line.indexOf("upperbound") > 0) return null;
  const t = line.split(" ");
  let depth = 0, mpv = 1, cp = null, mate = null, pv = null, nodes = 0, nps = 0;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case "depth": depth = +t[++i]; break;
      case "multipv": mpv = +t[++i]; break;
      case "nodes": nodes = +t[++i]; break;
      case "nps": nps = +t[++i]; break;
      case "score":
        if (t[i+1] === "cp") { cp = +t[i+2]; i += 2; }
        else if (t[i+1] === "mate") { mate = +t[i+2]; i += 2; }
        break;
      case "pv": pv = t.slice(i+1); i = t.length; break;
    }
  }
  if (!pv || (cp === null && mate === null)) return null;
  const prev = store[mpv];
  if (prev && prev.depth > depth) return null;
  store[mpv] = { depth, cp, mate, pv, nodes, nps };
  return store[mpv];
}

/** Roda o motor numa posição. Retorna linhas (POV de quem joga). */
function engineGo(fen, opts) {
  return new Promise((resolve) => {
    const store = {};
    let done = false;
    const handler = (line) => {
      if (line.startsWith("info ") && line.indexOf(" pv ") > 0) {
        const r = parseInfo(line, store);
        if (r && opts.onUpdate) opts.onUpdate(store);
      } else if (line.startsWith("bestmove")) {
        if (done) return;
        done = true;
        Engine.off(handler);
        const bm = line.split(" ")[1];
        resolve({ lines: store, bestmove: bm === "(none)" ? null : bm });
      }
    };
    Engine.on(handler);
    Engine.post("setoption name MultiPV value " + (opts.multipv || 1));
    Engine.post("position fen " + fen);
    Engine.post(opts.infinite ? "go infinite" : "go depth " + opts.depth);
  });
}

/** Uma busca por vez: para a anterior e espera ela terminar. */
async function engineRun(fen, opts) {
  if (Engine.current) { Engine.stop(); try { await Engine.current; } catch (e) {} }
  const p = engineGo(fen, opts);
  Engine.current = p;
  try { return await p; }
  finally { if (Engine.current === p) Engine.current = null; }
}

/* ============================================================
   Avaliação → win% → precisão
   ============================================================ */
function scoreToCp(s) {           // s = {cp, mate} (POV brancas)
  if (s == null) return 0;
  if (s.mate != null) return s.mate > 0 ? 12000 - s.mate * 10 : -12000 - s.mate * 10;
  return Math.max(-12000, Math.min(12000, s.cp));
}
function winPct(cp) {             // 0..100 para as brancas
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function winFor(color, s) {
  const w = winPct(scoreToCp(s));
  return color === "w" ? w : 100 - w;
}
function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const v = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, v));
}
function fmtEval(s) {             // texto curto, POV brancas
  if (s == null) return "–";
  if (s.mateEnd) return s.cp > 0 ? "1-0" : "0-1";
  if (s.mate != null) return (s.mate > 0 ? "M" : "-M") + Math.abs(s.mate);
  if (s.cp == null) return "–";
  const v = s.cp / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

/* ---------- SEE simplificado (detecta sacrifícios) ---------- */
const PV_VAL = { p:100, n:300, b:320, r:500, q:900, k:20000 };
function leastValuableAttacker(board, sq, side) {
  let best = null;
  let atk;
  try { atk = board.attackers(sq, side); } catch (e) { return null; }
  for (const from of atk || []) {
    const p = board.get(from);
    if (!p) continue;
    if (!best || PV_VAL[p.type] < PV_VAL[best.type]) best = { square: from, type: p.type };
  }
  return best;
}
function see(board, sq, side) {
  const att = leastValuableAttacker(board, sq, side);
  if (!att) return 0;
  const target = board.get(sq);
  const val = target ? PV_VAL[target.type] : 0;
  if (att.type === "k" && (board.attackers(sq, side === "w" ? "b" : "w") || []).length) return 0;
  board.remove(att.square);
  board.remove(sq);
  board.put({ type: att.type, color: side }, sq);
  const score = Math.max(0, val - see(board, sq, side === "w" ? "b" : "w"));
  board.remove(sq);
  if (target) board.put(target, sq);
  board.put({ type: att.type, color: side }, att.square);
  return score;
}
/** Quanto material o adversário ganha capturando em `sq` na posição `fen`. */
function hangingValue(fen, sq, oppColor) {
  try {
    const b = new Chess(fen, { skipValidation: true });
    return see(b, sq, oppColor);
  } catch (e) { return 0; }
}

/**
 * Material que o jogador deixou em oferta depois do lance.
 * Cobre os três casos que o chess.com marca como brilhante:
 *  - a peça movida vai para uma casa onde pode ser capturada (en prise);
 *  - o lance captura algo e convida a recaptura (sacrifício por captura);
 *  - o lance ignora uma ameaça e deixa outra peça pendurada.
 * Só conta se a captura for LEGAL de verdade (cravadas, xeques e táticas
 * que impedem a tomada não valem como oferta).
 */
function sacrificeInfo(fenAfter, moverColor) {
  const opp = moverColor === "w" ? "b" : "w";
  let board;
  try { board = new Chess(fenAfter); } catch (e) { return { risked: 0, square: null }; }
  if (board.turn() !== opp) return { risked: 0, square: null };
  let best = { risked: 0, square: null };
  const vistos = new Set();
  for (const m of board.moves({ verbose: true })) {
    if (!m.captured || vistos.has(m.to)) continue;
    vistos.add(m.to);
    const v = hangingValue(fenAfter, m.to, opp);
    if (v > best.risked) best = { risked: v, square: m.to };
  }
  return best;
}

/**
 * Material que o adversário JÁ conseguia ganhar nessa casa ANTES do lance —
 * um lance nulo: passa a vez sem mexer em nada.
 * Depois do lance, "peça em oferta" e "peça que já estava pendurada e
 * continuou pendurada" têm exatamente a mesma cara para o `sacrificeInfo`.
 * Só quem sabe distinguir as duas é a posição anterior.
 */
function ofertaAnterior(fenBefore, moverColor, sq) {
  if (!sq) return 0;
  const opp = moverColor === "w" ? "b" : "w";
  const campos = fenBefore.split(" ");
  campos[1] = opp;   // passa a vez
  campos[3] = "-";   // o en passant herdado não sobrevive ao lance nulo
  const nulo = campos.join(" ");
  let b;
  try { b = new Chess(nulo); } catch (e) { return 0; }
  if (b.turn() !== opp) return 0;
  let podeTomar = false;
  try {
    for (const m of b.moves({ verbose: true })) {
      if (m.captured && m.to === sq) { podeTomar = true; break; }
    }
  } catch (e) { return 0; }
  return podeTomar ? hangingValue(nulo, sq, opp) : 0;
}

/* ----------------------------------------------------------------------
   Parâmetros calibrados nos 100 lances do Brilliant Move Benchmark
   (os brilhantes que o chess.com marcou em 100 partidas reais).
   Medição: 88 dos 100 detectados, com 3 marcações extras em 416 lances
   comuns de 8 partidas completas.
   ---------------------------------------------------------------------- */
const BRI = {
  perdaMax: 6.0,      // quanto de chance de vitória o lance pode custar
  riscoMin: 150,      // material que precisa estar realmente em oferta
  liquidoMin: 100,    // oferta menos o que o próprio lance capturou
  winAntesMin: 40,    // sacrificar em posição já perdida não é brilhante
  winDepoisMin: 35,   // e depois do sacrifício ainda tem que estar de pé
  vitoriaMax: 97,     // com a partida já ganha não vale…
  // …a menos que a oferta seja de peça inteira. O corte era 250, que deixava
  // de fora o presente grego (Bxh7+): oferece um bispo, leva um peão, 220
  // líquido. É o sacrifício brilhante mais conhecido do xadrez e não tinha
  // por que cair do lado errado de um limiar.
  liquidoGrande: 220,
};

function classifyMove(ctx) {
  const { legal, isBest, loss, winBefore, winAfter, gapSegundo, sac, capturado, recaptura } = ctx;
  const sacPrevio = ctx.sacPrevio || 0;
  let cls;
  if (legal === 1) cls = "forcado";
  else if (loss < 2)   cls = isBest ? "melhor" : "otimo";
  else if (loss < 5)   cls = "bom";
  else if (loss < 10)  cls = "impreciso";
  else if (loss < 20)  cls = "erro";
  else                 cls = "capivarada";

  // posição já perdida: não castiga tanto
  if (winBefore < 8 && CLS[cls].ord > CLS.impreciso.ord) cls = "impreciso";

  // Excelente: único lance que segura a posição
  if (isBest && legal > 1 && gapSegundo != null && gapSegundo >= 10) cls = "excelente";

  // Brilhante: sacrifício correto.
  // Retomar não é oferecer: quando o lance só pega de volta o que o adversário
  // acabou de capturar, o que ficou em oferta depois dele só conta se tiver
  // nascido do próprio lance. Se o adversário já podia ganhar o mesmo naquela
  // casa antes, a peça já estava pendurada e o mérito não é da retomada.
  // (Vetar toda retomada, como antes, jogava fora o sacrifício clássico de
  // retomar com a peça errada de propósito — Bxc4, Qxc5, Nxe6+ e companhia.)
  const retomadaSemOferta = recaptura && sac.risked > 0 && sacPrevio >= sac.risked;
  if (legal > 1 && !retomadaSemOferta && loss <= BRI.perdaMax) {
    const ganho = capturado ? PV_VAL[capturado] : 0;
    const liquido = sac.risked - ganho;
    if (sac.risked >= BRI.riscoMin && liquido >= BRI.liquidoMin &&
        winBefore >= BRI.winAntesMin && winAfter >= BRI.winDepoisMin &&
        (winBefore <= BRI.vitoriaMax || liquido >= BRI.liquidoGrande)) cls = "brilhante";
  }
  return cls;
}

/* ============================================================
   Classificação de lances
   ============================================================ */
function classify(i) {
  const mv = S.moves[i];
  const posB = S.positions[i];      // antes do lance
  const posA = S.positions[i + 1];  // depois do lance
  if (!posB || !posA) return null;
  const color = mv.color;
  const winBefore = winFor(color, posB);
  const winAfter  = winFor(color, posA);
  const loss = Math.max(0, winBefore - winAfter);
  const acc = moveAccuracy(winBefore, winAfter);

  const anterior = i > 0 ? S.moves[i - 1] : null;
  const sac = sacrificeInfo(S.fens[i + 1], color);
  const recaptura = !!(mv.captured && anterior && anterior.captured && anterior.to === mv.to);
  // só as retomadas precisam do lance nulo, então ele quase nunca roda
  const sacPrevio = recaptura && sac.risked > 0 ? ofertaAnterior(S.fens[i], color, sac.square) : 0;
  const cls = classifyMove({
    legal: mv.legalCount,
    isBest: !!(posB.best && posB.best.toLowerCase() === mv.uci.toLowerCase()),
    loss, winBefore, winAfter,
    gapSegundo: posB.secondWin != null ? winBefore - posB.secondWin : null,
    sac,
    capturado: mv.captured,
    recaptura,
    sacPrevio,
  });

  return { cls, loss, accuracy: acc, winBefore, winAfter, sacRisked: sac.risked };
}

/* ---------- precisão da partida (média ponderada + harmônica) ---------- */
function gameAccuracy() {
  const wins = S.positions.map((p) => winPct(scoreToCp(p)));  // POV brancas
  const out = { w: 0, b: 0 };
  for (const color of ["w", "b"]) {
    const accs = [], weights = [];
    const win = Math.max(2, Math.min(8, Math.floor(S.moves.length / 10)));
    for (let i = 0; i < S.moves.length; i++) {
      if (S.moves[i].color !== color) continue;
      const pm = S.perMove[i];
      if (!pm) continue;
      accs.push(pm.accuracy);
      const a = Math.max(0, i - win), b = Math.min(wins.length - 1, i + win);
      const slice = wins.slice(a, b + 1);
      const mean = slice.reduce((x, y) => x + y, 0) / slice.length;
      const sd = Math.sqrt(slice.reduce((x, y) => x + (y - mean) ** 2, 0) / slice.length);
      weights.push(Math.max(0.5, Math.min(12, sd)));
    }
    if (!accs.length) { out[color] = null; continue; }
    const wm = accs.reduce((s, a, k) => s + a * weights[k], 0) / weights.reduce((s, w) => s + w, 0);
    const hm = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
    out[color] = Math.max(0, Math.min(100, (wm + hm) / 2));
  }
  return out;
}

/* ============================================================
   Abertura — base ECO embutida (window.Aberturas, ver src/data/openings.js)
   ============================================================ */
const ABERTURA_MAX_PLY = 30;   // além disso já não é teoria de abertura

/* Percorre as posições da partida e fica com a correspondência MAIS PROFUNDA:
   a abertura é a última entrada que bate, não a primeira.
   A base é indexada por POSIÇÃO (peças + lado a jogar + roques), não pela ordem
   dos lances, então transposição não atrapalha: 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 e
   1.c4 e6 2.Nc3 Bb4 3.d4 Nf6 chegam à mesma posição e à mesma Nimzo-Índia.
   Pelo mesmo motivo, uma partida que sai do livro e volta a ele mais adiante
   ainda é reconhecida.
   Os cabeçalhos ECO/Opening do PGN entram só como reserva: a base local é
   consistente entre partidas de qualquer site, fala as duas línguas do app e
   sabe dizer até que lance a teoria foi seguida — o cabeçalho não informa nada
   disso (e vem sempre em inglês). */
function aberturaDeFens(fens, headers) {
  const Ab = window.Aberturas;
  if (Ab && fens && fens.length > 1) {
    const r = Ab.detectar(fens, ABERTURA_MAX_PLY, I18.idioma());
    if (r) return r;
  }
  const h = headers || {};
  const eco = h.ECO && h.ECO !== "?" ? h.ECO : "";
  const nome = h.Opening && h.Opening !== "?" ? h.Opening : "";
  return eco || nome ? { eco, nome, ply: 0 } : null;
}

/* Mesma coisa a partir de um PGN solto (lista de partidas importadas). */
function aberturaDePgn(pgn, headers) {
  try {
    const c = new Chess();
    c.loadPgn(String(pgn).trim(), { strict: false });
    const hist = c.history();
    const r = new Chess();
    if (headers && headers.FEN) r.load(headers.FEN);
    const fens = [r.fen()];
    for (let i = 0; i < hist.length && i < ABERTURA_MAX_PLY; i++) { r.move(hist[i]); fens.push(r.fen()); }
    return aberturaDeFens(fens, headers);
  } catch (e) { return aberturaDeFens(null, headers); }
}

function aberturaTexto(a) {
  return a ? [a.eco, a.nome].filter(Boolean).join(" · ") : "";
}

function aberturaHtml(a) {
  if (!a || (!a.eco && !a.nome)) return "";
  const ate = a.ply
    ? `<span class="hint">${esc(tr("rel.abertura.teoria", { n: Math.ceil(a.ply / 2) }))}</span>` : "";
  return `<div class="opening">${a.eco ? `<span class="eco">${esc(a.eco)}</span>` : ""}` +
    `<span class="nm">${esc(a.nome || tr("rel.abertura.fora"))}</span>${ate}</div>`;
}

/* ============================================================
   De quem é a perspectiva do tabuleiro
   ------------------------------------------------------------
   Quem estuda as próprias partidas quer vê-las do seu lado: se a
   partida é sua e você jogou de pretas, o tabuleiro abre girado.
   COMO SABEMOS QUEM É "O USUÁRIO": o nome digitado na busca online
   (#userBox) — é o único lugar onde a pessoa se identifica. Ele fica
   guardado no navegador (mesmo padrão do som e do idioma, mesmo
   try/catch), então a preferência sobrevive ao recarregar a página e
   vale também para PGN colado/arquivo e para as análises salvas.
   QUANDO NÃO GIRA: sem nome guardado, ou quando o nome não é nenhum
   dos dois jogadores (um PGN histórico entre terceiros, por exemplo),
   fica como sempre foi — brancas embaixo. E o giro manual (botão ou
   tecla F) manda: escolhido à mão, ninguém gira por baixo.
   ============================================================ */
const CHAVE_USUARIO = "plyscope.usuario";
let usuario = "";
try { usuario = (localStorage.getItem(CHAVE_USUARIO) || "").trim(); } catch (e) {}
S.usuario = usuario || null;
function lembrarUsuario(nome) {
  usuario = String(nome || "").trim();
  S.usuario = usuario || null;   // o treino lê daqui de que lado você jogou
  try { localStorage.setItem(CHAVE_USUARIO, usuario); } catch (e) {}
}
/** "w", "b" ou null — o lado do usuário nesta partida, pelas tags do PGN. */
function ladoDoUsuario(h) {
  const alvo = String(S.usuario || usuario || "").trim().toLowerCase();
  if (!alvo) return null;
  const nome = (v) => String(v == null ? "" : v).trim().toLowerCase();
  if (nome(h && h.White) === alvo) return "w";
  if (nome(h && h.Black) === alvo) return "b";
  return null;
}
/** Perspectiva da partida recém-carregada. Só decide quando ninguém decidiu. */
function aplicarPerspectiva() {
  if (S.flipManual) return;
  S.flipped = ladoDoUsuario(S.headers) === "b";
}
if (usuario && $("userBox") && !$("userBox").value) $("userBox").value = usuario;

/* ============================================================
   Carregar PGN
   ============================================================ */
function loadPgn(pgn) {
  const c = new Chess();
  try { c.loadPgn(pgn.trim(), { strict: false }); }
  catch (e) {
    try { c.loadPgn(pgn.replace(/\{[^}]*\}/g, "").trim(), { strict: false }); }
    catch (e2) { toast(tr("toast.pgnIlegivel")); return false; }
  }
  const hist = c.history({ verbose: true });
  if (!hist.length) { toast(tr("toast.pgnSemLances")); return false; }

  if (S.treino) treinoSair();          // partida nova encerra o treino da anterior
  S.headers = c.getHeaders() || {};
  S.moves = []; S.fens = []; S.positions = []; S.perMove = []; S.accuracy = null;
  S.explore = null; S.sel = null;
  S.flipManual = false;          // partida nova, escolha de perspectiva em aberto

  const rep = new Chess();
  if (S.headers.FEN) { try { rep.load(S.headers.FEN); } catch (e) {} }
  S.fens.push(rep.fen());
  for (const h of hist) {
    const legalCount = rep.moves().length;
    const num = rep.moveNumber();
    const m = rep.move(h.san);
    S.moves.push({
      san: m.san, uci: m.from + m.to + (m.promotion || ""), from: m.from, to: m.to,
      color: m.color, captured: m.captured || null, promotion: m.promotion || null,
      legalCount, num,
    });
    S.fens.push(rep.fen());
  }
  S.ply = 0;
  S.chess = rep;
  S.abertura = aberturaDeFens(S.fens, S.headers);
  aplicarPerspectiva();
  if (typeof pararPlay === "function") pararPlay();
  renderPlayers(); renderMoves(); renderBoard(); renderEvalBar(); renderEngineTab();
  $("btnAnalyze").disabled = false;
  renderReportBody();
  showTab("moves");
  return true;
}

/* ============================================================
   Análise da partida inteira
   ============================================================ */

/* O painel de status guarda a CHAVE do que está escrito, não o texto pronto:
   é o que permite reetiquetar o painel na troca de idioma sem inventar estado
   novo. Os parâmetros podem vir como função quando dependem de formatação
   (uma porcentagem escrita 96,2% ou 96.2% conforme a língua). */
let statusAtual = null;
function pintarStatus() {
  if (!statusAtual) return;
  const { tk, tp, mk, mp } = statusAtual;
  $("statusTitle").textContent = tk ? tr(tk, typeof tp === "function" ? tp() : tp) : "";
  $("statusMsg").textContent   = mk ? tr(mk, typeof mp === "function" ? mp() : mp) : "";
}
function status(tk, tp, mk, mp) { statusAtual = { tk, tp, mk, mp }; pintarStatus(); }

async function analyzeGame() {
  if (S.analyzing) { S.cancel = true; return; }
  if (!S.moves.length) return;
  const depth = +$("depth").value;
  S.analyzing = true; S.cancel = false;
  $("btnAnalyze").textContent = tr("btn.parar");
  $("panelStatus").style.display = "";
  status("status.iniciando", null, "status.carregando", null);

  try { await Engine.boot(); }
  catch (e) { toast(tr("motor.naoIniciou")); finishAnalysis(); return; }

  Engine.post("ucinewgame");
  const total = S.fens.length;
  S.positions = new Array(total).fill(null);
  S.perMove = new Array(S.moves.length).fill(null);
  const t0 = performance.now();

  for (let i = 0; i < total; i++) {
    if (S.cancel) break;
    const fen = S.fens[i];
    const tmp = new Chess(fen);
    const stm = tmp.turn();
    let entry;

    if (tmp.isGameOver()) {
      entry = tmp.isCheckmate()
        ? { cp: stm === "w" ? -12000 : 12000, mate: null, best: null, pv: [], mateEnd: true }
        : { cp: 0, mate: null, best: null, pv: [] };
    } else {
      const res = await engineRun(fen, { depth, multipv: 2 });
      const l1 = res.lines[1], l2 = res.lines[2];
      const sign = stm === "w" ? 1 : -1;
      entry = {
        cp: l1 && l1.cp != null ? l1.cp * sign : null,
        mate: l1 && l1.mate != null ? l1.mate * sign : null,
        best: res.bestmove || (l1 && l1.pv[0]) || null,
        pv: (l1 && l1.pv) || [],
        depth: l1 ? l1.depth : depth,
      };
      if (l2) {
        const s2 = { cp: l2.cp != null ? l2.cp * sign : null, mate: l2.mate != null ? l2.mate * sign : null };
        entry.secondWin = winFor(stm, s2);
        entry.second = s2;
      }
    }
    S.positions[i] = entry;

    // classifica o lance anterior assim que a posição seguinte fica pronta
    if (i > 0) { S.perMove[i - 1] = classify(i - 1); renderMoveRow(i - 1); }

    const pct = Math.round(((i + 1) / total) * 100);
    $("statusPct").textContent = pct + "%";
    $("progBar").style.width = pct + "%";
    const el = (performance.now() - t0) / 1000;
    const eta = i > 2 ? Math.round((el / (i + 1)) * (total - i - 1)) : null;
    status("status.lance", { i: Math.min(i + 1, S.moves.length), n: S.moves.length },
           eta != null ? "status.restante" : null, () => ({ t: fmtSeg(eta) }));
    if (i % 3 === 0) { renderEvalBar(); }
  }

  /* --- 2ª passada: confere os momentos suspeitos com mais profundidade --- */
  if (!S.cancel) {
    const suspects = new Set();
    S.perMove.forEach((pm, i) => {
      if (!pm) return;
      // lances suspeitos de erro…
      if (pm.loss >= 8) { suspects.add(i); suspects.add(i + 1); }
      // …e sacrifícios, que é onde a análise rasa mais erra
      else if (pm.sacRisked >= BRI.riscoMin && pm.loss > 0.4 && pm.winBefore >= BRI.winAntesMin) {
        suspects.add(i); suspects.add(i + 1);
      }
    });
    const list = [...suspects].filter((i) => S.positions[i] && !S.positions[i].mateEnd).sort((a, b) => a - b);
    const d2 = Math.min(depth + 6, 24);
    let k = 0;
    for (const idx of list) {
      if (S.cancel) break;
      k++;
      status("status.conferindo", { k, n: list.length }, "status.profundidade", { d: d2 });
      $("progBar").style.width = Math.round((k / list.length) * 100) + "%";
      $("statusPct").textContent = Math.round((k / list.length) * 100) + "%";
      const fen = S.fens[idx];
      const tmp2 = new Chess(fen);
      if (tmp2.isGameOver()) continue;
      const res = await engineRun(fen, { depth: d2, multipv: 2 });
      const l1 = res.lines[1], l2 = res.lines[2];
      if (!l1) continue;
      const sign = tmp2.turn() === "w" ? 1 : -1;
      const e = {
        cp: l1.cp != null ? l1.cp * sign : null,
        mate: l1.mate != null ? l1.mate * sign : null,
        best: res.bestmove || l1.pv[0], pv: l1.pv, depth: l1.depth,
      };
      if (l2) {
        const s2 = { cp: l2.cp != null ? l2.cp * sign : null, mate: l2.mate != null ? l2.mate * sign : null };
        e.secondWin = winFor(tmp2.turn(), s2); e.second = s2;
      }
      S.positions[idx] = e;
    }
    for (let i = 0; i < S.moves.length; i++) S.perMove[i] = classify(i);
  }

  if (!S.cancel) {
    S.accuracy = gameAccuracy();
    renderReport();
    salvarAnalise();
    showTab("report");
    Snd.pronto();
    status("status.concluida", null, "status.precisao",
           () => ({ w: fmtPct(S.accuracy.w, 1), b: fmtPct(S.accuracy.b, 1) }));
    setTimeout(() => { $("panelStatus").style.display = "none"; }, 3500);
  } else {
    $("panelStatus").style.display = "none";
  }
  finishAnalysis();
  renderMoves(); renderBoard(); renderEvalBar(); renderEngineTab();
}
function finishAnalysis() {
  S.analyzing = false; S.cancel = false;
  $("btnAnalyze").textContent = tr("btn.analisar");
}

/* ============================================================
   Tabuleiro
   ============================================================ */
const FILES = "abcdefgh";
/* paleta do tabuleiro — clássica, porém dessaturada para combinar com a interface grafite */
const SQ_LIGHT = "#e3ded1", SQ_DARK = "#6b7563";
const HL_LAST = "#d8b25a", HL_CHECK = "#c9483f", HL_SEL = "#dcb464";
const ARROW_BEST = "#5f90b8", ARROW_ALT = "#81b64c";
function sqXY(sq) {
  const f = FILES.indexOf(sq[0]), r = 8 - +sq[1];
  const x = S.flipped ? 7 - f : f, y = S.flipped ? 7 - r : r;
  return [x * 100, y * 100];
}
function xyToSq(x, y) {
  let fx = Math.floor(x / 100), fy = Math.floor(y / 100);
  if (S.flipped) { fx = 7 - fx; fy = 7 - fy; }
  if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
  return FILES[fx] + (8 - fy);
}
function svg(tag, attrs, parent) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function currentChess() {
  if (S.explore) return S.explore.chess;
  return new Chess(S.fens[S.ply] || undefined);
}
function currentFen() { return S.explore ? S.explore.chess.fen() : (S.fens[S.ply] || new Chess().fen()); }

/* ---------- peças: elementos reaproveitados + deslize de um lance ----------
   O grupo #gPieces não é mais apagado a cada desenho: guardamos um mapa
   casa→<use> e só mexemos em quem mudou. Quando a navegação anda exatamente
   um lance (setas, play automático, lance no modo exploração), o transform
   novo entra com transição CSS e a peça desliza; qualquer outro redesenho
   (pulo longo, outra partida, girar o tabuleiro) continua instantâneo. */
const ANIM_MS = 180;                 // menor que o intervalo mais rápido do play (600 ms)
let pieceMap = new Map();            // casa → <use> em cena
let pieceFlip = null;                // orientação usada no último desenho das peças
let animTimers = [];                 // pendências da animação em curso
let animNext = null;                 // lance a animar na próxima renderização
let animSeloTardio = false;          // selo espera a peça chegar

function semAnimacao() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch (e) { return false; }
}
function agendarFim(fn) {
  const t = { fim: fn };
  t.id = setTimeout(() => { t.fim = null; fn(); }, ANIM_MS);
  animTimers.push(t);
}
/** Encerra a animação em curso já no estado final: nada fica preso no meio. */
function limparAnimPecas() {
  const pend = animTimers; animTimers = [];
  for (const t of pend) { clearTimeout(t.id); if (t.fim) t.fim(); }
  const gP = $("gPieces");
  if (gP) for (const el of [...gP.childNodes]) if (el.classList) el.classList.remove("pc-anim", "pc-out", "pc-in");
}
function usePeca(gP, code) {
  const u = svg("use", { href: "#" + code }, gP);
  u.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + code);
  u.dataset.pc = code;
  return u;
}
function trocaPeca(el, code) {
  el.setAttribute("href", "#" + code);
  el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + code);
}
/** Lance `i` da partida em forma verbosa (flags, captura, promoção) para animar. */
function planoDoLance(i, dir) {
  const mv = S.moves[i];
  if (!mv || !mv.uci || !S.fens[i]) return null;
  try {
    const c = new Chess(S.fens[i]);
    const m = c.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] || "q" });
    return m ? { m, dir } : null;
  } catch (e) { return null; }
}
/** Traduz o lance verboso em deslocamentos e sumiços, no sentido pedido. */
function montarPlano(spec) {
  const m = spec && spec.m;
  if (!m || !m.from || !m.to || !m.color || !m.piece) return null;
  const cor = m.color, fl = m.flags || "", lin = m.to[1];
  const roque = fl.indexOf("k") >= 0 ? ["h" + lin, "f" + lin]
              : fl.indexOf("q") >= 0 ? ["a" + lin, "d" + lin] : null;
  // en passant: o peão capturado está na coluna do destino, na linha de origem
  const capSq = m.captured ? (fl.indexOf("e") >= 0 ? m.to[0] + m.from[1] : m.to) : null;
  const slides = [], some = [];
  if (spec.dir > 0) {
    if (capSq) some.push(capSq);
    slides.push({ from: m.from, to: m.to, code: cor + m.piece,
                  vira: m.promotion ? cor + m.promotion : null });
    if (roque) slides.push({ from: roque[0], to: roque[1], code: cor + "r" });
  } else {
    slides.push({ from: m.to, to: m.from, code: m.promotion ? cor + m.promotion : cor + m.piece,
                  antes: m.promotion ? cor + m.piece : null });
    if (roque) slides.push({ from: roque[1], to: roque[0], code: cor + "r" });
  }
  return { slides, some };
}

function renderPieces(gP, ch) {
  const spec = animNext; animNext = null;
  animSeloTardio = false;
  for (const [sq, el] of pieceMap) if (el.parentNode !== gP) pieceMap.delete(sq);

  const board = ch.board();
  const alvo = new Map();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (p) alvo.set(FILES[f] + (8 - r), p.color + p.type);
  }

  // redesenho sem mudança de posição (seleção, motor…): não atrapalha o deslize em curso
  let igual = pieceFlip === S.flipped && alvo.size === pieceMap.size;
  if (igual) for (const [sq, code] of alvo) {
    const el = pieceMap.get(sq);
    if (!el || el.dataset.pc !== code) { igual = false; break; }
  }
  if (igual && !spec) return;

  limparAnimPecas();

  const plano = spec && !semAnimacao() && pieceMap.size ? montarPlano(spec) : null;
  const anima = !!plano
    && plano.slides.every((s) => { const el = pieceMap.get(s.from); return el && el.dataset.pc === s.code; })
    && plano.some.every((sq) => pieceMap.has(sq));

  if (anima) {
    animSeloTardio = true;
    for (const sq of plano.some) {              // capturada: só some quando a outra chega
      const el = pieceMap.get(sq); pieceMap.delete(sq);
      if (el.parentNode) el.parentNode.insertBefore(el, el.parentNode.firstChild);
      el.classList.add("pc-out");
      agendarFim(() => { if (el.parentNode) el.parentNode.removeChild(el); });
    }
    const movidos = plano.slides.map((s) => {
      const el = pieceMap.get(s.from); pieceMap.delete(s.from); return [s, el];
    });
    for (const [s, el] of movidos) {
      const ocupa = pieceMap.get(s.to);
      if (ocupa && ocupa !== el) { pieceMap.delete(s.to); if (ocupa.parentNode) ocupa.parentNode.removeChild(ocupa); }
      if (s.antes) { trocaPeca(el, s.antes); el.dataset.pc = s.antes; }   // desfazendo promoção
      el.classList.add("pc-anim");
      if (s.vira) el.dataset.pc = s.vira;                    // vira dama só ao chegar
      agendarFim(() => { el.classList.remove("pc-anim"); if (s.vira) trocaPeca(el, s.vira); });
      pieceMap.set(s.to, el);
    }
  }

  // reconcilia com a posição alvo reaproveitando o que já está em cena
  const sobra = [];
  for (const [sq, el] of pieceMap) if (alvo.get(sq) !== el.dataset.pc) { sobra.push(el); pieceMap.delete(sq); }
  for (const [sq, code] of alvo) {
    if (pieceMap.has(sq)) continue;
    const k = sobra.findIndex((e) => e.dataset.pc === code);
    let el;
    if (k >= 0) el = sobra.splice(k, 1)[0];
    else {
      el = usePeca(gP, code);
      if (anima) { el.classList.add("pc-in"); agendarFim(() => el.classList.remove("pc-in")); }
    }
    pieceMap.set(sq, el);
  }
  for (const el of sobra) if (el.parentNode) el.parentNode.removeChild(el);

  for (const [sq, el] of pieceMap) {
    const [x, y] = sqXY(sq);
    const t = `translate(${x},${y}) scale(2.5)`;
    if (el.getAttribute("transform") !== t) el.setAttribute("transform", t);
    el.dataset.sq = sq;
  }
  pieceFlip = S.flipped;
}

function renderBoard() {
  const gS = $("gSquares"), gH = $("gHigh"), gP = $("gPieces"), gA = $("gArrows"), gB = $("gBadge"), gC = $("gCoords");
  [gS, gH, gA, gB, gC].forEach((g) => (g.innerHTML = ""));   // gP é reconciliado, não apagado

  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    svg("rect", { x: f*100, y: r*100, width: 100, height: 100,
      fill: (f + r) % 2 === 0 ? SQ_LIGHT : SQ_DARK }, gS);
  }
  // coordenadas
  for (let i = 0; i < 8; i++) {
    const file = S.flipped ? FILES[7 - i] : FILES[i];
    const rank = S.flipped ? i + 1 : 8 - i;
    const lightCol = SQ_LIGHT, darkCol = SQ_DARK;
    svg("text", { x: i*100 + 92, y: 792, "font-size": 22, "font-weight": 700, "text-anchor": "end",
      fill: (i + 7) % 2 === 0 ? darkCol : lightCol, opacity: .9 }, gC).textContent = file;
    svg("text", { x: 6, y: i*100 + 26, "font-size": 22, "font-weight": 700,
      fill: i % 2 === 0 ? darkCol : lightCol, opacity: .9 }, gC).textContent = rank;
  }

  const ch = currentChess();

  // último lance
  const lm = lastMove();
  if (lm) for (const sq of [lm.from, lm.to]) {
    const [x, y] = sqXY(sq);
    svg("rect", { x, y, width: 100, height: 100, fill: HL_LAST, opacity: .4 }, gH);
  }
  // xeque
  if (ch.inCheck()) {
    const king = ch.findPiece({ type: "k", color: ch.turn() })[0];
    if (king) { const [x, y] = sqXY(king);
      svg("rect", { x, y, width: 100, height: 100, fill: HL_CHECK, opacity: .5 }, gH); }
  }
  // seleção + destinos
  if (S.sel) {
    const [x, y] = sqXY(S.sel);
    svg("rect", { x, y, width: 100, height: 100, fill: HL_SEL, opacity: .45 }, gH);
    for (const m of ch.moves({ square: S.sel, verbose: true })) {
      const [dx, dy] = sqXY(m.to);
      if (ch.get(m.to)) svg("circle", { cx: dx+50, cy: dy+50, r: 46, fill: "none", stroke: "#000", "stroke-opacity": .28, "stroke-width": 8 }, gH);
      else svg("circle", { cx: dx+50, cy: dy+50, r: 16, fill: "#000", "fill-opacity": .24 }, gH);
    }
  }

  // peças
  renderPieces(gP, ch);

  // setas + selo de classificação
  if (!S.explore) drawAnnotations(gA, gB);
}

function lastMove() {
  if (S.explore) {
    const h = S.explore.chess.history({ verbose: true });
    if (h.length) return h[h.length - 1];
    // no treino a variação começa vazia: quem tem que ficar realçado é o
    // lance do adversário que criou o problema
    if (S.treino) return S.ply > 0 ? S.moves[S.ply - 1] : null;
    return null;
  }
  return S.ply > 0 ? S.moves[S.ply - 1] : null;
}

function drawArrow(g, from, to, color, opacity) {
  const [x1, y1] = sqXY(from), [x2, y2] = sqXY(to);
  const ax = x1 + 50, ay = y1 + 50, bx = x2 + 50, by = y2 + 50;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  if (!len) return;
  const ux = dx / len, uy = dy / len;
  const head = 34, w = 13;
  const ex = bx - ux * head, ey = by - uy * head;
  svg("line", { x1: ax, y1: ay, x2: ex, y2: ey, stroke: color, "stroke-width": w*2,
    "stroke-linecap": "round", opacity }, g);
  const px = -uy, py = ux;
  svg("polygon", { points: `${bx - ux*6},${by - uy*6} ${ex + px*22},${ey + py*22} ${ex - px*22},${ey - py*22}`,
    fill: color, opacity }, g);
}

function drawAnnotations(gA, gB) {
  const i = S.ply - 1;                 // lance que acabou de ser jogado
  const pm = i >= 0 ? S.perMove[i] : null;
  const posBefore = i >= 0 ? S.positions[i] : null;
  const posNow = S.positions[S.ply];

  // seta do melhor lance na posição atual
  if (posNow && posNow.best) drawArrow(gA, posNow.best.slice(0,2), posNow.best.slice(2,4), ARROW_BEST, .8);

  // se o lance jogado não foi o melhor, mostra a alternativa
  if (pm && posBefore && posBefore.best && posBefore.best.slice(0,4) !== S.moves[i].uci.slice(0,4)
      && (pm.cls === "impreciso" || pm.cls === "erro" || pm.cls === "capivarada")) {
    drawArrow(gA, posBefore.best.slice(0,2), posBefore.best.slice(2,4), ARROW_ALT, .88);
  }

  // selo de classificação na casa de destino
  if (pm) {
    const mv = S.moves[i];
    const [x, y] = sqXY(mv.to);
    const c = CLS[pm.cls];
    const g = svg("g", animSeloTardio ? { class: "tardio" } : {}, gB);   // pousa junto com a peça
    const cx = Math.max(22, Math.min(778, x + 82)), cy = Math.max(22, Math.min(778, y + 18));
    svg("circle", { cx, cy, r: 20, fill: c.cor, stroke: "#00000055", "stroke-width": 2 }, g);
    const t = svg("text", { x: cx, y: cy + 8, "text-anchor": "middle", "font-size": 22,
      "font-weight": 800, fill: "#0e1a06" }, g);
    t.textContent = c.sym;
  }
}

/* ---------- interação (explorar variações) ---------- */
$("board").addEventListener("click", (ev) => {
  const rect = ev.currentTarget.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 800;
  const y = ((ev.clientY - rect.top) / rect.height) * 800;
  const sq = xyToSq(x, y);
  if (!sq) return;
  const ch = currentChess();
  if (S.sel) {
    const opts = ch.moves({ square: S.sel, verbose: true }).filter((m) => m.to === sq);
    if (opts.length) {
      const mv = opts.find((m) => !m.promotion) || opts.find((m) => m.promotion === "q") || opts[0];
      makeExploreMove(mv);
      S.sel = null; renderBoard(); return;
    }
  }
  const p = ch.get(sq);
  S.sel = p && p.color === ch.turn() ? sq : null;
  renderBoard();
});

function makeExploreMove(mv) {
  if (S.treino) { treinoJogada(mv); return; }   // no treino o lance é uma resposta
  if (!S.explore) {
    const c = new Chess(S.fens[S.ply]);
    S.explore = { chess: c, base: S.ply };
    $("exploreBar").classList.add("on");
  }
  const feito = S.explore.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" });
  if (feito) animNext = { m: feito, dir: 1 };
  S.exploreEval = null;
  somDoLance(feito && feito.san);
  renderBoard(); renderEvalBar();
  analyzeCurrent(true);
}
$("btnBackToGame").onclick = () => {
  S.explore = null; S.sel = null; S.exploreEval = null;
  if (!S.analyzing) Engine.stop();
  $("exploreBar").classList.remove("on");
  renderBoard(); renderEvalBar(); renderEngineTab();
};

/* ============================================================
   Painéis
   ============================================================ */
function renderPlayers() {
  const h = S.headers;
  const top = S.flipped ? "White" : "Black", bot = S.flipped ? "Black" : "White";
  $("nmTop").textContent = nomeLado(h[top], top === "White" ? "w" : "b");
  $("nmBot").textContent = nomeLado(h[bot], bot === "White" ? "w" : "b");
  $("elTop").textContent = h[top + "Elo"] ? "(" + h[top + "Elo"] + ")" : "";
  $("elBot").textContent = h[bot + "Elo"] ? "(" + h[bot + "Elo"] + ")" : "";
  $("dotTop").style.background = top === "White" ? "#e9e6df" : "#2b3037";
  $("dotBot").style.background = bot === "White" ? "#e9e6df" : "#2b3037";
  if (S.accuracy) {
    const accT = S.accuracy[top === "White" ? "w" : "b"], accB = S.accuracy[bot === "White" ? "w" : "b"];
    $("accTop").style.display = ""; $("accBot").style.display = "";
    $("accTop").textContent = fmtPct(accT, 1);
    $("accBot").textContent = fmtPct(accB, 1);
  } else { $("accTop").style.display = "none"; $("accBot").style.display = "none"; }
}

function renderEvalBar() {
  const pos = S.explore ? S.exploreEval : S.positions[S.ply];
  let pct = 50, txt = "";
  if (pos) {
    pct = winPct(scoreToCp(pos));
    if (pos.mateEnd) txt = "#";
    else if (pos.mate != null) txt = "M" + Math.abs(pos.mate);
    else if (pos.cp != null) txt = Math.abs(pos.cp / 100).toFixed(1);
  }
  $("evalWhite").style.height = pct + "%";
  const t = $("evalTxt");
  t.textContent = txt;
  const whiteAhead = pct >= 50;
  const atBottom = S.flipped ? !whiteAhead : whiteAhead;
  t.className = "txt" + (atBottom ? "" : " up");
  t.style.color = whiteAhead ? "#15171a" : "#d9dce0";
  if (S.flipped) { $("evalWhite").style.bottom = "auto"; $("evalWhite").style.top = "0"; }
  else { $("evalWhite").style.top = "auto"; $("evalWhite").style.bottom = "0"; }
}

/** Selo do lance. `mudo` tira o <title> de quem já mostra o nome ao lado. */
function icon(cls, size, mudo) {
  const c = CLS[cls];
  const titulo = mudo ? "" : `<title>${esc(clsDica(cls))}</title>`;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size||16}" height="${size||16}" role="img">${titulo}
    <circle cx="12" cy="12" r="11" fill="${c.cor}"/>
    <text x="12" y="17" text-anchor="middle" font-size="13" font-weight="800" fill="#0e1a06">${c.sym}</text></svg>`;
}

function renderMoves() {
  const box = $("movesBody");
  if (!S.moves.length) {
    box.innerHTML = '<div class="empty" style="padding-left:8px"><span class="rule"></span>' +
      `<strong>${esc(tr("lances.vazio.titulo"))}</strong>${esc(tr("lances.vazio.texto"))}</div>`;
    return;
  }
  let html = "", open = false;
  S.moves.forEach((m, i) => {
    if (m.color === "w") {
      if (open) html += "</div>";
      html += `<div class="mrow"><div class="no">${m.num}.</div>`;
      open = true;
    } else if (!open) {
      html += `<div class="mrow"><div class="no">${m.num}.</div><div></div>`;
      open = true;
    }
    html += moveCell(i);
    if (m.color === "b") { html += "</div>"; open = false; }
  });
  if (open) html += "</div>";
  box.innerHTML = html;
  box.querySelectorAll(".mv").forEach((el) => {
    el.onclick = () => goTo(+el.dataset.ply);
  });
  highlightMove();
}
function moveCell(i) {
  const m = S.moves[i], pm = S.perMove[i], pos = S.positions[i + 1];
  const ev = pos ? fmtEval(pos) : "";
  return `<div class="mv" data-ply="${i + 1}" data-i="${i}">${pm ? icon(pm.cls) : ""}
    <span>${m.san}</span><span class="ev">${ev}</span></div>`;
}
function renderMoveRow(i) {
  const el = document.querySelector('.mv[data-i="' + i + '"]');
  if (!el) return;
  const m = S.moves[i], pm = S.perMove[i], pos = S.positions[i + 1];
  el.innerHTML = `${pm ? icon(pm.cls) : ""}<span>${m.san}</span><span class="ev">${pos ? fmtEval(pos) : ""}</span>`;
}
function highlightMove() {
  document.querySelectorAll(".mv").forEach((el) => el.classList.toggle("on", +el.dataset.ply === S.ply));
  const on = document.querySelector(".mv.on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
}

/** Estado vazio do relatório: sem partida, ou com partida ainda não analisada. */
function renderReportBody() {
  if (S.accuracy) { renderReport(); return; }
  const chave = S.moves.length ? "rel.carregada" : "rel.vazio";
  $("reportBody").innerHTML = (S.moves.length ? aberturaHtml(S.abertura) : "") +
    `<div class="empty"><span class="rule"></span><strong>${esc(tr(chave + ".titulo"))}</strong>` +
    tr(chave + ".texto") + "</div>";
  if ($("exportRow")) $("exportRow").style.display = "none";
}

function renderReport() {
  if (!S.accuracy) return;
  const counts = { w: {}, b: {} };
  S.perMove.forEach((pm, i) => {
    if (!pm) return;
    const c = S.moves[i].color;
    counts[c][pm.cls] = (counts[c][pm.cls] || 0) + 1;
  });
  const wName = nomeLado(S.headers.White, "w"), bName = nomeLado(S.headers.Black, "b");
  let rows = "";
  for (const k of CLS_ORDER) {
    const a = counts.w[k] || 0, b = counts.b[k] || 0;
    if (!a && !b) continue;
    rows += `<div class="r"><div class="w" style="color:${CLS[k].cor}">${a}</div>
      <div class="lbl" title="${esc(clsDica(k))}"><span class="chip" style="background:${CLS[k].cor}"></span>${esc(clsNome(k))}</div>
      <div class="b" style="color:${CLS[k].cor}">${b}</div></div>`;
  }
  // momentos-chave
  const key = S.perMove.map((pm, i) => ({ pm, i })).filter((x) => x.pm && x.pm.loss >= 10)
    .sort((a, b) => b.pm.loss - a.pm.loss).slice(0, 5);
  let keyHtml = "";
  if (key.length) {
    keyHtml = `<h3 class="sub">${esc(tr("rel.momentos"))}</h3>`;
    for (const k of key) {
      const m = S.moves[k.i];
      const n = m.num + (m.color === "w" ? ". " : "... ");
      keyHtml += `<button class="btn ghost keymove" data-goto="${k.i + 1}">
        ${icon(k.pm.cls, 15)}<b>${n}${m.san}</b>
        <span class="hint">${esc(tr("rel.perdeu", { n: k.pm.loss.toFixed(0) }))}</span></button>`;
    }
  }
  // chamada do treino — só existe quando a partida tem o que treinar
  const filaTreino = filaDeErros(ladoDoUsuario(S.headers));
  let treinoHtml = "";
  if (filaTreino.length) {
    treinoHtml = `<h3 class="sub">${esc(tr("treino.sub"))}</h3>
      <button class="btn primary train-cta" id="btnTrainStart">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.8v14.4L19 12z"/></svg>
        <span>${esc(tr("treino.cta"))}</span>
        <span class="n">${esc(tr(filaTreino.length === 1 ? "treino.cta.n1" : "treino.cta.n",
                                 { n: filaTreino.length }))}</span>
      </button>
      <p class="hint" style="margin-top:9px">${esc(tr("treino.explica"))}</p>`;
  }
  const unidade = esc(tr("rel.precisao"));
  $("reportBody").innerHTML = aberturaHtml(S.abertura) + `
    <div class="accbox">
      <div class="side"><div class="k">${esc(wName)}</div>
        <div class="v">${fmtNum(S.accuracy.w, 1)}</div><div class="u">${unidade}</div></div>
      <div class="side"><div class="k">${esc(bName)}</div>
        <div class="v">${fmtNum(S.accuracy.b, 1)}</div><div class="u">${unidade}</div></div>
    </div>
    <canvas id="graph"></canvas>
    <div class="caption">${esc(tr("rel.grafico"))}</div>
    <div class="report-grid">${rows}</div>
    ${keyHtml}${treinoHtml}`;
  $("reportBody").querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => goTo(+b.dataset.goto)));
  if ($("btnTrainStart")) $("btnTrainStart").onclick = () => treinoIniciar();
  if ($("exportRow")) $("exportRow").style.display = "";
  drawGraph();
}
function esc(s) { return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

function drawGraph() {
  const cv = $("graph");
  if (!cv || !S.positions.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = 110;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext && cv.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const n = S.positions.length;
  const X = (i) => (i / (n - 1)) * w;
  const Y = (p) => h - (p / 100) * h;

  g.fillStyle = "#14171b"; g.fillRect(0, 0, w, h);
  // área branca
  g.beginPath(); g.moveTo(0, h);
  for (let i = 0; i < n; i++) g.lineTo(X(i), Y(S.positions[i] ? winPct(scoreToCp(S.positions[i])) : 50));
  g.lineTo(w, h); g.closePath();
  g.fillStyle = "#dcd8cf"; g.fill();
  // linha do meio
  g.strokeStyle = "#3b424b"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  // marcadores de erro
  S.perMove.forEach((pm, i) => {
    if (!pm || pm.loss < 10) return;
    const x = X(i + 1), y = Y(winPct(scoreToCp(S.positions[i + 1])));
    g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fillStyle = CLS[pm.cls].cor; g.fill();
  });
  // posição atual (violeta da marca — cor de interface, não de classificação)
  g.strokeStyle = "#9081da"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(S.ply), 0); g.lineTo(X(S.ply), h); g.stroke();

  cv.onclick = (e) => {
    const r = cv.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    goTo(Math.max(0, Math.min(n - 1, i)));
  };
}

function uciLineToSan(fen, uciList, max) {
  let c;
  try { c = new Chess(fen); } catch (e) { return []; }
  const out = [];
  for (const u of uciList.slice(0, max || 12)) {
    try {
      const num = c.moveNumber();
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      if (!m) break;
      out.push({ san: m.san, num, color: m.color, uci: u });
    } catch (e) { break; }
  }
  return out;
}

function renderEngineTab(live) {
  const box = $("engineLines");
  const fen = currentFen();
  const pos = live || (S.explore ? S.exploreEval : S.positions[S.ply]);
  if (!pos) {
    // sem partida na tela o convite é geral; com partida, é sobre esta posição
    const texto = tr(S.moves.length ? "motor.semDados" : "motor.vazio.texto");
    box.innerHTML = '<div class="empty"><span class="rule"></span>' +
      `<strong>${esc(tr("motor.vazio.titulo"))}</strong>${esc(texto)}</div>`;
    return;
  }
  const lines = pos.lines || [{ cp: pos.cp, mate: pos.mate, pv: pos.pv, depth: pos.depth }];
  let html = "";
  const pvStore = [];
  for (const l of lines) {
    if (!l) continue;
    const stm = new Chess(fen).turn();
    const sign = stm === "w" ? 1 : -1;
    const s = { cp: l.cp != null ? l.cp * (pos.lines ? sign : 1) : null,
                mate: l.mate != null ? l.mate * (pos.lines ? sign : 1) : null };
    const txt = fmtEval(s);
    const neg = scoreToCp(s) < 0;
    const san = uciLineToSan(fen, l.pv || []);
    const li = pvStore.push(l.pv || []) - 1;
    let moves = "", first = true;
    san.forEach((m, k) => {
      if (m.color === "w") moves += `<b>${m.num}.</b> `;
      else if (first) moves += `<b>${m.num}...</b> `;
      moves += `<span class="pvmove" data-l="${li}" data-k="${k}">${m.san}</span> `;
      first = false;
    });
    html += `<div class="pvline"><span class="sc${neg ? " neg" : ""}">${txt}</span>
      <span class="hint">${esc(tr("motor.prof", { d: l.depth || "-" }))}</span><br>${moves}</div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll(".pvmove").forEach((el) => {
    el.onclick = () => playLine(fen, pvStore[+el.dataset.l], +el.dataset.k + 1);
  });
}

/** Reproduz os primeiros `n` lances de uma linha do motor no modo exploração. */
function playLine(fen, uciList, n) {
  if (!uciList || !uciList.length) return;
  let c;
  try { c = new Chess(fen); } catch (e) { return; }
  for (const u of uciList.slice(0, n)) {
    try { if (!c.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] || "q" })) break; }
    catch (e) { break; }
  }
  S.explore = { chess: c, base: S.ply };
  S.exploreEval = null; S.sel = null;
  const h = c.history();
  somDoLance(h[h.length - 1]);
  $("exploreBar").classList.add("on");
  renderBoard(); renderEvalBar();
  analyzeCurrent(true);
}

/* análise sob demanda da posição atual (variações / botão "a fundo") */
async function analyzeCurrent(quick) {
  try { await Engine.boot(); } catch (e) { toast(tr("motor.offline")); return; }
  if (S.analyzing) return;
  const fen = currentFen();
  const c = new Chess(fen);
  if (c.isGameOver()) { renderEngineTab({ cp: 0, mate: null, pv: [] }); return; }
  const depth = quick ? Math.min(+$("depth").value, 16) : 99;
  const sign = c.turn() === "w" ? 1 : -1;
  const stale = () => currentFen() !== fen;      // usuário navegou: descarta
  const snapshot = (store, bm) => {
    const l1 = store[1];
    const snap = { lines: [store[1], store[2], store[3]].filter(Boolean) };
    if (l1) {
      snap.cp = l1.cp != null ? l1.cp * sign : null;
      snap.mate = l1.mate != null ? l1.mate * sign : null;
      snap.pv = l1.pv; snap.depth = l1.depth; snap.best = bm || l1.pv[0];
    }
    return snap;
  };
  S.deep = !quick;
  if (!quick) { $("btnDeep").style.display = "none"; $("btnStopDeep").style.display = ""; }
  try {
    const res = await engineRun(fen, {
      depth, multipv: 3, infinite: !quick,
      onUpdate: (store) => {
        if (stale()) return;
        const snap = snapshot(store);
        if (S.explore) { S.exploreEval = snap; renderEvalBar(); }
        renderEngineTab(snap);
      },
    });
    if (!stale()) {
      const snap = snapshot(res.lines, res.bestmove);
      if (S.explore) { S.exploreEval = snap; renderEvalBar(); }
      renderEngineTab(snap);
    }
  } finally {
    $("btnDeep").style.display = ""; $("btnStopDeep").style.display = "none";
    S.deep = false;
  }
}

/* ============================================================
   Navegação
   ============================================================ */
function goTo(ply, opts) {
  if (S.treino) return;            // no treino quem manda na posição é a fila
  const alvo = Math.max(0, Math.min(S.moves.length, ply));
  const anterior = S.ply;
  const eraExplore = !!S.explore;
  if (!(opts && opts.auto)) pararPlay();
  if (S.explore) { S.explore = null; $("exploreBar").classList.remove("on"); }
  if (!S.analyzing) Engine.stop();           // não deixa busca antiga rodando
  S.exploreEval = null;
  S.ply = alvo;
  S.sel = null;
  // deslize só entre lances vizinhos; pulo longo (ou sair do modo exploração) é instantâneo
  if (!eraExplore && Math.abs(alvo - anterior) === 1)
    animNext = planoDoLance(Math.min(alvo, anterior), alvo > anterior ? 1 : -1);
  renderBoard(); renderEvalBar(); highlightMove(); renderEngineTab(); drawGraph();
  // som só quando anda de lance em lance (pulos longos ficariam ruidosos)
  if (Math.abs(alvo - anterior) === 1 && alvo > 0) {
    const i = alvo - 1;
    somDoLance(S.moves[i] && S.moves[i].san, S.perMove[i] && S.perMove[i].cls);
  }
}
$("btnStart").onclick = () => goTo(0);
$("btnPrev").onclick  = () => goTo(S.ply - 1);
$("btnNext").onclick  = () => goTo(S.ply + 1);
$("btnEnd").onclick   = () => goTo(S.moves.length);
$("btnFlip").onclick  = () => { S.flipped = !S.flipped; S.flipManual = true; renderBoard(); renderPlayers(); renderEvalBar(); };

/* ---------- reprodução automática ---------- */
let playTimer = null;
function intervalo() { return Math.max(200, +$("speed").value || 1200); }
function pararPlay() {
  if (!playTimer) return;
  clearInterval(playTimer); playTimer = null;
  atualizarPlay();
}
function passo() {
  if (S.ply >= S.moves.length) { pararPlay(); return; }
  goTo(S.ply + 1, { auto: true });
  if (S.ply >= S.moves.length) pararPlay();
}
function alternarPlay() {
  if (S.treino) return;
  if (playTimer) { pararPlay(); return; }
  if (!S.moves.length) { toast(tr("toast.carregueAntes")); return; }
  Snd.init();
  if (S.ply >= S.moves.length) goTo(0, { auto: true });
  playTimer = setInterval(passo, intervalo());
  atualizarPlay();
  passo();
}
function atualizarPlay() {
  const on = !!playTimer;
  $("btnPlay").classList.toggle("on", on);
  $("icoPlay").style.display = on ? "none" : "";
  $("icoPause").style.display = on ? "" : "none";
  $("btnPlay").title = tr(on ? "btn.pausar" : "btn.play");
}
$("btnPlay").onclick = alternarPlay;
$("speed").onchange = () => { if (playTimer) { clearInterval(playTimer); playTimer = setInterval(passo, intervalo()); } };

/* ---------- som: botão e preferência ---------- */
function aplicarSom() {
  $("btnSound").classList.toggle("off", Snd.mudo);
  $("icoSoundOn").style.display = Snd.mudo ? "none" : "";
  $("icoSoundOff").style.display = Snd.mudo ? "" : "none";
}
try { Snd.mudo = localStorage.getItem("som") === "0"; } catch (e) {}
aplicarSom();
$("btnSound").onclick = () => {
  Snd.mudo = !Snd.mudo;
  try { localStorage.setItem("som", Snd.mudo ? "0" : "1"); } catch (e) {}
  aplicarSom();
  if (!Snd.mudo) { Snd.init(); Snd.lance(); }
};
["pointerdown", "keydown"].forEach((ev) =>
  document.addEventListener(ev, () => Snd.init(), { once: true }));

document.addEventListener("keydown", (e) => {
  if (!e.key || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key === "ArrowLeft") { goTo(S.ply - 1); e.preventDefault(); }
  else if (e.key === "ArrowRight") { goTo(S.ply + 1); e.preventDefault(); }
  else if (e.key === "Home") goTo(0);
  else if (e.key === "End") goTo(S.moves.length);
  else if (e.key === " ") { alternarPlay(); e.preventDefault(); }
  else if (e.key.toLowerCase() === "f") $("btnFlip").click();
  else if (e.key.toLowerCase() === "m") $("btnSound").click();
});

/* ============================================================
   Importação
   ============================================================ */
$("btnLoadPgn").onclick = () => {
  const txt = $("pgnBox").value.trim();
  if (!txt) { toast(tr("toast.colePgn")); return; }
  const games = splitPgn(txt);
  if (games.length > 1) showGameList(games.map((g, i) => ({ pgn: g, ...pgnInfo(g) })));
  else loadPgn(txt);
};
$("btnPickFile").onclick = () => $("fileInput").click();
$("fileInput").onchange = (e) => {
  const f = e.target.files[0];
  if (f) f.text().then((t) => { $("pgnBox").value = t; $("btnLoadPgn").click(); });
};
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("hot"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("hot"); }));
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) f.text().then((t) => { $("pgnBox").value = t; $("btnLoadPgn").click(); });
});

function splitPgn(txt) {
  const parts = txt.split(/\n\s*(?=\[Event\s)/g).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [txt];
}
function pgnInfo(pgn) {
  const h = {};
  pgn.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => { h[k] = v; return ""; });
  return h;
}
/* Guardada para que a lista possa ser reetiquetada na troca de idioma:
   o nome da abertura de cada linha vem da base e muda de língua junto. */
let listaPartidas = null;
function showGameList(items) {
  const box = $("gameList");
  listaPartidas = items;
  box.innerHTML = items.map((g, i) => {
    const ab = aberturaTexto(aberturaDePgn(g.pgn, g));
    return `<button data-i="${i}">
      <div><b>${esc(g.White || "?")}</b> ${g.WhiteElo ? "(" + esc(g.WhiteElo) + ")" : ""} vs <b>${esc(g.Black || "?")}</b> ${g.BlackElo ? "(" + esc(g.BlackElo) + ")" : ""}</div>
      <div class="meta">${esc(g.Result || "")} · ${esc(fmtData(g.Date || g.UTCDate || ""))} · ${esc(g.TimeControl || "")} ${esc(g.Event || "")}</div>
      ${ab ? `<div class="meta">${esc(ab)}</div>` : ""}
    </button>`;
  }).join("");
  box.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const g = items[+b.dataset.i];
    $("pgnBox").value = g.pgn;
    loadPgn(g.pgn);
  }));
}

/* A dica embaixo da busca também é reetiquetada: guarda a chave e os
   parâmetros do que está escrito, não o texto pronto. */
let buscaMsg = null;
function pintarBusca() {
  if (buscaMsg) $("fetchHint").textContent = tr(buscaMsg.k, buscaMsg.p);
}
function avisoBusca(k, p) { buscaMsg = { k, p }; pintarBusca(); }

$("btnFetch").onclick = async () => {
  const user = $("userBox").value.trim();
  if (!user) { toast(tr("buscar.digite")); return; }
  lembrarUsuario(user);          // quem é a pessoa: gira o tabuleiro e escolhe os erros do treino
  const site = $("site").value;
  avisoBusca("buscar.buscando");
  try {
    let items = [];
    // mode "cors" explícito: é o que mantém estas buscas funcionando quando a
    // página está cross-origin isolated (COEP só barra requisições "no-cors").
    if (site === "lichess") {
      const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=25`,
        { mode: "cors", headers: { Accept: "application/x-chess-pgn" } });
      if (!r.ok) throw new Error(tr("buscar.semUsuario"));
      const txt = await r.text();
      items = splitPgn(txt).map((p) => ({ pgn: p, ...pgnInfo(p) }));
    } else {
      const ar = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`, { mode: "cors" });
      if (!ar.ok) throw new Error(tr("buscar.semUsuario"));
      const list = (await ar.json()).archives || [];
      if (!list.length) throw new Error(tr("buscar.semPublicas"));
      let games = [];
      for (let k = list.length - 1; k >= 0 && games.length < 25 && k > list.length - 4; k--) {
        const m = await fetch(list[k], { mode: "cors" });
        const gs = (await m.json()).games || [];
        games = games.concat(gs.reverse());
      }
      items = games.slice(0, 25).filter((g) => g.pgn).map((g) => ({ pgn: g.pgn, ...pgnInfo(g.pgn) }));
    }
    if (!items.length) throw new Error(tr("buscar.nenhuma"));
    showGameList(items);
    avisoBusca("buscar.achou", { n: items.length });
  } catch (e) {
    // A mensagem do erro já saiu do dicionário; guardá-la pronta é o certo
    // aqui, senão a troca de idioma reescreveria um erro que não aconteceu.
    if (e instanceof TypeError) {
      buscaMsg = null;
      $("fetchHint").textContent = tr("buscar.semRede") + (self.crossOriginIsolated ? tr("buscar.coep") : "");
    } else {
      buscaMsg = null;
      $("fetchHint").textContent = tr("buscar.erro", { msg: e.message });
    }
  }
};

/* ============================================================
   Diversos
   ============================================================ */
$("btnAnalyze").onclick = analyzeGame;
$("btnNew").onclick = () => { showTab("import"); $("pgnBox").focus(); };
$("btnDeep").onclick = () => analyzeCurrent(false);
$("btnStopDeep").onclick = () => { Engine.stop(); };
function copiar(txt, chaveOk) {
  if (!navigator.clipboard) { toast(tr("toast.copiaIndisponivel")); return; }
  navigator.clipboard.writeText(txt).then(() => toast(tr(chaveOk)), () => toast(tr("toast.naoCopiou")));
}
$("btnCopyFen").onclick = () => copiar(currentFen(), "toast.fenCopiado");
$("btnCopyPgn").onclick = () => {
  if (!S.moves.length) { toast(tr("toast.semPartida")); return; }
  try {
    const c = new Chess(S.fens[0]);
    Object.entries(S.headers).forEach(([k, v]) => c.setHeader(k, v));
    S.moves.forEach((m) => c.move(m.san));
    copiar(c.pgn(), "toast.pgnCopiado");
  } catch (e) { copiar($("pgnBox").value, "toast.pgnCopiado"); }
};
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("on", p.id === "tab-" + name));
  if (name === "report") drawGraph();
}
let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600);
}
/* A legenda já escreve o nome ao lado do selo: o tooltip só ganha texto extra
   se alguma língua vier a precisar explicar o nome de um selo (cls.*.dica). */
function renderLegend() {
  $("legend").innerHTML = CLS_ORDER
    .map((k) => `<span title="${esc(clsDica(k))}">${icon(k, 14, true)}${esc(clsNome(k))}</span>`).join("");
}

window.addEventListener("resize", () => drawGraph());

/* ============================================================
   Análises salvas
   ------------------------------------------------------------
   ONDE: localStorage, chave "plyscope.analises.v1".

   POR QUÊ localStorage e não IndexedDB — o que precisa ser guardado
   para redesenhar a tela é pequeno: jogamos fora a variação principal
   (pv) e as linhas do motor, que respondem por quase todo o peso de
   S.positions. Sobra uma partida de 80 lances em ~7 KB, então as 20
   análises do limite cabem em ~140 KB, longe dos ~5 MB por origem do
   localStorage. Em troca vem uma API síncrona (reabrir é instantâneo,
   sem promessa nem esquema versionado) e um punhado de linhas de
   código, num app que roda de file:// sem servidor. IndexedDB só
   compensaria se guardássemos as pv ou centenas de partidas.

   O QUE É GUARDADO: o PGN (os lances e as casas são reconstruídos por
   loadPgn) + avaliação compacta de cada posição + classificação de
   cada lance + precisão. Mais uma única exceção à regra de não guardar
   pv: os primeiros meios-lances da variação NAS POSIÇÕES DE ERRO, que
   são a resposta do treino ("por que este lance?") e custam ~40 B cada.
   ============================================================ */
const Saved = {
  KEY: "plyscope.analises.v1",
  MAX: 20,                       // guarda as mais recentes
  _ok: null,
  /** navegador com armazenamento bloqueado (modo privado, cookies barrados) */
  disponivel() {
    if (this._ok !== null) return this._ok;
    try {
      const k = this.KEY + ".teste";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      this._ok = true;
    } catch (e) { this._ok = false; }
    return this._ok;
  },
  ler() {
    if (!this.disponivel()) return [];
    try {
      const v = JSON.parse(window.localStorage.getItem(this.KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  },
  gravar(lista) {
    if (!this.disponivel()) return false;
    let l = lista.slice(0, this.MAX);
    for (;;) {
      try { window.localStorage.setItem(this.KEY, JSON.stringify(l)); return true; }
      catch (e) {
        if (!cotaEstourada(e)) return false;
        if (l.length <= 1) {                 // nem uma cabe: devolve o espaço e desiste
          try { window.localStorage.removeItem(this.KEY); } catch (e2) {}
          return false;
        }
        l = l.slice(0, l.length - 1);        // sacrifica a mais antiga e tenta de novo
      }
    }
  },
  apagar(id) { return this.gravar(this.ler().filter((r) => r.id !== id)); },
};
function cotaEstourada(e) {
  return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
                 e.code === 22 || e.code === 1014);
}

/* ---------- formato compacto (sem pv, sem lines) ---------- */
function posParaArr(p) {
  if (!p) return 0;
  const a = [p.cp == null ? null : Math.round(p.cp), p.mate == null ? null : p.mate,
             p.best || null, p.depth || 0];
  if (p.secondWin != null) a[4] = +p.secondWin.toFixed(1);
  if (p.mateEnd) { if (a.length < 5) a[4] = null; a[5] = 1; }
  return a;
}
function arrParaPos(a) {
  if (!a || !a.length) return null;
  const p = { cp: a[0] == null ? null : a[0], mate: a[1] == null ? null : a[1],
              best: a[2] || null, pv: [], depth: a[3] || 0 };
  if (a[4] != null) p.secondWin = a[4];
  if (a[5]) p.mateEnd = true;
  return p;
}
function pmParaArr(pm) {
  if (!pm) return 0;
  return [CLS_ORDER.indexOf(pm.cls), +pm.loss.toFixed(1), +pm.accuracy.toFixed(1),
          +pm.winBefore.toFixed(1), +pm.winAfter.toFixed(1), Math.round(pm.sacRisked || 0)];
}
function arrParaPm(a) {
  if (!a || !a.length) return null;
  const cls = CLS_ORDER[a[0]];
  if (!cls) return null;
  return { cls, loss: a[1], accuracy: a[2], winBefore: a[3], winAfter: a[4], sacRisked: a[5] || 0 };
}

function hashTxt(s) {                          // FNV-1a: id estável da partida
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(36);
}

/** PGN limpo da partida atual (headers originais + lances). */
function pgnDaPartida() {
  try {
    const c = new Chess(S.fens[0]);
    Object.entries(S.headers).forEach(([k, v]) => c.setHeader(k, v));
    S.moves.forEach((m) => c.move(m.san));
    return c.pgn();
  } catch (e) { return null; }
}

/* Guarda o cabeçalho cru: "Brancas"/"White" é rótulo de interface e sai do
   dicionário na hora de desenhar, senão o registro salvo congelaria a língua
   em que a análise foi feita. A data também fica no formato do PGN. */
function metaDaPartida() {
  const h = S.headers || {};
  return {
    w: h.White || "", b: h.Black || "",
    we: h.WhiteElo || "", be: h.BlackElo || "",
    res: h.Result || "*", data: h.Date || h.UTCDate || "", ev: h.Event || "",
  };
}

function salvarAnalise() {
  try {
    if (!S.accuracy || !S.moves.length || !Saved.disponivel()) return;
    const pgn = pgnDaPartida();
    if (!pgn) return;
    const m = metaDaPartida();
    const rec = {
      id: hashTxt(m.w + "|" + m.b + "|" + m.data + "|" + S.moves.map((x) => x.san).join(" ")),
      ts: Date.now(),
      prof: +$("depth").value || null,
      meta: m,
      acc: { w: S.accuracy.w != null ? +S.accuracy.w.toFixed(1) : null,
             b: S.accuracy.b != null ? +S.accuracy.b.toFixed(1) : null },
      pgn,
      pos: S.positions.map(posParaArr),
      pm: S.perMove.map(pmParaArr),
    };
    /* A variação principal continua fora do registro — menos nas posições
       que entram na fila do treino, onde ela É o conteúdo ("por que este
       lance?"). São ~40 B por erro — ~300 B numa partida de 80 lances com
       8 erros, contra os ~2 KB da pv de todas as posições. */
    const pvt = pvDoTreino();
    if (Object.keys(pvt).length) rec.pvt = pvt;
    const us = String(S.usuario || "").trim();
    if (us) rec.us = us;                     // de que lado o usuário jogou
    const lista = Saved.ler().filter((r) => r && r.id !== rec.id);   // sem duplicar
    lista.unshift(rec);
    const ok = Saved.gravar(lista);
    renderSaved();
    if (!ok) toast(tr("toast.salvarCheio"));
  } catch (e) { /* salvar nunca pode derrubar a análise */ }
}

/** Reabre uma análise guardada — sem encostar no motor. */
function abrirSalva(id) {
  const rec = Saved.ler().find((r) => r && r.id === id);
  if (!rec || !rec.pgn) { toast(tr("toast.analiseNaoAchada")); return; }
  if (!loadPgn(rec.pgn)) return;
  const pos = (rec.pos || []).map(arrParaPos);
  const pm = (rec.pm || []).map(arrParaPm);
  if (pos.length !== S.fens.length) { toast(tr("toast.analiseNaoBate")); return; }
  S.positions = pos;
  /* Devolve a variação às posições de erro (registro antigo não tem: o treino
     funciona igual, só fica sem a continuação — ver renderTreino). */
  const pvt = rec.pvt || {};
  Object.keys(pvt).forEach((k) => {
    const p = S.positions[+k];
    if (p) p.pv = String(pvt[k]).split(" ").filter(Boolean);
  });
  if (rec.us) S.usuario = rec.us;
  S.perMove = pm.slice(0, S.moves.length);
  while (S.perMove.length < S.moves.length) S.perMove.push(null);
  S.accuracy = rec.acc && (rec.acc.w != null || rec.acc.b != null) ? rec.acc : null;
  renderPlayers(); renderMoves(); renderBoard(); renderEvalBar(); renderEngineTab();
  renderReport(); showTab("report");
  toast(tr("toast.analiseRestaurada"));
}

function renderSaved() {
  const box = $("savedList"), hint = $("savedHint");
  if (!box) return;
  if (!Saved.disponivel()) {
    box.innerHTML = "";
    if (hint) hint.textContent = tr("salvas.bloqueado");
    return;
  }
  const lista = Saved.ler();
  if (!lista.length) {
    box.innerHTML = "";
    if (hint) hint.textContent = tr("salvas.vazio");
    return;
  }
  if (hint) hint.textContent = tr("salvas.contagem", { n: Saved.MAX });
  const apagar = esc(tr("salvas.apagar"));
  box.innerHTML = lista.map((r) => {
    const m = r.meta || {};
    const acc = fmtPct(r.acc && r.acc.w != null ? r.acc.w : null, 1) + " / " +
                fmtPct(r.acc && r.acc.b != null ? r.acc.b : null, 1);
    const quando = fmtData(m.data) || tr("salvas.semData");
    return `<div class="saved"><button data-open="${esc(r.id)}">
        <div><b>${esc(nomeLado(m.w, "w"))}</b> ${m.we ? "(" + esc(m.we) + ")" : ""} vs <b>${esc(nomeLado(m.b, "b"))}</b> ${m.be ? "(" + esc(m.be) + ")" : ""}</div>
        <div class="meta">${esc(m.res || "*")} · ${esc(quando)} · ${esc(tr("salvas.precisao", { v: acc }))}</div>
      </button><button class="del" data-del="${esc(r.id)}" title="${esc(tr("salvas.apagar.dica"))}" aria-label="${esc(tr("salvas.apagar.aria"))}">${apagar}</button></div>`;
  }).join("");
  box.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => abrirSalva(b.dataset.open)));
  box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    const ok = Saved.apagar(b.dataset.del);
    renderSaved();
    toast(tr(ok ? "toast.analiseApagada" : "toast.naoApagou"));
  }));
}

/* ============================================================
   Treino — "Aprenda com seus erros"
   ------------------------------------------------------------
   A fila são os Erros e as Capivaradas da partida, na ordem em que
   aconteceram. Nada aqui recalcula nada: a classificação, a perda e o
   melhor lance saem prontos da análise (S.perMove / S.positions).

   O tabuleiro é reaproveitado como está. O treino se apoia no mesmo
   S.explore do modo exploração — é o que já faz o clique casa a casa
   funcionar, o que tira as setas do melhor lance da tela (o gabarito!)
   e o que garante que S.moves/S.positions/S.perMove não sejam tocados.
   Sair do treino é jogar S.treino fora e voltar ao lance de origem.

   A continuação da variação vem de S.positions[i].pv. As análises salvas
   não guardam pv — menos, agora, nas posições desta fila (ver salvarAnalise).
   Registro antigo, sem pv, não quebra: o exercício acontece igual e o
   painel explica que a linha não veio. Não reanalisamos sob demanda de
   propósito: seria a única parte do app que acorda o motor sozinha, para
   um comentário — quem quiser a linha tem o botão da aba Motor.
   ============================================================ */
S.treino = null;                 // {fila, k, res, fase, linha, …} enquanto dura

const TREINO_PV = 6;             // meios-lances da continuação (guardados e mostrados)
const TREINO_PERDA = 10;         // perda mínima de chance de vitória para entrar na fila
const TREINO_RITMO = 900;        // ms entre os lances da continuação
const TREINO_DESFAZ = 620;       // ms que o lance errado fica na tela antes de voltar


/** Índices dos lances que entram no treino. `lado` limita a um dos jogadores. */
function filaDeErros(lado) {
  const out = [];
  S.perMove.forEach((pm, i) => {
    if (!pm || (pm.cls !== "erro" && pm.cls !== "capivarada")) return;
    if (!(pm.loss >= TREINO_PERDA)) return;
    if (lado && S.moves[i].color !== lado) return;
    if (!S.positions[i] || !S.positions[i].best) return;
    out.push(i);
  });
  return out;
}

/** Variação das posições da fila, compacta, para o registro salvo. */
function pvDoTreino() {
  const out = {};
  for (const i of filaDeErros(null)) {          // os dois lados: a perspectiva pode mudar
    const p = S.positions[i];
    if (p && p.pv && p.pv.length > 1) out[i] = p.pv.slice(0, TREINO_PV).join(" ");
  }
  return out;
}

function abaAtiva() {
  const b = document.querySelector(".tabs button.on");
  return b ? b.dataset.tab : "report";
}

/* ---------- entrar e sair ---------- */
function treinoIniciar(fila) {
  const lado = ladoDoUsuario(S.headers);
  const f = fila && fila.length ? fila.slice() : filaDeErros(lado);
  if (!f.length) { toast(tr("treino.vazio")); return; }
  pararPlay();
  if (!S.analyzing) Engine.stop();
  const volta = (S.treino && S.treino.volta) ||
                { ply: S.ply, flipped: S.flipped, aba: abaAtiva() };
  treinoPararLinha();
  S.treino = { fila: f, k: 0, lado, res: {}, fase: "pergunta", tentativas: 0,
               dica: false, errado: null, certo: "", linha: [], passo: 0,
               timer: null, travado: false, desfazer: false, volta };
  $("panelTrain").style.display = "";
  const pm = document.querySelector(".panel-main");
  if (pm) pm.style.display = "none";
  treinoPosicao();
}

function treinoSair() {
  const t = S.treino;
  if (!t) return;
  treinoPararLinha();
  S.treino = null;
  S.explore = null; S.exploreEval = null; S.sel = null;
  S.flipped = t.volta.flipped;
  S.ply = Math.max(0, Math.min(S.moves.length, t.volta.ply));
  $("panelTrain").style.display = "none";
  const pm = document.querySelector(".panel-main");
  if (pm) pm.style.display = "";
  renderPlayers(); renderBoard(); renderEvalBar(); renderEngineTab();
  highlightMove(); drawGraph();
  showTab(t.volta.aba);
}
$("btnTrainExit").onclick = treinoSair;

/* ---------- um item da fila ---------- */
function treinoPosicao() {
  const t = S.treino;
  if (!t) return;
  treinoPararLinha();
  const i = t.fila[t.k];
  t.fase = "pergunta"; t.tentativas = 0; t.dica = false;
  t.errado = null; t.certo = ""; t.linha = []; t.passo = 0;
  t.travado = false; t.desfazer = false;
  S.ply = i;
  S.sel = null;
  S.explore = { chess: new Chess(S.fens[i]), base: i };
  S.exploreEval = null;
  S.flipped = S.moves[i].color === "b";        // sempre do ponto de vista de quem joga
  renderPlayers(); renderBoard(); renderEvalBar();
  renderTreino();
}

function treinoPararLinha() {
  const t = S.treino;
  if (t && t.timer) { clearTimeout(t.timer); t.timer = null; }
}

/** Tira da tela o lance errado que ainda estiver posto. */
function treinoDesfazerErrado() {
  const t = S.treino;
  if (!t || !t.desfazer) return;
  try { S.explore.chess.undo(); } catch (e) {}
  t.desfazer = false; t.travado = false;
  treinoPararLinha();
}

/* ---------- a jogada do usuário ---------- */
function treinoJogada(mv) {
  const t = S.treino;
  if (!t || t.travado) return;
  if (t.fase !== "pergunta" && t.fase !== "errou") return;
  treinoDesfazerErrado();
  const i = t.fila[t.k];
  const best = String((S.positions[i] || {}).best || "");
  const uci = mv.from + mv.to + (mv.promotion || "");
  const acertou = !!best && uci.slice(0, 4) === best.slice(0, 4) &&
                  (!best[4] || best[4] === (mv.promotion || "q"));
  let feito = null;
  try { feito = S.explore.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" }); }
  catch (e) {}
  if (!feito) return;
  S.sel = null;
  somDoLance(feito.san);

  if (acertou) {
    t.res[i] = (t.dica || t.tentativas > 0) ? "dica" : "primeira";
    t.fase = "acertou";
    t.certo = feito.san;
    treinoMontarLinha();
    renderBoard();
    treinoTocar(1);                     // a continuação segue de onde ele parou
    return;
  }
  t.tentativas++;
  t.errado = { san: feito.san, uci };
  t.fase = "errou";
  t.travado = true; t.desfazer = true;
  renderBoard(); renderTreino();
  t.timer = setTimeout(() => {
    if (S.treino !== t) return;
    treinoDesfazerErrado();
    renderBoard();
  }, TREINO_DESFAZ);
}

function treinoTentarDeNovo() {
  const t = S.treino;
  if (!t) return;
  treinoDesfazerErrado();
  t.fase = "pergunta"; t.errado = null;
  renderBoard(); renderTreino();
}

function treinoRevelar() {
  const t = S.treino;
  if (!t || t.fase === "acertou" || t.fase === "resposta") return;
  treinoDesfazerErrado();
  const i = t.fila[t.k];
  t.res[i] = "resposta";
  t.fase = "resposta";
  treinoMontarLinha();
  t.certo = t.linha.length ? t.linha[0].san : "";
  renderBoard();
  treinoTocar(0);                       // aqui até o lance certo é mostrado
}

function treinoProximo() {
  const t = S.treino;
  if (!t) return;
  treinoPararLinha();
  if (t.k + 1 >= t.fila.length) { t.fase = "resumo"; renderTreino(); return; }
  t.k++;
  treinoPosicao();
}

/* ---------- a continuação ----------
   A linha começa exatamente no lance certo, para casar com o que já está
   no tabuleiro. Se o melhor lance do motor não abrir a pv (acontece quando
   o bestmove vem de uma iteração posterior à última pv), sobra só ele. */
function treinoMontarLinha() {
  const t = S.treino, i = t.fila[t.k];
  const pos = S.positions[i] || {};
  let ucis = (pos.pv || []).slice(0, TREINO_PV);
  if (!ucis.length || ucis[0].slice(0, 4) !== String(pos.best || "").slice(0, 4))
    ucis = pos.best ? [pos.best] : [];
  t.linha = uciLineToSan(S.fens[i], ucis, TREINO_PV);
  t.passo = 0;
}

/** Anda a continuação sozinho, um meio-lance por vez, com o texto junto. */
function treinoTocar(k) {
  const t = S.treino;
  if (!t) return;
  t.passo = Math.min(k, t.linha.length);
  renderTreino();
  if (k >= t.linha.length) { t.timer = null; return; }
  t.timer = setTimeout(() => {
    if (S.treino !== t) return;
    const m = t.linha[k];
    let feito = null;
    try {
      feito = S.explore.chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4),
                                     promotion: m.uci[4] || "q" });
    } catch (e) {}
    if (!feito) { t.timer = null; return; }
    S.sel = null;
    somDoLance(feito.san);
    renderBoard();
    treinoTocar(k + 1);
  }, TREINO_RITMO);
}

/* ---------- painel ---------- */
/** Nome da peça que faz o melhor lance — a dica não diz a casa. */
function pecaDaDica(i) {
  const pos = S.positions[i] || {};
  try {
    const p = new Chess(S.fens[i]).get(String(pos.best || "").slice(0, 2));
    if (p) return tr("peca." + p.type);
  } catch (e) {}
  return "";
}

function treinoLinhaHtml() {
  const t = S.treino;
  if (!t.linha.length) return "";
  let html = "", primeiro = true;
  t.linha.forEach((m, k) => {
    if (m.color === "w") html += `<b>${m.num}.</b> `;
    else if (primeiro) html += `<b>${m.num}…</b> `;
    html += `<span class="${k < t.passo ? "on" : ""}">${esc(m.san)}</span> `;
    primeiro = false;
  });
  return `<div class="train-line">${html}</div>`;
}

function renderTreino() {
  const t = S.treino;
  if (!t) return;
  const body = $("trainBody");

  if (t.fase === "resumo") {
    const c = { primeira: 0, dica: 0, resposta: 0 };
    t.fila.forEach((i) => { if (c[t.res[i]] != null) c[t.res[i]]++; });
    const faltaram = t.fila.filter((i) => t.res[i] !== "primeira");
    $("trainCount").textContent = tr("treino.resumo.titulo");
    $("trainBar").style.width = "100%";
    body.innerHTML = `<div class="train-sum">
        <div class="v">${c.primeira}</div><div>${esc(tr("treino.resumo.primeira"))}</div>
        <div class="v">${c.dica}</div><div>${esc(tr("treino.resumo.dica"))}</div>
        <div class="v">${c.resposta}</div><div>${esc(tr("treino.resumo.resposta"))}</div>
      </div>
      <div class="train-row">
        ${faltaram.length ? `<button class="btn grow" id="btnTrainRedo">${esc(tr("treino.refazer"))}</button>` : ""}
        <button class="btn primary grow" id="btnTrainDone">${esc(tr("treino.voltar"))}</button>
      </div>`;
    if ($("btnTrainRedo")) $("btnTrainRedo").onclick = () => treinoIniciar(faltaram);
    if ($("btnTrainDone")) $("btnTrainDone").onclick = treinoSair;
    return;
  }

  const i = t.fila[t.k];
  const mv = S.moves[i], pm = S.perMove[i] || {}, pronto = t.fase === "acertou" || t.fase === "resposta";
  const meu = !!(t.lado && mv.color === t.lado);
  const perda = (pm.loss || 0).toFixed(0);

  $("trainCount").textContent = tr("treino.contagem", { k: t.k + 1, n: t.fila.length });
  $("trainBar").style.width = Math.round(((t.k + (pronto ? 1 : 0)) / t.fila.length) * 100) + "%";

  let html = `<div class="train-when">${pm.cls ? icon(pm.cls, 14, true) : ""}
      <span>${esc(tr("treino.lanceN", { n: mv.num }))}</span>
      ${pm.cls ? "<span>·</span><span>" + esc(clsNome(pm.cls)) + "</span>" : ""}</div>
    <div class="train-q">
      <p>${esc(tr(meu ? "treino.jogou.eu" : "treino.jogou." + mv.color, { san: mv.san, n: perda }))}</p>
      <p class="train-ask">${esc(tr(meu ? "treino.turno.eu" : "treino.turno." + mv.color))}</p>
    </div>`;

  if (t.fase === "errou" && t.errado) {
    let msg = tr("treino.errou", { san: t.errado.san });
    if (t.errado.uci.slice(0, 4) === mv.uci.slice(0, 4))
      msg += " " + tr(meu ? "treino.errouCusto.eu" : "treino.errouCusto.outro", { n: perda });
    else
      msg += " " + tr("treino.errouSemCusto");
    html += `<div class="train-note bad">${esc(msg)}</div>`;
  }
  if (t.dica && !pronto) {
    const peca = pecaDaDica(i);
    if (peca) html += `<p class="hint" style="margin-top:10px">${esc(tr("treino.dicaPeca", { peca }))}</p>`;
  }
  if (pronto) {
    html += `<div class="train-note good">${esc(tr(t.fase === "acertou" ? "treino.acertou" : "treino.eraEsse",
                                                   { san: t.certo }))}</div>`;
    if (t.linha.length > 1)
      html += `<p class="hint" style="margin-top:11px">${esc(tr("treino.porque"))}</p>` + treinoLinhaHtml();
    else
      html += `<p class="hint" style="margin-top:11px">${esc(tr("treino.semLinha"))}</p>`;
  }

  html += '<div class="train-row">';
  if (pronto) {
    const ultimo = t.k + 1 >= t.fila.length;
    html += `<button class="btn primary grow" id="btnTrainNext">${esc(tr(ultimo ? "treino.verResumo" : "treino.proximo"))}</button>`;
  } else {
    if (t.fase === "errou")
      html += `<button class="btn grow" id="btnTrainRetry">${esc(tr("treino.tentarDeNovo"))}</button>`;
    if (!t.dica)
      html += `<button class="btn grow" id="btnTrainHint">${esc(tr("treino.dica"))}</button>`;
    html += `<button class="btn grow" id="btnTrainShow">${esc(tr("treino.resposta"))}</button>`;
  }
  html += "</div>";

  body.innerHTML = html;
  if ($("btnTrainRetry")) $("btnTrainRetry").onclick = treinoTentarDeNovo;
  if ($("btnTrainHint"))  $("btnTrainHint").onclick  = () => { t.dica = true; renderTreino(); };
  if ($("btnTrainShow"))  $("btnTrainShow").onclick  = treinoRevelar;
  if ($("btnTrainNext"))  $("btnTrainNext").onclick  = treinoProximo;
}

/* ============================================================
   Exportar — PGN comentado e imagem do relatório
   ============================================================ */

/** Baixa um Blob sem biblioteca externa. */
function baixarBlob(blob, nome) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 2000);
    return true;
  } catch (e) { toast(tr("toast.semDownload")); return false; }
}
function nomeArquivo(ext) {
  const m = metaDaPartida();
  const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "partida";
  const d = (m.data || "").replace(/\./g, "-").replace(/\?/g, "") || "";
  return ["plyscope", slug(m.w), "vs", slug(m.b), d].filter(Boolean).join("-") + "." + ext;
}

/* ---------- PGN comentado ----------
   NAG (Numeric Annotation Glyph) do padrão PGN, o mesmo dialeto que
   Lichess, Chess.com e SCID leem:
     brilhante  → $3  (!!  lance muito bom)
     excelente  → $1  (!   lance bom)
     melhor / ótimo / bom → sem NAG (nada a sinalizar; o selo vai no texto)
     forçado    → $7  (lance forçado, único legal)
     impreciso  → $6  (?!  lance duvidoso)
     erro       → $2  (?   lance ruim)
     capivarada → $4  (??  lance muito ruim)
   Cada lance leva ainda um comentário com a avaliação no formato do
   Lichess: { [%eval 1.24] Impreciso — perdeu 7% de chance de vitória }
   ------------------------------------------------------------------ */
const NAG = {
  brilhante: "$3", excelente: "$1", melhor: "", otimo: "", bom: "",
  forcado: "$7", impreciso: "$6", erro: "$2", capivarada: "$4",
};
function evalTag(p) {
  if (!p || p.mateEnd) return null;              // mate no tabuleiro: não há o que avaliar
  if (p.mate != null) return "#" + p.mate;       // #5 / #-3, POV brancas
  if (p.cp == null) return null;
  return (p.cp / 100).toFixed(2);                // 1.24 / -0.50, como o Lichess grava
}
function semChaves(s) { return String(s).replace(/[{}]/g, ""); }

/* O comentário segue o idioma ativo; o [%eval] e o SAN não, que são notação. */
function comentarioDoLance(i) {
  const pm = S.perMove[i];
  if (!pm) return "";
  let txt = clsNome(pm.cls);
  if (pm.loss >= 1) txt += tr("pgn.perdeu", { n: Math.round(pm.loss) });
  const posB = S.positions[i];
  if ((pm.cls === "impreciso" || pm.cls === "erro" || pm.cls === "capivarada") && posB && posB.best) {
    const alt = uciLineToSan(S.fens[i], [posB.best], 1)[0];
    if (alt && alt.san !== S.moves[i].san) txt += tr("pgn.melhorEra", { san: alt.san });
  }
  const tag = evalTag(S.positions[i + 1]);
  return "{ " + (tag ? "[%eval " + tag + "] " : "") + semChaves(txt) + " }";
}

/** Quebra o texto dos lances em linhas de no máximo `larg` colunas.
    O trecho [%eval x] nunca é partido: há leitor que só entende a marca
    inteira numa linha só. */
function quebrarLinhas(txt, larg) {
  const SEP = "\u0001";
  const tokens = txt.replace(/\[%eval ([^\]]*)\]/g, (_, v) => "[%eval" + SEP + v + "]")
    .split(/\s+/).filter(Boolean).map((t) => t.split(SEP).join(" "));
  const linhas = [];
  let l = "";
  for (const t of tokens) {
    if (!l) l = t;
    else if (l.length + 1 + t.length <= larg) l += " " + t;
    else { linhas.push(l); l = t; }
  }
  if (l) linhas.push(l);
  return linhas.join("\n");
}

function pgnComentado() {
  if (!S.moves.length) return "";
  const h = Object.assign({}, S.headers);
  const roster = { Event: "?", Site: "?", Date: "????.??.??", Round: "?",
                   White: "?", Black: "?", Result: "*" };
  const tag = (k, v) => '[' + k + ' "' + String(v).replace(/["\\]/g, "") + '"]\n';
  let out = "";
  for (const k in roster) out += tag(k, h[k] || roster[k]);
  for (const k of Object.keys(h)) {
    if (k in roster || k === "Annotator") continue;
    out += tag(k, h[k]);
  }
  out += tag("Annotator", "Plyscope");
  out += "\n";

  let mt = "";
  S.moves.forEach((m, i) => {
    mt += (m.color === "w" ? m.num + ". " : m.num + "... ") + m.san;
    const pm = S.perMove[i];
    if (pm && NAG[pm.cls]) mt += " " + NAG[pm.cls];
    const c = comentarioDoLance(i);
    if (c) mt += " " + c;
    mt += " ";
  });
  mt += h.Result || "*";
  return out + quebrarLinhas(mt, 80) + "\n";
}

function exportarPgn() {
  if (!S.moves.length) { toast(tr("toast.semPartida")); return; }
  const txt = pgnComentado();
  try {
    const blob = new Blob([txt], { type: "application/x-chess-pgn;charset=utf-8" });
    if (baixarBlob(blob, nomeArquivo("pgn"))) toast(tr("toast.pgnBaixado"));
  } catch (e) { toast(tr("toast.semArquivo")); }
}

/* ---------- imagem do relatório (canvas puro) ---------- */
const IMG = { bg: "#101215", card: "#1b1f25", line: "#282d35", hair: "#1f242a",
              tx: "#e8eaed", tx2: "#a4abb4", tx3: "#767d87", accent: "#9081da",
              gbg: "#14171b", gw: "#dcd8cf", gmid: "#3b424b" };
const IMG_FONT = '"Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif';
const IMG_MONO = 'ui-monospace,Consolas,"Courier New",monospace';

function retangulo(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function cortar(g, txt, max) {
  let s = String(txt == null ? "" : txt);
  if (g.measureText(s).width <= max) return s;
  while (s.length > 1 && g.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}
function graficoNaImagem(g, x, y, w, h) {
  g.save();
  g.fillStyle = IMG.gbg; retangulo(g, x, y, w, h, 7); g.fill();
  g.clip();
  const n = S.positions.length;
  const X = (i) => x + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const Y = (p) => y + h - (p / 100) * h;
  g.beginPath(); g.moveTo(x, y + h);
  for (let i = 0; i < n; i++) g.lineTo(X(i), Y(S.positions[i] ? winPct(scoreToCp(S.positions[i])) : 50));
  g.lineTo(x + w, y + h); g.closePath();
  g.fillStyle = IMG.gw; g.fill();
  g.strokeStyle = IMG.gmid; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
  S.perMove.forEach((pm, i) => {
    if (!pm || pm.loss < 10 || !S.positions[i + 1]) return;
    g.beginPath(); g.arc(X(i + 1), Y(winPct(scoreToCp(S.positions[i + 1]))), 4.5, 0, 7);
    g.fillStyle = CLS[pm.cls].cor; g.fill();
  });
  g.restore();
  g.strokeStyle = IMG.line; g.lineWidth = 1;
  retangulo(g, x + .5, y + .5, w - 1, h - 1, 7); g.stroke();
}

function desenharRelatorio(cv) {
  const counts = { w: {}, b: {} };
  S.perMove.forEach((pm, i) => {
    if (!pm) return;
    const c = S.moves[i].color;
    counts[c][pm.cls] = (counts[c][pm.cls] || 0) + 1;
  });
  const linhas = CLS_ORDER.filter((k) => (counts.w[k] || 0) || (counts.b[k] || 0));

  const W = 860, pad = 38;
  const yHead = 36, hHead = 76;
  const yAcc = yHead + hHead, hAcc = 104;
  const yGraph = yAcc + hAcc + 20, hGraph = 168;
  const yCap = yGraph + hGraph + 22;
  const yRows = yCap + 18, hRow = 31;
  const yFoot = yRows + linhas.length * hRow + 30;
  const H = yFoot + 34;

  const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));   // nitidez em retina
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const g = cv.getContext && cv.getContext("2d");
  if (!g) return null;
  g.scale(dpr, dpr);
  g.textBaseline = "alphabetic";

  // fundo opaco: PNG nunca sai transparente
  g.fillStyle = IMG.bg; g.fillRect(0, 0, W, H);

  /* --- cabeçalho: marca + partida --- */
  g.save();
  g.translate(pad, yHead);
  g.strokeStyle = IMG.tx3; g.lineWidth = 2.2;
  g.beginPath(); g.arc(17, 17, 13.5, 0, 7); g.stroke();
  g.fillStyle = IMG.tx; g.fillRect(10, 17, 7, 7);
  g.fillStyle = IMG.accent; g.fillRect(17, 10, 7, 7);
  g.restore();
  g.fillStyle = IMG.tx;
  g.font = '700 25px ' + IMG_FONT;
  g.fillText("Plyscope", pad + 44, yHead + 20);
  g.fillStyle = IMG.tx3;
  g.font = '400 12.5px ' + IMG_FONT;
  g.fillText(tr("img.tagline"), pad + 44, yHead + 38);

  const m = metaDaPartida();
  g.textAlign = "right";
  g.fillStyle = IMG.tx2;
  g.font = '600 14px ' + IMG_MONO;
  g.fillText(cortar(g, m.res || "*", 260), W - pad, yHead + 18);
  g.fillStyle = IMG.tx3;
  g.font = '400 12px ' + IMG_FONT;
  g.fillText(cortar(g, [m.ev, fmtData(m.data)].filter(Boolean).join(" · ") || tr("img.semData"), 300), W - pad, yHead + 37);
  g.textAlign = "left";

  g.strokeStyle = IMG.hair; g.lineWidth = 1;
  g.beginPath(); g.moveTo(pad, yHead + 56.5); g.lineTo(W - pad, yHead + 56.5); g.stroke();

  /* --- precisão dos dois lados --- */
  const cw = (W - pad * 2 - 14) / 2;
  [["w", nomeLado(m.w, "w"), m.we, pad], ["b", nomeLado(m.b, "b"), m.be, pad + cw + 14]].forEach(([lado, nome, elo, x]) => {
    g.fillStyle = IMG.card; retangulo(g, x, yAcc, cw, hAcc, 8); g.fill();
    g.strokeStyle = IMG.line; g.lineWidth = 1;
    retangulo(g, x + .5, yAcc + .5, cw - 1, hAcc - 1, 8); g.stroke();
    g.fillStyle = lado === "w" ? "#e9e6df" : "#2b3037";
    retangulo(g, x + 16, yAcc + 19, 11, 11, 3); g.fill();
    if (lado === "b") { g.strokeStyle = "#4a515b"; retangulo(g, x + 16.5, yAcc + 19.5, 10, 10, 3); g.stroke(); }
    g.fillStyle = IMG.tx;
    g.font = '600 15px ' + IMG_FONT;
    g.fillText(cortar(g, nome + (elo ? "  (" + elo + ")" : ""), cw - 46), x + 34, yAcc + 29);
    const v = fmtNum(S.accuracy ? S.accuracy[lado] : null, 1);
    g.fillStyle = IMG.tx;
    g.font = '600 40px ' + IMG_MONO;
    g.fillText(v, x + 16, yAcc + 78);
    const largV = g.measureText(v).width;
    g.fillStyle = IMG.tx3;
    g.font = '400 12.5px ' + IMG_FONT;
    g.fillText(tr("rel.precisao"), x + 16 + largV + 11, yAcc + 78);
  });

  /* --- gráfico de vantagem --- */
  graficoNaImagem(g, pad, yGraph, W - pad * 2, hGraph);
  g.fillStyle = IMG.tx3;
  g.font = '400 12px ' + IMG_FONT;
  g.fillText(tr("img.grafico", { n: S.moves.length }), pad, yCap + 4);

  /* --- contagem por tipo de lance, nas cores dos selos --- */
  const meio = W / 2;
  linhas.forEach((k, i) => {
    const y = yRows + i * hRow;
    g.strokeStyle = IMG.hair; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, y + .5); g.lineTo(W - pad, y + .5); g.stroke();
    const yb = y + 21;
    g.fillStyle = CLS[k].cor;
    g.textAlign = "right";
    g.font = '600 15px ' + IMG_MONO;
    g.fillText(String(counts.w[k] || 0), meio - 96, yb);
    g.textAlign = "left";
    g.fillText(String(counts.b[k] || 0), meio + 96, yb);
    // selo + nome centralizados entre as duas contagens
    g.font = '500 14px ' + IMG_FONT;
    const rotulo = clsNome(k);
    const larg = g.measureText(rotulo).width + 17;
    const xIni = meio - larg / 2;
    g.beginPath(); g.arc(xIni + 5, yb - 5, 5, 0, 7); g.fill();
    g.fillStyle = IMG.tx2;
    g.fillText(rotulo, xIni + 17, yb);
  });
  g.strokeStyle = IMG.hair; g.lineWidth = 1;
  g.beginPath(); g.moveTo(pad, yRows + linhas.length * hRow + .5); g.lineTo(W - pad, yRows + linhas.length * hRow + .5); g.stroke();

  /* --- rodapé --- */
  g.fillStyle = IMG.accent;
  g.font = '700 13px ' + IMG_FONT;
  g.fillText("Plyscope", pad, yFoot + 14);
  const largMarca = g.measureText("Plyscope").width;
  g.fillStyle = IMG.tx3;
  g.font = '400 12.5px ' + IMG_FONT;
  g.fillText(tr("img.rodape"), pad + largMarca + 7, yFoot + 14);
  return cv;
}

function exportarImagem() {
  if (!S.accuracy) { toast(tr("toast.analisePrimeiro")); return; }
  let cv;
  try { cv = document.createElement("canvas"); } catch (e) { cv = null; }
  if (!cv || typeof cv.getContext !== "function" || !cv.getContext("2d")) {
    toast(tr("toast.semCanvas"));
    return;
  }
  try {
    if (!desenharRelatorio(cv)) { toast(tr("toast.semDesenho")); return; }
  } catch (e) { toast(tr("toast.semDesenho")); return; }
  const nome = nomeArquivo("png");
  if (typeof cv.toBlob === "function") {
    cv.toBlob((b) => {
      if (b) { if (baixarBlob(b, nome)) toast(tr("toast.imagemBaixada")); }
      else toast(tr("toast.semPng"));
    }, "image/png");
  } else if (typeof cv.toDataURL === "function") {
    try {
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png"); a.download = nome;
      a.click(); toast(tr("toast.imagemBaixada"));
    } catch (e) { toast(tr("toast.semPng")); }
  } else toast(tr("toast.semPng"));
}

$("btnExportPgn").onclick = exportarPgn;
$("btnExportPng").onclick = exportarImagem;

/* ============================================================
   Troca de idioma
   ------------------------------------------------------------
   O dicionário reetiqueta sozinho tudo que está marcado no HTML
   (data-i18n & cia). O que o app escreve por innerHTML — relatório,
   lista de lances, lista de partidas, análises salvas, linhas do
   motor, legenda — não tem como ser reetiquetado: é redesenhado,
   a partir do MESMO estado. Nada em S é tocado aqui, então a
   análise aberta continua exatamente onde estava: mesma precisão,
   mesmos selos, mesmo lance selecionado, mesma variação explorada.
   ============================================================ */
function aplicarIdioma() {
  // a abertura vem da base ECO, que fala as duas línguas
  if (S.fens.length > 1) S.abertura = aberturaDeFens(S.fens, S.headers);

  $("btnAnalyze").textContent = tr(S.analyzing ? "btn.parar" : "btn.analisar");
  atualizarPlay();                     // o title do play depende de estar tocando
  pintarStatus();                      // painel de progresso, se estiver na tela
  pintarBusca();                       // dica embaixo da busca online
  notaMotor();                         // versão, modo e threads
  renderLegend();
  renderPlayers(); renderMoves(); renderBoard(); renderEvalBar();
  renderEngineTab(); renderReportBody(); renderSaved();
  renderTreino();                      // o treino redesenha no meio do exercício
  if (listaPartidas) showGameList(listaPartidas);

  for (const b of [$("btnLangPt"), $("btnLangEn")]) {
    const ativo = b.dataset.lang === I18.idioma();
    b.classList.toggle("on", ativo);
    b.setAttribute("aria-pressed", ativo ? "true" : "false");
  }

  // o apoio aponta para a seção do README na língua ativa
  const apoio = $("linkApoio");
  if (apoio) {
    apoio.href = I18.idioma() === "en"
      ? "https://github.com/Jhonysganzerla/plyscope/blob/main/README.en.md#-support-the-project"
      : "https://github.com/Jhonysganzerla/plyscope#-apoie-o-projeto";
  }
}
$("btnLangPt").onclick = () => I18.definir("pt");
$("btnLangEn").onclick = () => I18.definir("en");
I18.aoTrocar(aplicarIdioma);

/* ---------- início ---------- */
aplicarIdioma();
Engine.boot().catch(() => {});
})();
