/* Regras do framework de governança de IA (NuAudit) — funções puras, sem DOM.
 * Usado pelo app (window.Rules) e pelo teste em Node (module.exports). */
(function (root) {
  'use strict';

  const NV = ['', 'Baixo', 'Médio', 'Alto', 'Crítico'];
  const ESTAGIOS = ['Alpha', 'Beta', 'Live'];

  /* ---------- M1 Enquadramento ---------- */
  const Q = [
    { k: 'ia', t: 'A solução usa inteligência artificial?', h: 'Modelo de linguagem, classificador, agente ou qualquer componente que gera ou decide a partir de dados. Uma planilha com fórmulas fixas não conta.', ex: 'Ex.: agente no Dobby que resume papéis de trabalho = Sim.' },
    { k: 'vinc', t: 'É usada ou desenvolvida no contexto da NuAudit?', h: 'Construída pelo time ou usada em trabalhos de auditoria interna.', ex: '' },
    { k: 'p1', t: 'A saída entra em conclusão, parecer ou relatório oficial de auditoria?', h: 'Mesmo que um auditor revise antes. Conta se o texto ou a recomendação pode chegar ao relatório.', ex: 'Ex.: sugestão de redação de achado = Sim.', crit: true },
    { k: 'p2', t: 'Trata dado pessoal, confidencial, papel de trabalho ou dado de auditado?', h: 'Se Sim, o registro encaminha a solução ao DPO e à Segurança da Informação.', ex: 'Ex.: lê evidências anexadas ao trabalho = Sim.', crit: true },
    { k: 'p3', t: 'Decide ou age sozinha (escreve, envia, altera) sem revisão humana antes?', h: 'Ação com efeito fora da conversa, sem um auditor aprovar antes.', ex: 'Ex.: abre ticket ou envia e-mail ao auditado automaticamente = Sim.', crit: true },
    { k: 'p4', t: 'Apoia teste SOX/ICFR ou gera informação usada para avaliar pessoas?', h: 'Testes de controles financeiros ou qualquer avaliação de desempenho de pessoas.', ex: '', crit: true },
    { k: 'p7', t: 'Uma falha pode ter impacto relevante?', h: 'Operacional, financeiro, reputacional ou na qualidade da auditoria.', ex: '', crit: true },
    { k: 'p5', t: 'É usada por mais de um pack ou diretamente pelos auditados?', h: 'Amplia o alcance de uma falha.', ex: '' },
    { k: 'p6', t: 'Usa modelo ou fornecedor fora das plataformas homologadas?', h: 'Plataformas homologadas: as que a NuAudit já usa oficialmente [confirmar lista].', ex: '' },
    { k: 'iso', t: 'É experimento isolado, com dados públicos ou sintéticos e sem uso real?', h: 'Prova de conceito que ninguém usa em trabalho real.', ex: '' }
  ];
  const CRIT = Q.filter(q => q.crit).map(q => q.k);

  /** Retorna {trilha, bloqueios[], gatilhos[]}. trilha: '' (incompleto) | Fora do escopo | Reforçada | Pendente | Expressa | Padrão */
  function enquadrar(ans) {
    ans = ans || {};
    const gatilhos = Q.filter(q => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].includes(q.k) && ans[q.k] === 's').map(q => q.k);
    if (ans.ia === 'n' || ans.vinc === 'n') return { trilha: 'Fora do escopo', bloqueios: [], gatilhos };
    if (CRIT.some(k => ans[k] === 's')) return { trilha: 'Reforçada', bloqueios: [], gatilhos };
    const bloqueios = ['ia', 'vinc'].concat(CRIT).filter(k => ans[k] === '?');
    if (bloqueios.length) return { trilha: 'Pendente', bloqueios, gatilhos };
    if (Q.some(q => !ans[q.k])) return { trilha: '', bloqueios: [], gatilhos };
    if (ans.iso === 's' && ans.p5 === 'n' && ans.p6 === 'n') return { trilha: 'Expressa', bloqueios: [], gatilhos };
    return { trilha: 'Padrão', bloqueios: [], gatilhos };
  }

  /* ---------- M2 Risco inerente ---------- */
  function celula(i, p) {
    const sc = i * p;
    let l = sc >= 13 ? 4 : sc >= 9 ? 3 : sc >= 4 ? 2 : 1;
    if (i === 4) l = Math.max(l, p >= 3 ? 4 : 3);
    return l;
  }
  /** {idx 1-4, tier 1-4, origem} ou {} se ainda não avaliável */
  function risco(sol) {
    const t = enquadrar(sol.m1 && sol.m1.ans).trilha;
    if (t === 'Expressa') return { idx: 1, tier: 4, origem: 'registro simplificado (Expressa)' };
    const m = sol.m2 || {};
    if (m.corp) return { idx: 5 - Number(m.corp), tier: Number(m.corp), origem: 'tier corporativo importado' };
    const cen = (m.cen || []).filter(c => c && c.i && c.p);
    if (!cen.length) return {};
    let x = 0;
    cen.forEach(c => { x = Math.max(x, celula(Number(c.i), Number(c.p))); });
    const g = m.g || {};
    if (g.a) x = Math.max(x, 3);
    if (g.b) x = 4;
    if (g.c) x = Math.min(4, x + 1);
    return { idx: x, tier: 5 - x, origem: 'avaliação por cenários' };
  }

  /* ---------- M3 Catálogo de controles ---------- */
  const CT = [
    ['N1', 'c1', 'Escopo, finalidade e limites documentados', 'PURPOSE.md ou PRD com uso previsto e usos vedados', 'CTRL-001, 012'],
    ['N1', 'c2', 'Responsável nomeado (uma pessoa)', 'Registro da solução com nome do responsável', 'CTRL-003'],
    ['N1', 'c3', 'Acesso autorizado a dados e ferramentas', 'Configuração de acesso ou aprovação do dono do dado', 'CTRL-015'],
    ['N1', 'c4', 'Teste básico da tarefa', 'Casos de teste com resultado esperado e obtido', 'CTRL-021'],
    ['N1', 'c5', 'Versão de modelo, prompt e configuração registrada', 'Tag ou histórico do repositório', 'CTRL-014'],
    ['N1', 'c6', 'Forma de interromper o uso', 'Passo de desligamento testado', 'CTRL-032'],
    ['N2', 'c7', 'Testes dos cenários de falha, com limiar', 'Relatório de testes da versão, com limiar de aceite', 'CTRL-022'],
    ['N2', 'c8', 'Supervisão humana antes de a saída ter efeito', 'Registro de aceite ou rejeição pelo auditor', 'CTRL-036'],
    ['N2', 'c9', 'Ledger de execução', 'Amostra de execuções reconstruída de ponta a ponta', 'CTRL-035'],
    ['N2', 'c10', 'Tratamento de incidentes', 'Registro de incidente e correção', 'CTRL-040'],
    ['N2', 'c11', 'Acompanhamento de desempenho', 'Utility Score e concordância IA × auditor', 'CTRL-039'],
    ['N3', 'c12', 'Validação por quem não construiu', 'Relatório do validador independente', 'CTRL-025, 055'],
    ['N3', 'c13', 'Testes de segurança e uso adverso', 'Relatório de teste (prompt injection, vazamento)', 'CTRL-023'],
    ['N3', 'c14', 'Limites de ações e permissões do agente', 'Especificação e teste de bloqueio', 'CTRL-016, 031'],
    ['N3', 'c15', 'Monitoramento com critério de intervenção', 'Limites de alerta definidos', 'CTRL-039, 045'],
    ['N3', 'c16', 'Contingência ou reversão testada', 'Evidência do teste de reversão', 'CTRL-032'],
    ['G2', 'g1', 'Integração com os serviços da plataforma, sem infraestrutura paralela', 'Arquitetura no PRD', 'Rollout Governance'],
    ['G2', 'g2', 'Documentação de uso e suporte publicada', 'Guia de uso', 'Rollout Governance'],
    ['G2', 'g3', 'Feedback do beta revisado; bloqueantes resolvidos', 'Registro de feedback', 'Rollout Governance'],
    ['G2', 'g4', 'Dono do custo e limite de alerta definidos', 'Campo do registro; AI Metrics', 'GAP-016'],
    ['PRIV', 'p1', 'Parecer de privacidade e segurança', 'Parecer do DPO ou da Segurança da Informação', 'CTRL-006, 017'],
    ['T12', 't1', 'Comparação com trabalho humano já aprovado', 'Relatório IA × auditor sobre trabalhos aprovados', 'CTRL-028'],
    ['T12', 't2', 'Revisão independente em contexto zero', 'Registro da revisão', 'CTRL-025'],
    ['T1', 't3', 'Registro no Model Book e revisão de fora da Auditoria', 'Registro e parecer', 'CTRL-055']
  ].map(a => ({ g: a[0], id: a[1], t: a[2], ev: a[3], lib: a[4] }));
  const GRUPO = { N1: 'Nível 1', N2: 'Nível 2', N3: 'Nível 3', G2: 'Gate 2', PRIV: 'Dados (P2)', T12: 'Tiers 1 e 2', T1: 'Tier 1' };

  function controles(sol) {
    const r = risco(sol);
    const tr = enquadrar(sol.m1 && sol.m1.ans).trilha;
    if (!r.tier) return [];
    const t = r.tier;
    if (tr === 'Expressa') return CT.filter(c => c.g === 'N1');
    const L = t === 4 ? ['N1'] : t === 3 ? ['N1', 'N2'] : ['N1', 'N2', 'N3'];
    const p2 = sol.m1 && sol.m1.ans && sol.m1.ans.p2 === 's';
    return CT.filter(c => L.includes(c.g) || c.g === 'G2' || (c.g === 'T12' && t <= 2) || (c.g === 'T1' && t === 1) || (c.g === 'PRIV' && p2));
  }

  /** Tier 4 e Expressa: evidências autodeclaradas (sem revisão obrigatória da Audit Solutions). */
  function exigeRevisao(sol) {
    const r = risco(sol);
    return !!r.tier && r.tier <= 3 && enquadrar(sol.m1 && sol.m1.ans).trilha !== 'Expressa';
  }

  /* ---------- M3 declaração × M4 revisão ---------- */
  // Declaração (delivery team): I implementado | P parcial | X não implementado | NA não aplicável
  // Revisão (Audit Solutions): M demonstrado | P parcial | N não demonstrado | NT não testável | NA não aplicável aceito
  const DECL = { I: 'Implementado', P: 'Parcial', X: 'Não implementado', NA: 'Não aplicável' };
  const REV = { M: 'Demonstrado', P: 'Parcial', N: 'Não demonstrado', NT: 'Não testável', NA: 'NA aceito' };
  const CORRESP = { I: 'M', P: 'P', X: 'N', NA: 'NA' };

  /** Valida uma declaração; retorna mensagem de erro ou ''. */
  function erroDeclaracao(d) {
    if (!d || !d.estado) return 'Escolha o estado do controle.';
    if ((d.estado === 'I' || d.estado === 'P') && !(d.evidencia || '').trim()) return 'Informe o link ou a referência da evidência.';
    if ((d.estado === 'I' || d.estado === 'P') && !(d.descricao || '').trim()) return 'Descreva o que a evidência mostra.';
    if (d.estado === 'NA' && !(d.just || '').trim()) return 'Justifique por que o controle não se aplica.';
    return '';
  }
  function erroRevisao(r) {
    if (!r || !r.res) return 'Escolha o resultado da revisão.';
    if (r.res !== 'NA' && !(r.amostra || '').trim()) return 'Descreva a amostra ou o teste realizado.';
    if (!(r.resultado || '').trim() && r.res !== 'NA') return 'Registre o resultado observado.';
    if ((r.res === 'NT' || r.res === 'NA' || r.res === 'N' || r.res === 'P') && !(r.just || '').trim()) return 'Justifique o resultado.';
    return '';
  }

  /** Situação consolidada por controle e contagens. */
  function situacaoControles(sol) {
    const itens = controles(sol);
    const rev = exigeRevisao(sol);
    const m3 = sol.m3 || {}, m4 = sol.m4 || {};
    const out = itens.map(c => {
      const d = m3[c.id], r = m4[c.id];
      let sit;
      if (!d || erroDeclaracao(d)) sit = 'sem declaração';
      else if (!rev) sit = 'autodeclarado';
      else if (!r || r.declRev !== d.rev) sit = 'aguardando revisão';
      else if (CORRESP[d.estado] === r.res) sit = 'confirmado';
      else sit = 'divergente';
      return { c, d, r, sit };
    });
    const n = s => out.filter(o => o.sit === s).length;
    return { itens: out, exigeRevisao: rev, total: out.length, semDeclaracao: n('sem declaração'), aguardando: n('aguardando revisão'), confirmados: n('confirmado'), divergentes: n('divergente'), autodeclarados: n('autodeclarado') };
  }

  /** Resultado efetivo de cada item: revisão quando exigida; senão, a declaração convertida. */
  function resultadosEfetivos(sol) {
    const s = situacaoControles(sol);
    return s.itens.map(o => {
      if (!o.d || erroDeclaracao(o.d)) return null;
      if (s.exigeRevisao) return o.r && o.r.declRev === o.d.rev ? o.r.res : null;
      return CORRESP[o.d.estado];
    });
  }

  /** M4 concluída: todos os itens declarados e (se exigida) revisados. */
  function m4Completa(sol) {
    const s = situacaoControles(sol);
    if (!s.total || s.semDeclaracao) return false;
    return !s.exigeRevisao || s.aguardando === 0;
  }

  /** C2 (controles implementados) e C4 (auditabilidade), derivados — não editáveis.
   *  Escala: 0 ausente · 1 parcial · 2 implementado e documentado · 3 verificado. */
  function criteriosDerivados(sol) {
    const s = situacaoControles(sol);
    const res = resultadosEfetivos(sol).filter(x => x && x !== 'NA');
    if (!s.total || res.length === 0 || !m4Completa(sol)) return { c2: null, c4: null, motivo: 'Conclua a declaração (M3) e a revisão (M4) de todos os controles.' };
    const verif = s.exigeRevisao;
    const m = res.filter(x => x === 'M').length, tot = res.length;
    // C2: proporção de controles demonstrados/implementados
    let c2 = m === tot ? (verif ? 3 : 2) : m / tot >= 0.5 ? 1 : 0;
    // C4: qualquer N → 0; qualquer P ou NT → 1; tudo M → 3 se verificado, 2 se autodeclarado
    let c4;
    if (res.includes('N')) c4 = 0;
    else if (res.includes('P') || res.includes('NT')) c4 = 1;
    else c4 = verif ? 3 : 2;
    return { c2, c4, motivo: '' };
  }

  /* ---------- M5 Decisão de uso ---------- */
  const CRITERIOS = [
    { k: 'C1', t: 'Supervisão humana', h: 'Um auditor aprova a saída antes de ela ter efeito.' },
    { k: 'C2', t: 'Controles da M3 implementados', h: 'Calculado a partir da revisão da M4.', derivado: true },
    { k: 'C3', t: 'Validação de desempenho', h: 'Testes com limiar de aceite e comparação com trabalho humano.' },
    { k: 'C4', t: 'Auditabilidade (M4)', h: 'Calculado: qualquer item não demonstrado = 0; parcial ou não testável = 1; tudo demonstrado = 3 (2 se autodeclarado).', derivado: true },
    { k: 'C5', t: 'Monitoramento e contingência', h: 'Métricas acompanhadas e forma testada de desligar.' },
    { k: 'C6', t: 'Dados e confidencialidade', h: 'Tratamento de dados autorizado e minimizado.' },
    { k: 'C7', t: 'Delimitação de uso', h: 'Usuários, usos permitidos e vedados definidos.' }
  ];
  const CONDS = ['', 'Liberado', 'Liberado com condições', 'Uso restrito', 'Não autorizado', 'Suspenso'];
  const AUTORIDADE = ['', 'Responsável pela solução', 'Liderança de governança de IA', 'Fórum de governança (com ciência do CAE)', 'CAE'];
  const ACE_NIVEL = [0, 1, 2, 3, 4, 4]; // por rank
  const VALIDADE = [0, 12, 6, 3, 0, 0];

  /** c: array de 7 notas (C2 e C4 são substituídos pelos derivados). */
  function decidir(sol, prop) {
    const r = risco(sol);
    if (!r.idx) return { erro: 'Avalie o risco inerente (M2) antes da decisão.' };
    const der = criteriosDerivados(sol);
    if (der.c2 === null) return { erro: der.motivo };
    const c = (prop.c || [0, 0, 0, 0, 0, 0, 0]).map(Number);
    c[1] = der.c2; c[3] = der.c4;
    const min = Math.min.apply(null, c), avg = c.reduce((a, b) => a + b, 0) / 7, n3 = c.filter(x => x === 3).length;
    const mit = (min >= 2 && n3 >= 4) ? 'Forte' : (min >= 1 && avg >= 2) ? 'Adequada' : 'Fraca';
    let res = Math.max(1, r.idx - (mit === 'Forte' ? 2 : mit === 'Adequada' ? 1 : 0));
    if (r.idx >= 3) res = Math.max(res, 2);
    let rank = res, maxBeta = false;
    const motivos = [];
    if (c[0] === 0 && prop.e1) { rank = Math.max(rank, 4); motivos.push('E1: a saída produz efeito sem revisão humana'); }
    if (c[5] === 0) { rank = Math.max(rank, 4); motivos.push('E2: dados sem tratamento autorizado'); }
    if (c[4] === 0) { rank = Math.max(rank, 3); motivos.push('E3: sem monitoramento nem desativação'); }
    if (c[3] === 0) { rank = Math.max(rank, 3); motivos.push('E4: não auditável (item não demonstrado na M4)'); }
    else if (c[3] === 1) { maxBeta = true; motivos.push('Auditabilidade parcial: máximo Beta até completar as evidências'); }
    if (prop.e5) { rank = 5; motivos.push('E5: incidente grave sem tratamento'); }
    const tr = enquadrar(sol.m1 && sol.m1.ans).trilha;
    let max = rank <= 2 ? (maxBeta ? 'Beta' : 'Live') : rank === 3 ? 'Beta' : rank === 4 ? 'Alpha' : 'Nenhum';
    if (tr === 'Expressa' && rank <= 4) { max = 'Alpha'; motivos.push('Trilha Expressa: somente experimento em Alpha; uso real refaz o enquadramento'); }
    return { c, mit, avg, inh: r.idx, res, rank, cond: CONDS[rank], max, nivel: ACE_NIVEL[rank], aceite: AUTORIDADE[ACE_NIVEL[rank]], validadeMeses: VALIDADE[rank], motivos };
  }

  /** Estágio resultante ao aplicar uma decisão aceita. Rebaixa se o atual exceder o máximo. */
  function estagioAposDecisao(atual, max) {
    if (max === 'Nenhum') return 'Suspensa';
    if (atual === 'Suspensa') return 'Alpha';
    const ia = ESTAGIOS.indexOf(atual), im = ESTAGIOS.indexOf(max);
    if (ia < 0 || im < 0) return atual;
    return ia > im ? max : atual;
  }

  function addMeses(iso, n) {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + n);
    return d.toISOString();
  }
  /** Decisão vigente: aceita, não invalidada e dentro da validade. */
  function decisaoVigente(sol, agora) {
    const d = sol.m5 && sol.m5.decisao;
    if (!d || d.invalidada) return null;
    if (d.validade && new Date(d.validade) < (agora || new Date())) return null;
    return d;
  }
  function decisaoVencida(sol, agora) {
    const d = sol.m5 && sol.m5.decisao;
    return !!(d && !d.invalidada && d.validade && new Date(d.validade) < (agora || new Date()));
  }

  /* ---------- Gates ---------- */
  function podeGate1(sol) {
    const e = enquadrar(sol.m1 && sol.m1.ans);
    const motivos = [];
    if (sol.estagio !== 'Alpha') motivos.push('A solução não está em Alpha.');
    if (!sol.m1 || sol.m1.status !== 'validado') motivos.push('O enquadramento (M1) precisa estar validado pela Audit Solutions.');
    if (e.trilha === 'Pendente') motivos.push('Enquadramento pendente: responda as perguntas marcadas como "Não sei".');
    if (e.trilha === 'Expressa') motivos.push('Trilha Expressa é só experimento em Alpha. Uso real exige refazer o enquadramento.');
    if (e.trilha === 'Fora do escopo') motivos.push('Solução fora do escopo da governança.');
    if (e.trilha !== 'Expressa' && (!sol.m2 || sol.m2.status !== 'validado')) motivos.push('O risco inerente (M2) precisa estar validado.');
    if (sol.m5 && sol.m5.decisao && sol.m5.decisao.invalidada) motivos.push('Há mudança de materialidade Alta aguardando nova decisão.');
    return { ok: motivos.length === 0, motivos };
  }
  function podeGate2(sol, agora) {
    const motivos = [];
    if (sol.estagio !== 'Beta') motivos.push('A solução precisa estar em Beta.');
    const d = decisaoVigente(sol, agora);
    if (!d) motivos.push('É preciso uma decisão de uso (M5) aceita e vigente.');
    else if (d.max !== 'Live') motivos.push('A decisão vigente limita a solução a ' + d.max + '.');
    if (!m4Completa(sol)) motivos.push('A declaração e a revisão dos controles precisam estar concluídas.');
    return { ok: motivos.length === 0, motivos };
  }

  /* ---------- M6 Materialidade ---------- */
  const DIMS = [['Finalidade', ['M1', 'M2', 'M5']], ['Dados', ['M1', 'M2', 'M3', 'M4']], ['Impacto e risco', ['M2', 'M5']], ['Funcionamento', ['M2', 'M3', 'M4']], ['Usuários afetados', ['M1', 'M5']], ['Controles', ['M3', 'M4', 'M5']]];
  const GATILHOS_M6 = ['Mudança da finalidade principal', 'Novo modelo ou nova lógica decisória', 'Controles existentes ficam insuficientes', 'Novos dados pessoais sensíveis ou críticos'];
  function materialidade(m) {
    m = m || {};
    const v = m.v || {}, g = m.g || {};
    const sum = DIMS.reduce((a, d) => a + (Number(v[d[0]]) || 1), 0);
    const trig = GATILHOS_M6.some(t => g[t]);
    let lv = sum >= 15 ? 'Alta' : sum >= 10 ? 'Média' : 'Baixa';
    if (lv === 'Baixa' && DIMS.some(d => Number(v[d[0]]) === 3)) lv = 'Média';
    if (trig) lv = 'Alta';
    const env = !!m.env && !trig;
    if (env) lv = 'Baixa';
    const set = {};
    if (lv !== 'Baixa') DIMS.forEach(d => { if ((Number(v[d[0]]) || 1) >= 2 || lv === 'Alta') d[1].forEach(x => { set[x] = 1; }); });
    if (lv !== 'Baixa') set.M4 = 1;
    if (lv === 'Alta') set.M5 = 1;
    return { sum, lv, env, gatilho: trig, mats: Object.keys(set).sort() };
  }

  const ENCERRAMENTO = ['Motivo e decisão registrados, com data e responsável', 'Usuários e packs dependentes avisados', 'Prompts, configuração e ledger arquivados', 'Dados descartados conforme a política de retenção', 'Acessos removidos e selo atualizado'];

  const Rules = { NV, ESTAGIOS, Q, enquadrar, celula, risco, CT, GRUPO, controles, exigeRevisao, DECL, REV, CORRESP, erroDeclaracao, erroRevisao, situacaoControles, resultadosEfetivos, m4Completa, criteriosDerivados, CRITERIOS, CONDS, AUTORIDADE, decidir, estagioAposDecisao, addMeses, decisaoVigente, decisaoVencida, podeGate1, podeGate2, DIMS, GATILHOS_M6, materialidade, ENCERRAMENTO };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
  else root.Rules = Rules;
})(typeof window !== 'undefined' ? window : this);
