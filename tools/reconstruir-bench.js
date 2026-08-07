#!/usr/bin/env node
/* ============================================================
   Remonta o bench.json completo a partir de bench/casos.json.

       node tools/reconstruir-bench.js

   POR QUE ISSO EXISTE: o repositório versiona só os fatos de cada
   caso (posição, lance, veredito do chess.com) — ver bench/PROVENIENCIA.md.
   O PGN de cada partida é público e volta pela API do Chess.com,
   então qualquer pessoa remonta o conjunto e refaz a medição.

   Saída: tools/saida/bench.json, no formato que o calibrar.js espera.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CASOS = path.join(ROOT, "bench", "casos.json");
const OUT = process.env.PLYSCOPE_OUT || path.join(__dirname, "saida");
const DESTINO = path.join(OUT, "bench.json");
const PAUSA = 1200;   // a API pública do Chess.com não gosta de rajada

const casos = JSON.parse(fs.readFileSync(CASOS, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

/* o mesmo gameId aparece uma vez por caso; baixa cada partida só uma vez */
const cache = new Map();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pgnDaPartida(gameId) {
  if (cache.has(gameId)) return cache.get(gameId);
  const url = "https://www.chess.com/callback/live/game/" + gameId;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " em " + url);
  const j = await r.json();
  const pgn = (j.game && (j.game.pgn || j.game.moveList)) || null;
  if (!pgn || !String(pgn).startsWith("[Event")) {
    throw new Error("resposta sem PGN para " + gameId +
      " — a API do Chess.com pode ter mudado; veja bench/PROVENIENCIA.md");
  }
  cache.set(gameId, pgn);
  await espera(PAUSA);
  return pgn;
}

(async () => {
  const saida = [];
  let erros = 0;
  for (let i = 0; i < casos.length; i++) {
    const c = casos[i];
    try {
      saida.push({ ...c, pgn: await pgnDaPartida(c.gameId), results: { chesscom: c.chesscom } });
    } catch (e) {
      erros++;
      console.error("  falhou:", c.gameId, "-", e.message);
    }
    if ((i + 1) % 10 === 0) process.stderr.write("  " + (i + 1) + "/" + casos.length + "\n");
  }
  fs.writeFileSync(DESTINO, JSON.stringify(saida));
  console.log("\n" + saida.length + " de " + casos.length + " casos remontados em " + DESTINO);
  if (erros) {
    console.log(erros + " falharam (partida removida do Chess.com, ou API mudou).");
    console.log("A medição continua válida com os que vieram — diga quantos ao publicar o número.");
  }
  console.log("\nAgora:  cd tools && PLYSCOPE_BENCH=" + DESTINO + " node calibrar.js recall 16");
  process.exit(erros === casos.length ? 1 : 0);
})();
