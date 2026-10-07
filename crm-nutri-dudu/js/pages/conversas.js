window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.conversas = {
  titulo: 'Conversas',

  async render(container) {
    const { store, ui, utils } = NutriDudu;
    const [conversas, mensagens, pessoas] = await Promise.all([
      store.list('conversas'),
      store.list('mensagens'),
      store.list('pessoas'),
    ]);

    const nomePorId = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));
    const STATUS = {
      agente: ['🤖 Agente atendendo', 'info'],
      aguardando_equipe: ['Aguardando equipe', 'alerta'],
      equipe: ['Equipe atendendo', 'sucesso'],
      encerrada: ['Encerrada', 'neutro'],
    };

    const ordenadas = conversas.sort((a, b) => b.ultimaMensagemEm.localeCompare(a.ultimaMensagemEm));

    container.innerHTML = `
      ${ui.cabecalho('Conversas', 'WhatsApp da clínica · exemplos fictícios')}
      ${ui.emBreve('10', [
        'Conexão com a API oficial do WhatsApp (número novo da clínica)',
        'Assistente Nutri Dudu respondendo 24 horas, agendando e enviando lembretes',
        'Assumir a conversa e devolver ao agente; resumo automático',
        'Pré-anamnese, lembretes de consulta, retorno, pacote e cobrança',
      ])}
      <div class="card lista">
        ${ordenadas.length ? ordenadas.map((c) => {
          const ultima = mensagens
            .filter((m) => m.conversaId === c.id)
            .sort((a, b) => b.dataHora.localeCompare(a.dataHora))[0];
          const [rotulo, variante] = STATUS[c.status] || [c.status, 'neutro'];
          return `
            <a class="lista-item" href="#/clientes/${encodeURIComponent(c.pessoaId)}">
              ${ui.avatar(utils.iniciais(nomePorId[c.pessoaId]))}
              <span class="lista-item-info">
                <strong>${utils.escapeHtml(nomePorId[c.pessoaId] || c.telefone)}</strong>
                <span class="muted small texto-cortado">${utils.escapeHtml(ultima ? ultima.texto : '')}</span>
              </span>
              ${ui.badge(rotulo, variante)}
            </a>`;
        }).join('') : ui.vazio('Nenhuma conversa ainda.')}
      </div>
    `;
  },
};
