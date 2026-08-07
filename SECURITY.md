# Política de segurança

O Plyscope roda **inteiramente no navegador de quem usa**. Não há servidor, não
há banco de dados, não há conta e não há nada nosso para invadir. Isso muda a
forma da superfície de ataque, mas não a elimina: o app processa **texto que
vem de fora** e o transforma em HTML na tela.

Este documento diz o que interessa relatar, para onde mandar e em quanto tempo
você recebe resposta de verdade.

---

## Como relatar

**Não abra uma issue pública** para uma falha explorável.

Duas vias, nesta ordem:

1. **GitHub Security Advisories** — aba *Security* do repositório →
   *Report a vulnerability*. É privado, fica anexado ao repositório e permite
   discutir o patch antes de qualquer coisa aparecer.
2. **E-mail** — <jhonysganzerla@alunos.utfpr.edu.br> (o mesmo endereço que
   assina os commits), com `[plyscope]` no assunto.

O que ajuda a resolver rápido, em ordem de utilidade:

- **o PGN, o nome de usuário ou a resposta de API que reproduz** — colado
  inteiro, mesmo que seja feio; é o insumo do bug;
- o caminho até ele: colou o PGN, arrastou o arquivo, buscou no Chess.com/
  Lichess, reabriu uma análise salva;
- navegador e versão, sistema operacional;
- onde estava rodando: `plyscope.vercel.app`, um dos atalhos locais
  (`.bat` / `.command` / `plyscope.sh`) ou outro servidor estático — importa
  porque o **CSP e os cabeçalhos de isolamento mudam** entre eles;
- o que aconteceu de errado e o que deveria acontecer.

Prova de conceito é bem-vinda. Não precisa vir com correção.

## Versões cobertas

| Versão | Coberta |
|---|---|
| ponta da `main` / o que está em `plyscope.vercel.app` | sim |
| última tag publicada | sim |
| qualquer coisa anterior | não |

Não há branch de manutenção. A correção sai na `main`, e a publicação é um
push: o site estático republica em menos de um minuto. Quem roda uma cópia
local atualiza com `git pull` — e, se editou `src/`, com `python3 src/build.py`.

## O que está no escopo

A superfície real são **duas entradas de dado que o app não controla**:

**1. O PGN.** Colado, arrastado, escolhido no seletor ou vindo da API. Ele é
texto arbitrário, e partes dele (nomes de jogadores, evento, site, data,
resultado, comentários, cabeçalhos) vão parar na tela. Interessa:

- injeção de HTML ou de script por qualquer campo do PGN — inclusive dentro de
  atributo (`title=`, `aria-label=`, `data-*=`), que é onde um escape
  incompleto morde;
- PGN que trave a aba, estoure a memória ou faça o parser rodar sem fim
  (recursão, variantes aninhadas, milhares de lances);
- PGN que faça o app gravar em `localStorage` algo que, ao ser **reaberto**,
  execute — a análise salva é reidratada depois, e esse é o caminho mais fácil
  de esquecer.

**2. A resposta das APIs públicas** de `api.chess.com` e `lichess.org`. O app
consulta as duas direto do navegador, sem login. Um proxy hostil, um DNS
envenenado ou simplesmente um campo estranho na resposta são JSON não confiável
chegando pelo mesmo caminho do item 1. Interessa: qualquer campo dessa resposta
que vire HTML sem escape.

Também está no escopo:

- **desvio da política de segurança de conteúdo** — um jeito de executar script
  no `index.html` publicado apesar do `default-src 'none'` e do `script-src`
  por hash;
- **vazamento de dado para fora da máquina** — qualquer requisição que o app
  faça para uma origem que não seja `self`, `api.chess.com` ou `lichess.org`;
  ou o nome de usuário / o PGN aparecendo em `Referer`, em URL, em
  `sessionStorage` compartilhado, onde não deveria;
- **os servidores locais** (`servidor.ps1`, `tools/servidor.py`,
  `tools/servidor.js`): eles servem a pasta do projeto em `localhost:8123`.
  Travessia de caminho para fora dessa pasta, ou exposição para fora de
  `localhost`, é falha;
- **os cabeçalhos publicados** (`vercel.json`, `_headers`): política que não
  bate com o `index.html` do commit — o que, na prática, quer dizer hash de
  script desatualizado.

## O que está fora do escopo

- **Vulnerabilidades do Stockfish.** O motor é de terceiros
  ([nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), build do
  [Stockfish](https://stockfishchess.org/)) e está versionado em `engine/`.
  Reporte na origem; aqui só entra o que for específico de como o app o carrega
  ou o alimenta.
- **Ataques que exigem a máquina já comprometida** ou que a pessoa cole código
  no console do navegador — o clássico self-XSS. Se o adversário já executa
  código no seu computador, o Plyscope é o menor dos problemas.
- **Abrir o `index.html` em `file://`.** Não é um modo suportado: o navegador
  nem instancia o `.wasm` ali. Está explicado no README.
- **Um fork hospedado sem os cabeçalhos.** O `vercel.json` e o `_headers` vêm
  prontos; quem publica em outro lugar e não os aplica está rodando outra
  configuração, não esta.
- **Falta de HTTPS, de HSTS ou de cabeçalho X-qualquer-coisa na Vercel** — o
  que o projeto controla está em `vercel.json`, e o `tools/test-csp.js`
  confere.
- **Rate limit, disponibilidade ou termos de uso das APIs do Chess.com e do
  Lichess.** Não são nossas.
- **Relatório de scanner automático sem prova de exploração.** "Ferramenta X
  apontou Y" não é um relatório; a reprodução é.

## O que já existe de defesa

Para você não gastar tempo redescobrindo o que está no lugar:

- **Escape de HTML na saída.** Todo dado que vem de fora passa por `esc()`
  antes de virar HTML. Ele escapa `<`, `>`, `&`, `"` e `'` — as aspas entraram
  no commit `8fafe63` justamente porque `esc()` também é usado **dentro de
  atributo**, onde escapar só os sinais de menor e maior não basta. Há teste
  com um nome de jogador hostil (um `<img onerror>` sem aspas, que atravessa o
  parser de PGN de verdade) em `tools/test.js`.
- **Content-Security-Policy por hash, fechada por padrão.** `default-src
  'none'`, e `base-uri`, `form-action`, `frame-ancestors`, `frame-src` e
  `object-src` também em `'none'`. Os `<script>` são inline e liberados
  **um a um por SHA-256 dos bytes** — não há `'unsafe-inline'` em `script-src`,
  nem `'unsafe-eval'`; só `'wasm-unsafe-eval'`, que o Stockfish exige.
  `connect-src` lista exatamente `'self'`, `https://api.chess.com` e
  `https://lichess.org`. `worker-src 'self'` (o motor sobe de `engine/`, nunca
  de `blob:`). `img-src 'self' data:` para o favicon e as setas do CSS.
- **A mesma política em produção e em desenvolvimento.** Os três servidores
  locais leem o CSP do `_headers`, que é gerado pelo `src/build.py` junto com o
  `index.html`. Não existe uma política de "dev" mais frouxa que esconda um
  erro até o deploy.
- **A política não pode envelhecer em silêncio.** `tools/test-csp.js` (66
  conferências) recalcula os hashes a partir do `index.html`, extrai do código
  as origens de `fetch`, o caminho do Worker e os usos de `data:`, confere cada
  um contra as diretivas e sobe os servidores de verdade para checar por HTTP.
  Roda no CI. Um hash velho não degrada: ele bloqueia o app inteiro, e o teste
  cai antes.
- **Isolamento de origem cruzada.** `Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp`, mais
  `X-Content-Type-Options: nosniff` e
  `Referrer-Policy: strict-origin-when-cross-origin`.
- **Nada sai da máquina.** Não há telemetria, analytics, cookie, pixel, fonte
  externa nem CDN. O único tráfego de saída é a busca opcional de partidas nas
  duas APIs públicas, disparada por quem clica.
- **O que fica guardado** é `localStorage` do próprio navegador: até 20 análises,
  o idioma, o nome de usuário digitado na busca e a preferência de som. Sai
  apagando os dados do site.

## Prazo de resposta

Isto é um projeto pessoal, mantido por uma pessoa, sem empresa e sem plantão.
Os prazos abaixo são o que dá para cumprir de verdade — não são um SLA:

| etapa | prazo |
|---|---|
| confirmar que li o seu relato | **até 7 dias** |
| dizer se é falha, e a gravidade | **até 14 dias** |
| correção do que for explorável na `main` | **o mais rápido possível** — costuma ser um arquivo e um push |

Se passar de 14 dias sem resposta nenhuma, assuma que a mensagem se perdeu e
insista, por qualquer uma das duas vias.

Peço **90 dias** de divulgação coordenada antes de tornar público, ou até a
correção estar publicada, o que vier primeiro. Se você preferir prazo menor,
diga no primeiro contato — é conversa, não imposição.

## Reconhecimento

Não há programa de recompensa; não há dinheiro no projeto (ele aceita café, não
o contrário). O que há: crédito no `CHANGELOG.md` e no commit da correção, com
o nome ou o apelido que você escolher — ou nenhum, se preferir anonimato.
