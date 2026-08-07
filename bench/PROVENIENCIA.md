# De onde vêm os casos do benchmark

O número que o projeto anuncia — **93 dos 100 lances brilhantes** — só vale alguma coisa se outra pessoa puder chegar nele. Esta pasta existe para isso.

## O que está versionado aqui

`casos.json` — 100 registros com **apenas fatos verificáveis**:

| campo | o que é |
|---|---|
| `gameId` | id da partida no Chess.com, onde o PGN está público |
| `ply` | o meio-lance em questão |
| `san` / `uci` | o lance jogado, nas duas notações |
| `fen` | a posição imediatamente antes dele |
| `chesscom` | o veredito do Game Review do chess.com para esse lance |

Cada linha é uma afirmação conferível contra a partida original. O SHA-256 do arquivo está em `SHA256.txt`: é a versão exata do conjunto com que a medição publicada foi feita.

## O que **não** está versionado, e por quê

O conjunto original de 100 casos veio da página **Brilliant Move Benchmark** do [Chessigma](https://www.chessigma.com), que reuniu, escolheu e comparou essas partidas. As posições e os lances são fatos; **a seleção é trabalho editorial deles**. Republicar o arquivo inteiro seria redistribuir essa compilação, então aqui ficam só os fatos, com o crédito, e o resto volta da fonte pública.

Os PGNs completos também não estão aqui — são públicos no Chess.com e o script os remonta.

## Como reproduzir a medição

```bash
cd tools && npm install
node reconstruir-bench.js          # baixa os PGNs pelo gameId (~2 min, respeitando a API)
PLYSCOPE_BENCH=saida/bench.json node calibrar.js recall 16      # quantos dos 100 o app acha
PLYSCOPE_BENCH=saida/bench.json node calibrar.js precisao 8 16  # quantos lances comuns marca por engano
```

As avaliações do motor ficam em cache (`tools/saida/evalcache.json`), então a primeira execução é a lenta e as seguintes são instantâneas — dá para interromper e continuar.

**O que você deve obter:** 93 de 100 na primeira, e 4 marcações extras em 416 lances comuns na segunda, com o Stockfish que está em `engine/`. Números diferentes de motor, profundidade ou máquina mudam um ou dois casos que ficam na fronteira — se der 92 ou 94, é isso. Se der 70, é bug.

## Se o script falhar

A API pública do Chess.com pode mudar de formato ou remover uma partida antiga. O script diz quantos casos conseguiu remontar e segue com os que vieram; ao publicar um número, diga sobre quantos casos ele foi medido. A alternativa é montar o `bench.json` à mão no formato descrito em `tools/LEIA-ME.md`.

## Crédito

A ideia do benchmark, a seleção das 100 partidas e a comparação entre ferramentas são do **Chessigma**. O gabarito é o Game Review do **Chess.com**. Este repositório usa os dados para medir a si mesmo — e para tornar essa medição contestável.
