/**
 * Apps Script Web App — backend para planilha de indicadores.
 *
 * Configurar em Projeto → Configurações do projeto → Propriedades do script:
 *   SPREADSHEET_ID = id da planilha
 *   API_SECRET     = mesmo valor configurado como GAS_SECRET no Cloudflare Worker
 *
 * Abas (minúsculas): conta, gestor, setor, modulo, indicador, meta, lancamento
 *
 * Aba setor — colunas opcionais:
 *   indicador_ids — ids da aba indicador permitidos para este setor, separados por | ou ; (trim).
 *     Vazio ou coluna ausente na linha 1 = todos os indicadores já aplicáveis pela divisão e demais regras do app.
 *     create/update só gravam células cujo cabeçalho existe na planilha (appendRow_/updateRowById_).
 *
 * Aba gestor (membros — login próprio):
 *   Colunas recomendadas: id, login, senha_hash, divisoes, unidades, ativo
 *   — divisoes: nomes de divisão (igual a setor.divisao), separados por | ou ; (opcional; pode combinar com unidades)
 *   — unidades: ids de setor (coluna id da aba setor), separados por | ou ;
 *   — login: nome de usuário (sem email obrigatório)
 *   — nivel_acesso (ou cabeçalho "Nivel de acesso"): completo | lancamento (default completo se vazio).
 *     lancamento = sem acesso à página Configuração no app.
 *   Criação/atualização via API envia senha (texto); o script grava SHA-256 na coluna cujo cabeçalho casa
 *   com senha_hash / Senha Hash / senha_hash (espaços e maiúsculas ignorados na deteção), ou na coluna
 *   Senha se não existir nenhuma variante de senha_hash.
 *   Colunas legadas nome, email, divisao ainda são lidas; login pode repetir nome.
 * Linha 1 de cada aba = cabeçalhos (campos das entidades + id).
 *
 * Aba indicador — colunas usuais (além de id): modulo_id, modulo_nome, nome, label, unidade,
 * tipo_direcao_meta, ordem, ativo, icone, cor, meta (se existir na planilha legada), e opcional:
 *   grupo_radar — string livre; no mesmo módulo, indicadores com o mesmo texto (trim, não vazio)
 *   e módulo com tipo_grafico=radar são desenhados num único RadarChart no dashboard genérico.
 *   grupo_serie — string livre; no mesmo módulo, mesmo texto (trim, não vazio) e mesmo tipo
 *   efetivo de gráfico (módulo ou override por indicador; ver tipo_grafico no indicador) →
 *   linha|barra|area: um único gráfico com uma série por indicador (dashboard genérico).
 *   Indicadores com mesmo grupo_serie mas tipos efetivos diferentes viram blocos separados.
 *   Com tipo efetivo pizza e mesmo grupo_serie, o dashboard genérico mostra um gráfico pizza
 *   por indicador (fatias = meses do ano), não um único pizza multi-série.
 *   radar_faixas — opcional (JSON numa única célula). Radar estilo qualidade (escala 0–100%, unidade %).
 *     Formato: [{ "label": "SEGURO", "min": 100, "max": 100, "emoji": "😊", "cor": "#3b82f6" }, ...].
 *     Define legenda lateral e cores dos pontos/tabela histórica. Vazio = padrão MISP no app.
 *     Indicador com lista preenchida tem prioridade; senão usa radar_faixas do módulo.
 *   pizza_fatias — opcional (JSON numa única célula). Só com tipo efetivo pizza no dashboard.
 *     Formato: array JSON [{ "label": "Texto da fatia", "indicador_id": "id da aba indicador" }, ...].
 *     Cada fatia usa o lançamento do mês atualmente selecionado no dashboard para esse indicador e setor.
 *     Indicador com lista preenchida tem prioridade; se vazio, o app pode usar pizza_fatias do módulo
 *     (mesma coluna na aba modulo). Vazio ou ausente = pizza clássico (fatias = meses do ano).
 *     No lançamento, o app pode exibir bloco «Pizza — fatias» (rótulo + valor/nota) gravando nos mesmos
 *     registros da aba lancamento por indicador_id.
 *   tipo_grafico (opcional no indicador) — mesmo vocabulário que modulo.tipo_grafico: linha | barra |
 *   area | radar | pizza (minúsculas). Valores como kpi ou numero não são reconhecidos no app e
 *   são tratados como linha. Vazio = herdar o tipo do módulo.
 *   divisoes — opcional; nomes de divisão iguais a setor.divisao, separados por | ou ; (trim).
 *     Vazio = indicador vale para todas as divisões; preenchido = só aparece quando o filtro de
 *     divisão ou o setor selecionado tiver divisão listada aqui.
 *
 * Aba modulo — colunas opcionais:
 *   radar_faixas — opcional; mesmo formato JSON que em indicador (faixas da legenda do radar qualidade).
 *     Usado no card MISP, módulos tipo radar com indicadores em % e painel bundle/genérico.
 *   pizza_fatias — opcional; mesmo formato JSON que em indicador. Usado como fallback quando o
 *     indicador está com tipo pizza mas sem pizza_fatias próprio (ex.: vários indicadores herdam o tipo do módulo).
 *   layout_modulo = padrao | card_grafico (default padrao).
 *     card_grafico: no bloco genérico, destaca valor do mês + status em card acima do gráfico
 *     (por indicador ou por grupo grupo_serie).
 *   layout_dashboard = padrao | bundle_kpi_tabela (default padrao).
 *     bundle_kpi_tabela: painel com KPIs, tabela 12 meses e gráfico de tendência (preset LP se
 *     Expostos+Novos Casos ou nome legado; senão layout genérico por indicador). Módulos com
 *     cards especiais (MISP, IRAS, Produção, etc.) ignoram este campo no roteamento do app.
 *   tipo_ui = opcional: iras | misp | producao | eventos_adversos | nr32 | generico.
 *     Define qual card especial o dashboard usa; vazio ou inválido = inferir pelo nome do módulo
 *     (ex.: nome "IRAS" → iras). Coluna legada slug pode ser lida no lugar se tipo_ui estiver vazio.
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

/** Normaliza nome de coluna para casar cabeçalhos da planilha (senha_hash, Senha Hash, etc.). */
function normalizeHeaderKeyForMatch_(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

/** Cabeçalho exato na aba gestor onde gravar o SHA-256 (prioriza senha_hash / senhahash). */
function findGestorPasswordHashColumn_(map) {
  var keys = Object.keys(map);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (normalizeHeaderKeyForMatch_(keys[i]) === 'senhahash') return keys[i];
  }
  for (i = 0; i < keys.length; i++) {
    if (normalizeHeaderKeyForMatch_(keys[i]) === 'senha') return keys[i];
  }
  return null;
}

/** Cabeçalho na aba gestor para nivel_acesso (aceita nivel_acesso ou "Nivel de acesso"). */
function findGestorNivelColumnKey_(map) {
  var keys = Object.keys(map);
  var candidates = ['nivelacesso', 'niveldeacesso'];
  var c;
  var i;
  for (c = 0; c < candidates.length; c++) {
    var want = candidates[c];
    for (i = 0; i < keys.length; i++) {
      if (normalizeHeaderKeyForMatch_(keys[i]) === want) return keys[i];
    }
  }
  return null;
}

/** Valor bruto da célula de nível de acesso. */
function gestorNivelRawFromRow_(row) {
  if (!row) return '';
  var keys = Object.keys(row);
  var candidates = ['nivelacesso', 'niveldeacesso'];
  var ci;
  var i;
  for (ci = 0; ci < candidates.length; ci++) {
    var want = candidates[ci];
    for (i = 0; i < keys.length; i++) {
      if (normalizeHeaderKeyForMatch_(keys[i]) !== want) continue;
      var v = row[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

/** Sessão: sempre "lancamento" ou "completo" (default). */
function gestorNivelNormalizedForAuth_(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (s === 'lancamento') return 'lancamento';
  return 'completo';
}

/** Lê o hash armazenado na linha do gestor (qualquer coluna compatível com o cabeçalho). */
function gestorStoredHash_(row) {
  if (!row) return '';
  var keys = Object.keys(row);
  var pass;
  var want = ['senhahash', 'senha'];
  for (pass = 0; pass < want.length; pass++) {
    var w = want[pass];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (normalizeHeaderKeyForMatch_(keys[i]) !== w) continue;
      var v = row[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

function gestorRecordForWrite_(record, sh) {
  var map = headerIndexMap_(sh);
  var hashCol = findGestorPasswordHashColumn_(map);
  var nivelCol = findGestorNivelColumnKey_(map);
  var out = {};
  var keys = Object.keys(record || {});
  var idx;
  for (idx = 0; idx < keys.length; idx++) {
    var key = keys[idx];
    if (key === 'senha') continue;
    if (hashCol && String(key) === String(hashCol)) continue;
    if (!hashCol && normalizeHeaderKeyForMatch_(key) === 'senhahash') continue;
    if (!hashCol && normalizeHeaderKeyForMatch_(key) === 'senha') continue;
    if (String(key) === 'nivel_acesso') {
      if (nivelCol) out[nivelCol] = String(record[key] != null ? record[key] : '').trim();
      continue;
    }
    out[key] = record[key];
  }
  if (record && record.senha != null && String(record.senha).length > 0) {
    if (!hashCol) {
      throw new Error(
        'Aba gestor: na linha 1 inclua uma coluna senha_hash (ou Senha) para gravar a senha.'
      );
    }
    out[hashCol] = sha256Hex_(String(record.senha));
  }
  return out;
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
    if (entity === 'Gestor') {
      record = gestorRecordForWrite_(record, sh);
    }
    appendRow_(sh, record);
    return record;
  }
  if (op === 'update') {
    var patch = body.record || {};
    if (entity === 'Gestor') {
      patch = gestorRecordForWrite_(patch, sh);
    }
    updateRowById_(sh, body.id, patch);
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

function findGestorByLogin_(rows, login) {
  var L = String(login || '').trim().toLowerCase();
  if (!L) return null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var rowLogin = String(r.login != null ? r.login : r.nome != null ? r.nome : '').trim().toLowerCase();
    if (rowLogin === L) return r;
  }
  return null;
}

function handleAutenticar_(payload) {
  var action = payload.action;
  if (action === 'login') {
    var login = payload.login;
    var password = payload.password;
    var tipo = payload.tipo;
    var hash = sha256Hex_(String(password));

    if (String(tipo) === 'gestor') {
      var gRows = rowsToObjects_(getSheet_('Gestor'));
      var grow = findGestorByLogin_(gRows, login);
      var ginactive = grow && (grow.ativo === false || grow.ativo === 'FALSE');
      if (grow && !ginactive) {
        var storedHash = gestorStoredHash_(grow);
        if (storedHash && String(storedHash) === String(hash)) {
          var glogin = String(grow.login != null ? grow.login : grow.nome != null ? grow.nome : login).trim();
          var gunidades = grow.unidades != null ? String(grow.unidades) : '';
          var gdivisoes = grow.divisoes != null ? String(grow.divisoes) : '';
          var gnivel = gestorNivelNormalizedForAuth_(gestorNivelRawFromRow_(grow));
          return {
            success: true,
            conta: {
              id: grow.id,
              login: glogin,
              tipo: 'gestor',
              ativo: true,
              unidades: gunidades,
              divisoes: gdivisoes,
              nivel_acesso: gnivel,
            },
          };
        }
        return { success: false, message: 'Credenciais inválidas ou conta inativa.' };
      }
    }

    var rows = rowsToObjects_(getSheet_('Conta'));
    var row = findContaByLoginTipo_(rows, login, tipo);
    var inactive = row && (row.ativo === false || row.ativo === 'FALSE');
    if (!row || inactive) {
      return { success: false, message: 'Credenciais inválidas ou conta inativa.' };
    }
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
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Gestão à Vista — Indicadores HU UEL');
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
