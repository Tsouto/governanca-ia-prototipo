/* Dados de demonstração — todos fictícios. Datas relativas ao dia de hoje. */
window.Seed = function () {
  'use strict';
  const R = window.Rules;
  const dia = n => new Date(Date.now() + n * 864e5).toISOString();
  const base = { ia: 's', vinc: 's', p1: 'n', p2: 'n', p3: 'n', p4: 'n', p7: 'n', p5: 'n', p6: 'n', iso: 'n' };
  const ans = o => Object.assign({}, base, o);
  const DEL = 'Delivery team', AUD = 'Audit Solutions', APR = 'Aprovação de risco';
  const ev = (d, perfil, nome, acao, detalhe) => ({ em: dia(d), perfil, nome, acao, detalhe: detalhe || '' });
  const nova = o => Object.assign({ id: 's' + Math.random().toString(36).slice(2, 10), criado_em: dia(-90), estagio: 'Alpha', versao: 'v0.1', m1: { ans: {}, status: 'rascunho' }, m2: { cen: [], g: {}, status: 'rascunho' }, m3: {}, m4: {}, m5: {}, m6: [], hist: [], rev: 0, demo: true }, o);
  const declarar = (s, por, d, exceto) => R.controles(s).forEach(c => {
    if (exceto && exceto[c.id]) { s.m3[c.id] = Object.assign({ por, em: dia(d), rev: 1 }, exceto[c.id]); return; }
    s.m3[c.id] = { estado: 'I', evidencia: 'https://exemplo.invalid/evidencias/' + c.id, descricao: 'Evidência de exemplo para "' + c.t + '".', por, em: dia(d), rev: 1 };
  });
  const revisar = (s, por, d, res) => Object.keys(s.m3).forEach(id => {
    const r = (res && res[id]) || 'M';
    if (r === '-') return;
    s.m4[id] = { res: r, amostra: 'Reabertas 5 execuções pelo ledger (exemplo).', resultado: r === 'M' ? 'Evidência confere com a declaração.' : 'Evidência incompleta na amostra.', just: r === 'M' ? '' : 'Faltam registros em 2 das 5 execuções.', revisor: por, em: dia(d), declRev: s.m3[id].rev };
  });
  const aceitar = (s, d, prop, aprov, papelAce) => {
    const calc = R.decidir(s, prop);
    s.m5.decisao = Object.assign({}, calc, { lim: prop.lim || '', condicoes: prop.cond || '', just: prop.just || '', propostaPor: 'Elisa P.', aceitePor: aprov, aceitePapel: papelAce, em: dia(d), validade: calc.validadeMeses ? R.addMeses(dia(d), calc.validadeMeses) : null });
    return calc;
  };

  // 1. Assistente de normas — tier 4, Live, decisão vigente
  const a = nova({ nome: 'Assistente de normas', dono: 'Ana S.', plataforma: 'NotebookLM', finalidade: 'Responde dúvidas sobre normas internas e públicas, citando a fonte.', versao: 'v1.2', criado_em: dia(-200) });
  a.m1 = { ans: ans(), status: 'validado', por: 'Ana S.', em: dia(-200), validador: 'Elisa P.', validado_em: dia(-198) };
  a.m2 = { cen: [{ d: 'Resposta desatualizada sobre uma norma', i: 1, p: 2 }], g: {}, status: 'validado', por: 'Ana S.', em: dia(-199), validador: 'Elisa P.', validado_em: dia(-198) };
  declarar(a, 'Ana S.', -190);
  a.estagio = 'Live';
  aceitar(a, -180, { c: [2, 0, 2, 0, 2, 3, 2], lim: 'Uso interno da NuAudit; não usar como fonte única em relatório.' }, 'Ana S.', R.AUTORIDADE[1]);
  a.gate1 = { por: 'Ana S.', em: dia(-195) }; a.gate2 = { por: 'Elisa P.', em: dia(-179) };
  a.hist = [ev(-200, DEL, 'Ana S.', 'Cadastro e enquadramento', 'Trilha Padrão'), ev(-198, AUD, 'Elisa P.', 'Enquadramento e risco validados', 'Tier 4 · Baixo'), ev(-195, DEL, 'Ana S.', 'Gate 1: Alpha → Beta'), ev(-190, DEL, 'Ana S.', 'Controles declarados', '10 itens, evidências autodeclaradas (tier 4)'), ev(-180, APR, 'Ana S.', 'Decisão de uso aceita', 'Liberado · máximo Live · validade 12 meses'), ev(-179, AUD, 'Elisa P.', 'Gate 2: Beta → Live')];

  // 2. Resumo de evidências — tier 3, Beta, revisão M4 em andamento (com divergência)
  const b = nova({ nome: 'Resumo de evidências', dono: 'Bruna L.', plataforma: 'Dobby', finalidade: 'Resume papéis de trabalho para o auditor revisar antes de anexar ao trabalho.', versao: 'v0.9', criado_em: dia(-80) });
  b.m1 = { ans: ans({ p5: 's' }), status: 'validado', por: 'Bruna L.', em: dia(-80), validador: 'Elisa P.', validado_em: dia(-78) };
  b.m2 = { cen: [{ d: 'Resumo omite evidência relevante', i: 2, p: 3 }, { d: 'Resumo cita trecho que não existe no papel de trabalho', i: 2, p: 2 }], g: {}, status: 'validado', por: 'Bruna L.', em: dia(-79), validador: 'Elisa P.', validado_em: dia(-76) };
  b.estagio = 'Beta'; b.gate1 = { por: 'Bruna L.', em: dia(-60) };
  declarar(b, 'Bruna L.', -20, { c9: { estado: 'P', evidencia: 'https://exemplo.invalid/ledger', descricao: 'Ledger ativo só para parte das execuções.' }, g3: { estado: 'X' } });
  revisar(b, 'Elisa P.', -5, { c7: 'P', c9: '-', c10: '-', c11: '-', g1: '-', g2: '-', g3: '-', g4: '-' });
  b.hist = [ev(-80, DEL, 'Bruna L.', 'Cadastro e enquadramento', 'Trilha Padrão (P5 = Sim)'), ev(-78, AUD, 'Elisa P.', 'Enquadramento validado'), ev(-76, AUD, 'Elisa P.', 'Risco validado', 'Médio · tier 3'), ev(-60, DEL, 'Bruna L.', 'Gate 1: Alpha → Beta', 'Demo realizada; testers nomeados'), ev(-20, DEL, 'Bruna L.', 'Controles declarados', '15 itens'), ev(-5, AUD, 'Elisa P.', 'Revisão parcial', '7 itens revisados; 1 divergência')];
  b.m3.g3 = { estado: 'X', evidencia: '', descricao: '', por: 'Bruna L.', em: dia(-20), rev: 1 };

  // 3. Copiloto de relatório — Reforçada, enquadramento aguardando validação
  const c = nova({ nome: 'Copiloto de relatório', dono: 'Carla M.', plataforma: 'Dobby', finalidade: 'Sugere redação de achados a partir dos papéis de trabalho.', versao: 'v0.3', criado_em: dia(-6) });
  c.m1 = { ans: ans({ p1: 's', p2: 's' }), status: 'enviado', por: 'Carla M.', em: dia(-6) };
  c.hist = [ev(-6, DEL, 'Carla M.', 'Cadastro e enquadramento', 'Trilha Reforçada (P1 e P2 = Sim). Encaminhar ao DPO e à Segurança da Informação.'), ev(-6, DEL, 'Carla M.', 'Enquadramento enviado para validação')];

  // 4. Priorizador de testes — tier 2, Live, aceite vencido
  const d = nova({ nome: 'Priorizador de testes', dono: 'Diego R.', plataforma: 'Databricks', finalidade: 'Sugere a ordem dos testes de auditoria por risco.', versao: 'v2.0', criado_em: dia(-260) });
  d.m1 = { ans: ans({ p1: 's', p5: 's' }), status: 'validado', por: 'Diego R.', em: dia(-260), validador: 'Elisa P.', validado_em: dia(-258) };
  d.m2 = { cen: [{ d: 'Priorização ignora sistematicamente uma área de risco', i: 3, p: 3 }], g: {}, status: 'validado', por: 'Diego R.', em: dia(-259), validador: 'Elisa P.', validado_em: dia(-257) };
  declarar(d, 'Diego R.', -230); revisar(d, 'Elisa P.', -215);
  d.estagio = 'Live'; d.gate1 = { por: 'Diego R.', em: dia(-240) }; d.gate2 = { por: 'Elisa P.', em: dia(-200) };
  aceitar(d, -201, { c: [3, 0, 3, 0, 3, 3, 3], lim: 'Sugestão de ordem; o auditor decide o plano.' }, 'Gustavo T.', R.AUTORIDADE[2]);
  d.hist = [ev(-260, DEL, 'Diego R.', 'Cadastro e enquadramento', 'Trilha Reforçada (P1 = Sim)'), ev(-257, AUD, 'Elisa P.', 'Risco validado', 'Alto · tier 2'), ev(-215, AUD, 'Elisa P.', 'Revisão concluída', '22 itens confirmados'), ev(-201, APR, 'Gustavo T.', 'Decisão de uso aceita', 'Liberado com condições · validade 6 meses'), ev(-200, AUD, 'Elisa P.', 'Gate 2: Beta → Live')];

  // 5. Classificador de achados — enquadramento pendente
  const e = nova({ nome: 'Classificador de achados', dono: 'Fernanda T.', plataforma: 'Cursor', finalidade: 'Classifica achados por tema e gravidade sugerida.', criado_em: dia(-2) });
  e.m1 = { ans: { ia: 's', vinc: 's', p1: 'n', p2: '?', p3: 'n', p4: 'n', p7: 'n', p5: 'n', p6: 's', iso: 'n' }, status: 'rascunho', por: 'Fernanda T.', em: dia(-2), lacuna: 'Confirmar com o dono dos dados se os achados contêm dado pessoal de auditado. Responsável: Fernanda T.' };
  e.hist = [ev(-2, DEL, 'Fernanda T.', 'Cadastro e enquadramento', 'Pendente: P2 sem resposta')];

  // 6. Conferidor de planos de ação — tier 2, Beta, proposta aguardando aceite do fórum
  const f = nova({ nome: 'Conferidor de planos de ação', dono: 'Rafael O.', plataforma: 'Dobby', finalidade: 'Confere se o plano de ação enviado pelo auditado responde ao achado e sugere ajustes ao auditor.', versao: 'v0.7', criado_em: dia(-120) });
  f.m1 = { ans: ans({ p1: 's', p5: 's', p7: 's' }), status: 'validado', por: 'Rafael O.', em: dia(-120), validador: 'Elisa P.', validado_em: dia(-118) };
  f.m2 = { cen: [{ d: 'Aprova plano de ação que não trata a causa do achado', i: 3, p: 3 }, { d: 'Sugestão incoerente enviada ao auditado', i: 3, p: 2 }], g: {}, status: 'validado', por: 'Rafael O.', em: dia(-119), validador: 'Elisa P.', validado_em: dia(-116) };
  f.estagio = 'Beta'; f.gate1 = { por: 'Rafael O.', em: dia(-90) };
  declarar(f, 'Rafael O.', -30); revisar(f, 'Elisa P.', -10);
  const prop = { c: [3, 0, 0, 0, 3, 3, 2], e1: false, e5: false, lim: 'Somente auditores do pack de Crédito; não enviar sugestões direto ao auditado.', cond: 'Comparar 10 planos já aprovados antes de pedir Live (Rafael O., 30 dias).', just: 'Validação de desempenho ainda não feita: falta a comparação com planos aprovados por auditores. Manter em Beta restrito.' };
  f.m5.proposta = Object.assign({}, prop, { por: 'Elisa P.', em: dia(-1), calc: R.decidir(f, prop) });
  f.hist = [ev(-120, DEL, 'Rafael O.', 'Cadastro e enquadramento', 'Trilha Reforçada (P1, P7 = Sim)'), ev(-116, AUD, 'Elisa P.', 'Risco validado', 'Alto · tier 2'), ev(-90, DEL, 'Rafael O.', 'Gate 1: Alpha → Beta'), ev(-30, DEL, 'Rafael O.', 'Controles declarados', '22 itens'), ev(-10, AUD, 'Elisa P.', 'Revisão concluída', '22 itens confirmados'), ev(-1, AUD, 'Elisa P.', 'Proposta de decisão enviada', f.m5.proposta.calc.cond + ' · exige ' + f.m5.proposta.calc.aceite)];

  return [b, f, c, e, d, a];
};
