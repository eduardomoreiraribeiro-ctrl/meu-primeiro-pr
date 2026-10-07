window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.clientes = {
  titulo: 'Clientes',

  async render(container) {
    const { store, ui, config, utils } = NutriDudu;
    const clientes = (await store.list('pessoas', (p) => p.status !== 'lead'))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    container.innerHTML = `
      ${ui.cabecalho('Clientes', `${clientes.length} clientes cadastrados · leads ficam no Kanban comercial`)}
      ${ui.emBreve(3, [
        'Tabela com profissional, pacote e saldo, última consulta, dias sem consulta, próximo agendamento e valores em aberto',
        'Busca, filtros (status, origem, "sem retorno marcado", pagamento pendente…) e ordenação',
        'Cadastro rápido com origem e "indicado por"',
      ])}
      <div class="card lista">
        ${clientes.length ? clientes.map((p) => `
          <a class="lista-item" href="#/clientes/${encodeURIComponent(p.id)}">
            ${ui.avatar(utils.iniciais(p.nome))}
            <span class="lista-item-info">
              <strong>${utils.escapeHtml(p.nome)}</strong>
              <span class="muted small">${utils.escapeHtml(p.telefone)} · ${utils.escapeHtml(config.ORIGENS[p.origem] || '')}</span>
            </span>
            ${ui.statusPessoa(p.status)}
          </a>`).join('') : ui.vazio('Nenhum cliente cadastrado.')}
      </div>
    `;
  },
};
