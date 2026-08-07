# Como contribuir com o Plyscope

Obrigado por olhar. O projeto é pequeno de propósito: um `index.html` gerado,
uma pasta `engine/` com o Stockfish e nenhuma infraestrutura. Isso torna
contribuir fácil — e torna algumas regras rígidas, porque não há servidor nem
build de JavaScript para corrigir o que passar batido.

Leia pelo menos a seção **[As três regras de ouro](#as-três-regras-de-ouro)**
antes de abrir um PR. As três já quebraram o site publicado pelo menos uma vez
cada, e as três são invisíveis se você só olhar o próprio diff.

---

## Rodar

Nada para instalar. O app precisa de um servidor estático porque, em `file://`,
o navegador recusa o `.wasm` e o Web Worker do motor.

| Sistema | Como |
|---|---|
| Windows | duplo clique em `Abrir Plyscope.bat` |
| macOS | duplo clique em `Abrir Plyscope.command`, ou `./plyscope.sh` |
| Linux | `./plyscope.sh` |
| Qualquer um | `python3 -m http.server 8123` e abra <http://localhost:8123> |

Os três atalhos do projeto mandam `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp` e o mesmo `Content-Security-Policy`
do site publicado. Um `http.server` genérico não manda nada disso: o app roda,
mas em **1 thread**, e um erro de CSP só apareceria depois do deploy. Prefira os
atalhos.

A aba **Motor**, dentro do app, diz em que modo você está (1 thread, N threads,
pool de N motores). É a primeira coisa a olhar quando um número não bate.

## Construir

O `index.html` da raiz **não se edita**. Ele é montado a partir de `src/`:

```bash
python3 src/build.py
```

O `build.py` injeta o sprite das peças, o chess.js, a base de aberturas, o
`classify.js`, o dicionário de idiomas e o `app.js` nos marcadores do
`src/shell.html` (`<!--__PIECES__-->`, `/*__CHESSJS__*/`, `/*__OPENINGS__*/`,
`/*__CLASSIFY__*/`, `/*__I18N__*/`, `/*__APP__*/`). Não remova os marcadores.

O mesmo comando reescreve o `vercel.json` e o `_headers` — veja a regra 2.

## Testar

São cinco suítes. Duas rodam o Stockfish de verdade (que está versionado em
`engine/`, então não baixam nada) e passam de 20 s cada; as outras três são
instantâneas.

```bash
cd tools
npm install                              # chess.js, jsdom e o ESLint

node --test unit.js                      # ~0,2 s — funções puras de src/classify.js
node test-pool.js                        # rápido — pool de motores, com motor de mentira
python3 ../src/build.py && node test-csp.js   # rápido — hashes do CSP contra o index.html
node test.js ../docs/exemplos/opera-1858.pgn  # ~25 s — ponta a ponta: análise, relatório,
                                              #         navegação, animação, idioma, salvas
node test-treino.js                      # ~24 s — ponta a ponta do "aprenda com seus erros"
```

| arquivo | o que cobre | precisa do motor? |
|---|---|---|
| `unit.js` | SEE, sacrifício, classificação, precisão — as funções puras | não |
| `test.js` | a partida da Ópera do começo ao fim, no DOM | sim |
| `test-treino.js` | o modo de treino, numa partida que **tem** erros graves | sim |
| `test-pool.js` | o escalonador do lote, com avaliação determinística | não |
| `test-csp.js` | cada hash de script, cada origem de `fetch`, os três servidores | não |

`harness.js` é o preparo comum das duas de ponta a ponta: DOM falso, Worker
trocado por um processo Node com o mesmo Stockfish de `engine/`, e a asserção
`conf()` que faz o processo sair com código 1. **O `test-csp.js` precisa do
build atual**: rode `python3 ../src/build.py` antes dele, senão ele confere os
hashes do build anterior.

As duas de ponta a ponta ficaram em arquivos separados porque juntas passavam de
45 s, que é o limite de alguns ambientes. Não junte de volta.

Detalhes de cada uma em [`tools/LEIA-ME.md`](tools/LEIA-ME.md).

## Lint

```bash
cd tools && npm install && npm run lint
```

O ESLint aqui é **detector de defeito, não formatador**. Não há Prettier, não há
regra de aspas, de ponto e vírgula ou de largura de linha, e não vai haver:
reformatar 7 mil linhas que funcionam só apagaria o `git blame` e transformaria
toda revisão futura em arqueologia. O que a configuração pega é variável que
ninguém usa, `==` que converte tipo em silêncio, sombra de variável, `console`
esquecido no app, atribuição sem leitor e o resto do conjunto `recommended`.

As decisões e o motivo de cada regra desligada estão comentados dentro do
[`eslint.config.js`](eslint.config.js) — inclusive por que `catch (e) {}` é
permitido aqui e por que o `require-atomic-updates` está fora.

O lint **ainda não é etapa do CI**: há um punhado de apontamentos abertos em
`src/` e nas suítes, e ligar o gate com o repositório sujo só ensinaria todo
mundo a ignorar CI vermelho. Ele entra no `build.yml` quando a lista zerar.
Enquanto isso: se o seu PR não *aumentar* o número de apontamentos, está bom.

## As três regras de ouro

### 1. `index.html` é gerado — o CI quebra se estiver desatualizado

Você edita `src/`. O `index.html` da raiz é saída, e é **ele** que a Vercel
publica. O job `index-atualizado` do CI reconstrói tudo e compara: commit com
`src/` novo e `index.html` velho falha, sempre.

Rode `python3 src/build.py` e comite o `index.html` **junto** com a mudança em
`src/`. Nunca depois, em commit separado: entre um e outro existe um commit em
que o site publicado não tem a sua correção.

### 2. `vercel.json` e `_headers` carregam os hashes SHA-256 — mesmo commit

O app é um arquivo só, com os `<script>` inline. A política de segurança de
conteúdo libera cada bloco **por hash SHA-256 dos bytes**. Quem calcula esses
hashes é o mesmo `src/build.py`, que reescreve o `Content-Security-Policy` do
`vercel.json` (Vercel) e do `_headers` (Netlify, Cloudflare Pages, e os três
servidores locais, que leem o CSP de lá).

Consequência prática: **mudou uma vírgula em `src/`, os cinco hashes mudam.**
Um hash velho não degrada, ele **bloqueia**: o navegador recusa todos os
scripts e o app abre em branco. Por isso `index.html`, `vercel.json` e
`_headers` viajam no mesmo commit, sempre os três.

E por isso o `.gitattributes` fixa `*.html` e `_headers` em LF: o hash é sobre
os bytes, e um clone no Windows com `core.autocrlf=true` invalidaria os cinco de
uma vez.

### 3. `src/classify.js` é medido — mexer nele muda o benchmark

`src/classify.js` é a lógica pura: win%, precisão, SEE, sacrifício e o veredito
de cada lance. Ele é carregado **pelo navegador** (injetado no `index.html`) e
**por Node**, pelo mesmo caminho, sem cópia paralela: `tools/unit.js`,
`tools/calibrar.js` e `tools/tune.js` importam o mesmo arquivo, byte a byte.

Ou seja: os números que o README anuncia — 93 dos 100 lances brilhantes do
benchmark, 4 marcações extras em 416 lances comuns — saem desse arquivo. Uma
mudança de limiar que "melhora um caso" pode derrubar seis outros sem que nada
no app pareça diferente.

Se o seu PR encosta em `classify.js`:

- rode `node --test unit.js` (76 testes, ~0,2 s) — ele congela os números;
- se mudar limiar ou regra, **meça**: `node calibrar.js recall 16` e
  `node calibrar.js precisao 8 16`, com o método descrito em
  [`docs/BENCHMARK.md`](docs/BENCHMARK.md) e a proveniência dos casos em
  [`bench/PROVENIENCIA.md`](bench/PROVENIENCIA.md);
- ponha o antes → depois no corpo do commit, como o histórico já faz
  (`86->93/100`). Número medido, não impressão.

## Mensagens de commit

O histórico é em **português** e não usa Conventional Commits. O padrão que
existe, e que o próximo commit deve seguir:

- **Assunto:** uma frase que descreve o que passou a ser verdade, na primeira
  linha, sem ponto final. Quando ajuda, um prefixo de **área** em vez de tipo:
  `docs:`, `CI:`, `README:`, `App:`, `Tabuleiro:`, `Brilhante:`. Cabe numa
  linha de terminal.
- **Corpo:** o *porquê*, em prosa, quebrado por volta da coluna 76. É onde vai
  a alternativa que foi descartada e o motivo, o custo em bytes ou em segundos,
  e o número medido antes e depois.
- **Sem** emoji, sem "wip", sem "ajustes", sem "fix typo" solto.

Exemplos que estão no histórico:

```
Brilhante: retomada só é vetada quando a peça já estava pendurada (86->93/100)
Analisa a partida num pool de motores, em vez de uma posição por vez
esc() escapa aspas, teste de nome de jogador hostil e fim da promessa de offline
docs: instruções de publicação (GitHub + Vercel) e CI que confere o build
```

Um commit, um assunto. Se a mensagem precisa de "e também", provavelmente são
dois commits — com a exceção da regra 1: build gerado e fonte vão juntos.

## Versionamento

O projeto passou a ser versionado em **`v1.0.0`**, que marca o estado descrito
no `CHANGELOG.md`: app completo, cinco suítes, CSP por hash e a medição do
detector de Brilhante publicada.

Daqui em diante, [SemVer](https://semver.org/lang/pt-BR/) lido do ponto de vista
de quem *usa* e de quem *deriva* o projeto:

- **PATCH** (`1.0.1`) — correção que não muda selo, número nem interface.
- **MINOR** (`1.1.0`) — recurso novo, idioma novo, tela nova; nada do que já
  existia passa a se comportar diferente.
- **MAJOR** (`2.0.0`) — **qualquer mudança de veredito**. Se um lance que era
  *Melhor* passa a ser *Brilhante*, se a precisão da mesma partida muda de
  número, ou se uma análise salva por uma versão anterior deixa de reabrir, é
  major. O contrato deste projeto é o julgamento, não a API.

Mudança nos limiares de `classify.js` que altere o benchmark é major mesmo que
o diff tenha três linhas. É o que a regra 3 está protegendo.

Cada versão é uma **tag anotada** na `main`, com a seção correspondente do
`CHANGELOG.md`:

```bash
git tag -a v1.1.0 -m "..."
git push origin v1.1.0
```

O `CHANGELOG.md` segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/):
o que entrar vai para `[Não lançado]` e desce para a versão na hora da tag.
Nada de "melhorias diversas" — se o commit não diz o que mudou, o changelog
também não vai saber.

## O que **não** entra

Antes de investir tempo, saiba o que vai ser recusado — não por gosto, por
arquitetura:

- **Qualquer coisa que precise de servidor.** Conta de usuário, login, banco de
  dados, análise na nuvem, fila, histórico sincronizado entre aparelhos,
  telemetria, analytics, contador de visitas. O projeto inteiro existe para
  provar que a análise não precisa sair da sua máquina; um back-end apagaria a
  tese junto com a privacidade.
- **Dependência buscada em CDN** (fonte, biblioteca, ícone). A distribuição é um
  arquivo só, e o `Content-Security-Policy` fecha `default-src 'none'`. Um
  `<link>` para fora não passa nem pelo CSP nem pela revisão.
- **Nova origem em `connect-src`** sem discussão prévia. Hoje são duas:
  `api.chess.com` e `lichess.org`, as duas públicas e sem login. Cada origem
  nova é um lugar a mais para onde o nome do jogador pode vazar.
- **Bundler, transpilador, framework, passo de build de JavaScript.** O
  `build.py` concatena arquivos e calcula hash; é o build inteiro e vai
  continuar sendo.
- **Formatador automático** rodando sobre o código existente. Veja a seção de
  lint.
- **Número no README sem medição atrás.** "Mais preciso", "mais rápido" e
  "melhorado" não entram; `93/100` entra, com o script que reproduz.

Ideia que não se encaixa aqui pode encaixar num fork — é GPLv3, exatamente para
isso.

## Licença

Ao contribuir, você concorda em publicar a sua contribuição sob a **GPLv3**, a
mesma licença do projeto. Não há CLA e não vai haver.

A GPLv3 não é preferência: o Stockfish vai dentro deste repositório e é GPLv3.
Detalhes na seção *Licença* do [README](README.md).
