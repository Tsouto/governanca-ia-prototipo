/**
 * Backend do MVP de governança de IA (NuAudit) e coleta de avaliações do protótipo.
 * Publicado como App da Web (executar como: eu; acesso: qualquer pessoa).
 * Quem tiver a URL lê e grava: use somente dados fictícios e arquive a implantação ao fim do uso.
 *
 * GET  ?acao=listar                 -> {ok, solucoes:[...]}
 * POST {acao:'salvar', sol, base}   -> grava a solução se 'base' (versão lida) ainda for a atual
 * POST {acao:'evento', ...}         -> (interno) eventos vão junto no 'salvar'
 * POST sem 'acao'                   -> avaliação do protótipo v1 (planilha de respostas)
 */
const AVALIACOES_ID = '12m0BLHHwynEuTwnELQTZ-lnU4WnrbUhgPRkT2soQ6zQ';
const BASE_ID = '1Uuidu7AXvlrlG54TBXcz7hV0QwWOgrA0eohFJ7Uvp1c';

function limpar(v) {
  const s = String(v == null ? '' : v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function abas() {
  const ss = SpreadsheetApp.openById(BASE_ID);
  let sol = ss.getSheetByName('solucoes');
  if (!sol) {
    sol = ss.getSheets()[0];
    sol.setName('solucoes');
    sol.getRange(1, 1, 1, 6).setValues([['id', 'nome', 'estagio', 'versao_registro', 'atualizado_em', 'json']]);
  }
  let ev = ss.getSheetByName('eventos');
  if (!ev) {
    ev = ss.insertSheet('eventos');
    ev.appendRow(['data_hora', 'solucao_id', 'solucao', 'perfil', 'pessoa', 'acao', 'detalhe']);
  }
  return { sol: sol, ev: ev };
}

function doGet(e) {
  try {
    const a = abas();
    const vals = a.sol.getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
    return json({ ok: true, solucoes: vals.map(function (r) { return JSON.parse(r[5]); }) });
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  }
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, erro: 'JSON inválido' }); }
  if (!d.acao) return avaliacao(d);
  if (d.acao !== 'salvar' || !d.sol || !d.sol.id) return json({ ok: false, erro: 'Ação desconhecida' });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const a = abas();
    const ids = a.sol.getRange(1, 1, Math.max(a.sol.getLastRow(), 1), 1).getValues().map(function (r) { return r[0]; });
    const linha = ids.indexOf(d.sol.id) + 1; // 0 se nova
    if (linha > 1) {
      const atual = Number(a.sol.getRange(linha, 4).getValue()) || 0;
      if (atual !== Number(d.base || 0)) {
        return json({ ok: false, conflito: true, sol: JSON.parse(a.sol.getRange(linha, 6).getValue()) });
      }
    }
    const sol = d.sol;
    sol.rev = Number(d.base || 0) + 1;
    const txt = JSON.stringify(sol);
    if (txt.length > 49000) return json({ ok: false, erro: 'Registro grande demais para uma célula' });
    const row = [sol.id, limpar(sol.nome), limpar(sol.estagio), sol.rev, new Date(), txt];
    if (linha > 1) a.sol.getRange(linha, 1, 1, 6).setValues([row]);
    else a.sol.appendRow(row);
    (d.eventos || []).forEach(function (x) {
      a.ev.appendRow([new Date(), sol.id, limpar(sol.nome), limpar(x.perfil), limpar(x.nome), limpar(x.acao), limpar(x.detalhe)]);
    });
    return json({ ok: true, sol: sol });
  } finally {
    lock.releaseLock();
  }
}

function avaliacao(d) {
  try {
    const linha = [new Date(), limpar(d.nome), limpar(d.papel)];
    const t = Array.isArray(d.tarefas) ? d.tarefas : [];
    for (let i = 0; i < 5; i++) {
      const x = t[i] || {};
      linha.push(limpar(x.ok), limpar(x.min), limpar(x.cl));
    }
    linha.push(limpar(d.bur), limpar(d.cut), limpar(d.mis), limpar(d.tier), limpar(d.nota));
    SpreadsheetApp.openById(AVALIACOES_ID).getSheets()[0].appendRow(linha);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('erro');
  }
}
