<!--
Obrigado. Duas coisas derrubam PR aqui com mais frequência do que qualquer
outra: build não comitado (regra 1) e política de segurança fora de sincronia
(regra 2). As duas estão na lista abaixo, e as duas o CI pega.
Apague o que não se aplicar; não apague as caixas.
-->

## O que muda

<!-- Uma frase de quem usa o app, não do diff. -->

## Por quê

<!--
O problema que isso resolve, a alternativa descartada e o motivo. É o corpo do
commit — pode ser o mesmo texto. Se houver número (bytes, segundos, acertos),
ponha o antes → depois.
-->

## Como conferir

<!-- O caminho para alguém reproduzir na mão: PGN, profundidade, o que olhar. -->

---

## Antes de pedir revisão

### O build (regra de ouro nº 1 e nº 2)

- [ ] Editei `src/`, **não** o `index.html` da raiz.
- [ ] Rodei `python3 src/build.py`.
- [ ] `index.html`, `vercel.json` e `_headers` estão **neste mesmo commit**.
      Os três andam juntos: o CSP libera os `<script>` inline por hash SHA-256,
      e hash velho não degrada — bloqueia o app inteiro.
- [ ] `git status` limpo depois do build. (Se o `build.py` mudou algo agora,
      faltava commitar.)

### As suítes

Cinco, e nenhuma precisa baixar motor: o Stockfish está versionado em `engine/`.

```bash
cd tools && npm install
node --test unit.js                            # ~0,2 s
node test-pool.js                              # rápido
python3 ../src/build.py && node test-csp.js    # rápido, e depende do build acima
node test.js ../docs/exemplos/opera-1858.pgn   # ~25 s
node test-treino.js                            # ~24 s
```

- [ ] `unit.js` passa (76 testes).
- [ ] `test-pool.js` passa.
- [ ] `test-csp.js` passa — **rodado depois do build**, senão confere os hashes
      antigos.
- [ ] `test.js` passa.
- [ ] `test-treino.js` passa.
- [ ] Escrevi teste para o que mudou, ou digo abaixo por que não dava.

### Lint

- [ ] `cd tools && npm run lint` não acusa nada **novo** por minha causa.
      (Há apontamentos antigos abertos; a lista não pode crescer.)

### Se encostei em `src/classify.js` (regra de ouro nº 3)

O mesmo arquivo roda no navegador **e** nas ferramentas de medição: mexer nele
muda o número que o README anuncia.

- [ ] Não encostei — pode ignorar o resto desta seção.
- [ ] `node --test unit.js` continua passando, ou os números congelados foram
      atualizados **de propósito** e está explicado acima.
- [ ] Mudei limiar ou regra e **medi**: `node calibrar.js recall 16` e
      `node calibrar.js precisao 8 16`, com o antes → depois no corpo do commit
      (ver `docs/BENCHMARK.md`).
- [ ] Se o veredito de algum lance muda, marquei isto como **major** no
      `CHANGELOG.md`.

### Documentação e histórico

- [ ] `CHANGELOG.md`, seção `[Não lançado]`, atualizado — a menos que nada
      mude para quem usa.
- [ ] `README.md` **e** `README.en.md` atualizados, se a lista de recursos ou o
      modo de rodar mudou. Os dois, nunca só um.
- [ ] Chave nova de tradução existe nas **duas** línguas em `src/i18n.js`.
- [ ] Mensagem de commit no padrão do projeto: assunto em português, sem ponto
      final, corpo explicando o porquê (ver `CONTRIBUTING.md`).

### O que este projeto não aceita

- [ ] Não adicionei nada que precise de **servidor**, conta, banco de dados ou
      telemetria.
- [ ] Não adicionei dependência buscada em **CDN**, bundler, transpilador nem
      formatador automático.
- [ ] Não adicionei origem nova em `connect-src` — ou adicionei e expliquei
      acima, sabendo que isso precisa de conversa antes.
- [ ] Concordo em publicar esta contribuição sob a **GPLv3**.

<!-- Fecha a issue #___ -->
