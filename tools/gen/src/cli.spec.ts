import { expect } from 'chai';

import { resolveNamespace } from './cli.js';

const KNOWN_NAMESPACES = [
  '@sektek/base:app',
  '@sektek/base:editorconfig',
  '@sektek/base:gitconfig',
  '@sektek/base:workspace',
  '@sektek/js:app',
  '@sektek/js:eslint',
  '@sektek/js:gitconfig',
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

  it('resolves a bare name unique to base', function () {
    expect(resolveNamespace('editorconfig', KNOWN_NAMESPACES)).to.equal(
      '@sektek/base:editorconfig',
    );
  });

  it('resolves a bare name that exists in both base and js to base silently', function () {
    expect(resolveNamespace('gitconfig', KNOWN_NAMESPACES)).to.equal(
      '@sektek/base:gitconfig',
    );
  });

  it('rejects a bare name that exists only in js, hinting at the js: prefix', function () {
    expect(() => resolveNamespace('eslint', KNOWN_NAMESPACES)).to.throw(
      /Did you mean 'js:eslint'/,
    );
  });

  it('rejects a bare name that exists in neither package with a generic message', function () {
    expect(() => resolveNamespace('nonexistent', KNOWN_NAMESPACES)).to.throw(
      /^Unknown generator 'nonexistent'\. Run 'gen list'/,
    );
  });

  it('rejects a bare name that collides with an inherited Object.prototype property', function () {
    // `input in PREFIX_ALIASES` would match 'toString' via the prototype
    // chain even though it's not an own key, resolving to 'undefined:app'.
    expect(() => resolveNamespace('toString', KNOWN_NAMESPACES)).to.throw(
      /^Unknown generator 'toString'\. Run 'gen list'/,
    );
  });

  it('rejects an unknown alias:name pair', function () {
    expect(() => resolveNamespace('js:nonexistent', KNOWN_NAMESPACES)).to.throw(
      /Unknown generator/,
    );
  });

  it('rejects an unknown prefix', function () {
    expect(() =>
      resolveNamespace('bogus:editorconfig', KNOWN_NAMESPACES),
    ).to.throw(/Unknown generator 'bogus:editorconfig'\. Expected/);
  });

  it('rejects an unknown fully-qualified namespace', function () {
    expect(() =>
      resolveNamespace('@sektek/js:nonexistent', KNOWN_NAMESPACES),
    ).to.throw(/Unknown generator/);
  });
});
