# Changelog

Tudo o que mudou de forma perceptível no Plyscope.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento: [SemVer](https://semver.org/lang/pt-BR/), com a leitura descrita
em [`CONTRIBUTING.md`](CONTRIBUTING.md#versionamento) — **mudança de veredito é
major**.

> Este arquivo nasceu depois do código. A seção `1.0.0` foi **reconstruída a
> partir do histórico do Git** (`git log --oneline --reverse`), e cada item traz
> o commit de onde saiu. Onde o commit não diz, aqui também não diz: não há
> nesta lista nenhuma data, número ou recurso que não esteja no repositório.

## [Não lançado]

### Mudado

- **As quatro abas do trilho acabaram.** Relatório, lances e motor são agora
  três seções empilhadas, visíveis ao mesmo tempo — eram as três coisas que se
  consultam a cada lance e que escondiam umas às outras. Cada uma é uma região
  com nome próprio (`<section aria-labelledby>` + cabeçalho), no lugar do
  `role="tab"`/`tabpanel`, que não descrevia mais nada.
- **Importar** e a nova **Legenda e atalhos** viraram painéis recolhíveis
  (`<details>` nativo): um Enter para abrir, nenhum pixel enquanto fechados.
  *Nova partida* reabre o de importar; carregar uma partida o recolhe.
  A legenda dos selos, a ajuda das teclas do tabuleiro e os links do projeto
  moram no de baixo. **Exportar** virou um recolhível dentro do relatório.
- A linha de ajuda das teclas saiu de baixo do tabuleiro: são ~50 px que
  viraram tabuleiro.
- Relatório mais denso: precisão sem moldura e com uma unidade só para os dois
  jogadores, gráfico mais baixo e momentos decisivos em selos de uma linha, com
  a frase inteira (`perdeu 24% de chance de vitória`) no rótulo acessível.
  O gráfico ganhou `role="img"` e nome acessível, que nunca teve.
- Dez frases de interface a menos, nas duas línguas: o que explicava o óbvio
  saiu, o que era informação ficou (e mais curto).
- O seletor de profundidade perdeu o rótulo "Profundidade" ao lado — as opções
  já dizem o que ele é; o nome continua inteiro no `aria-label`.

### Corrigido

- Espaço com o foco no resumo de um painel recolhível abria o painel **e**
  ligava a reprodução automática; agora o `<summary>` é dono da própria tecla,
  como já eram os botões e os links.

## [1.0.0] — 2026-08-07

Primeira versão marcada. O app estava pronto e publicado antes disso; a tag
existe para dar um nome ao estado de hoje e um ponto de partida ao changelog.

### Adicionado

**O analisador** (`e581ddc`)

- Revisão de partida inteira no navegador, sem servidor: entra PGN, sai
  relatório. Entrada por texto colado, arquivo `.pgn` arrastado ou seletor;
  PGN com várias partidas vira lista para escolher.
- Busca das últimas partidas públicas pelo nome de usuário no **Chess.com** ou
  no **Lichess**, pelas APIs públicas, direto do navegador e sem login.
- **Stockfish 17.1 lite** em WebAssembly, rodando local, em três profundidades
  (rápida 12, padrão 16, profunda 20), com segunda passada automática nos
  lances suspeitos e nos sacrifícios.
- Classificação de cada lance por **chance de vitória**, não por centipeão, com
  nove selos: Brilhante, Excelente, Melhor, Ótimo, Bom, Forçado, Impreciso,
  Erro e Capivarada.
- Precisão dos dois jogadores pelas fórmulas públicas do Lichess, contagem por
  tipo de lance, momentos decisivos, gráfico de vantagem clicável, barra de
  avaliação, seta do melhor lance e as três melhores linhas do motor.
- Tabuleiro com exploração livre (clique na peça, clique no destino, o motor
  avalia na hora), reprodução automática com velocidade ajustável, sons
  sintetizados no próprio navegador e atalhos de teclado.
- Detector de **Brilhante** calibrado contra o Brilliant Move Benchmark:
  **87 dos 100** lances do gabarito, com **3 marcações extras** em 416 lances
  comuns.

**Motor multi-thread e atalhos de macOS/Linux** (`1d7e46a`)

- Segundo build do mesmo Stockfish 17.1 lite, com threads
  (`engine/stockfish-lite.js` + `.wasm`). O app escolhe sozinho no boot:
  multi-thread quando a página está *cross-origin isolated* e há 3 núcleos ou
  mais; `hardwareConcurrency − 1` threads, teto de 8; volta sozinho ao
  single-thread se não subir.
- Aba **Motor** mostrando versão, modo e número de threads.
- `Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp` no `servidor.ps1`, no
  `vercel.json` e nos servidores novos. Escolhido `require-corp` e não
  `credentialless` porque o Safari não implementa o segundo.
- `plyscope.sh`, `Abrir Plyscope.command`, `tools/servidor.py` (Python 3) e
  `tools/servidor.js` (plano B em Node).
- `docs/MANUAL.md` e `tools/LEIA-ME.md`.

**Aberturas** (`4f247d3`)

- Identificação da abertura da partida por uma base ECO embutida:
  `src/data/openings.js`, 3607 posições vindas de
  [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
  (CC0 1.0), geradas por `tools/gerar-aberturas.js`. A busca é por posição
  normalizada, então transposição cai na mesma entrada.

**Análises salvas e exportação** (`02cfc70`)

- Até 20 análises guardadas em `localStorage`, reabertas sem encostar no motor,
  apagáveis uma a uma.
- Exportação em **PGN comentado** (`[Annotator "Plyscope"]`, NAG por selo,
  `{ [%eval …] }`) e em **imagem PNG do relatório**, desenhada no canvas.

**Interface bilíngue** (`a6ab306`)

- Português do Brasil e inglês num dicionário único (`src/i18n.js`), com botões
  `PT`/`EN` no topo. A troca é imediata, não recarrega a página e não perde a
  análise aberta: relatório, selos, gráfico e análises salvas são reetiquetados
  na hora.
- Idioma inicial deduzido de `navigator.language`, escolha guardada, `<html
  lang>` acompanhando.
- Números, tempos e datas no formato de cada língua. Notação de xadrez, nomes
  de jogadores e o conteúdo do PGN exportado ficam como estão.
- `README.en.md`, com par de links entre os dois READMEs.

**Rodapé** (`dbeb55c`) — link discreto para o código e para o apoio, seguindo o
idioma ativo.

**Tabuleiro do lado de quem estuda** (`f137ce9`) — o nome digitado na busca
fica guardado no navegador e, quando bate com um dos jogadores do PGN, o
tabuleiro abre girado se a pessoa jogou de pretas. Giro manual manda.

**Animação das peças** (`45c86d0`) — na navegação lance a lance, as peças
deslizam entre as casas em 180 ms, inclusive no roque, na captura, no *en
passant* e na promoção. Pulo longo e giro do tabuleiro seguem instantâneos, e
quem pede `prefers-reduced-motion` não vê animação nenhuma.

**Treino "Aprenda com seus erros"** (`2ecdaa1`) — depois da análise, uma fila
com os Erros e as Capivaradas da partida devolve o tabuleiro à posição de antes
de cada um e pede o melhor lance. Acertando, a variação principal segue sozinha
por até seis meios-lances; errando, o painel diz o que aquilo custou e oferece
nova tentativa, dica ou resposta. Progresso, resumo no fim e a opção de refazer
só os que passaram batido. **Não encosta no motor:** usa o que a análise já
descobriu.

**Pool de motores** (`58d3c43`) — a partida passa a ser analisada em N motores
em paralelo, em vez de uma posição por vez. O tamanho do pool sai dos núcleos e
da memória disponíveis; a repartição é intercalada e por índice, então três
rodadas do mesmo lote dão o mesmo relatório. O lote é sempre N × 1 thread; o
motor interativo continua multi-thread quando dá. Sem `Worker`, com pool que não
sobe, com pouca memória ou com um motor que morre no meio, a análise cai no
caminho de sempre e sai inteira. "Analisar esta posição a fundo" responde num
motor dedicado, sem esperar a fila.

**Testes e medição reproduzível** (`a1e14d8`, `501d82b`, `58d3c43`, `54708a7`)

- `tools/unit.js` — 76 testes das funções puras de `src/classify.js`, sem
  motor, em cerca de 0,2 s.
- `tools/test.js` — ponta a ponta com o Stockfish de verdade em jsdom.
- `tools/test-treino.js` — ponta a ponta do modo de treino, em arquivo
  separado porque as duas juntas passavam de 45 s.
- `tools/test-pool.js` — o escalonador do lote, com motor de mentira cuja
  avaliação é função pura do FEN e que responde fora de ordem de propósito.
- `tools/test-csp.js` — 66 conferências da política de segurança de conteúdo.
- `tools/harness.js` — preparo comum das duas suítes de ponta a ponta.
- `bench/` — os 100 casos do benchmark reduzidos a fatos verificáveis, com
  `SHA256.txt`, `PROVENIENCIA.md` e o script que remonta os PGNs pela API
  pública do Chess.com.

**Integração contínua** (`4cc28c5`, `cdecd8c`, `501d82b`, `54708a7`) — a cada
push, o CI reconstrói `index.html`, `vercel.json` e `_headers` a partir de
`src/` e falha se o commit estiver desatualizado; depois roda as cinco suítes.

**Documentação e marca** (`4cc28c5`, `1d7e46a`, `a1e14d8`) — `docs/PUBLICAR.md`
(GitHub + Vercel, e o CSP diretiva por diretiva), `docs/BENCHMARK.md`,
`docs/MANUAL.md`, `brand/` com logo, símbolo, ícone e `BRAND.md`.

**Higiene do repositório** (esta versão) — `CONTRIBUTING.md`, `SECURITY.md`,
este `CHANGELOG.md`, `.editorconfig`, configuração de ESLint com regras de
defeito (`eslint.config.js` e `npm run lint` em `tools/`), templates de issue e
de pull request, e a estrutura de `docs/img/` com o roteiro de captura das
telas.

### Modificado

- **Detector de Brilhante: 86 → 93 dos 100** (`e4373fc`). O veto a retomadas
  deixou de ser geral e virou uma pergunta mais estreita, resolvida por um lance
  nulo na posição anterior: o adversário já conseguia ganhar aquele mesmo
  material naquela mesma casa **antes** do lance? Se sim, a peça já estava
  pendurada e o mérito não é da retomada. `liquidoGrande` foi de 250 para 220 —
  o líquido exato do presente grego (`Bxh7+`). Falsos positivos ficaram em 4 de
  416 lances comuns, o mesmo conjunto de antes. Sem chamadas extras ao motor.
- **`src/classify.js` extraído do `app.js`** (`a1e14d8`). As funções puras
  (SEE, sacrifício, classificação, precisão) viraram um módulo que carrega no
  navegador e em Node. `calibrar.js` e `tune.js` passaram a **importá-lo**, em
  vez de recortar o `app.js` por `indexOf` de comentário — renomear um
  comentário quebrava a calibração em silêncio.
- **Selo Blunder em inglês** (`f137ce9`). *Capivarada* continua em português; em
  inglês o selo passou a ser *Blunder*, porque no meio de uma escala técnica
  (*Inaccuracy, Mistake…*) a piada não diria nada a quem lê em inglês.
- **Base de aberturas guarda o nome em inglês** (`a6ab306`), com o tradutor
  mecânico junto: o português sai na hora da busca. Guardar os dois nomes
  custaria +35,5 KB; assim as duas línguas custam +3,9 KB.
- **Suíte dividida** (`54708a7`). O preparo comum foi para `harness.js` e o
  treino ganhou arquivo próprio.
- **CI atualizado** (`cdecd8c`): `actions/checkout@v5`, `actions/setup-python@v6`
  e a tabela do benchmark em ordem.
- **README** (`22c3d78`, `7b8057f`, `9770df5`): link do site publicado, seção de
  apoio (PIX + GitHub Sponsors), modo de treino e animação das peças na lista de
  recursos.

### Corrigido

- **`esc()` passou a escapar aspas** (`8fafe63`). Faltavam `"` e `'`. Não era
  explorável na época — valor de tag PGN não pode conter aspas — mas o `esc()` é
  usado dentro de `title=`, `aria-label=` e `data-*=`, e bastava um dado chegar
  por outro caminho. Ver *Segurança*.

### Removido

- **A promessa de funcionar offline** (`8fafe63`). Os dois READMEs diziam "sem
  internet depois do primeiro clique". Não há service worker nem manifest: a
  frase saiu.
- **O roadmap do README** (`22c3d78`).
- **O tooltip que explicava a piada da Capivarada** (`f137ce9`).

### Segurança

- **Content-Security-Policy de verdade, igual em produção e em desenvolvimento**
  (`501d82b`). Como o app é um arquivo só com os scripts inline, a política
  libera cada bloco **por hash SHA-256**, calculado pelo `src/build.py` junto
  com o `index.html` e escrito no `vercel.json` e num `_headers` equivalente —
  build e política não têm como sair de sincronia. Fechada por padrão
  (`default-src`, `base-uri`, `form-action`, `object-src`, `frame-ancestors` e
  `frame-src` em `'none'`) e aberta só no que o app comprovadamente faz:
  `'wasm-unsafe-eval'` para o Stockfish, `worker-src`/`child-src 'self'`,
  `connect-src` com exatamente `api.chess.com` e `lichess.org` mais `'self'`, e
  `img-src data:` para o favicon e as setas do CSS. Os três servidores locais
  passaram a mandar a mesma política, lida do `_headers`. O `.gitattributes`
  fixou `*.html` em LF, porque o hash é sobre os bytes.
- **Teste de nome de jogador hostil** (`8fafe63`), com um payload
  (`<img onerror>` sem aspas) que atravessa o parser de PGN de verdade.

[Não lançado]: https://github.com/Jhonysganzerla/plyscope/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Jhonysganzerla/plyscope/releases/tag/v1.0.0
