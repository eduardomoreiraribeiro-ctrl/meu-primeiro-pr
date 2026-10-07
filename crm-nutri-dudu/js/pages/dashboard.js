window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.dashboard = (function () {
  const FILTRO_KEY = 'nutridudu:dashboard-periodo';
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const LIMITE_LISTA = 6;

  // Lembra o período (e o profissional) escolhido neste navegador (só conveniência).
  function lerFiltro() {
    try {
      const salvo = JSON.parse(localStorage.getItem(FILTRO_KEY));
      if (salvo && NutriDudu.indicadores.PERIODOS[salvo.preset]) return { profissionalId: '', ...salvo };
    } catch (erro) {
      // Sem armazenamento: usa o padrão.
    }
    return { preset: 'mes', de: null, ate: null, profissionalId: '' };
  }

  function salvarFiltro(filtro) {
    try {
      localStorage.setItem(FILTRO_KEY, JSON.stringify(filtro));
    } catch (erro) {
      // Só não lembra na próxima visita.
    }
  }

  function descreverPeriodo(periodo) {
    const { data } = NutriDudu.utils;
    const ultimoDia = new Date(periodo.fim);
    ultimoDia.setDate(ultimoDia.getDate() - 1);
    const de = data(periodo.inicio);
    const ate = data(ultimoDia);
    return de === ate ? de : `${de} a ${ate}`;
  }

  const pct = (taxa) => (taxa === null ? '—' : `${Math.round(taxa * 100)}%`);

  function filtrosHtml(filtro, periodo, profissionais) {
    const { indicadores, utils } = NutriDudu;
    const botoes = Object.entries(indicadores.PERIODOS).map(([id, nome]) => `
      <button type="button" class="segmento${filtro.preset === id ? ' ativo' : ''}" data-periodo="${id}" aria-pressed="${filtro.preset === id}">
        ${utils.escapeHtml(nome)}
      </button>`).join('');

    const personalizado = filtro.preset === 'personalizado' ? `
      <div class="datas">
        <label>De <input type="date" id="filtro-de" value="${utils.isoDia(periodo.inicio)}"></label>
        <label>até <input type="date" id="filtro-ate" value="${utils.isoDia(new Date(periodo.fim.getTime() - 1))}"></label>
      </div>` : '';

    // O filtro de profissional só aparece quando há mais de uma.
    const prof = profissionais.length > 1 ? `
      <select data-filtro-profissional aria-label="Profissional">
        <option value="">Todos os profissionais</option>
        ${profissionais.map((p) => `<option value="${p.id}"${p.id === filtro.profissionalId ? ' selected' : ''}>${utils.escapeHtml(p.nome)}</option>`).join('')}
      </select>` : '';

    return `
      <div class="filtros" role="group" aria-label="Filtros do Dashboard">
        <div class="segmentos">${botoes}</div>
        ${personalizado}
        ${prof}
        <span class="muted small">${utils.escapeHtml(descreverPeriodo(periodo))}</span>
      </div>`;
  }

  // ---------------- Listas de ação ----------------

  const linkPessoa = (p) => `<a href="#/clientes/${encodeURIComponent(p.id)}">${NutriDudu.utils.escapeHtml(p.nome)}</a>`;
  const whatsapp = (p) => `<a class="btn btn-pequeno" href="https://wa.me/55${NutriDudu.utils.soDigitos(p.telefone)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${NutriDudu.utils.escapeHtml(p.nome)}">WhatsApp</a>`;

  /** Cartão de lista de ação: título com contador, itens (até LIMITE_LISTA) e "ver todos". */
  function cartaoAcao({ id, titulo, sub, itens, vazio, verTodos }) {
    const { utils } = NutriDudu;
    const visiveis = itens.slice(0, LIMITE_LISTA);
    return `
      <section class="card acao" data-lista="${id}">
        <div class="secao-cabecalho">
          <h2 class="card-title">${utils.escapeHtml(titulo)}</h2>
          <span class="contador${itens.length ? ' tem' : ''}">${itens.length}</span>
        </div>
        ${sub ? `<p class="muted small card-sub">${utils.escapeHtml(sub)}</p>` : ''}
        ${itens.length ? `<ul class="lista-acao">${visiveis.join('')}</ul>` : `<p class="tudo-certo">✓ ${utils.escapeHtml(vazio)}</p>`}
        ${itens.length > LIMITE_LISTA && verTodos ? `<a class="small ver-todos" href="${verTodos}">Ver todos (${itens.length})</a>` : ''}
        ${itens.length > LIMITE_LISTA && !verTodos ? `<p class="small muted">+ ${itens.length - LIMITE_LISTA} não mostrados</p>` : ''}
      </section>`;
  }

  const itemAcao = (principal, detalhe, botoes) => `
    <li>
      <span class="item-acao-texto">${principal}<span class="muted small bloco">${detalhe}</span></span>
      <span class="item-acao-botoes">${botoes}</span>
    </li>`;

  function listasDeAcao(d) {
    const { utils, ui, calculos, alertas, permissoes, config } = NutriDudu;
    const agora = new Date();
    const hoje = utils.inicioDoDia(agora);
    const pessoa = d.pessoaPorId;
    const servico = d.servicoPorId;

    // 1. Retornos pendentes (alertas de retorno e recorrência).
    const retornos = alertas.todos({ pessoas: d.pessoas, consultas: d.consultas, pacotes: d.pacotes, geral: d.geral }, agora)
      .filter((x) => x.alerta.tipo !== 'pacote_atrasado')
      .map(({ pessoa: p, alerta: a }) => itemAcao(
        `${linkPessoa(p)} ${ui.badge(a.nome, a.variante)}`,
        utils.escapeHtml(a.texto),
        `<button type="button" class="btn btn-pequeno btn-primary" data-agendar="${p.id}">Agendar</button>
         ${whatsapp(p)}
         ${a.tipo === 'sumido' ? `<button type="button" class="btn btn-pequeno" data-inativar="${p.id}">Marcar inativo</button>` : ''}
         <button type="button" class="btn btn-pequeno" data-dispensar="${p.id}" data-tipo="${a.tipo}">Dispensar</button>`,
      ));

    // 2. Consultas a confirmar: ainda "agendada", de agora até o fim de amanhã.
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + 2);
    const aConfirmar = d.consultas
      .filter((c) => c.status === 'agendada' && new Date(c.inicio) >= agora && new Date(c.inicio) < limite && pessoa[c.pessoaId])
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((c) => itemAcao(
        `${linkPessoa(pessoa[c.pessoaId])}`,
        `${utils.isoDia(c.inicio) === utils.isoDia(agora) ? 'Hoje' : 'Amanhã'} às ${utils.hora(c.inicio)} · ${utils.escapeHtml(servico[c.servicoId]?.nome || '')}${c.agendadaPor === 'agente' ? ' · 🤖' : ''}`,
        `<button type="button" class="btn btn-pequeno btn-primary" data-confirmar="${c.id}">Confirmar</button> ${whatsapp(pessoa[c.pessoaId])}`,
      ));

    // 3. Pagamentos atrasados.
    const podeReceber = permissoes.pode('darBaixaPagamento');
    const atrasados = d.lancamentos
      .filter((l) => calculos.lancamentoAtrasado(l, agora) && pessoa[l.pessoaId])
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .map((l) => itemAcao(
        `${linkPessoa(pessoa[l.pessoaId])} <strong class="texto-perigo">${utils.moeda(calculos.valorLiquido(l))}</strong>`,
        `${utils.escapeHtml(l.descricao)} · venceu ${utils.haDias(utils.diasEntre(l.vencimento, agora))} (${utils.data(l.vencimento)})`,
        `${podeReceber ? `<button type="button" class="btn btn-pequeno btn-primary" data-receber="${l.id}">Receber</button>` : ''} ${whatsapp(pessoa[l.pessoaId])}`,
      ));

    // 4. Pacotes acabando, vencendo, vencidos sem renovar ou atrasados no ritmo.
    const pacotesAtencao = [];
    d.pessoas.filter((p) => p.status === 'ativo').forEach((p) => {
      const deles = d.pacotesDe(p.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
      const ultimo = deles[0];
      if (!ultimo) return;
      const status = calculos.statusPacote(ultimo, agora);
      const nome = servico[ultimo.servicoId]?.nome || 'Pacote';
      const motivos = [];
      if (status === 'ativo') {
        const uso = calculos.usoDoPacote(ultimo, d.consultasDe(p.id).filter((c) => c.pacoteId === ultimo.id));
        const dias = utils.diasEntre(agora, ultimo.validade);
        if (uso.saldo <= 1) motivos.push(uso.saldo ? 'resta 1 consulta' : 'sem saldo');
        if (dias <= 15) motivos.push(`vence em ${utils.dias(dias)}`);
        const ritmo = calculos.ritmoPacote(ultimo, uso, agora);
        if (ritmo?.atrasadas) motivos.push(`${ritmo.atrasadas} consulta(s) atrasada(s) no ritmo`);
      } else if (['vencido', 'concluido'].includes(status) && utils.diasEntre(ultimo.validade, agora) <= 60) {
        motivos.push(status === 'vencido' ? `venceu em ${utils.data(ultimo.validade)}` : 'concluído, sem renovação');
      }
      if (motivos.length) {
        pacotesAtencao.push(itemAcao(
          `${linkPessoa(p)} <span class="small">${utils.escapeHtml(nome)}</span>`,
          utils.escapeHtml(motivos.join(' · ')),
          `<button type="button" class="btn btn-pequeno btn-primary" data-renovar="${ultimo.id}">Renovar</button> ${whatsapp(p)}`,
        ));
      }
    });

    // 5. Leads parados há mais de X dias na mesma etapa.
    const diasParado = alertas.regras(d.geral).diasLeadParado;
    const parados = d.pessoas
      .filter((p) => p.funil === 'comercial' && ['novo', 'contato', 'agendada', 'proposta'].includes(p.etapa))
      .map((p) => ({ p, dias: utils.diasEntre(p.etapaDesde || p.criadoEm, agora) }))
      .filter((x) => x.dias > diasParado)
      .sort((a, b) => b.dias - a.dias)
      .map(({ p, dias }) => itemAcao(
        linkPessoa(p),
        `${utils.escapeHtml(NutriDudu.funil.nomeEtapa('comercial', p.etapa))} há ${utils.dias(dias)} · ${utils.escapeHtml(config.ORIGENS[p.origem] || '')}`,
        `<a class="btn btn-pequeno" href="#/kanban/comercial">Kanban</a> ${whatsapp(p)}`,
      ));

    // 6. Aniversariantes dos próximos 7 dias (clientes ativos e leads em aberto).
    const aniversariantes = d.pessoas
      .filter((p) => p.dataNascimento && p.status !== 'inativo' && p.etapa !== 'perdido')
      .map((p) => {
        const nasc = utils.paraData(p.dataNascimento);
        let prox = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
        if (prox < hoje) prox = new Date(hoje.getFullYear() + 1, nasc.getMonth(), nasc.getDate());
        return { p, prox, em: utils.diasEntre(hoje, prox), idade: prox.getFullYear() - nasc.getFullYear() };
      })
      .filter((x) => x.em <= 6)
      .sort((a, b) => a.em - b.em)
      .map(({ p, prox, em, idade }) => itemAcao(
        `${linkPessoa(p)}${em === 0 ? ' 🎉' : ''}`,
        `${em === 0 ? 'Hoje' : em === 1 ? 'Amanhã' : utils.diaPorExtenso(prox).split(',')[0]} · ${utils.data(prox).slice(0, 5)} · faz ${idade} anos`,
        whatsapp(p),
      ));

    return `
      <div class="grid-acoes">
        ${cartaoAcao({ id: 'retornos', titulo: 'Retornos pendentes', sub: 'Clientes sem próximo passo: sem retorno, faltas sem remarcar, sumidos', itens: retornos, vazio: 'Todos os clientes ativos têm próximo passo.', verTodos: '#/clientes' })}
        ${cartaoAcao({ id: 'confirmar', titulo: 'Consultas a confirmar', sub: 'Hoje e amanhã, ainda não confirmadas', itens: aConfirmar, vazio: 'Nada para confirmar até amanhã.' })}
        ${cartaoAcao({ id: 'atrasados', titulo: 'Pagamentos atrasados', sub: 'Do mais antigo para o mais recente', itens: atrasados, vazio: 'Nenhum pagamento atrasado.' })}
        ${cartaoAcao({ id: 'pacotes', titulo: 'Pacotes para renovar', sub: 'Acabando, vencendo em até 15 dias, vencidos ou atrasados no ritmo', itens: pacotesAtencao, vazio: 'Nenhum pacote pedindo atenção.' })}
        ${cartaoAcao({ id: 'parados', titulo: 'Leads parados', sub: `Há mais de ${diasParado} dias na mesma etapa do funil comercial`, itens: parados, vazio: 'Nenhum lead parado.' })}
        ${cartaoAcao({ id: 'aniversarios', titulo: 'Aniversariantes da semana', sub: 'Próximos 7 dias', itens: aniversariantes, vazio: 'Nenhum aniversário nos próximos 7 dias.' })}
      </div>`;
  }

  function agendaDeHojeHtml(consultas, pessoaPorId, servicoPorId) {
    const { ui, utils } = NutriDudu;
    const hoje = utils.isoDia(new Date());
    const doDia = consultas
      .filter((c) => c.status !== 'cancelada' && utils.isoDia(c.inicio) === hoje)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    if (!doDia.length) return ui.vazio('Nenhum agendamento para hoje.');
    return `
      <ul class="lista-simples">
        ${doDia.map((c) => `
          <li>
            <span class="hora">${utils.hora(c.inicio)}</span>
            <span class="agenda-info">
              <a href="#/clientes/${encodeURIComponent(c.pessoaId)}">${utils.escapeHtml(pessoaPorId[c.pessoaId]?.nome || 'Cliente')}</a>
              <span class="muted small">${utils.escapeHtml(servicoPorId[c.servicoId]?.nome || '')}${c.agendadaPor === 'agente' ? ' · 🤖 agendada pelo agente' : ''}</span>
            </span>
            ${ui.statusConsulta(c.status)}
          </li>`).join('')}
      </ul>`;
  }

  function origemTabela(porOrigem) {
    const { utils } = NutriDudu;
    const total = porOrigem.reduce((t, o) => t + o.qtd, 0);
    if (!total) return NutriDudu.ui.vazio('Nenhum lead novo no período.');
    return `
      ${NutriDudu.ui.barras(porOrigem, { unidade: ['lead', 'leads'] })}
      <table class="tabela-mini">
        <thead><tr><th scope="col">Origem</th><th scope="col" class="num">Leads</th><th scope="col" class="num">Viraram clientes</th><th scope="col" class="num">Conversão</th></tr></thead>
        <tbody>
          ${porOrigem.filter((o) => o.qtd).map((o) => `
            <tr><td>${utils.escapeHtml(o.nome)}</td><td class="num">${o.qtd}</td><td class="num">${o.convertidos}</td><td class="num">${pct(o.convertidos / o.qtd)}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ---------------- Página ----------------

  async function render(container) {
    const { store, ui, utils, indicadores, calculos, agenda } = NutriDudu;
    const filtro = lerFiltro();
    const periodo = indicadores.intervalo(filtro.preset, filtro.de, filtro.ate);

    const [todasPessoas, todasConsultas, todosLancamentos, servicos, pacotes, profissionais, horarios, bloqueios, geral] = await Promise.all([
      store.list('pessoas'),
      store.list('consultas'),
      store.list('lancamentos'),
      store.list('servicos'),
      store.list('pacotes'),
      store.list('profissionais', (p) => p.ativo),
      store.list('horarios'),
      store.list('bloqueios'),
      store.get('configuracoes', 'geral'),
    ]);

    // Filtro por profissional: pessoas (responsável), consultas e lançamentos dela.
    // O perfil Profissional vê sempre só os seus números (seção 2 do planejamento).
    const proprio = NutriDudu.permissoes.idProfissionalAtual();
    const profId = proprio || (profissionais.some((p) => p.id === filtro.profissionalId) ? filtro.profissionalId : '');
    const pessoas = profId ? todasPessoas.filter((p) => p.profissionalId === profId) : todasPessoas;
    const consultas = profId ? todasConsultas.filter((c) => c.profissionalId === profId) : todasConsultas;
    const lancamentos = profId ? todosLancamentos.filter((l) => l.profissionalId === profId || (!l.profissionalId && pessoas.some((p) => p.id === l.pessoaId))) : todosLancamentos;
    const idsPessoas = new Set(pessoas.map((p) => p.id));
    const pacotesFiltrados = pacotes.filter((p) => idsPessoas.has(p.pessoaId));

    const dados = { pessoas, consultas, lancamentos, servicos, pacotes: pacotesFiltrados, geral: geral || {} };
    const r = indicadores.calcular(dados, periodo);
    const cart = indicadores.carteira(dados);
    const meses = indicadores.faturamentoMensal(lancamentos);
    const indicaram = indicadores.quemMaisIndicou(todasPessoas);
    const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

    // Ocupação da agenda no período (horas marcadas ÷ horas disponíveis).
    const ultimoDia = new Date(periodo.fim.getTime() - 1);
    const ctxAgenda = { horarios, bloqueios, consultas: todasConsultas };
    const ocup = (profId ? profissionais.filter((p) => p.id === profId) : profissionais)
      .map((p) => agenda.ocupacao(p.id, periodo.inicio, ultimoDia, ctxAgenda))
      .reduce((t, o) => ({ disponivelMin: t.disponivelMin + o.disponivelMin, ocupadoMin: t.ocupadoMin + o.ocupadoMin }), { disponivelMin: 0, ocupadoMin: 0 });
    const taxaOcupacao = ocup.disponivelMin ? ocup.ocupadoMin / ocup.disponivelMin : null;

    const detalheConversao = r.conversao.leads
      ? `${r.conversao.convertidos} de ${r.conversao.leads} leads do período viraram clientes`
      : 'nenhum lead novo no período';

    // Segunda a sábado sempre; domingo só se houver movimento.
    const ordemDias = [1, 2, 3, 4, 5, 6, ...(r.porDiaSemana[0] ? [0] : [])];
    const dias = ordemDias.map((d) => ({
      nome: NutriDudu.config.DIAS_SEMANA[d], curto: DIAS_CURTOS[d], qtd: r.porDiaSemana[d],
    }));

    const horas = (min) => `${Math.round(min / 60)} h`;
    const hojeExtenso = utils.diaPorExtenso(new Date());

    container.innerHTML = `
      <div class="dashboard">
        ${ui.cabecalho('Dashboard', 'Visão geral da operação da clínica')}
        ${filtrosHtml({ ...filtro, profissionalId: profId }, periodo, proprio ? [] : profissionais)}
        ${proprio ? `<p class="muted small aviso-perfil">Mostrando só os seus números (${utils.escapeHtml(profissionais.find((p) => p.id === proprio)?.nome || 'você')}).</p>` : ''}

        <h2 class="titulo-secao">No período</h2>
        <section class="kpi-grid">
          ${ui.kpi('Clientes novos', String(r.clientesNovos), 'fecharam no período')}
          ${ui.kpi('Atendimentos', String(r.atendimentos), r.atendimentosPrevistos ? `realizados · + ${r.atendimentosPrevistos} agendados` : 'realizados')}
          ${ui.kpi('Faturamento estimado', utils.moeda(r.faturamentoEstimado), `${utils.moeda(r.recebido)} já recebido`)}
          ${ui.kpi('Conversão de leads', pct(r.conversao.taxa), detalheConversao)}
          ${ui.kpi('Ticket médio', r.ticketMedio === null ? '—' : utils.moeda(r.ticketMedio), r.pagamentos ? `${r.pagamentos} pagamento(s) recebido(s)` : 'nenhum pagamento recebido')}
          ${ui.kpi('Taxa de faltas', pct(r.faltas.taxa), r.faltas.base ? `${r.faltas.faltou} falta(s) em ${r.faltas.base} consultas` : 'nenhuma consulta passada')}
          ${ui.kpi('Ocupação da agenda', pct(taxaOcupacao), ocup.disponivelMin ? `${horas(ocup.ocupadoMin)} marcadas de ${horas(ocup.disponivelMin)} disponíveis` : 'sem horário de atendimento')}
          ${ui.kpi('Taxa de retorno', pct(r.retorno.taxa), r.retorno.devidos ? `${r.retorno.voltaram} de ${r.retorno.devidos} voltaram no prazo` : 'nenhum retorno vencendo no período')}
        </section>

        <h2 class="titulo-secao">Hoje</h2>
        <section class="kpi-grid">
          ${ui.kpi('Clientes ativos', String(cart.clientesAtivos), `${cart.leadsNoFunil} lead(s) em negociação`)}
          ${ui.kpi('A receber', utils.moeda(cart.aReceber), cart.atrasado ? `${utils.moeda(cart.atrasado)} atrasado` : 'nada atrasado')}
          ${ui.kpi('Pacotes ativos', String(cart.pacotesAtivos), cart.renovacao.terminados ? `renovação: ${pct(cart.renovacao.taxa)} (${cart.renovacao.renovados} de ${cart.renovacao.terminados})` : 'nenhum pacote terminado ainda')}
          ${ui.kpi('Agendamentos hoje', String(consultas.filter((c) => c.status !== 'cancelada' && utils.isoDia(c.inicio) === utils.isoDia(new Date())).length), hojeExtenso)}
        </section>

        <div class="dash-grid">
          <section class="card">
            <h2 class="card-title">Agendamentos de hoje</h2>
            <p class="muted small card-sub">${utils.escapeHtml(hojeExtenso)}</p>
            ${agendaDeHojeHtml(consultas, porId(todasPessoas), porId(servicos))}
          </section>

          <section class="card">
            <h2 class="card-title">Leads por etapa do Kanban</h2>
            <p class="muted small card-sub">Funil comercial · situação atual</p>
            ${ui.barras(r.porEtapa.map((e) => ({ ...e, apagado: e.id === 'perdido' })), { unidade: ['lead', 'leads'], vazio: 'Nenhum lead no funil.' })}
          </section>
        </div>

        <h2 class="titulo-secao">Precisa de atenção</h2>
        ${listasDeAcao({
          pessoas, consultas, lancamentos, pacotes: pacotesFiltrados, geral: geral || {},
          pessoaPorId: porId(todasPessoas), servicoPorId: porId(servicos),
          pacotesDe: calculos.agruparPorPessoa(pacotesFiltrados),
          consultasDe: calculos.agruparPorPessoa(consultas.filter((c) => c.status !== 'cancelada')),
        })}

        <h2 class="titulo-secao">Gráficos</h2>
        <div class="dash-grid">
          <section class="card dash-largo">
            <h2 class="card-title">Faturamento mês a mês</h2>
            <p class="muted small card-sub">Últimos 12 meses · cobranças com vencimento em cada mês (pagas e a receber); o mês atual em destaque</p>
            <div class="rolagem-x">
              ${ui.colunas(meses.map((m) => ({ ...m, destaque: m.atual })), {
                formatar: utils.moedaCurta, destacarMaior: false, vazio: 'Nenhum faturamento nos últimos 12 meses.',
                descrever: (m) => `${m.nome}: ${utils.moeda(m.qtd)} (${utils.moeda(m.recebido)} recebido)`,
              })}
            </div>
          </section>

          <section class="card">
            <h2 class="card-title">Serviços e planos mais realizados</h2>
            <p class="muted small card-sub">Atendimentos realizados no período</p>
            ${ui.barras(r.porServico.slice(0, 6), { unidade: ['atendimento', 'atendimentos'], vazio: 'Nenhum atendimento realizado no período.' })}
          </section>

          <section class="card">
            <h2 class="card-title">Origem dos leads e conversão</h2>
            <p class="muted small card-sub">Leads que chegaram no período</p>
            ${origemTabela(r.porOrigem)}
          </section>

          <section class="card">
            <h2 class="card-title">Clientes que mais indicaram</h2>
            <p class="muted small card-sub">Desde o início · quantas pessoas cada um indicou</p>
            ${ui.barras(indicaram, { unidade: ['indicação', 'indicações'], vazio: 'Nenhuma indicação registrada ainda.' })}
          </section>

          <section class="card">
            <h2 class="card-title">Dias mais movimentados da semana</h2>
            <p class="muted small card-sub">Atendimentos realizados e agendados no período</p>
            ${ui.colunas(dias, { unidade: ['atendimento', 'atendimentos'], vazio: 'Nenhum atendimento no período.' })}
          </section>
        </div>
      </div>
    `;

    const raiz = container.querySelector('.dashboard');

    // Filtros: mudam o período/profissional e redesenham a página.
    raiz.querySelectorAll('[data-periodo]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const preset = botao.dataset.periodo;
        const novo = preset === 'personalizado'
          ? { preset, de: utils.isoDia(periodo.inicio), ate: utils.isoDia(new Date(periodo.fim.getTime() - 1)) }
          : { preset, de: null, ate: null };
        salvarFiltro({ ...novo, profissionalId: profId });
        NutriDudu.recarregarPagina();
      });
    });
    raiz.querySelectorAll('#filtro-de, #filtro-ate').forEach((campo) => {
      campo.addEventListener('change', () => {
        const de = raiz.querySelector('#filtro-de').value;
        const ate = raiz.querySelector('#filtro-ate').value;
        if (!de || !ate) return;
        salvarFiltro({ preset: 'personalizado', de, ate, profissionalId: profId });
        NutriDudu.recarregarPagina();
      });
    });
    raiz.querySelector('[data-filtro-profissional]')?.addEventListener('change', (e) => {
      salvarFiltro({ ...filtro, profissionalId: e.target.value });
      NutriDudu.recarregarPagina();
    });

    // Botões das listas de ação.
    const pessoaPorId = porId(todasPessoas);
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const { agendar, dispensar, tipo, inativar, confirmar, receber, renovar } = b.dataset;
      if (agendar) NutriDudu.agendamento.abrir({ pessoaId: agendar });
      else if (dispensar) NutriDudu.alertas.dispensar(pessoaPorId[dispensar], tipo);
      else if (inativar) NutriDudu.funil.encerrar(pessoaPorId[inativar]);
      else if (confirmar) NutriDudu.agendamento.confirmar(todasConsultas.find((c) => c.id === confirmar));
      else if (receber) NutriDudu.financeiro.darBaixa(todosLancamentos.find((l) => l.id === receber));
      else if (renovar) {
        const pac = pacotes.find((p) => p.id === renovar);
        NutriDudu.financeiro.contratarPacote({ pessoa: pessoaPorId[pac.pessoaId], renovarDe: pac });
      }
    });
  }

  return { titulo: 'Dashboard', render };
})();
