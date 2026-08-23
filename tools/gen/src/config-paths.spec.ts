import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { configSearchPaths } from './config-paths.js';

describe('configSearchPaths', function () {
  let root: string;

  beforeEach(function () {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-paths-')));
  });

  afterEach(function () {
    rmSync(root, { recursive: true, force: true });
  });

  it('walks from cwd up through each ancestor, in order, to the filesystem root', function () {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-home-')));
    try {
      const nested = join(root, 'a', 'b', 'c');
      mkdirSync(nested, { recursive: true });

      const paths = configSearchPaths(nested, home);

      const expectedAncestors: string[] = [];
      let current = nested;
      for (;;) {
        expectedAncestors.push(current);
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }

      expect(paths.slice(0, expectedAncestors.length)).to.deep.equal(
        expectedAncestors,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('terminates at the filesystem root (the walk does not loop forever)', function () {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-home-')));
    try {
      const paths = configSearchPaths(root, home);

      // The last ancestor entry (immediately before home) must be its own
      // parent, i.e. the filesystem root.
      const ancestors = paths.slice(0, -1);
      const last = ancestors[ancestors.length - 1];
      expect(dirname(last)).to.equal(last);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('appends homeDir once at the end when not already covered by the ancestor walk', function () {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-home-')));
    try {
      const paths = configSearchPaths(root, home);

      expect(paths[paths.length - 1]).to.equal(home);
      expect(paths.filter(p => p === home)).to.have.lengthOf(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not duplicate homeDir when the ancestor walk already covers it (cwd is a descendant of home)', function () {
    const home = root;
    const nested = join(home, 'workspace', 'project');
    mkdirSync(nested, { recursive: true });

    const paths = configSearchPaths(nested, home);

    expect(paths.filter(p => p === home)).to.have.lengthOf(1);
    expect(paths[paths.length - 1]).to.not.equal(home);
  });

  it('does not duplicate homeDir when cwd equals homeDir', function () {
    const paths = configSearchPaths(root, root);

    expect(paths.filter(p => p === root)).to.have.lengthOf(1);
    expect(paths[0]).to.equal(root);
  });
});
