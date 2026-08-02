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
| **Plyscope** | **93 / 100** |
| Chessigma | 93 / 100 |
| Chessiro | 90 / 100 |
| WintrChess | 45 / 100 |
| Chessitup | 41 / 100 |
| Chesskit | 23 / 100 |

Medido com profundidade 16 — a configuração padrão do app.

**Contenção**, que é a outra metade do exame: em 8 partidas completas (416 lances comuns), o Plyscope marcou 7 dos 8 brilhantes do gabarito e mais 4 lances. Uma ferramenta que carimba brilhante em lance comum não está informando nada, está distribuindo confete.

A rodada anterior do detector, medida no mesmo cache de avaliações e com o mesmo motor, dava **86 / 100** e exatamente esses mesmos 4 extras — os 7 pontos ganhos não custaram nenhum falso positivo. (A tabela antiga registrava 87 e 3 extras, medidos numa máquina diferente; um lance fica de cada lado da linha conforme o motor.)

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

O detector antigo cobria bem só a terceira. Hoje a detecção parte de **quanto material o adversário consegue ganhar capturando qualquer coisa**, o que cobre as três primeiras de uma vez.

A quarta família também caiu quase inteira, mas por um motivo que não era o esperado: quando o sacrifício "só aparece um lance depois", quase sempre a peça **já está em oferta na posição resultante** — o que não existe ainda é a ameaça que torna a oferta venenosa. Como o `sacrificeInfo` mede oferta e não ameaça, ele enxerga esses casos. Sobrou um único lance do gabarito em que o cálculo de material não tem o que medir na posição seguinte (ver "o que ainda escapa").

Três outras correções valeram vários pontos:

- **Retomar não é oferecer — mas às vezes é.** A regra antiga vetava qualquer retomada, com o argumento de que pegar de volta o que acabou de ser capturado é obrigação, não generosidade. O gabarito mostrou que isso jogava fora um padrão inteiro: retomar **de propósito com a peça errada**, deixando-a em oferta na própria casa da retomada (Bxc4, Qxc5, Nxe6+, Nxd5, Qxd4, Nxe5 — seis dos 100). O veto virou uma pergunta mais estreita, resolvida por um **lance nulo** na posição anterior (`ofertaAnterior`): *o adversário já conseguia ganhar esse mesmo material nessa mesma casa antes do lance?* Se sim, a peça já estava pendurada e o mérito não é da retomada; se não, a oferta nasceu do lance e conta. Vale para partida qualquer, não só para o gabarito: é a diferença entre oferecer e simplesmente não ter arrumado a bagunça anterior. Sozinho, esse ajuste valeu **+7** no acerto e **zero** falso positivo — o único extra que o veto antigo segurava (uma retomada de rei com um bispo que já estava pendurado desde o lance anterior) continua barrado pela pergunta nova.

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
  liquidoGrande: 220, // …a menos que a oferta seja de peça inteira
};
```

Os dois últimos saíram de uma separação nos dados: nas posições já ganhas (mais de 97% de chance de vitória), os brilhantes do gabarito ofereciam de 220 a 400 de material líquido, enquanto as marcações erradas ficavam em 0, 100 e 200. É a diferença entre coroar a partida com um sacrifício de peça e dar uma volta olímpica.

`liquidoGrande` era 250 e desceu para 220 por um motivo que não vem do gabarito: 220 é exatamente o líquido do **presente grego**, Bxh7+, que oferece um bispo (320) e leva um peão (100). É o sacrifício brilhante mais conhecido do xadrez; um corte que o deixasse de fora estaria errado independentemente do que o gabarito dissesse. O corte antigo caía no meio do nada, entre o cavalo líquido de peão (200) e o bispo líquido de peão (220), separando dois sacrifícios que são a mesma coisa. Custo medido: **+1** de acerto, **zero** falso positivo.

## O que ainda escapa

Os 7 casos que faltam, um a um:

| Lance | Por que escapa |
|---|---|
| `Nxc6` | Perda de 6,4% na profundidade 16. Reanalisado a 22, cai para 0,6% — é o caso clássico que a segunda passada do app resolve, mas que o `calibrar.js` não simula (ele mede tudo numa profundidade fixa). |
| `Bc5` | Sacrifício posicional de longo prazo: 7,2% de perda a 16 e ainda 6,6% a 22. A compensação não cabe na profundidade. |
| `Nxe5` | Idem, e pior: 8,5% a 16, 7,7% a 22. |
| `Bxd5` | Oferece 180 e leva um peão: 80 líquido, abaixo do `liquidoMin`. Baixar o limiar para pegá-lo não tem justificativa fora do gabarito. |
| `Nxf7` | Já ganho (98%) oferecendo 200 líquido — um cavalo menos o peão que capturou. Fica 20 abaixo do `liquidoGrande`. |
| `Kxf1` | Retomada em que a torre oferecida **já estava** pendurada antes do lance; o `ofertaAnterior` a barra, corretamente pela regra e incorretamente pelo gabarito. |
| `Rf1+` | O único em que o cálculo de material não tem o que medir: a torre vai para uma casa defendida, a troca ali é par (SEE 0) e o sacrifício de verdade só acontece dois lances depois. Seguir a variante principal do motor não ajuda — o que ela mostra em f1 é uma troca igual, não uma oferta. |

Ou seja: **três dos sete são limite de profundidade, não de detecção**, e só um é de fato uma oferta que o detector não enxerga.
