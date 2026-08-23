import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { resolveConfigDefaults } from './config.js';

describe('resolveConfigDefaults', function () {
  let root: string;
  let home: string;

  beforeEach(function () {
    root = mkdtempSync(join(tmpdir(), 'sektek-gen-config-'));
    home = mkdtempSync(join(tmpdir(), 'sektek-gen-config-home-'));
  });

  afterEach(function () {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const writeConfig = (dir: string, contents: object) =>
    writeFileSync(join(dir, 'gen.config.json'), JSON.stringify(contents));

  it('falls back to the top-level value when no namespaced value exists', async function () {
    writeConfig(root, { author: 'Edward Kelly' });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults).to.deep.equal({ author: 'Edward Kelly' });
  });

  it('prefers the namespaced value over the top-level value for the same key', async function () {
    writeConfig(root, {
      license: 'MIT',
      js: { app: { license: 'UNLICENSED' } },
    });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults.license).to.equal('UNLICENSED');
  });

  it('ignores a namespaced section for a different generator', async function () {
    writeConfig(root, {
      license: 'MIT',
      js: { eslint: { license: 'UNLICENSED' } },
    });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults.license).to.equal('MIT');
  });

  it('ignores a namespaced section for a different family', async function () {
    writeConfig(root, {
      license: 'MIT',
      base: { app: { license: 'UNLICENSED' } },
    });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults.license).to.equal('MIT');
  });

  it('prefers cwd over a parent directory for the same key', async function () {
    const nested = join(root, 'project');
    mkdirSync(nested);
    writeConfig(root, { author: 'from parent' });
    writeConfig(nested, { author: 'from cwd' });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: nested,
      homeDir: home,
    });

    expect(defaults.author).to.equal('from cwd');
  });

  it('prefers a parent directory over home for the same key', async function () {
    const nested = join(root, 'project');
    mkdirSync(nested);
    writeConfig(root, { author: 'from parent' });
    writeConfig(home, { author: 'from home' });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: nested,
      homeDir: home,
    });

    expect(defaults.author).to.equal('from parent');
  });

  it('resolves different keys from different directories in the same run', async function () {
    const nested = join(root, 'project');
    mkdirSync(nested);
    writeConfig(nested, { author: 'from cwd' });
    writeConfig(home, { author: 'from home', license: 'from home' });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: nested,
      homeDir: home,
    });

    expect(defaults.author).to.equal('from cwd');
    expect(defaults.license).to.equal('from home');
  });

  it('passes through keys that match no known schema option', async function () {
    writeConfig(root, { someUnknownKey: 'whatever' });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults.someUnknownKey).to.equal('whatever');
  });

  it('returns an empty object when no directory has a config file', async function () {
    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults).to.deep.equal({});
  });

  it("does not leak another family's section through as a literal default value", async function () {
    writeConfig(root, {
      license: 'MIT',
      base: { app: { license: 'UNLICENSED' } },
    });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults).to.not.have.property('base');
  });

  it("does not leak the current family's own section through as a literal default value", async function () {
    writeConfig(root, {
      license: 'MIT',
      js: { app: { license: 'UNLICENSED' } },
    });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(defaults).to.not.have.property('js');
  });

  it('treats a `__proto__` config key as a plain value, not a prototype override', async function () {
    // Nested under js.app (an object-shaped namespaced value), and via a
    // computed property name in the object literal below: a literal
    // `__proto__: value` key in an object *literal* sets the prototype at
    // construction time instead of creating an own property, which would
    // silently write `{}` for that section and defeat this test's point.
    writeConfig(root, { js: { app: { ['__proto__']: { polluted: true } } } });

    const defaults = await resolveConfigDefaults('@sektek/js:app', {
      cwd: root,
      homeDir: home,
    });

    expect(Object.getPrototypeOf(defaults)).to.satisfy(
      (proto: unknown) => proto === Object.prototype || proto === null,
    );
    expect((globalThis as { polluted?: unknown }).polluted).to.be.undefined;
    expect((defaults as Record<string, unknown>).__proto__).to.deep.equal({
      polluted: true,
    });
  });

  it('rejects a namespace missing the "family:generator" shape', async function () {
    await resolveConfigDefaults('not-a-namespace', {
      cwd: root,
      homeDir: home,
    }).then(
      () => {
        throw new Error('expected resolveConfigDefaults to reject');
      },
      error => {
        expect((error as Error).message).to.include('not-a-namespace');
      },
    );
  });

  it('rejects a namespace missing the "@scope/family" shape', async function () {
    await resolveConfigDefaults('sektek:app', {
      cwd: root,
      homeDir: home,
    }).then(
      () => {
        throw new Error('expected resolveConfigDefaults to reject');
      },
      error => {
        expect((error as Error).message).to.include('sektek:app');
      },
    );
  });
});
