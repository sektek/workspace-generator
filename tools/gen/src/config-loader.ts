import { basename, dirname, join } from 'node:path';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

import { SingletonProvider, singleton } from '@sektek/utility-belt';
import { parse as parseYaml } from 'yaml';

export type ConfigObject = Record<string, unknown>;

// Precedence when more than one gen.config.* file exists in the same
// directory: only the first format found is loaded.
const CONFIG_FORMATS = ['js', 'yaml', 'json'] as const;
type ConfigFormat = (typeof CONFIG_FORMATS)[number];

type ConfigFile = { path: string; format: ConfigFormat };

// One SingletonProvider per directory, so a directory's config file is
// only ever read/parsed once per process run no matter how many times
// loadConfig() is called for it.
const providers = new Map<
  string,
  SingletonProvider<ConfigObject | undefined>
>();

/**
 * Loads and memoizes the `gen.config.{js,yaml,json}` file for `dir`, if
 * one exists (`js > yaml > json` precedence — only one file is loaded per
 * directory).
 *
 * @param dir - The directory to load a config file from.
 * @returns The parsed config object, or undefined if `dir` has no config file.
 */
export function loadConfig(dir: string): Promise<ConfigObject | undefined> {
  let provider = providers.get(dir);
  if (!provider) {
    provider = singleton(() => readConfig(dir));
    providers.set(dir, provider);
  }
  return provider.get();
}

/**
 * Finds the highest-precedence `gen.config.*` file in `dir`, if any.
 *
 * @param dir - The directory to search.
 * @returns The matching file's absolute path and format, or undefined.
 */
function findConfigFile(dir: string): ConfigFile | undefined {
  for (const format of CONFIG_FORMATS) {
    const path = join(dir, `gen.config.${format}`);
    if (existsSync(path)) {
      return { path, format };
    }
  }
  return undefined;
}

/**
 * Finds and parses `dir`'s config file, if any, wrapping any failure with
 * the file's absolute path and the underlying cause.
 *
 * @param dir - The directory to load a config file from.
 * @returns The parsed config object, or undefined if `dir` has no config file.
 */
async function readConfig(dir: string): Promise<ConfigObject | undefined> {
  const file = findConfigFile(dir);
  if (!file) {
    return undefined;
  }

  try {
    const value = await parse(file);
    if (typeof value !== 'object' || value === null) {
      throw new Error('expected the config to export a plain object');
    }
    return value as ConfigObject;
  } catch (error) {
    throw new Error(`Failed to load config file at ${file.path}`, {
      cause: error,
    });
  }
}

/**
 * Parses one config file's contents per its format.
 *
 * @param file - The config file to parse.
 * @param file.path - Absolute path to the config file.
 * @param file.format - The config file's format.
 * @returns The parsed value, as returned by that format's parser.
 */
async function parse({ path, format }: ConfigFile): Promise<unknown> {
  switch (format) {
    case 'json':
      return JSON.parse(readFileSync(path, 'utf8'));
    case 'yaml':
      return parseYaml(readFileSync(path, 'utf8'));
    case 'js':
      return loadJsModuleExport(path);
  }
}

/**
 * Imports a `.js` config file's default export, tolerating either ESM
 * (`export default {...}`) or CommonJS (`module.exports = {...}`).
 *
 * Tries a plain `import()` first, which resolves `.js` as CJS or ESM per
 * the file's own directory's ambient `package.json` (usually CJS, since
 * config directories — the home dir, arbitrary parents — rarely declare
 * `"type": "module"`). If that throws a syntax error consistent with
 * `export default` being parsed under CJS rules, falls back to writing
 * the source to a temp `.mjs` sibling (forcing ESM parsing regardless of
 * the ambient package.json, while keeping any relative import()/require()
 * inside the config resolving against its own directory), importing that,
 * then deleting it in a `finally` block.
 *
 * @param path - Absolute path to the `.js` config file.
 * @returns The module's `.default` export if present, otherwise the module namespace itself.
 */
async function loadJsModuleExport(path: string): Promise<unknown> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const tempFile = join(
      dirname(path),
      `.${basename(path)}.${randomUUID()}.mjs`,
    );
    writeFileSync(tempFile, readFileSync(path, 'utf8'));
    try {
      mod = (await import(pathToFileURL(tempFile).href)) as Record<
        string,
        unknown
      >;
    } finally {
      unlinkSync(tempFile);
    }
  }

  return 'default' in mod ? mod.default : mod;
}
