/* eslint-disable no-console */
import { Command } from 'commander';
import chalk from 'chalk';

import { addSchemaOptions, resolve } from './options.js';
import { REGISTRY } from './registry.js';
import { runGenerator } from './run.js';
import { runWizard } from './run-wizard.js';

// "js" -> "@sektek/base"/"@sektek/js": the *package* prefix, unrelated to
// CoreOptions.namespace (the config-scoping value written into generated
// projects, default 'sektek') — that stays a plain --namespace flag built
// from the schema below, never this.
const PREFIX_ALIASES: Record<string, string> = {
  base: '@sektek/base',
  js: '@sektek/js',
};

/**
 * Resolves a generator argument as typed on the command line (`"js"`,
 * `"js:workspace"`, or a fully-qualified `"@sektek/base:app"`) into a
 * namespace, validated against the given list of known namespaces.
 *
 * `yeoman-environment`'s own built-in aliasing
 * (`alias(/^([^:]+)$/, '$1:app')`) only handles single-segment names, not
 * our two-segment `@sektek/js:app`-style namespaces, so this is a
 * from-scratch resolver rather than a wrapper around it.
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
    // Already fully qualified, e.g. "@sektek/base:app".
    namespace = input;
  } else {
    const colonIndex = input.indexOf(':');
    const prefix = colonIndex === -1 ? input : input.slice(0, colonIndex);
    const alias = PREFIX_ALIASES[prefix];

    if (!alias) {
      // A bare name with no package prefix (e.g. "app") is ambiguous when
      // more than one package has a sub-generator by that name — both
      // @sektek/base and @sektek/js do, for "app" — so give a more
      // specific error than "unknown" when that's what happened.
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
 * True when the wizard should run: a real interactive terminal, and the
 * user hasn't forced automated mode with --yes. A non-TTY (piped, CI, or
 * Docker without `-it`) always falls back to automated mode regardless of
 * --yes, since the ink wizard can't render there.
 *
 * @param yes - Whether --yes/-y was given.
 * @returns Whether to run the interactive wizard.
 */
function isInteractive(yes: boolean | undefined): boolean {
  return !yes && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

type CliOptions = {
  yes?: boolean;
  skipInstall?: boolean;
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

  // No generator given at all (including a bare --help/-h): print generic
  // usage. Once a generator is given, --help/-h falls through to
  // commander below instead, which prints that generator's full option
  // list (built from its schema) rather than this generic summary.
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
    .option('--skip-install', 'Skip the package manager install step')
    .option('--force', 'Overwrite files that already exist without prompting')
    .option('--dest <path>', 'Destination directory', process.cwd())
    .addHelpText(
      'after',
      `\nExample:\n  $ gen ${namespace} --yes --dest ./my-project\n`,
    );

  addSchemaOptions(program, namespace);
  program.parse(argv);

  const { yes, skipInstall, force, dest, ...schemaFlags } =
    program.opts<CliOptions>();

  // Only what the user actually typed — see addSchemaOptions()'s comment
  // for why commander doesn't pre-fill these with schema defaults.
  const flagsGiven = Object.fromEntries(
    Object.entries(schemaFlags).filter(([, value]) => value !== undefined),
  );

  const options = isInteractive(yes)
    ? await runWizard(namespace, flagsGiven)
    : resolve(namespace, { ...flagsGiven, skipInstall });

  await runGenerator(namespace, options, {
    destinationRoot: dest,
    force: Boolean(force),
  });
}
