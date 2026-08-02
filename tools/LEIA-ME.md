# Ferramentas de desenvolvimento

Nada aqui é necessário para *usar* o Plyscope — é o que se usa para mexer nele.

```bash
cd tools
npm install        # chess.js e jsdom
```

## `test.js` — teste funcional

Sobe o `index.html` num DOM falso (jsdom), troca o Web Worker por um processo Node rodando o mesmo Stockfish, e exercita o app inteiro: carrega um PGN, analisa a partida, confere o relatório e os selos, navega, explora variações, clica nas linhas do motor, liga a reprodução automática e passeia pelas abas.

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
