window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.kanban = {
  titulo: 'Kanban',

  async render(container, params) {
    const { store, ui, config, utils } = NutriDudu;
    const funilId = params.funil;
    const funil = config.FUNIS[funilId];
    const pessoas = await store.list('pessoas', (p) => p.funil === funilId);

    const abas = Object.entries(config.FUNIS).map(([id, f]) => `
      <a href="#/kanban/${id}" class="aba${id === funilId ? ' ativa' : ''}"${id === funilId ? ' aria-current="page"' : ''}>${utils.escapeHtml(f.nome)}</a>
    `).join('');

    const colunas = funil.etapas.map((etapa) => {
      const cards = pessoas.filter((p) => p.etapa === etapa.id);
      return `
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>${utils.escapeHtml(etapa.nome)}</span>
            <span class="count">${cards.length}</span>
          </div>
          ${cards.map((p) => `
            <a class="kanban-card" href="#/clientes/${encodeURIComponent(p.id)}">
              <strong>${utils.escapeHtml(p.nome)}</strong>
              <span class="muted small">${utils.escapeHtml(config.OBJETIVOS[p.objetivo] || '')} · ${utils.escapeHtml(config.ORIGENS[p.origem] || '')}</span>
              <span class="muted small">${utils.dias(utils.diasEntre(p.etapaDesde, new Date()))} na etapa</span>
            </a>`).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `
      ${ui.cabecalho('Kanban', 'Leads e clientes por etapa')}
      <nav class="abas" aria-label="Funis">${abas}</nav>
      ${ui.emBreve(6, [
        'Arrastar e soltar cards entre as etapas (mouse e celular)',
        'Ao fechar: registrar pacote e cobrança e passar o card para o funil de acompanhamento',
        'Motivo de perda; movimentos automáticos (retorno, renovação)',
        'Cards com pacote, saldo, profissional, valores e atalho para WhatsApp; filtros',
      ])}
      <div class="kanban-board">${colunas}</div>
    `;
  },
};
