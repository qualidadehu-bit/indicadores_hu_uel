/**
 * Apps Script Web App — backend para planilha de indicadores.
 *
 * Configurar em Projeto → Configurações do projeto → Propriedades do script:
 *   SPREADSHEET_ID = id da planilha
 *   API_SECRET     = mesmo valor configurado como GAS_SECRET no Cloudflare Worker
 *
 * Abas (minúsculas): conta, gestor, setor, modulo, indicador, meta, lancamento
 * Linha 1 de cada aba = cabeçalhos (campos das entidades + id).
 *
 * Senhas na aba conta: armazene SHA-256 hex da senha em senha_hash (mesmo algoritmo que login usa).
 */

var SHEET_NAMES = {
  Conta: 'conta',
  Gestor: 'gestor',
  Setor: 'setor',
  Modulo: 'modulo',
  Indicador: 'indicador',
  Meta: 'meta',
  Lancamento: 'lancamento',
};

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not configured');
  return SpreadsheetApp.openById(id);
}

function getSheet_(entityName) {
  var sheetName = SHEET_NAMES[entityName];
  if (!sheetName) throw new Error('Unknown entity ' + entityName);
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  return sh;
}

function headerIndexMap_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h) map[h] = i;
  }
  return map;
}

function normalizeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  return v;
}

function rowsToObjects_(sh) {
  var map = headerIndexMap_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(2, 1, lastRow, lastCol).getValues();
  var out = [];
  for (var r = 0; r < data.length; r++) {
    var obj = {};
    var nonEmpty = false;
    for (var key in map) {
      var val = data[r][map[key]];
      obj[key] = normalizeCell_(val);
      if (val !== '' && val !== null && val !== undefined) nonEmpty = true;
    }
    if (nonEmpty) out.push(obj);
  }
  return out;
}

function matchesFilter_(row, filter) {
  if (!filter) return true;
  for (var key in filter) {
    if (!Object.prototype.hasOwnProperty.call(filter, key)) continue;
    var fv = filter[key];
    if (fv === undefined) continue;
    var rv = row[key];
    if (typeof fv === 'number' || typeof rv === 'number') {
      if (Number(rv) !== Number(fv)) return false;
    } else {
      if (String(rv) !== String(fv)) return false;
    }
  }
  return true;
}

function coerceWrite_(v) {
  if (v === true || v === false) return v;
  return v;
}

function appendRow_(sh, obj) {
  var map = headerIndexMap_(sh);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').trim();
    row.push(h && Object.prototype.hasOwnProperty.call(obj, h) ? coerceWrite_(obj[h]) : '');
  }
  sh.appendRow(row);
}

function updateRowById_(sh, id, patch) {
  var map = headerIndexMap_(sh);
  if (map['id'] === undefined) throw new Error('Sheet missing id column');
  var lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error('Not found');
  var idCol = map['id'] + 1;
  var ids = sh.getRange(2, idCol, lastRow, idCol).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var rowIdx = i + 2;
      for (var key in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        if (key === 'id') continue;
        if (map[key] === undefined) continue;
        sh.getRange(rowIdx, map[key] + 1).setValue(coerceWrite_(patch[key]));
      }
      return;
    }
  }
  throw new Error('Record not found id=' + id);
}

function deleteRowById_(sh, id) {
  var map = headerIndexMap_(sh);
  if (map['id'] === undefined) throw new Error('Sheet missing id column');
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var idCol = map['id'] + 1;
  var ids = sh.getRange(2, idCol, lastRow, idCol).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      return;
    }
  }
  throw new Error('Record not found id=' + id);
}

function handleEntity_(body) {
  var entity = body.entity;
  var op = body.operation;
  var sh = getSheet_(entity);
  if (op === 'list') {
    return rowsToObjects_(sh);
  }
  if (op === 'filter') {
    var rows = rowsToObjects_(sh);
    var filter = body.filter || {};
    var filtered = [];
    for (var i = 0; i < rows.length; i++) {
      if (matchesFilter_(rows[i], filter)) filtered.push(rows[i]);
    }
    return filtered;
  }
  if (op === 'create') {
    var record = body.record || {};
    if (!record.id) record.id = Utilities.getUuid();
    appendRow_(sh, record);
    return record;
  }
  if (op === 'update') {
    updateRowById_(sh, body.id, body.record || {});
    return { id: body.id };
  }
  if (op === 'delete') {
    deleteRowById_(sh, body.id);
    return { deleted: true, id: body.id };
  }
  throw new Error('Unknown operation ' + op);
}

function sha256Hex_(text) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var byte = digest[i] & 0xff;
    hex += ('0' + byte.toString(16)).slice(-2);
  }
  return hex;
}

function findContaByLoginTipo_(rows, login, tipo) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.login) === String(login) && String(r.tipo) === String(tipo)) return r;
  }
  return null;
}

function handleAutenticar_(payload) {
  var action = payload.action;
  if (action === 'login') {
    var login = payload.login;
    var password = payload.password;
    var tipo = payload.tipo;
    var rows = rowsToObjects_(getSheet_('Conta'));
    var row = findContaByLoginTipo_(rows, login, tipo);
    var inactive = row && (row.ativo === false || row.ativo === 'FALSE');
    if (!row || inactive) {
      return { success: false, message: 'Credenciais inválidas ou conta inativa.' };
    }
    var hash = sha256Hex_(String(password));
    if (String(row.senha_hash) !== String(hash)) {
      return { success: false, message: 'Credenciais inválidas.' };
    }
    var conta = { id: row.id, login: row.login, tipo: row.tipo, ativo: row.ativo };
    return { success: true, conta: conta };
  }
  if (action === 'reset') {
    var newPassword = payload.newPassword;
    if (!newPassword || String(newPassword).length < 4) {
      return { success: false, message: 'Senha muito curta.' };
    }
    var rows = rowsToObjects_(getSheet_('Conta'));
    var esc = null;
    for (var j = 0; j < rows.length; j++) {
      if (String(rows[j].tipo) === 'escritorio') {
        esc = rows[j];
        break;
      }
    }
    if (!esc) return { success: false, message: 'Conta escritório não encontrada.' };
    updateRowById_(getSheet_('Conta'), esc.id, { senha_hash: sha256Hex_(String(newPassword)) });
    return { success: true };
  }
  return { success: false, message: 'Ação inválida.' };
}

function handleFunction_(name, payload) {
  if (name === 'autenticar') return handleAutenticar_(payload || {});
  throw new Error('Unknown function ' + name);
}

function parseBody_(e) {
  if (!e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function verifySecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!expected || body._gasSecret !== expected) {
    throw new Error('Unauthorized');
  }
}

function processRequest_(body) {
  verifySecret_(body);
  delete body._gasSecret;
  if (body.kind === 'entity') {
    return { ok: true, data: handleEntity_(body) };
  }
  if (body.kind === 'function') {
    return { ok: true, data: handleFunction_(body.name, body.payload) };
  }
  throw new Error('Unknown kind');
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, ping: 'gas' })).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var out = processRequest_(body);
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var msg = err.message || String(err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg })).setMimeType(
      ContentService.MimeType.JSON
    );
  }
}
