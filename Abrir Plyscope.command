#!/bin/sh
# Duplo clique no macOS (o Finder executa arquivos .command no Terminal).
# Chama o plyscope.sh via /bin/sh para funcionar mesmo se o bit de execucao
# tiver se perdido no caminho (download em .zip, por exemplo).
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /bin/sh "$DIR/plyscope.sh" "$@"
