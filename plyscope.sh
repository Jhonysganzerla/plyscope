#!/bin/sh
# Plyscope - abre o app no macOS e no Linux (equivalente ao "Abrir Plyscope.bat").
#
# Sobe um servidor estatico local com os mesmos cabecalhos do servidor.ps1
# (inclusive COOP + COEP, que liberam o Stockfish multi-thread) e abre o
# navegador. Nada sai desta maquina.
#
#   ./plyscope.sh                 porta livre entre 8123 e 8140
#   ./plyscope.sh 8200            porta fixa
#   ./plyscope.sh --sem-navegador nao abre o navegador

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Python 3 e o caminho normal: vem no Linux e no macOS (com as Command Line
# Tools). O teste do import serve para nao cair num /usr/bin/python3 que e so
# um atalho para "instale as ferramentas de desenvolvedor".
if command -v python3 >/dev/null 2>&1 && python3 -c "import http.server" >/dev/null 2>&1; then
  exec python3 "$DIR/tools/servidor.py" "$@"
fi

if command -v python >/dev/null 2>&1 && python -c "import sys, http.server; sys.exit(0 if sys.version_info[0] == 3 else 1)" >/dev/null 2>&1; then
  exec python "$DIR/tools/servidor.py" "$@"
fi

# Plano B: Node.js, que muita gente ja tem instalado.
if command -v node >/dev/null 2>&1; then
  exec node "$DIR/tools/servidor.js" "$@"
fi

echo "Nao encontrei Python 3 nem Node.js nesta maquina."
echo ""
echo "Instale um dos dois e rode de novo:"
echo "  macOS          xcode-select --install   (traz o python3)"
echo "  Debian/Ubuntu  sudo apt install python3"
echo "  Fedora         sudo dnf install python3"
echo "  Arch           sudo pacman -S python"
echo ""
echo "Em ultimo caso, 'python3 -m http.server 8123' serve o app, mas sem os"
echo "cabecalhos COOP/COEP: o motor roda em 1 thread, mais devagar."
exit 1
