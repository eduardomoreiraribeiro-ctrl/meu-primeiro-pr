window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.servicos = {
  titulo: 'Serviços',

  async render(container) {
    const { store, ui, config, utils } = NutriDudu;
    const servicos = (await store.list('servicos'))
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));

    container.innerHTML = `
      ${ui.cabecalho('Serviços', 'Serviços, pacotes e valores da clínica')}
      ${ui.emBreve(2, [
        'Cadastrar, editar e desativar serviços (só administrador)',
        'Pacotes com consultas incluídas, validade e frequência prevista',
        'Profissionais que realizam cada serviço e modalidade (presencial/online)',
        'Quantas vezes cada serviço foi vendido e o faturamento gerado',
      ])}
      <div class="grid-cards">
        ${servicos.map((s) => `
          <article class="card servico${s.ativo ? '' : ' inativo'}">
            <div class="servico-topo">
              ${ui.badge(config.CATEGORIAS_SERVICO[s.categoria] || s.categoria, s.categoria === 'pacote' ? 'info' : 'neutro')}
              ${s.ativo ? '' : ui.badge('Inativo')}
            </div>
            <h2>${utils.escapeHtml(s.nome)}</h2>
            <p class="muted small">${utils.escapeHtml(s.descricao)}</p>
            <p class="servico-valor">${utils.moeda(s.valor)}</p>
            <p class="muted small">
              ${s.duracaoMin} min · ${utils.escapeHtml(config.MODALIDADES[s.modalidade] || '')}
              ${s.categoria === 'pacote' ? ` · ${s.qtdConsultas} consultas em ${s.validadeDias} dias (${utils.escapeHtml((config.FREQUENCIAS[s.frequencia] || '').toLowerCase())})` : ''}
            </p>
          </article>`).join('')}
      </div>
    `;
  },
};
