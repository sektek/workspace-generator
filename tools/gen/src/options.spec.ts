import { expect } from 'chai';

import { resolve } from './options.js';

// Nothing in the real @sektek/base:*/@sektek/js:* schema is both required
// and default-less today (language is the closest candidate, and it
// resolves via a default instead of ever throwing), so the required-field
// tests below pass a synthetic extraSpecs entry to exercise that path.
// The namespace used throughout (@sektek/base:app) is a real one — it's
// incidental to these tests, since resolve()'s validation only cares
// about the resolved schema, not which namespace produced it.

describe('resolve', function () {
  it('fills in defaults when no flags are given', function () {
    const resolved = resolve('@sektek/base:app', {});

    expect(resolved).to.deep.equal({
      namespace: 'sektek',
      profile: 'default',
      description: undefined,
    });
  });

  it('lets a given flag override its default', function () {
    const resolved = resolve('@sektek/base:app', { namespace: 'acme' });

    expect(resolved.namespace).to.equal('acme');
    expect(resolved.profile).to.equal('default');
  });

  it('throws one aggregated error listing every missing required option', function () {
    expect(() =>
      resolve('@sektek/base:app', {}, {}, [
        {
          key: 'apiKey',
          flag: '--api-key <value>',
          prompt: 'API key',
          kind: 'text',
          required: true,
        },
        {
          key: 'apiSecret',
          flag: '--api-secret <value>',
          prompt: 'API secret',
          kind: 'text',
          required: true,
        },
      ]),
    ).to.throw('Missing required option(s): apiKey, apiSecret');
  });

  it('throws when a select option is given a value outside its choices', function () {
    expect(() => resolve('@sektek/js:app', { language: 'foo' })).to.throw(
      'Invalid value for language: "foo" (expected one of: javascript, typescript)',
    );
  });

  it('accepts a select option value that is one of its choices', function () {
    const resolved = resolve('@sektek/js:app', { language: 'typescript' });

    expect(resolved.language).to.equal('typescript');
  });

  it('lets a config default override the schema default', function () {
    const resolved = resolve(
      '@sektek/base:app',
      {},
      { profile: 'from config' },
    );

    expect(resolved.profile).to.equal('from config');
  });

  it('lets a given flag override a config default', function () {
    const resolved = resolve(
      '@sektek/base:app',
      { profile: 'from flag' },
      { profile: 'from config' },
    );

    expect(resolved.profile).to.equal('from flag');
  });

  it('ignores a config default with no matching schema key', function () {
    const resolved = resolve(
      '@sektek/base:app',
      {},
      { notInSchema: 'whatever' },
    );

    expect(resolved).to.not.have.property('notInSchema');
  });

  it('does not let an explicitly undefined config value override the schema default', function () {
    const resolved = resolve('@sektek/base:app', {}, { profile: undefined });

    expect(resolved.profile).to.equal('default');
  });
});
