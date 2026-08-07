# Ferramentas de desenvolvimento

Fora o `servidor.py` e o `servidor.js`, nada aqui é necessário para *usar* o Plyscope — é o que se usa para mexer nele.

```bash
cd tools
npm install        # chess.js, jsdom e o ESLint
```

## `npm run lint` — o ESLint

```bash
cd tools && npm run lint      # roda sobre o repositório inteiro (eslint ..)
```

Detector de defeito, não formatador: variável não usada, `==`, sombra,
`console` esquecido no app, atribuição sem leitor. Não há Prettier e não vai
haver — reformatar o que já funciona só apaga o `git blame`.

A configuração fica na raiz, em `eslint.config.js`, com o motivo de cada
decisão comentado ao lado: por que `src/*.js` é *script* e não módulo, por que
os globais do navegador estão listados um a um, por que `catch (e) {}` é
permitido aqui e por que `index.html` (gerado), `engine/` e `src/vendor/`
ficam de fora.

Ainda **não** roda no CI: há apontamentos antigos abertos em `src/` e em
algumas suítes. A régua enquanto isso é não deixar a lista crescer.

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

## As suítes

| arquivo | o que cobre | precisa do motor? |
|---|---|---|
| `unit.js` | as funções puras de `src/classify.js` — SEE, sacrifício, classificação, precisão | não (~100 ms) |
| `test.js` | ponta a ponta: análise, relatório, navegação, exploração, idioma, salvas, exportação | sim (~25 s) |
| `test-treino.js` | ponta a ponta do modo "aprenda com seus erros" | sim (~24 s) |
| `test-pool.js` | o pool de motores, com motor de mentira e avaliação determinística | não |
| `test-csp.js` | os hashes do CSP conferem com o `index.html` recém-construído | não |

`harness.js` é o preparo comum das duas suítes de ponta a ponta: carrega o
`index.html` num DOM falso, troca o Web Worker por um processo Node rodando o
mesmo Stockfish de `engine/`, e oferece `conf()` — a asserção que conta para o
resumo e faz o processo sair com código 1 se qualquer conferência falhar.

O treino ficou em arquivo separado porque analisa uma segunda partida inteira:
juntas, as duas passavam de 45 s, que é o limite de tempo de alguns ambientes.

```bash
cd tools && npm install
node --test unit.js
node test.js ../docs/exemplos/opera-1858.pgn
node test-treino.js
node test-pool.js && node test-csp.js
```


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
