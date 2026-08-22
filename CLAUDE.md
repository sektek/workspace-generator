# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@sektek/workspace-generator` — an npm workspace monorepo that builds Yeoman-based generators
(`generator-base`, `generator-js`) for scaffolding new SEKTEK projects, driven by a custom CLI
(`tools/gen`, the `gen` command) rather than the stock `yo` — see Workspace layout. Only the root
`index.ts` barrel files in `generator-base`/`generator-js` are stub placeholders; every sub-generator
under each package's `generators/` directory is fully implemented (6 in `generator-base`, 8 in
`generator-js`). The repo nominally has Nx wired up but Nx is intentionally not used here (see
Workspace layout) — treat it as dead config, not tooling.

## Workspace layout

npm workspaces defined in the root `package.json`: `generators/*`, `libs/*`, `tools/*`. Each package
is an independently versioned, independently built TypeScript module with its own `package.json`,
`tsconfig.json`/`tsconfig.build.json`, `.mocharc.cjs`, and `eslint.config.js` (mirroring the root
configs).

`nx.json` and the root `npm run build` (`nx run-many --target build`) are present but **do not use
Nx** — build and test per package instead (see Commands below). Dependency order when building by
hand: `libs/generator` first (everything else depends on it), then `libs/generator-test`, then
`generators/generator-base` and `generators/generator-js`, then `tools/gen` (depends on both
generator packages' built `dist/`).

- **`libs/generator`** (`@sektek/generator`) — the foundation. Exports `CoreGenerator`, an abstract
  class extending `yeoman-generator`'s `Generator`. It applies workspace-wide defaults
  (`namespace: 'sektek'`, `taskPrefix: 'task'`, `inheritTasks: true`), aliases each built-in queue
  (`writing`, `initializing`, …) under a PascalCase `priorityName` via `registerPriorities()` in its
  constructor so `task<QueueName>` methods can be PascalCase instead of all-lowercase (see Generator
  wiring conventions below), and overrides `composeWith` so that generator names are namespaced under
  `this.package` (e.g. calling `composeWith('editorconfig')` from a generator with
  `package = '@sektek/base'` resolves to `@sektek/base:editorconfig`) unless the name is already fully
  qualified.
- **`libs/generator-test`** (`@sektek/generator-test`) — thin wrapper around `yeoman-test`, exporting
  a shared `helper` (a `YeomanTest` instance) and re-exporting `result`. All generator specs run
  through this `helper`, not `yeoman-test` directly.
- **`generators/generator-base`** (`@sektek/generator-base`) — the base generator package, driven by
  `tools/gen` (or, in principle, still installable as a `yo` generator). `BaseGenerator` (in
  `lib/base-generator.ts`) extends `CoreGenerator` and sets `package = '@sektek/base'`.
  Sub-generators live under `generators/<name>/index.ts` (6 total):
  - `app` — the entrypoint (`taskInitializing` composes `editorconfig`, `gitconfig`, and `readme` in
    sequence via `this.composeWith(name, options, true)`).
  - `editorconfig`, `gitconfig`, `readme` — each a small `taskWriting()` that copies EJS templates
    from its local `templates/` directory via `this.fs.copyTpl(this.templatePath(...), this.destinationPath(...), data)`.
  - `devcontainer` — writes `.devcontainer/Dockerfile` plus either a standalone or
    docker-compose-based `devcontainer.json`, depending on a `default`/`workspace` profile option.
  - `workspace` — composes `devcontainer`, `editorconfig`, `gitconfig`, and `readme` together and adds
    `.vscode/settings.json`/`launch.json`; the root-level variant of `app` for a workspace-style
    project rather than a single package.

  When adding a new sub-generator here, follow the existing pattern: extend `BaseGenerator<BaseOptions, BaseFeatures>`,
  set `DEFAULT_FEATURES = { unique: true }` merged with incoming features, implement lifecycle
  methods as `task<QueueName>` (e.g. `taskWriting`, `taskInitializing`) — this works because
  `CoreGenerator`'s default features set `taskPrefix: 'task'` and `inheritTasks: true`, and its
  constructor registers a PascalCase alias for each built-in queue (see Generator wiring conventions
  below). Register it in `app/index.ts`'s `taskInitializing` and add its import at the top of that
  file (side-effect import registering the sub-generator).
- **`generators/generator-js`** (`@sektek/generator-js`) — the JS/TS project generator, layered on
  top of `generator-base` (`BaseGenerator` here, in `lib/base-generator.ts`, extends `CoreGenerator`
  directly and sets `package = '@sektek/js'`; its default options set `packageScope: 'sektek'`,
  `author`, `license: 'UNLICENSED'`, `private: true`). Sub-generators live under
  `generators/<name>/index.ts` (8 total):
  - `app` — the entrypoint; composes `@sektek/base:app` (editorconfig/gitconfig/readme),
    `@sektek/base:devcontainer`, `base-package`, `gitconfig`, `eslint`, `mocha`, and, when
    `language: 'typescript'`, `typescript`.
  - `base-package` — writes `package.json` (name, author, license, repository url, etc. — see the
    `CoreGenerator#projectSlug` note in Known gaps for how the package name/repo url are derived) and,
    for `language: 'javascript'`, a plain-JS entrypoint (`index.js`/`index.spec.js`).
  - `gitconfig` — composes `@sektek/base:gitconfig` for the base `.gitignore`/`.gitattributes`, then
    layers JS-specific `.gitignore` rules on top.
  - `typescript` — writes `tsconfig.json`/`tsconfig.build.json` and a TS entrypoint (`index.ts`).
  - `eslint` — writes `eslint.config.js`, composing `prettier`.
  - `prettier` — writes `.prettierrc.js`/`.prettierignore`.
  - `mocha` — writes `.mocharc.cjs` (and, for TypeScript, `.mocharc.min.cjs`/`.nycrc.json`).
  - `workspace` — the root-level, npm-workspaces variant of `app`: composes `@sektek/base:workspace`,
    `gitconfig`, and `eslint`; writes its own `package.json` (with a `workspaces` field),
    `.mocharc.cjs`/`.npmrc`, and `apps/`/`libs/`/`tools/` placeholder directories.
- **`tools/gen`** (`@sektek/gen`) — the custom CLI that replaces `yo`: drives `generator-base`/
  `generator-js` directly via `yeoman-environment`, in either automated (CLI flags) or interactive
  (an `ink` wizard) mode. Flat, one-file-per-concern layout under `src/`:
  - `registry.ts` — `REGISTRY`, built from both packages' `manifest.ts` exports, and `registerAll()`,
    which registers every namespace (not just user-invocable ones — `composeWith` chains reach
    sub-generators no one runs directly) with a Yeoman `Environment` by on-disk path.
  - `schema.ts` — `CORE_OPTIONS`/`JS_OPTIONS`/`schemaFor(namespace)`: the single declarative schema
    both modes build their flags/prompts from, scoped per package family (`@sektek/base:*` vs
    `@sektek/js:*`), not per sub-generator.
  - `options.ts` — `addSchemaOptions()` (adds commander flags from the schema, deliberately without
    commander's own defaults, so `resolve()` stays the one place defaults are applied) and
    `resolve()` (folds defaults under given flags, validates `required` keys and `select` choices).
  - `wizard.tsx`/`wizard-steps.ts`/`run-wizard.ts` — the interactive mode: `Wizard` steps through
    `schemaFor(namespace)` one prompt at a time, skipping any key already given via a flag;
    `wizard-steps.ts` holds the pure (non-ink) step-sequencing logic, unit-tested directly, since the
    actual ink TTY rendering isn't practical to unit test.
  - `run.ts` — `runGenerator()`, the one place either mode actually invokes Yeoman.
  - `cli.ts`/`bin.ts` — `main(argv)` resolves the `<generator>` argument (own alias resolver, e.g.
    `js` → `@sektek/js:app`; `yeoman-environment`'s built-in `alias()` only handles single-segment
    names), picks automated vs. interactive based on `process.stdout.isTTY && process.stdin.isTTY`
    (unless `--yes` forces automated), and calls `runGenerator()`.
- **`templates/template-ts`** — a template project skeleton (its own package.json/tsconfig/etc.),
  intended as the boilerplate a generator scaffolds out, not a package that's built/tested itself.
- **`third-party/`** — gitignored reference checkouts of `yeoman-generator` and `generator-jhipster`
  source, kept locally for reading how mature Yeoman generators are structured. Not part of the build.

## Generator wiring conventions

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
(`path`, `url`, …), then dependencies (npm packages and local workspace packages alike — e.g. `chai`
and `@sektek/generator-test` are the same block), then local relative imports (`./index.js`,
`../lib/foo.js`). Enforced by `import/order` (`groups: ['builtin', ['external', 'internal'],
['parent', 'sibling', 'index']]`, `newlines-between: 'always'`) in every package's `eslint.config.js`;
`sort-imports` (already configured with `allowSeparatedGroups: true`) alphabetizes by first imported
binding name within each block. Run the package's `lint` script (with `--fix` for prettier/import-order
issues) to check and fix.

## Commands

Run from the repo root unless noted. Do not use the root `npm run build` script or any `nx` command
(see note above) — build packages individually.

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
  workspace and sets `ENTRYPOINT ["/app/bin/gen"]`.

## Test conventions

Specs sit next to source as `*.spec.ts` and use `chai` (`expect`) + `@sektek/generator-test`'s shared
`helper.run(...)`. Invoke the generator under test by absolute path
(`helper.run(join(__dirname, 'index.js'))`), not by namespace or bare name — see Known gaps below for
why. This returns `{ generator, fs }`; assert `fs.exists(...)` for scaffolded files and `generator` for
the class instance. See `generators/generator-base/generators/*/index.spec.ts` for the pattern, and
`generators/generator-base/generators/app/index.spec.ts` for one that also composes sub-generators.

## Known gaps (don't be surprised)

- No root-level `lint` or `test` script — these are per-workspace only (see `TODO.md`: "Need to figure
  out how to test generators in TypeScript"). The only root script (`build`) shells out to Nx and
  should not be used — see Workspace layout.
- `generators/generator-base/index.ts` and `generators/generator-js/index.ts` (the root barrel files)
  are empty stubs — nothing imports them; each package's real entrypoint is its `app` sub-generator,
  found via `generators/app/index.ts`, not the package root.
- **`generator-base`'s and `generator-js`'s `build` scripts run a `copy:templates` step
  (`tsx scripts/copy-templates.ts`) after `tsc`** — `tsc` only emits `.js`/`.d.ts`, so without this
  step every `.ejs` template under `generators/<name>/templates/` would be missing from `dist/` and
  any generator calling `this.fs.copyTpl(this.templatePath(...), ...)` (nearly all of them) would
  throw `ENOENT` at runtime against the built package. Non-obvious enough to catch out a future
  change to either package's `tsconfig.build.json`/`package.json` build step.
- `@sektek/generator-test`'s shared `helper` has nothing registered with it by default — a bare
  `helper.run('editorconfig')` or `helper.run('@sektek/base:editorconfig')` won't resolve. Specs invoke
  their own generator by absolute path (`join(__dirname, 'index.js')`); a spec that needs `composeWith`
  to actually resolve sibling namespaces (like `app`'s) must register them explicitly first via
  `.withGenerators([[path, { namespace }], ...])` — see `generators/generator-base/generators/app/index.spec.ts`.
  Registering a sub-generator by class reference instead of file path loses its on-disk location, which
  breaks `templatePath()`/`sourceRoot()` resolution — always register by path.
- **Cross-package changes to `libs/generator` (or any package other packages depend on) don't take
  effect for dependents until you rebuild it.** `generator-base` imports `@sektek/generator` through
  `node_modules/@sektek/generator`, which resolves via that package's `package.json` `exports` to its
  built `dist/`, not its TypeScript source — unlike a package's own `.spec.ts` files, which `tsx/esm`
  transforms live. Editing `libs/generator/src/*.ts` without running its `build` script first will
  silently leave dependents running the old compiled behavior; tests can pass or fail against stale
  logic with no indication anything is out of sync.
- `libs/generator` and `libs/generator-test` have no real test coverage yet — their specs are
  placeholders (`it('should be tested')`).
- `README.md`'s "Changes Required" section is a manual post-scaffold checklist for `.vscode/settings.json`
  (uncomment SQL connection, set name/database to the project name) — relevant when generating a new
  project from this generator, not when working in this repo itself.
- `@sektek/eslint-plugin` and `@sektek/prettier-config` are regular devDependencies (every
  `eslint.config.js`/`.prettierrc.js` in this repo is the same two-line wrapper importing them — see
  Code style), published to GitHub Packages rather than the public npm registry. `npm install` needs
  `@sektek:registry=https://npm.pkg.github.com` plus a `read:packages`-scoped token in `.npmrc`
  (`//npm.pkg.github.com/:_authToken=...`) or it 401s. There's no local vendored fallback for these
  anymore — they used to be checked out under `tools/eslint-plugin`/`tools/prettier-config` as npm
  workspace packages, but that's gone. `tools/` now holds `tools/gen` instead (see Workspace layout).
- **`Generator`'s own `this.appname` isn't safe for identifiers.** It's derived by replacing every run
  of non-word, non-whitespace characters (so `-`/`_`) with a *space* — meant for human-readable text
  (README titles, mocha `describe()` labels), not package names or URLs: a destination directory like
  `my-project` yields `appname === 'my project'`. `CoreGenerator#projectSlug` (`libs/generator`) is the
  identifier-safe alternative — a lowercase, hyphen-separated slug derived straight from the
  destination folder's basename — and is what `generator-js`'s `base-package`/`workspace` templates use
  for `package.json`'s `"name"` and the git repository url. Reach for `projectSlug`, not `appname`, any
  time a template needs an identifier rather than display text.
