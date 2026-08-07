#!/usr/bin/env node
/*
 * Plyscope - servidor local minimo em Node.js.
 * Plano B do plyscope.sh para maquinas sem Python 3 (macOS sem as Command Line
 * Tools, por exemplo). Mesmos cabecalhos do servidor.ps1 e do servidor.py.
 *
 *   node tools/servidor.js [porta] [--sem-navegador]
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORTAS = [];
for (let p = 8123; p <= 8140; p++) PORTAS.push(p);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".pgn": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

/* Le o Content-Security-Policy do _headers gerado pelo src/build.py — a mesma
 * politica que a hospedagem manda. Uma copia so, para local e publicado nao
 * poderem divergir. */
function leCsp() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, "_headers"), "utf8");
    for (const linha of txt.split("\n")) {
      const t = linha.trim();
      if (t.toLowerCase().startsWith("content-security-policy:")) {
        return t.slice(t.indexOf(":") + 1).trim();
      }
    }
  } catch (e) {}
  return null;
}
const CSP = leCsp();

const args = process.argv.slice(2);
const abrir = args.indexOf("--sem-navegador") < 0 && process.env.PLYSCOPE_SEM_NAVEGADOR !== "1";
const pedida = args.filter((a) => /^\d+$/.test(a)).map(Number);
const portas = pedida.length ? pedida : PORTAS;

const srv = http.createServer((req, res) => {
  // COOP + COEP: ligam o cross-origin isolation (SharedArrayBuffer -> multi-thread).
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (CSP) res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Cache-Control", "no-cache");

  let rel;
  try { rel = decodeURIComponent(req.url.split("?")[0].split("#")[0]); }
  catch (e) { rel = "/"; }
  rel = rel.replace(/^\/+/, "");
  if (!rel) rel = "index.html";

  const full = path.resolve(ROOT, rel);
  if (full !== ROOT && full.indexOf(ROOT + path.sep) !== 0) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403");
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - nao encontrado: " + rel);
      return;
    }
    const tipo = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": tipo, "Content-Length": buf.length });
    res.end(buf);
  });
});

let i = 0;
function tentar() {
  if (i >= portas.length) {
    console.error("Nao consegui abrir uma porta local (" + portas[0] + "-" + portas[portas.length - 1] + ").");
    process.exit(1);
  }
  srv.listen(portas[i++], "127.0.0.1");
}
srv.on("error", (e) => {
  if (e.code === "EADDRINUSE" || e.code === "EACCES") tentar();
  else { console.error(String(e.message || e)); process.exit(1); }
});
srv.on("listening", () => {
  const url = "http://localhost:" + srv.address().port + "/index.html";
  console.log("");
  console.log("  Plyscope rodando em " + url);
  console.log("  Deixe este terminal aberto enquanto usar o app.");
  console.log("  Para encerrar: Ctrl+C.");
  if (!CSP) {
    console.log("");
    console.log("  AVISO: nao achei o Content-Security-Policy no _headers.");
    console.log("  Rode 'python3 src/build.py'; sem isso o app roda aqui com regras");
    console.log("  mais frouxas do que no site publicado.");
  }
  console.log("");
  if (!abrir) return;
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "explorer" : "xdg-open";
  try { spawn(cmd, [url], { stdio: "ignore", detached: true }).unref(); } catch (e) {}
});
tentar();
