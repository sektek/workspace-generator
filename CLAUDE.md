# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@sektek/workspace-generator` — a **local development workspace**, not a monorepo. It used to be an
npm workspace monorepo that built the Yeoman-based `@sektek` generators directly; each package has
since been extracted into its own published, independently-versioned repo (see Workspace layout).
This repo's remaining job is to aggregate local clones of those sibling repos — via
`scripts/clone-siblings.sh` — under npm workspaces, so you can develop/test across all of them at
once without juggling five separate checkouts by hand. It also still holds `templates/template-ts`,
a standalone template skeleton unrelated to the generator packages.

`nx.json` is present but **not used** — dead config kept around, not tooling (unchanged from before
the split; see Known gaps).

## Workspace layout

`libs/generator`, `libs/generator-test`, `generators/generator-base`, `generators/generator-js`, and
`tools/gen` are **gitignored local clones**, not tracked in this repo's own git history — same
pattern as the pre-existing `third-party/` checkout. Each is a fully independent git repo with its
own remote; `git status`/`git add` at this repo's root never sees anything inside them, and commits
made inside one only affect *that* repo, not `workspace-generator`. Run
`sh scripts/clone-siblings.sh` to clone all 5 in (idempotent — skips any path that already has a
`.git` directory); a fresh checkout of `workspace-generator` starts with all 5 directories absent
until you run it.

| Directory | Repo | npm package |
|---|---|---|
| `libs/generator` | [`sektek/generator`](https://github.com/sektek/generator) | `@sektek/generator` |
| `libs/generator-test` | [`sektek/generator-test`](https://github.com/sektek/generator-test) | `@sektek/generator-test` |
| `generators/generator-base` | [`sektek/generator-base`](https://github.com/sektek/generator-base) | `@sektek/generator-base` |
| `generators/generator-js` | [`sektek/generator-js`](https://github.com/sektek/generator-js) | `@sektek/generator-js` |
| `tools/gen` | [`sektek/gen`](https://github.com/sektek/gen) | `@sektek/gen` |

npm workspaces are defined in the root `package.json` (`generators/*`, `libs/*`, `tools/*`) exactly
as before the split — one `npm install` at the root links all 5 for local cross-package dev (a
generator-base fix is picked up by tools/gen's local run without publishing first), even though each
also independently builds/tests/lints/releases/publishes as its own standalone package. Each keeps
its own `package.json`, `tsconfig.json`/`tsconfig.build.json`, `.mocharc.cjs`, and `eslint.config.js`
(mirroring the root configs), plus its own `.release-it.js`/`.github/workflows/` publishing pipeline
— see each repo's own README for its specifics (sub-generator breakdown, CLI usage, etc.); not
duplicated here to avoid drift.

Dependency order when building by hand across the clones: `libs/generator` first (everything else
depends on it), then `libs/generator-test`, then `generators/generator-base` and
`generators/generator-js`, then `tools/gen` (depends on both generator packages' built `dist/`).

- **`templates/template-ts`** — a template project skeleton (its own package.json/tsconfig/etc.),
  intended as the boilerplate a generator scaffolds out, not a package that's built/tested itself.
  Unrelated to the generator packages; untouched by the repo split.
- **`third-party/`** — gitignored reference checkouts of `yeoman-generator` and `generator-jhipster`
  source, kept locally for reading how mature Yeoman generators are structured. Not part of the build.

## Generator wiring conventions

These apply to code inside the cloned generator packages (`libs/generator`,
`generators/generator-base`, `generators/generator-js`), not to `workspace-generator` itself:

- Generator packages export a default class per sub-generator directory, matching Yeoman's
  `generators/<name>/index.js` discovery convention.
- Lifecycle/queue methods are named `task<QueueName>` — e.g. `taskWriting`, `taskInitializing`.
  yeoman-generator's `taskPrefix` matching is a literal `` `${taskPrefix}${priorityName}` ``
  concatenation with **no capitalization applied**, and the built-in priority names
  (`initializing`, `prompting`, `configuring`, `default`, `writing`, `transform`, `conflicts`,
  `install`, `end`) are all-lowercase — so without help, task methods would have to be named
  e.g. `taskwriting`. `CoreGenerator`'s constructor avoids that by calling `registerPriorities()`
  to alias each built-in queue under a PascalCase `priorityName` pointing at the same `queueName`
  (`PRIORITY_ALIASES` in `libs/generator/src/core-generator.ts`), so `taskWriting` is discovered and
  runs at the same point in the lifecycle a plain `taskwriting` would have — aliasing an
  already-registered `queueName` is a no-op (`Environment#addPriority`), not a second queue. If a
  method's case doesn't exactly match either the alias or the raw priority name, it's silently never
  discovered (no error at define time) and the generator throws `This Generator is empty. Add at
  least one method for it to run.` the moment it runs — that mismatch is easy to reintroduce, so
  double-check casing against `PRIORITY_ALIASES` when adding a new lifecycle method.
- `composeWith` calls generator names unqualified (e.g. `'editorconfig'`) and relies on the owning
  generator's `package` field for namespacing — don't hardcode the `@sektek/base:` prefix by hand.
- Templates for a sub-generator live in `generators/<name>/templates/*.ejs`, referenced via
  `this.templatePath('<file>.ejs')`.

## Code style

Imports are grouped into up to three blocks, separated by a blank line, in this order: Node built-ins
(`path`, `url`, …), then dependencies (npm packages and `@sektek/*` packages alike — e.g. `chai`
and `@sektek/generator-test` are the same block), then local relative imports (`./index.js`,
`../lib/foo.js`). Enforced by `import/order` (`groups: ['builtin', ['external', 'internal'],
['parent', 'sibling', 'index']]`, `newlines-between: 'always'`) in every package's `eslint.config.js`;
`sort-imports` (already configured with `allowSeparatedGroups: true`) alphabetizes by first imported
binding name within each block. Run the package's `lint` script (with `--fix` for prettier/import-order
issues) to check and fix. Applies identically across all 5 cloned packages and this repo's own config.

## Commands

Run from the repo root unless noted. First-time setup: `sh scripts/clone-siblings.sh && npm install`
(the clones must exist before `npm install` can link them as workspaces). Do not use the root
`npm run build` script or any `nx` command — `nx.json` is present but unused (see What this is).

`workspace-generator.code-workspace` opens all 6 (this repo plus the 5 clones) as separate VS Code
workspace folders — each keeps its own source control view/status despite living under this repo's
directory tree, since they're independent git repos.

- **Build a single package:** `npm run build --workspace=<pkg>` (e.g.
  `npm run build --workspace=@sektek/generator`), or `cd` into the package and run `npx tsc -p tsconfig.build.json`
- **Build everything:** run the above for each package in dependency order — `libs/generator`,
  `libs/generator-test`, `generators/generator-base`, `generators/generator-js`, `tools/gen`.
- **Lint a package:** `cd <package-dir> && npm run lint` (there is no root-level lint script yet)
- **Run all tests:** tests are per-package (each has its own `.mocharc.cjs` and `test` script); run
  `cd <package-dir> && npm test`. Mocha config uses `tsx/esm` as the loader with BDD-style
  (`describe`/`it`) specs matched by `**/*.spec.[jt]s`.
- **Run a single test file:** `cd <package-dir> && npx mocha <path-to-file>.spec.ts`
- **Coverage:** `cd <package-dir> && npm run test:cover` (runs `c8 npm run test`)
- **Try the generator locally:** after building `generator-base`, `generator-js`, and `tools/gen` (in
  that order), `bin/gen <generator>` (e.g. `bin/gen js:app`) or `bin/gen list` to see every available
  namespace — resolves `tools/gen`'s built `dist/src/bin.js` by absolute path, since nothing in this
  repo puts `gen` on `$PATH`. For source-mode iteration on `tools/gen` itself without a build step:
  `npm run dev --workspace=@sektek/gen -- <args>`. Via Docker: the root `Dockerfile` builds every
  workspace and sets `ENTRYPOINT ["/app/bin/gen"]` — the clones must exist on disk before running
  `docker build` (there's no `.dockerignore` excluding them, so `COPY . /app` picks them up despite
  being gitignored; Docker's build context isn't governed by `.gitignore`). Once installed via npm,
  `@sektek/gen` also works as a real global CLI (`npm install -g @sektek/gen`) independent of any of
  this — see that repo's own README.

## Test conventions

Specs sit next to source as `*.spec.ts` and use `chai` (`expect`) + `@sektek/generator-test`'s shared
`helper.run(...)`. Invoke the generator under test by absolute path
(`helper.run(join(__dirname, 'index.js'))`), not by namespace or bare name — see Known gaps below for
why. This returns `{ generator, fs }`; assert `fs.exists(...)` for scaffolded files and `generator` for
the class instance. See `generators/generator-base/generators/*/index.spec.ts` for the pattern, and
`generators/generator-base/generators/app/index.spec.ts` for one that also composes sub-generators.

## Known gaps (don't be surprised)

- **The 5 sibling directories are gitignored clones, not tracked here.** `cd libs/generator && git
  commit` commits to `sektek/generator`'s own history, not `workspace-generator`'s — easy to forget
  mid-session and wonder why `git status` at the repo root doesn't show changes you just made three
  directories down. Push from inside each clone against its own `origin`, same as any other repo.
- **Cross-package changes don't take effect for dependents until you rebuild the changed package —
  more true now than when this was one monorepo.** `generator-base` imports `@sektek/generator`
  through `node_modules/@sektek/generator`, resolved from whatever's actually published (or, for
  local dev, from `libs/generator`'s own `dist/` via the npm workspace symlink) — either way, not
  live TypeScript source. Editing `libs/generator/src/*.ts` without running its `build` script first
  silently leaves every dependent (`generator-base`, `generator-js`, `gen`, and anything composed
  through them) running stale compiled behavior; tests can pass or fail against that stale logic
  with no indication anything is out of sync.
- No root-level `lint` or `test` script in `workspace-generator` itself — these are per-package only
  (see `TODO.md`). `templates/template-ts` has its own independent build/test/lint, unaffected by
  any of the above.
- `generators/generator-base/index.ts` and `generators/generator-js/index.ts` (the root barrel files
  inside those clones) are empty stubs — nothing imports them; each package's real entrypoint is its
  `app` sub-generator, found via `generators/app/index.ts`, not the package root.
- **`generator-base`'s and `generator-js`'s `build` scripts run a `copy:templates` step
  (`tsx scripts/copy-templates.ts`) after `tsc`** — `tsc` only emits `.js`/`.d.ts`, so without this
  step every `.ejs` template under `generators/<name>/templates/` would be missing from `dist/` and
  any generator calling `this.fs.copyTpl(this.templatePath(...), ...)` (nearly all of them) would
  throw `ENOENT` at runtime against the built package.
- `@sektek/generator-test`'s shared `helper` has nothing registered with it by default — a bare
  `helper.run('editorconfig')` or `helper.run('@sektek/base:editorconfig')` won't resolve. Specs invoke
  their own generator by absolute path (`join(__dirname, 'index.js')`); a spec that needs `composeWith`
  to actually resolve sibling namespaces (like `app`'s) must register them explicitly first via
  `.withGenerators([[path, { namespace }], ...])` — see `generators/generator-base/generators/app/index.spec.ts`.
  Registering a sub-generator by class reference instead of file path loses its on-disk location, which
  breaks `templatePath()`/`sourceRoot()` resolution — always register by path. A spec in one cloned
  package that composes another package's namespace (e.g. `generator-js`'s specs composing
  `@sektek/base:*` from `generator-base`) resolves that other package's path via
  `import.meta.resolve('@sektek/generator-base/generators/<name>')` against the real installed npm
  dependency, not a relative path — do the same for any new cross-package composition, since a
  monorepo-relative path (`../../../generator-base/...`) only worked back when these were sibling
  directories in one repo's history, not independent clones/packages.
- `libs/generator` and `libs/generator-test` have no real test coverage yet — their specs are
  placeholders (`it('should be tested')`).
- `README.md`'s "Changes Required" section is a manual post-scaffold checklist for `.vscode/settings.json`
  (uncomment SQL connection, set name/database to the project name) — relevant when generating a new
  project from this generator, not when working in this repo itself.
- `@sektek/eslint-plugin` and `@sektek/prettier-config` are regular devDependencies (every
  `eslint.config.js`/`.prettierrc.js` across this repo and all 5 clones is the same two-line wrapper
  importing them — see Code style), published to GitHub Packages rather than the public npm registry.
  `npm install` needs `@sektek:registry=https://npm.pkg.github.com` plus a `read:packages`-scoped
  token in `.npmrc` (`//npm.pkg.github.com/:_authToken=...`) or it 401s — needed both here at the
  root and inside each clone if you ever `npm install` one standalone.
- **`Generator`'s own `this.appname` isn't safe for identifiers.** It's derived by replacing every run
  of non-word, non-whitespace characters (so `-`/`_`) with a *space* — meant for human-readable text
  (README titles, mocha `describe()` labels), not package names or URLs: a destination directory like
  `my-project` yields `appname === 'my project'`. `CoreGenerator#projectSlug` (`libs/generator`) is the
  identifier-safe alternative — a lowercase, hyphen-separated slug derived straight from the
  destination folder's basename — and is what `generator-js`'s `base-package`/`workspace` templates use
  for `package.json`'s `"name"` and the git repository url. Reach for `projectSlug`, not `appname`, any
  time a template needs an identifier rather than display text.
