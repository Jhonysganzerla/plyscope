#!/usr/bin/env python3
"""
Monta o index.html do Plyscope: um arquivo único com interface, chess.js,
sprite de peças e toda a lógica de análise.

    python src/build.py        (ou: cd src && python build.py)

Entradas:  src/shell.html, src/i18n.js, src/classify.js, src/app.js,
           src/vendor/chess.esm.js, src/assets/pieces.svg, src/data/openings.js
Saídas:    index.html   (na raiz do projeto)
           vercel.json  (o Content-Security-Policy é reescrito aqui)
           _headers     (mesma política para Netlify/Cloudflare Pages)

O CSP é gerado junto com o index.html porque depende dele: os scripts são
inline, então a política os libera por hash SHA-256. Gerar os dois no mesmo
comando é o que impede a política e o conteúdo de saírem de sincronia — um
hash velho não "degrada", ele bloqueia o app inteiro.
"""
import base64
import hashlib
import json
import re
import pathlib

SRC = pathlib.Path(__file__).resolve().parent
ROOT = SRC.parent
DEST = ROOT / "index.html"

shell = (SRC / "shell.html").read_text(encoding="utf-8")

# --- chess.js: módulo ESM -> global window.Chess ---
cj = (SRC / "vendor" / "chess.esm.js").read_text(encoding="utf-8")
cj = re.sub(r"^export \{[^}]*\};\s*$", "", cj, flags=re.M)
cj = re.sub(r"^//# sourceMappingURL=.*$", "", cj, flags=re.M)
cj += "\nwindow.Chess = Chess;\n"

# --- sprite de peças: só os 12 grupos, sem ids duplicados ---
pieces = (SRC / "assets" / "pieces.svg").read_text(encoding="utf-8")
inner = pieces[pieces.index(">", pieces.index("<svg")) + 1: pieces.rindex("</svg>")]
inner = re.sub(r"<title>.*?</title>|<desc>.*?</desc>", "", inner, flags=re.S)
inner = re.sub(r'\s+id="(Shape|Group|Oval|crown)"', "", inner)
groups = re.findall(r'<g id="[wb][kqrbnp]".*?</g>\s*(?=<g id="[wb][kqrbnp]"|$)', inner, flags=re.S)
if len(groups) != 12:
    print("aviso: %d grupos de peças encontrados (esperado 12)" % len(groups))
    groups = [inner]

app = (SRC / "app.js").read_text(encoding="utf-8")

# --- dicionário bilíngue (pt-BR / en) ---
i18n = (SRC / "i18n.js").read_text(encoding="utf-8")

# --- base de aberturas ECO (gerada por tools/gerar-aberturas.js) ---
openings = (SRC / "data" / "openings.js").read_text(encoding="utf-8")

# --- lógica pura de classificação (o mesmo módulo que roda em Node) ---
classify = (SRC / "classify.js").read_text(encoding="utf-8")

out = shell.replace("<!--__PIECES__-->", "\n".join(groups))
out = out.replace("/*__CHESSJS__*/", cj)
out = out.replace("/*__OPENINGS__*/", openings)
out = out.replace("/*__CLASSIFY__*/", classify)
out = out.replace("/*__I18N__*/", i18n)
out = out.replace("/*__APP__*/", app)
# newline="\n" é obrigatório, não estético: o hash do CSP é calculado sobre os
# bytes servidos. Se o build rodasse no Windows com a tradução automática de
# quebra de linha, o arquivo iria com CRLF, o git normalizaria para LF ao
# comitar e a política publicada apontaria para um conteúdo que não existe.
DEST.write_text(out, encoding="utf-8", newline="\n")
print("ok:", DEST, "%d KB" % (len(out) // 1024))


# =====================================================================
#  Política de segurança de conteúdo (CSP)
#
#  A explicação diretiva por diretiva está em docs/PUBLICAR.md. Em resumo:
#  tudo fechado por padrão, e cada abertura corresponde a uma coisa que o
#  app comprovadamente faz (motor em Worker, WebAssembly, as duas APIs de
#  partidas, favicon e setas do CSS em data:).
# =====================================================================

# `(?![^>]*\bsrc=)`: só os blocos inline. Um <script src=...> não tem corpo
# para hashear — seria liberado por 'self', e hoje não existe nenhum.
RE_SCRIPT = re.compile(rb"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)

CONNECT = ["https://api.chess.com", "https://lichess.org"]


def hashes_dos_scripts(html_bytes):
    """SHA-256 de cada <script> inline, no formato que o CSP espera.

    Hasheia os bytes gravados no disco, não a string em memória: é o que o
    navegador vai ver. Qualquer diferença (BOM, CRLF, espaço a mais) muda o
    hash, e é justamente essa fragilidade que faz o teste tools/test-csp.js
    valer alguma coisa.
    """
    blocos = RE_SCRIPT.findall(html_bytes)
    if not blocos:
        raise SystemExit("erro: nenhum <script> inline encontrado no index.html")
    return ["'sha256-%s'" % base64.b64encode(hashlib.sha256(b).digest()).decode("ascii")
            for b in blocos]


def monta_csp(hashes):
    return "; ".join([
        # nada é permitido a menos que uma diretiva abaixo permita
        "default-src 'none'",
        # ninguém reescreve a base das URLs relativas (engine/, por exemplo)
        "base-uri 'none'",
        # o app não tem <form>; nenhum envio deve sair daqui
        "form-action 'none'",
        # ninguém embute o Plyscope num iframe (clickjacking)
        "frame-ancestors 'none'",
        # ...e o Plyscope não embute ninguém
        "frame-src 'none'",
        "object-src 'none'",
        # 'self': o importScripts que o Stockfish faz dentro do Worker;
        # 'wasm-unsafe-eval': compilar o .wasm sem liberar eval() de JavaScript;
        # hashes: os blocos inline gerados por este script.
        "script-src 'self' 'wasm-unsafe-eval' " + " ".join(hashes),
        # CSS inline no <head> + atributos style= no HTML gerado (ver PUBLICAR.md)
        "style-src 'self' 'unsafe-inline'",
        # favicon e as setinhas dos <select> são data:image/svg+xml
        "img-src 'self' data:",
        # o .wasm do motor ('self') e as duas APIs de partidas — mais nada
        "connect-src 'self' " + " ".join(CONNECT),
        # o motor roda em Worker carregado de engine/ (mesma origem, sem blob:)
        "worker-src 'self'",
        # fallback do worker-src em navegador que só entende CSP 2
        "child-src 'self'",
    ])


def atualiza_vercel(csp):
    """Reescreve o Content-Security-Policy do bloco global do vercel.json."""
    caminho = ROOT / "vercel.json"
    cfg = json.loads(caminho.read_text(encoding="utf-8"))
    for regra in cfg.get("headers", []):
        if regra.get("source") == "/(.*)":
            regra["headers"] = [h for h in regra["headers"]
                                if h.get("key") != "Content-Security-Policy"]
            regra["headers"].append({"key": "Content-Security-Policy", "value": csp})
            break
    else:
        raise SystemExit("erro: vercel.json sem a regra de cabeçalhos '/(.*)'")
    # o json.dumps quebra cada { "key": ..., "value": ... } em quatro linhas;
    # junta de volta para o diff mostrar só o que mudou de verdade.
    texto = json.dumps(cfg, indent=2, ensure_ascii=False)
    aspas = r'"(?:[^"\\]|\\.)*"'
    texto = re.sub(r'\{\s*"key": (%s),\s*"value": (%s)\s*\}' % (aspas, aspas),
                   r'{ "key": \1, "value": \2 }', texto)
    caminho.write_text(texto + "\n", encoding="utf-8", newline="\n")
    return cfg


def escreve_headers(cfg):
    """Mesmos cabeçalhos no formato _headers (Netlify e Cloudflare Pages).

    Deriva do vercel.json já atualizado, para as duas hospedagens nunca
    divergirem. A regra de Content-Type do .wasm fica de fora: a sintaxe do
    _headers só aceita `*` no fim do caminho, e as duas já servem .wasm como
    application/wasm por conta própria.
    """
    globais = next(r for r in cfg["headers"] if r["source"] == "/(.*)")
    engine = next(r for r in cfg["headers"] if r["source"] == "/engine/(.*)")
    linhas = [
        "# Gerado por src/build.py junto com o index.html — não edite à mão.",
        "# Netlify e Cloudflare Pages leem este arquivo; a Vercel lê o vercel.json.",
        "# Os hashes do script-src são dos blocos <script> inline do index.html:",
        "# mexeu no app, rode `python3 src/build.py` de novo ou o site sai bloqueado.",
        "",
        "/engine/*",
    ]
    linhas += ["  %s: %s" % (h["key"], h["value"]) for h in engine["headers"]]
    linhas += ["", "/*"]
    linhas += ["  %s: %s" % (h["key"], h["value"]) for h in globais["headers"]]
    linhas.append("")
    (ROOT / "_headers").write_text("\n".join(linhas), encoding="utf-8", newline="\n")


hashes = hashes_dos_scripts(DEST.read_bytes())
csp = monta_csp(hashes)
escreve_headers(atualiza_vercel(csp))
print("ok:", ROOT / "vercel.json", "e", ROOT / "_headers",
      "— CSP com %d hashes de script" % len(hashes))
