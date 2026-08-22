import { expect } from 'chai';

import { resolveNamespace } from './cli.js';

// A representative slice of REGISTRY's real namespaces — enough to
// exercise every alias case without depending on the built dist/ of
// @sektek/generator-base and @sektek/generator-js (registry.spec.ts
// already covers that these match REGISTRY exactly).
const KNOWN_NAMESPACES = [
  '@sektek/base:app',
  '@sektek/base:editorconfig',
  '@sektek/base:workspace',
  '@sektek/js:app',
  '@sektek/js:workspace',
];

describe('resolveNamespace', function () {
  it('resolves a bare package alias to its :app generator', function () {
    expect(resolveNamespace('js', KNOWN_NAMESPACES)).to.equal('@sektek/js:app');
  });

  it('resolves an alias:name pair as a passthrough', function () {
    expect(resolveNamespace('js:workspace', KNOWN_NAMESPACES)).to.equal(
      '@sektek/js:workspace',
    );
  });

  it('passes a fully-qualified namespace through unchanged', function () {
    expect(
      resolveNamespace('@sektek/base:editorconfig', KNOWN_NAMESPACES),
    ).to.equal('@sektek/base:editorconfig');
  });

  it('rejects a bare generator name with no package prefix as ambiguous', function () {
    expect(() => resolveNamespace('app', KNOWN_NAMESPACES)).to.throw(
      /ambiguous/,
    );
  });

  it('rejects an unknown alias:name pair', function () {
    expect(() => resolveNamespace('js:nonexistent', KNOWN_NAMESPACES)).to.throw(
      /Unknown generator/,
    );
  });

  it('rejects an unknown bare word that matches no known alias or generator name', function () {
    expect(() => resolveNamespace('nonexistent', KNOWN_NAMESPACES)).to.throw(
      /Unknown generator/,
    );
  });

  it('rejects an unknown fully-qualified namespace', function () {
    expect(() =>
      resolveNamespace('@sektek/js:nonexistent', KNOWN_NAMESPACES),
    ).to.throw(/Unknown generator/);
  });
});
