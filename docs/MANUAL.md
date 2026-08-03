# Plyscope — manual

Análise de partidas no estilo do Game Review do chess.com, rodando **100% no seu computador**, de graça e sem login.

## Como abrir

**Windows** — dois cliques em **`Abrir Plyscope.bat`**. Ele usa o PowerShell, que já vem no Windows.

**macOS** — dois cliques em **`Abrir Plyscope.command`**. Se o Finder recusar por o arquivo ter vindo da internet, clique com o botão direito → *Abrir* → *Abrir*. Pelo terminal, `./plyscope.sh` faz o mesmo.

**Linux** — no terminal, dentro da pasta do Plyscope:

```bash
./plyscope.sh
```

Nos três casos sobe um servidor local minúsculo e o app abre no navegador em `http://localhost:8123/index.html`. Deixe a janela do servidor aberta enquanto estiver usando; para encerrar, feche a janela (ou `Ctrl+C` no terminal).

No macOS e no Linux o script usa o **Python 3**, que quase sempre já está instalado; se não estiver, ele tenta o **Node.js**, e se não houver nenhum dos dois diz o que instalar.

> **Por que não abrir o `index.html` direto?** O navegador bloqueia o carregamento de WebAssembly em arquivos abertos via `file://`. O servidor local resolve isso — nada sai do seu computador.

## Como usar

1. **Importar** — cole o PGN, arraste um arquivo `.pgn`, ou digite seu usuário do Chess.com / Lichess e clique em *Buscar* para escolher entre as últimas partidas.
2. **Analisar partida** — o Stockfish avalia todas as posições. A primeira vez baixa o motor do próprio disco (≈7 MB) e leva alguns segundos a mais.
3. **Relatório** — precisão de cada jogador, gráfico de vantagem (clicável), contagem por tipo de lance e os momentos decisivos da partida.
4. **Lances** — cada lance recebe um selo. Clique para ir até a posição.
5. **Motor** — as três melhores linhas na posição atual. O botão *Analisar esta posição a fundo* roda o motor sem limite de profundidade. A linha cinza embaixo diz em que modo o motor está rodando (veja *Um thread ou vários*).
6. **Explorar** — clique na peça e depois na casa de destino para testar variações; o motor avalia na hora. Clicar num lance das linhas do motor também joga a variação até ali. Use *Voltar à partida* para sair.
7. **Aprenda com seus erros** — no fim do relatório, o treino devolve cada Erro e cada Capivarada ao tabuleiro para você procurar o lance certo (veja abaixo).

Atalhos: `←` `→` navegam, `Home`/`End` vão ao início/fim, `F` gira o tabuleiro, `espaço` liga a reprodução automática, `M` liga e desliga o som.

**De que lado o tabuleiro abre.** O usuário que você digita em *Buscar partidas online* fica guardado neste navegador. Sempre que o nome bater com um dos jogadores do PGN — venha ele da busca, de um arquivo, de um texto colado ou de uma análise salva — o tabuleiro abre do seu lado: jogou de pretas, abre girado. Numa partida entre outras duas pessoas, ou sem nome guardado, ele abre como sempre, brancas embaixo. E se você girar à mão (botão ou `F`), a sua escolha vale para aquela partida — nada gira por baixo de você.

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

## Aprenda com seus erros

Terminada a análise, o fim do relatório traz **Aprenda com seus erros**, com quantos lances há para revisar. A fila são os **Erros** e as **Capivaradas** da partida, na ordem em que aconteceram — se o app souber de que lado você jogou (partida trazida pela busca com o seu usuário), só entram os seus.

Cada item volta o tabuleiro para a posição **de antes do erro**, girado para o lado de quem joga e com o último lance do adversário realçado. O painel conta o que aconteceu ("Você jogou Nf3 e perdeu 24% de chance de vitória") e pede o melhor lance. Nenhuma seta e nenhum selo aparecem: o gabarito fica escondido.

- **Acertou** — o painel confirma e **mostra por quê**: a variação principal segue sozinha por até seis meios-lances, com o texto acompanhando o tabuleiro. Depois, *Próximo erro*.
- **Errou** — a peça volta para o lugar e o painel diz o que aquele lance custa, quando dá para saber (é o caso do lance que você jogou na partida). Dá para *tentar de novo*, pedir uma **dica** (a peça certa, sem a casa) ou *ver a resposta*.

O contador mostra "3 de 7"; no fim vem o resumo — quantos saíram de primeira, quantos com dica ou nova tentativa e quantos passaram batido — com o botão de refazer só os que faltaram. *Sair* volta à análise exatamente como estava, e o treino nunca chama o motor: usa o que a análise já descobriu.

Reabrir uma **análise salva** também abre o treino. O registro guardado no navegador continua sem as linhas do motor, com uma exceção: os primeiros seis meios-lances da variação **das posições de erro**, que são o "por quê" do treino e custam ~40 bytes cada. Análises salvas por versões anteriores do Plyscope não têm essa parte — o exercício acontece igual, só sem a continuação, e o painel avisa.

## Profundidade

O seletor no topo controla a análise:

- **Rápida (12)** — alguns segundos por partida, boa para uma passada geral.
- **Padrão (16)** — recomendada.
- **Profunda (20)** — mais lenta e mais confiável.

Em todos os casos há uma **segunda passada** automática: lances suspeitos (erros aparentes e sacrifícios) são reavaliados com 6 níveis a mais de profundidade, o que evita tanto "erros" falsos quanto brilhantes perdidos por análise rasa.

## Idioma

Os botões **`PT`** e **`EN`**, no canto do topo, trocam a interface entre português do Brasil e inglês. A troca é imediata: a página não recarrega e a análise que estiver aberta continua exatamente como estava — o relatório, os selos, o gráfico e as análises salvas apenas mudam de rótulo. Números e datas acompanham a língua (`96,2%` e `02/11/1858` em português, `96.2%` e `11/02/1858` em inglês); notação de xadrez e nomes de jogadores, não.

Na primeira vez o app segue o idioma do navegador; depois disso vale a sua escolha, que fica guardada.

Em inglês os selos são *Brilliant, Great, Best, Excellent, Good, Forced, Inaccuracy, Mistake* e *Blunder* — a **Capivarada** é o nome do último só em português.

## Um thread ou vários

O app traz dois motores iguais em força e diferentes em velocidade, e escolhe sozinho ao abrir:

- **Multi-thread** — usa vários núcleos do seu processador (um a menos do que você tem, no máximo 8). É bem mais rápido.
- **1 thread** — o de sempre, funciona em qualquer lugar.

O multi-thread depende de um recurso que o navegador só libera quando a página é servida com dois cabeçalhos específicos (`Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`). Os atalhos do Windows, do macOS e do Linux já mandam esses cabeçalhos; um `python3 -m http.server` avulso, não. A aba **Motor** mostra qual dos dois está valendo agora, com o número de threads.

Se o multi-thread não conseguir iniciar, o app volta sozinho para 1 thread — a análise continua igual, só mais devagar. A busca de partidas no Chess.com e no Lichess funciona nos dois modos.

## Precisão

Fórmulas públicas do Lichess: a avaliação vira chance de vitória, a queda de chance vira precisão do lance, e a precisão da partida é a média entre a média ponderada (por volatilidade da posição) e a média harmônica. Números próximos, mas não idênticos, aos do chess.com — que usa fórmula própria e fechada.

## O que tem dentro

- `index.html` — o app inteiro (interface, tabuleiro, chess.js e a lógica de análise).
- `engine/` — Stockfish 17.1 lite (WebAssembly), nas versões de 1 thread e multi-thread, licença GPLv3.
- `servidor.ps1` — servidor local do Windows.
- `plyscope.sh`, `Abrir Plyscope.command`, `tools/servidor.py`, `tools/servidor.js` — o mesmo no macOS e no Linux.

Créditos: [Stockfish](https://stockfishchess.org/) (GPLv3, build de nmrugg/stockfish.js), [chess.js](https://github.com/jhlywa/chess.js) (BSD), peças do sprite do [cm-chessboard](https://github.com/shaack/cm-chessboard) (CC BY-SA 3.0, Cburnett/Wikimedia).

Nenhuma partida, nome de usuário ou avaliação é enviada para qualquer servidor. As buscas no Chess.com e no Lichess usam as APIs públicas e gratuitas desses sites, direto do seu navegador.
