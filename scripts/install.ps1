$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$vsix = Join-Path $repo 'dist\pair-dude.vsix'
$skill = Join-Path $repo 'skill\pair-dude'
$dest = Join-Path $HOME '.claude\skills\pair-dude'

if (-not (Test-Path -LiteralPath $vsix)) {
    throw 'Pacote não encontrado. Execute "npm ci" e "npm run package" na pasta extension.'
}
if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    throw 'O comando "code" precisa estar no PATH.'
}

& code --install-extension $vsix --force
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar a extensão no VS Code.' }

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -LiteralPath (Join-Path $skill 'SKILL.md') -Destination $dest -Force
New-Item -ItemType Directory -Force -Path (Join-Path $dest 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $skill 'scripts\pg.mjs') -Destination (Join-Path $dest 'scripts') -Force

Write-Host 'Pair Dude instalado. Recarregue a janela do VS Code e reinicie o Claude Code.'
