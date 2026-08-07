# Como tirar as telas do README

Os dois READMEs têm três lugares reservados para imagem e **nenhuma imagem
ainda**. Este arquivo diz exatamente quais telas capturar, com que partida, em
que tamanho e com que nome — para o resultado ser reprodutível e não depender
de gosto.

> **Nenhuma imagem inventada.** Nada de mockup, render ou montagem: as telas são
> capturas do app rodando de verdade. Um app visual sem print é ruim; um print
> que não corresponde ao app é pior.

Enquanto os arquivos não existirem, o README **não fica quebrado**: nos três
lugares há um bloco de texto com o link para o app publicado, e a linha `<img>`
pronta está logo acima, comentada. Trocar um pelo outro é uma linha por idioma.

---

## Os seis arquivos

Três telas × dois idiomas. O par sai da mesma captura: o app troca de idioma
pelos botões `PT`/`EN` no topo **sem recarregar e sem perder a análise**, então
é clicar, esperar a tela reetiquetar e apertar o print de novo — o tabuleiro, a
posição e os números continuam idênticos.

| arquivo | tela | onde aparece |
|---|---|---|
| `tela-tabuleiro-pt.png` | tabuleiro com selos e gráfico | topo do `README.md` |
| `tela-tabuleiro-en.png` | idem, em inglês | topo do `README.en.md` |
| `tela-relatorio-pt.png` | painel Relatório | seção do benchmark, `README.md` |
| `tela-relatorio-en.png` | idem, em inglês | `README.en.md` |
| `tela-treino-pt.png` | treino "Aprenda com seus erros" | fim de Recursos, `README.md` |
| `tela-treino-en.png` | idem, em inglês | `README.en.md` |

Nome em minúsculas, com hífen, sem acento e sem espaço.

## Antes de capturar

1. **Rode local, por um dos atalhos** (`Abrir Plyscope.bat`,
   `Abrir Plyscope.command`, `./plyscope.sh`) — não por `python -m http.server`.
   Só os atalhos mandam os cabeçalhos de isolamento, e a aba **Motor** só mostra
   o modo multi-thread com eles. Alternativa igualmente válida:
   <https://plyscope.vercel.app/>.
2. **Janela em 1440 × 900 px de CSS.** O layout é de aplicativo: o tabuleiro
   fica sempre visível e a página não rola. Abaixo de ~1100 px de largura o
   arranjo muda; acima de ~1600 px sobra vazio nas laterais. 1440 × 900 é o que
   enquadra bem.
3. **Capture só a área da página**, sem barra de endereço, sem abas do
   navegador, sem barra de tarefas. No Firefox e no Chrome dá para capturar o
   nó da aplicação pelo DevTools; recortar à mão também serve, desde que a
   borda fique reta.
4. **Densidade 2×.** Se puder, capture com `devicePixelRatio = 2` (tela Retina,
   ou DevTools → *Device Toolbar* com DPR 2): sai **2880 × 1800 px** e o texto
   não fica borrado em tela de alta densidade. Não dá? 1440 × 900 em 1× serve.
5. **PNG.** Nada de JPEG: o app é interface, com texto fino e áreas chapadas —
   JPEG suja tudo. Passe por um otimizador sem perda (`oxipng`, `pngquant` em
   modo alto, ImageOptim) e **fique abaixo de ~400 KB por arquivo**. Este
   repositório já carrega 14 MB de motor; não engorde com print.
6. **Sem dado pessoal na tela.** Se você usou a busca do Chess.com ou do
   Lichess, o seu nome de usuário fica no campo e nas chapas dos jogadores.
   Capture a partir do PGN colado, como descrito abaixo.
7. **Tema.** Só existe um: o escuro grafite. Não há o que escolher.

## Tela 1 — `tela-tabuleiro-*.png`

O cartão de visita: é a primeira imagem do README e a única que muita gente vai
ver.

**Partida:** [`docs/exemplos/opera-1858.pgn`](../exemplos/opera-1858.pgn) —
Morphy na Ópera de Paris, 1858. Curta, famosa, domínio público e com sacrifício.

**Passos**

1. Aba **Importar** → cole o conteúdo do arquivo → *Analisar partida*.
2. Profundidade **padrão (16)**.
3. Espere terminar (a barra de status para e o relatório aparece).
4. Navegue até uma posição que mostre o trabalho: um lance com selo forte sobre
   a casa, a seta do melhor lance e o gráfico de vantagem já com o desenho da
   partida inteira. As jogadas finais da Ópera (a partir do sacrifício da torre
   em d7) são as mais expressivas.
5. Deixe visível a aba **Lances**, com a lista rolada até o lance atual, para
   aparecerem vários selos de uma vez.

**Precisa aparecer:** tabuleiro, selo sobre a casa do lance jogado, seta do
melhor lance, barra de avaliação, gráfico de vantagem e a lista de lances com
selos. Se algum desses estiver cortado, reenquadre.

## Tela 2 — `tela-relatorio-*.png`

A prova de que o app entrega um relatório, não só uma avaliação.

**Partida:** a mesma da Ópera — assim as duas primeiras imagens conversam.

**Passos**

1. Com a análise pronta, abra a aba **Relatório**.
2. Role o painel até enquadrar, de uma vez: a abertura identificada, a
   **precisão dos dois jogadores**, a contagem por tipo de lance e os
   **momentos decisivos**.
3. O tabuleiro continua à esquerda; não corte — o ponto é mostrar que os dois
   convivem sem rolagem.

**Precisa aparecer:** os dois números de precisão e a contagem por selo. É o que
alguém procura ao decidir se instala.

## Tela 3 — `tela-treino-*.png`

**Partida:** **não** use a da Ópera. Ela não tem Erro nem Capivarada, então a
fila do treino sai vazia — é exatamente por isso que a suíte
[`tools/test-treino.js`](../../tools/test-treino.js) analisa outra partida.
Use a que está lá dentro: o final da **Imortal** (Anderssen × Kieseritzky,
Londres 1851), a partir da posição do lance 16, com os cabeçalhos `SetUp` e
`FEN` que acompanham. Copie o bloco `PGN_TREINO` do arquivo.

**Passos**

1. Cole esse PGN, analise na profundidade **rápida (12)** (é o que a suíte usa,
   e basta para os erros aparecerem).
2. No fim do **Relatório**, clique na chamada do treino.
3. Capture um exercício **no meio**, não o primeiro nem o resumo: tabuleiro na
   posição de antes do erro, girado para quem joga, último lance do adversário
   realçado, sem seta e sem selo entregando a resposta, com o contador de
   progresso ("3 de 7") visível.
4. Bom momento alternativo: logo depois de acertar, com a continuação sendo
   reproduzida e o texto explicando por que aquele lance era melhor.

**Precisa aparecer:** o contador de progresso e o painel do treino. Sem eles a
imagem vira "um tabuleiro qualquer".

## Depois de salvar os arquivos

Nos dois READMEs, nos três pontos marcados, troque o bloco de texto pela linha
`<img>` que está comentada logo acima dele. Deve ficar assim (o `width` é em
pixels de CSS, metade da captura em 2×):

```html
<p align="center">
  <img src="docs/img/tela-tabuleiro-pt.png" alt="Plyscope: tabuleiro com os selos de cada lance, a seta do melhor lance e o gráfico de vantagem" width="900">
</p>
```

No `README.en.md`, o mesmo com `-en.png` e o `alt` em inglês.

Confira antes de commitar:

- [ ] **`alt` descritivo**, dizendo o que se vê — não "screenshot". É o que
      leitores de tela e conexões ruins recebem.
- [ ] Os seis arquivos existem e nenhum passa de ~400 KB.
- [ ] Nenhum print tem nome de usuário, e-mail, aba de outro site ou marcador
      do navegador visível.
- [ ] As três telas em PT e as três em EN mostram a **mesma posição** — foram
      tiradas do mesmo estado, só com o botão de idioma no meio.
- [ ] O `README.md` e o `README.en.md` foram atualizados no **mesmo commit** das
      imagens: meio README com imagem e meio sem é pior que nenhum.
