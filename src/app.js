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
const { CLS, CLS_ORDER } = window.PlyClassify;
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
  cursor: "e1",     // casa sob o cursor de teclado (ver "camada acessível")
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

   ESTE motor é o INTERATIVO: uma busca por vez, a da posição que está na
   tela ("Analisar esta posição a fundo", avaliação ao explorar variação).
   A análise da partida inteira roda no Pool logo abaixo, em outros workers,
   justamente para não ficar atrás desta fila.
   ============================================================ */
const ENGINE_MT = "engine/stockfish-lite.js";
const ENGINE_ST = "engine/stockfish-lite-single.js";
const ENGINE_NOME = "Stockfish 17.1 lite";

/* Tabela de transposição do motor interativo. Ele é um só e faz buscas
   longas (o "a fundo" é `go infinite`), então 128 MB se pagam. */
const HASH_INTERATIVO = 128;

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
          this.post("setoption name Hash value " + HASH_INTERATIVO);
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

/* ============================================================
   Pool de motores — a análise da partida inteira

   POR QUE: analisar uma partida é avaliar ~80 posições INDEPENDENTES.
   Uma não precisa do resultado da outra, então isto é trabalho
   embaraçosamente paralelo: N motores de 1 thread avaliam N posições ao
   mesmo tempo e o tempo cai por um fator próximo de N.

   MEDIDO (tools/bench-pool.js, partida da Ópera, prof. 12, com o
   Stockfish de engine/): 6,3 s num motor → 4,4 s num pool de 4, com as
   mesmas 41–42 buscas dos dois lados. São 1,43× numa máquina cuja escala
   de verdade é 1,57× — quatro buscas iguais em paralelo ali levam 1686 ms
   contra 664 ms de uma sozinha. Ou seja: o pool está pegando ~90% do que
   esta máquina tem para dar, e o teto é do hardware, não do escalonador.

   ------------------------------------------------------------
   POOL × MULTI-THREAD — a decisão está aqui, de propósito

   Numa página cross-origin isolated o app sobe o Stockfish multi-thread
   (Lazy SMP). N motores de 1 thread e 1 motor de N threads brigam pela
   mesma CPU, então é um ou outro. Para o LOTE o pool ganha em dois pontos:

     1. Escala. O Lazy SMP acelera bem abaixo de linear: cada thread nova
        rende menos que a anterior, porque todas procuram a MESMA árvore e
        se atropelam. Posições independentes não têm esse teto — cada
        motor tem sua própria árvore e sua própria tabela.
     2. Determinismo. O resultado do SMP a uma profundidade fixa depende
        de QUEM chegou primeiro na tabela compartilhada: rodar duas vezes
        a mesma partida pode dar dois relatórios. Um motor de 1 thread com
        tabela própria é uma função pura da posição — e um relatório de
        precisão que muda sozinho a cada clique não é um relatório.

   Por isso o LOTE é sempre N × 1 thread (ENGINE_ST), mesmo em página
   isolada. O motor INTERATIVO continua multi-thread quando dá: ali é uma
   posição só, o SMP é o único jeito de ir mais fundo, e o número na tela
   é exploratório — não entra em conta nenhuma.

   ------------------------------------------------------------
   MEMÓRIA — a conta, por motor do lote

     .wasm + NNUE embutida ....... ~7 MB
     pilha/heap do runtime ....... ~4 MB
     tabela de transposição ...... 16 MB   (HASH_LOTE)
                                   -------
                                   ~27 MB  (MB_POR_MOTOR)

   Buscas curtas de posição isolada (prof. 12–24, alguns milhões de nós)
   não enchem 16 MB de tabela; 128 MB por worker seria memória parada.
   8 × 128 MB = 1 GB é inaceitável num navegador; 6 × 27 MB = 162 MB cabe.
   O motor interativo continua com seus 128 MB — ele é UM. Pior caso do
   app: 128 + 162 ≈ 290 MB.
   ============================================================ */
const HASH_LOTE = 16;
const MB_POR_MOTOR = 27;          // 7 (wasm) + 4 (runtime) + 16 (hash)
const POOL_TETO = 6;              // além disto a banda de memória segura o ganho
const POOL_MIN_NUCLEOS = 4;       // 2 núcleos: um é da interface, sobra 1 — não é pool
const POOL_ORCAMENTO_MB = 192;    // teto de memória do lote inteiro
const POOL_OCIOSO_MS = 120000;    // devolve a memória quando ninguém analisa

/* AQUECIMENTO — quando o pool NÃO compensa.
   Subir N motores custa tempo: são N × 7 MB de wasm para buscar (o
   navegador guarda os bytes em cache, mas cada worker compila o seu) e N
   handshakes UCI. Medido em tools/bench-pool.js, nesta máquina, do clique
   até a primeira busca: 0,4 s com um motor, 0,7–0,8 s com quatro — os
   motores sobem em PARALELO, então o custo de parede é o de um só mais a
   disputa por CPU, não quatro vezes o de um.

   Esses ~0,4 s a mais só se pagam se houver busca suficiente pela frente.
   Medido (motor único → pool de 4, mesmo número de buscas nos dois):
       25 posições, prof. 12 ....  2,6 s → 3,1 s   PIOR (o aquecimento come o ganho)
       34 posições, prof. 12 ....  6,3 s → 4,4 s   1,43× — e a máquina de
                                                   medição só dá 1,57×
   Ou seja: o que decide não é o número de posições, é o TRABALHO — e o
   trabalho cresce rápido com a profundidade (a mesma partida de 25
   posições passou de 2,6 s para 8,2 s ao ir de prof. 12 para 16, ~3× a
   cada 4 plies). A conta abaixo mede o lote em "posições na prof. 12".

   Um aviso para quem for repetir a medida: comparar o tempo de parede em
   profundidades altas engana, porque a 2ª passada não analisa as mesmas
   posições nos dois modos — a lista de suspeitos sai da 1ª passada, e
   alguns centipeões de diferença mudam quem entra nela. Só vale comparar
   rodadas com o mesmo número de buscas (o bench imprime esse número). */
const POOL_TRABALHO_MIN = 32;
function trabalhoDoLote(posicoes, prof) { return posicoes * Math.pow(3, (prof - 12) / 4); }

const Pool = {
  motores: [], n: 0, abortado: false, morto: false, motivo: "", ocioso: null,

  /** Quantos motores subir nesta máquina, para este lote. 0 = não usar pool. */
  planeja(posicoes, prof) {
    if (typeof Worker !== "function") { this.motivo = "sem Worker"; return 0; }
    if (posicoes != null && trabalhoDoLote(posicoes, prof || 12) < POOL_TRABALHO_MIN) {
      this.motivo = "lote curto demais para pagar o aquecimento"; return 0;
    }
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const nucleos = Number(nav.hardwareConcurrency || 0);
    if (!(nucleos >= POOL_MIN_NUCLEOS)) { this.motivo = "poucos núcleos"; return 0; }
    // deviceMemory vem em GB e só existe no Chromium; quando existe, ela manda.
    const gb = Number(nav.deviceMemory || 0);
    let orcamento = POOL_ORCAMENTO_MB;
    if (gb > 0 && gb < 4) orcamento = Math.min(orcamento, 64);   // 2 GB de RAM: no máximo 2 motores
    const n = Math.min(POOL_TETO,
                       nucleos - 1,                              // um núcleo para a interface
                       Math.floor(orcamento / MB_POR_MOTOR));
    if (n < 2) { this.motivo = "memória curta"; return 0; }
    this.motivo = "";
    return n;
  },
  memoriaMb(n) { return (n || this.n) * MB_POR_MOTOR; },

  /** Sobe os N motores EM PARALELO: o custo de parede é o de um só, não N. */
  async boot(n) {
    if (this.ocioso) { clearTimeout(this.ocioso); this.ocioso = null; }
    if (this.motores.length === n && !this.morto) return true;
    this.derruba();
    this.morto = false;
    const lista = [];
    for (let k = 0; k < n; k++) lista.push(this.sobe(k));
    try { await Promise.all(lista); }
    catch (e) { this.derruba(); throw e; }
    this.n = n;
    return true;
  },
  sobe(k) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(ENGINE_ST); } catch (e) { reject(e); return; }
      const m = {
        w, ouvintes: new Set(), pendente: null, id: k, vivo: true,
        post: (c) => w.postMessage(c),
        on: (f) => m.ouvintes.add(f),
        off: (f) => m.ouvintes.delete(f),
      };
      this.motores[k] = m;
      let pronto = false;
      const prazo = setTimeout(() => {
        if (!pronto) { m.vivo = false; reject(new Error("tempo esgotado no motor " + k + " do lote")); }
      }, 90000);
      w.onerror = (e) => { clearTimeout(prazo); this.perdeu(m); if (!pronto) reject(e); };
      w.onmessage = (ev) => {
        const line = typeof ev.data === "string" ? ev.data : (ev.data && ev.data.data) || "";
        if (!line) return;
        if (line === "uciok") { m.post("setoption name Hash value " + HASH_LOTE); m.post("isready"); }
        if (line === "readyok" && !pronto) { pronto = true; clearTimeout(prazo); resolve(m); }
        m.ouvintes.forEach((fn) => fn(line));
      };
      m.post("uci");
    });
  },
  /** Um worker morreu no meio do lote: o pool inteiro é dado por perdido. */
  perdeu(m) {
    m.vivo = false;
    this.morto = true;
    this.motores.forEach((x) => { if (x && x.pendente) x.pendente(); });
  },
  derruba() {
    this.motores.forEach((m) => { if (m && m.w) { try { m.w.terminate(); } catch (e) {} } });
    this.motores = []; this.n = 0;
    if (this.ocioso) { clearTimeout(this.ocioso); this.ocioso = null; }
  },
  /** Para TODAS as buscas em voo. Nenhum worker fica queimando CPU sozinho. */
  parar() {
    this.abortado = true;
    this.motores.forEach((m) => { if (m && m.vivo) { try { m.post("stop"); } catch (e) {} } });
  },
  /** Sem análise à vista, devolve os ~160 MB para o navegador. */
  agendaDescarte() {
    if (!this.motores.length) return;
    if (this.ocioso) clearTimeout(this.ocioso);
    this.ocioso = setTimeout(() => { this.ocioso = null; this.derruba(); notaMotor(); }, POOL_OCIOSO_MS);
  },

  /* ------------------------------------------------------------
     O LOTE, e o que exatamente é garantido

     (1) O RESULTADO NÃO DEPENDE DA ORDEM DE CHEGADA. As respostas
         voltam fora de ordem — o motor 3 pode terminar a posição 27
         antes de o motor 0 terminar a posição 4. Nada disso importa:
         `aoTerminar` grava em S.positions[tarefa.idx], o índice que a
         TAREFA carrega. E como JavaScript é single-thread, o main
         thread atende uma resposta por vez: não há duas mãos escrevendo
         no mesmo array.

     (2) O LOTE É REPRODUTÍVEL. A repartição é FIXA (Pool.faixaDe: uma
         conta de índice), não uma fila dinâmica: quem termina primeiro
         não muda o que os outros vão pegar. Cada motor é 1 thread com
         tabela própria, então a sequência que ele vê é sempre a mesma.
         Mesma partida + mesma profundidade + mesmo N ⇒ os mesmos
         números, rodando quantas vezes for. (Medido em tools/bench-pool.js:
         três análises seguidas da Ópera num pool de 4 dão 96,1/86,1 nas
         três, com as mesmas 41 buscas.)
         Uma fila dinâmica com roubo de trabalho renderia um pouco mais,
         mas quem pega qual posição passaria a depender do relógio, e aí
         a precisão da partida mudaria de um clique para o outro.

     (3) O QUE *NÃO* É GARANTIDO, e por que não pode ser: a avaliação
         que o Stockfish dá a uma posição numa PROFUNDIDADE FIXA depende
         do que já está na tabela de transposição. Um motor só, andando
         a partida em ordem, chega a cada posição com a tabela quente da
         posição anterior; N motores repartem essa história de outro
         jeito. Isso desloca alguns centipeões — na Ópera, 96,2/83,0 no
         motor único contra 96,1/86,1 no pool de 4. Não é ruído do
         escalonador (as três rodadas batem): é a mesma diferença que
         aparece entre duas profundidades vizinhas.
         Por isso o caminho do motor único continua intacto, byte a
         byte, e é ele que a suíte de ponta a ponta congela.
     ------------------------------------------------------------ */
  /* Índices que cabem ao motor k: INTERCALADO de um em um — k, k+n, k+2n…
     A repartição é uma conta de índice, não um sorteio: não depende de
     quem terminou antes, e por isso o lote inteiro é reprodutível.

     As duas alternativas foram medidas na partida da Ópera (prof. 12,
     custo real de cada posição; "desbalanço" é o quanto o motor mais
     carregado passa da média, e é ele que dita o tempo de parede):

                            N=3    N=4    N=6
       tiras contíguas      48%    55%    49%     (0..10, 11..21, …)
       bloco-cíclico de 4   17%    39%    52%
       intercalado 1 a 1    23%     7%    28%     ← este

     Tiras contíguas aproveitam melhor a tabela de transposição (posições
     vizinhas dividem quase toda a árvore), e isso vale ~9% do tempo de
     busca — medido: a mesma partida com a tabela limpa a cada posição
     passa de 8,1 s para 8,8 s. Só que a abertura custa MUITO mais que o
     final, então quem fica com o pedaço do começo segura todo mundo: 55%
     de desbalanço come bem mais que os 9% que a tabela devolve. */
  faixaDe(k, n, quantas) {
    const idx = [];
    for (let t = k; t < quantas; t += n) idx.push(t);
    return idx;
  },
  async lote(tarefas, aoTerminar) {
    this.abortado = false;
    const n = this.motores.length;
    if (!n) throw Object.assign(new Error("pool vazio"), { poolMorto: true });
    this.motores.forEach((m) => m.post("ucinewgame"));
    const faixa = async (m, k) => {
      for (const t of this.faixaDe(k, n, tarefas.length)) {
        if (this.abortado || this.morto || !m.vivo) return;
        const tk = tarefas[t];
        const res = await buscaEm(m, tk.fen, { depth: tk.depth, multipv: tk.multipv || 2 });
        if (this.abortado || this.morto || !m.vivo) return;
        aoTerminar(tk, res);
      }
    };
    await Promise.all(this.motores.map(faixa));
    if (this.morto) throw Object.assign(new Error("motor do lote caiu"), { poolMorto: true });
  },
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
  // com o pool de pé, diz em quantos motores a partida é analisada e a que custo
  if (Pool.motores.length) {
    modo += " · " + tr("motor.lote", { n: Pool.motores.length, mb: Pool.memoriaMb() });
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

/** Roda UM motor (o interativo ou um do pool) numa posição.
    Retorna linhas (POV de quem joga). O motor só precisa saber
    post/on/off — é o mesmo diálogo UCI dos dois lados. */
function buscaEm(motor, fen, opts) {
  return new Promise((resolve) => {
    const store = {};
    let done = false;
    const fim = (bm) => {
      if (done) return;
      done = true;
      motor.off(handler);
      motor.pendente = null;
      resolve({ lines: store, bestmove: bm });
    };
    const handler = (line) => {
      if (line.startsWith("info ") && line.indexOf(" pv ") > 0) {
        const r = parseInfo(line, store);
        if (r && opts.onUpdate) opts.onUpdate(store);
      } else if (line.startsWith("bestmove")) {
        const bm = line.split(" ")[1];
        fim(bm === "(none)" ? null : bm);
      }
    };
    // se o worker morrer, o pool chama isto e a promessa não fica pendurada
    motor.pendente = () => fim(null);
    motor.on(handler);
    motor.post("setoption name MultiPV value " + (opts.multipv || 1));
    motor.post("position fen " + fen);
    motor.post(opts.infinite ? "go infinite" : "go depth " + opts.depth);
  });
}

/** Roda o motor interativo numa posição. */
function engineGo(fen, opts) { return buscaEm(Engine, fen, opts); }

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
const { scoreToCp, winPct, winFor, moveAccuracy, gameAccuracy } = window.PlyClassify;

function fmtEval(s) {             // texto curto, POV brancas
  if (s == null) return "–";
  if (s.mateEnd) return s.cp > 0 ? "1-0" : "0-1";
  if (s.mate != null) return (s.mate > 0 ? "M" : "-M") + Math.abs(s.mate);
  if (s.cp == null) return "–";
  const v = s.cp / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

/* ---------- SEE, sacrifício e limiares do Brilhante: src/classify.js ---------- */
const { PV_VAL, sacrificeInfo, ofertaAnterior, BRI, classifyMove } = window.PlyClassify;

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

/* A resposta do motor vira uma entrada de S.positions. A mesma conversão
   serve às duas passadas e aos dois modos (pool ou motor único) — é aqui,
   num lugar só, que o sinal do motor (POV de quem joga) vira POV brancas. */
function entradaDeBusca(fen, res, profPedida) {
  const stm = new Chess(fen).turn();
  const sign = stm === "w" ? 1 : -1;
  const l1 = res.lines[1], l2 = res.lines[2];
  const e = {
    cp: l1 && l1.cp != null ? l1.cp * sign : null,
    mate: l1 && l1.mate != null ? l1.mate * sign : null,
    best: res.bestmove || (l1 && l1.pv[0]) || null,
    pv: (l1 && l1.pv) || [],
    depth: l1 ? l1.depth : profPedida,
  };
  if (l2) {
    const s2 = { cp: l2.cp != null ? l2.cp * sign : null, mate: l2.mate != null ? l2.mate * sign : null };
    e.secondWin = winFor(stm, s2);
    e.second = s2;
  }
  return e;
}

/* Chegou a posição i: fecha o veredito dos lances que já dá para fechar.
   Um lance precisa da posição de ANTES e da de DEPOIS, então cada posição
   nova pode liberar o lance i-1 e o lance i. No pool as posições chegam
   fora de ordem, e é por isso que a regra é de vizinhança e não
   "chegou i, classifica i-1". Com um motor só o efeito é idêntico ao de
   antes: quando i chega, i-1 fecha e i espera. */
function fechaLancesPerto(i) {
  for (let j = i - 1; j <= i; j++) {
    if (j < 0 || j >= S.moves.length || S.perMove[j]) continue;
    if (S.positions[j] && S.positions[j + 1]) { S.perMove[j] = classify(j); renderMoveRow(j); }
  }
}

/* Roda uma lista de tarefas [{idx, fen, depth}] e entrega cada resultado
   por `aoTerminar`. No pool ficam N buscas em voo ao mesmo tempo; sem
   pool é a fila de sempre, uma por vez, no motor interativo. */
async function rodaTarefas(tarefas, comPool, aoTerminar) {
  if (comPool) return Pool.lote(tarefas, aoTerminar);
  for (const t of tarefas) {
    if (S.cancel) return;
    const res = await engineRun(t.fen, { depth: t.depth, multipv: 2 });
    aoTerminar(t, res);
  }
}

async function analyzeGame() {
  // "Parar análise": derruba as buscas em voo dos DOIS modos, na hora
  if (S.analyzing) { S.cancel = true; Pool.parar(); return; }
  if (!S.moves.length) return;
  const depth = +$("depth").value;
  S.analyzing = true; S.cancel = false;
  $("btnAnalyze").textContent = tr("btn.parar");
  $("panelStatus").style.display = "";
  status("status.iniciando", null, "status.carregando", null);

  const total = S.fens.length;

  /* --- modo do lote: pool de N motores ou o motor único de sempre ---
     A escolha é feita UMA vez, antes da primeira busca, e não muda no
     meio da análise: metade da partida num modo e metade no outro daria
     um relatório sem pé nem cabeça. */
  let n = Pool.planeja(total, depth);
  if (n) {
    status("status.iniciando", null, "status.carregandoLote", { n, mb: Pool.memoriaMb(n) });
    try { await Pool.boot(n); }
    catch (e) { Pool.derruba(); n = 0; }        // degradação: segue no motor único
  }
  let usaPool = n > 0;
  notaMotor();

  // com o pool cuidando do lote, o motor interativo sobe em paralelo e fica
  // à disposição de quem quiser explorar uma variação no meio da análise
  if (usaPool) Engine.boot().catch(() => {});

  if (!usaPool) {
    try { await Engine.boot(); }
    catch (e) { toast(tr("motor.naoIniciou")); finishAnalysis(); return; }
    Engine.post("ucinewgame");
  }

  let t0 = performance.now();
  let feitos = 0;

  async function passadas(comPool) {
    S.positions = new Array(total).fill(null);
    S.perMove = new Array(S.moves.length).fill(null);
    t0 = performance.now();
    feitos = 0;

    const progresso = () => {
      const pct = Math.round((feitos / total) * 100);
      $("statusPct").textContent = pct + "%";
      $("progBar").style.width = pct + "%";
      const el = (performance.now() - t0) / 1000;
      const eta = feitos > 3 ? Math.round((el / feitos) * (total - feitos)) : null;
      status("status.lance", { i: Math.min(feitos, S.moves.length), n: S.moves.length },
             eta != null ? "status.restante" : null, () => ({ t: fmtSeg(eta) }));
      if (feitos % 3 === 0) { renderEvalBar(); }
    };

    /* --- 1ª passada: toda posição, na profundidade escolhida --- */
    const tarefas = [];
    for (let i = 0; i < total; i++) {
      const tmp = new Chess(S.fens[i]);
      if (tmp.isGameOver()) {           // fim de jogo não precisa de motor
        const stm = tmp.turn();
        S.positions[i] = tmp.isCheckmate()
          ? { cp: stm === "w" ? -12000 : 12000, mate: null, best: null, pv: [], mateEnd: true }
          : { cp: 0, mate: null, best: null, pv: [] };
        feitos++;
      } else {
        tarefas.push({ idx: i, fen: S.fens[i], depth });
      }
    }
    for (let i = 0; i < total; i++) if (S.positions[i]) fechaLancesPerto(i);
    progresso();                     // zera a barra (importante quando é a 2ª tentativa)

    await rodaTarefas(tarefas, comPool, (t, res) => {
      S.positions[t.idx] = entradaDeBusca(t.fen, res, t.depth);   // índice da TAREFA, não a ordem de chegada
      feitos++;
      fechaLancesPerto(t.idx);
      progresso();
    });
    if (S.cancel) return;

    /* --- 2ª passada: confere os momentos suspeitos com mais profundidade --- */
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
    const tarefas2 = [];
    for (const idx of list) {
      if (new Chess(S.fens[idx]).isGameOver()) continue;
      tarefas2.push({ idx, fen: S.fens[idx], depth: d2 });
    }
    let k = 0;
    const progresso2 = () => {
      const pct = tarefas2.length ? Math.round((k / tarefas2.length) * 100) : 100;
      status("status.conferindo", { k, n: tarefas2.length }, "status.profundidade", { d: d2 });
      $("progBar").style.width = pct + "%";
      $("statusPct").textContent = pct + "%";
    };
    progresso2();
    await rodaTarefas(tarefas2, comPool, (t, res) => {
      k++;
      if (res.lines[1]) S.positions[t.idx] = entradaDeBusca(t.fen, res, t.depth);
      progresso2();
    });
    if (S.cancel) return;
    for (let i = 0; i < S.moves.length; i++) S.perMove[i] = classify(i);
  }

  /* Degradação: se um motor do lote morrer no meio, o pool inteiro é
     descartado e a análise recomeça no motor único. Custa o tempo já
     gasto, mas o usuário não fica sem análise — e o resultado é o do
     caminho de sempre, não um híbrido. */
  try {
    await passadas(usaPool);
  } catch (e) {
    if (!usaPool || !e || !e.poolMorto || S.cancel) {
      toast(tr("motor.naoIniciou"));
      $("panelStatus").style.display = "none";
      finishAnalysis();
      renderMoves(); renderBoard(); renderEvalBar(); renderEngineTab();
      return;
    }
    Pool.derruba(); usaPool = false; notaMotor();
    toast(tr("motor.loteCaiu"));
    status("status.iniciando", null, "status.carregando", null);
    try { await Engine.boot(); }
    catch (e2) { toast(tr("motor.naoIniciou")); finishAnalysis(); return; }
    Engine.post("ucinewgame");
    try { await passadas(false); }
    catch (e2) {
      toast(tr("motor.naoIniciou"));
      $("panelStatus").style.display = "none";
      finishAnalysis();
      renderMoves(); renderBoard(); renderEvalBar(); renderEngineTab();
      return;
    }
  }

  if (!S.cancel) {
    S.accuracy = gameAccuracy(S.positions, S.moves, S.perMove);
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
  Pool.abortado = false;
  // o pool fica quente para a próxima partida e devolve a memória se ninguém vier
  Pool.agendaDescarte();
  $("btnAnalyze").textContent = tr("btn.analisar");
}

/** A análise em lote está ocupando o motor interativo? Só quando não há pool. */
function loteNoInterativo() { return S.analyzing && !Pool.motores.length; }

/* ============================================================
   Região viva — o que o leitor de tela ouve sem ir procurar
   ------------------------------------------------------------
   UM nó (#live, role=status, aria-live=polite, aria-atomic) e uma regra:
   uma frase por ação do usuário.

   O QUE PASSA POR AQUI: o lance ao navegar a partida ("Lance 12, Brancas:
   Nf3, Melhor"), a seleção e o cancelamento no tabuleiro, o lance jogado no
   modo exploração e o veredito de cada exercício do treino.

   O QUE NÃO PASSA, DE PROPÓSITO: a casa sob o cursor. Ela é o rótulo da
   célula que acabou de receber foco, e o leitor de tela já lê o rótulo do
   que ganha foco — repetir aqui seria anunciar duas vezes a mesma coisa.
   Pelo mesmo motivo a frase idêntica à anterior é engolida: reatribuir o
   mesmo texto troca o nó e faria o leitor reler o que ele acabou de ler.
   ============================================================ */
let ultimoAviso = "";
function anunciar(txt) {
  const el = $("live");
  if (!el) return;
  const s = String(txt == null ? "" : txt).replace(/\s+/g, " ").trim();
  if (s === ultimoAviso) return;
  ultimoAviso = s;
  el.textContent = s;
}

/** Frase de um lance da partida: serve à região viva e ao rótulo do botão
    do lance na lista — os dois dizem exatamente a mesma coisa. */
function anuncioDoLance(ply) {
  if (!ply) return tr("aviso.inicio");
  const m = S.moves[ply - 1];
  if (!m) return "";
  const pm = S.perMove[ply - 1];
  const d = { n: m.num, cor: tr(m.color === "w" ? "lado.brancas" : "lado.pretas"), san: m.san };
  if (pm && pm.cls) { d.cls = clsNome(pm.cls); return tr("lance.aria.cls", d); }
  return tr("lance.aria", d);
}

/** Depois de um innerHTML, o foco que estava dentro cairia no <body> e o
    teclado perderia o lugar. Devolve ao mesmo botão (pelo id) ou ao primeiro. */
function devolverFoco(caixa, id) {
  if (!caixa) return;
  const mesmo = id ? $(id) : null;
  const alvo = mesmo && caixa.contains(mesmo) ? mesmo : caixa.querySelector("button");
  if (alvo && alvo.focus) alvo.focus();
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

  // e o mesmo tabuleiro, dito com palavras (ver "camada acessível")
  atualizarGrade(ch);
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

/* ============================================================
   Camada acessível do tabuleiro — cursor de casa por teclado
   ------------------------------------------------------------
   POR QUE UMA GRADE HTML POR CIMA DO SVG, e não papéis ARIA nos <rect>:
   o desenho do tabuleiro é um SVG que muda a cada lance, e ARIA dentro de
   SVG é a parte mais irregular do suporte de leitor de tela (foco em
   elementos SVG e leitura de <title> variam de navegador para navegador).
   O que é uniforme desde sempre é HTML com papel, rótulo e tabindex. Então:
   o SVG fica aria-hidden e desenha; 64 <div> transparentes por cima têm o
   papel, o rótulo e o foco. Nenhum pixel muda de lugar — a grade é 8×8 de
   frações iguais sobre um quadro quadrado, as células caem sobre as casas.

   POR QUE role="grid" E NÃO role="application":
   "application" desliga o modo de leitura do leitor de tela para tudo que
   está dentro e passa a responsabilidade de CADA tecla para o app — inclusive
   as que o usuário já tem no dedo para ler a tela. "grid" é o que o tabuleiro
   é: uma matriz navegável de células. O leitor já sabe anunciar linha, coluna
   e conteúdo, já entende tabindex rotativo (uma parada de tabulação para a
   grade inteira, setas por dentro), e o usuário não precisa aprender nada
   novo. É o padrão "layout grid" do APG, o mesmo de uma agenda mensal.

   O CURSOR: S.cursor guarda uma CASA (e4), não uma posição na tela. Girar o
   tabuleiro move o cursor junto com a casa, que é o que o olho espera. Quem
   converte casa ↔ posição visual é o mesmo par sqXY/xyToSq do desenho, então
   girado ou não, as setas andam para onde apontam.
   ============================================================ */
const gradeCels = [];                     // 64 células, em ordem VISUAL

/** Casa na posição visual i (0 = canto superior esquerdo do que está na tela). */
function casaDoIndice(i) {
  const c = i % 8, r = (i - c) / 8;
  return xyToSq(c * 100 + 50, r * 100 + 50);
}
/** Posição visual da casa sq. */
function indiceDaCasa(sq) {
  const [x, y] = sqXY(sq);
  return (y / 100) * 8 + x / 100;
}
function destinosDe(ch, sq) {
  try { return ch.moves({ square: sq, verbose: true }).map((m) => m.to); }
  catch (e) { return []; }
}
/** "e4, peão branco" — coordenada primeiro, que é como se fala uma casa.
    A cor vem colada no nome da peça (pc.wp = "peão branco") porque em
    português o adjetivo concorda: torre BRANCA, peão BRANCO. */
function rotuloDaCasa(sq, ch, destinos) {
  const p = ch.get(sq);
  const base = p ? sq + ", " + tr("pc." + p.color + p.type) : tr("casa.vazia", { casa: sq });
  if (S.sel === sq) return tr("casa.selecionada", { base });
  if (destinos && destinos.indexOf(sq) >= 0) return tr("casa.destino", { base });
  return base;
}

function montarGrade() {
  const g = $("boardGrid");
  if (!g || gradeCels.length) return;
  for (let r = 0; r < 8; r++) {
    const linha = document.createElement("div");
    linha.className = "brow";
    linha.setAttribute("role", "row");
    for (let c = 0; c < 8; c++) {
      const cel = document.createElement("div");
      cel.className = "sq";
      cel.setAttribute("role", "gridcell");
      cel.tabIndex = -1;
      cel.dataset.i = r * 8 + c;
      linha.appendChild(cel);
      gradeCels.push(cel);
    }
    g.appendChild(linha);
  }
  g.addEventListener("keydown", teclaNoTabuleiro);
  /* O mouse não muda de dono: a célula só repassa a casa. O preventDefault do
     mousedown impede que o clique roube o foco — quem estava navegando os
     lances com as setas continua navegando os lances depois de clicar. O
     leitor de tela aciona por click sintético, sem mousedown, e chega aqui. */
  g.addEventListener("mousedown", (e) => e.preventDefault());
  g.addEventListener("click", (e) => {
    const cel = e.target.closest && e.target.closest(".sq");
    if (cel) clicarCasa(casaDoIndice(+cel.dataset.i));
  });
}

/** Rótulo e tabindex das 64 células, a cada desenho do tabuleiro. */
function atualizarGrade(ch) {
  if (!gradeCels.length) return;
  if (!/^[a-h][1-8]$/.test(S.cursor)) S.cursor = "e1";
  const destinos = S.sel ? destinosDe(ch, S.sel) : null;
  const iCursor = indiceDaCasa(S.cursor);
  const ativo = document.activeElement;
  const tinhaFoco = !!(ativo && ativo.classList && ativo.classList.contains("sq"));
  for (let i = 0; i < 64; i++) {
    const cel = gradeCels[i], sq = casaDoIndice(i);
    cel.dataset.sq = sq;
    const rot = rotuloDaCasa(sq, ch, destinos);
    if (cel.getAttribute("aria-label") !== rot) cel.setAttribute("aria-label", rot);
    const t = i === iCursor ? 0 : -1;
    if (cel.tabIndex !== t) cel.tabIndex = t;
  }
  // girar o tabuleiro com o cursor em cena: o foco segue a casa, não o pixel
  if (tinhaFoco && gradeCels[iCursor] !== ativo) gradeCels[iCursor].focus();
}

function focarCursor() {
  const cel = gradeCels[indiceDaCasa(S.cursor)];
  if (cel && cel.focus) cel.focus();
}
function moverCursor(i) {
  const sq = casaDoIndice(i);
  if (!sq) return;
  S.cursor = sq;
  for (let k = 0; k < 64; k++) gradeCels[k].tabIndex = k === i ? 0 : -1;
  gradeCels[i].focus();     // o rótulo da casa é anunciado pelo foco, não pela região viva
}

/* As teclas que o tabuleiro consome quando tem o foco. É esta lista que
   resolve o conflito com as setas da navegação de lances: aqui elas movem o
   cursor de casa; em qualquer outro lugar da tela continuam passando lances. */
const TECLAS_DA_GRADE = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
function teclaNoTabuleiro(e) {
  if (!e.key || e.ctrlKey || e.metaKey || e.altKey) return;
  const cel = e.target.closest && e.target.closest(".sq");
  if (!cel) return;
  const i = +cel.dataset.i, c = i % 8, r = (i - c) / 8;
  const d = TECLAS_DA_GRADE[e.key];
  if (d) moverCursor(Math.min(7, Math.max(0, r + d[1])) * 8 + Math.min(7, Math.max(0, c + d[0])));
  else if (e.key === "Home") moverCursor(r * 8);            // padrão de grade:
  else if (e.key === "End") moverCursor(r * 8 + 7);         // extremos da linha
  else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") clicarCasa(casaDoIndice(i));
  else if (e.key === "Escape") {
    if (!S.sel) return;                                     // nada a cancelar: deixa passar
    S.sel = null; renderBoard(); anunciar(tr("aviso.cancelou"));
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

/* ---------- interação (explorar variações) ----------
   Uma função só para o clique do mouse, o clique da célula e o Enter do
   teclado: os três fazem exatamente o mesmo, e é isso que garante que o
   modo exploração e o treino se completem sem mouse. */
function clicarCasa(sq) {
  if (!sq) return;
  S.cursor = sq;
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
  const tinha = S.sel;
  S.sel = p && p.color === ch.turn() ? sq : null;
  renderBoard();
  if (S.sel) {
    const n = destinosDe(ch, S.sel).length;
    anunciar(!n ? tr("aviso.semDestino", { casa: sq })
      : tr(n === 1 ? "aviso.selecionou1" : "aviso.selecionou", { casa: sq, n }));
  } else if (tinha) anunciar(tr("aviso.cancelou"));
}

$("board").addEventListener("click", (ev) => {
  const rect = ev.currentTarget.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 800;
  const y = ((ev.clientY - rect.top) / rect.height) * 800;
  clicarCasa(xyToSq(x, y));
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
  if (feito) anunciar(tr("aviso.jogou", { san: feito.san }));
  renderBoard(); renderEvalBar();
  analyzeCurrent(true);
}
$("btnBackToGame").onclick = () => {
  S.explore = null; S.sel = null; S.exploreEval = null;
  if (!loteNoInterativo()) Engine.stop();
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
  /* a barra é role="img": uma altura não se lê, então o rótulo diz o número.
     Não é região viva de propósito — ela mudaria a cada lance do motor. */
  $("evalbar").setAttribute("aria-label",
    !pos || !txt ? tr("aval.sem")
    : txt === "0.0" ? tr("aval.igual")
    : tr(whiteAhead ? "aval.brancas" : "aval.pretas", { v: txt }));
}

/** Selo do lance. `mudo` tira o <title> de quem já mostra o nome ao lado — e,
    sem título, o selo deixa de ser uma imagem para virar enfeite: role="img"
    sem nome acessível é um elemento que o leitor de tela anuncia vazio. */
function icon(cls, size, mudo) {
  const c = CLS[cls];
  const papel = mudo ? 'aria-hidden="true"' : 'role="img"';
  const titulo = mudo ? "" : `<title>${esc(clsDica(cls))}</title>`;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size||16}" height="${size||16}" ${papel}>${titulo}
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
/* O lance é <button>, não <div>: sempre foi clicável, mas como <div> ficava
   fora da ordem de tabulação e se anunciava como texto. O rótulo acessível
   diz por extenso o que os pixels dizem por símbolo ("Lance 12, Brancas:
   Nf3, Melhor"); o selo colorido continua no <title> do ícone, para o mouse. */
function moveCell(i) {
  const m = S.moves[i], pm = S.perMove[i], pos = S.positions[i + 1];
  const ev = pos ? fmtEval(pos) : "";
  return `<button type="button" class="mv" data-ply="${i + 1}" data-i="${i}"
    aria-label="${esc(anuncioDoLance(i + 1))}">${pm ? icon(pm.cls) : ""}
    <span>${m.san}</span><span class="ev">${ev}</span></button>`;
}
function renderMoveRow(i) {
  const el = document.querySelector('.mv[data-i="' + i + '"]');
  if (!el) return;
  const m = S.moves[i], pm = S.perMove[i], pos = S.positions[i + 1];
  el.innerHTML = `${pm ? icon(pm.cls) : ""}<span>${m.san}</span><span class="ev">${pos ? fmtEval(pos) : ""}</span>`;
  el.setAttribute("aria-label", anuncioDoLance(i + 1));   // a classificação acabou de chegar
}
function highlightMove() {
  document.querySelectorAll(".mv").forEach((el) => {
    const on = +el.dataset.ply === S.ply;
    el.classList.toggle("on", on);
    if (on) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
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
/* Escapa para HTML. As aspas contam: quase todo uso aqui é dentro de atributo
   (title=, aria-label=, data-*=), e sem elas um nome de jogador vindo de PGN ou
   de API de terceiros fecha o atributo e injeta o que quiser. */
function esc(s) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
      moves += `<button type="button" class="pvmove" data-l="${li}" data-k="${k}">${m.san}</button> `;
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

/* análise sob demanda da posição atual (variações / botão "a fundo")
   Ela roda no motor INTERATIVO, que é um worker só dela. Com o pool de
   pé, a partida inteira está sendo analisada em OUTROS workers, então
   não há fila nenhuma para esperar: dá para pedir "a fundo" e navegar
   por variações no meio da análise. Sem pool o lote está usando este
   mesmo motor, e aí a análise sob demanda espera a vez (como antes). */
async function analyzeCurrent(quick) {
  try { await Engine.boot(); } catch (e) { toast(tr("motor.offline")); return; }
  if (loteNoInterativo()) return;
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
  if (!loteNoInterativo()) Engine.stop();           // não deixa busca antiga rodando
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
  /* o mesmo que o som diz por timbre, dito por extenso — inclusive no play
     automático, que sem isto seria um filme mudo para quem não vê a tela */
  anunciar(anuncioDoLance(alvo));
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

/* ---------- atalhos globais ----------
   AS SETAS TÊM DOIS DONOS, e o desempate é o foco — explicitamente:

   • foco numa casa do tabuleiro (role=gridcell) → as setas movem o cursor de
     casa, Enter seleciona/joga, Esc cancela;
   • foco numa aba (role=tab) → as setas trocam de aba (padrão tablist);
   • em qualquer outro lugar → as setas passam os lances, como sempre foi.

   Os dois ouvintes de dentro já chamam stopPropagation; esta lista é a
   garantia escrita de quem manda, e não depende da ordem dos ouvintes.
   Enter e espaço sobre um botão ou link também param aqui: o navegador já
   aciona o elemento, e sem isto o espaço num botão ainda ligava o play. */
const TECLAS_DISPUTADAS = {
  ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
  Home: 1, End: 1, Enter: 1, " ": 1, Spacebar: 1, Escape: 1,
};
function focoDeOutroDono(e) {
  const alvo = e.target;
  if (!alvo || !alvo.closest) return false;
  if (TECLAS_DISPUTADAS[e.key] && alvo.closest('#boardGrid,[role="tablist"]')) return true;
  if ((e.key === "Enter" || e.key === " " || e.key === "Spacebar") &&
      /^(button|a)$/i.test(alvo.tagName || "")) return true;
  return false;
}
document.addEventListener("keydown", (e) => {
  if (!e.key || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/input|textarea|select/i.test(e.target.tagName)) return;
  if (focoDeOutroDono(e)) return;
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
/* ---------- abas: padrão tablist ----------
   Uma parada de tabulação para o conjunto (tabindex rotativo) e as setas
   andando entre as abas, com o painel trocando junto — é o que o leitor de
   tela e o teclado esperam de role=tab desde sempre. aria-selected é o que
   diz "esta é a aba aberta"; a classe .on é só a pintura. */
const abasBtns = () => [...document.querySelectorAll('.tabs [role="tab"]')];
abasBtns().forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(name) {
  abasBtns().forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("on", p.id === "tab-" + name));
  if (name === "report") drawGraph();
}
const barraAbas = document.querySelector(".tabs");
if (barraAbas) barraAbas.addEventListener("keydown", (e) => {
  const bs = abasBtns(), i = bs.indexOf(e.target);
  if (i < 0) return;
  let k;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") k = (i + 1) % bs.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") k = (i - 1 + bs.length) % bs.length;
  else if (e.key === "Home") k = 0;
  else if (e.key === "End") k = bs.length - 1;
  else return;
  e.preventDefault(); e.stopPropagation();
  showTab(bs[k].dataset.tab);
  bs[k].focus();
});
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
  if (!loteNoInterativo()) Engine.stop();
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
  /* o botão que iniciou o treino acabou de ser escondido junto com as abas:
     sem levar o foco, o teclado voltaria para o começo da página. O destino
     é o tabuleiro — o exercício é achar um lance. */
  focarCursor();
}

function treinoSair() {
  const t = S.treino;
  if (!t) return;
  const doTeclado = focoNoTreino();
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
  // o painel que tinha o foco não existe mais: devolve para a aba que reabriu
  if (doTeclado) {
    const aba = document.querySelector('.tabs [data-tab="' + t.volta.aba + '"]');
    if (aba) aba.focus();
  }
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
    anunciar(tr("treino.acertou", { san: feito.san }));   // o veredito, uma vez
    treinoTocar(1);                     // a continuação segue de onde ele parou
    return;
  }
  t.tentativas++;
  t.errado = { san: feito.san, uci };
  t.fase = "errou";
  t.travado = true; t.desfazer = true;
  renderBoard(); renderTreino();
  anunciar(tr("treino.errou", { san: feito.san }));
  t.timer = setTimeout(() => {
    if (S.treino !== t) return;
    treinoDesfazerErrado();
    renderBoard();
  }, TREINO_DESFAZ);
}

/* Quem chegou aqui pelo teclado está com o foco dentro do painel do treino.
   Nos passos em que o botão apertado desaparece ("Dica", "Tentar de novo",
   "Próximo erro"), o lugar certo do foco não é outro botão qualquer — é o
   tabuleiro, que é onde a próxima ação acontece. */
function focoNoTreino() {
  const a = document.activeElement, p = $("panelTrain");
  return !!(a && p && p.contains(a));
}

function treinoTentarDeNovo() {
  const t = S.treino;
  if (!t) return;
  const doTeclado = focoNoTreino();
  treinoDesfazerErrado();
  t.fase = "pergunta"; t.errado = null;
  renderBoard(); renderTreino();
  if (doTeclado) focarCursor();
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
  anunciar(tr("treino.eraEsse", { san: t.certo }));
  treinoTocar(0);                       // aqui até o lance certo é mostrado
}

function treinoProximo() {
  const t = S.treino;
  if (!t) return;
  const doTeclado = focoNoTreino();
  treinoPararLinha();
  if (t.k + 1 >= t.fila.length) { t.fase = "resumo"; renderTreino(); return; }
  t.k++;
  treinoPosicao();
  if (doTeclado) focarCursor();
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
  /* o painel é redesenhado por innerHTML a cada passo; sem isto, quem chegou
     aqui pelo teclado perderia o foco para o <body> a cada Dica ou Próximo */
  const ativo = document.activeElement;
  const eraDentro = !!(ativo && body.contains(ativo));
  const idAntes = eraDentro ? ativo.id : "";

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
    if (eraDentro) devolverFoco(body, idAntes);
    anunciar(tr("treino.resumo.titulo"));
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
  if ($("btnTrainHint"))  $("btnTrainHint").onclick  = () => {
    const doTeclado = focoNoTreino();
    t.dica = true; renderTreino();
    if (doTeclado) focarCursor();       // a dica diz a peça; agora é jogar
  };
  if ($("btnTrainShow"))  $("btnTrainShow").onclick  = treinoRevelar;
  if ($("btnTrainNext"))  $("btnTrainNext").onclick  = treinoProximo;
  if (eraDentro) devolverFoco(body, idAntes);
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
  /* a região viva guarda a última frase dita, na língua de então: trocar de
     idioma não é hora de repetir nada, e sim de esvaziar. */
  anunciar("");

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
montarGrade();          // as 64 células antes do primeiro desenho do tabuleiro
aplicarIdioma();
Engine.boot().catch(() => {});
})();
