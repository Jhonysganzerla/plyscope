#!/usr/bin/env python3
"""
Plyscope - servidor local minimo (macOS e Linux). Equivalente ao servidor.ps1.

O navegador exige http:// (e nao file://) para carregar o motor WebAssembly
dentro de um Web Worker. Nada sai desta maquina.

Manda os mesmos cabecalhos do servidor.ps1, incluindo COOP + COEP, que ligam o
"cross-origin isolation" e liberam o SharedArrayBuffer -> Stockfish multi-thread.
Isso nao atrapalha as buscas no Chess.com e no Lichess: o COEP so barra
requisicoes "no-cors", e o fetch do app roda em modo "cors".

Manda tambem o Content-Security-Policy lido do _headers, o mesmo arquivo que
o src/build.py gera com os hashes dos <script> inline. Local e publicado rodam
sob a mesma politica de proposito: um erro de CSP tem que aparecer aqui, na
maquina de quem programa, e nao so depois do deploy.

    python3 tools/servidor.py [porta] [--sem-navegador]
"""

import functools
import http.server
import os
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTAS = range(8123, 8141)

MIME = {
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
}


def le_csp():
    """Le o Content-Security-Policy do _headers gerado pelo src/build.py.

    Uma copia so, num arquivo so: e o que garante que o servidor local e a
    hospedagem mandem exatamente a mesma politica. Nada de repetir a string
    aqui dentro, que e como as duas acabariam divergindo.
    """
    try:
        with open(os.path.join(ROOT, "_headers"), encoding="utf-8") as f:
            for linha in f:
                if linha.strip().lower().startswith("content-security-policy:"):
                    return linha.split(":", 1)[1].strip()
    except OSError:
        pass
    return None


CSP = le_csp()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **MIME)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        if CSP:
            self.send_header("Content-Security-Policy", CSP)
        self.send_header("Cache-Control", "no-cache")
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, *args):
        pass  # sem ruido no terminal


def main(argv):
    abrir = "--sem-navegador" not in argv and os.environ.get("PLYSCOPE_SEM_NAVEGADOR") != "1"
    pedida = [int(a) for a in argv if a.isdigit()]
    portas = pedida if pedida else list(PORTAS)

    handler = functools.partial(Handler, directory=ROOT)
    srv = porta = None
    for p in portas:
        try:
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", p), handler)
            porta = p
            break
        except OSError:
            continue
    if srv is None:
        print("Nao consegui abrir uma porta local (%d-%d)." % (portas[0], portas[-1]))
        return 1

    url = "http://localhost:%d/index.html" % porta
    print("")
    print("  Plyscope rodando em %s" % url)
    print("  Deixe este terminal aberto enquanto usar o app.")
    print("  Para encerrar: Ctrl+C.")
    if not CSP:
        print("")
        print("  AVISO: nao achei o Content-Security-Policy no _headers.")
        print("  Rode 'python3 src/build.py'; sem isso o app roda aqui com regras")
        print("  mais frouxas do que no site publicado.")
    print("")
    sys.stdout.flush()
    if abrir:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
