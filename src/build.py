#!/usr/bin/env python3
"""
Monta o index.html do Plyscope: um arquivo único com interface, chess.js,
sprite de peças e toda a lógica de análise.

    python src/build.py        (ou: cd src && python build.py)

Entradas:  src/shell.html, src/app.js, src/vendor/chess.esm.js, src/assets/pieces.svg
Saída:     index.html (na raiz do projeto)
"""
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

out = shell.replace("<!--__PIECES__-->", "\n".join(groups))
out = out.replace("/*__CHESSJS__*/", cj)
out = out.replace("/*__APP__*/", app)
DEST.write_text(out, encoding="utf-8")
print("ok:", DEST, "%d KB" % (len(out) // 1024))
