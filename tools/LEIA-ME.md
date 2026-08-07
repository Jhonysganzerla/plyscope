# Ferramentas de desenvolvimento

Fora o `servidor.py` e o `servidor.js`, nada aqui é necessário para *usar* o Plyscope — é o que se usa para mexer nele.

```bash
cd tools
npm install        # chess.js e jsdom
```

## `servidor.py` e `servidor.js` — servidor local do macOS e do Linux

Chamados pelo `plyscope.sh` (e pelo `Abrir Plyscope.command`), não diretamente. São o equivalente do `servidor.ps1` do Windows: servem a pasta do projeto em `http://localhost:8123` com os cabeçalhos `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`, que ligam o Stockfish multi-thread, e com `application/wasm` no `.wasm`.

Mandam também o `Content-Security-Policy`, lido do `_headers` que o `src/build.py` gera — a mesma política do site publicado, para um erro de CSP aparecer aqui e não depois do deploy. Se o `_headers` não existir, eles avisam no terminal e servem sem CSP.

O `servidor.py` é o caminho normal (Python 3); o `servidor.js` é o plano B para máquinas sem Python 3. Os dois aceitam `[porta]` e `--sem-navegador`.

## `test-csp.js` — teste da política de segurança de conteúdo

```bash
python3 ../src/build.py      # sempre antes: o teste confere o build atual
node test-csp.js
```

Recalcula o SHA-256 de cada `<script>` inline do `index.html` e confere contra os hashes que o `vercel.json` e o `_headers` declaram; extrai do código as origens de `fetch`, o caminho do Worker do motor e os usos de `data:`, e confere cada um contra as diretivas; e sobe o `servidor.js` e o `servidor.py` de verdade para conferir por HTTP que mandam a mesma política. Do `servidor.ps1` faz revisão estática (PowerShell não roda fora do Windows). Leva uns 3 s. A explicação diretiva por diretiva está em `docs/PUBLICAR.md`.

## `test.js` — teste funcional

Sobe o `index.html` num DOM falso (jsdom), troca o Web Worker por um processo Node rodando o mesmo Stockfish, e exercita o app inteiro: carrega um PGN, analisa a partida, confere o relatório e os selos, navega, explora variações, clica nas linhas do motor, liga a reprodução automática e passeia pelas abas.

Também confere a troca de idioma com a análise na tela: analisa em português, muda para inglês e verifica que o topo, as abas, o relatório, os selos da lista de lances e o painel de análises salvas mudaram de língua — enquanto a análise continua a mesma (mesmos selos, mesmo SAN, mesma precisão, só reescrita no formato da outra língua) — e depois volta para o português conferindo que a tela fica idêntica à de antes.

```bash
node test.js                 # usa um PGN embutido
node test.js partida.pgn     # usa o seu
```

Leva ~35 s (roda o motor de verdade). Os avisos `JSDOM ERR ... getContext()` são esperados: jsdom não implementa canvas, então só o gráfico não é desenhado.

## `calibrar.js` — mede o detector de Brilhante

```bash
node calibrar.js recall 16        # quantos brilhantes do gabarito o app encontra
node calibrar.js precisao 8 16    # quantos lances comuns são marcados por engano
node calibrar.js relatorio        # relê o último resultado e explica cada erro
```

Precisa de um arquivo `tools/saida/bench.json` (ou `PLYSCOPE_BENCH=/caminho/bench.json`) — uma lista de casos no formato:

```json
[{ "gameId": "123", "ply": 23, "san": "Nxc7+", "uci": "b5c7",
   "fen": "<FEN antes do lance>", "pgn": "<PGN completo>",
   "results": { "chesscom": "hit" } }]
```

O dataset não vem no repositório. As avaliações do motor ficam em cache (`tools/saida/evalcache.json`), então rodar de novo é instantâneo e dá para interromper e continuar.

## `tune.js` — varre os parâmetros

Faz busca em grade sobre os limiares do objeto `BRI` (em `src/app.js`) usando os resultados já medidos, e mostra as combinações com melhor equilíbrio entre acertos e falsos positivos. Não roda o motor: só relê o cache.

> `tune.js` e `calibrar.js` leem a lógica de classificação **direto do `src/app.js`**, recortando o bloco puro do arquivo. Não existe cópia paralela da regra: o que é medido é exatamente o que roda no navegador.
