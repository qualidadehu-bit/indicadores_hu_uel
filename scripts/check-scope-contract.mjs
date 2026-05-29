import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FRONT_PATH = path.join(ROOT, 'src/lib/scopePermissions.js');
const FRONT_DASHBOARD_PATH = path.join(ROOT, 'src/lib/dashboardScope.js');
const WORKER_PATH = path.join(ROOT, 'worker/src/index.ts');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(content, token, label, errors) {
  if (!content.includes(token)) {
    errors.push(`${label}: faltando token "${token}"`);
  }
}

function main() {
  const errors = [];
  const front = read(FRONT_PATH);
  const dashboard = read(FRONT_DASHBOARD_PATH);
  const worker = read(WORKER_PATH);

  const aliasTokens = [
    'administrar',
    'administracao',
    'visualizacao',
    'ver',
    'lancar',
    'lancamento',
    'legado',
  ];

  for (const token of aliasTokens) {
    assertIncludes(front, token, 'frontend', errors);
    assertIncludes(worker, token, 'worker', errors);
  }
  assertIncludes(dashboard, 'dashboard_comissoes', 'frontend.dashboardScope', errors);
  assertIncludes(worker, 'dashboard_comissoes', 'worker', errors);
  assertIncludes(dashboard, 'dashboard_assistencial', 'frontend.dashboardScope', errors);
  assertIncludes(worker, 'dashboard_assistencial', 'worker', errors);
  assertIncludes(dashboard, 'dashboard_praticas_medicas', 'frontend.dashboardScope', errors);
  assertIncludes(worker, 'dashboard_praticas_medicas', 'worker', errors);

  const contractTokens = [
    'rule.acao === ACAO_ADMIN',
    'rule.acao === ACTION_ADMIN',
    'rule.dashboard === WILDCARD',
    'ruleGrupo === WILDCARD',
  ];
  for (const token of contractTokens) {
    const source = token.includes('ACTION_') ? worker : front;
    if (!source.includes(token)) {
      errors.push(`contrato: faltando "${token}"`);
    }
  }

  if (errors.length) {
    console.error('Falha no contrato de escopo front x worker:');
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log('Contrato de escopo front x worker: OK');
}

main();
