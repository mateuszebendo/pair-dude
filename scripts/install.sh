#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vsix="$repo/dist/pair-dude.vsix"
skill="$repo/skill/pair-dude"
dest="$HOME/.claude/skills/pair-dude"

if [[ ! -f "$vsix" ]]; then
  echo 'Pacote não encontrado. Execute "npm ci" e "npm run package" na pasta extension.' >&2
  exit 1
fi
if ! command -v code >/dev/null 2>&1; then
  echo 'O comando "code" precisa estar no PATH.' >&2
  exit 1
fi

code --install-extension "$vsix" --force
mkdir -p "$dest/scripts"
cp "$skill/SKILL.md" "$dest/SKILL.md"
cp "$skill/scripts/pg.mjs" "$dest/scripts/pg.mjs"

echo 'Pair Dude instalado. Recarregue a janela do VS Code e reinicie o Claude Code.'
