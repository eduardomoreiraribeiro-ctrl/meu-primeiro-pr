window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.dashboard = (function () {
  const FILTRO_KEY = 'nutridudu:dashboard-periodo';
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Lembra o período escolhido neste navegador (só conveniência).
  function lerFiltro() {
    try {
      const salvo = JSON.parse(localStorage.getItem(FILTRO_KEY));
      if (salvo && NutriDudu.indicadores.PERIODOS[salvo.preset]) return salvo;
    } catch (erro) {
      // Sem armazenamento: usa o padrão.
    }
    return { preset: 'mes', de: null, ate: null };
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

  function filtrosHtml(filtro, periodo) {
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

    return `
      <div class="filtros" role="group" aria-label="Período">
        <div class="segmentos">${botoes}</div>
        ${personalizado}
        <span class="muted small">${utils.escapeHtml(descreverPeriodo(periodo))}</span>
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

  async function render(container) {
    const { store, ui, utils, indicadores } = NutriDudu;
    const filtro = lerFiltro();
    const periodo = indicadores.intervalo(filtro.preset, filtro.de, filtro.ate);

    const [pessoas, consultas, lancamentos, servicos] = await Promise.all([
      store.list('pessoas'),
      store.list('consultas'),
      store.list('lancamentos'),
      store.list('servicos'),
    ]);
    const r = indicadores.calcular({ pessoas, consultas, lancamentos, servicos }, periodo);
    const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

    const conversao = r.conversao.taxa === null ? '—' : `${Math.round(r.conversao.taxa * 100)}%`;
    const detalheConversao = r.conversao.leads
      ? `${r.conversao.convertidos} de ${r.conversao.leads} leads do período viraram clientes`
      : 'nenhum lead novo no período';

    // Segunda a sábado sempre; domingo só se houver movimento.
    const ordemDias = [1, 2, 3, 4, 5, 6, ...(r.porDiaSemana[0] ? [0] : [])];
    const dias = ordemDias.map((d) => ({
      nome: NutriDudu.config.DIAS_SEMANA[d], curto: DIAS_CURTOS[d], qtd: r.porDiaSemana[d],
    }));

    const hojeExtenso = utils.diaPorExtenso(new Date());

    container.innerHTML = `
      ${ui.cabecalho('Dashboard', 'Visão geral da operação da clínica')}
      ${filtrosHtml(filtro, periodo)}

      <section class="kpi-grid">
        ${ui.kpi('Clientes novos', String(r.clientesNovos), 'fecharam no período')}
        ${ui.kpi('Atendimentos', String(r.atendimentos), r.atendimentosPrevistos ? `realizados · + ${r.atendimentosPrevistos} agendados` : 'realizados')}
        ${ui.kpi('Faturamento estimado', utils.moeda(r.faturamentoEstimado), `${utils.moeda(r.recebido)} já recebido`)}
        ${ui.kpi('Conversão de leads', conversao, detalheConversao)}
      </section>

      <div class="dash-grid">
        <section class="card">
          <h2 class="card-title">Agendamentos de hoje</h2>
          <p class="muted small card-sub">${utils.escapeHtml(hojeExtenso)}</p>
          ${agendaDeHojeHtml(consultas, porId(pessoas), porId(servicos))}
        </section>

        <section class="card">
          <h2 class="card-title">Leads por etapa do Kanban</h2>
          <p class="muted small card-sub">Funil comercial · situação atual</p>
          ${ui.barras(r.porEtapa.map((e) => ({ ...e, apagado: e.id === 'perdido' })), { unidade: ['lead', 'leads'], vazio: 'Nenhum lead no funil.' })}
        </section>

        <section class="card">
          <h2 class="card-title">Serviços e planos mais realizados</h2>
          <p class="muted small card-sub">Atendimentos realizados no período</p>
          ${ui.barras(r.porServico.slice(0, 6), { unidade: ['atendimento', 'atendimentos'], vazio: 'Nenhum atendimento realizado no período.' })}
        </section>

        <section class="card">
          <h2 class="card-title">Origem dos leads</h2>
          <p class="muted small card-sub">Leads que chegaram no período</p>
          ${ui.barras(r.porOrigem, { unidade: ['lead', 'leads'], vazio: 'Nenhum lead novo no período.' })}
        </section>

        <section class="card dash-largo">
          <h2 class="card-title">Dias mais movimentados da semana</h2>
          <p class="muted small card-sub">Atendimentos realizados e agendados no período, por dia da semana</p>
          ${ui.colunas(dias, { unidade: ['atendimento', 'atendimentos'], vazio: 'Nenhum atendimento no período.' })}
        </section>
      </div>

      ${ui.emBreve(7, [
        'Filtro por profissional (quando houver mais de uma nutricionista)',
        'Ocupação da agenda, ticket médio, taxa de faltas, renovação de pacotes e taxa de retorno',
        'Faturamento mês a mês e clientes que mais indicaram',
        'Listas de ação: retornos pendentes, pagamentos atrasados, pacotes acabando, aniversariantes, leads parados',
      ])}
    `;

    // Filtros: mudam o período e redesenham a página.
    container.querySelectorAll('[data-periodo]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const preset = botao.dataset.periodo;
        const novo = preset === 'personalizado'
          ? { preset, de: utils.isoDia(periodo.inicio), ate: utils.isoDia(new Date(periodo.fim.getTime() - 1)) }
          : { preset, de: null, ate: null };
        salvarFiltro(novo);
        NutriDudu.recarregarPagina();
      });
    });
    container.querySelectorAll('#filtro-de, #filtro-ate').forEach((campo) => {
      campo.addEventListener('change', () => {
        // A página já foi movida para a tela: busca os campos no documento.
        const de = document.getElementById('filtro-de').value;
        const ate = document.getElementById('filtro-ate').value;
        if (!de || !ate) return;
        salvarFiltro({ preset: 'personalizado', de, ate });
        NutriDudu.recarregarPagina();
      });
    });
  }

  return { titulo: 'Dashboard', render };
})();
