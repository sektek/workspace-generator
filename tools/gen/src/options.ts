import type { Command } from 'commander';

import { type OptionSpec, schemaFor } from './schema.js';

/**
 * Adds one commander `.option(...)` per entry in a namespace's schema.
 *
 * Doesn't pass `spec.default` as commander's own default: `resolve()`
 * below is the one place schema defaults get applied, so `command.opts()`
 * only reports what a user actually typed — `cli.ts` depends on that to
 * seed the interactive wizard with just the explicitly-given flags.
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
 * Resolves a namespace's options by folding schema defaults, then
 * config-file defaults, then whatever flags were actually given (each
 * layer overriding the last), then validates required keys and `select`
 * choices, throwing one aggregated error for every problem found.
 *
 * `configDefaults` keys with no matching schema entry are ignored — a
 * shared config file may carry sections irrelevant to this run's namespace.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied (CLI flags or wizard answers).
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param extraSpecs - Specs layered on top of `schemaFor(namespace)`, for tests.
 * @returns The fully-resolved options object.
 */
export function resolve(
  namespace: string,
  flagsGiven: Record<string, unknown>,
  configDefaults: Record<string, unknown> = {},
  extraSpecs: OptionSpec[] = [],
): Record<string, unknown> {
  const schema = [...schemaFor(namespace), ...extraSpecs];
  const defaults = Object.fromEntries(
    schema.map(spec => [spec.key, spec.default]),
  );
  const schemaKeys = new Set(schema.map(spec => spec.key));
  const configLayer = Object.fromEntries(
    Object.entries(configDefaults).filter(
      // A JS config file can define a key as undefined (e.g. derived from
      // an unset env var) — excluding those keeps this consistent with
      // withConfigDefaults() (schema.ts), which already treats an
      // undefined config value as "no override".
      ([key, value]) => schemaKeys.has(key) && value !== undefined,
    ),
  );
  const resolved = { ...defaults, ...configLayer, ...flagsGiven };

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
