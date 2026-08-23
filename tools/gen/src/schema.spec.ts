import { expect } from 'chai';

import { type OptionSpec, withConfigDefaults } from './schema.js';

describe('withConfigDefaults', function () {
  const schema: OptionSpec[] = [
    { key: 'author', flag: '--author <value>', prompt: 'Author', kind: 'text' },
    {
      key: 'license',
      flag: '--license <value>',
      prompt: 'License',
      kind: 'text',
      default: 'UNLICENSED',
    },
  ];

  it('overrides a spec default with the matching config default', function () {
    const result = withConfigDefaults(schema, { license: 'MIT' });

    expect(result.find(spec => spec.key === 'license')?.default).to.equal(
      'MIT',
    );
  });

  it('leaves a spec unchanged when config has no value for its key', function () {
    const result = withConfigDefaults(schema, { license: 'MIT' });

    expect(result.find(spec => spec.key === 'author')).to.deep.equal(schema[0]);
  });

  it('ignores config keys with no matching spec', function () {
    const result = withConfigDefaults(schema, { notInSchema: 'whatever' });

    expect(result).to.deep.equal(schema);
  });

  it('does not mutate the original schema array', function () {
    withConfigDefaults(schema, { license: 'MIT' });

    expect(schema.find(spec => spec.key === 'license')?.default).to.equal(
      'UNLICENSED',
    );
  });
});
