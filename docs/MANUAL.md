# Plyscope — manual

Análise de partidas no estilo do Game Review do chess.com, rodando **100% no seu computador**, de graça e sem login.

## Como abrir

Dê dois cliques em **`Abrir Plyscope.bat`**.

Isso liga um servidor local minúsculo (via PowerShell, já incluso no Windows) e abre o app no navegador em `http://localhost:8123/index.html`. Deixe a janela preta aberta enquanto estiver usando; para encerrar, feche a janela.

> **Por que não abrir o `index.html` direto?** O navegador bloqueia o carregamento de WebAssembly em arquivos abertos via `file://`. O servidor local resolve isso — nada sai do seu computador.

## Como usar

1. **Importar** — cole o PGN, arraste um arquivo `.pgn`, ou digite seu usuário do Chess.com / Lichess e clique em *Buscar* para escolher entre as últimas partidas.
2. **Analisar partida** — o Stockfish avalia todas as posições. A primeira vez baixa o motor do próprio disco (≈7 MB) e leva alguns segundos a mais.
3. **Relatório** — precisão de cada jogador, gráfico de vantagem (clicável), contagem por tipo de lance e os momentos decisivos da partida.
4. **Lances** — cada lance recebe um selo. Clique para ir até a posição.
5. **Motor** — as três melhores linhas na posição atual. O botão *Analisar esta posição a fundo* roda o motor sem limite de profundidade.
6. **Explorar** — clique na peça e depois na casa de destino para testar variações; o motor avalia na hora. Clicar num lance das linhas do motor também joga a variação até ali. Use *Voltar à partida* para sair.

Atalhos: `←` `→` navegam, `Home`/`End` vão ao início/fim, `F` gira o tabuleiro, `espaço` liga a reprodução automática, `M` liga e desliga o som.

## Reprodução automática e som

O botão de **play**, entre as setas de navegação, passa os lances sozinho — a velocidade fica no seletor ao lado (0,6 s a 3,5 s por lance). A barra de espaço liga e desliga; qualquer navegação manual pausa.

Os sons são **gerados no navegador**, sem nenhum arquivo de áudio: batida seca no lance, mais grave na captura, blip no xeque, dois toques no roque, subida na promoção, um arpejo curto no Brilhante e um baque grave na Capivarada. O botão de alto-falante (ou a tecla `M`) muda tudo, e a preferência fica salva.

## Os selos

| Selo | Significado |
|---|---|
| **Brilhante (!!)** | Sacrifício correto: entrega material e mesmo assim é o melhor lance. |
| **Excelente (!)** | Achou o único lance que segurava a posição. |
| **Melhor (★)** | Igual à primeira escolha do motor. |
| **Ótimo / Bom (✓)** | Perde pouquíssima chance de vitória. |
| **Forçado (=)** | Só havia esse lance legal. |
| **Impreciso (?!)** | Perdeu de 5% a 10% de chance de vitória. |
| **Erro (?)** | Perdeu de 10% a 20%. |
| **Capivarada (??)** | Perdeu mais de 20%. |

A classificação usa **chance de vitória** (não centipeões), a mesma ideia do Lichess e do chess.com: um erro de 1 peão numa posição equilibrada pesa muito mais do que numa posição já decidida.

## Como o "Brilhante" é decidido

O detector foi calibrado contra o **Brilliant Move Benchmark** — os 100 lances que o Game Review do chess.com marcou como brilhantes em 100 partidas reais. Resultado da versão atual:

| | brilhantes encontrados |
|---|---|
| Chess.com (gabarito) | 100 / 100 |
| Chessigma | 93 / 100 |
| **Plyscope** | **93 / 100** |
| Chessiro | 90 / 100 |
| WintrChess | 45 / 100 |
| Chesskit | 23 / 100 |

Em 8 partidas completas (416 lances comuns), o app marcou 4 lances extras além dos do gabarito — ou seja, não distribui confete.

Um lance só recebe o selo quando passa por quatro perguntas, as mesmas que separam sacrifício de erro:

1. **Foi escolha?** Se havia um único lance legal, não tem mérito.
2. **A oferta é real?** O adversário precisa ter uma captura **legal** que ganhe material de fato — cálculo de trocas na casa, não "peça sem defesa". Cravadas e xeques que impedem a tomada não contam.
3. **Vale o que ofereceu?** Considera as três formas que o chess.com premia: peça largada em casa atacada, captura que convida a recaptura, e o lance que simplesmente ignora uma ameaça em outro canto do tabuleiro.
4. **Continua de pé?** Depois do sacrifício a posição tem que seguir boa, e a partida tem que estar em jogo — sacrificar já perdido, ou com a vitória no bolso, não é brilhante (a exceção é oferecer peça inteira ou mais).

Além disso, todo candidato a sacrifício é reanalisado com mais profundidade antes do veredito, porque é justamente onde a análise rasa erra: o lance parece um erro até o motor enxergar a continuação.

## Profundidade

O seletor no topo controla a análise:

- **Rápida (12)** — alguns segundos por partida, boa para uma passada geral.
- **Padrão (16)** — recomendada.
- **Profunda (20)** — mais lenta e mais confiável.

Em todos os casos há uma **segunda passada** automática: lances suspeitos (erros aparentes e sacrifícios) são reavaliados com 6 níveis a mais de profundidade, o que evita tanto "erros" falsos quanto brilhantes perdidos por análise rasa.

## Precisão

Fórmulas públicas do Lichess: a avaliação vira chance de vitória, a queda de chance vira precisão do lance, e a precisão da partida é a média entre a média ponderada (por volatilidade da posição) e a média harmônica. Números próximos, mas não idênticos, aos do chess.com — que usa fórmula própria e fechada.

## O que tem dentro

- `index.html` — o app inteiro (interface, tabuleiro, chess.js e a lógica de análise).
- `engine/` — Stockfish 17.1 lite single-thread (WebAssembly), licença GPLv3.
- `servidor.ps1` — servidor local.

Créditos: [Stockfish](https://stockfishchess.org/) (GPLv3, build de nmrugg/stockfish.js), [chess.js](https://github.com/jhlywa/chess.js) (BSD), peças do sprite do [cm-chessboard](https://github.com/shaack/cm-chessboard) (CC BY-SA 3.0, Cburnett/Wikimedia).

Nenhuma partida, nome de usuário ou avaliação é enviada para qualquer servidor. As buscas no Chess.com e no Lichess usam as APIs públicas e gratuitas desses sites, direto do seu navegador.
