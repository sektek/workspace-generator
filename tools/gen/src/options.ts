import type { Command } from 'commander';

import { type OptionSpec, schemaFor } from './schema.js';

/**
 * Adds one commander `.option(...)` per entry in a namespace's schema.
 *
 * Deliberately doesn't pass `spec.default` as commander's own default: if
 * it did, `command.opts()` would report every schema key as "given" even
 * when the user typed nothing, which would break the CLI's ability to
 * tell "explicitly supplied via flag" apart from "left to prompt for" —
 * exactly the distinction interactive mode needs to seed the wizard with
 * only the flags a user actually gave (see `cli.ts`). `resolve()` below
 * is the single place schema defaults actually get applied.
 *
 * @param command - The commander command to add options to.
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns The same command, for chaining.
 */
export function addSchemaOptions(command: Command, namespace: string): Command {
  for (const spec of schemaFor(namespace)) {
    command.option(spec.flag, spec.prompt);
  }
  return command;
}

/**
 * Resolves a namespace's options by folding schema defaults under whatever
 * flags were actually given, then validates that every `required` key
 * still has a value and every `select` value is one of its declared
 * `choices`. Throws one aggregated error listing every problem found,
 * rather than failing on the first.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied (CLI flags or wizard answers).
 * @param extraSpecs - Additional specs layered on top of `schemaFor(namespace)`;
 *   nothing in today's real schema is both `required` and default-less, so
 *   this is how tests exercise that validation path.
 * @returns The fully-resolved options object.
 */
export function resolve(
  namespace: string,
  flagsGiven: Record<string, unknown>,
  extraSpecs: OptionSpec[] = [],
): Record<string, unknown> {
  const schema = [...schemaFor(namespace), ...extraSpecs];
  const defaults = Object.fromEntries(
    schema.map(spec => [spec.key, spec.default]),
  );
  const resolved = { ...defaults, ...flagsGiven };

  const errors: string[] = [];

  const missing = schema
    .filter(spec => spec.required && resolved[spec.key] === undefined)
    .map(spec => spec.key);
  if (missing.length > 0) {
    errors.push(`Missing required option(s): ${missing.join(', ')}`);
  }

  for (const spec of schema) {
    if (
      spec.kind === 'select' &&
      spec.choices &&
      resolved[spec.key] !== undefined &&
      !spec.choices.includes(resolved[spec.key] as string)
    ) {
      errors.push(
        `Invalid value for ${spec.key}: ${JSON.stringify(resolved[spec.key])} (expected one of: ${spec.choices.join(', ')})`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return resolved;
}
