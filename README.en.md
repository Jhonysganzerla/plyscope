<p align="center">
  <a href="README.md">Português (Brasil)</a> · <b>English</b>
</p>

<p align="center">
  <img src="brand/logo.svg" alt="Plyscope" width="380">
</p>

<h3 align="center">Every move under the lens.</h3>

<p align="center">
  Chess game review with Stockfish 17.1, <b>100% in your browser</b>.<br>
  No account, no server, no subscription — the whole analysis happens on your machine.
</p>

<p align="center">
  <a href="https://plyscope.vercel.app/"><b>▶ Open Plyscope</b></a> — runs in your browser, nothing to install
</p>

<p align="center">
  <a href="#how-to-run"><b>How to run</b></a> ·
  <a href="#the-brilliant-detector"><b>Benchmark</b></a> ·
  <a href="#how-the-classification-works"><b>How it classifies</b></a> ·
  <a href="#license">GPLv3 license</a>
</p>

<!--
  SHOT 1 — the board with the move badges, the best-move arrow and the graph.
  Once docs/img/tela-tabuleiro-en.png exists, replace the block below with:

  <p align="center">
    <img src="docs/img/tela-tabuleiro-en.png" width="900"
         alt="Plyscope: the board with a badge on the played move, the best-move arrow and the advantage graph">
  </p>

  Capture guide (which game, what resolution, what has to be visible):
  docs/img/COMO-TIRAR.md
-->
<p align="center">
  <sub>
    <b>No screenshot yet.</b> No mockups here — and no real capture of the app
    has been taken yet.<br>
    The honest way to see it: <a href="https://plyscope.vercel.app/">open Plyscope</a>,
    paste a PGN and look. Nothing to install.<br>
    Want to help with the shots? The guide is in
    <a href="docs/img/COMO-TIRAR.md"><code>docs/img/COMO-TIRAR.md</code></a>
    (written in Portuguese).
  </sub>
</p>

---

## What it is

Plyscope takes the PGN of one of your games, runs **Stockfish 17.1** inside your own browser, evaluates **every** position and gives back what chess.com's Game Review gives back: accuracy for both players, a badge for every move (Brilliant, Great, Best, Excellent, Good, Forced, Inaccuracy, Mistake, Blunder), an advantage graph, the key moments and an arrow pointing at the move you should have played.

The difference is where that happens: **on your machine**. No position, username or evaluation is ever sent anywhere.

> **Capivarada?** That's the Portuguese name of the badge for the worst kind of move — a Brazilian joke of the project's own. In English the same badge simply reads **Blunder**.

## Why it exists

Reviewing your own games is the single thing that most improves anyone at chess — and it is exactly the thing behind the paywall. On chess.com the full Game Review is a subscription feature; without it you get one review a day. The free alternatives almost always ship your game off to somebody's server.

The engine that does the work is free software (GPL) and has run in WebAssembly for years. There is no technical reason to charge for this, and no reason at all for your game to leave your computer. This repository is the demonstration: one `index.html`, one `engine/` folder, and that's it.

## The Brilliant detector

Marking a move as **Brilliant (!!)** is the hard part: you have to tell a sound sacrifice apart from a hanging piece. Everybody tries, almost nobody gets it right.

So as not to grade its own homework, the detector was calibrated against the **Brilliant Move Benchmark** — the 100 moves chess.com's Game Review flagged as brilliant across 100 real games. Chess.com is the answer key; the question is how many of those 100 each tool also finds.

| Tool | Brilliants found |
|---|---|
| Chess.com *(answer key)* | 100 / 100 |
| **Plyscope** | **93 / 100** |
| Chessigma | 93 / 100 |
| Chessiro | 90 / 100 |
| WintrChess | 45 / 100 |
| Chessitup | 41 / 100 |
| Chesskit | 23 / 100 |

Finding brilliants is easy if you throw confetti at everything. Hence the second measurement, which matters just as much: across **8 complete games — 416 ordinary moves** — Plyscope flagged **4 extra moves** beyond the answer key. It is a conservative detector.

A move only gets the badge after passing four questions:

1. **Was it a choice?** A single legal move has no merit.
2. **Is the offer real?** The opponent must have a **legal** capture that actually wins material — the exchange calculated on the square, not merely "an undefended piece". A pin or a check that prevents the capture doesn't count.
3. **Is it worth what was offered?** All three shapes chess.com rewards count: a piece left on an attacked square, a capture that invites the recapture, and the move that simply ignores a threat somewhere else on the board.
4. **Is it still standing?** After the sacrifice the position has to stay good and the game has to still be a game. Sacrificing when already lost, or with the win in the bag, is not brilliant — unless the offer is a whole piece or more.

Before the verdict, every sacrifice candidate is **re-analyzed at greater depth**, because that is exactly where a shallow analysis gets it wrong: the move looks like a mistake until the engine sees the continuation.

<!--
  SHOT 2 — the Report panel: opening, accuracy for both players, move-type
  counts and key moments. Once the file exists, replace the block below with:

  <p align="center">
    <img src="docs/img/tela-relatorio-en.png" width="900"
         alt="Plyscope's Report panel: accuracy for both players, counts by move type and the game's key moments">
  </p>
-->
<p align="center">
  <sub>
    A capture of the <b>Report panel</b> goes here — accuracy for both players,
    counts by move type and the game's key moments.
    How to take it: <a href="docs/img/COMO-TIRAR.md"><code>docs/img/COMO-TIRAR.md</code></a>.
  </sub>
</p>

## Features

**Input**
- Paste the PGN, drop a `.pgn` file, or pick one with the file dialog.
- Fetch your latest public games by username from **Chess.com** or **Lichess** (public APIs, straight from the browser, no login).
- A PGN with several games becomes a list to pick from.

**Analysis**
- Stockfish 17.1 lite in WebAssembly, running locally — **multi-threaded when the page allows it**, single-threaded when it doesn't (the app decides on its own and says so in the Engine tab).
- Three depths: fast (12), standard (16), deep (20).
- Automatic **second pass**: suspicious moves and sacrifices go back to the engine with 6 extra plies of depth.

**Training**
- **Learn from your mistakes:** after the analysis, the app queues your Mistakes and Blunders, rewinds the board to the position before each one and asks for the best move.
- Get it right and it **plays the continuation** so you see why. Get it wrong and it tells you what the move cost, then offers another try, a hint, or the answer.
- Ends with a summary and a redo of whatever slipped through. Runs **without touching the engine**: it uses the analysis you already have.

**Report**
- Accuracy for both players, using Lichess's published formulas.
- Counts per move type and the **key moments** of the game.
- Clickable advantage graph — click the valley and jump straight to the blunder.

**Board**
- Opens from your side: if the username you typed in the online search is one of the players in the PGN and played Black, the board comes up already flipped. Flip it by hand and your choice wins.
- Pieces **slide** between squares as you step through the game — castling, captures and *en passant* included. Long jumps stay instant, and `prefers-reduced-motion` turns animation off.
- Evaluation bar, best-move arrow and the badge of the move played, right on the square.
- The engine's three best lines, with every move clickable.
- **Free exploration:** click the piece, click the destination, the engine evaluates immediately. *Back to the game* undoes it.
- Automatic playback with adjustable speed (0.6s to 3.5s).
- Sounds synthesized in the browser itself — move, capture, check, castling, promotion, brilliant, mistake and end of game — with a mute button. No audio files.
- Shortcuts: `←` `→` navigate, `Home` / `End` jump to the start and the end, `F` flips, `space` plays, `M` mutes.

**Interface**
- Dark graphite, application layout: the board stays visible at all times, no scrolling.
- **Bilingual: Brazilian Portuguese and English**, with the `PT`/`EN` buttons at the top. Switching is instant and does not lose the analysis on screen — report, badges, graph and saved analyses are relabelled on the spot, without reloading the page. The initial language comes from the browser (`navigator.language`) and your choice is remembered.
- Numbers in each language's format (`96,2%` × `96.2%`, `1,2 s` × `1.2s`), dates likewise, and opening names in both languages — chess notation (SAN/FEN/PGN/ECO) is never translated.
- The worst-move badge reads **Blunder** in English and **Capivarada** — the project's own Brazilian joke — in Portuguese.

<!--
  SHOT 3 — the "Learn from your mistakes" trainer, mid-queue.
  Once the file exists, replace the block below with:

  <p align="center">
    <img src="docs/img/tela-treino-en.png" width="900"
         alt="Plyscope's training mode: the position right before one of your mistakes, with the progress counter and the panel asking for the best move">
  </p>

  Note: the Opera game will NOT do for this shot — it has no serious mistakes,
  so the training queue comes out empty. The guide says which game to use.
-->
<p align="center">
  <sub>
    A capture of the <b>"Learn from your mistakes" trainer</b> goes here — the
    position right before one of your own mistakes, waiting for the right move.
    How to take it: <a href="docs/img/COMO-TIRAR.md"><code>docs/img/COMO-TIRAR.md</code></a>.
  </sub>
</p>

## How to run

### Windows — the short way

**Double-click `Abrir Plyscope.bat`.**

It starts a tiny local server (PowerShell, already on Windows) and opens `http://localhost:8123/index.html` in your browser. Leave the black window open while you use it; close it to shut down.

### macOS

**Double-click `Abrir Plyscope.command`** — Finder opens it in Terminal, the server comes up and the browser opens by itself.

From the terminal it's the same thing:

```bash
./plyscope.sh
```

The first time, macOS may complain that the file came from the internet: right-click → *Open* → *Open*. If the `.command` isn't executable, `chmod +x "Abrir Plyscope.command" plyscope.sh` fixes it.

### Linux

```bash
./plyscope.sh
```

The script uses **Python 3** (which practically every distro already has) and falls back to **Node.js** if it can't find Python. It accepts a fixed port and a quiet mode: `./plyscope.sh 8200 --sem-navegador`.

### On the web

The project is static: `index.html` + `engine/`. It deploys to Vercel, GitHub Pages, Cloudflare Pages or Netlify with no build step — the walkthrough is in [`docs/PUBLICAR.md`](docs/PUBLICAR.md) (in Portuguese). `vercel.json` already serves the `.wasm` with the right type, a one-year cache and the headers for multi-thread mode.

### Any other static server

It works, but in **1 thread**: generic servers don't send the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers the multi-threaded engine needs.

```bash
python3 -m http.server 8123      # then open http://localhost:8123
# or
npx serve .
```

### One thread or several

Plyscope ships two builds of the same Stockfish 17.1 lite and **picks one by itself** when it opens:

| Page | Engine | Threads |
|---|---|---|
| served with `COOP: same-origin` + `COEP: require-corp` | `engine/stockfish-lite.js` | `hardwareConcurrency − 1`, capped at 8 |
| anything else | `engine/stockfish-lite-single.js` | 1 |

Those two headers make the page *cross-origin isolated*, which is the browser's condition for releasing `SharedArrayBuffer` — and without `SharedArrayBuffer` there is no threaded WebAssembly. The Windows, macOS and Linux launchers already send them, and so does Vercel. The **Engine** tab tells you which mode you're in.

If multi-thread doesn't come up (old browser, tight memory), the app falls back to single-thread on its own, without a warning and without breaking anything.

**What about fetching from Chess.com and Lichess?** It keeps working with the headers on. `COEP: require-corp` only blocks `no-cors` requests; the app fetches games with `fetch(..., { mode: "cors" })`, and both APIs answer with `Access-Control-Allow-Origin`, which is enough. That's why `require-corp` was preferred over `COEP: credentialless`: `credentialless` would solve the same problem, but [Safari doesn't implement it](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) — Safari users would lose multi-thread for nothing.

**Why the 7 MB of the multi-threaded engine live in the repository.** Downloading it on demand with a script was considered, and it doesn't pay off: there is no build step here (Vercel publishes the repository as it is, and the Windows `.bat` runs no installer), so an on-demand download would mean either a manual step before first use, or the published site missing the file — in both cases multi-thread simply wouldn't happen. The repository already carried 7 MB of the 1-thread build; going to 14 MB of binary that almost never changes is cheap compared to trading "double-click and it works" for "run the script first". Both `.wasm` files are marked as binary in `.gitattributes`, so Git doesn't try to version their diffs.

### Why you can't just open `index.html`

Double-clicking `index.html` opens the page over `file://`, and then the app loads but **doesn't analyze**. Two reasons, both from the browser and not from the app:

- **WebAssembly:** over `file://` the origin is opaque (`null`), and the browser refuses to instantiate Stockfish's `.wasm` module — it usually complains about MIME type or CORS.
- **Web Worker:** the engine runs on a separate thread, and creating a Worker from `file://` is also blocked by same-origin policy.

A local static server solves both. It serves the files over `http://localhost` and everything stays local: **nothing travels off your machine** — you can turn the internet off after opening the page and the analysis keeps working.

> The first analysis loads the engine from disk (≈ 7 MB of `.wasm`) and takes a few extra seconds. The next ones are instant.

## Structure

```
plyscope/
├─ index.html                     the whole app: interface, board, chess.js and the analysis
├─ Abrir Plyscope.bat             Windows launcher
├─ Abrir Plyscope.command         macOS launcher (double-click in Finder)
├─ plyscope.sh                    macOS and Linux launcher, from the terminal
├─ servidor.ps1                   static PowerShell server, port 8123
├─ engine/
│  ├─ stockfish-lite-single.js    Stockfish 17.1 lite, 1 thread (nmrugg/stockfish.js)
│  ├─ stockfish-lite-single.wasm  ~7 MB
│  ├─ stockfish-lite.js           the same build, multi-threaded
│  └─ stockfish-lite.wasm         ~7 MB
├─ src/                           sources — index.html is generated from here
│  ├─ shell.html                  HTML + CSS (tokens, layout)
│  ├─ app.js                      analysis, classification, board, sound
│  ├─ i18n.js                     pt-BR/en dictionary and language switching
│  ├─ build.py                    glues everything into a single index.html
│  ├─ vendor/chess.esm.js         chess.js (rules, PGN, FEN)
│  ├─ data/openings.js            compacted ECO base (3607 positions, ~78 KB)
│  └─ assets/pieces.svg           piece sprite
├─ tools/
│  ├─ servidor.py                 static server in Python 3 (macOS/Linux)
│  ├─ servidor.js                 the same in Node.js, for those without Python 3
│  ├─ test.js                     (dev) end-to-end test in jsdom, with the real Stockfish
│  ├─ gerar-aberturas.js          (dev) regenerates src/data/openings.js from the ECO base
│  ├─ calibrar.js                 (dev) measures the Brilliant detector against the benchmark
│  └─ tune.js                     (dev) grid search over the thresholds
├─ docs/                          (in Portuguese)
│  ├─ MANUAL.md                   end-user manual
│  ├─ BENCHMARK.md                how the calibration was done and measured
│  ├─ PUBLICAR.md                 publishing on GitHub and Vercel
│  └─ exemplos/opera-1858.pgn     a game to try it out in 10 seconds
├─ brand/
│  ├─ logo.svg  mark.svg  icon.svg  favicon.svg
│  └─ BRAND.md                    name, palette, logo usage, tone of voice
└─ LICENSE                        GPLv3
```


To rebuild the app after touching `src/`:

```bash
python3 src/build.py
```

To test before publishing (runs the real Stockfish, ~35s):

```bash
cd tools && npm install && node test.js ../docs/exemplos/opera-1858.pgn
```

`build.py` injects the sprite, chess.js, the openings base, the language dictionary and `app.js` into the markers in `shell.html` (`<!--__PIECES__-->`, `/*__CHESSJS__*/`, `/*__OPENINGS__*/`, `/*__I18N__*/`, `/*__APP__*/`). Don't remove those markers.

The openings base is generated, not hand-edited. To update it:

```bash
cd /tmp && npm pack chess-openings && tar xzf chess-openings-*.tgz
node tools/gerar-aberturas.js /tmp/package/dist/chess/openings/eco.js
python3 src/build.py
```

### Adding or fixing a translation

Every visible string lives in `src/i18n.js`, in a single dictionary with both languages side by side:

```js
"aba.relatorio": ["Relatório", "Report"],
```

The static HTML is marked with `data-i18n`, `data-i18n-html`, `data-i18n-title`, `data-i18n-placeholder` and `data-i18n-aria`; whatever `app.js` writes dynamically is redrawn from the same state when the language changes. Rebuild with `python3 src/build.py` afterwards.

## How the classification works

The criterion **is not centipawns**. Losing 1.0 of evaluation in a balanced position throws the game away; losing 1.0 when you are already +8 changes nothing. Counting centipawns treats both as the same mistake — and that's why tools that do it fill your won games with "mistakes".

Plyscope uses **winning chances** (win%), the same idea as Lichess and chess.com. The engine's evaluation becomes a win probability through a sigmoid curve, and what gets measured is **how much winning chance the move threw away**:

| Badge | Criterion |
|---|---|
| **Brilliant (!!)** | Sound sacrifice — passed the four questions above. |
| **Great (!)** | Found the only move that held the position. |
| **Best (★)** | Matches the engine's first choice. |
| **Excellent / Good (✓)** | Gave up very little winning chance. |
| **Forced (=)** | It was the only legal move. |
| **Inaccuracy (?!)** | Gave up 5% to 10% of winning chances. |
| **Mistake (?)** | Gave up 10% to 20%. |
| **Blunder (??)** | Gave up more than 20%. In Portuguese this badge is called *Capivarada* — the project's own joke. |

**Accuracy** comes from Lichess's published formulas: the winning-chance loss becomes the move's accuracy, and the game's accuracy is the average of the volatility-weighted mean and the harmonic mean. The numbers land close to chess.com's, but not identical — their formula is closed.

## Credits

This app is a shell around other people's work:

- **[Stockfish](https://stockfishchess.org/)** — the engine. GPLv3. WebAssembly build from **[nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)** (`stockfish-17.1-lite-single`). Full license in `engine/LICENSE-stockfish-GPLv3.txt`.
- **[chess.js](https://github.com/jhlywa/chess.js)** — rules, move generation, PGN and FEN. BSD license.
- **[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)** — the ECO base (code, name and line of every opening) that identifies the game's opening. **CC0 1.0 — public domain.** It got here through Guido Flohr's npm package **[chess-openings](https://www.npmjs.com/package/chess-openings)** (WTFPL), which redistributes that same classification; only the data was reused, compacted by `tools/gerar-aberturas.js` into `src/data/openings.js`. The names are stored in English, as in the source, and the Portuguese comes out at lookup time through the mechanical translator shipped with the base — storing both names would have cost ~36 KB, and this way both languages cost ~4 KB.
- **Pieces** — sprite from **[cm-chessboard](https://github.com/shaack/cm-chessboard)**, drawn by **Cburnett** (Wikimedia Commons), **CC BY-SA 3.0**. If you redistribute the pieces, keep the attribution and the same license.
- **[Lichess](https://lichess.org)** — for the accuracy and winning-chance formulas, published and explained.
- **Chess.com** — for the Game Review, which is the comparison target, and for the Brilliant Move Benchmark having an answer key to measure against.
- **Poppins** (SIL OFL) — the logotype was drawn from it and converted to curves.

## ☕ Support the project

Plyscope is **free, open source and runs in your browser** — no account, no server, no subscription, no tracking. If it helped you understand one of your games, consider buying me a coffee. It keeps the project alive.

### PIX (Brazil)

<img src="docs/img/pix-qr.png" alt="PIX QR Code" width="220">

**PIX key (random):**

```
ac344236-c335-4f89-aee2-e671101d4619
```

**Or the copy-and-paste code:**

```
00020101021126580014br.gov.bcb.pix0136ac344236-c335-4f89-aee2-e671101d46195204000053039865802BR5915Jhony Sganzerla6008BRASILIA62070503***6304EEE4
```

Recipient: **Jhony Sganzerla** · Amount: your call 💛

### GitHub Sponsors

Prefer something recurring? Use the **Sponsor** button at the top of the repository, or go to [github.com/sponsors/Jhonysganzerla](https://github.com/sponsors/Jhonysganzerla).

## Contributing

Welcome. The short path: edit `src/`, run `python3 src/build.py`, run the five
suites in `tools/`, and commit the build together with the source.

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to run, build and test, the three
  golden rules that break the published site when forgotten, the commit-message
  convention and **what will not be accepted** (anything needing a server).
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release.
- [`SECURITY.md`](SECURITY.md) — how to report a vulnerability privately, what
  is in scope and how long a reply takes.

Those three are written in Portuguese, like the commit history. Issues and pull
requests in English are just as welcome.

## License

**GPLv3.** Not out of ideological preference: **Stockfish ships inside this repository**, and Stockfish is GPLv3. Distributing the engine together with the app makes the whole thing a derivative work — GPLv3 is the only possible license for that distribution, and it is the right one.

In practice: use, study, modify and redistribute freely; if you distribute a modified version, it also has to be GPLv3 and come with the source.

chess.js is BSD (compatible) and the pieces are CC BY-SA 3.0, which requires attribution — both are preserved in the credits above. The openings base is CC0 (public domain), so it imposes no condition at all; it is credited anyway.


<p align="center">
  <sub>Made for people who want to understand their own games without asking permission — or paying for it.</sub>
</p>
