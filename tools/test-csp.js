/* Teste da politica de seguranca de conteudo (CSP).
 *
 *   node tools/test-csp.js            (rode DEPOIS de python3 src/build.py)
 *
 * Duas perguntas, que sao as duas maneiras de um CSP dar errado:
 *
 *   1. a politica ainda descreve o conteudo?  Os <script> do index.html sao
 *      liberados por hash SHA-256. Um caractere a mais no app e o hash velho
 *      passa a bloquear TODO o JavaScript da pagina. Aqui os hashes sao
 *      recalculados a partir dos bytes do index.html e conferidos um a um
 *      contra o que o vercel.json e o _headers declaram.
 *
 *   2. a politica esqueceu de algo que o app usa?  As origens que ele contata
 *      com fetch, o caminho do Worker do motor e as URLs data: sao extraidos
 *      do proprio codigo e conferidos contra as diretivas. Se alguem adicionar
 *      uma API nova sem liberar o connect-src, o teste cai aqui e nao em
 *      producao.
 *
 * Ainda sobe o servidor local (Node e Python) para provar que ele manda a
 * mesma politica que a hospedagem. O servidor.ps1 nao roda fora do Windows;
 * dele o teste confere so que le o _headers e manda o cabecalho.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "index.html");

/* ---------- assercoes (mesmo estilo do test.js: uma falha derruba tudo) ---------- */
const ok = [];
const conf = (rot, cond, extra) => {
  ok.push(!!cond);
  console.log(" ", (cond ? "ok  " : "FALHOU ") + rot, extra === undefined ? "" : extra);
  return !!cond;
};
const titulo = (s) => console.log("\n== " + s + " ==");

/* ---------- leitura ---------- */
const htmlBytes = fs.readFileSync(HTML);
const html = htmlBytes.toString("utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const headersTxt = fs.readFileSync(path.join(ROOT, "_headers"), "utf8");

function cspDoVercel() {
  const regra = (vercel.headers || []).find((r) => r.source === "/(.*)");
  const h = regra && regra.headers.find((x) => x.key === "Content-Security-Policy");
  return h ? h.value : null;
}
function cspDoHeaders(txt) {
  const linha = txt.split("\n").map((l) => l.trim())
    .find((l) => /^content-security-policy:/i.test(l));
  return linha ? linha.slice(linha.indexOf(":") + 1).trim() : null;
}

const CSP = cspDoVercel();

/** "script-src 'self' 'x'; img-src data:" -> { "script-src": ["'self'", "'x'"], ... } */
function parseCsp(txt) {
  const d = {};
  for (const parte of String(txt).split(";")) {
    const t = parte.trim();
    if (!t) continue;
    const bits = t.split(/\s+/);
    d[bits[0].toLowerCase()] = bits.slice(1);
  }
  return d;
}
const D = parseCsp(CSP || "");
/** Fonte permitida por `dir`, caindo para o fallback do CSP quando a diretiva falta. */
const permite = (dir, fonte, fallback) => {
  const lista = D[dir] || (fallback && D[fallback]) || D["default-src"] || [];
  return lista.indexOf(fonte) >= 0;
};

/* =====================================================================
   1. A politica descreve o conteudo?
   ===================================================================== */
titulo("hashes dos <script> inline");

// Os mesmos bytes que o navegador vai hashear: corpo cru do <script>, sem
// decodificar. A busca corre sobre a versao latin1 do buffer justamente para
// indice de string e indice de byte serem a mesma coisa — um acento no meio
// do app deslocaria o corte se fosse feito sobre a string UTF-8.
const bin = htmlBytes.toString("latin1");
const RE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
const blocos = [];
for (let m; (m = RE_SCRIPT.exec(bin)); ) {
  const ini = m.index + m[0].indexOf(">") + 1;
  blocos.push(htmlBytes.slice(ini, ini + m[1].length));
}
const calculados = blocos.map(
  (b) => "'sha256-" + crypto.createHash("sha256").update(b).digest("base64") + "'");

conf("o index.html tem blocos <script> inline", blocos.length > 0, blocos.length + " blocos");
conf("nenhum <script src=...> externo (nada para 'self' liberar sem querer)",
  !/<script[^>]*\ssrc=/i.test(html));
conf("o vercel.json declara um Content-Security-Policy", !!CSP);

const declarados = (D["script-src"] || []).filter((s) => s.indexOf("'sha256-") === 0);
conf("a politica declara um hash por bloco", declarados.length === calculados.length,
  declarados.length + " declarados / " + calculados.length + " calculados");
calculados.forEach((h, i) => {
  conf("bloco " + (i + 1) + " confere (" + blocos[i].length + " bytes)",
    declarados[i] === h, declarados[i] === h ? h.slice(0, 24) + "..." : "esperado " + h);
});
const sobrando = declarados.filter((h) => calculados.indexOf(h) < 0);
conf("nenhum hash orfao na politica", sobrando.length === 0, sobrando.join(" "));

titulo("vercel.json x _headers x servidores locais");
conf("_headers repete a mesma politica, caractere por caractere",
  cspDoHeaders(headersTxt) === CSP);
["X-Content-Type-Options", "Referrer-Policy",
 "Cross-Origin-Opener-Policy", "Cross-Origin-Embedder-Policy"].forEach((k) => {
  conf("_headers tambem leva o " + k, headersTxt.indexOf(k + ":") > 0);
});

/* =====================================================================
   2. A politica esqueceu algo que o app usa?
   ===================================================================== */
titulo("o que o app faz x o que a politica permite");

/* --- origens contatadas com fetch --- */
const origens = new Set();
let dinamicos = 0;
for (let m, re = /fetch\(\s*([`'"])([^`'"]*)/g; (m = re.exec(html)); ) {
  const u = m[2];
  if (/^https?:\/\//.test(u)) origens.add(new URL(u).origin);
  else if (!u) dinamicos++;
}
for (let m, re = /fetch\(\s*[A-Za-z_$]/g; (m = re.exec(html)); ) dinamicos++;
conf("achei origens de fetch no codigo", origens.size > 0, [...origens].join(" "));
origens.forEach((o) => {
  conf("connect-src libera " + o, permite("connect-src", o),
    permite("connect-src", o) ? "" : "sem isto a busca de partidas quebra");
});
// o proprio .wasm do motor sobe por XHR/fetch de mesma origem
conf("connect-src libera 'self' (download do .wasm do motor)", permite("connect-src", "'self'"));
conf("connect-src nao e um curinga",
  (D["connect-src"] || []).every((s) => s !== "*" && s !== "https:"),
  (D["connect-src"] || []).join(" "));
conf("as URLs vindas da resposta da API ficam na mesma origem ja liberada",
  origens.has("https://api.chess.com") && dinamicos > 0,
  "fetch(list[k]) usa os arquivos de https://api.chess.com/pub/...");

/* --- Worker do motor --- */
const engines = [...html.matchAll(/const ENGINE_(?:MT|ST)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
conf("achei o caminho do Worker no codigo", engines.length === 2, engines.join(" "));
engines.forEach((p) => {
  const relativo = !/^[a-z]+:/i.test(p) && p.indexOf("//") !== 0;
  conf("o Worker " + p + " e de mesma origem (nem blob:, nem data:, nem CDN)", relativo);
});
conf("worker-src libera 'self'", permite("worker-src", "'self'", "child-src"));
conf("child-src tambem, para o navegador que so entende CSP 2",
  permite("child-src", "'self'"));
conf("script-src libera 'self' (o importScripts que o Stockfish faz no Worker)",
  permite("script-src", "'self'"));

// o loader do Stockfish so recorre a um Blob se o app definir mainScriptUrlOrBlob;
// como ele nao define, os workers de pthread nascem de uma URL de mesma origem.
const engineJs = ["stockfish-lite.js", "stockfish-lite-single.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, "engine", f), "utf8"));
conf("o app nao passa mainScriptUrlOrBlob ao motor (senao seria worker por blob:)",
  html.indexOf("mainScriptUrlOrBlob") < 0);
conf("o loader monta a URL do worker de pthread a partir de self.location",
  engineJs.some((s) => s.indexOf("self.location.origin+self.location.pathname") >= 0));
conf("o loader nao cria Worker a partir de blob:",
  engineJs.every((s) => !/new Worker\(\s*URL\.createObjectURL/.test(s)));

/* --- WebAssembly --- */
conf("script-src tem 'wasm-unsafe-eval' (compilar o Stockfish)",
  permite("script-src", "'wasm-unsafe-eval'"));
conf("...e nao tem 'unsafe-eval' (nao precisamos de eval de JavaScript)",
  !permite("script-src", "'unsafe-eval'"));
conf("...nem 'unsafe-inline' (o ponto todo dos hashes)",
  !permite("script-src", "'unsafe-inline'"));
conf("o app nao usa eval nem new Function", !/[^.\w]eval\(|new Function\(/.test(html));

/* --- data: --- */
conf("o favicon e data:", /<link[^>]+rel="icon"[^>]+href="data:/.test(html));
conf("o CSS tem background-image em data:", html.indexOf('url("data:image/svg+xml') > 0);
conf("img-src libera data:", permite("img-src", "data:"));
conf("img-src nao vira porta de saida (sem http externo)",
  (D["img-src"] || []).every((s) => !/^https?:/.test(s) && s !== "*"),
  (D["img-src"] || []).join(" "));

/* --- CSS inline --- */
const attrsStyle = (html.match(/\sstyle="/g) || []).length;
conf("o HTML gerado usa atributos style=", attrsStyle > 0, attrsStyle + " ocorrencias");
conf("style-src permite CSS inline (o <style> do head e os atributos style=)",
  permite("style-src", "'unsafe-inline'"),
  "com hash em vez disso, o 'unsafe-inline' seria ignorado e os style= parariam");

/* --- o resto, fechado --- */
titulo("o que a politica fecha");
[["default-src", "'none'"], ["base-uri", "'none'"], ["form-action", "'none'"],
 ["object-src", "'none'"], ["frame-ancestors", "'none'"], ["frame-src", "'none'"]]
  .forEach(([dir, val]) => {
    conf(dir + " " + val, (D[dir] || []).length === 1 && D[dir][0] === val,
      (D[dir] || []).join(" "));
  });
conf("o app nao tem <form> (form-action 'none' nao atrapalha nada)",
  !/<form[\s>]/i.test(html));
conf("o app nao tem iframe/object/embed", !/<iframe[\s>]|<object[\s>]|<embed[\s>]/i.test(html));

/* =====================================================================
   3. Os tres servidores locais mandam a mesma politica
   ===================================================================== */
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on("error", rej);
  });
}
function pega(porta, caminho) {
  return new Promise((res) => {
    const req = http.get({ host: "127.0.0.1", port: porta, path: caminho }, (r) => {
      r.resume();
      res({ status: r.statusCode, h: r.headers });
    });
    req.on("error", () => res(null));
    req.setTimeout(4000, () => { req.destroy(); res(null); });
  });
}
async function esperaSubir(porta) {
  for (let i = 0; i < 40; i++) {
    const r = await pega(porta, "/index.html");
    if (r) return r;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}
async function testaServidor(nome, cmd, args) {
  const porta = await portaLivre();
  const p = spawn(cmd, args.concat([String(porta), "--sem-navegador"]),
    { cwd: ROOT, stdio: "ignore", env: { ...process.env, PLYSCOPE_SEM_NAVEGADOR: "1" } });
  try {
    const idx = await esperaSubir(porta);
    if (!conf(nome + " subiu", !!idx)) return;
    conf(nome + ": index.html com o mesmo CSP do vercel.json",
      idx.h["content-security-policy"] === CSP);
    conf(nome + ": index.html como text/html", /text\/html/.test(idx.h["content-type"] || ""));
    conf(nome + ": index.html com COOP+COEP",
      idx.h["cross-origin-opener-policy"] === "same-origin" &&
      idx.h["cross-origin-embedder-policy"] === "require-corp");
    const w = await pega(porta, "/engine/stockfish-lite.wasm");
    conf(nome + ": o .wasm tambem vem com CSP (e a politica do Worker)",
      !!w && w.h["content-security-policy"] === CSP);
    conf(nome + ": o .wasm vem como application/wasm",
      !!w && w.h["content-type"] === "application/wasm");
  } finally {
    p.kill();
  }
}

titulo("servidor.ps1 (Windows) - revisao estatica, nao ha PowerShell aqui");
const ps1 = fs.readFileSync(path.join(ROOT, "servidor.ps1"), "utf8");
conf("le a politica do _headers, em vez de repetir a string",
  /Join-Path \$root "_headers"/.test(ps1) && !/default-src/.test(ps1));
conf("compara a linha certa do _headers", /-like "Content-Security-Policy:\*"/.test(ps1));
conf("manda o cabecalho em toda resposta",
  /Headers\.Add\("Content-Security-Policy", \$csp\)/.test(ps1));
conf("avisa se o _headers nao existir", /AVISO/.test(ps1) && /if \(-not \$csp\)/.test(ps1));
conf("continua em CRLF (duplo clique no Windows)",
  fs.readFileSync(path.join(ROOT, "servidor.ps1")).indexOf("\r\n") > 0);

function achaPython() {
  const { spawnSync } = require("child_process");
  for (const c of ["python3", "python"]) {
    const r = spawnSync(c, ["-c", "print(1)"], { stdio: "ignore" });
    if (r.status === 0) return c;
  }
  return null;
}

(async () => {
  titulo("servidor.js (Node) - de verdade, por HTTP");
  await testaServidor("servidor.js", process.execPath, [path.join(__dirname, "servidor.js")]);

  titulo("servidor.py (Python) - de verdade, por HTTP");
  const py = achaPython();
  if (conf("achei o Python (o mesmo que roda o src/build.py)", !!py, py || "")) {
    await testaServidor("servidor.py", py, [path.join(__dirname, "servidor.py")]);
  }

  const falhas = ok.filter((x) => !x).length;
  console.log("\n== resumo ==");
  console.log(ok.length + " asserções, " + falhas + " falhas");
  if (!falhas) console.log("\nCSP em vigor:\n  " + CSP.split("; ").join("\n  "));
  process.exit(falhas ? 1 : 0);
})();
