export type OptionKind = 'text' | 'boolean' | 'select';

export type OptionSpec = {
  key: string;
  flag: string;
  prompt: string;
  kind: OptionKind;
  choices?: readonly string[];
  default?: unknown;
  required?: boolean;
};

// Options every generator understands, since CoreGenerator applies these
// as workspace-wide defaults regardless of which sub-generator runs.
export const CORE_OPTIONS: OptionSpec[] = [
  {
    key: 'namespace',
    flag: '--namespace <value>',
    prompt: 'Config namespace',
    kind: 'text',
    default: 'sektek',
  },
  {
    key: 'profile',
    flag: '--profile <value>',
    prompt: 'Profile',
    kind: 'text',
    default: 'default',
  },
  {
    key: 'description',
    flag: '--description <value>',
    prompt: 'Project description',
    kind: 'text',
  },
];

// Options specific to the @sektek/js:* generator family.
export const JS_OPTIONS: OptionSpec[] = [
  {
    key: 'language',
    flag: '--language <value>',
    prompt: 'Language',
    kind: 'select',
    choices: ['javascript', 'typescript'],
    default: 'javascript',
  },
  {
    key: 'packageScope',
    flag: '--package-scope <value>',
    prompt: 'npm scope',
    kind: 'text',
    default: 'sektek',
  },
  {
    key: 'author',
    flag: '--author <value>',
    prompt: 'Author',
    kind: 'text',
    default: 'Edward Kelly <eddie@sektek.net>',
  },
  {
    key: 'license',
    flag: '--license <value>',
    prompt: 'License',
    kind: 'text',
    default: 'UNLICENSED',
  },
  {
    // --no-private, not --private: commander's convention for a boolean
    // that defaults true and needs to stay overridable to false.
    key: 'private',
    flag: '--no-private',
    prompt: 'Private package?',
    kind: 'boolean',
    default: true,
  },
];

/**
 * Returns the option schema for a generator namespace, scoped per package
 * family (`@sektek/base:*` vs `@sektek/js:*`) rather than per individual
 * sub-generator, since composeWith passes the whole options object through
 * unchanged regardless of which one runs.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns The option specs relevant to that namespace's package family.
 */
export function schemaFor(namespace: string): OptionSpec[] {
  return namespace.startsWith('@sektek/js:')
    ? [...CORE_OPTIONS, ...JS_OPTIONS]
    : CORE_OPTIONS;
}

/**
 * Overrides each spec's `default` with `configDefaults`'s value for that
 * key, if any — for pre-filling/pre-highlighting a wizard prompt's initial
 * value without skipping it (only an actual CLI flag does that). A key in
 * `configDefaults` with no matching spec is ignored.
 *
 * @param schema - The option specs to layer config defaults onto.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns A new spec array; `schema` itself is left unchanged.
 */
export function withConfigDefaults(
  schema: OptionSpec[],
  configDefaults: Record<string, unknown>,
): OptionSpec[] {
  return schema.map(spec =>
    configDefaults[spec.key] === undefined
      ? spec
      : { ...spec, default: configDefaults[spec.key] },
  );
}
