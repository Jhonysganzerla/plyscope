"use strict";
/* ============================================================
   Plyscope — ESLint
   ------------------------------------------------------------
   O QUE ESTE ARQUIVO É: um detector de defeito, não um formatador.
   Aqui não há Prettier, nem regra de aspas, ponto e vírgula, largura
   de linha ou ordem de import. Reformatar 7 mil linhas de código que
   já funciona só serviria para explodir o `git blame` e transformar
   toda revisão futura em arqueologia. As regras abaixo apontam coisas
   que podem QUEBRAR — variável que ninguém usa, `==` que converte tipo
   sem avisar, sombra que esconde a variável de fora, `console` deixado
   para trás — e nada mais.

   COMO RODAR:  cd tools && npm install && npm run lint

   O PROJETO NÃO TEM BUILD DE JAVASCRIPT. O `src/build.py` concatena os
   arquivos de `src/` dentro do `index.html`; não há bundler, não há
   `import`/`export`. Por isso:

   - `src/*.js` é SCRIPT de navegador, não módulo. Cada arquivo se
     pendura em `window.*` (`window.PlyI18n`, `window.Aberturas`,
     `window.PlyClassify`) e o seguinte lê de lá. Para o ESLint isso é
     um monte de global: estão declarados abaixo, um a um, de propósito
     — assim um nome novo aparecendo do nada vira erro em vez de passar.
   - `src/classify.js` é o único arquivo dos dois mundos: roda no
     navegador e em Node (`tools/unit.js`, `tools/calibrar.js`), num
     preâmbulo UMD. Ganha `module`/`require`/`__dirname` além do resto.
   - `src/data/openings.js` é gerado por `tools/gerar-aberturas.js`.
     Continua sendo verificado — dado gerado também quebra — mas não se
     conserta à mão: conserta-se o gerador.
   - `index.html` é a saída do build (os mesmos arquivos, concatenados).
     Verificar de novo o que já foi verificado na origem só duplicaria
     cada aviso, então ele fica de fora, junto do Stockfish (`engine/`)
     e do chess.js (`src/vendor/`), que são de terceiros.
   ============================================================ */
const js = require("@eslint/js");

/* Só o que o código realmente usa. A lista curta é a graça: se amanhã
   alguém escrever `IntersectionObserver`, o ESLint reclama e a pessoa
   decide conscientemente se aquilo entra no orçamento de compatibilidade. */
const NAVEGADOR = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  self: "readonly",
  fetch: "readonly",
  performance: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  Worker: "readonly",
  Blob: "readonly",
  URL: "readonly",
  FileReader: "readonly",
  Image: "readonly",
  getComputedStyle: "readonly",
  matchMedia: "readonly",
};

const NODE = {
  module: "writable",
  require: "readonly",
  exports: "writable",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  fetch: "readonly",
  structuredClone: "readonly",
};

/* Regras de defeito, iguais nos dois mundos.

   As que estão em "off" foram LIGADAS uma vez, rodadas contra o
   repositório inteiro e desligadas por motivo — está escrito ao lado de
   cada uma. Nenhuma foi desligada por dar trabalho. */
const DEFEITO = {
  // `==` converte tipo em silêncio; "smart" continua permitindo `x == null`,
  // que é o idioma corrente para "nulo ou indefinido" e não tem armadilha.
  eqeqeq: ["error", "smart"],
  // uma variável interna com o nome de uma de fora é como nasce um bug de
  // refatoração: você acha que mexeu numa e mexeu na outra.
  "no-shadow": "error",
  "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none" }],
  // `catch (e) {}` é idioma deliberado aqui: localStorage bloqueado, Worker
  // que não termina, revokeObjectURL numa aba já fechada. São 20 ocorrências,
  // todas do tipo "não deu, segue o jogo" — e todas empurram o app para o
  // caminho degradado logo abaixo. Bloco vazio que NÃO seja catch continua erro.
  "no-empty": ["error", { allowEmptyCatch: true }],
  // `except-parens` é o padrão: `() => (el.onclick = fn)` é intenção explícita;
  // o que a regra pega é o `return a = b` sem parênteses, que costuma ser `==`
  // digitado errado.
  "no-return-assign": "error",
  "no-throw-literal": "error",
  "no-self-compare": "error",
  "no-unmodified-loop-condition": "error",
  "no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "no-template-curly-in-string": "error",
  "array-callback-return": "error",
  "no-constant-binary-expression": "error",

  // --- desligadas, com motivo ---
  // Só acusa `new Promise((r) => setTimeout(r, ms))`, o espera-um-pouco que
  // aparece em cinco arquivos. O "retorno" é o id do timer, que ninguém lê.
  // Para calar a regra seria preciso pôr chaves em volta — barulho, não defeito.
  "no-promise-executor-return": "off",
  // Falso positivo conhecido em JavaScript de uma thread só. Acusa
  // `Engine.current = p` depois de um `await` — exatamente o padrão que o
  // código já protege com `if (Engine.current === p)`. Sete acusações, zero
  // corridas reais (não há thread nem worker escrevendo nessas variáveis).
  "require-atomic-updates": "off",
  // Reescrita de estilo, não defeito: mudariam milhares de linhas e o blame junto.
  "no-var": "off",
  "prefer-const": "off",
  "no-param-reassign": "off",
  "no-lonely-if": "off",
};

module.exports = [
  {
    ignores: [
      "index.html",          // gerado por src/build.py a partir de src/
      "engine/**",           // Stockfish (nmrugg/stockfish.js), terceiros
      "src/vendor/**",       // chess.js, terceiros
      "node_modules/**",
      "tools/node_modules/**",
      ".vercel/**",
    ],
  },

  /* --- o app: JavaScript de navegador, sem módulos --- */
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: NAVEGADOR,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...DEFEITO,
      // no app, console.log esquecido aparece no console de quem usa.
      // console.warn/error são intencionais (motor que não sobe, cota estourada).
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  /* --- classify.js roda nos dois lados: navegador e Node --- */
  {
    files: ["src/classify.js"],
    languageOptions: { globals: { ...NAVEGADOR, ...NODE } },
  },

  /* --- ferramentas e suítes: Node --- */
  {
    files: ["tools/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: NODE,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...DEFEITO,
      // aqui o console É a interface: as suítes relatam por ele.
      "no-console": "off",
    },
  },
];
