# Como o detector de Brilhante foi calibrado

O selo **Brilhante (!!)** é o único da escala que não sai de uma conta simples de chance de vitória. Todos os outros são um limiar sobre quanto o lance custou; esse exige responder uma pergunta qualitativa — *isso foi um sacrifício correto ou uma peça pendurada?* — e por isso é onde as ferramentas de revisão mais divergem entre si.

Para não avaliar o próprio trabalho no olho, o detector foi medido contra um gabarito externo.

## O gabarito

O **Brilliant Move Benchmark** reúne 100 lances que o Game Review do chess.com marcou como brilhantes, em 100 partidas reais de jogadores comuns (a maioria entre 900 e 2000 de rating). Cada caso traz o PGN completo, o lance em questão, a posição imediatamente anterior e o veredito de várias ferramentas gratuitas de revisão.

A pergunta que ele responde é estreita e honesta: **dos 100 lances que o chess.com chamou de brilhantes, quantos cada ferramenta também encontra?**

Não é a pergunta "quem está certo" — o chess.com não é a verdade sobre xadrez, é só o padrão que os jogadores conhecem e esperam. É a pergunta "quem reproduz o comportamento que o usuário espera".

## Resultado

| Ferramenta | Brilhantes encontrados |
|---|---|
| Chess.com *(gabarito)* | 100 / 100 |
| Chessigma | 93 / 100 |
| Chessiro | 90 / 100 |
| **Plyscope** | **87 / 100** |
| WintrChess | 45 / 100 |
| Chessitup | 41 / 100 |
| Chesskit | 23 / 100 |

Medido com profundidade 16 e a segunda passada ligada — a configuração padrão do app.

**Contenção**, que é a outra metade do exame: em 8 partidas completas (416 lances), o Plyscope marcou os 8 brilhantes do gabarito e mais 3 lances. Uma ferramenta que carimba brilhante em lance comum não está informando nada, está distribuindo confete.

## Como a medição foi feita

Duas rodadas, ambas com o **mesmo código que roda no navegador** — `tools/calibrar.js` recorta o bloco puro de classificação direto do `src/app.js` e o executa em Node. Não existe uma segunda implementação da regra para medir.

1. **Recall** — para cada um dos 100 casos: avalia a posição antes do lance (MultiPV 2) e a posição depois, aplica a classificação, conta quantos saem como `brilhante`. Cada avaliação vai para um cache em disco, então mexer nos limiares e remedir é instantâneo.
2. **Precisão** — analisa 8 partidas inteiras lance a lance e conta quantos brilhantes aparecem além do que estava no gabarito.

Com os dois conjuntos medidos e em cache, `tools/tune.js` faz busca em grade sobre os limiares e mostra as combinações no melhor equilíbrio entre achar e não inventar.

## O que a calibração mudou

A primeira versão do detector achava **43 dos 100**. Ela só reconhecia um tipo de sacrifício: peça que vai para uma casa onde pode ser capturada. O gabarito mostrou que os brilhantes do chess.com se dividem em quatro famílias:

| Família | Fatia dos 100 | O que é |
|---|---|---|
| `DirectSacrificeCapture` | 43 | Captura que convida a recaptura; o material volta com juros. |
| `IgnoresThreat` | 25 | O lance simplesmente ignora uma ameaça e deixa material pendurado em outro canto. |
| `DirectSacrificeEnPrise` | 20 | Peça largada numa casa atacada, sem capturar nada. |
| `IndirectSacrifice` | 11 | A oferta só aparece um lance depois. |

O detector antigo cobria bem só a terceira. Hoje a detecção parte de **quanto material o adversário consegue ganhar capturando qualquer coisa**, o que cobre as três primeiras de uma vez — a quarta continua fora do alcance e é a maior parte do que falta para chegar aos 90.

Duas outras correções valeram vários pontos:

- **A captura precisa ser legal.** A versão antiga olhava trocas na casa e nada mais, então cravada, xeque pendente e peça que "pode ser tomada mas não pode mesmo" contavam como oferta. Agora a oferta só existe se o adversário tiver um lance de captura legal ali.
- **Sacrifício suspeito volta para o motor.** Na profundidade 16, sacrifícios legítimos do gabarito apareciam como perda de 4,5% e 5,2% de chance de vitória — o suficiente para serem reprovados. Reanalisados na profundidade 22, caíram para 2,4% e 2,3%. A segunda passada, que já existia para erros aparentes, passou a valer também para candidatos a sacrifício.

## Os limiares

Ficam em `src/app.js`, no objeto `BRI`, com o nome do que cada um significa:

```js
const BRI = {
  perdaMax: 6.0,      // quanto de chance de vitória o lance pode custar
  riscoMin: 150,      // material que precisa estar realmente em oferta
  liquidoMin: 100,    // oferta menos o que o próprio lance capturou
  winAntesMin: 40,    // sacrificar em posição já perdida não é brilhante
  winDepoisMin: 35,   // e depois do sacrifício ainda tem que estar de pé
  vitoriaMax: 97,     // com a partida já ganha não vale…
  liquidoGrande: 250, // …a menos que a oferta seja de peça inteira
};
```

Os dois últimos saíram de uma separação limpa nos dados: nas posições já ganhas (mais de 97% de chance de vitória), os brilhantes do gabarito ofereciam de 220 a 400 de material líquido, enquanto as marcações erradas ficavam em 0, 100 e 200. É a diferença entre coroar a partida com um sacrifício de peça e dar uma volta olímpica.

## O que ainda escapa

Dos 13 casos que faltam:

- a maioria é `IndirectSacrifice` — a oferta aparece só no lance seguinte, e olhar uma posição por vez não vê isso;
- alguns são sacrifício posicional de longo prazo, em que a compensação não cabe na profundidade da segunda passada;
- um deles não tem captura possível nenhuma na posição resultante: o motor entende a compensação, o cálculo de material não tem o que medir.
