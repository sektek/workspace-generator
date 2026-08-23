/* eslint-disable no-console */
import { Command } from 'commander';
import chalk from 'chalk';

import { addSchemaOptions, resolve } from './options.js';
import { REGISTRY } from './registry.js';
import { runGenerator } from './run.js';
import { runWizard } from './run-wizard.js';

// Package aliases "js"/"base" resolve to — distinct from
// CoreOptions.namespace (the --namespace flag, config-scoping value
// written into generated projects).
const PREFIX_ALIASES: Record<string, string> = {
  base: '@sektek/base',
  js: '@sektek/js',
};

/**
 * The prefixes (`"base"`/`"js"`) whose package has a sub-generator named
 * `name` — e.g. `["base"]` for `"editorconfig"`, `["base", "js"]` for
 * `"app"`. A bare name never resolves through this any more (it always
 * means `@sektek/base:<name>`) — this only powers the "did you mean
 * 'js:<name>'" hint on an unknown-bare-name error.
 *
 * @param name - A bare sub-generator name, with no package prefix.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns The matching prefixes, if any.
 */
function prefixesFor(
  name: string,
  knownNamespaces: readonly string[],
): string[] {
  return knownNamespaces
    .filter(ns => ns.split(':')[1] === name)
    .map(
      ns =>
        Object.entries(PREFIX_ALIASES).find(
          ([, pkg]) => pkg === ns.split(':')[0],
        )?.[0],
    )
    .filter((prefix): prefix is string => prefix !== undefined);
}

/**
 * Builds the error for a `<prefix>:<name>` input whose prefix isn't a known
 * package alias.
 *
 * @param input - The generator argument as typed on the command line.
 * @returns An error describing why `input` couldn't be resolved.
 */
function unknownPrefixError(input: string): Error {
  return new Error(
    `Unknown generator '${input}'. Expected 'base', 'js', 'base:<name>', 'js:<name>', or a fully-qualified '@sektek/<pkg>:<name>' namespace — a bare '<name>' with no prefix defaults to '@sektek/base:<name>'. Run 'gen list' to see every available generator.`,
  );
}

/**
 * Builds the error for a bare name with no colon that isn't `js`/`base` and
 * doesn't resolve to a `@sektek/base:<name>` generator. Hints at `js:<name>`
 * when that namespace exists — a message nicety only, never a fallback: the
 * caller still has to type the prefix themselves to actually run it.
 *
 * @param name - The bare generator name as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns An error describing why `name` couldn't be resolved.
 */
function unknownBareNameError(
  name: string,
  knownNamespaces: readonly string[],
): Error {
  const hint = prefixesFor(name, knownNamespaces).includes('js')
    ? ` Did you mean 'js:${name}'?`
    : '';

  return new Error(
    `Unknown generator '${name}'.${hint} Run 'gen list' to see every available generator.`,
  );
}

/**
 * Resolves a generator argument (e.g. "js", "js:workspace",
 * "@sektek/base:app", "gitconfig") into a namespace, validated against the
 * known namespace list. From-scratch rather than yeoman-environment's own
 * alias(), which only handles single-segment names.
 *
 * A bare name with no prefix always means `@sektek/base:<name>` (matching
 * how `yo` used to default to `generator-base`) — it never falls back to
 * `@sektek/js` even when only `js` has a matching generator.
 *
 * @param input - The generator argument as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns The resolved, validated namespace.
 */
export function resolveNamespace(
  input: string,
  knownNamespaces: readonly string[],
): string {
  if (input.startsWith('@')) {
    return validateNamespace(input, knownNamespaces);
  }

  const colonIndex = input.indexOf(':');

  if (colonIndex === -1) {
    if (input in PREFIX_ALIASES) {
      return validateNamespace(`${PREFIX_ALIASES[input]}:app`, knownNamespaces);
    }

    const namespace = `${PREFIX_ALIASES.base}:${input}`;
    if (!knownNamespaces.includes(namespace)) {
      throw unknownBareNameError(input, knownNamespaces);
    }
    return namespace;
  }

  const prefix = input.slice(0, colonIndex);
  const alias = PREFIX_ALIASES[prefix];
  if (!alias) {
    throw unknownPrefixError(input);
  }

  const name = input.slice(colonIndex + 1);
  return validateNamespace(`${alias}:${name}`, knownNamespaces);
}

/**
 * Validates a fully-resolved namespace against the known namespace list.
 *
 * @param namespace - The resolved namespace to validate.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns `namespace`, unchanged.
 */
function validateNamespace(
  namespace: string,
  knownNamespaces: readonly string[],
): string {
  if (!knownNamespaces.includes(namespace)) {
    throw new Error(
      `Unknown generator '${namespace}'. Run 'gen list' to see every available generator.`,
    );
  }

  return namespace;
}

/**
 * Prints every `REGISTRY` namespace, grouped by package.
 */
function printList(): void {
  const groups = new Map<string, string[]>();
  for (const { namespace } of REGISTRY) {
    const [pkg, name] = namespace.split(':');
    const names = groups.get(pkg) ?? [];
    names.push(name);
    groups.set(pkg, names);
  }

  for (const [pkg, names] of groups) {
    console.log(chalk.bold(pkg));
    for (const name of names) {
      const namespace = `${pkg}:${name}`;
      console.log(`  ${chalk.cyan(namespace)}`);
    }
  }
}

/**
 * Prints top-level usage: how to list generators and how to run one.
 */
function printUsage(): void {
  console.log(
    [
      'Usage: gen <generator> [options]',
      '       gen list',
      '',
      "A bare '<name>' with no prefix defaults to '@sektek/base:<name>';",
      "use 'js:<name>' to reach a @sektek/js generator instead.",
      '',
      'Examples:',
      '  $ gen list',
      '  $ gen js:app --yes --language typescript --dest ./my-project',
      '  $ gen readme',
      '  $ gen base:readme',
    ].join('\n'),
  );
}

/**
 * True when the wizard should run: an interactive terminal and no --yes.
 *
 * @param yes - Whether --yes/-y was given.
 * @returns Whether to run the interactive wizard.
 */
function isInteractive(yes: boolean | undefined): boolean {
  return !yes && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

type CliOptions = {
  yes?: boolean;
  install?: boolean;
  force?: boolean;
  dest: string;
  [schemaKey: string]: unknown;
};

/**
 * Parses argv and either lists every generator or runs the one resolved
 * from the `<generator>` argument, in automated or interactive mode.
 *
 * @param argv - Full `process.argv` (including the node/script entries).
 */
export async function main(argv: string[]): Promise<void> {
  const rawArgs = argv.slice(2);

  if (rawArgs[0] === 'list') {
    printList();
    return;
  }

  // Must be the first token: scanning for "the first non-dash token"
  // instead would grab an option's own value (e.g. "/tmp" out of
  // "--dest /tmp js:app") whenever a flag precedes the generator.
  const generatorArg =
    rawArgs[0] && !rawArgs[0].startsWith('-') ? rawArgs[0] : undefined;

  // --help/-h alone falls through to commander below once a generator is
  // resolved, which shows that generator's schema-driven options instead.
  if (!generatorArg) {
    printUsage();
    return;
  }

  const knownNamespaces = REGISTRY.map(entry => entry.namespace);

  let namespace: string;
  try {
    namespace = resolveNamespace(generatorArg, knownNamespaces);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const program = new Command();
  program
    .name('gen')
    .description(`Run the ${namespace} generator`)
    .argument('<generator>', 'Generator to run, e.g. "js:app" or "base:readme"')
    .option('-y, --yes', 'Force automated mode even in an interactive terminal')
    .option(
      '--install',
      'Run the package manager install step (skipped by default)',
    )
    .option('--force', 'Overwrite files that already exist without prompting')
    .option('--dest <path>', 'Destination directory', process.cwd())
    .addHelpText(
      'after',
      `\nExample:\n  $ gen ${namespace} --yes --dest ./my-project\n`,
    );

  addSchemaOptions(program, namespace);
  program.parse(argv);

  const { yes, install, force, dest, ...schemaFlags } =
    program.opts<CliOptions>();

  // Only what the user actually typed. Checking against undefined isn't
  // enough: commander gives a negated flag like --no-private an implicit
  // `true` default even with no explicit default passed to .option(), so
  // an unset --no-private would otherwise look "given" as true.
  // getOptionValueSource() distinguishes that implicit default from an
  // actual CLI-provided value.
  const flagsGiven = Object.fromEntries(
    Object.keys(schemaFlags)
      .filter(key => program.getOptionValueSource(key) === 'cli')
      .map(key => [key, schemaFlags[key]]),
  );

  const options = {
    ...(isInteractive(yes)
      ? await runWizard(namespace, flagsGiven)
      : resolve(namespace, flagsGiven)),
    skipInstall: !install,
  };

  await runGenerator(namespace, options, {
    destinationRoot: dest,
    force: Boolean(force),
  });
}
