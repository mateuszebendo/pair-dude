# Pair Dude

Extensão do VS Code para sessões guiadas de pair programming conduzidas pelo Claude: balões de comentário ancorados no código, destaque visual, árvore de passos e retorno do usuário.

## Como funciona

A extensão observa `~/.pair-guide/sessions/` (configurável em `pairGuide.dataDir`).

| Arquivo | Escreve | Conteúdo |
|---|---|---|
| `<id>.session.json` | Claude | roteiro (metadados + passos) |
| `<id>.state.json` | extensão | passo atual, trecho exibido, decisão por passo |
| `<id>.events.jsonl` | extensão | respostas, dúvidas, entendi/aprovado/ajuste, navegação |

- Um balão por vez, no passo atual; árvore **Pair Dude → Roteiro** com todos os passos.
- **Entendi / Aprovar / Pedir ajuste / Perguntar** no próprio balão; selecione qualquer trecho e comente para gerar um `ask`.
- `ctrl+alt+n` / `ctrl+alt+p` próximo/anterior, `ctrl+alt+u` entendi, `ctrl+alt+l` escolher passo.
- Âncora por texto (`anchor`) mantém o balão no trecho certo quando o código muda.

O contrato completo (esquema do JSON, modos revisão/implementação/planejamento) está na skill `~/.claude/skills/pair-dude/SKILL.md`.

## Estilo e diagramas

- Código inline colorido por papel (função, tipo, constante, string), selos coloridos de tipo/severidade, `callouts` (por quê, dica, atenção, risco) e `snippets` com sintaxe colorida (linguagem inferida pelo arquivo). Desative o HTML restrito com `pairGuide.richText = false` se algo aparecer quebrado.
- **Diagramas Mermaid** (fluxo, sequência, classes, estados, requisitos, ER…) renderizados localmente via Edge/Chrome headless (`pairGuide.browserPath` para forçar o caminho) e exibidos no balão, com **🔍 Ampliar** (zoom e código). Cache em `~/.pair-guide/cache`.

## Diff com explicação

`compare` abre o editor de diff nativo com o balão ancorado no lado novo:
- `implemented`: ref git (`baseRef`) ↔ arquivo atual.
- `proposed`: arquivo atual ↔ versão virtual com a proposta (`replace` ou `code`); nada é gravado em disco.

## Instalar

```bash
npm ci
npm run package
```

O pacote será criado em `../dist/pair-dude.vsix`. A partir da raiz do repositório, execute `scripts/install.ps1` no Windows ou `scripts/install.sh` no macOS/Linux para instalar a extensão junto da skill.

Depois, recarregue a janela do VS Code.

## Licença

Pair Dude é distribuído sob a licença MIT, incluída no arquivo `LICENSE` do pacote. O Mermaid em `resources/` mantém seu aviso de terceiros em `THIRD_PARTY_NOTICES.md`.
