/* eslint-disable no-console */
import { Command } from 'commander';
import chalk from 'chalk';

import { addSchemaOptions, resolve } from './options.js';
import { REGISTRY } from './registry.js';
import { runGenerator } from './run.js';
import { runWizard } from './run-wizard.js';

// The package prefix "js"/"base" resolve to — distinct from
// CoreOptions.namespace (the --namespace flag, config-scoping value
// written into generated projects).
const PREFIX_ALIASES: Record<string, string> = {
  base: '@sektek/base',
  js: '@sektek/js',
};

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
      // Both @sektek/base and @sektek/js have an "app" generator, so a
      // bare name matching a real sub-generator is ambiguous, not unknown.
      const isAmbiguous =
        colonIndex === -1 &&
        knownNamespaces.some(ns => ns.split(':')[1] === input);

      throw new Error(
        isAmbiguous
          ? `Generator '${input}' is ambiguous between packages: specify a prefix (e.g. 'base:${input}' or 'js:${input}').`
          : `Unknown generator '${input}'. Expected 'base', 'js', 'base:<name>', 'js:<name>', or a fully-qualified '@sektek/<pkg>:<name>' namespace. Run 'gen list' to see every available generator.`,
      );
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

  const generatorArg = rawArgs.find(arg => !arg.startsWith('-'));

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

  // Only what the user actually typed (addSchemaOptions() doesn't set
  // commander defaults, so an unset flag stays undefined here).
  const flagsGiven = Object.fromEntries(
    Object.entries(schemaFlags).filter(([, value]) => value !== undefined),
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
