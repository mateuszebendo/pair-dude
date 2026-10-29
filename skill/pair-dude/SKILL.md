---
name: pair-dude
description: Conduz sessões guiadas no editor (VS Code) com balões de comentário ancorados em trechos do código, destaque visual, árvore de passos e retorno do usuário (entendi, aprovado, pedir ajuste, dúvidas). Cobre revisão de código, explicação de mudanças, implementação em pareamento e planejamento. Use quando o usuário pedir para "navegar pelo código", "me mostrar no editor", "pair coding", "revisar comigo", "explicar parte por parte" ou para conduzir uma implementação/plano passo a passo com apoio visual. Aceita a flag `--didatico` (modo didático: explica o máximo possível, bem granular, como um sênior ensinando um júnior). Não use para respostas rápidas sem navegação nem quando a extensão Pair Dude não estiver instalada.
---

# Pair Dude

Conduza o usuário pelo código dentro do VS Code: cada **passo** vira um balão de comentário ancorado num trecho, com o trecho destacado. O usuário responde no próprio balão e eu leio o retorno. Só um balão aparece por vez; o ritmo é do usuário.

## Como funciona

Canal por arquivos, sem CLI do editor. Pasta: `~/.pair-guide/sessions/` (descubra o caminho absoluto com `node ~/.claude/skills/pair-dude/scripts/pg.mjs dir`).

| Arquivo | Quem escreve | Conteúdo |
|---|---|---|
| `<id>.session.json` | **eu** | roteiro: metadados + lista de passos |
| `<id>.state.json` | extensão | passo atual, o que está na tela, decisão por passo |
| `<id>.events.jsonl` | extensão | respostas, dúvidas, "entendi", "aprovado", "pedir ajuste", navegação |

A extensão observa a pasta: gravar/alterar o `.session.json` atualiza o editor na hora. **Nunca edite** `state.json`/`events.jsonl`.

Pré-requisito: extensão instalada (`code --list-extensions | grep pair-dude`). Se faltar, use o script `scripts/install.sh` ou `scripts/install.ps1` na raiz do repositório e peça para o usuário recarregar a janela.

## Fluxo de uma sessão

1. **Entenda o objetivo e o modo** (abaixo). Levante o material (diff, arquivos, plano) antes de montar o roteiro; leia o código de verdade, não adivinhe linhas.
2. **Monte o roteiro** em ordem de compreensão (do conceito central para os detalhes), não em ordem alfabética de arquivos. Prefira 6–15 passos; agrupe com `group`. Com a flag `--didatico`, siga a seção "Modo didático" (mais passos, mais granular).
3. **Grave** `<id>.session.json` com a ferramenta Write (caminho absoluto) e valide:
   `node ~/.claude/skills/pair-dude/scripts/pg.mjs validate <id>`. Corrija erros; avalie os avisos (âncora não encontrada etc.).
4. **Avise no chat em 1–2 linhas** que o roteiro está no editor (primeiro balão aberto), com o panorama dos passos. Não repita o conteúdo dos balões no chat.
5. **Pare e fique ouvindo** (seção "Conversa ao vivo" abaixo). O usuário navega sozinho (Próximo/Anterior) e responde nos balões; o balão é um mini chat daquele passo. Para ler o que chegou sem esperar: `node ~/.claude/skills/pair-dude/scripts/pg.mjs inbox <id>` — mostra só os eventos novos desde a última leitura, o passo atual e o trecho em que ele está.
6. **Trate o retorno** (tabela abaixo), atualizando o `.session.json`. Todas as respostas devem ir **no balão**; o chat fica para coordenação.
7. Ao terminar, faça um fechamento curto no chat com: o que foi aprovado, o que ficou com "ajuste pedido", próximos passos.

## Conversa ao vivo (obrigatório enquanto a sessão estiver ativa)

Sem isso, as mensagens do usuário no balão ficam sem resposta: eu só enxergo arquivos quando alguém me aciona. O balão mostra ao usuário se há alguém ouvindo (🟢 ouvindo, ✍️ respondendo, ⚪ ninguém) e o estado de cada mensagem (⏳ enviado → 👀 visto → ✓ respondido). Cumpra o ciclo:

1. **Ao publicar a sessão**, grave `"claudeSession": "<id desta conversa>"` no JSON (é o nome da pasta pai do scratchpad indicado no ambiente, um UUID); o botão "Chamar o Claude" do balão usa isso para abrir esta conversa.
2. **Logo depois de avisar o usuário, inicie a escuta em segundo plano** (Bash com `run_in_background: true`):
   `node ~/.claude/skills/pair-dude/scripts/pg.mjs wait <id> 1500`
   O comando bloqueia, mantém a presença 🟢 e **termina sozinho** quando chega `reply`, `ask`, `changes`, `diagram_error` ou `compare_warning` (navegação e "entendi/aprovado" não acordam, mas vêm junto na próxima leitura). Ao terminar, você é reativado e a saída já traz o `inbox` (eventos novos); a presença vira ✍️ e a mensagem 👀 automaticamente.
3. **Ao ser reativado:** leia a saída, **responda no balão** (`replies` com `to` = `ts` do evento; passo novo para `ask`; ajuste de código para `changes`) e **reinicie a escuta** (volte ao item 2). Se a saída for `{"timeout": true}`, apenas reinicie.
4. **Pare de escutar** quando o usuário disser que terminou, quando todos os passos estiverem decididos ou quando você encerrar a sessão (`pg.mjs presence <id> idle`).
5. Uma resposta demorada (investigar código, editar) deve começar com um `reply` curto de reconhecimento ("Entendi o pedido; vou analisar X"), para o usuário não ficar sem sinal; depois complemente com outro `reply` (com o mesmo `to`).
6. Não prometa no balão o que não vai fazer: se for mudar código, diga o que e peça confirmação quando o risco justificar.

## Tratando o retorno (`inbox`)

| Evento | Significado | O que fazer |
|---|---|---|
| `reply` (step) | dúvida/comentário no balão do passo | responder no balão: adicione em `steps[i].replies` `{ "to": "<ts do evento>", "text": "…" }` |
| `ask` (file, linhas, snippet) | usuário comentou um trecho qualquer | criar um passo `kind: "question"` ancorado nesse trecho, logo após o atual, e definir `current` nele |
| `changes` (text) | pediu ajuste | revisão: reconsiderar/explicar melhor via reply; implementação: ajustar o código e registrar um passo `change` |
| `understood` / `approved` | ok no passo | seguir; se todos os passos estiverem ok, encerrar |
| `view` | só navegação | ignorar (útil para saber onde ele está) |
| `compare_warning` (step, text) | um `find` da proposta não casou com o arquivo | corrigir o `replace` (o arquivo pode ter mudado) |
| `diagram_error` (step, text) | um diagrama Mermaid falhou ao renderizar | corrigir a sintaxe no `.session.json` e rodar `check-diagrams` |

Para **conduzir** o usuário a um passo (ex.: depois de responder uma dúvida), defina `"current": "<id>"` no JSON; a extensão navega ao detectar a mudança.

## Esquema do `.session.json`

```json
{
  "id": "revisao-feat-712311",
  "title": "Revisão da branch feat-712311",
  "mode": "review",
  "root": "C:/Users/.../repositorio",
  "claudeSession": "uuid-desta-conversa",
  "baseRef": "commit-onde-a-branch-nasceu (opcional; base dos diffs 'implemented')",
  "summary": "Markdown com o panorama (aparece em 'Mostrar resumo da sessão').",
  "current": "s1",
  "steps": [
    {
      "id": "s1",
      "group": "Domínio",
      "kind": "explain",
      "title": "Perfil por fato gerador",
      "file": "source/projects/x/src/lib/dominio/fato-gerador-perfil.ts",
      "startLine": 10,
      "endLine": 32,
      "anchor": "export const PERFIL_POR_FAMILIA",
      "focus": ["permitePreenchimentoManual"],
      "severity": "medium",
      "progress": "planned",
      "body": "Markdown explicando o trecho e o **porquê**.",
      "diff": "- linha removida\n+ linha adicionada",
      "proposal": { "language": "ts", "code": "const x = 1;" },
      "replies": [{ "to": "2026-10-28T12:00:00.000Z", "text": "Resposta à dúvida." }]
    }
  ]
}
```

Campos: `id` (único, curto, estável), `kind`, `title` e `body` são o essencial. `file` é relativo a `root` (ou absoluto). Linhas são 1-based e inclusivas.

- **`anchor`**: texto exato do início do trecho. A extensão o procura no arquivo e usa a ocorrência mais próxima de `startLine`; **sempre informe** em implementação (as linhas mudam quando eu edito). Se faltar, cai nas linhas.
- **`focus`**: lista de substrings dentro do trecho que ganham destaque forte (os "highlights" do que quero que ele olhe).
- **`kind`** (cor e ícone): `explain` 💡 explicar · `review` 🔎 achado de revisão · `risk` ⚠️ risco/regressão · `change` ✏️ mudança feita/proposta · `plan` 🧭 passo de plano · `question` ❓ pergunta/ask · `note` 📝 nota.
- **`severity`**: `info|low|medium|high|blocker` — use em `review`/`risk`.
- **`progress`**: `planned|doing|done|skipped` — use em implementação/planejamento; atualize o JSON conforme avança.
- **`diff`** (revisão/mudança) e **`proposal`** (código sugerido, ainda não aplicado): aparecem como blocos de código no balão.
- **Todo passo é um balão num editor; nunca gere `.md`/painel por fora.** Onde o balão ancora:
  - `file` existe no disco → o arquivo real (com destaque).
  - **`ref`** (ex.: `"ref": "origin/master"`) → o arquivo **como estava naquela ref do git**, somente leitura, com balão e destaque no trecho (`anchor`/linhas valem para o conteúdo da ref). Use para mostrar código que não está no seu working tree (outra branch, master, commit antigo).
  - `file` informado mas inexistente (arquivo novo planejado) → editor vazio com o nome do futuro arquivo; o balão carrega a explicação.
  - sem `file` → uma "nota" mínima com o título; o balão carrega o conteúdo. Prefira sempre ancorar num trecho real quando houver um.
- **`callouts`**: `[{ "type": "why|tip|info|warning|danger", "title?": "…", "text": "…" }]` — destaques coloridos (🧠 Por quê, 💡 Dica, ℹ️ Contexto, ⚠️ Atenção, ⛔ Risco). Use para a **intenção** (`why`) e para armadilhas (`warning`/`danger`), não para repetir o corpo.
- **`snippets`**: `[{ "title?": "…", "language?": "typescript", "code": "…", "caption?": "…" }]` — blocos de código com sintaxe colorida. A linguagem vem da extensão de `file` se omitida.
- **`diagrams`**: `[{ "title?": "…", "source": "<mermaid>", "caption?": "…" }]` — diagramas (seção abaixo). Alternativa: um bloco ```` ```mermaid ```` dentro do `body`.

## Diff no editor (`compare`)

Com `compare`, o passo abre o **editor de diff nativo** do VS Code e o balão continua ancorado no lado novo (a explicação não se perde). Exige `file`. Dois modos:

| `compare.type` | Esquerda | Direita | Use para |
|---|---|---|---|
| `implemented` | o arquivo na ref git `baseRef` (arquivo novo = vazio) | o arquivo **atual** em disco | revisar o que já foi feito; mostrar antes → depois |
| `proposed` | o arquivo **atual** | versão **virtual** com a minha proposta aplicada (nada é gravado) | planejamento/implementação: mostrar o que vai mudar antes de editar |

```json
{ "id": "s5", "kind": "change", "title": "…", "file": "src/a.ts", "startLine": 10, "endLine": 20,
  "anchor": "export function foo",
  "compare": { "type": "implemented", "baseRef": "e5d7a60" } }
```
```json
{ "id": "s6", "kind": "plan", "title": "…", "file": "src/a.ts",
  "compare": { "type": "proposed",
    "replace": [ { "find": "return 1;", "with": "return 2;" } ] } }
```

- `baseRef`: commit/branch/tag do lado antigo. Se omitido, usa o `baseRef` da **sessão** (defina-o em revisão de branch, ex.: o commit onde ela nasceu) e, na falta, `HEAD`.
- `implemented`: o destaque usa `anchor`/`startLine`/`endLine` no arquivo atual, como nos passos normais. Se o arquivo não existir mais, o passo cai no modo normal.
- `proposed`: informe `replace` (lista de `{find, with}`; texto exato, 1ª ocorrência, aplicados em ordem; ideal para mudanças pontuais) **ou** `code` (arquivo inteiro; use para arquivo novo). O destaque marca automaticamente as linhas alteradas; não precisa de `startLine`. Se um `find` não for encontrado, o balão avisa e chega a mim como evento `compare_warning`.
- Se o arquivo atual mudar (por exemplo, depois de eu implementar a proposta), o diff `proposed` se recalcula sozinho.
- O fluxo típico em implementação: passo `proposed` → o usuário aprova → eu edito o código → o mesmo passo vira `implemented` (troque o `compare` e marque `progress: "done"`).
- `diff`/`proposal` (texto no balão) continuam úteis para trechos pequenos; prefira `compare` quando o arquivo/trecho é o que o usuário precisa **ler em contexto**.
- Valide com `pg.mjs validate <id>`: confere a ref git, se o `find` existe e o formato.

## Estilo do texto (use sempre que falar de código)

- Todo código vai em **crase**: `` `obterPerfilFatoGerador(sigla)` ``. A extensão colore o inline por papel (função, tipo, constante, string, palavra-chave); por isso escreva identificadores **completos e reais** (`TipoDocumentoEnum.CPF`, `FAMILIA_POR_SIGLA`), não paráfrases.
- Trechos de mais de uma linha: bloco cercado com linguagem (```` ```typescript ````), `snippets` ou `diff`/`proposal`. Sem linguagem informada, herda a do arquivo.
- Hierarquia dentro do balão: 1 frase de resumo → detalhe (lista curta) → `callouts` para o porquê/risco. Negrito só no que decide; sem parede de texto.
- Selos de tipo/severidade/progresso e callouts são coloridos automaticamente.

## Diagramas (Mermaid)

A extensão renderiza Mermaid localmente (Edge/Chrome headless, sem rede) e mostra a imagem no balão com um link **🔍 Ampliar** (painel com zoom e visão do código). Os diagramas são pré-renderizados em segundo plano ao carregar a sessão; erros de sintaxe voltam no `inbox` como evento `diagram_error`.

**Quando usar** (somente se ajudar mais que o texto; no máximo 1 por passo, 3–12 nós):

| Para explicar | Use | Observação |
|---|---|---|
| fluxo de decisão, pipeline, "para onde vai o dado" | `flowchart TB` | prefira `TB` (vertical) para caber no balão |
| interação entre componentes/serviços ao longo do tempo | `sequenceDiagram` | `alt/else` para ramos; `actor` para o usuário |
| estrutura: classes, contratos, modelos | `classDiagram` | `<<enumeration>>`, `<<interface>>`; genéricos como `List~T~` |
| estados e transições (etapas, status) | `stateDiagram-v2` | |
| requisitos e rastreabilidade (planejamento) | `requirementDiagram` | requisito → elemento que o atende |
| tabelas e relações | `erDiagram` | |
| arquitetura/contexto | `flowchart` com `subgraph`, ou `C4Context` | |
| cronograma de um plano | `gantt` ou `timeline` | |

**Convenções:**
- Destaque o que **muda** na branch/entrega: `classDef novo fill:#2e8b57,stroke:#1f6b41,color:#ffffff` (verde = novo), `alterado fill:#b7791f,color:#ffffff` (âmbar), `removido fill:#c0392b,color:#ffffff` (vermelho). Diga a legenda na `caption`.
- Rótulos curtos e **sem acentos e sem `<br/>`** nos identificadores de nós/participantes; acentos são ok dentro de `"aspas"` em rótulos. Evite parênteses e `;` fora de aspas.
- Nomeie com os identificadores reais do código para o usuário reconhecer.
- **Valide antes de avisar o usuário:** `node ~/.claude/skills/pair-dude/scripts/pg.mjs check-diagrams <id>` (renderiza cada diagrama de verdade e lista os que falham). Corrija e rode de novo.
- Largura útil no balão ≈ 640 px; se o diagrama for mais largo que alto, troque para `TB`.

## Modos

### Revisão / explicação (`review`, `explain`)
- Um passo por ideia, não por arquivo. Comece pelo panorama e pelo núcleo conceitual; deixe testes e versão para o fim, agrupados.
- Cada balão responde: **o que mudou, por quê, e o que olhar com atenção**. Revisão: aponte riscos concretos (`risk`/`review` com `severity`) com cenário de falha, não opinião vaga. Elogio só quando ensina algo.
- Use `diff` para mostrar antes/depois quando a leitura do código atual não bastar. `focus` nas 1–3 expressões que importam.
- Não proponha reescrever; se achar problema, registre como achado e deixe o usuário decidir.

### Implementação (`implementation`)
- Antes de editar: passos `plan` (com `progress: "planned"`) descrevendo a mudança e, quando útil, `proposal` com o código previsto. Espere o `approved`/`changes` do usuário nos passos de decisão relevantes.
- Implemente **uma mudança conceitual pequena por vez**: marque o passo `doing`, edite o código, valide (build/testes do projeto), então marque `done` e adicione/atualize um passo `change` com `anchor` + `diff` do que foi feito. Combine com a skill `pareamento-cognitivo` para calibrar autonomia.
- Reancore após editar: refaça `startLine/endLine` e mantenha `anchor` para sobreviver a novas edições.
- Siga as regras do projeto (sem comentários no código, sem commit/branch/versão sem pedido etc.).

### Planejamento (`plan`)
- Passos `plan` ancorados no código que será tocado (ou sem `file`/com arquivo novo). Inclua alternativas e a recomendação no `body`, riscos em `risk`, perguntas abertas em `question`.
- Peça decisão explícita (`approved`/`changes`) nos pontos de escolha; registre as decisões no `summary` ao final.

## Modo didático (`--didatico`)

**Ativação:** a flag `--didatico` (também aceita `--didático`, `didatico` ou "modo didático" no pedido) liga o modo. Ela se combina com qualquer modo (`review`, `explain`, `implementation`, `plan`): o modo diz *o que* fazemos, a flag diz *como* eu conduzo. Ao detectá-la, **não pergunte nada**: assuma que o usuário quer entender tudo o que foi pedido, em profundidade, e siga assim até o fim da sessão. Grave `"didatico": true` no `.session.json` (a extensão ignora o campo; serve para eu lembrar do modo se o contexto for resumido) e diga em 1 linha no chat que o modo está ativo.

**Postura:** sênior explicando para um júnior que vai ter de mantê-lo sozinho depois. O objetivo não é entregar rápido, é o usuário **entender perfeitamente** o que estamos fazendo e por quê. Nada de "óbvio", nada de pular etapa, nada de jargão sem definir.

**Como montar o roteiro (mais granular que o normal):**
- **Um passo por conceito**, não por arquivo nem por bloco. Se um trecho tem 3 ideias, são 3 passos. Os limites de 6–15 passos e de ≤ ~12 linhas por balão **não valem** aqui: use quantos passos forem necessários e deixe o balão ter o tamanho que a explicação pedir (ainda com hierarquia: resumo, detalhe, callouts; sem parede de texto, quebre em passos).
- Ordem de aprendizado: **contexto → vocabulário → mecanismo → o trecho linha a linha → consequências → como validar**. Comece por um passo `explain` com o panorama: qual problema existe, onde esta peça se encaixa e o que o usuário saberá ao final.
- Antes de usar um termo, padrão, biblioteca ou conceito do projeto, dedique um passo (ou um `callout` `info`) a defini-lo com as palavras mais simples possíveis. Reaproveite o mesmo termo sempre com o mesmo nome.
- Ancore **cada** explicação no código real (`file` + `anchor` + `focus`); use `compare` para mostrar antes → depois e `diagrams` sempre que um fluxo, estado ou relação ficar mais claro desenhado (aqui o limite é 1 por passo, mas não há razão para economizar).

**O que todo balão didático deve conter (quando se aplicar):**
1. **O que é**: uma frase simples sobre o trecho.
2. **Como funciona**: passo a passo, em ordem de execução, citando os identificadores reais em crase. Em trechos densos, explique linha a linha (ou expressão a expressão) com um `snippet` e a explicação logo abaixo.
3. **Por quê** (`callout` `why`): a intenção, a regra de negócio ou a decisão de design por trás; que alternativa existia e por que não foi a escolhida.
4. **Exemplo concreto**: um valor de entrada real e o que sai (um mini "teste de mesa").
5. **Armadilha / o que dá errado** (`callout` `warning`): erro comum, efeito colateral, caso de borda, o que quebraria se alguém mexesse ali.
6. **Conexões**: de onde isto é chamado e o que depende disto (aponte os arquivos).
7. **Checagem de entendimento**: uma pergunta curta no fim ("o que acontece se `X` for nulo?"). Não avance sozinho; espere a resposta ou o "entendi" e corrija com gentileza se o modelo mental estiver torto.

**Em implementação:** explique **antes** de editar (o que vamos mudar, por quê, alternativas e trade-offs, com `compare: proposed`) e **depois** de editar (o que foi feito, como validar, o que o build/teste provou). Uma mudança conceitual por vez; mostre o raciocínio de como cheguei à solução, inclusive o que investiguei e descartei. Ensine a navegar: como achei o ponto de entrada, qual busca fiz, como o usuário encontraria isso sozinho.

**Em revisão/explicação:** explique até o que parece trivial se for necessário para o raciocínio fechar; para cada achado, mostre o cenário de falha passo a passo.

**Em planejamento:** apresente as alternativas lado a lado, com prós/contras e a recomendação, e ensine o critério usado para decidir, não só o resultado.

**Conversa:** dúvida do usuário é a parte mais valiosa. Responda em profundidade no balão, com analogia ou exemplo quando ajudar, e ofereça um passo extra (`question`) se o assunto merecer. Nunca faça o usuário sentir que a pergunta foi boba. Ao fim, o fechamento no chat inclui um **resumo do que foi aprendido** (3–7 pontos) e os conceitos que valem revisar.

**Honestidade:** ensinar também é dizer o que não sei ou não verifiquei. Quando uma explicação for inferência e não leitura do código, avise; cite de onde veio cada informação (arquivo e linha, doc, comando).

## Regras de ritmo e qualidade

- **Nunca despeje tudo de uma vez.** O roteiro existe completo, mas o usuário o consome passo a passo. Não avance `current` sozinho, a não ser para responder a uma dúvida.
- Texto de balão é curto (≤ ~12 linhas), em português, sem repetir o que o código já diz; explique intenção, contrato, efeito colateral. (No modo didático este limite é suspenso: veja a seção acima.)
- Ao reler o `inbox`, responda **tudo** que for `reply`/`ask` antes de qualquer outra coisa.
- Atualizações no JSON que alteram o passo aberto recriam o balão (rascunho do usuário pode se perder): evite regravar enquanto ele estiver digitando; faça edições cirúrgicas e em lote.
- Para regravar, leia o arquivo atual antes (o usuário pode ter novos `replies` esperando) e preserve `replies` existentes.
- IDs de passo são estáveis; não renumere ao inserir passos novos (use ids novos e posicione na lista).
- Dados de sessão ficam fora do repositório; não os versione.
