#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const CALLOUTS = ['why', 'tip', 'info', 'warning', 'danger'];
const DIAGRAM_TYPES = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram',
  'requirementDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline', 'gitGraph', 'C4Context', 'C4Container',
  'C4Component', 'C4Dynamic', 'quadrantChart', 'sankey-beta', 'xychart-beta', 'block-beta', 'architecture-beta',
];
const KINDS = ['explain', 'review', 'risk', 'change', 'plan', 'question', 'note'];
const MODES = ['review', 'implementation', 'plan', 'explain'];
const SEVERITIES = ['info', 'low', 'medium', 'high', 'blocker'];
const PROGRESS = ['planned', 'doing', 'done', 'skipped'];

const dataDir = process.env.PAIR_GUIDE_DIR || path.join(os.homedir(), '.pair-guide');
const sessionsDir = path.join(dataDir, 'sessions');

const [command, arg] = process.argv.slice(2);

switch (command) {
  case 'dir':
    fs.mkdirSync(sessionsDir, { recursive: true });
    console.log(sessionsDir);
    break;
  case 'list':
    list();
    break;
  case 'inbox':
    inbox(requireArg());
    break;
  case 'status':
    status(requireArg());
    break;
  case 'validate':
    validate(requireArg());
    break;
  case 'check-diagrams':
    await checkDiagrams(requireArg());
    break;
  case 'wait':
    await wait(requireArg(), Number(process.argv[4]) || 1500);
    break;
  case 'presence':
    presence(requireArg(), process.argv[4], process.argv[5]);
    break;
  default:
    console.error('uso: pg.mjs <dir|list|inbox <id>|status <id>|validate <id|arquivo>|check-diagrams <id|arquivo>|wait <id> [segundos]|presence <id> <listening|thinking|idle> [passo]>');
    process.exit(2);
}

function requireArg() {
  if (!arg) {
    console.error('faltou o id da sessão');
    process.exit(2);
  }
  return arg;
}

function sessionFile(id) {
  return path.join(sessionsDir, `${id}.session.json`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function list() {
  if (!fs.existsSync(sessionsDir)) {
    console.log('[]');
    return;
  }
  const items = fs
    .readdirSync(sessionsDir)
    .filter((f) => f.endsWith('.session.json'))
    .map((f) => {
      const full = path.join(sessionsDir, f);
      const raw = readJson(full, {});
      return {
        id: f.replace(/\.session\.json$/, ''),
        title: raw.title,
        mode: raw.mode,
        steps: raw.steps?.length ?? 0,
        modified: fs.statSync(full).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  console.log(JSON.stringify(items, null, 2));
}

function status(id) {
  const session = readJson(sessionFile(id), null);
  if (!session) {
    console.error(`sessão "${id}" não encontrada em ${sessionsDir}`);
    process.exit(1);
  }
  const state = readJson(path.join(sessionsDir, `${id}.state.json`), { steps: {} });
  const rows = (session.steps ?? []).map((s, i) => {
    const st = state.steps?.[s.id] ?? {};
    return {
      n: i + 1,
      id: s.id,
      title: s.title,
      visto: Boolean(st.seen),
      decisao: st.decision ?? null,
      progresso: s.progress ?? null,
      atual: state.current === s.id,
    };
  });
  console.log(JSON.stringify({ atual: state.current ?? null, view: state.view ?? null, passos: rows }, null, 2));
}

function inbox(id) {
  const eventsFile = path.join(sessionsDir, `${id}.events.jsonl`);
  const cursorFile = path.join(sessionsDir, `${id}.cursor`);
  const state = readJson(path.join(sessionsDir, `${id}.state.json`), null);
  const lines = fs.existsSync(eventsFile)
    ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter((l) => l.trim())
    : [];
  const cursor = fs.existsSync(cursorFile) ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0 : 0;
  const fresh = lines.slice(cursor).map((l) => JSON.parse(l));
  const meaningful = fresh.filter((e) => e.type !== 'view' && e.type !== 'session_opened');
  const views = fresh.filter((e) => e.type === 'view');
  fs.writeFileSync(cursorFile, String(lines.length));
  console.log(
    JSON.stringify(
      {
        atual: state?.current ?? null,
        olhandoAgora: state?.view ?? null,
        novosEventos: meaningful,
        passosVisitados: views.map((v) => v.step),
      },
      null,
      2,
    ),
  );
}

function validate(target) {
  const file = fs.existsSync(target) ? target : sessionFile(target);
  const raw = readJson(file, undefined);
  const errors = [];
  const warnings = [];
  if (raw === undefined) {
    console.error(`não foi possível ler/parsear ${file}`);
    process.exit(1);
  }
  if (!MODES.includes(raw.mode)) warnings.push(`mode inválido ou ausente (use ${MODES.join('|')})`);
  if (!raw.title) warnings.push('title ausente');
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push('steps precisa ser uma lista não vazia');
  } else {
    const ids = new Set();
    raw.steps.forEach((s, i) => {
      const at = `steps[${i}]${s.id ? ` (${s.id})` : ''}`;
      if (!s.id) errors.push(`${at}: id ausente`);
      else if (ids.has(s.id)) errors.push(`${at}: id duplicado`);
      ids.add(s.id);
      if (!s.title) warnings.push(`${at}: title ausente`);
      if (!KINDS.includes(s.kind)) warnings.push(`${at}: kind inválido (use ${KINDS.join('|')})`);
      if (s.severity && !SEVERITIES.includes(s.severity)) warnings.push(`${at}: severity inválida`);
      if (s.progress && !PROGRESS.includes(s.progress)) warnings.push(`${at}: progress inválido`);
      if (s.endLine && s.startLine && s.endLine < s.startLine) errors.push(`${at}: endLine < startLine`);
      for (const [n, src] of diagramSources(s).entries()) {
        const first = src.trim().split(/\s+/)[0];
        if (!DIAGRAM_TYPES.includes(first)) warnings.push(`${at}: diagrama ${n + 1} começa com "${first}" (tipo Mermaid desconhecido?)`);
      }
      (s.callouts ?? []).forEach((c, n) => {
        if (!CALLOUTS.includes(c.type)) warnings.push(`${at}: callouts[${n}].type inválido (use ${CALLOUTS.join('|')})`);
        if (!c.text) warnings.push(`${at}: callouts[${n}] sem text`);
      });
      if (s.compare) validateCompare(s, at, raw, warnings, errors);
      (s.snippets ?? []).forEach((c, n) => {
        if (typeof c.code !== 'string' || !c.code) warnings.push(`${at}: snippets[${n}] sem code`);
      });
      if (s.file) {
        const full = path.isAbsolute(s.file) ? s.file : raw.root ? path.join(raw.root, s.file) : undefined;
        if (!full) warnings.push(`${at}: file relativo sem "root" na sessão`);
        else if (s.ref) {
          const cwd = raw.root && fs.existsSync(raw.root) ? raw.root : path.dirname(full);
          const rel = raw.root && fs.existsSync(raw.root) ? path.relative(raw.root, full).split(path.sep).join('/') : path.basename(full);
          try {
            const text = execFileSync('git', ['-C', cwd, 'show', `${s.ref}:./${rel}`], { stdio: 'pipe', maxBuffer: 32 * 1024 * 1024 })
              .toString('utf8')
              .replace(/\r\n/g, '\n');
            if (s.anchor && !text.includes(String(s.anchor).replace(/\r\n/g, '\n'))) {
              warnings.push(`${at}: anchor não encontrada em ${s.ref}:${rel} (cairá nas linhas informadas)`);
            }
          } catch {
            errors.push(`${at}: não foi possível ler ${s.ref}:${rel} (ref inexistente ou arquivo ausente nela)`);
          }
        } else if (!fs.existsSync(full)) {
          warnings.push(`${at}: arquivo não existe no disco (${full}) — o balão ficará num editor vazio; para mostrar código de outra ref use "ref" (ex.: "origin/master")`);
        } else if (s.anchor) {
          const text = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
          if (!text.includes(String(s.anchor).replace(/\r\n/g, '\n'))) {
            warnings.push(`${at}: anchor não encontrada no arquivo (cairá nas linhas informadas)`);
          }
        }
      }
    });
    if (raw.current && !ids.has(raw.current)) errors.push(`current "${raw.current}" não é um id de passo`);
  }
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

function diagramSources(step) {
  const fenced = [...String(step.body ?? '').matchAll(/```mermaid[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const explicit = (step.diagrams ?? []).map((d) => String(d?.source ?? '')).filter(Boolean);
  return [...fenced, ...explicit];
}

function findExtension() {
  const candidates = [];
  const extDir = path.join(os.homedir(), '.vscode', 'extensions');
  if (fs.existsSync(extDir)) {
    const installed = fs.readdirSync(extDir);
    const current = installed.filter((n) => n.startsWith('mateus-zebendo.pair-dude-')).sort().reverse();
    const legacy = installed.filter((n) => n.startsWith('mateus-zebendo.pair-guide-')).sort().reverse();
    for (const name of [...current, ...legacy]) {
      candidates.push(path.join(extDir, name));
    }
  }
  candidates.push(path.resolve(process.cwd(), 'extension'));
  return candidates.find((dir) =>
    (fs.existsSync(path.join(dir, 'src', 'diagram-core.js')) || fs.existsSync(path.join(dir, 'out', 'diagram-core.js')))
    && fs.existsSync(path.join(dir, 'resources', 'mermaid.min.js'))
  );
}

async function checkDiagrams(target) {
  const file = fs.existsSync(target) ? target : sessionFile(target);
  const raw = readJson(file, undefined);
  if (!raw) {
    console.error(`não foi possível ler ${file}`);
    process.exit(1);
  }
  const extension = findExtension();
  if (!extension) {
    console.error('extensão pair-dude não encontrada; execute o instalador na pasta scripts do repositório');
    process.exit(1);
  }
  const coreFile = fs.existsSync(path.join(extension, 'src', 'diagram-core.js'))
    ? path.join(extension, 'src', 'diagram-core.js')
    : path.join(extension, 'out', 'diagram-core.js');
  const core = createRequire(import.meta.url)(coreFile);
  const browser = core.findBrowser();
  if (!browser) {
    console.error('nenhum navegador Edge/Chrome encontrado');
    process.exit(1);
  }
  const results = [];
  for (const [i, step] of (raw.steps ?? []).entries()) {
    for (const [n, source] of diagramSources(step).entries()) {
      try {
        const out = await core.renderMermaid(source, { mermaidJs: path.join(extension, 'resources', 'mermaid.min.js'), browser, dark: false });
        results.push({ step: step.id ?? i, diagrama: n + 1, ok: true, tamanho: `${Math.round(out.width)}x${Math.round(out.height)}` });
      } catch (error) {
        results.push({ step: step.id ?? i, diagrama: n + 1, ok: false, erro: String(error.message).split('\n').slice(0, 3).join(' ') });
      }
    }
  }
  console.log(JSON.stringify({ total: results.length, falhas: results.filter((r) => !r.ok).length, resultados: results }, null, 2));
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function validateCompare(step, at, session, warnings, errors) {
  const c = step.compare;
  if (!['implemented', 'proposed'].includes(c.type)) {
    errors.push(`${at}: compare.type deve ser implemented|proposed`);
    return;
  }
  if (!step.file) {
    errors.push(`${at}: compare exige "file"`);
    return;
  }
  const full = path.isAbsolute(step.file) ? step.file : session.root ? path.join(session.root, step.file) : undefined;
  if (c.type === 'implemented') {
    if (full && !fs.existsSync(full)) warnings.push(`${at}: compare implemented exige o arquivo atual (${full}); sem ele cai no modo normal`);
    const ref = c.baseRef ?? session.baseRef ?? 'HEAD';
    try {
      execFileSync('git', ['-C', session.root ?? path.dirname(full), 'rev-parse', '--verify', `${ref}^{commit}`], { stdio: 'pipe' });
    } catch {
      errors.push(`${at}: ref git inválida: ${ref}`);
    }
    return;
  }
  if (typeof c.code !== 'string' && !(c.replace ?? []).length) {
    errors.push(`${at}: compare proposed exige "code" ou "replace"`);
    return;
  }
  const text = full && fs.existsSync(full) ? fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n') : undefined;
  if (text === undefined && !c.code) warnings.push(`${at}: arquivo ainda não existe; use "code" com o conteúdo completo`);
  let current = text ?? '';
  for (const [n, r] of (c.replace ?? []).entries()) {
    const find = String(r.find ?? '').replace(/\r\n/g, '\n');
    if (!find) errors.push(`${at}: replace[${n}].find vazio`);
    else if (!current.includes(find)) warnings.push(`${at}: replace[${n}].find não encontrado no arquivo atual (a proposta será ignorada nesse trecho)`);
    else current = current.replace(find, String(r.with ?? '').replace(/\r\n/g, '\n'));
  }
}

function writePresence(id, state, step) {
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, `${id}.presence.json`),
      JSON.stringify({ state, step, pid: process.pid, at: new Date().toISOString() }),
    );
  } catch {
    return;
  }
}

function presence(id, state, step) {
  if (!['listening', 'thinking', 'idle'].includes(state)) {
    console.error('estado deve ser listening|thinking|idle');
    process.exit(2);
  }
  writePresence(id, state, step);
  console.log(JSON.stringify({ ok: true, state, step: step ?? null }));
}

async function wait(id, timeoutSec) {
  const eventsFile = path.join(sessionsDir, `${id}.events.jsonl`);
  const cursorFile = path.join(sessionsDir, `${id}.cursor`);
  const WAKE = new Set(['reply', 'ask', 'changes', 'diagram_error', 'compare_warning']);

  const pending = () => {
    const lines = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter((l) => l.trim()) : [];
    const cursor = fs.existsSync(cursorFile) ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0 : 0;
    const fresh = [];
    for (const line of lines.slice(cursor)) {
      try {
        fresh.push(JSON.parse(line));
      } catch {
        continue;
      }
    }
    return fresh.filter((e) => WAKE.has(e.type));
  };

  writePresence(id, 'listening');
  const beat = setInterval(() => writePresence(id, 'listening'), 20000);
  const leave = () => {
    clearInterval(beat);
    writePresence(id, 'idle');
    process.exit(0);
  };
  process.on('SIGINT', leave);
  process.on('SIGTERM', leave);

  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const wake = pending();
    if (wake.length > 0) {
      clearInterval(beat);
      writePresence(id, 'thinking', wake.find((e) => e.step)?.step);
      inbox(id);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  clearInterval(beat);
  writePresence(id, 'idle');
  console.log(JSON.stringify({ timeout: true }));
}
