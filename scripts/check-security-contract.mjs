import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKER_PATH = path.join(ROOT, 'worker/src/index.ts');
const API_CLIENT_PATH = path.join(ROOT, 'src/api/apiClient.js');
const LANDING_PATH = path.join(ROOT, 'src/pages/Landing.jsx');
const RESET_MODAL_PATH = path.join(ROOT, 'src/components/ResetPasswordModal.jsx');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(content, token, label, errors) {
  if (!content.includes(token)) errors.push(`${label}: faltando "${token}"`);
}

function assertNotIncludes(content, token, label, errors) {
  if (content.includes(token)) errors.push(`${label}: token proibido encontrado "${token}"`);
}

function main() {
  const errors = [];
  const worker = read(WORKER_PATH);
  const apiClient = read(API_CLIENT_PATH);
  const landing = read(LANDING_PATH);
  const resetModal = read(RESET_MODAL_PATH);

  assertIncludes(worker, 'Authorization', 'worker', errors);
  assertIncludes(worker, 'CORS_ALLOWED_ORIGINS', 'worker', errors);
  assertIncludes(worker, "action === 'request_reset_token'", 'worker', errors);
  assertIncludes(worker, 'RESET_PIN', 'worker', errors);
  assertIncludes(worker, 'readSessionFromAuthHeader', 'worker', errors);

  assertIncludes(apiClient, 'Authorization', 'apiClient', errors);
  assertNotIncludes(apiClient, '_userSession', 'apiClient', errors);

  assertIncludes(landing, "action: 'request_reset_token'", 'Landing', errors);
  assertIncludes(landing, 'reset_token', 'Landing', errors);

  assertNotIncludes(resetModal, 'PIN_RESET', 'ResetPasswordModal', errors);

  if (errors.length) {
    console.error('Falha no contrato de segurança:');
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }
  console.log('Contrato de segurança: OK');
}

main();
