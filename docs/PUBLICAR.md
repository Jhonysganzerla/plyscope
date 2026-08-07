# Publicar no GitHub e na Vercel

O repositório local já existe: `git init` feito, tudo adicionado, primeiro commit criado no branch `main`. Falta o que exige a sua conta.

## 1. Criar o repositório no GitHub

**Com o GitHub CLI** (se tiver o `gh` instalado, é uma linha só — ele cria e envia):

```bash
cd "%USERPROFILE%\Desktop\plyscope"
gh repo create plyscope --public --source=. --remote=origin --push
```

**Sem o `gh`:** crie o repositório vazio em <https://github.com/new> — nome `plyscope`, público, **sem** README, sem .gitignore e sem licença (já existem aqui) — e depois:

```bash
cd "%USERPROFILE%\Desktop\plyscope"
git remote add origin https://github.com/SEU-USUARIO/plyscope.git
git push -u origin main
```

O push leva alguns segundos: são ~7,7 MB, quase tudo o `.wasm` do motor.

> O commit inicial está assinado como *Jhony Sganzerla <jhonysganzerla@alunos.utfpr.edu.br>*. Para trocar antes de enviar:
> `git config user.name "..."` e `git config user.email "..."`, depois `git commit --amend --reset-author --no-edit`.

## 2. Importar na Vercel

1. <https://vercel.com/new> → **Import Git Repository** → autorize o GitHub, se ainda não autorizou → escolha `plyscope`.
2. **Framework Preset:** `Other`. **Root Directory:** `./`. Deixe *Build Command* e *Output Directory* vazios — é site estático, não tem build.
3. **Deploy.** Em torno de meio minuto e o site está no ar em `plyscope-<algo>.vercel.app`.

A partir daí, todo `git push` na `main` republica sozinho.

### O que já está configurado para a Vercel

- **`vercel.json`** — `.wasm` servido como `application/wasm`, `engine/` com cache imutável de um ano (o motor de 7 MB baixa uma vez só por visitante), `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` em tudo, que é o que libera o motor multi-thread, e o `Content-Security-Policy` (a seção seguinte explica). Os dois cabeçalhos de isolamento não atrapalham a busca de partidas: o app consulta o Chess.com e o Lichess em modo `cors`, e o COEP só barra requisições `no-cors`.
- **`_headers`** — os mesmos cabeçalhos no formato da Netlify e da Cloudflare Pages. Gerado pelo `src/build.py` a partir do `vercel.json`, para as hospedagens não divergirem. Os servidores locais leem o CSP daqui.
- **`.vercelignore`** — sobem só o `index.html` e a pasta `engine/`. As fontes, ferramentas, documentação e a marca continuam no GitHub, mas fora do deploy.
- **`.github/workflows/build.yml`** — a cada push, o CI reconstrói `index.html`, `vercel.json` e `_headers` a partir de `src/` e falha se o commit estiver desatualizado; depois roda o `tools/test-csp.js`. Assim o site publicado nunca fica diferente do código.

### Depois de publicar

- **Domínio:** Project → Settings → Domains, se quiser um próprio.
- **Banda:** cada primeira visita baixa ~7,2 MB do motor (depois fica em cache). O plano Hobby dá 100 GB/mês, o que dá umas 13 mil primeiras visitas. Se um dia estourar, o caminho é trocar o motor pela versão `asm.js` menor ou hospedar o `.wasm` num CDN gratuito.
- **Hobby é para uso não comercial.** Projeto pessoal e open source se encaixa.

## A política de segurança de conteúdo (CSP)

O `index.html` é um arquivo só, com o JavaScript todo em `<script>` inline. Isso normalmente obriga a `script-src 'unsafe-inline'`, que é o mesmo que não ter CSP: qualquer HTML injetado vira código executado. A saída aqui é liberar cada bloco **por hash**: o `src/build.py`, no mesmo comando em que monta o `index.html`, calcula o SHA-256 dos bytes de cada `<script>` e escreve as diretivas no `vercel.json` e no `_headers`.

Consequência prática, e ela é dura: **mexeu em qualquer arquivo de `src/`, rode `python3 src/build.py` e comite os três arquivos juntos.** Um hash velho não degrada nada, ele bloqueia todo o JavaScript da página — o app abre em branco. O CI confere isso a cada push, e o `tools/test-csp.js` confere na sua máquina.

### Diretiva por diretiva

| Diretiva | Por que existe | O que quebra sem ela |
|---|---|---|
| `default-src 'none'` | Tudo é proibido até que uma diretiva abaixo permita. É o que faz o resto da lista ser uma lista de exceções conscientes. | Nada; é o alicerce. Sem ela, todo tipo de recurso não listado passaria livre. |
| `script-src 'self' 'wasm-unsafe-eval' 'sha256-…' ×5` | Os cinco hashes são os blocos inline (chess.js, aberturas, classificação, i18n, app). `'self'` é para o `importScripts` que o Stockfish faz **dentro** do Worker. `'wasm-unsafe-eval'` libera compilar WebAssembly sem liberar `eval()` de JavaScript. | Hash errado: página em branco. Sem `'self'`: o Worker sobe e morre no `importScripts`. Sem `'wasm-unsafe-eval'`: o motor não compila e a análise nunca começa. |
| `style-src 'self' 'unsafe-inline'` | Decisão explicada abaixo. | Sem `'unsafe-inline'`: a página perde o CSS inteiro e os `style=` do HTML gerado. |
| `img-src 'self' data:` | O favicon é um `data:image/svg+xml` e a setinha dos `<select>` é um `background-image: url("data:image/svg+xml…")`. | Sem `data:`: some o ícone da aba e a seta dos menus. |
| `connect-src 'self' https://api.chess.com https://lichess.org` | `'self'` é o download do `.wasm` do motor (o Emscripten busca por XHR/fetch). As duas origens são exatamente as APIs que a aba **Buscar** consulta — inclusive as URLs dos arquivos mensais, que a própria API do Chess.com devolve e que ficam sob `api.chess.com`. | Sem `'self'`: o motor não carrega. Sem uma das origens: a busca de partidas falha com erro de rede, e nada mais. |
| `worker-src 'self'` | O motor roda em Web Worker carregado de `engine/`. Vale a pena repetir por que **não** precisa de `blob:`: o app passa um caminho relativo ao `new Worker()`, e o loader do Stockfish monta a URL dos workers de *pthread* a partir de `self.location` — nunca de um `URL.createObjectURL`. O único ponto do loader que usaria Blob depende de um `mainScriptUrlOrBlob` que o app não define. | Sem ela: nenhuma análise, em nenhum modo. |
| `child-src 'self'` | Rede de segurança: navegador que só implementa CSP 2 ignora `worker-src` e cai no `child-src`. | Sem ela: Worker bloqueado em navegador antigo. |
| `frame-src 'none'` | O `child-src 'self'` acima também serviria de *fallback* para iframes; esta diretiva fecha essa porta de volta. | Nada — o app não embute ninguém. |
| `frame-ancestors 'none'` | Ninguém embute o Plyscope num iframe: sem isso, dá para sobrepor uma página falsa nos botões (*clickjacking*). Só funciona por cabeçalho HTTP; um `<meta>` não serve. | Nada. |
| `base-uri 'none'` | Um `<base href>` injetado reapontaria `engine/stockfish-lite.js` para um servidor de terceiros. Fecha um desvio clássico de CSP. | Nada — o app não usa `<base>`. |
| `form-action 'none'` | O app não tem `<form>`; nenhum envio deve sair daqui. | Nada. |
| `object-src 'none'` | Plugins/`<object>` são um jeito antigo e conhecido de escapar do `script-src`. | Nada. |

Faltam de propósito: `font-src`, `media-src`, `manifest-src` e afins — o `default-src 'none'` já bloqueia todos, e o app não usa nenhum.

### Por que `style-src` fica com `'unsafe-inline'`

O CSS também poderia ser liberado por hash — o `<style>` do `<head>` é um bloco só, e o build já sabe hashear. Mas **basta um hash no `style-src` para o `'unsafe-inline'` ser ignorado**, e aí param também os atributos `style=`, que são outra coisa: são 25 no `index.html`, entre o `style="display:none"` do sprite de peças e os `style="color:…"` que o relatório gera para cada classificação de lance. A alternativa seria `style-src-attr 'unsafe-inline'` junto do hash, mas essa diretiva é do CSP 3 e navegador que não a conhece cai de volta no `style-src` — ou seja, o sprite de 12 peças apareceria gigante no meio da página em quem estivesse desatualizado. Não vale o risco: CSS injetado é um problema de aparência e de vazamento por seletor, e as saídas que ele usaria (`img-src`, `connect-src`, fontes externas) já estão fechadas. O que interessa mesmo — script — continua preso a hash.

Se um dia os `style=` sumirem do código, trocar por hash é uma linha no `monta_csp()` do `src/build.py`.

### Onde a política é aplicada

Nos três servidores locais também, e não por capricho: um CSP que só existe em produção é um CSP que você descobre quebrado depois do deploy. O `servidor.ps1`, o `tools/servidor.py` e o `tools/servidor.js` leem a linha `Content-Security-Policy:` do `_headers` e mandam o mesmo cabeçalho em toda resposta. Nenhum dos três repete a string: se repetissem, um dia divergiriam. Se o `_headers` não existir, eles avisam no terminal e servem sem CSP, para não deixar quem só quer analisar uma partida com o app quebrado.

Um detalhe que morde: o hash é sobre os **bytes** do arquivo. Um clone no Windows com `core.autocrlf=true` trocaria LF por CRLF no `index.html` e invalidaria os cinco hashes de uma vez. Por isso o `.gitattributes` fixa `*.html text eol=lf`, e o `build.py` grava com `newline="\n"` explícito.

### Conferindo

```bash
python3 src/build.py            # gera index.html + vercel.json + _headers
cd tools && node test-csp.js    # 66 conferências, sempre DEPOIS do build
```

O `tools/test-csp.js` recalcula os hashes a partir do `index.html`, compara com o que o `vercel.json` e o `_headers` declaram, extrai do código as origens de `fetch`, o caminho do Worker e os usos de `data:` e confere um a um contra as diretivas — e ainda sobe o servidor local em Node e em Python para verificar por HTTP que os cabeçalhos saem iguais aos da hospedagem. Do `servidor.ps1` ele faz revisão estática, porque PowerShell não roda fora do Windows.

O que ele **não** cobre: o veredito final é do navegador. Depois de publicar, vale abrir o console uma vez e confirmar que não há nenhuma mensagem `Refused to …`, especialmente com o motor multi-thread ativo (a aba **Motor** mostra o número de threads).

## Alternativas equivalentes

Como o projeto é 100% estático, qualquer hospedagem serve:

| Onde | Como | Observação |
|---|---|---|
| **GitHub Pages** | Settings → Pages → branch `main` | Já está no GitHub; serve `.wasm` corretamente. Não deixa configurar cabeçalho nenhum: o motor roda em 1 thread **e o site fica sem CSP**. |
| **Cloudflare Pages** | Conecta o repo | Banda ilimitada — a melhor opção se o `.wasm` de 7 MB virar problema. Lê o `_headers` que o build gera, com COOP/COEP e CSP. |
| **Netlify** | Arrastar a pasta ou conectar o repo | Aceita deploy por arrastar, sem precisar do Git. Também usa o `_headers` — leve o arquivo junto do `index.html` e da pasta `engine/`. |

Para o multi-thread funcionar fora da Vercel, o servidor precisa mandar em todas as respostas:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

E, junto com eles, a linha `Content-Security-Policy` do `_headers` — o arquivo que o `src/build.py` gera. Numa hospedagem que não deixa configurar cabeçalho, como o GitHub Pages, o app funciona igual, só que sem nenhuma das duas proteções.

Sem eles nada quebra — o app apenas cai para o motor de 1 thread e avisa disso na aba Motor.

## Rodando local, sem nada disso

`Abrir Plyscope.bat` (Windows), `Abrir Plyscope.command` (macOS) ou `./plyscope.sh` (macOS e Linux). Esses três caminhos mandam os mesmos cabeçalhos do site publicado, CSP incluído — é de propósito: um erro de política tem que aparecer na máquina de quem programa, não depois do deploy.

Na mão, `python3 -m http.server 8123` também serve — só que sem COOP/COEP (motor em 1 thread) e **sem CSP**, então não use isso para testar mudanças no `index.html`.
