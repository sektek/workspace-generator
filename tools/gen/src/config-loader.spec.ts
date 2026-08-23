import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { loadConfig } from './config-loader.js';

describe('loadConfig', function () {
  let dir: string;

  beforeEach(function () {
    dir = mkdtempSync(join(tmpdir(), 'sektek-gen-loader-'));
  });

  afterEach(function () {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when the directory has no gen.config.* file', async function () {
    expect(await loadConfig(dir)).to.be.undefined;
  });

  it('parses a gen.config.json file into a plain object', async function () {
    writeFileSync(
      join(dir, 'gen.config.json'),
      JSON.stringify({ profile: 'default', flag: true }),
    );

    expect(await loadConfig(dir)).to.deep.equal({
      profile: 'default',
      flag: true,
    });
  });

  it('parses a gen.config.yaml file into a plain object', async function () {
    writeFileSync(
      join(dir, 'gen.config.yaml'),
      'profile: default\nflag: true\n',
    );

    expect(await loadConfig(dir)).to.deep.equal({
      profile: 'default',
      flag: true,
    });
  });

  it('parses a gen.config.js file using ESM "export default"', async function () {
    writeFileSync(
      join(dir, 'gen.config.js'),
      'export default { profile: "esm", flag: true };\n',
    );

    expect(await loadConfig(dir)).to.deep.equal({
      profile: 'esm',
      flag: true,
    });
  });

  it('parses a gen.config.js file using CommonJS "module.exports" (no ambient package.json)', async function () {
    writeFileSync(
      join(dir, 'gen.config.js'),
      'module.exports = { profile: "cjs", flag: false };\n',
    );

    expect(await loadConfig(dir)).to.deep.equal({
      profile: 'cjs',
      flag: false,
    });
  });

  it('prefers .js over .yaml and .json when multiple gen.config.* files exist', async function () {
    writeFileSync(
      join(dir, 'gen.config.js'),
      'module.exports = { from: "js" };\n',
    );
    writeFileSync(join(dir, 'gen.config.yaml'), 'from: yaml\n');
    writeFileSync(join(dir, 'gen.config.json'), '{ "from": "json" }');

    expect(await loadConfig(dir)).to.deep.equal({ from: 'js' });
  });

  it('prefers .yaml over .json when both exist and there is no .js', async function () {
    writeFileSync(join(dir, 'gen.config.yaml'), 'from: yaml\n');
    writeFileSync(join(dir, 'gen.config.json'), '{ "from": "json" }');

    expect(await loadConfig(dir)).to.deep.equal({ from: 'yaml' });
  });

  it('throws an error including the absolute path for a malformed .json file', async function () {
    const file = join(dir, 'gen.config.json');
    writeFileSync(file, '{ not valid json');

    await loadConfig(dir).then(
      () => {
        throw new Error('expected loadConfig to reject');
      },
      error => {
        expect((error as Error).message).to.include(file);
      },
    );
  });

  it('throws an error including the absolute path for a malformed .yaml file', async function () {
    const file = join(dir, 'gen.config.yaml');
    writeFileSync(file, 'key: [1, 2\n');

    await loadConfig(dir).then(
      () => {
        throw new Error('expected loadConfig to reject');
      },
      error => {
        expect((error as Error).message).to.include(file);
      },
    );
  });

  it('throws an error including the absolute path for a malformed .js file', async function () {
    const file = join(dir, 'gen.config.js');
    writeFileSync(file, 'module.exports = {\n');

    await loadConfig(dir).then(
      () => {
        throw new Error('expected loadConfig to reject');
      },
      error => {
        expect((error as Error).message).to.include(file);
      },
    );
  });

  it('rejects a config file whose top-level value is an array', async function () {
    writeFileSync(join(dir, 'gen.config.json'), '["a", "b"]');

    await loadConfig(dir).then(
      () => {
        throw new Error('expected loadConfig to reject');
      },
      error => {
        expect(((error as Error).cause as Error).message).to.include(
          'expected the config to export a plain object',
        );
      },
    );
  });

  it('parses a gen.config.js file using CommonJS "module.exports" under an ambient "type": "module"', async function () {
    // Without a format-mismatch retry that also covers this direction,
    // `module`/`exports` aren't defined under real ESM evaluation and this
    // throws an uncaught ReferenceError instead of parsing correctly.
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
    writeFileSync(
      join(dir, 'gen.config.js'),
      'module.exports = { profile: "cjs-under-esm" };\n',
    );

    expect(await loadConfig(dir)).to.deep.equal({ profile: 'cjs-under-esm' });
  });

  it("memoizes by real path, not the caller's literal spelling", async function () {
    const file = join(dir, 'gen.config.json');
    writeFileSync(file, JSON.stringify({ value: 'first' }));

    const viaRealPath = await loadConfig(dir);
    const viaDifferentSpelling = await loadConfig(
      join(dir, '..', dir.split('/').pop()!),
    );

    // Mutating on disk after both reads confirms a third call (through
    // either spelling) still hits the same memoized entry, not a second,
    // independently-cached read.
    writeFileSync(file, JSON.stringify({ value: 'second' }));
    const third = await loadConfig(dir);

    expect(viaRealPath).to.deep.equal({ value: 'first' });
    expect(viaDifferentSpelling).to.equal(viaRealPath);
    expect(third).to.equal(viaRealPath);
  });

  it("only reads/parses a directory's config file once per process (memoized)", async function () {
    const file = join(dir, 'gen.config.json');
    writeFileSync(file, JSON.stringify({ value: 'first' }));

    const first = await loadConfig(dir);
    expect(first).to.deep.equal({ value: 'first' });

    // Mutate on disk after the first read: a second call reading through
    // memoization would still see "first", not this new value.
    writeFileSync(file, JSON.stringify({ value: 'second' }));

    const second = await loadConfig(dir);
    expect(second).to.deep.equal({ value: 'first' });
    expect(second).to.equal(first);
  });
});
