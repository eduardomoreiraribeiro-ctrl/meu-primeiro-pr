window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.cliente = {
  titulo: 'Cliente',

  async render(container, params) {
    const { store, ui, config, utils, permissoes } = NutriDudu;
    const pessoa = await store.get('pessoas', params.id);

    if (!pessoa) {
      container.innerHTML = `
        ${ui.cabecalho('Cliente não encontrado')}
        <div class="card">
          <p>Esse cadastro não existe ou foi removido.</p>
          <a class="btn" href="#/clientes">Voltar para Clientes</a>
        </div>`;
      return;
    }

    const verClinico = permissoes.pode('verClinico');
    const [consultas, pacotes, lancamentos, profissional, indicadoPor, indicados, anamneses, servicos] = await Promise.all([
      store.list('consultas', (c) => c.pessoaId === pessoa.id),
      store.list('pacotes', (p) => p.pessoaId === pessoa.id && p.status === 'ativo'),
      store.list('lancamentos', (l) => l.pessoaId === pessoa.id && l.status === 'pendente'),
      store.get('profissionais', pessoa.profissionalId),
      pessoa.indicadoPorId ? store.get('pessoas', pessoa.indicadoPorId) : null,
      store.list('pessoas', (p) => p.indicadoPorId === pessoa.id),
      // Dados clínicos só são buscados para quem pode vê-los.
      verClinico ? store.list('anamneses', (a) => a.pessoaId === pessoa.id) : [],
      store.list('servicos'),
    ]);

    const agora = new Date();
    const realizadas = consultas
      .filter((c) => c.status === 'realizada')
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ultima = realizadas[0];
    const proxima = consultas
      .filter((c) => ['agendada', 'confirmada'].includes(c.status) && new Date(c.inicio) >= agora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    const emAberto = lancamentos.reduce((total, l) => total + l.valor - (l.desconto || 0), 0);
    const nomeServico = Object.fromEntries(servicos.map((s) => [s.id, s.nome]));

    const pacote = pacotes[0];
    let resumoPacote = 'Nenhum ativo';
    if (pacote) {
      const usadas = consultas.filter((c) => c.pacoteId === pacote.id &&
        (c.status === 'realizada' || (c.status === 'faltou' && c.descontarFalta))).length;
      resumoPacote = `${usadas} de ${pacote.qtdConsultas} usadas`;
    }

    const anamnese = anamneses.sort((a, b) => b.versao - a.versao)[0];
    const alertas = anamnese ? [
      ...anamnese.alergias
        .filter((a) => a.gravidade === 'grave')
        .map((a) => `Alergia: ${a.substancia} (grave)`),
      ...anamnese.contraindicacoes.map((c) => `Contraindicação: ${c.descricao}`),
    ] : [];

    const idade = utils.idade(pessoa.dataNascimento);
    const origem = config.ORIGENS[pessoa.origem] || '';

    container.innerHTML = `
      <div class="ficha-topo card">
        <div class="ficha-identidade">
          ${ui.avatar(utils.iniciais(pessoa.nome))}
          <div>
            <h1>${utils.escapeHtml(pessoa.nome)}</h1>
            <p class="muted">
              ${idade !== null ? `${idade} anos · ` : ''}${utils.escapeHtml(pessoa.telefone)}${pessoa.email ? ` · ${utils.escapeHtml(pessoa.email)}` : ''}
            </p>
            <p class="ficha-tags">
              ${ui.statusPessoa(pessoa.status)}
              ${profissional ? ui.badge(profissional.nome) : ''}
              ${ui.badge(`Origem: ${origem}`)}
              ${indicadoPor ? `<span class="small">Indicado(a) por <a href="#/clientes/${encodeURIComponent(indicadoPor.id)}">${utils.escapeHtml(indicadoPor.nome)}</a></span>` : ''}
              ${indicados.length ? `<span class="small muted">Indicou ${indicados.length} ${indicados.length === 1 ? 'pessoa' : 'pessoas'}</span>` : ''}
            </p>
          </div>
        </div>
      </div>

      ${alertas.length ? `
        <div class="alerta alerta-perigo" role="note">
          <strong>Atenção:</strong> ${alertas.map(utils.escapeHtml).join(' · ')}
        </div>` : ''}

      <section class="kpi-grid">
        ${ui.kpi('Última consulta', ultima ? utils.data(ultima.inicio) : '—', ultima ? `há ${utils.diasEntre(ultima.inicio, agora)} dias` : '')}
        ${ui.kpi('Próximo agendamento', proxima ? `${utils.data(proxima.inicio)} ${utils.hora(proxima.inicio)}` : 'Nenhum')}
        ${ui.kpi('Pacote', resumoPacote, pacote ? nomeServico[pacote.servicoId] : '')}
        ${ui.kpi('Em aberto', utils.moeda(emAberto))}
      </section>

      ${ui.emBreve('5', [
        'Abas: Visão geral, Anamnese, Consultas, Avaliação física, Fotos, Pacotes, Financeiro e Histórico',
        'Registrar atendimento em etapas: anamnese, medidas, fotos, condutas e marcação do retorno',
        'Pré-anamnese enviada pelo paciente, para a nutricionista revisar',
        'Gráficos de evolução e comparador de fotos antes × depois',
      ])}
    `;
  },
};
