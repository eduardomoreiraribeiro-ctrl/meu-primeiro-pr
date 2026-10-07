window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.dashboard = {
  titulo: 'Dashboard',

  async render(container) {
    const { store, ui, utils } = NutriDudu;
    const [pessoas, consultas, pacotes] = await Promise.all([
      store.list('pessoas'),
      store.list('consultas'),
      store.list('pacotes'),
    ]);

    const nomePorId = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));
    const hoje = utils.isoDia(new Date());
    const ativos = pessoas.filter((p) => p.status === 'ativo').length;
    const leadsAbertos = pessoas.filter(
      (p) => p.funil === 'comercial' && !['fechado', 'perdido'].includes(p.etapa)
    ).length;
    const deHoje = consultas
      .filter((c) => ['agendada', 'confirmada'].includes(c.status) && utils.isoDia(c.inicio) === hoje)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const pacotesAtivos = pacotes.filter((p) => p.status === 'ativo').length;

    container.innerHTML = `
      ${ui.cabecalho('Dashboard', 'Visão geral da operação da clínica')}
      <section class="kpi-grid">
        ${ui.kpi('Clientes ativos', String(ativos))}
        ${ui.kpi('Leads em aberto', String(leadsAbertos), 'no funil comercial')}
        ${ui.kpi('Consultas hoje', String(deHoje.length))}
        ${ui.kpi('Pacotes ativos', String(pacotesAtivos))}
      </section>

      <section class="card">
        <h2 class="card-title">Agenda de hoje</h2>
        ${deHoje.length ? `
          <ul class="lista-simples">
            ${deHoje.map((c) => `
              <li>
                <span class="hora">${utils.hora(c.inicio)}</span>
                <a href="#/clientes/${encodeURIComponent(c.pessoaId)}">${utils.escapeHtml(nomePorId[c.pessoaId] || 'Cliente')}</a>
                ${ui.statusConsulta(c.status)}
              </li>`).join('')}
          </ul>` : ui.vazio('Nenhuma consulta para hoje.')}
      </section>

      ${ui.emBreve(7, [
        'Filtros de período e de profissional',
        'Faturamento, a receber, ocupação da agenda, conversão por origem, ticket médio, faltas, renovação e taxa de retorno',
        'Gráficos: faturamento mensal, funil, leads por origem, clientes que mais indicaram, serviços mais vendidos',
        'Listas de ação: retornos pendentes, pagamentos atrasados, pacotes acabando, aniversariantes, leads parados',
      ])}
    `;
  },
};
