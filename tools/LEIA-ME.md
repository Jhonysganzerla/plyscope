# Ferramentas de desenvolvimento

Fora o `servidor.py` e o `servidor.js`, nada aqui é necessário para *usar* o Plyscope — é o que se usa para mexer nele.

```bash
cd tools
npm install        # chess.js e jsdom
```

## `servidor.py` e `servidor.js` — servidor local do macOS e do Linux

Chamados pelo `plyscope.sh` (e pelo `Abrir Plyscope.command`), não diretamente. São o equivalente do `servidor.ps1` do Windows: servem a pasta do projeto em `http://localhost:8123` com os cabeçalhos `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`, que ligam o Stockfish multi-thread, e com `application/wasm` no `.wasm`.

O `servidor.py` é o caminho normal (Python 3); o `servidor.js` é o plano B para máquinas sem Python 3. Os dois aceitam `[porta]` e `--sem-navegador`.

## `test.js` — teste funcional

Sobe o `index.html` num DOM falso (jsdom), troca o Web Worker por um processo Node rodando o mesmo Stockfish, e exercita o app inteiro: carrega um PGN, analisa a partida, confere o relatório e os selos, navega, explora variações, clica nas linhas do motor, liga a reprodução automática e passeia pelas abas.

Também confere a troca de idioma com a análise na tela: analisa em português, muda para inglês e verifica que o topo, as abas, o relatório, os selos da lista de lances e o painel de análises salvas mudaram de língua — enquanto a análise continua a mesma (mesmos selos, mesmo SAN, mesma precisão, só reescrita no formato da outra língua) — e depois volta para o português conferindo que a tela fica idêntica à de antes.

```bash
node test.js                 # usa um PGN embutido
node test.js partida.pgn     # usa o seu
```

Leva ~35 s (roda o motor de verdade). Os avisos `JSDOM ERR ... getContext()` são esperados: jsdom não implementa canvas, então só o gráfico não é desenhado.

## `test-pool.js` — testes do pool de motores

O assunto aqui é o escalonador da análise em lote, não o xadrez: o motor é um stub que fala UCI e devolve uma avaliação que é **função pura do FEN** — e responde fora de ordem de propósito. Com isso, o caminho antigo (um motor) e o pool (N motores) têm de dar relatórios **idênticos**; se algum resultado cair no índice errado, os números mudam e o teste cai.

```bash
node --test test-pool.js
```

Prova que N posições ficam em voo ao mesmo tempo, que o teto de motores e a conta de memória são respeitados, que "Parar análise" para todos sem deixar busca órfã, que "Analisar esta posição a fundo" responde num motor dedicado no meio do lote, e que sem `Worker`, com pool que não sobe, com pouca memória ou com um motor que morre no meio, o caminho de sempre assume e a análise sai inteira.

## `bench-pool.js` — mede o ganho do pool

Roda a mesma análise da mesma partida pelo caminho antigo e pelo pool, na mesma máquina, com o Stockfish de verdade, e imprime os tempos lado a lado. O que muda entre uma configuração e outra é só o `navigator.hardwareConcurrency`: quem decide o tamanho do pool continua sendo o app.

```bash
node bench-pool.js                                        # Ópera, prof. 12, 2 e 4/5/9 núcleos
node bench-pool.js ../docs/exemplos/opera-1858.pgn 16 2,9  # outra profundidade
```

Cada configuração roda num processo separado. Além do tempo, mostra o aquecimento (clique → primeira busca) e o pico de buscas simultâneas.

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
