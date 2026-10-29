# Arquitetura do Pair Dude

O projeto tem dois componentes independentes que se comunicam por arquivos locais.

## Componentes

1. **Skill e CLI (`skill/pair-dude/`)**: orienta o Claude Code a montar roteiros e usa `pg.mjs` para criar, validar, listar e acompanhar sessões.
2. **Extensão (`extension/`)**: observa a pasta de sessões, mostra o passo atual no editor e grava decisões e mensagens do usuário.
3. **Instalação (`scripts/` e `dist/`)**: instala o VSIX e copia a skill, sem exigir build para o uso comum.

## Módulos da extensão

| Módulo | Responsabilidade |
| :--- | :--- |
| `extension.js` | Ativação e conexão dos serviços |
| `store.js` | Arquivos, observação, estado e eventos |
| `guide.js` | Orquestração da sessão e comandos do VS Code |
| `tree.js` | Árvore de passos na barra lateral |
| `anchor.js`, `decorations.js` | Localização e destaque do trecho de código |
| `render.js`, `style.js` | Conteúdo visual dos balões |
| `compare.js` | Diffs implementados e propostos |
| `diagrams.js`, `diagram-core.js` | Diagramas Mermaid, cache e renderização local |
| `types.js` | Tipos e constantes emitidos no pacote original |

## Contrato de sessão

```text
~/.pair-guide/
└── sessions/
    ├── <id>.session.json   # skill → extensão
    ├── <id>.state.json     # extensão → skill
    ├── <id>.events.jsonl   # extensão → skill
    └── <id>.presence.json  # presença da CLI
```

O roteiro é atualizado pela skill. A extensão é dona do estado e dos eventos. A skill não altera `state.json` nem `events.jsonl`; ela lê esses arquivos para responder ao usuário. Esse limite evita duas partes escrevendo o mesmo arquivo.

Os nomes internos `pairGuide.*`, o esquema `pair-guide` e a pasta `~/.pair-guide` continuam estáveis após a mudança de marca. Eles são parte do contrato de compatibilidade. O nome público da extensão e da skill é **Pair Dude**.

## Origem do código

O diretório recebido continha o VSIX 0.4.1 e a skill, sem o projeto TypeScript original. `extension/src/` contém os módulos JavaScript extraídos do VSIX. O manifesto, os recursos e o empacotamento foram ajustados para que o repositório possa ser mantido e gerar um novo VSIX a partir desse código.
