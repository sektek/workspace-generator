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
 * `"app"`. Used to tell a genuinely ambiguous bare name apart from an
 * unknown one that happens to share a name with a single generator.
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
 * Builds the error for a bare name that isn't a known package alias.
 *
 * @param input - The generator argument as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns An error describing why `input` couldn't be resolved.
 */
function unknownPrefixError(
  input: string,
  knownNamespaces: readonly string[],
): Error {
  const matchingPrefixes = prefixesFor(input, knownNamespaces);

  if (matchingPrefixes.length > 1) {
    const options = matchingPrefixes.map(prefix => `'${prefix}:${input}'`);
    return new Error(
      `Generator '${input}' is ambiguous between packages: specify a prefix (${options.join(' or ')}).`,
    );
  }
  if (matchingPrefixes.length === 1) {
    return new Error(
      `Unknown generator '${input}'. Did you mean '${matchingPrefixes[0]}:${input}'?`,
    );
  }

  return new Error(
    `Unknown generator '${input}'. Expected 'base', 'js', 'base:<name>', 'js:<name>', or a fully-qualified '@sektek/<pkg>:<name>' namespace. Run 'gen list' to see every available generator.`,
  );
}

/**
 * Resolves a generator argument (e.g. "js", "js:workspace",
 * "@sektek/base:app") into a namespace, validated against the known
 * namespace list. From-scratch rather than yeoman-environment's own
 * alias(), which only handles single-segment names.
 *
 * @param input - The generator argument as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns The resolved, validated namespace.
 */
export function resolveNamespace(
  input: string,
  knownNamespaces: readonly string[],
): string {
  let namespace: string;

  if (input.startsWith('@')) {
    namespace = input;
  } else {
    const colonIndex = input.indexOf(':');
    const prefix = colonIndex === -1 ? input : input.slice(0, colonIndex);
    const alias = PREFIX_ALIASES[prefix];

    if (!alias) {
      throw unknownPrefixError(input, knownNamespaces);
    }

    const name = colonIndex === -1 ? 'app' : input.slice(colonIndex + 1);
    namespace = `${alias}:${name}`;
  }

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
      'Examples:',
      '  $ gen list',
      '  $ gen js:app --yes --language typescript --dest ./my-project',
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
