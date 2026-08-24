#!/bin/sh
# Clones the sibling repos that used to live in this monorepo directly into
# their old paths, for local cross-package dev via the root npm workspaces.
# Each clone is gitignored (see .gitignore) — not tracked here, not a git
# submodule, just a local convenience checkout. Idempotent: skips any path
# that already exists.
#
# Usage: sh scripts/clone-siblings.sh

set -e

cd "$(dirname "$0")/.."

clone_if_missing() {
  url="$1"
  dest="$2"
  if [ -d "$dest/.git" ]; then
    echo "skip (already cloned): $dest"
  else
    git clone "$url" "$dest"
  fi
}

clone_if_missing https://github.com/sektek/generator.git libs/generator
clone_if_missing https://github.com/sektek/generator-test.git libs/generator-test
clone_if_missing https://github.com/sektek/generator-base.git generators/generator-base
clone_if_missing https://github.com/sektek/generator-js.git generators/generator-js
clone_if_missing https://github.com/sektek/gen.git tools/gen
