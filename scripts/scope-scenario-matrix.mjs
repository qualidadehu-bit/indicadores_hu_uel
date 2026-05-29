/**
 * Matriz executável de cenários para detectar drift entre as regras de escopo
 * usadas no frontend e no worker.
 *
 * Observação: o worker não exporta helpers internos. Por isso, este script
 * replica o comportamento esperado das duas camadas para validação comportamental.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DASHBOARD_SCOPE_LEGACY = 'assistencial';
const DASHBOARD_SCOPE_COMISSOES = 'comissoes';
const ACAO_LANCAR_DADOS = 'lancar_dados';
const ACAO_VISUALIZAR = 'visualizar';
const ACAO_EDITAR = 'editar';
const ACAO_ADMIN = 'admin';
const WILDCARD = '*';
const ARGS = process.argv.slice(2);
const OUTPUT_JSON = ARGS.includes('--json');

function getOutPath(args) {
  const inline = args.find((arg) => arg.startsWith('--out='));
  if (inline) {
    const value = inline.slice('--out='.length).trim();
    return value || null;
  }
  const outIndex = args.indexOf('--out');
  if (outIndex === -1) return null;
  const next = String(args[outIndex + 1] || '').trim();
  return next || null;
}

const OUTPUT_FILE = getOutPath(ARGS);

function normalizeGrupo(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeScopeAction(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const flat = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (!flat) return '';
  if (flat === WILDCARD) return WILDCARD;
  if (flat === ACAO_ADMIN || flat === 'administrar' || flat === 'administracao') return ACAO_ADMIN;
  if (flat === ACAO_VISUALIZAR || flat === 'visualizacao' || flat === 'ver') return ACAO_VISUALIZAR;
  if (flat === ACAO_EDITAR || flat === 'edicao') return ACAO_EDITAR;
  if (flat === ACAO_LANCAR_DADOS || flat === 'lancar' || flat === 'lancamento') return ACAO_LANCAR_DADOS;
  return flat;
}

function normalizeDashboardScope(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  const valueFlat = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (valueFlat === 'comissoes' || valueFlat === 'dashboard_comissoes') return DASHBOARD_SCOPE_COMISSOES;
  if (valueFlat === 'assistencial' || valueFlat === 'dashboard_assistencial' || valueFlat === 'legado') {
    return DASHBOARD_SCOPE_LEGACY;
  }
  return DASHBOARD_SCOPE_LEGACY;
}

function parseRules(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => {
        if (!r || typeof r !== 'object') return null;
        const acao = normalizeScopeAction(r.acao);
        if (!acao) return null;
        const dashRaw = String(r.dashboard || '').trim();
        const dashboard = dashRaw === WILDCARD ? WILDCARD : normalizeDashboardScope(dashRaw);
        const grupoRaw = String(r.grupo || '').trim();
        const grupo = grupoRaw === WILDCARD ? WILDCARD : normalizeGrupo(grupoRaw);
        return { acao, dashboard, grupo: grupo || '' };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function matchesLikeFrontend(rules, action, scope) {
  const acaoNorm = normalizeScopeAction(action);
  const dashboardNorm = normalizeDashboardScope(scope?.dashboard);
  const grupoNorm = normalizeGrupo(scope?.grupo);
  return (rules || []).some((rule) => {
    const acaoOk = rule.acao === acaoNorm || rule.acao === ACAO_ADMIN || rule.acao === WILDCARD;
    const dashOk = rule.dashboard === WILDCARD || rule.dashboard === dashboardNorm;
    if (!acaoOk || !dashOk) return false;
    const ruleGrupo = normalizeGrupo(rule.grupo);
    if (!ruleGrupo || ruleGrupo === WILDCARD) return true;
    return ruleGrupo === grupoNorm;
  });
}

function matchesLikeWorker(rules, action, scope) {
  const actionNorm = normalizeScopeAction(action);
  const dashNorm = normalizeDashboardScope(scope?.dashboard);
  const grupoNorm = normalizeGrupo(scope?.grupo);
  return (rules || []).some((rule) => {
    const actionOk = rule.acao === actionNorm || rule.acao === ACAO_ADMIN || rule.acao === WILDCARD;
    const dashOk = rule.dashboard === WILDCARD || rule.dashboard === dashNorm;
    if (!actionOk || !dashOk) return false;
    if (!rule.grupo || rule.grupo === WILDCARD) return true;
    return normalizeGrupo(rule.grupo) === grupoNorm;
  });
}

function canFrontend(user, action, scope) {
  if (!user || String(user.tipo) !== 'gestor') return true;
  const rules = parseRules(user.permissoes_escopo);
  if (!rules.length) return true; // legado
  return matchesLikeFrontend(rules, action, scope);
}

function canWorker(user, action, scope) {
  if (!user || String(user.tipo) !== 'gestor') return true;
  const rules = parseRules(user.permissoes_escopo);
  if (!rules.length) return true; // legado
  return matchesLikeWorker(rules, action, scope);
}

/**
 * Simula a decisão de escopo público no worker para operações de leitura.
 * Regra atual: sem sessão, leitura fica em `assistencial` por padrão e só usa
 * `comissoes` quando o cliente pede explicitamente `filter.dashboard_scope`.
 * @param {unknown} requestedDashboardScope
 */
function resolvePublicReadScope(requestedDashboardScope) {
  const requested = normalizeDashboardScope(requestedDashboardScope);
  return requested === DASHBOARD_SCOPE_COMISSOES ? DASHBOARD_SCOPE_COMISSOES : DASHBOARD_SCOPE_LEGACY;
}

/**
 * Simula a regra do worker para mutações sem sessão.
 * Regra atual: create/update/delete em qualquer entidade exigem sessão.
 * @param {string} entity
 * @param {string} operation
 */
function isMutationWithoutSessionAllowed(entity, operation) {
  const op = String(operation || '').trim().toLowerCase();
  const isMutation = op === 'create' || op === 'update' || op === 'delete';
  if (!isMutation) return true;
  return false;
}

function mutationActionByEntityOperation(entity, operation) {
  const op = String(operation || '').trim().toLowerCase();
  if (String(entity || '').trim() === 'Lancamento' && (op === 'create' || op === 'update')) {
    return ACAO_LANCAR_DADOS;
  }
  if (op === 'create' || op === 'update' || op === 'delete') return ACAO_EDITAR;
  return ACAO_VISUALIZAR;
}

const scenarios = [
  {
    name: 'visualizar comissoes exato',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'visualizar', dashboard: 'comissoes', grupo: '*' }]),
    },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'alias acao administrar => admin',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'administrar', dashboard: 'comissoes', grupo: '*' }]),
    },
    action: ACAO_EDITAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'alias dashboard com acento',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'visualizar', dashboard: 'Dashboard Comissões', grupo: '*' }]),
    },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'grupo wildcard permite qualquer grupo',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'lancar_dados', dashboard: 'comissoes', grupo: '*' }]),
    },
    action: ACAO_LANCAR_DADOS,
    scope: { dashboard: 'comissoes', grupo: 'comissao_obitos' },
    expected: true,
  },
  {
    name: 'grupo diferente bloqueia',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'lancar_dados', dashboard: 'comissoes', grupo: 'comissao_ccih' }]),
    },
    action: ACAO_LANCAR_DADOS,
    scope: { dashboard: 'comissoes', grupo: 'comissao_obitos' },
    expected: false,
  },
  {
    name: 'acao wildcard permite',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: '*', dashboard: 'comissoes', grupo: '*' }]),
    },
    action: ACAO_EDITAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'dashboard wildcard permite',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'visualizar', dashboard: '*', grupo: '*' }]),
    },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'assistencial' },
    expected: true,
  },
  {
    name: 'sem regras mantém legado',
    user: { tipo: 'gestor', permissoes_escopo: '' },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'json invalido mantém legado',
    user: { tipo: 'gestor', permissoes_escopo: '{bad json' },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
  {
    name: 'perfil nao gestor sempre permitido',
    user: { tipo: 'escritorio', permissoes_escopo: JSON.stringify([{ acao: 'visualizar', dashboard: 'assistencial' }]) },
    action: ACAO_VISUALIZAR,
    scope: { dashboard: 'comissoes' },
    expected: true,
  },
];

const publicReadScenarios = [
  {
    name: 'sem filtro dashboard_scope => legado',
    requestedDashboardScope: undefined,
    expectedScope: DASHBOARD_SCOPE_LEGACY,
  },
  {
    name: 'filtro comissoes => leitura publica comissoes',
    requestedDashboardScope: 'comissoes',
    expectedScope: DASHBOARD_SCOPE_COMISSOES,
  },
  {
    name: 'alias dashboard com acento => comissoes',
    requestedDashboardScope: 'Dashboard Comissões',
    expectedScope: DASHBOARD_SCOPE_COMISSOES,
  },
  {
    name: 'filtro assistencial => legado',
    requestedDashboardScope: 'assistencial',
    expectedScope: DASHBOARD_SCOPE_LEGACY,
  },
  {
    name: 'filtro invalido => fallback legado',
    requestedDashboardScope: 'qualquer_coisa',
    expectedScope: DASHBOARD_SCOPE_LEGACY,
  },
];

const mutationWithoutSessionScenarios = [
  {
    name: 'create Indicador sem sessão => bloqueado',
    entity: 'Indicador',
    operation: 'create',
    expectedAllowed: false,
  },
  {
    name: 'update Lancamento sem sessão => bloqueado',
    entity: 'Lancamento',
    operation: 'update',
    expectedAllowed: false,
  },
  {
    name: 'delete Meta sem sessão => bloqueado',
    entity: 'Meta',
    operation: 'delete',
    expectedAllowed: false,
  },
  {
    name: 'create Modulo sem sessão => bloqueado',
    entity: 'Modulo',
    operation: 'create',
    expectedAllowed: false,
  },
  {
    name: 'list Indicador sem sessão => permitido (somente leitura)',
    entity: 'Indicador',
    operation: 'list',
    expectedAllowed: true,
  },
  {
    name: 'filter Lancamento sem sessão => permitido (somente leitura)',
    entity: 'Lancamento',
    operation: 'filter',
    expectedAllowed: true,
  },
  {
    name: 'create Setor sem sessão => bloqueado',
    entity: 'Setor',
    operation: 'create',
    expectedAllowed: false,
  },
];

const mutationWithSessionScenarios = [
  {
    name: 'gestor sem regras em mutação escopada => legado permitido',
    user: { tipo: 'gestor', permissoes_escopo: '' },
    entity: 'Indicador',
    operation: 'update',
    scope: { dashboard: 'comissoes', grupo: '' },
    expectedAllowed: true,
  },
  {
    name: 'gestor com regra incompatível em edição => bloqueado',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'editar', dashboard: 'assistencial', grupo: '*' }]),
    },
    entity: 'Indicador',
    operation: 'update',
    scope: { dashboard: 'comissoes', grupo: '' },
    expectedAllowed: false,
  },
  {
    name: 'gestor com regra compatível em edição => permitido',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'editar', dashboard: 'comissoes', grupo: '*' }]),
    },
    entity: 'Indicador',
    operation: 'update',
    scope: { dashboard: 'comissoes', grupo: '' },
    expectedAllowed: true,
  },
  {
    name: 'gestor com admin em comissoes => permitido',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'admin', dashboard: 'comissoes', grupo: '*' }]),
    },
    entity: 'Meta',
    operation: 'delete',
    scope: { dashboard: 'comissoes', grupo: 'comissao_obitos' },
    expectedAllowed: true,
  },
  {
    name: 'lancar_dados com grupo diferente => bloqueado',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'lancar_dados', dashboard: 'comissoes', grupo: 'comissao_ccih' }]),
    },
    entity: 'Lancamento',
    operation: 'create',
    scope: { dashboard: 'comissoes', grupo: 'comissao_obitos' },
    expectedAllowed: false,
  },
  {
    name: 'lancar_dados com grupo wildcard => permitido',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'lancar_dados', dashboard: 'comissoes', grupo: '*' }]),
    },
    entity: 'Lancamento',
    operation: 'create',
    scope: { dashboard: 'comissoes', grupo: 'comissao_obitos' },
    expectedAllowed: true,
  },
  {
    name: 'alias administrar em mutação => permitido',
    user: {
      tipo: 'gestor',
      permissoes_escopo: JSON.stringify([{ acao: 'administrar', dashboard: 'dashboard comissões', grupo: '*' }]),
    },
    entity: 'Indicador',
    operation: 'update',
    scope: { dashboard: 'comissoes', grupo: '' },
    expectedAllowed: true,
  },
];

let failed = 0;
const sectionSummaries = [];
const sectionResults = [];
const totalScenarios =
  scenarios.length +
  publicReadScenarios.length +
  mutationWithoutSessionScenarios.length +
  mutationWithSessionScenarios.length;

function logInfo(message = '') {
  if (!OUTPUT_JSON) console.log(message);
}

function logError(message = '') {
  if (!OUTPUT_JSON) console.error(message);
}

async function maybeWriteJsonFile(payload) {
  if (!OUTPUT_FILE) return;
  const absoluteOutput = resolve(OUTPUT_FILE);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runSection(title, sectionScenarios, evaluator) {
  logInfo(`\n[${title}]`);
  let passed = 0;
  let localFailed = 0;
  const cases = [];
  for (const scenario of sectionScenarios) {
    const result = evaluator(scenario);
    cases.push({
      name: scenario.name,
      ok: !!result.ok,
      detail: result.detail,
    });
    if (!result.ok) {
      localFailed += 1;
      failed += 1;
      logError(`FAIL: ${scenario.name}\n${result.detail}\n`);
    } else {
      passed += 1;
      logInfo(`OK  : ${scenario.name}`);
    }
  }
  sectionSummaries.push({ title, total: sectionScenarios.length, passed, failed: localFailed });
  sectionResults.push({ title, total: sectionScenarios.length, passed, failed: localFailed, cases });
}

runSection('escopo', scenarios, (scenario) => {
  const front = canFrontend(scenario.user, scenario.action, scenario.scope);
  const worker = canWorker(scenario.user, scenario.action, scenario.scope);
  const expected = scenario.expected;
  return {
    ok: front === worker && front === expected,
    detail: `  expected=${expected}\n  frontend=${front}\n  worker=${worker}`,
  };
});

runSection('leitura pública', publicReadScenarios, (scenario) => {
  const got = resolvePublicReadScope(scenario.requestedDashboardScope);
  return {
    ok: got === scenario.expectedScope,
    detail: `  expectedScope=${scenario.expectedScope}\n  gotScope=${got}`,
  };
});

runSection('mutação sem sessão', mutationWithoutSessionScenarios, (scenario) => {
  const gotAllowed = isMutationWithoutSessionAllowed(scenario.entity, scenario.operation);
  return {
    ok: gotAllowed === scenario.expectedAllowed,
    detail: `  expectedAllowed=${scenario.expectedAllowed}\n  gotAllowed=${gotAllowed}`,
  };
});

runSection('mutação com sessão', mutationWithSessionScenarios, (scenario) => {
  const action = mutationActionByEntityOperation(scenario.entity, scenario.operation);
  const frontAllowed = canFrontend(scenario.user, action, scenario.scope);
  const workerAllowed = canWorker(scenario.user, action, scenario.scope);
  return {
    ok: frontAllowed === workerAllowed && frontAllowed === scenario.expectedAllowed,
    detail: `  expectedAllowed=${scenario.expectedAllowed}\n  frontendAllowed=${frontAllowed}\n  workerAllowed=${workerAllowed}`,
  };
});

if (failed > 0) {
  logError('\nResumo por bloco:');
  for (const section of sectionSummaries) {
    logError(`- [${section.title}] ${section.passed}/${section.total} OK (${section.failed} falha(s))`);
  }
  logError(`\nMatriz de cenários: ${failed} falha(s).`);
  const payload = {
    ok: false,
    total_scenarios: totalScenarios,
    failed_scenarios: failed,
    sections: sectionResults,
  };
  await maybeWriteJsonFile(payload);
  if (OUTPUT_JSON) console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
}

logInfo('\nResumo por bloco:');
for (const section of sectionSummaries) {
  logInfo(`- [${section.title}] ${section.passed}/${section.total} OK`);
}
logInfo(`\nMatriz de cenários: ${totalScenarios} cenário(s) OK.`);
if (OUTPUT_JSON) {
  const payload = {
    ok: true,
    total_scenarios: totalScenarios,
    failed_scenarios: 0,
    sections: sectionResults,
  };
  await maybeWriteJsonFile(payload);
  console.log(JSON.stringify(payload, null, 2));
} else {
  await maybeWriteJsonFile({
    ok: true,
    total_scenarios: totalScenarios,
    failed_scenarios: 0,
    sections: sectionResults,
  });
}
