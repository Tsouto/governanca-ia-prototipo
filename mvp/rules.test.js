// Teste das regras: node mvp/rules.test.js
const assert = require('assert');
const R = require('./rules.js');

const base = { ia: 's', vinc: 's', p1: 'n', p2: 'n', p3: 'n', p4: 'n', p7: 'n', p5: 'n', p6: 'n', iso: 'n' };
const ans = o => Object.assign({}, base, o);

// M1
assert.equal(R.enquadrar(ans()).trilha, 'Padrão');
assert.equal(R.enquadrar(ans({ iso: 's' })).trilha, 'Expressa');
assert.equal(R.enquadrar(ans({ p2: 's' })).trilha, 'Reforçada');
assert.equal(R.enquadrar(ans({ ia: 'n' })).trilha, 'Fora do escopo');
const pend = R.enquadrar(ans({ p3: '?' }));
assert.equal(pend.trilha, 'Pendente');
assert.deepEqual(pend.bloqueios, ['p3']);
assert.equal(R.enquadrar({ ia: 's' }).trilha, '');

// M2: impacto 4 nunca abaixo de Alto; 4x3 crítico
assert.equal(R.celula(4, 1), 3);
assert.equal(R.celula(4, 3), 4);
assert.equal(R.celula(2, 3), 2);

// Solução tier 3 com 15 controles
const sol = { estagio: 'Beta', m1: { ans: ans({ p5: 's' }), status: 'validado' }, m2: { cen: [{ i: 2, p: 3 }], status: 'validado' }, m3: {}, m4: {} };
assert.equal(R.risco(sol).tier, 3);
const ctrls = R.controles(sol);
assert.equal(ctrls.length, 15);
assert.ok(R.exigeRevisao(sol));

// M3: Implementado sem evidência é recusado
assert.ok(R.erroDeclaracao({ estado: 'I' }));
assert.ok(R.erroDeclaracao({ estado: 'NA' }));
assert.equal(R.erroDeclaracao({ estado: 'I', evidencia: 'x', descricao: 'y' }), '');

// Declara tudo implementado; sem revisão → derivados indisponíveis
ctrls.forEach(c => { sol.m3[c.id] = { estado: 'I', evidencia: 'link', descricao: 'ok', rev: 1 }; });
assert.equal(R.criteriosDerivados(sol).c4, null);
assert.equal(R.situacaoControles(sol).aguardando, 15);

// Revisa tudo M → C4 = 3, C2 = 3
ctrls.forEach(c => { sol.m4[c.id] = { res: 'M', amostra: 'a', resultado: 'r', declRev: 1 }; });
assert.deepEqual([R.criteriosDerivados(sol).c2, R.criteriosDerivados(sol).c4], [3, 3]);
assert.equal(R.situacaoControles(sol).confirmados, 15);

// Bug apontado no feedback: 1 ou 2 itens P, sem outros pendentes → C4 deve ser 1 (não 2)
sol.m4.c7 = { res: 'P', amostra: 'a', resultado: 'r', just: 'j', declRev: 1 };
assert.equal(R.criteriosDerivados(sol).c4, 1);
assert.equal(R.situacaoControles(sol).divergentes, 1);
const d = R.decidir(sol, { c: [3, 0, 3, 0, 3, 3, 3] });
assert.equal(d.max, 'Beta', 'auditabilidade parcial limita a Beta');

// Qualquer N → C4 = 0 → E4, máximo Beta, uso restrito
sol.m4.c8 = { res: 'N', amostra: 'a', resultado: 'r', just: 'j', declRev: 1 };
assert.equal(R.criteriosDerivados(sol).c4, 0);
assert.equal(R.decidir(sol, { c: [3, 0, 3, 0, 3, 3, 3] }).cond, 'Uso restrito');

// Declaração alterada após revisão volta para "aguardando revisão"
sol.m3.c1 = { estado: 'I', evidencia: 'novo', descricao: 'ok', rev: 2 };
assert.equal(R.situacaoControles(sol).aguardando, 1);
assert.equal(R.criteriosDerivados(sol).c4, null);

// Estágio só muda pela decisão; rebaixa quando excede o máximo
assert.equal(R.estagioAposDecisao('Live', 'Beta'), 'Beta');
assert.equal(R.estagioAposDecisao('Beta', 'Live'), 'Beta');
assert.equal(R.estagioAposDecisao('Live', 'Nenhum'), 'Suspensa');

// Gate 1 bloqueado com M1 pendente
const s2 = { estagio: 'Alpha', m1: { ans: ans({ p3: '?' }), status: 'validado' }, m2: { status: 'validado' } };
assert.equal(R.podeGate1(s2).ok, false);

// Tier 4 autodeclarado: C4 = 2 quando tudo implementado
const s4 = { m1: { ans: ans() }, m2: { cen: [{ i: 1, p: 2 }] }, m3: {}, m4: {} };
assert.equal(R.risco(s4).tier, 4);
R.controles(s4).forEach(c => { s4.m3[c.id] = { estado: 'I', evidencia: 'l', descricao: 'd', rev: 1 }; });
assert.equal(R.criteriosDerivados(s4).c4, 2);

// M6
assert.equal(R.materialidade({ v: { Dados: 3 } }).lv, 'Média');
assert.equal(R.materialidade({ env: true }).lv, 'Baixa');
assert.equal(R.materialidade({ g: { 'Novo modelo ou nova lógica decisória': true } }).lv, 'Alta');

// Validade
const s5 = { m5: { decisao: { validade: '2020-01-01T00:00:00Z' } } };
assert.ok(R.decisaoVencida(s5));

console.log('ok: todas as regras conferem');
