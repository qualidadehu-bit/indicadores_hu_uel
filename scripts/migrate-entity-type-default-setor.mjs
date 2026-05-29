/**
 * Backfill idempotente de entity_type=SETOR para registros legados sem tipo.
 *
 * Uso:
 *   DASHBOARD_API_URL=http://127.0.0.1:8788/api node scripts/migrate-entity-type-default-setor.mjs
 *   DASHBOARD_API_URL=https://seu-worker.workers.dev/api GAS_SECRET=... node scripts/migrate-entity-type-default-setor.mjs
 */

const API_URL = process.env.DASHBOARD_API_URL || 'http://127.0.0.1:8788/api';
const GAS_SECRET = String(process.env.GAS_SECRET || '').trim();
const ENTITY_TYPE_SETOR = 'SETOR';
const ENTITIES = ['Setor', 'Modulo', 'Indicador', 'Meta', 'Lancamento'];
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeEntityType(raw) {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  return v === 'COMISSAO' || v === 'SETOR' || v === 'CLINICA' ? v : '';
}

async function post(body) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (GAS_SECRET) headers['X-GAS-Secret'] = GAS_SECRET;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data;
}

async function migrateEntity(entity) {
  const rows = await post({ kind: 'entity', entity, operation: 'list' });
  let inspected = 0;
  let updated = 0;
  let wouldUpdate = 0;
  for (const row of rows || []) {
    inspected += 1;
    if (normalizeEntityType(row?.entity_type)) continue;
    wouldUpdate += 1;
    if (DRY_RUN) continue;
    await post({
      kind: 'entity',
      entity,
      operation: 'update',
      id: row.id,
      record: { entity_type: ENTITY_TYPE_SETOR },
    });
    updated += 1;
  }
  return { entity, inspected, updated, wouldUpdate };
}

async function main() {
  console.log(`[entity_type migration] API: ${API_URL} ${DRY_RUN ? '(dry-run)' : ''}`);
  const results = [];
  for (const entity of ENTITIES) {
    const stats = await migrateEntity(entity);
    results.push(stats);
    console.log(
      `[${entity}] inspecionados=${stats.inspected} ${DRY_RUN ? `seriam_atualizados=${stats.wouldUpdate}` : `atualizados=${stats.updated}`}`
    );
  }
  const totalUpdated = results.reduce((acc, item) => acc + item.updated, 0);
  const totalWouldUpdate = results.reduce((acc, item) => acc + item.wouldUpdate, 0);
  const totalInspected = results.reduce((acc, item) => acc + item.inspected, 0);
  console.log(
    `[entity_type migration] concluído. inspecionados=${totalInspected} ${
      DRY_RUN ? `seriam_atualizados=${totalWouldUpdate}` : `atualizados=${totalUpdated}`
    }`
  );
}

main().catch((err) => {
  console.error(`[entity_type migration] falhou: ${err?.message || err}`);
  process.exit(1);
});
