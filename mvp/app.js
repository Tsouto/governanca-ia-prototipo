/* MVP — ferramenta de governança de IA da NuAudit (dados fictícios).
 * Dados: planilha Google via Apps Script (modo compartilhado) ou navegador (modo local). */
(function () {
  'use strict';
  const R = window.Rules;
  const API = 'https://script.google.com/macros/s/AKfycbzIWO0-9SvZC9bkPN7itB5952o0i-28-pze21VahQaonozCilrlSXyWr7sLAuCKd_-fkQ/exec';
  const LS_DADOS = 'nuaudit-mvp-dados-v1', LS_PERFIL = 'nuaudit-mvp-perfil-v1';
  const PAPEIS = {
    delivery: { rot: 'Delivery team', nome: 'Bruna L.', desc: 'Cadastra a solução, responde ao enquadramento, avalia o risco, declara os controles com evidências e registra mudanças.' },
    audit: { rot: 'Audit Solutions', nome: 'Elisa P.', desc: 'Valida enquadramento e risco, revisa as evidências por amostra (challenger), propõe a decisão de uso, assina o Gate 2 e encerra.' },
    aprovador: { rot: 'Aprovação de risco', nome: 'Gustavo T.', desc: 'Aceita ou devolve a decisão de uso, conforme o nível de autoridade exigido pelo risco residual.' }
  };

  /* ---------- utilidades ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const agora = () => new Date().toISOString();
  const fd = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
  const fdh = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const chip = (t, k, extra) => '<span class="chip ' + (k || '') + '"' + (extra || '') + '>' + esc(t) + '</span>';
  const tip = t => '<button type="button" class="tip" aria-label="Ajuda: ' + esc(t) + '">?<span class="tx" role="tooltip">' + esc(t) + '</span></button>';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } };
  function toast(msg, tipo) {
    const d = document.createElement('div');
    d.textContent = msg; if (tipo) d.className = tipo;
    $('#toast').appendChild(d);
    setTimeout(() => d.remove(), tipo === 'erro' ? 7000 : 3500);
  }

  /* ---------- estado ---------- */
  const S = {
    sols: [], modo: 'carregando', erroConexao: '', salvando: false,
    perfil: Object.assign({ papel: 'delivery', nomes: {}, nivel: 2 }, lsGet(LS_PERFIL, {})),
    filtro: { q: '', estagio: '', trilha: '' }, wz: null
  };
  const papel = () => S.perfil.papel;
  const nomeAtual = () => (S.perfil.nomes && S.perfil.nomes[papel()]) || PAPEIS[papel()].nome;
  const getSol = id => S.sols.find(s => s.id === id);

  /* ---------- persistência ---------- */
  async function carregar(silencioso) {
    try {
      const r = await fetch(API + '?acao=listar', { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || 'resposta inválida');
      S.sols = j.solucoes || []; S.modo = 'remoto'; S.erroConexao = '';
    } catch (e) {
      if (S.modo === 'remoto' && silencioso) return; // mantém o que tem
      S.modo = 'local'; S.erroConexao = String(e.message || e);
      S.sols = lsGet(LS_DADOS, []);
    }
  }
  async function gravar(sol, base, eventos) {
    if (S.modo === 'remoto') {
      try {
        const r = await fetch(API, { method: 'POST', body: JSON.stringify({ acao: 'salvar', sol, base, eventos }) });
        const j = await r.json();
        if (j.conflito) { substituir(j.sol); toast('Outra pessoa alterou esta solução antes de você. Carreguei a versão mais recente; refaça a alteração.', 'erro'); return false; }
        if (!j.ok) throw new Error(j.erro || 'falha ao gravar');
        substituir(j.sol); return true;
      } catch (e) { toast('Não foi possível gravar na planilha (' + (e.message || e) + '). Nada foi alterado.', 'erro'); return false; }
    }
    sol.rev = base + 1; substituir(sol); lsSet(LS_DADOS, S.sols); return true;
  }
  function substituir(sol) {
    const i = S.sols.findIndex(s => s.id === sol.id);
    if (i >= 0) S.sols[i] = sol; else S.sols.push(sol);
  }
  /** Aplica fn sobre uma cópia, registra o evento na trilha e grava. fn retorna texto de erro para abortar. */
  async function alterar(id, fn, acao, detalhe, quieto) {
    const atual = id ? getSol(id) : null;
    const s = atual ? clone(atual) : {};
    const err = fn(s);
    if (typeof err === 'string' && err) { toast(err, 'erro'); return false; }
    const det = typeof detalhe === 'function' ? detalhe(s) : detalhe;
    const ev = { em: agora(), perfil: PAPEIS[papel()].rot, nome: nomeAtual(), acao, detalhe: det || '' };
    s.hist = (s.hist || []).concat([ev]);
    S.salvando = true; document.body.classList.add('busy'); renderStatus();
    const ok = await gravar(s, atual ? (atual.rev || 0) : 0, [ev]);
    S.salvando = false; document.body.classList.remove('busy');
    if (ok && !quieto) toast(acao + ' — registrado.', 'ok');
    if (!quieto) render();
    return ok;
  }

  /* ---------- derivados ---------- */
  const trilha = s => R.enquadrar(s.m1 && s.m1.ans).trilha;
  const TRILHA_K = { 'Expressa': 'info', 'Padrão': 'warn', 'Reforçada': 'bad', 'Pendente': 'grey', 'Fora do escopo': 'grey', '': 'grey' };
  const NV_K = ['', 'info', 'warn', 'bad', 'bad'];
  const ESTAGIO_K = { Alpha: 'alpha', Beta: 'beta', Live: 'live', Suspensa: 'suspensa', Encerrada: 'encerrada' };
  function tierChip(s) { const r = R.risco(s); return r.idx ? chip('Tier ' + r.tier + ' · ' + R.NV[r.idx], NV_K[r.idx]) : chip('Risco a avaliar', 'grey'); }
  function trilhaChip(s) { const t = trilha(s) || 'A responder'; return chip(t, TRILHA_K[trilha(s)] || 'grey'); }
  function decisaoChip(s) {
    const d = s.m5 && s.m5.decisao;
    if (!d) return s.m5 && s.m5.proposta ? chip('Aguardando aceite', 'warn') : chip('Sem decisão', 'grey');
    if (d.invalidada) return chip('Reavaliação obrigatória', 'bad');
    if (R.decisaoVencida(s)) return chip('Aceite vencido', 'bad');
    const k = d.rank === 1 ? 'ok' : d.rank === 2 ? 'info' : d.rank === 3 ? 'warn' : 'bad';
    return chip(d.cond, k);
  }
  const editavelM1M2 = s => (s.estagio === 'Alpha' && !(s.m5 && s.m5.decisao)) || !!(s.m5 && s.m5.decisao && s.m5.decisao.invalidada);
  const m2Liberada = s => s.m1 && (s.m1.status === 'enviado' || s.m1.status === 'validado') && ['Padrão', 'Reforçada'].includes(trilha(s));
  const m3Liberada = s => s.estagio !== 'Encerrada' && s.m1 && s.m1.status === 'validado' && (trilha(s) === 'Expressa' || (s.m2 && s.m2.status === 'validado'));
  const m6Pendente = s => (s.m6 || []).find(m => m.lv !== 'Baixa' && !m.ciencia);

  /** Próxima ação do fluxo: {perfil, texto, aba} ou null. */
  function proxima(s) {
    if (s.estagio === 'Encerrada') return null;
    const t = trilha(s), m1 = s.m1 || {};
    if (!t || t === 'Pendente' || m1.status === 'rascunho' || m1.status === 'devolvido') return { perfil: 'delivery', texto: t === 'Pendente' ? 'Responder as perguntas pendentes do enquadramento' : m1.status === 'devolvido' ? 'Corrigir o enquadramento devolvido' : 'Concluir e enviar o enquadramento', aba: 'm1' };
    if (m1.status === 'enviado') return { perfil: 'audit', texto: 'Validar o enquadramento (M1)', aba: 'm1' };
    if (t === 'Fora do escopo') return null;
    const m2 = s.m2 || {};
    if (t !== 'Expressa' && m2.status !== 'validado') return m2.status === 'enviado' ? { perfil: 'audit', texto: 'Validar o risco inerente (M2)', aba: 'm2' } : { perfil: 'delivery', texto: m2.status === 'devolvido' ? 'Corrigir o risco devolvido' : 'Avaliar o risco inerente (M2)', aba: 'm2' };
    if (m6Pendente(s)) return { perfil: 'audit', texto: 'Registrar ciência da mudança ' + m6Pendente(s).lv.toLowerCase(), aba: 'm6' };
    const sit = R.situacaoControles(s), dec = s.m5 && s.m5.decisao, prop = s.m5 && s.m5.proposta;
    if (s.estagio === 'Alpha' && R.podeGate1(s).ok) return { perfil: 'delivery', texto: 'Registrar o Gate 1 (Alpha → Beta)', aba: 'g1' };
    if (sit.semDeclaracao) return { perfil: 'delivery', texto: 'Declarar ' + sit.semDeclaracao + ' controle(s) com evidência (M3)', aba: 'm3' };
    if (sit.exigeRevisao && sit.aguardando) return { perfil: 'audit', texto: 'Revisar ' + sit.aguardando + ' evidência(s) (M4)', aba: 'm4' };
    if (prop && !prop.devolvida) return { perfil: 'aprovador', texto: 'Aceitar ou devolver a decisão (exige ' + prop.calc.aceite + ')', aba: 'm5' };
    if (prop && prop.devolvida) return { perfil: 'audit', texto: 'Rever a proposta devolvida pelo aprovador', aba: 'm5' };
    if (!dec || dec.invalidada) return { perfil: 'audit', texto: dec ? 'Propor nova decisão após mudança Alta' : 'Propor a decisão de uso (M5)', aba: 'm5' };
    if (R.decisaoVencida(s)) return { perfil: 'audit', texto: 'Renovar a decisão (aceite vencido)', aba: 'm5' };
    if (s.estagio === 'Suspensa') return { perfil: 'audit', texto: 'Propor nova decisão para retomar o uso', aba: 'm5' };
    if (R.podeGate2(s).ok) return { perfil: 'audit', texto: 'Registrar o Gate 2 (Beta → Live)', aba: 'g2' };
    if (s.estagio === 'Beta' && dec.max === 'Beta') return { perfil: 'delivery', texto: 'Tratar as condições da decisão (limitada a Beta) e pedir nova decisão', aba: 'm3' };
    return null;
  }
  function pendencias(p) { return S.sols.map(s => ({ s, a: proxima(s) })).filter(x => x.a && x.a.perfil === p); }

  /* ---------- rotas ---------- */
  function rota() {
    const h = decodeURIComponent((location.hash || '#painel').slice(1)).split('/');
    return { v: h[0] || 'painel', id: h[1], aba: h[2] || 'visao' };
  }
  const ir = h => { if (location.hash !== '#' + h) location.hash = h; else render(); };

  /* ---------- cabeçalho ---------- */
  function renderWho() {
    const p = papel();
    $('#who').innerHTML = '<label for="who-papel">Perfil' + '<select id="who-papel" data-perfil="papel">' + Object.keys(PAPEIS).map(k => '<option value="' + k + '"' + (k === p ? ' selected' : '') + '>' + esc(PAPEIS[k].rot) + '</option>').join('') + '</select></label>' +
      (p === 'aprovador' ? '<label for="who-nivel">Autoridade<select id="who-nivel" data-perfil="nivel">' + [1, 2, 3, 4].map(n => '<option value="' + n + '"' + (n === Number(S.perfil.nivel) ? ' selected' : '') + '>' + esc(R.AUTORIDADE[n]) + '</option>').join('') + '</select></label>' : '') +
      '<label for="who-nome">Seu nome<input id="who-nome" type="text" data-perfil="nome" value="' + esc(nomeAtual()) + '" autocomplete="off"></label>';
    const n = pendencias(p).length, b = $('#nav-pend');
    b.hidden = !n; b.textContent = n;
  }
  function renderStatus() {
    const st = S.modo === 'remoto' ? chip('Conectado à base compartilhada (planilha)', 'ok') : S.modo === 'local' ? chip('Modo local: dados só neste navegador', 'warn') + ' <span class="muted xs">A base compartilhada não respondeu; o que você registrar fica neste navegador.</span>' : chip('Carregando…', 'grey');
    $('#status-bar').innerHTML = st + (S.salvando ? ' ' + chip('Gravando…', 'info') : '') + ' <span class="muted xs">Perfil atual: <b>' + esc(PAPEIS[papel()].rot) + '</b> · ' + esc(nomeAtual()) + '</span>' + ' <button type="button" class="linkbtn xs" data-act="recarregar">Atualizar dados</button>';
  }

  /* ---------- painel ---------- */
  function vPainel() {
    const sols = S.sols, f = S.filtro;
    const emUso = sols.filter(s => ['Beta', 'Live'].includes(s.estagio));
    const vig = sols.filter(s => R.decisaoVigente(s));
    const venc = sols.filter(s => R.decisaoVencida(s) || (s.m5 && s.m5.decisao && s.m5.decisao.invalidada));
    const aguard = sols.reduce((a, s) => a + (R.situacaoControles(s).exigeRevisao ? R.situacaoControles(s).aguardando : 0), 0);
    const k = (n, l, d) => '<div class="card kpi"><div class="n">' + n + '</div><div class="l">' + esc(l) + '</div><div class="d">' + esc(d) + '</div></div>';
    const q = f.q.trim().toLowerCase();
    const lista = sols.filter(s => (!q || (s.nome + ' ' + s.dono + ' ' + s.plataforma).toLowerCase().includes(q)) && (!f.estagio || s.estagio === f.estagio) && (!f.trilha || trilha(s) === f.trilha))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const podeCriar = papel() === 'delivery';
    const opts = (arr, v) => arr.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    return '<div class="row between"><div><h1>Portfólio de soluções de IA</h1><p class="lead">Cada solução tem um registro único. O selo de estágio só muda por decisão registrada.</p></div>' +
      '<button class="btn" data-act="nova"' + (podeCriar ? '' : ' disabled aria-disabled="true" title="Só o delivery team cadastra soluções. Troque o perfil no topo."') + '>+ Nova solução</button></div>' +
      (sols.length ? '' : '<div class="card empty stack"><h2>Nenhuma solução registrada</h2><p class="muted">Carregue o conjunto de demonstração (seis soluções fictícias em estágios diferentes) ou cadastre a primeira solução como delivery team.</p><div><button class="btn" data-act="seed">Carregar dados de demonstração</button></div></div>') +
      '<div class="grid">' + k(sols.length, 'Soluções registradas', 'inclui encerradas') + k(emUso.length, 'Em uso (Beta ou Live)', 'com usuários reais') + k(vig.length, 'Com decisão vigente', 'aceite dentro da validade') + k(venc.length, 'Exigem reavaliação', 'aceite vencido ou mudança Alta') + k(aguard, 'Evidências a revisar', 'itens aguardando a Audit Solutions') + '</div>' +
      '<div class="card stack"><div class="row between"><h2>Soluções</h2>' +
      '<div class="row"><label class="f" for="f-q">Buscar<input id="f-q" type="search" data-filtro="q" value="' + esc(f.q) + '" placeholder="Nome, responsável ou plataforma"></label>' +
      '<label class="f" for="f-est">Estágio<select id="f-est" data-filtro="estagio"><option value="">Todos</option>' + opts(['Alpha', 'Beta', 'Live', 'Suspensa', 'Encerrada'], f.estagio) + '</select></label>' +
      '<label class="f" for="f-tr">Trilha<select id="f-tr" data-filtro="trilha"><option value="">Todas</option>' + opts(['Expressa', 'Padrão', 'Reforçada', 'Pendente', 'Fora do escopo'], f.trilha) + '</select></label></div></div>' +
      '<div class="tw"><table><thead><tr><th>Solução</th><th>Plataforma</th><th>Selo</th><th>Trilha ' + tip('Profundidade da governança, definida pelo enquadramento (M1).') + '</th><th>Risco ' + tip('Nível de risco inerente e tier corporativo (M2).') + '</th><th>Decisão de uso</th><th>Próxima ação</th></tr></thead><tbody>' +
      (lista.length ? lista.map(s => { const a = proxima(s); const d = s.m5 && s.m5.decisao; return '<tr class="click" data-href="sol/' + s.id + '"><td><a class="solname" href="#sol/' + s.id + '">' + esc(s.nome) + '</a><div class="xs muted">' + esc(s.versao) + ' · ' + esc(s.dono) + '</div></td><td>' + esc(s.plataforma) + '</td><td><span class="chip lg nodot ' + ({ Alpha: 'warn', Beta: 'info', Live: 'ok', Suspensa: 'bad', Encerrada: 'grey' }[s.estagio] || 'grey') + '">' + esc(s.estagio) + '</span></td><td>' + trilhaChip(s) + '</td><td>' + tierChip(s) + '</td><td>' + decisaoChip(s) + (d && d.validade && !d.invalidada ? '<div class="xs muted">até ' + fd(d.validade) + '</div>' : '') + '</td><td>' + (a ? esc(a.texto) + '<div>' + chip(PAPEIS[a.perfil].rot, a.perfil === papel() ? 'warn' : 'grey') + '</div>' : '<span class="muted">—</span>') + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="muted">Nenhuma solução com esses filtros.</td></tr>') +
      '</tbody></table></div></div>' + legenda();
  }
  function legenda() {
    return '<div class="card flat stack"><h3>Legenda</h3>' +
      '<div class="legend"><b>Selo de estágio:</b>' + chip('Alpha', 'warn nodot') + 'em construção, sem usuários reais' + chip('Beta', 'info nodot') + 'testers nomeados' + chip('Live', 'ok nodot') + 'uso esperado' + chip('Suspensa', 'bad nodot') + 'uso interrompido' + chip('Encerrada', 'grey nodot') + 'ciclo fechado</div>' +
      '<div class="legend"><b>Trilha:</b>' + chip('Expressa', 'info') + 'experimento isolado' + chip('Padrão', 'warn') + 'uso real sem gatilho crítico' + chip('Reforçada', 'bad') + 'há gatilho crítico (P1–P4, P7)' + chip('Pendente', 'grey') + 'falta informação decisiva; não autoriza uso</div>' +
      '<div class="legend"><b>Revisão de evidências:</b>' + chip('Confirmado', 'ok') + chip('Aguardando revisão', 'warn') + chip('Divergente', 'bad') + 'revisão difere da declaração' + chip('Autodeclarado', 'info') + 'tier 4, sem revisão obrigatória</div></div>';
  }

  /* ---------- pendências ---------- */
  function vPendencias() {
    const p = papel(), lista = pendencias(p);
    return '<div><h1>Minhas pendências</h1><p class="lead">O que o perfil <b>' + esc(PAPEIS[p].rot) + '</b> precisa fazer agora. ' + esc(PAPEIS[p].desc) + '</p></div>' +
      (lista.length ? '<div class="stack">' + lista.map(x => '<div class="card row between"><div class="stack" style="gap:4px"><a class="solname" href="#sol/' + x.s.id + '/' + x.a.aba + '">' + esc(x.s.nome) + '</a><div>' + esc(x.a.texto) + '</div><div class="row">' + trilhaChip(x.s) + tierChip(x.s) + chip(x.s.estagio, 'grey nodot') + '</div></div><a class="btn" href="#sol/' + x.s.id + '/' + x.a.aba + '">Abrir</a></div>').join('') + '</div>'
        : '<div class="card empty"><h2>Nada pendente para este perfil</h2><p class="muted">Troque o perfil no topo para ver as pendências dos outros papéis.</p></div>') +
      '<div class="card flat stack"><h3>Pendências dos outros perfis</h3><div class="row">' + Object.keys(PAPEIS).filter(k => k !== p).map(k => chip(PAPEIS[k].rot + ': ' + pendencias(k).length, 'grey nodot')).join('') + '</div></div>';
  }

  /* ---------- guia ---------- */
  function vGuia() {
    const fb = [
      ['Matheus', 'Estágio podia ser alterado no cadastro.', 'O selo só muda por ação registrada: Gate 1 (delivery), decisão aceita (M5) e Gate 2 (Audit Solutions). A decisão aplica o estágio máximo e rebaixa quando o atual o excede; a Audit Solutions pode suspender.'],
      ['Matheus', 'Enquadramento Pendente deixava avançar.', 'Pendente bloqueia risco, Gate 1, controles e decisão. A tela mostra quais perguntas impedem a conclusão e permite registrar a lacuna.'],
      ['Matheus', 'Item "demonstrado" sem evidência; C4 podia sair 2 com itens parciais.', 'Declaração exige link e descrição. C2 e C4 são calculados e não editáveis: qualquer item não demonstrado = 0; parcial ou não testável = 1. Auditabilidade parcial limita a Beta. Regra coberta por teste automatizado.'],
      ['Matheus', 'Conceitos técnicos sem explicação.', 'Ícones de ajuda (?) em campos e critérios; exemplos em cada pergunta do enquadramento.'],
      ['Matheus', 'Formulário de cadastro grande.', 'Cadastro em passos, uma pergunta por tela, com barra de progresso, atalhos de teclado e revisão no final.'],
      ['João Pedro', 'Soluções compactadas, sem ambiente único.', 'Cada solução tem área de trabalho própria: cabeçalho com identidade e selo, linha do fluxo e próxima ação.'],
      ['João Pedro', 'Legendas sem destaque.', 'Chips com cor, borda e marcador; legenda fixa no painel.'],
      ['Victor', 'M4 não registrava amostra, resultado, revisor, data nem justificativa de NA.', 'Revisão com amostra testada, resultado observado e justificativa obrigatórios; revisor e data gravados automaticamente.'],
      ['Victor', 'Declaração e revisão misturadas na mesma tela.', 'M3 (delivery declara) e M4 (Audit Solutions revisa) em telas e perfis separados, com estados distintos. Resumo mostra aguardando, confirmados e divergentes. Alterar a declaração reabre a revisão do item.'],
      ['Victor', 'Sem rastreabilidade das ações.', 'Toda ação grava evento com perfil, pessoa, data e detalhe, no histórico da solução e na aba "eventos" da planilha.']
    ];
    return '<div><h1>Como funciona</h1><p class="lead">Governança como subproduto do trabalho: um registro por solução, alimentado nos dois gates que a NuAudit já usa, com profundidade pelo tier de risco.</p></div>' +
      '<div class="grid">' + Object.keys(PAPEIS).map(k => '<div class="card stack"><h3>' + esc(PAPEIS[k].rot) + '</h3><p class="small">' + esc(PAPEIS[k].desc) + '</p></div>').join('') + '</div>' +
      '<div class="card stack"><h2>Fluxo</h2><ol><li><b>Cadastro e enquadramento (M1)</b> — delivery responde dez perguntas; Audit Solutions valida.</li><li><b>Risco inerente (M2)</b> — tier importado ou cenários de falha; Audit Solutions valida.</li><li><b>Gate 1</b> — delivery registra Alpha → Beta.</li><li><b>Controles (M3)</b> — delivery declara cada controle do tier, com evidência.</li><li><b>Revisão (M4)</b> — Audit Solutions testa por amostra e registra o resultado (tier 4: autodeclarado).</li><li><b>Decisão de uso (M5)</b> — Audit Solutions propõe; quem tem a autoridade exigida aceita. A decisão define estágio máximo e validade.</li><li><b>Gate 2</b> — Audit Solutions registra Beta → Live.</li><li><b>Mudanças (M6)</b> — cada release é classificada; Alta invalida o aceite e reabre a revisão.</li><li><b>Encerramento</b> — cinco itens fecham o ciclo.</li></ol>' +
      '<p class="small muted">Regras completas, catálogo de controles e matriz de riscos: <a href="../#framework">framework de referência</a>.</p></div>' +
      '<div class="card stack"><h2>O que mudou a partir dos feedbacks da equipe</h2><div class="tw"><table><thead><tr><th>Quem</th><th>Apontamento</th><th>Como ficou no MVP</th></tr></thead><tbody>' + fb.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="card stack"><h2>Dados e limites</h2><ul><li>Conectado, o MVP grava numa planilha Google (abas "solucoes" e "eventos"). Sem conexão, grava só no navegador e avisa no topo.</li><li>Os perfis são simulados: qualquer pessoa pode trocar de perfil. Em produção, o perfil viria do login do Dobby.</li><li>Use apenas dados fictícios: quem tiver o endereço da base consegue ler e gravar.</li><li>Gravações simultâneas na mesma solução são detectadas; a segunda é recusada e a tela recarrega a versão mais recente.</li></ul>' +
      (papel() === 'audit' ? '<div class="row"><button class="btn danger sm" data-act="seed">Recarregar dados de demonstração</button><span class="xs muted">Adiciona as seis soluções fictícias de novo (não apaga as existentes).</span></div>' : '') + '</div>' + legenda();
  }

  /* ---------- área da solução ---------- */
  const ABAS = [['visao', 'Visão geral'], ['m1', 'Enquadramento'], ['m2', 'Risco'], ['g1', 'Gate 1'], ['m3', 'Controles'], ['m4', 'Revisão'], ['m5', 'Decisão'], ['g2', 'Gate 2'], ['m6', 'Mudanças'], ['enc', 'Encerramento'], ['hist', 'Histórico'], ['arq', 'Arquivo']];
  function etapa(s, aba) {
    const t = trilha(s), m1 = s.m1 || {}, m2 = s.m2 || {}, sit = R.situacaoControles(s), d = s.m5 && s.m5.decisao;
    const done = x => ['done', '✓ ' + x], doing = x => ['doing', '● ' + x], todo = x => ['todo', '○ ' + x], blk = x => ['block', '⨯ ' + x], na = x => ['na', '– ' + x];
    switch (aba) {
      case 'm1': return m1.status === 'validado' ? done('validado') : t === 'Pendente' ? blk('pendente') : m1.status === 'enviado' ? doing('em validação') : m1.status === 'devolvido' ? blk('devolvido') : todo('rascunho');
      case 'm2': return t === 'Expressa' ? na('dispensado') : m2.status === 'validado' ? done('validado') : !m2Liberada(s) ? blk('aguarda M1') : m2.status === 'enviado' ? doing('em validação') : m2.status === 'devolvido' ? blk('devolvido') : todo('a avaliar');
      case 'g1': return s.gate1 ? done(fd(s.gate1.em)) : t === 'Expressa' ? na('só Alpha') : R.podeGate1(s).ok ? doing('liberado') : todo('aguarda');
      case 'm3': return !m3Liberada(s) ? todo('aguarda M2') : sit.total && !sit.semDeclaracao ? done(sit.total + ' itens') : doing((sit.total - sit.semDeclaracao) + '/' + sit.total);
      case 'm4': return !R.risco(s).idx ? todo('aguarda M2') : !sit.exigeRevisao ? na('autodeclarado') : !sit.total || sit.semDeclaracao === sit.total ? todo('aguarda M3') : sit.aguardando ? doing(sit.aguardando + ' a revisar') : done('concluída' + (sit.divergentes ? ' · ' + sit.divergentes + ' diverg.' : ''));
      case 'm5': return d && !d.invalidada && !R.decisaoVencida(s) ? done(d.cond) : d ? blk(d.invalidada ? 'reavaliar' : 'vencida') : s.m5 && s.m5.proposta ? doing('aguarda aceite') : todo('sem decisão');
      case 'g2': return s.gate2 ? done(fd(s.gate2.em)) : t === 'Expressa' ? na('só Alpha') : R.podeGate2(s).ok ? doing('liberado') : todo('aguarda');
      case 'm6': return m6Pendente(s) ? doing('ciência pendente') : (s.m6 || []).length ? done((s.m6 || []).length + ' registro(s)') : todo('nenhuma');
      case 'enc': return s.estagio === 'Encerrada' ? done(fd(s.enc && s.enc.em)) : todo('—');
      default: return null;
    }
  }
  function vSolucao(id, aba) {
    const s = getSol(id);
    if (!s) return '<div class="card empty"><h2>Solução não encontrada</h2><p><a href="#painel">Voltar ao painel</a></p></div>';
    const a = proxima(s), d = s.m5 && s.m5.decisao;
    const head = '<div class="card sol-head"><div class="selo ' + (ESTAGIO_K[s.estagio] || '') + '"><small>Selo</small>' + esc(s.estagio) + '</div>' +
      '<div class="stack" style="gap:6px"><div class="xs muted"><a href="#painel">Painel</a> / solução</div><h1>' + esc(s.nome) + '</h1><p>' + esc(s.finalidade) + '</p>' +
      '<div class="meta"><span>Versão <b>' + esc(s.versao) + '</b></span><span>Responsável <b>' + esc(s.dono) + '</b></span><span>Plataforma <b>' + esc(s.plataforma) + '</b></span><span>Registro desde <b>' + fd(s.criado_em) + '</b></span></div>' +
      '<div class="row">' + trilhaChip(s) + tierChip(s) + decisaoChip(s) + (d && d.validade && !d.invalidada ? chip('Validade: ' + fd(d.validade), R.decisaoVencida(s) ? 'bad nodot' : 'grey nodot') : '') + (s.m1 && s.m1.ans && s.m1.ans.p2 === 's' ? chip('Encaminhar ao DPO e Segurança', 'warn') : '') + '</div></div>' +
      '<div class="next"><div class="eyebrow">Próxima ação</div>' + (a ? '<b>' + esc(a.texto) + '</b><div>' + chip(PAPEIS[a.perfil].rot, a.perfil === papel() ? 'warn' : 'grey') + '</div>' + (a.perfil === papel() ? '<a class="btn sm" href="#sol/' + s.id + '/' + a.aba + '">Fazer agora</a>' : '<span class="xs muted">Troque o perfil no topo para agir como ' + esc(PAPEIS[a.perfil].rot) + '.</span>') : '<span class="muted">' + (s.estagio === 'Encerrada' ? 'Ciclo encerrado.' : trilha(s) === 'Fora do escopo' ? 'Fora do escopo da governança.' : 'Nenhuma ação pendente. Acompanhe métricas e registre mudanças a cada release.') + '</span>') + '</div></div>';
    const stepper = '<nav class="stepper" aria-label="Etapas da governança">' + ABAS.filter(x => !['visao', 'hist', 'arq'].includes(x[0])).map(x => { const e = etapa(s, x[0]); return '<button type="button" data-act="aba" data-aba="' + x[0] + '" aria-current="' + (aba === x[0]) + '"><span class="nm">' + esc(x[1]) + '</span><span class="st ' + e[0] + '">' + esc(e[1]) + '</span></button>'; }).join('') + '</nav>';
    const sub = '<div class="subtabs">' + [['visao', 'Visão geral'], ['hist', 'Histórico (' + (s.hist || []).length + ')'], ['arq', 'Arquivo de governança']].map(x => '<button type="button" data-act="aba" data-aba="' + x[0] + '" aria-current="' + (aba === x[0]) + '">' + esc(x[1]) + '</button>').join('') + '</div>';
    const fn = { visao: aVisao, m1: aM1, m2: aM2, g1: aG1, m3: aM3, m4: aM4, m5: aM5, g2: aG2, m6: aM6, enc: aEnc, hist: aHist, arq: aArq }[aba] || aVisao;
    return head + stepper + sub + (s.estagio === 'Encerrada' && aba !== 'hist' && aba !== 'arq' ? '<div class="note">Solução encerrada. O registro fica disponível para consulta.</div>' : '') + '<section class="stack lg" aria-label="' + esc((ABAS.find(x => x[0] === aba) || ABAS[0])[1]) + '">' + fn(s) + '</section>';
  }
  const soPerfil = (p, txt) => '<div class="note">' + esc(txt || ('Esta ação é do perfil ' + PAPEIS[p].rot + '.')) + ' Troque o perfil no topo para agir.</div>';
  const motivosHtml = m => m.length ? '<ul>' + m.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';

  function aVisao(s) {
    const sit = R.situacaoControles(s), r = R.risco(s), d = s.m5 && s.m5.decisao;
    const ult = (s.hist || []).slice(-5).reverse();
    return '<div class="grid two"><div class="card stack"><h2>Situação</h2><dl class="kv"><dt>Trilha</dt><dd>' + trilhaChip(s) + '</dd><dt>Risco inerente</dt><dd>' + (r.idx ? R.NV[r.idx] + ' (tier ' + r.tier + ', ' + esc(r.origem) + ')' : 'a avaliar') + '</dd>' +
      '<dt>Controles</dt><dd>' + (sit.total ? sit.total + ' itens · ' + (sit.total - sit.semDeclaracao) + ' declarados' + (sit.exigeRevisao ? ' · ' + sit.confirmados + ' confirmados · ' + sit.divergentes + ' divergentes' : ' · autodeclarados') : 'definidos após o risco') + '</dd>' +
      '<dt>Decisão</dt><dd>' + (d ? esc(d.cond) + ' · máximo ' + esc(d.max) + ' · aceite de ' + esc(d.aceitePor) + ' (' + esc(d.aceitePapel) + ') em ' + fd(d.em) + (d.validade ? ' · validade ' + fd(d.validade) : '') + (d.invalidada ? ' · <b>invalidada por mudança Alta</b>' : '') : 'sem decisão') + '</dd>' +
      '<dt>Gates</dt><dd>Gate 1: ' + (s.gate1 ? fd(s.gate1.em) + ' por ' + esc(s.gate1.por) : '—') + ' · Gate 2: ' + (s.gate2 ? fd(s.gate2.em) + ' por ' + esc(s.gate2.por) : '—') + '</dd></dl></div>' +
      '<div class="card stack"><h2>Últimos registros</h2>' + (ult.length ? '<ul class="small">' + ult.map(h => '<li><b>' + fd(h.em) + '</b> · ' + esc(h.acao) + ' <span class="muted">(' + esc(h.nome) + ', ' + esc(h.perfil) + ')</span></li>').join('') + '</ul>' : '<p class="muted">Sem registros.</p>') + '<div><button class="linkbtn" data-act="aba" data-aba="hist">Ver histórico completo</button></div></div></div>';
  }

  /* M1 */
  function aM1(s) {
    const m1 = s.m1 || {}, e = R.enquadrar(m1.ans), ans = m1.ans || {}, p = papel();
    const lab = { s: 'Sim', n: 'Não', '?': 'Não sei' };
    const cls = { 'Reforçada': 'r-bad', 'Padrão': 'r-warn', 'Expressa': 'r-info' }[e.trilha] || 'r-lil';
    const lista = '<div class="tw"><table><thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead><tbody>' + R.Q.map(q => '<tr' + (e.bloqueios.includes(q.k) ? ' style="background:#FFF6E0"' : '') + '><td>' + esc(q.t) + ' ' + tip(q.h) + '</td><td>' + (ans[q.k] ? chip(lab[ans[q.k]], ans[q.k] === 's' ? (q.crit ? 'bad' : 'warn') : ans[q.k] === '?' ? 'warn' : 'grey') : '<span class="muted">sem resposta</span>') + '</td></tr>').join('') + '</tbody></table></div>';
    let acoes = '';
    if (p === 'delivery') {
      if (!editavelM1M2(s)) acoes = '<div class="note">Depois do Gate 1 ou de uma decisão, alterações de enquadramento entram como mudança (M6).</div>';
      else acoes = '<div class="row"><button class="btn ghost" data-act="editar-m1">Editar respostas</button>' + (m1.status !== 'enviado' && m1.status !== 'validado' ? '<button class="btn" data-act="enviar-m1"' + (!e.trilha || e.trilha === 'Pendente' ? ' disabled aria-disabled="true"' : '') + '>Enviar para validação</button>' : '') + '</div>' + (e.trilha === 'Pendente' ? '<form class="stack" data-form="lacuna"><label class="f" for="lac">Registrar a lacuna (o que falta, responsável e prazo)<textarea id="lac" name="lacuna" required>' + esc(m1.lacuna || '') + '</textarea></label><div><button class="btn sm ghost">Salvar lacuna</button></div></form>' : '');
    } else if (p === 'audit') {
      if (m1.status === 'enviado') acoes = '<form class="stack" data-form="validar-m1"><label class="f" for="obs1">Observação (obrigatória para devolver)<textarea id="obs1" name="obs"></textarea></label><div class="row"><button class="btn" name="dec" value="validar"' + (e.trilha === 'Pendente' ? ' disabled' : '') + '>Validar enquadramento</button><button class="btn danger" name="dec" value="devolver">Devolver ao delivery team</button></div></form>';
      else acoes = '<p class="small muted">Nada a validar agora.</p>';
    } else acoes = soPerfil('delivery', 'O enquadramento é respondido pelo delivery team e validado pela Audit Solutions.');
    return '<div class="grid two"><div class="result ' + cls + '"><div class="eyebrow">Enquadramento</div><div class="big">' + esc(e.trilha || 'Incompleto') + '</div>' +
      (e.trilha === 'Pendente' ? '<p><b>Não autoriza o uso.</b> Risco, gates, controles e decisão ficam bloqueados até responder:</p>' + motivosHtml(e.bloqueios.map(k => R.Q.find(q => q.k === k).t)) : '') +
      (e.gatilhos.length ? '<p>Gatilhos: ' + e.gatilhos.map(k => k.toUpperCase()).join(', ') + '</p>' : '') + (ans.p2 === 's' ? '<p>P2 = Sim: encaminhar ao DPO e à Segurança da Informação.</p>' : '') +
      '<p class="small">Situação: <b>' + esc({ rascunho: 'rascunho', enviado: 'aguardando validação', validado: 'validado', devolvido: 'devolvido' }[m1.status] || 'rascunho') + '</b>' + (m1.validador ? ' · validado por ' + esc(m1.validador) + ' em ' + fd(m1.validado_em) : '') + '</p>' + (m1.obs ? '<p class="small">Observação da Audit Solutions: ' + esc(m1.obs) + '</p>' : '') + (m1.lacuna ? '<p class="small">Lacuna registrada: ' + esc(m1.lacuna) + '</p>' : '') + '</div>' +
      '<div class="card stack"><h2>Ações</h2>' + acoes + '</div></div><div class="card stack"><h2>Respostas</h2>' + lista + '</div>';
  }

  /* M2 */
  function aM2(s) {
    const m2 = s.m2 || {}, p = papel(), t = trilha(s);
    if (t === 'Expressa') return '<div class="result r-info"><div class="eyebrow">Risco inerente</div><div class="big">Dispensado (Expressa)</div><p>Experimento isolado: tier 4, controles de nível 1, somente em Alpha.</p></div>';
    if (!m2Liberada(s)) return '<div class="note warn">O risco só pode ser avaliado depois que o enquadramento for concluído e enviado, sem pendências.</div>';
    const r = R.risco(s);
    const pode = p === 'delivery' && editavelM1M2(s) && m2.status !== 'validado';
    const I = [[1, '1 Insignificante'], [2, '2 Moderado'], [3, '3 Alto'], [4, '4 Crítico']], P = [[1, '1 Rara'], [2, '2 Possível'], [3, '3 Provável'], [4, '4 Quase certa']];
    const cen = (m2.cen && m2.cen.length ? m2.cen : [{ d: '', i: 2, p: 2 }]);
    const sel = (n, arr, v) => '<select name="' + n + '"' + (pode ? '' : ' disabled') + '>' + arr.map(o => '<option value="' + o[0] + '"' + (Number(v) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const form = '<form class="card stack" data-form="m2" data-live="m2"><h2>Risco inerente (M2) ' + tip('Avalie antes dos controles: revisão humana e filtros existentes não reduzem a nota. Vale o maior nível entre os cenários.') + '</h2>' +
      '<label class="f" for="corp">Tier corporativo já atribuído?<span class="h">Se a solução já tem tier pela metodologia corporativa, ele é importado e os cenários são dispensados.</span><select id="corp" name="corp"' + (pode ? '' : ' disabled') + '><option value="">Não tem: avaliar por cenários</option>' + [4, 3, 2, 1].map(n => '<option value="' + n + '"' + (String(m2.corp) === String(n) ? ' selected' : '') + '>Tier ' + n + ' · ' + R.NV[5 - n] + '</option>').join('') + '</select></label>' +
      '<div class="stack" data-cenarios><h3>Cenários de falha ' + tip(t === 'Padrão' ? 'Trilha Padrão: bastam 1 ou 2 cenários principais.' : 'Trilha Reforçada: registre todos os cenários relevantes.') + '</h3>' +
      cen.map((c, i) => '<div class="grid" style="grid-template-columns:2fr 1fr 1fr auto;align-items:end"><label class="f">Cenário e consequência<input type="text" name="cd' + i + '" value="' + esc(c.d) + '"' + (pode ? '' : ' disabled') + ' placeholder="Ex.: o resumo omite uma evidência relevante"></label><label class="f">Impacto ' + tip('Gravidade da consequência para a auditoria ou para o Nubank.') + sel('ci' + i, I, c.i) + '</label><label class="f">Probabilidade' + sel('cp' + i, P, c.p) + '</label>' + (pode && cen.length > 1 ? '<button type="button" class="btn sm ghost" data-act="del-cen" data-i="' + i + '">Remover</button>' : '<span></span>') + '</div>').join('') +
      (pode ? '<div><button type="button" class="btn sm ghost" data-act="add-cen">+ Cenário</button></div>' : '') + '</div>' +
      '<fieldset class="stack"><legend class="f"><b>Gatilhos aplicados depois do cálculo</b></legend>' + [['a', 'Dados sensíveis ou pessoais em larga escala (piso Alto)'], ['b', 'Ação autônoma sobre TI ou finanças sem revisão prévia (Crítico)'], ['c', 'Saída generativa com influência em relatório regulatório (sobe um nível)']].map(g => '<label class="ck"><input type="checkbox" name="g' + g[0] + '"' + ((m2.g || {})[g[0]] ? ' checked' : '') + (pode ? '' : ' disabled') + '> ' + g[1] + '</label>').join('') + '</fieldset>' +
      '<div data-preview="m2">' + prevM2(r) + '</div>' +
      (pode ? '<div class="row"><button class="btn ghost" name="dec" value="salvar">Salvar rascunho</button><button class="btn" name="dec" value="enviar">Enviar para validação</button></div>' : '') + '</form>';
    let aud = '';
    if (p === 'audit' && m2.status === 'enviado') aud = '<form class="card stack" data-form="validar-m2"><h2>Validação da Audit Solutions</h2><label class="f" for="obs2">Observação (obrigatória para devolver)<textarea id="obs2" name="obs"></textarea></label><div class="row"><button class="btn" name="dec" value="validar"' + (s.m1.status !== 'validado' ? ' disabled title="Valide antes o enquadramento"' : '') + '>Validar risco</button><button class="btn danger" name="dec" value="devolver">Devolver</button></div>' + (s.m1.status !== 'validado' ? '<p class="xs muted">Valide primeiro o enquadramento (M1).</p>' : '') + '</form>';
    const stt = '<div class="note">Situação: <b>' + esc({ rascunho: 'rascunho', enviado: 'aguardando validação', validado: 'validado', devolvido: 'devolvido' }[m2.status] || 'rascunho') + '</b>' + (m2.validador ? ' · validado por ' + esc(m2.validador) + ' em ' + fd(m2.validado_em) : '') + (m2.obs ? ' · observação: ' + esc(m2.obs) : '') + '</div>';
    return stt + form + aud + (p === 'aprovador' ? soPerfil('delivery', 'O risco é avaliado pelo delivery team e validado pela Audit Solutions.') : '');
  }
  function prevM2(r) {
    if (!r.idx) return '<div class="result r-lil"><div class="big">Adicione um cenário</div></div>';
    return '<div class="result ' + (r.idx >= 3 ? 'r-bad' : r.idx === 2 ? 'r-warn' : 'r-info') + '"><div class="eyebrow">Resultado</div><div class="big">Tier ' + r.tier + ' · ' + R.NV[r.idx] + '</div><p>Origem: ' + esc(r.origem) + '. Controles: ' + (r.tier === 4 ? 'nível 1, autodeclarados' : r.tier === 3 ? 'níveis 1 e 2, revisão por amostra leve' : 'níveis 1 a 3, amostra completa e comparação com trabalho humano') + '.</p><p class="xs">Equivalência nível × tier corporativo a confirmar com o Nubank.</p></div>';
  }
  function lerM2(form) {
    const fdt = new FormData(form), cen = [];
    for (let i = 0; i < 20; i++) { if (!form.elements['ci' + i]) break; cen.push({ d: (fdt.get('cd' + i) || '').trim(), i: Number(fdt.get('ci' + i)), p: Number(fdt.get('cp' + i)) }); }
    return { corp: fdt.get('corp') || '', cen, g: { a: !!fdt.get('ga'), b: !!fdt.get('gb'), c: !!fdt.get('gc') } };
  }

  /* Gate 1 */
  function aG1(s) {
    if (s.gate1) return '<div class="result r-ok"><div class="eyebrow">Gate 1 registrado</div><div class="big">Alpha → Beta</div><p>Por ' + esc(s.gate1.por) + ' em ' + fdh(s.gate1.em) + '.</p>' + (s.gate1.obs ? '<p>' + esc(s.gate1.obs) + '</p>' : '') + '</div>';
    const g = R.podeGate1(s);
    const itens = ['Demo realizada para o time', 'Testers nomeados', 'Usuários avisados de que é beta em validação'];
    return '<div class="card stack"><h2>Gate 1: Alpha → Beta ' + tip('Autoavaliação do delivery team. A Audit Solutions é consultada, sem sign-off.') + '</h2>' +
      (g.ok ? '' : '<div class="note warn"><b>Ainda não é possível registrar:</b>' + motivosHtml(g.motivos) + '</div>') +
      (papel() === 'delivery' ? '<form class="stack" data-form="g1"><fieldset class="stack">' + itens.map((t, i) => '<label class="ck"><input type="checkbox" name="i' + i + '" required' + (g.ok ? '' : ' disabled') + '> ' + esc(t) + '</label>').join('') + '</fieldset><label class="f" for="g1obs">Testers e observações<textarea id="g1obs" name="obs"' + (g.ok ? '' : ' disabled') + ' placeholder="Ex.: 3 auditores do pack de Crédito"></textarea></label><div><button class="btn"' + (g.ok ? '' : ' disabled') + '>Registrar Gate 1</button></div></form>' : soPerfil('delivery')) + '</div>';
  }

  /* M3 — declaração (delivery) */
  function aM3(s) {
    if (!m3Liberada(s)) return '<div class="note warn">Os controles são definidos pelo tier. Conclua e valide o enquadramento' + (trilha(s) === 'Expressa' ? '' : ' e o risco') + ' antes.</div>';
    const sit = R.situacaoControles(s), pode = papel() === 'delivery';
    const grupos = {};
    sit.itens.forEach(o => { (grupos[o.c.g] = grupos[o.c.g] || []).push(o); });
    return counters(sit) + (pode ? '' : soPerfil('delivery', 'A declaração dos controles é do delivery team; aqui você vê o que foi declarado.')) +
      Object.keys(grupos).map(g => '<div class="stack"><h3>' + esc(R.GRUPO[g]) + '</h3>' + grupos[g].map(o => {
        const d = o.d || {};
        return '<details class="ctrl' + (o.sit === 'divergente' ? ' divergente' : '') + '"' + (o.sit === 'sem declaração' && pode ? ' open' : '') + '><summary><span><b>' + esc(o.c.t) + '</b><span class="xs muted"> · ' + esc(o.c.lib) + '</span></span><span class="row">' + (d.estado ? chip('Declarado: ' + R.DECL[d.estado], 'grey nodot') : '') + sitChip(o.sit) + '</span></summary>' +
          '<div class="body"><div class="box"><h4>Evidência esperada</h4><p class="small">' + esc(o.c.ev) + '</p>' + (o.r && o.r.declRev === d.rev ? '<h4>Revisão da Audit Solutions</h4><p class="small">' + chip(R.REV[o.r.res], o.sit === 'confirmado' ? 'ok' : 'bad') + ' por ' + esc(o.r.revisor) + ' em ' + fd(o.r.em) + '</p>' + (o.r.just ? '<p class="small">' + esc(o.r.just) + '</p>' : '') : '') + '</div>' +
          (pode ? '<form class="stack" data-form="m3" data-ctrl="' + o.c.id + '"><label class="f">Estado declarado ' + tip('Implementado ou parcial exige evidência; não aplicável exige justificativa.') + '<select name="estado"><option value="">Escolha</option>' + Object.keys(R.DECL).map(k => '<option value="' + k + '"' + (d.estado === k ? ' selected' : '') + '>' + R.DECL[k] + '</option>').join('') + '</select></label>' +
            '<label class="f">Link ou referência da evidência<input type="text" name="evidencia" value="' + esc(d.evidencia) + '" placeholder="https://… ou caminho no repositório"></label><label class="f">O que a evidência mostra<textarea name="descricao">' + esc(d.descricao) + '</textarea></label><label class="f">Justificativa (obrigatória para não aplicável)<textarea name="just">' + esc(d.just) + '</textarea></label><div class="row"><button class="btn sm">Salvar declaração</button>' + (d.por ? '<span class="xs muted">Última declaração: ' + esc(d.por) + ', ' + fd(d.em) + '</span>' : '') + '</div></form>'
            : '<div class="box"><h4>Declaração</h4>' + (d.estado ? '<dl class="kv"><dt>Estado</dt><dd>' + esc(R.DECL[d.estado]) + '</dd><dt>Evidência</dt><dd>' + linkEv(d.evidencia) + '</dd><dt>Descrição</dt><dd>' + esc(d.descricao || '—') + '</dd>' + (d.just ? '<dt>Justificativa</dt><dd>' + esc(d.just) + '</dd>' : '') + '<dt>Por</dt><dd>' + esc(d.por) + ', ' + fd(d.em) + '</dd></dl>' : '<p class="muted small">Ainda não declarado.</p>') + '</div>') + '</div></details>';
      }).join('') + '</div>').join('');
  }
  const linkEv = u => !u ? '—' : /^https?:\/\//.test(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>' : esc(u);
  function sitChip(sit) { return chip({ 'sem declaração': 'Sem declaração', 'aguardando revisão': 'Aguardando revisão', 'confirmado': 'Confirmado', 'divergente': 'Divergente', 'autodeclarado': 'Autodeclarado' }[sit], { 'sem declaração': 'grey', 'aguardando revisão': 'warn', 'confirmado': 'ok', 'divergente': 'bad', 'autodeclarado': 'info' }[sit]); }
  function counters(sit) {
    const c = (n, l, k) => '<div class="c">' + chip(l, k) + '<b>' + n + '</b></div>';
    return '<div class="counters">' + c(sit.total, 'Itens do tier', 'grey nodot') + c(sit.semDeclaracao, 'Sem declaração', 'grey') + (sit.exigeRevisao ? c(sit.aguardando, 'Aguardando revisão', 'warn') + c(sit.confirmados, 'Confirmados', 'ok') + c(sit.divergentes, 'Divergentes', 'bad') : c(sit.autodeclarados, 'Autodeclarados', 'info')) + '</div>';
  }

  /* M4 — revisão (Audit Solutions) */
  function aM4(s) {
    const sit = R.situacaoControles(s), pode = papel() === 'audit';
    if (!sit.exigeRevisao) return '<div class="note info">Tier 4 ou trilha Expressa: as evidências são autodeclaradas e não exigem revisão da Audit Solutions. A auditabilidade (C4) vale no máximo 2.</div>' + counters(sit);
    const ordem = { 'aguardando revisão': 0, 'divergente': 1, 'confirmado': 2 };
    const decl = sit.itens.filter(o => o.d && !R.erroDeclaracao(o.d)).sort((a, b) => (ordem[a.sit] || 0) - (ordem[b.sit] || 0));
    if (!decl.length) return '<div class="note warn">Nenhum controle declarado ainda. A revisão começa quando o delivery team declarar os controles.</div>' + counters(sit);
    const comp = R.m4Completa(s), der = R.criteriosDerivados(s);
    return counters(sit) + (pode ? '' : soPerfil('audit', 'A revisão das evidências é da Audit Solutions (challenger).')) +
      '<div class="card stack"><div class="row between"><h2>Encaminhamento</h2>' + (comp ? chip('Revisão completa', 'ok') : chip('Revisão incompleta', 'warn')) + '</div><p class="small">O checklist não bloqueia: itens parciais, não demonstrados ou não testáveis seguem para a decisão (M5) e pesam nos critérios C2 e C4.</p>' +
      (comp ? '<p class="small">C2 = <b>' + der.c2 + '</b> · C4 = <b>' + der.c4 + '</b>' + (der.c4 <= 1 ? ' · auditabilidade ' + (der.c4 === 0 ? 'não demonstrada: limita a Beta' : 'parcial: limita a Beta') : '') + '</p>' + (pode ? '<div><button class="btn" data-act="encaminhar-m5">Concluir revisão e encaminhar para a decisão</button></div>' : '') : '<p class="small muted">' + (sit.semDeclaracao ? sit.semDeclaracao + ' item(ns) sem declaração. ' : '') + (sit.aguardando ? sit.aguardando + ' item(ns) aguardando revisão.' : '') + '</p>') + '</div>' +
      decl.map(o => {
        const d = o.d, r = (o.r && o.r.declRev === d.rev) ? o.r : {};
        return '<details class="ctrl' + (o.sit === 'divergente' ? ' divergente' : '') + '"' + (o.sit === 'aguardando revisão' && pode ? ' open' : '') + '><summary><span><b>' + esc(o.c.t) + '</b><span class="xs muted"> · ' + esc(R.GRUPO[o.c.g]) + '</span></span><span class="row">' + chip('Declarado: ' + R.DECL[d.estado], 'grey nodot') + sitChip(o.sit) + '</span></summary><div class="body">' +
          '<div class="box"><h4>Declaração do delivery team</h4><dl class="kv"><dt>Estado</dt><dd>' + esc(R.DECL[d.estado]) + '</dd><dt>Evidência</dt><dd>' + linkEv(d.evidencia) + '</dd><dt>O que mostra</dt><dd>' + esc(d.descricao || '—') + '</dd>' + (d.just ? '<dt>Justificativa</dt><dd>' + esc(d.just) + '</dd>' : '') + '<dt>Declarado por</dt><dd>' + esc(d.por) + ', ' + fdh(d.em) + '</dd><dt>Esperado</dt><dd>' + esc(o.c.ev) + '</dd></dl></div>' +
          (pode ? '<form class="stack" data-form="m4" data-ctrl="' + o.c.id + '"><h4>Revisão (challenger)</h4><label class="f">Resultado ' + tip('Demonstrado: evidência localizada e teste feito. Parcial, não demonstrado, não testável ou NA exigem justificativa.') + '<select name="res"><option value="">Escolha</option>' + Object.keys(R.REV).map(k => '<option value="' + k + '"' + (r.res === k ? ' selected' : '') + '>' + R.REV[k] + '</option>').join('') + '</select></label>' +
            '<label class="f">Amostra ou teste realizado<input type="text" name="amostra" value="' + esc(r.amostra) + '" placeholder="Ex.: reabri 5 execuções pelo ledger"></label><label class="f">Resultado observado<textarea name="resultado">' + esc(r.resultado) + '</textarea></label><label class="f">Justificativa<textarea name="just" placeholder="Obrigatória para parcial, não demonstrado, não testável e NA">' + esc(r.just) + '</textarea></label><div class="row"><button class="btn sm">Registrar revisão</button>' + (r.revisor ? '<span class="xs muted">Revisado por ' + esc(r.revisor) + ', ' + fdh(r.em) + '</span>' : '<span class="xs muted">Revisor e data gravados automaticamente.</span>') + '</div></form>'
            : '<div class="box"><h4>Revisão</h4>' + (r.res ? '<dl class="kv"><dt>Resultado</dt><dd>' + esc(R.REV[r.res]) + '</dd><dt>Amostra</dt><dd>' + esc(r.amostra || '—') + '</dd><dt>Observado</dt><dd>' + esc(r.resultado || '—') + '</dd>' + (r.just ? '<dt>Justificativa</dt><dd>' + esc(r.just) + '</dd>' : '') + '<dt>Revisor</dt><dd>' + esc(r.revisor) + ', ' + fdh(r.em) + '</dd></dl>' : '<p class="muted small">Aguardando revisão.</p>') + '</div>') + '</div></details>';
      }).join('');
  }

  /* M5 — decisão */
  function aM5(s) {
    const p = papel(), dec = s.m5 && s.m5.decisao, prop = s.m5 && s.m5.proposta, der = R.criteriosDerivados(s), r = R.risco(s);
    let html = '';
    if (dec) html += '<div class="result ' + (dec.invalidada || R.decisaoVencida(s) ? 'r-bad' : dec.rank === 1 ? 'r-ok' : dec.rank === 2 ? 'r-info' : 'r-warn') + '"><div class="eyebrow">Decisão vigente' + (dec.invalidada ? ' · invalidada por mudança Alta' : R.decisaoVencida(s) ? ' · aceite vencido' : '') + '</div><div class="big">' + esc(dec.cond) + '</div><p>Inerente ' + (R.NV[dec.inh] || '—') + ' · mitigação ' + esc(dec.mit || '—') + ' · residual <b>' + (R.NV[dec.res] || '—') + '</b> · estágio máximo <b>' + esc(dec.max) + '</b></p><p>Aceite: ' + esc(dec.aceitePor) + ' (' + esc(dec.aceitePapel) + ') em ' + fdh(dec.em) + ' · validade ' + (dec.validade ? fd(dec.validade) : 'até reavaliação') + '</p>' + (dec.lim ? '<p>Limites: ' + esc(dec.lim) + '</p>' : '') + (dec.condicoes ? '<p>Condições: ' + esc(dec.condicoes) + '</p>' : '') + motivosHtml(dec.motivos || []) + '</div>';
    if (prop) {
      const c = prop.calc;
      html += '<div class="card stack"><div class="row between"><h2>Proposta da Audit Solutions</h2>' + (prop.devolvida ? chip('Devolvida pelo aprovador', 'bad') : chip('Aguardando aceite', 'warn')) + '</div>' +
        resultadoM5(c) + '<dl class="kv"><dt>Critérios</dt><dd>' + R.CRITERIOS.map((k, i) => k.k + ' ' + c.c[i]).join(' · ') + '</dd><dt>Limites</dt><dd>' + esc(prop.lim || '—') + '</dd><dt>Condições</dt><dd>' + esc(prop.cond || '—') + '</dd>' + (prop.just ? '<dt>Justificativa</dt><dd>' + esc(prop.just) + '</dd>' : '') + '<dt>Proposta por</dt><dd>' + esc(prop.por) + ', ' + fdh(prop.em) + '</dd>' + (prop.devolvida ? '<dt>Devolução</dt><dd>' + esc(prop.devolvida.obs) + ' (' + esc(prop.devolvida.por) + ', ' + fd(prop.devolvida.em) + ')</dd>' : '') + '</dl>';
      if (p === 'aprovador' && !prop.devolvida) {
        const ok = Number(S.perfil.nivel) >= c.nivel;
        html += ok ? '<form class="stack" data-form="aceite"><label class="f" for="obsA">Observação (obrigatória para devolver)<textarea id="obsA" name="obs"></textarea></label><label class="ck"><input type="checkbox" name="ciente" required> Li a proposta e aceito o risco residual ' + esc(R.NV[c.res]) + ' nas condições descritas.</label><div class="row"><button class="btn" name="dec" value="aceitar">Aceitar e registrar decisão</button><button class="btn danger" name="dec" value="devolver" formnovalidate>Devolver à Audit Solutions</button></div></form>'
          : '<div class="note bad">Esta decisão exige <b>' + esc(c.aceite) + '</b>. Sua autoridade no perfil: <b>' + esc(R.AUTORIDADE[S.perfil.nivel]) + '</b>. Para testar, ajuste a autoridade no topo.</div>';
      } else if (p !== 'audit' || !prop.devolvida) html += p === 'aprovador' ? '' : '<p class="small muted">O aceite cabe a quem tem a autoridade exigida (perfil Aprovação de risco).</p>';
      html += '</div>';
    }
    if (p === 'audit') {
      if (!r.idx) html += '<div class="note warn">Avalie e valide o risco antes da decisão.</div>';
      else if (der.c2 === null) html += '<div class="note warn">' + esc(der.motivo) + ' A decisão usa C2 e C4 calculados a partir da revisão.</div>';
      else if (!prop || prop.devolvida || (dec && (dec.invalidada || R.decisaoVencida(s))) || !dec) {
        const base = (prop && prop.c) || (dec && dec.c) || [2, 0, 2, 0, 2, 2, 2];
        html += '<form class="card stack" data-form="m5" data-live="m5"><h2>' + (dec ? 'Nova proposta de decisão' : 'Proposta de decisão (M5)') + '</h2><p class="small muted">0 ausente · 1 parcial ou informal · 2 implementado e documentado · 3 implementado, documentado e verificado.</p>' +
          '<div class="grid">' + R.CRITERIOS.map((k, i) => '<label class="f">' + esc(k.k + ' ' + k.t) + ' ' + tip(k.h) + (k.derivado ? '<input type="text" value="' + (i === 1 ? der.c2 : der.c4) + ' (calculado)" disabled><input type="hidden" name="c' + i + '" value="' + (i === 1 ? der.c2 : der.c4) + '">' : '<select name="c' + i + '">' + [0, 1, 2, 3].map(n => '<option' + (Number(base[i]) === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>') + '</label>').join('') + '</div>' +
          '<label class="ck"><input type="checkbox" name="e1"' + (prop && prop.e1 ? ' checked' : '') + '> A saída produz efeito sem revisão humana</label><label class="ck"><input type="checkbox" name="e5"' + (prop && prop.e5 ? ' checked' : '') + '> Há incidente grave sem tratamento</label>' +
          '<label class="f">Limites de uso<span class="h">Usuários, packs e usos vedados</span><textarea name="lim">' + esc((prop && prop.lim) || (dec && dec.lim) || '') + '</textarea></label><label class="f">Condições e pendências<span class="h">Ação, responsável e prazo, inclusive itens não demonstrados na M4</span><textarea name="cond">' + esc((prop && prop.cond) || '') + '</textarea></label><label class="f">Justificativa<span class="h">Obrigatória para uso restrito, não autorizado ou suspenso</span><textarea name="just">' + esc((prop && prop.just) || '') + '</textarea></label>' +
          '<div data-preview="m5">' + resultadoM5(R.decidir(s, { c: base })) + '</div><div class="row"><button class="btn">Enviar proposta para aceite</button></div></form>';
      }
      if (dec && !dec.invalidada && s.estagio !== 'Suspensa') html += '<form class="card stack" data-form="suspender"><h2>Suspender o uso</h2><p class="small">Para incidente grave sem tratamento (E5). A suspensão vale na hora, sem aceite; para voltar, é preciso nova decisão.</p><label class="f">Justificativa<textarea name="just" required></textarea></label><div><button class="btn danger">Suspender a solução</button></div></form>';
    } else if (!prop && (!dec || dec.invalidada || R.decisaoVencida(s))) html += soPerfil('audit', 'A proposta de decisão é feita pela Audit Solutions.');
    if (s.m5 && s.m5.anteriores && s.m5.anteriores.length) html += '<div class="card stack"><h3>Decisões anteriores</h3><ul class="small">' + s.m5.anteriores.slice().reverse().map(d => '<li>' + fd(d.em) + ' · ' + esc(d.cond) + ' · máximo ' + esc(d.max) + ' · ' + esc(d.aceitePor) + (d.invalidada ? ' · invalidada' : '') + '</li>').join('') + '</ul></div>';
    return html || '<p class="muted">Sem decisão.</p>';
  }
  function resultadoM5(c) {
    if (c.erro) return '<div class="note warn">' + esc(c.erro) + '</div>';
    return '<div class="result ' + (c.rank === 1 ? 'r-ok' : c.rank === 2 ? 'r-info' : c.rank === 3 ? 'r-warn' : 'r-bad') + '"><div class="eyebrow">Resultado calculado</div><div class="big">' + esc(c.cond) + '</div><p>Inerente ' + R.NV[c.inh] + ' · mitigação ' + esc(c.mit) + ' (média ' + c.avg.toFixed(1).replace('.', ',') + ') · residual <b>' + R.NV[c.res] + '</b></p><p>Estágio máximo: <b>' + esc(c.max) + '</b> · Aceite exigido: <b>' + esc(c.aceite) + '</b> · Validade: ' + (c.validadeMeses ? c.validadeMeses + ' meses' : 'até reavaliação') + '</p>' + motivosHtml(c.motivos) + '</div>';
  }

  /* Gate 2 */
  function aG2(s) {
    if (s.gate2) return '<div class="result r-ok"><div class="eyebrow">Gate 2 registrado</div><div class="big">Beta → Live</div><p>Sign-off de ' + esc(s.gate2.por) + ' em ' + fdh(s.gate2.em) + '.</p>' + (s.gate2.obs ? '<p>' + esc(s.gate2.obs) + '</p>' : '') + '</div>';
    if (trilha(s) === 'Expressa') return '<div class="note info">Trilha Expressa: a solução fica em Alpha. Uso real exige refazer o enquadramento.</div>';
    const g = R.podeGate2(s);
    return '<div class="card stack"><h2>Gate 2: Beta → Live ' + tip('A Audit Solutions dá o sign-off "ready for next phase" quando há decisão vigente que permite Live.') + '</h2>' + (g.ok ? '<div class="note ok">Requisitos atendidos.</div>' : '<div class="note warn"><b>Ainda não é possível registrar:</b>' + motivosHtml(g.motivos) + '</div>') +
      (papel() === 'audit' ? '<form class="stack" data-form="g2"><label class="f" for="g2obs">Observação do sign-off<textarea id="g2obs" name="obs"' + (g.ok ? '' : ' disabled') + '></textarea></label><div><button class="btn"' + (g.ok ? '' : ' disabled') + '>Registrar Gate 2</button></div></form>' : soPerfil('audit')) + '</div>';
  }

  /* M6 — mudanças */
  function aM6(s) {
    const p = papel(), lista = (s.m6 || []).slice().reverse();
    const pode = p === 'delivery' && ['Beta', 'Live', 'Suspensa'].includes(s.estagio);
    let html = '<div class="card stack"><h2>Mudanças registradas</h2>' + (lista.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>Versão</th><th>O que mudou</th><th>Materialidade</th><th>Matrizes a revisar</th><th>Ciência</th></tr></thead><tbody>' + lista.map(m => '<tr><td>' + fd(m.em) + '</td><td>' + esc(m.ver) + '</td><td>' + esc(m.desc) + '<div class="xs muted">' + esc(m.por) + (m.env ? ' · prevista no envelope' : '') + '</div></td><td>' + chip(m.lv, m.lv === 'Alta' ? 'bad' : m.lv === 'Média' ? 'warn' : 'info') + '</td><td>' + esc((m.mats || []).join(', ') || '—') + '</td><td>' + (m.lv === 'Baixa' ? '<span class="muted">não exigida</span>' : m.ciencia ? esc(m.ciencia.por) + ', ' + fd(m.ciencia.em) : (p === 'audit' ? '<button class="btn sm" data-act="ciencia" data-m="' + esc(m.id) + '">Registrar ciência</button>' : chip('Pendente', 'warn'))) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nenhuma mudança registrada.</p>') + '</div>';
    if (pode) {
      html += '<form class="card stack" data-form="m6" data-live="m6"><h2>Registrar mudança (release)</h2><div class="grid two"><label class="f">Nova versão<input type="text" name="ver" required placeholder="Ex.: v1.0"></label><label class="ck"><input type="checkbox" name="env"> Estava prevista no envelope de mudanças do agente ' + tip('Ex.: ajuste de prompt dentro da finalidade ou versão menor do mesmo modelo.') + '</label></div><label class="f">O que muda e por quê<textarea name="desc" required></textarea></label>' +
        '<fieldset class="stack"><legend><b>Gatilhos que levam a Alta</b></legend>' + R.GATILHOS_M6.map((t, i) => '<label class="ck"><input type="checkbox" name="t' + i + '"> ' + esc(t) + '</label>').join('') + '</fieldset>' +
        '<div class="grid">' + R.DIMS.map((d, i) => '<label class="f">' + esc(d[0]) + ' ' + tip('1 baixa · 2 média · 3 alta') + '<select name="d' + i + '">' + [1, 2, 3].map(n => '<option>' + n + '</option>').join('') + '</select></label>').join('') + '</div>' +
        '<div data-preview="m6">' + prevM6(R.materialidade({})) + '</div><div><button class="btn">Registrar no CHANGELOG</button></div></form>';
    } else if (p === 'delivery') html += '<div class="note">Mudanças são registradas quando a solução está em uso (Beta ou Live).</div>';
    else html += p === 'audit' ? '' : soPerfil('delivery');
    return html;
  }
  function lerM6(form) {
    const f = new FormData(form), v = {}, g = {};
    R.DIMS.forEach((d, i) => { v[d[0]] = Number(f.get('d' + i)) || 1; });
    R.GATILHOS_M6.forEach((t, i) => { if (f.get('t' + i)) g[t] = true; });
    return { ver: (f.get('ver') || '').trim(), desc: (f.get('desc') || '').trim(), env: !!f.get('env'), v, g };
  }
  function prevM6(r) {
    return '<div class="result ' + (r.lv === 'Alta' ? 'r-bad' : r.lv === 'Média' ? 'r-warn' : 'r-info') + '"><div class="eyebrow">Materialidade · soma ' + r.sum + '</div><div class="big">' + r.lv + '</div><p>' + (r.env ? 'Prevista e sem gatilho: segue o fluxo normal de release.' : r.lv === 'Baixa' ? 'Mantém a classificação.' : r.lv === 'Média' ? 'Revisão das matrizes afetadas; a Audit Solutions registra ciência.' : 'Nova avaliação: o aceite atual deixa de valer e todas as evidências voltam para revisão.') + '</p><p>Matrizes a revisar: ' + (r.mats.length ? r.mats.join(', ') : 'nenhuma') + '</p></div>';
  }

  /* Encerramento */
  function aEnc(s) {
    if (s.estagio === 'Encerrada') return '<div class="result r-lil"><div class="eyebrow">Encerrada</div><div class="big">' + fd(s.enc.em) + '</div><p>Por ' + esc(s.enc.por) + '. Motivo: ' + esc(s.enc.motivo) + '</p></div>';
    return '<div class="card stack"><h2>Encerramento ' + tip('Gatilhos: Utility Score baixo por dois ciclos, substituição, incidente sem correção viável, solução sem dono ou aceite vencido sem renovação.') + '</h2>' +
      (papel() === 'audit' ? '<form class="stack" data-form="enc"><label class="f">Motivo<textarea name="motivo" required></textarea></label><fieldset class="stack">' + R.ENCERRAMENTO.map((t, i) => '<label class="ck"><input type="checkbox" name="i' + i + '" required> ' + esc(t) + '</label>').join('') + '</fieldset><div><button class="btn danger">Registrar encerramento</button></div></form>' : soPerfil('audit', 'O encerramento é registrado pela Audit Solutions.')) + '</div>';
  }

  /* Histórico e arquivo */
  function aHist(s) {
    const h = (s.hist || []).slice().reverse();
    return '<div class="card stack"><h2>Trilha de auditoria</h2><p class="small muted">Cada ação grava perfil, pessoa, data e detalhe. Na base compartilhada, os eventos também ficam na aba "eventos" da planilha.</p><div class="tw"><table class="hist"><thead><tr><th>Data e hora</th><th>Perfil</th><th>Pessoa</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>' + h.map(e => '<tr><td>' + fdh(e.em) + '</td><td>' + esc(e.perfil) + '</td><td>' + esc(e.nome) + '</td><td>' + esc(e.acao) + '</td><td>' + esc(e.detalhe) + '</td></tr>').join('') + '</tbody></table></div></div>';
  }
  function governanceMd(s) {
    const e = R.enquadrar(s.m1 && s.m1.ans), r = R.risco(s), sit = R.situacaoControles(s), d = s.m5 && s.m5.decisao;
    return ['# Governança: ' + s.nome, '', 'versão: ' + s.versao, 'responsável: ' + s.dono, 'plataforma: ' + s.plataforma, 'estágio: ' + s.estagio, 'finalidade: ' + s.finalidade, '',
      '## M1 Enquadramento', 'trilha: ' + (e.trilha || 'incompleta'), 'gatilhos: ' + (e.gatilhos.map(x => x.toUpperCase()).join(', ') || 'nenhum'), 'validação: ' + ((s.m1 && s.m1.validador) ? s.m1.validador + ', ' + fd(s.m1.validado_em) : 'pendente'), '',
      '## M2 Risco inerente', r.idx ? 'nível: ' + R.NV[r.idx] + ' (tier ' + r.tier + ', ' + r.origem + ')' : 'a avaliar'].concat(((s.m2 && s.m2.cen) || []).map(c => '- ' + c.d + ': impacto ' + c.i + ', probabilidade ' + c.p)).concat(['',
      '## M3 e M4 Controles e evidências', sit.total + ' itens · ' + (sit.exigeRevisao ? sit.confirmados + ' confirmados · ' + sit.divergentes + ' divergentes · ' + sit.aguardando + ' aguardando revisão' : 'autodeclarados')])
      .concat(sit.itens.map(o => '- [' + (o.d ? o.d.estado : ' ') + (o.r && o.d && o.r.declRev === o.d.rev ? '/' + o.r.res : '') + '] ' + o.c.t + (o.d && o.d.evidencia ? ' -> ' + o.d.evidencia : ''))).concat(['',
      '## M5 Decisão de uso', d ? 'condição: ' + d.cond + '\nrisco residual: ' + R.NV[d.res] + '\nestágio máximo: ' + d.max + '\naceite: ' + d.aceitePor + ' (' + d.aceitePapel + '), ' + fd(d.em) + '\nvalidade: ' + (d.validade ? fd(d.validade) : 'até reavaliação') + (d.lim ? '\nlimites: ' + d.lim : '') + (d.invalidada ? '\nSITUAÇÃO: invalidada por mudança Alta' : '') : 'sem decisão', '',
      '## M6 Mudanças']).concat((s.m6 || []).map(m => '- ' + fd(m.em) + ' ' + m.ver + ': ' + m.desc + ' (' + m.lv + ')')).concat(['', '## Histórico']).concat((s.hist || []).map(h => '- ' + fdh(h.em) + ' · ' + h.perfil + ' · ' + h.nome + ': ' + h.acao + (h.detalhe ? ' (' + h.detalhe + ')' : ''))).join('\n');
  }
  function aArq(s) {
    return '<div class="card stack"><div class="row between"><h2>Arquivo de governança (GOVERNANCE.md)</h2><div class="row"><button class="btn sm ghost" data-act="copiar" data-alvo="gov-md">Copiar</button><button class="btn sm ghost" data-act="baixar-md">Baixar .md</button><button class="btn sm ghost" data-act="baixar-json">Baixar registro (.json)</button></div></div><p class="small muted">Gerado a partir do registro. No Dobby, ficaria no repositório do agente, ao lado do PURPOSE.md e do CHANGELOG.</p><pre id="gov-md">' + esc(governanceMd(s)) + '</pre></div>';
  }

  /* ---------- assistente de cadastro ---------- */
  const PASSOS_ID = [
    { k: 'nome', t: 'Qual é o nome da solução?', h: 'Como o time chama a ferramenta no dia a dia.', tipo: 'texto', ph: 'Ex.: Resumo de evidências' },
    { k: 'finalidade', t: 'Para que ela serve?', h: 'Uma ou duas frases: o que faz, para quem e em que momento do trabalho.', tipo: 'area', ph: 'Ex.: resume papéis de trabalho para o auditor revisar antes de anexar.' },
    { k: 'dono', t: 'Quem é o responsável pela solução?', h: 'Uma pessoa, não um time. Ela responde pelo registro.', tipo: 'texto', ph: 'Nome do responsável' },
    { k: 'plataforma', t: 'Em qual plataforma ela roda?', h: 'Plataforma onde a solução é construída ou usada.', tipo: 'opcoes', opts: ['Dobby', 'Cursor', 'Glean', 'NotebookLM', 'Gemini', 'Databricks', 'Outra'] }
  ];
  function abrirWizard(sol) {
    const so = !!sol;
    const passos = (so ? [] : PASSOS_ID).concat(R.Q.map(q => ({ k: q.k, t: q.t, h: q.h, ex: q.ex, tipo: 'sn', m1: true }))).concat([{ k: 'fim', tipo: 'fim' }]);
    S.wz = { passos, i: 0, solId: sol && sol.id, d: so ? { ans: clone((sol.m1 && sol.m1.ans) || {}) } : { nome: '', finalidade: '', dono: nomeAtual(), plataforma: '', ans: {} }, erro: '' };
    renderWz();
  }
  function renderWz() {
    const root = $('#wizard-root'), w = S.wz;
    if (!w) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    const p = w.passos[w.i], tot = w.passos.length, nQ = w.passos.filter(x => x.m1).length;
    const idxQ = w.passos.slice(0, w.i + 1).filter(x => x.m1).length;
    let corpo;
    if (p.tipo === 'fim') {
      const e = R.enquadrar(w.d.ans);
      const cls = { 'Reforçada': 'r-bad', 'Padrão': 'r-warn', 'Expressa': 'r-info' }[e.trilha] || 'r-lil';
      corpo = '<div class="wz-n">Revisão</div><div class="wz-q">' + (w.solId ? 'Confira o novo enquadramento' : 'Confira antes de criar o registro') + '</div>' +
        '<div class="result ' + cls + '"><div class="eyebrow">Enquadramento</div><div class="big">' + esc(e.trilha || 'Incompleto') + '</div>' + (e.trilha === 'Pendente' ? '<p>Não autoriza uso. Faltam respostas decisivas:</p><ul>' + e.bloqueios.map(k => '<li>' + esc(R.Q.find(q => q.k === k).t) + ' <button type="button" class="linkbtn" data-wz="ir" data-k="' + k + '">responder</button></li>').join('') + '</ul>' : '') + (w.d.ans.p2 === 's' ? '<p>P2 = Sim: o registro encaminha ao DPO e à Segurança da Informação.</p>' : '') + (e.trilha === 'Fora do escopo' ? '<p>A triagem se encerra aqui; o registro guarda a justificativa.</p>' : '') + '</div>' +
        (w.solId ? '' : '<dl class="kv"><dt>Nome</dt><dd>' + esc(w.d.nome) + '</dd><dt>Finalidade</dt><dd>' + esc(w.d.finalidade) + '</dd><dt>Responsável</dt><dd>' + esc(w.d.dono) + '</dd><dt>Plataforma</dt><dd>' + esc(w.d.plataforma) + '</dd></dl>') +
        (e.trilha && e.trilha !== 'Pendente' ? '<label class="ck"><input type="checkbox" id="wz-enviar" checked> Enviar o enquadramento para validação da Audit Solutions</label>' : '') +
        '<div class="row"><button type="button" class="btn" data-wz="salvar">' + (w.solId ? 'Salvar enquadramento' : 'Criar registro') + '</button><button type="button" class="btn ghost" data-wz="voltar">Voltar</button></div>';
    } else if (p.tipo === 'sn') {
      const v = w.d.ans[p.k];
      corpo = '<div class="wz-n">Enquadramento · pergunta ' + idxQ + ' de ' + nQ + '</div><div class="wz-q" id="wz-q">' + esc(p.t) + '</div><p class="wz-help">' + esc(p.h) + '</p>' + (p.ex ? '<p class="wz-ex">' + esc(p.ex) + '</p>' : '') +
        '<div class="wz-opts" role="group" aria-labelledby="wz-q">' + [['s', 'Sim', 'S'], ['n', 'Não', 'N'], ['?', 'Não sei', '?']].map(o => '<button type="button" class="wz-opt" data-wz="resp" data-v="' + o[0] + '" aria-pressed="' + (v === o[0]) + '"><kbd>' + o[2] + '</kbd>' + o[1] + '</button>').join('') + '</div>' +
        '<p class="xs muted">Atalhos: S, N ou ? para responder · Enter para avançar · Esc para sair.</p>';
    } else if (p.tipo === 'opcoes') {
      corpo = '<div class="wz-n">Identificação</div><div class="wz-q" id="wz-q">' + esc(p.t) + '</div><p class="wz-help">' + esc(p.h) + '</p><div class="wz-opts" role="group" aria-labelledby="wz-q">' + p.opts.map(o => '<button type="button" class="wz-opt" data-wz="opt" data-v="' + esc(o) + '" aria-pressed="' + (w.d[p.k] === o) + '">' + esc(o) + '</button>').join('') + '</div>';
    } else {
      corpo = '<div class="wz-n">Identificação</div><label class="wz-q" for="wz-in">' + esc(p.t) + '</label><p class="wz-help">' + esc(p.h) + '</p>' + (p.tipo === 'area' ? '<textarea id="wz-in" class="wz-in" rows="3" placeholder="' + esc(p.ph) + '">' + esc(w.d[p.k]) + '</textarea>' : '<input id="wz-in" class="wz-in" type="text" value="' + esc(w.d[p.k]) + '" placeholder="' + esc(p.ph) + '">') +
        '<div class="row"><button type="button" class="btn" data-wz="prox">OK</button><span class="xs muted">ou pressione Enter</span></div>';
    }
    root.innerHTML = '<div class="wz" role="dialog" aria-modal="true" aria-label="' + (w.solId ? 'Editar enquadramento' : 'Cadastrar solução') + '"><div class="wz-top"><b>' + (w.solId ? 'Editar enquadramento' : 'Nova solução de IA') + '</b><button type="button" class="btn sm ghost" data-wz="sair">Sair sem salvar</button></div>' +
      '<div class="wz-body"><div class="wz-card">' + corpo + (w.erro ? '<p class="field-err" role="alert">' + esc(w.erro) + '</p>' : '') + '</div></div>' +
      '<div class="wz-foot"><button type="button" class="btn sm ghost" data-wz="voltar"' + (w.i === 0 ? ' disabled' : '') + '>← Voltar</button><div class="wz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + tot + '" aria-valuenow="' + (w.i + 1) + '" aria-label="Progresso do cadastro"><span style="width:' + Math.round((w.i + 1) / tot * 100) + '%"></span></div><span class="xs muted">Etapa ' + (w.i + 1) + ' de ' + tot + '</span><button type="button" class="btn sm" data-wz="prox"' + (p.tipo === 'fim' ? ' disabled' : '') + '>Avançar →</button></div></div>';
    const inp = $('#wz-in'); if (inp) { inp.focus(); inp.setSelectionRange && inp.setSelectionRange(inp.value.length, inp.value.length); } else { const b = root.querySelector('.wz-opt[aria-pressed="true"]') || root.querySelector('.wz-opt') || root.querySelector('[data-wz="salvar"]'); if (b) b.focus(); }
  }
  function wzAvancar() {
    const w = S.wz, p = w.passos[w.i];
    if (p.tipo === 'texto' || p.tipo === 'area') { const v = ($('#wz-in').value || '').trim(); if (!v) { w.erro = 'Preencha para continuar.'; return renderWz(); } w.d[p.k] = v; }
    if (p.tipo === 'opcoes' && !w.d[p.k]) { w.erro = 'Escolha uma opção.'; return renderWz(); }
    if (p.tipo === 'sn' && !w.d.ans[p.k]) { w.erro = 'Escolha Sim, Não ou Não sei.'; return renderWz(); }
    w.erro = ''; if (w.i < w.passos.length - 1) w.i++; renderWz();
  }
  async function wzSalvar() {
    const w = S.wz, e = R.enquadrar(w.d.ans), env = $('#wz-enviar') && $('#wz-enviar').checked;
    if (!e.trilha) { w.erro = 'Responda todas as perguntas.'; return renderWz(); }
    const status = env && e.trilha !== 'Pendente' ? 'enviado' : 'rascunho';
    let ok;
    if (w.solId) {
      ok = await alterar(w.solId, s => { s.m1 = Object.assign({}, s.m1, { ans: w.d.ans, status, por: nomeAtual(), em: agora(), validador: '', validado_em: '', obs: '' }); if (s.m2 && s.m2.status === 'validado') s.m2.status = 'rascunho'; }, 'Enquadramento atualizado', 'Trilha ' + e.trilha + (status === 'enviado' ? '; enviado para validação' : ''));
      S.wz = null; renderWz(); if (ok) ir('sol/' + w.solId + '/m1');
    } else {
      const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      ok = await alterar(null, s => { Object.assign(s, { id, nome: w.d.nome, finalidade: w.d.finalidade, dono: w.d.dono, plataforma: w.d.plataforma, versao: 'v0.1', estagio: 'Alpha', criado_em: agora(), m1: { ans: w.d.ans, status, por: nomeAtual(), em: agora() }, m2: { cen: [], g: {}, status: 'rascunho' }, m3: {}, m4: {}, m5: {}, m6: [], hist: [], rev: 0 }); }, 'Cadastro e enquadramento', 'Trilha ' + e.trilha + (e.gatilhos.length ? ' (gatilhos ' + e.gatilhos.map(x => x.toUpperCase()).join(', ') + ')' : '') + (status === 'enviado' ? '; enviado para validação' : ''));
      S.wz = null; renderWz(); if (ok) ir('sol/' + id + '/m1');
    }
  }

  /* ---------- render ---------- */
  function render() {
    const r = rota();
    document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === (r.v === 'sol' ? 'painel' : r.v)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderWho(); renderStatus();
    let html;
    if (S.modo === 'carregando') html = '<div class="card empty"><h2>Carregando a base…</h2></div>';
    else if (r.v === 'sol') html = vSolucao(r.id, r.aba);
    else if (r.v === 'pendencias') html = vPendencias();
    else if (r.v === 'guia') html = vGuia();
    else html = vPainel();
    const foco = document.activeElement && document.activeElement.id;
    $('#main').innerHTML = html;
    if (foco && document.getElementById(foco) && /^(f-q)$/.test(foco)) { const el = document.getElementById(foco); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', async ev => {
    const tr = ev.target.closest('tr[data-href]');
    if (tr && !ev.target.closest('a,button')) { ir(tr.dataset.href); return; }
    const w = ev.target.closest('[data-wz]');
    if (w && S.wz) {
      const a = w.dataset.wz, W = S.wz, p = W.passos[W.i];
      if (a === 'sair') { S.wz = null; renderWz(); }
      else if (a === 'voltar') { W.erro = ''; if (W.i > 0) W.i--; renderWz(); }
      else if (a === 'prox') wzAvancar();
      else if (a === 'resp') { W.d.ans[p.k] = w.dataset.v; W.erro = ''; W.i++; renderWz(); }
      else if (a === 'opt') { W.d[p.k] = w.dataset.v; W.erro = ''; W.i++; renderWz(); }
      else if (a === 'ir') { W.i = W.passos.findIndex(x => x.k === w.dataset.k); renderWz(); }
      else if (a === 'salvar') wzSalvar();
      return;
    }
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const r = rota(), s = r.id && getSol(r.id), act = b.dataset.act;
    if (act === 'aba') { ir('sol/' + r.id + '/' + b.dataset.aba); return; }
    if (act === 'recarregar') { await carregar(); render(); toast('Dados atualizados.'); return; }
    if (act === 'nova') { abrirWizard(null); return; }
    if (act === 'editar-m1') { abrirWizard(s); return; }
    if (act === 'seed') {
      const novos = window.Seed();
      let n = 0;
      for (const x0 of novos) if (await alterar(null, x => { Object.assign(x, x0); }, 'Registro de demonstração carregado', 'Dados fictícios para teste', true)) n++;
      toast(n + ' soluções de demonstração carregadas.', 'ok'); ir('painel'); render(); return;
    }
    if (act === 'enviar-m1') { await alterar(s.id, x => { x.m1.status = 'enviado'; x.m1.por = nomeAtual(); x.m1.em = agora(); }, 'Enquadramento enviado para validação', 'Trilha ' + trilha(s)); return; }
    if (act === 'add-cen' || act === 'del-cen') {
      const form = b.closest('form'), m = lerM2(form);
      if (act === 'add-cen') m.cen.push({ d: '', i: 2, p: 2 }); else m.cen.splice(Number(b.dataset.i), 1);
      const i = S.sols.findIndex(x => x.id === s.id); S.sols[i] = Object.assign(clone(s), { m2: Object.assign({}, s.m2, m) });
      render(); S.sols[i] = s; return; // rascunho visual; grava ao salvar
    }
    if (act === 'encaminhar-m5') { const der = R.criteriosDerivados(s), sit = R.situacaoControles(s); await alterar(s.id, () => {}, 'Revisão concluída e encaminhada para a decisão', sit.confirmados + ' confirmados, ' + sit.divergentes + ' divergentes; C2 = ' + der.c2 + ', C4 = ' + der.c4); ir('sol/' + s.id + '/m5'); return; }
    if (act === 'ciencia') { await alterar(s.id, x => { const m = x.m6.find(y => y.id === b.dataset.m); m.ciencia = { por: nomeAtual(), em: agora() }; }, 'Ciência da mudança registrada', 'Mudança ' + b.dataset.m); return; }
    if (act === 'copiar') { const el = document.getElementById(b.dataset.alvo); try { await navigator.clipboard.writeText(el.textContent); toast('Copiado.'); } catch (e) { toast('Não foi possível copiar; selecione o texto manualmente.', 'erro'); } return; }
    if (act === 'baixar-md' || act === 'baixar-json') {
      const md = act === 'baixar-md', blob = new Blob([md ? governanceMd(s) : JSON.stringify(s, null, 2)], { type: md ? 'text/markdown' : 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (s.nome || 'solucao').replace(/\W+/g, '_') + (md ? '_GOVERNANCE.md' : '.json'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
  });

  document.addEventListener('submit', async ev => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const r = rota(), s = getSol(r.id), f = new FormData(form), kind = form.dataset.form;
    const dec = ev.submitter && ev.submitter.value;
    const txt = k => (f.get(k) || '').toString().trim();
    if (kind === 'lacuna') return alterar(s.id, x => { x.m1.lacuna = txt('lacuna'); }, 'Lacuna do enquadramento registrada', txt('lacuna'));
    if (kind === 'validar-m1' || kind === 'validar-m2') {
      const m = kind === 'validar-m1' ? 'm1' : 'm2', nome = m === 'm1' ? 'Enquadramento' : 'Risco';
      if (dec === 'devolver') { if (!txt('obs')) return toast('Escreva a observação para devolver.', 'erro'); return alterar(s.id, x => { x[m].status = 'devolvido'; x[m].obs = txt('obs'); }, nome + ' devolvido ao delivery team', txt('obs')); }
      return alterar(s.id, x => { if (m === 'm1' && R.enquadrar(x.m1.ans).trilha === 'Pendente') return 'Enquadramento pendente não pode ser validado.'; x[m].status = 'validado'; x[m].validador = nomeAtual(); x[m].validado_em = agora(); x[m].obs = txt('obs'); }, nome + ' validado', m === 'm1' ? 'Trilha ' + trilha(s) : (R.risco(s).idx ? R.NV[R.risco(s).idx] + ' · tier ' + R.risco(s).tier : ''));
    }
    if (kind === 'm2') {
      const m = lerM2(form);
      if (!m.corp && !m.cen.some(c => c.d)) return toast('Descreva ao menos um cenário de falha ou importe o tier corporativo.', 'erro');
      m.cen = m.cen.filter(c => c.d);
      const env = dec === 'enviar';
      return alterar(s.id, x => { x.m2 = Object.assign({}, x.m2, m, { status: env ? 'enviado' : 'rascunho', por: nomeAtual(), em: agora(), obs: '' }); }, env ? 'Risco enviado para validação' : 'Rascunho do risco salvo', x => { const rr = R.risco(x); return rr.idx ? R.NV[rr.idx] + ' · tier ' + rr.tier : ''; });
    }
    if (kind === 'g1') return alterar(s.id, x => { const g = R.podeGate1(x); if (!g.ok) return g.motivos[0]; x.estagio = 'Beta'; x.gate1 = { por: nomeAtual(), em: agora(), obs: txt('obs') }; }, 'Gate 1: Alpha → Beta', txt('obs'));
    if (kind === 'm3') {
      const id = form.dataset.ctrl, d = { estado: txt('estado'), evidencia: txt('evidencia'), descricao: txt('descricao'), just: txt('just') };
      const err = R.erroDeclaracao(d); if (err) return toast(err, 'erro');
      const c = R.CT.find(x => x.id === id);
      return alterar(s.id, x => { const prev = (x.m3 || {})[id]; x.m3 = x.m3 || {}; x.m3[id] = Object.assign(d, { por: nomeAtual(), em: agora(), rev: ((prev && prev.rev) || 0) + 1 }); }, 'Controle declarado', c.t + ': ' + R.DECL[d.estado]);
    }
    if (kind === 'm4') {
      const id = form.dataset.ctrl, rv = { res: txt('res'), amostra: txt('amostra'), resultado: txt('resultado'), just: txt('just') };
      const err = R.erroRevisao(rv); if (err) return toast(err, 'erro');
      const c = R.CT.find(x => x.id === id);
      return alterar(s.id, x => { const d = x.m3[id]; if (!d) return 'Controle sem declaração.'; x.m4 = x.m4 || {}; x.m4[id] = Object.assign(rv, { revisor: nomeAtual(), em: agora(), declRev: d.rev }); }, 'Evidência revisada', c.t + ': ' + R.REV[rv.res] + (R.CORRESP[s.m3[id].estado] !== rv.res ? ' (diverge da declaração)' : ''));
    }
    if (kind === 'm5') {
      const prop = { c: [0, 1, 2, 3, 4, 5, 6].map(i => Number(f.get('c' + i))), e1: !!f.get('e1'), e5: !!f.get('e5'), lim: txt('lim'), cond: txt('cond'), just: txt('just') };
      const calc = R.decidir(s, prop); if (calc.erro) return toast(calc.erro, 'erro');
      if (calc.rank >= 3 && !prop.just) return toast('Justificativa obrigatória para ' + calc.cond.toLowerCase() + '.', 'erro');
      return alterar(s.id, x => { x.m5 = x.m5 || {}; x.m5.proposta = Object.assign(prop, { por: nomeAtual(), em: agora(), calc }); }, 'Proposta de decisão enviada', calc.cond + ' · máximo ' + calc.max + ' · exige ' + calc.aceite);
    }
    if (kind === 'aceite') {
      const prop = s.m5.proposta;
      if (dec === 'devolver') { if (!txt('obs')) return toast('Escreva a observação para devolver.', 'erro'); return alterar(s.id, x => { x.m5.proposta.devolvida = { obs: txt('obs'), por: nomeAtual(), em: agora() }; }, 'Proposta devolvida à Audit Solutions', txt('obs')); }
      if (Number(S.perfil.nivel) < prop.calc.nivel) return toast('Sua autoridade não alcança o nível exigido.', 'erro');
      return alterar(s.id, x => {
        const calc = R.decidir(x, prop); if (calc.erro) return calc.erro;
        const em = agora(), antes = x.estagio;
        x.m5.anteriores = (x.m5.anteriores || []).concat(x.m5.decisao ? [x.m5.decisao] : []);
        x.m5.decisao = Object.assign({}, calc, { lim: prop.lim, condicoes: prop.cond, just: prop.just, propostaPor: prop.por, propostaEm: prop.em, aceitePor: nomeAtual(), aceitePapel: R.AUTORIDADE[S.perfil.nivel], em, validade: calc.validadeMeses ? R.addMeses(em, calc.validadeMeses) : null, obs: txt('obs') });
        x.m5.proposta = null;
        x.estagio = R.estagioAposDecisao(x.estagio, calc.max, x.estagioAntesSuspensao);
        x._rebaixou = antes !== x.estagio ? antes + ' → ' + x.estagio : '';
      }, 'Decisão de uso aceita', x => { const d = x.m5.decisao, t = d.cond + ' · máximo ' + d.max + (d.validade ? ' · validade ' + fd(d.validade) : '') + (x._rebaixou ? ' · selo ajustado: ' + x._rebaixou : ''); delete x._rebaixou; return t; });
    }
    if (kind === 'suspender') {
      if (!txt('just')) return toast('Justifique a suspensão.', 'erro');
      return alterar(s.id, x => { const em = agora(); x.m5.anteriores = (x.m5.anteriores || []).concat(x.m5.decisao ? [x.m5.decisao] : []); x.m5.decisao = { cond: 'Suspenso', rank: 5, max: 'Nenhum', inh: R.risco(x).idx, res: R.risco(x).idx, mit: '—', motivos: ['E5: ' + txt('just')], aceitePor: nomeAtual(), aceitePapel: 'Audit Solutions (suspensão imediata)', em, validade: null }; x.estagioAntesSuspensao = x.estagio; x.estagio = 'Suspensa'; }, 'Uso suspenso', txt('just'));
    }
    if (kind === 'g2') return alterar(s.id, x => { const g = R.podeGate2(x); if (!g.ok) return g.motivos[0]; x.estagio = 'Live'; x.gate2 = { por: nomeAtual(), em: agora(), obs: txt('obs') }; }, 'Gate 2: Beta → Live', txt('obs'));
    if (kind === 'm6') {
      const m = lerM6(form), res = R.materialidade(m);
      if (!m.ver || !m.desc) return toast('Informe a versão e o que muda.', 'erro');
      return alterar(s.id, x => {
        const reg = Object.assign({ id: 'm' + Date.now().toString(36) }, m, res, { por: nomeAtual(), em: agora(), ciencia: null });
        x.m6 = (x.m6 || []).concat([reg]); x.versao = m.ver;
        if (res.lv === 'Alta') {
          if (x.m5 && x.m5.decisao) { x.m5.decisao.invalidada = true; x.m5.decisao.motivoInvalidacao = 'Mudança Alta ' + m.ver; }
          Object.keys(x.m3 || {}).forEach(k => { x.m3[k].rev = (x.m3[k].rev || 0) + 1; }); // reabre a revisão de todos os itens
        }
      }, 'Mudança registrada', m.ver + ': materialidade ' + res.lv + (res.mats.length ? '; revisar ' + res.mats.join(', ') : '') + (res.lv === 'Alta' ? '; aceite invalidado e evidências reabertas para revisão' : ''));
    }
    if (kind === 'enc') return alterar(s.id, x => { x.estagio = 'Encerrada'; x.enc = { motivo: txt('motivo'), por: nomeAtual(), em: agora() }; }, 'Encerramento registrado', txt('motivo'));
  });

  document.addEventListener('input', ev => {
    const fl = ev.target.closest('[data-filtro]');
    if (fl) { S.filtro[fl.dataset.filtro] = fl.value; render(); return; }
    const form = ev.target.closest('form[data-live]');
    if (!form) return;
    const s = getSol(rota().id), out = form.querySelector('[data-preview]');
    if (!s || !out) return;
    if (form.dataset.live === 'm2') out.innerHTML = prevM2(R.risco(Object.assign({}, s, { m2: lerM2(form) })));
    if (form.dataset.live === 'm5') { const f = new FormData(form); out.innerHTML = resultadoM5(R.decidir(s, { c: [0, 1, 2, 3, 4, 5, 6].map(i => Number(f.get('c' + i))), e1: !!f.get('e1'), e5: !!f.get('e5') })); }
    if (form.dataset.live === 'm6') out.innerHTML = prevM6(R.materialidade(lerM6(form)));
  });
  document.addEventListener('change', ev => {
    const el = ev.target.closest('[data-perfil]');
    if (el) {
      const k = el.dataset.perfil;
      if (k === 'papel') S.perfil.papel = el.value;
      else if (k === 'nivel') S.perfil.nivel = Number(el.value);
      else if (k === 'nome') { S.perfil.nomes = S.perfil.nomes || {}; S.perfil.nomes[papel()] = el.value.trim() || PAPEIS[papel()].nome; }
      lsSet(LS_PERFIL, S.perfil); render(); return;
    }
    if (ev.target.closest('form[data-live]')) ev.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.addEventListener('keydown', ev => {
    if (!S.wz) return;
    const p = S.wz.passos[S.wz.i];
    if (ev.key === 'Escape') { S.wz = null; renderWz(); return; }
    if (p.tipo === 'sn' && !ev.ctrlKey && !ev.metaKey) {
      const k = ev.key.toLowerCase(), v = k === 's' ? 's' : k === 'n' ? 'n' : k === '?' ? '?' : null;
      if (v) { ev.preventDefault(); S.wz.d.ans[p.k] = v; S.wz.erro = ''; S.wz.i++; renderWz(); return; }
    }
    if (ev.key === 'Enter' && !ev.shiftKey && p.tipo !== 'fim' && !(ev.target.tagName === 'BUTTON')) { ev.preventDefault(); wzAvancar(); }
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  /* ---------- início ---------- */
  render();
  carregar().then(render);
  setInterval(async () => {
    if (S.modo !== 'remoto' || S.wz || S.salvando || document.hidden) return;
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('main')) return;
    const antes = JSON.stringify(S.sols.map(s => [s.id, s.rev]));
    await carregar(true);
    if (JSON.stringify(S.sols.map(s => [s.id, s.rev])) !== antes) render();
  }, 45000);
})();
