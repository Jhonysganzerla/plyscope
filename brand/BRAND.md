# Plyscope — manual de marca

> Documento curto de propósito. Se algo aqui brigar com a tela, a tela ganha — mas atualize este arquivo depois.

---

## 1. Nome

**Plyscope** · pronúncia: *plái-scoup*

- **ply** — no vocabulário de motores de xadrez, um *ply* é meio lance (uma jogada de um lado). É a unidade em que o Stockfish pensa e é exatamente a unidade que este app avalia: **todos os plies da partida, um por um**.
- **scope** — instrumento de observação (microscópio, osciloscópio). Não é um site de xadrez, é um **instrumento** que você aponta para a sua partida.

Por que não tem "chess" no nome: o nicho inteiro se chama Chess*alguma coisa* (Chessigma, Chessiro, WintrChess, Chessitup, Chesskit, Centichess). Um nome sem "chess" é o único que sobrevive à busca no GitHub e no Google.

**Domínio/repo alvo:** `plyscope` — `github.com/<user>/plyscope`, `plyscope.dev` / `plyscope.app`.

**Nomes descartados** (com o motivo, para não voltarem):

| Nome | Por que caiu |
|---|---|
| Tabia | Já existe `daxaur.github.io/tabia`: ferramenta de xadrez open source, roda no navegador, importa de Chess.com/Lichess. Mesmo nicho, mesma promessa. |
| Backrank | `backrank.io` importa partidas do Chess.com, acha blunders com Stockfish e treina por repetição espaçada. Colisão funcional direta. |
| Kibitz | Dois clientes de xadrez chamados `kibitz` no GitHub (`fulldecent/kibitz`, `klausthul/kibitz`) e o motor `blitzkibitz`. |
| Brilliancy | Sem colisão exata, mas `wdeloo/Brilliant-Chess` é um analisador open source estilo chess.com — perto demais — e o nome promete só um recurso. |
| Lucena | Limpo, porém se confunde com o **LucasChess** (GUI conhecida) e é nome de cidade/pessoa: péssimo termo de busca. |

## 2. Tagline

- **EN:** *Every move under the scope.*
- **PT:** *Cada lance sob a lupa.*
- **Linha de apoio (meta/descrição):** "Revisão de partidas com Stockfish, 100% no seu navegador."

Regras: a tagline nunca vira slogan de venda ("o melhor", "revolucionário"). Ela descreve o que a ferramenta faz.

## 3. O que a marca promete

Três promessas, nesta ordem:

1. **Nada sai do seu computador.** O motor roda no seu navegador. Sem conta, sem upload, sem telemetria, sem "plano premium".
2. **O veredito é auditável.** Cada selo tem um critério escrito, e o detector de Brilhante é medido contra um benchmark público (87/100), não contra a nossa opinião.
3. **Continua funcionando offline.** Um `index.html`, uma pasta `engine/`, nenhuma fonte externa, nenhum CDN.

Antipromessas: não somos um site de treino, não temos ranking, não damos "aulas", não gamificamos.

## 4. Paleta

Base **grafite** (mantida do app) + um acento **violeta**.

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#101215` | fundo da aplicação |
| `--bg-deep` | `#0b0d0f` | campos, poços |
| `--surface` | `#16191d` | painéis, ladrilho do ícone |
| `--surface-2` | `#1b1f25` | botões em repouso |
| `--surface-3` | `#232830` | botões em hover |
| `--line` | `#282d35` | bordas |
| `--hair` | `#1f242a` | divisórias internas |
| `--tx` | `#e8eaed` | texto principal / casa clara da marca |
| `--tx-2` | `#a4abb4` | texto secundário |
| `--tx-3` | `#767d87` | rótulos, aro da lente |
| **`--accent`** | **`#9081da`** | ação primária, foco, progresso, aba ativa, playhead do gráfico |
| `--accent-hi` | `#a99fe4` | hover do acento |
| `--accent-ink` | `#14112c` | texto sobre preenchimento de acento (contraste ≈ 5,5:1) |
| `--accent-dim` | `#383260` | seleção de texto, filetes |
| `--danger` | `#c9483f` | erro de sistema, realce de xeque |
| `--warn` | `#c8a24a` | avisos |

### Por que o acento deixou de ser verde

O acento anterior era `#8ba463`, verde-musgo. Dois problemas, e os dois valem mais que o apego:

1. **Era o verde do chess.com.** `#81b64c` (marca) e `#7fa650` (tabuleiro) são a assinatura visual exata do produto que o Plyscope substitui. Uma alternativa livre não pode parecer um clone do produto pago.
2. **Colidia com significado.** A escala de classificação já usa todas as cores quentes e frias com sentido: Brilhante `#26c2a3`, Excelente `#5b8bb0`, Melhor `#81b64c`, Ótimo `#95bb4a`, Bom `#96af8b`, Forçado `#8b8987`, Impreciso `#f7c631`, Erro `#ffa459`, Capivarada `#fa412d`. Um acento verde ficava indistinguível do selo "Melhor/Bom" — a moldura competia com o conteúdo.

O violeta `#9081da` é o **único matiz que não significa nada sobre lances**. Daí a regra da casa:

> **Dentro do tabuleiro e dos selos, a cor é semântica e permanece convencional** (verde = bom, ciano = brilhante, vermelho = capivarada).
> **Fora do tabuleiro, a cor é a marca** — e a marca nunca opina sobre o seu lance.

Por isso a seta do "melhor lance" no tabuleiro passou a usar `#81b64c` (o mesmo verde do selo *Melhor*, agora coerente) e o violeta ficou com o cursor do gráfico, os botões e o foco.

## 5. A marca

```
brand/logo.svg          lockup horizontal (marca + logotipo), placa grafite, 380 × 128
brand/mark.svg          símbolo monocromático, currentColor — para docs e embeds
brand/mark-accent.svg   símbolo em duas cores — para fundos grafite
brand/icon.svg          versão reduzida (ícone/favicon), com ladrilho — 16 a 32 px
brand/favicon.svg       cópia de icon.svg, com o nome que os hosts esperam
brand/preview-logo.png  render do lockup (conferência)
brand/preview-marks.png render do símbolo e do ícone em 16/24/32/64/128 px (conferência)
```

No app o favicon **não** aponta para esses arquivos: ele é um data-URI SVG inline no `<head>` do `index.html`, porque a distribuição é um arquivo único e precisa funcionar offline. Se mudar `icon.svg`, mude o data-URI junto.

### O que ela representa

Dois elementos, nenhum cavalo:

- **A lente** — o círculo. O motor olhando para uma posição. É o "scope" do nome.
- **O degrau** — duas casas quadradas encostadas pela quina, subindo da esquerda para a direita. Lê-se de duas formas ao mesmo tempo: **duas casas da mesma cor de um tabuleiro** (o sinal gráfico do xadrez que não é peça) e **um degrau do gráfico de vantagem** — a avaliação subindo um ply. A casa de cima, a que ganhou altura, é a violeta: é o lance que mudou a partida.

### Construção

Grade de 32. Círculo `cx16 cy16 r12,5`, traço 2. Quadrados de 6,5: um em `9,5 / 16` (cor do texto), outro em `16 / 9,5` (acento), tocando-se na quina exata do centro. A folga entre o degrau e o aro é de ~2,3 unidades — não encolha isso.

### Uso

- **Tamanho mínimo com aro:** 20 px. Abaixo disso use `icon.svg` (a lente sai, o degrau cresce e ocupa o ladrilho).
- **Área de respiro:** metade da altura da marca em toda a volta.
- Sobre fundo grafite, sempre. Sobre fundo claro, use `logo.svg` inteiro (ele já traz a placa).
- **Não faça:** girar, inclinar, aplicar gradiente ou sombra, trocar o degrau por uma peça, colorir os dois quadrados de violeta, esticar sem manter proporção, recolorir o aro com uma cor de classificação.
- No app, a marca é inline no `<head>`/topbar (o produto é um arquivo único e **não pode** depender de imagem externa).

### Logotipo

Desenhado em curvas a partir de **Poppins Medium** (SIL OFL) — grotesca geométrica: o "o", o "c", o "e" e a barriga do "p" são círculos, e rimam com a lente. Como está convertido em `<path>`, o SVG não depende de nenhuma fonte instalada. Na interface, o nome usa a pilha do sistema (`--display`): Segoe UI Variable Display / system-ui.

## 6. Tom de voz

Português do Brasil, direto, sem marketês. Quem fala é alguém que entende de xadrez e de software e não está tentando te vender nada.

- **Frases curtas.** Verbo no presente. "O Stockfish avalia todas as posições." Não: "Nossa tecnologia de ponta é capaz de avaliar…"
- **Número em vez de adjetivo.** "87/100 no benchmark" em vez de "detecção excelente".
- **Honestidade sobre limites** é parte da marca: dizemos que somos 87 e que o Chessigma faz 93. Um README que só se elogia não é confiável.
- **Termo técnico sem medo, com tradução na primeira vez.** "chance de vitória (win%)", "ply (meio lance)".
- **Humor:** existe, é seco e mora num lugar só — **"Capivarada"** no lugar de "blunder". É a piada brasileira da casa; não multiplique gírias pelo resto da interface.
- **Nunca:** exclamação em cadeia, emoji em botão, "clique aqui", "revolucionário", "poderoso", "IA" como enfeite.

**Como nos referimos ao chess.com:** com respeito e sem rodeios. Eles cobram pelo Game Review; nós fazemos parecido, de graça, offline. A comparação é factual (números do benchmark), nunca provocação.
