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

- **`vercel.json`** — `.wasm` servido como `application/wasm`, `engine/` com cache imutável de um ano (o motor de 7 MB baixa uma vez só por visitante) e `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` em tudo, que é o que libera o motor multi-thread. Esses dois cabeçalhos não atrapalham a busca de partidas: o app consulta o Chess.com e o Lichess em modo `cors`, e o COEP só barra requisições `no-cors`.
- **`.vercelignore`** — sobem só o `index.html` e a pasta `engine/`. As fontes, ferramentas, documentação e a marca continuam no GitHub, mas fora do deploy.
- **`.github/workflows/build.yml`** — a cada push, o CI reconstrói o `index.html` a partir de `src/` e falha se o arquivo commitado estiver desatualizado. Assim o site publicado nunca fica diferente do código.

### Depois de publicar

- **Domínio:** Project → Settings → Domains, se quiser um próprio.
- **Banda:** cada primeira visita baixa ~7,2 MB do motor (depois fica em cache). O plano Hobby dá 100 GB/mês, o que dá umas 13 mil primeiras visitas. Se um dia estourar, o caminho é trocar o motor pela versão `asm.js` menor ou hospedar o `.wasm` num CDN gratuito.
- **Hobby é para uso não comercial.** Projeto pessoal e open source se encaixa.

## Alternativas equivalentes

Como o projeto é 100% estático, qualquer hospedagem serve:

| Onde | Como | Observação |
|---|---|---|
| **GitHub Pages** | Settings → Pages → branch `main` | Já está no GitHub; serve `.wasm` corretamente. Não deixa configurar cabeçalho: o motor roda em 1 thread. |
| **Cloudflare Pages** | Conecta o repo | Banda ilimitada — a melhor opção se o `.wasm` de 7 MB virar problema. Aceita um arquivo `_headers` com COOP/COEP para o multi-thread. |
| **Netlify** | Arrastar a pasta ou conectar o repo | Aceita deploy por arrastar, sem precisar do Git. Também usa `_headers`. |

Para o multi-thread funcionar fora da Vercel, o servidor precisa mandar em todas as respostas:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Sem eles nada quebra — o app apenas cai para o motor de 1 thread e avisa disso na aba Motor.

## Rodando local, sem nada disso

`Abrir Plyscope.bat` (Windows), `Abrir Plyscope.command` (macOS) ou `./plyscope.sh` (macOS e Linux). Na mão, `python3 -m http.server 8123` também serve — só que sem os cabeçalhos COOP/COEP, ou seja, com o motor em 1 thread.
