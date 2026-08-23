import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { main, resolveNamespace } from './cli.js';

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

describe('cli', function () {
  describe('resolveNamespace', function () {
    it('resolves a bare package alias to its :app generator', function () {
      expect(resolveNamespace('js', KNOWN_NAMESPACES)).to.equal(
        '@sektek/js:app',
      );
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
      expect(() =>
        resolveNamespace('js:nonexistent', KNOWN_NAMESPACES),
      ).to.throw(/Unknown generator/);
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

  // Regression coverage for the config-defaults wiring itself (SEK-42):
  // resolveNamespace()'s own tests above never touch resolveConfigDefaults(),
  // so nothing else exercises main() actually reading gen.config.* files in
  // automated mode. process.cwd()/HOME are real global process state, so
  // each test restores both in afterEach even if main() throws.
  describe('main (config defaults wired through automated mode)', function () {
    let projectDir: string;
    let homeDir: string;
    let destinationRoot: string;
    let originalCwd: string;
    let originalHome: string | undefined;

    beforeEach(function () {
      projectDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-project-'));
      homeDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-home-'));
      destinationRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-dest-'));
      originalCwd = process.cwd();
      originalHome = process.env.HOME;

      writeFileSync(
        join(projectDir, 'gen.config.json'),
        JSON.stringify({ license: 'MIT' }),
      );
      writeFileSync(
        join(homeDir, 'gen.config.json'),
        JSON.stringify({ author: 'Home Author <home@example.com>' }),
      );

      process.chdir(projectDir);
      process.env.HOME = homeDir;
    });

    afterEach(function () {
      process.chdir(originalCwd);
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(destinationRoot, { recursive: true, force: true });
    });

    const run = (...extraArgs: string[]) =>
      main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
        '--package-scope',
        'acme',
        ...extraArgs,
      ]);

    it('applies config-file defaults cascaded from cwd and home', async function () {
      await run();

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.author).to.equal('Home Author <home@example.com>');
      expect(packageJson.license).to.equal('MIT');
    });

    it('lets a CLI flag override a config-file default', async function () {
      await run('--license', 'Apache-2.0');

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.license).to.equal('Apache-2.0');
    });
  });
});
