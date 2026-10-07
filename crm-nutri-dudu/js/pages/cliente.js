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
    const [consultas, pacotes, lancamentos, profissional, indicadoPor, indicados, anamneses, servicos, geral] = await Promise.all([
      store.list('consultas', (c) => c.pessoaId === pessoa.id),
      store.list('pacotes', (p) => p.pessoaId === pessoa.id),
      store.list('lancamentos', (l) => l.pessoaId === pessoa.id),
      pessoa.profissionalId ? store.get('profissionais', pessoa.profissionalId) : null,
      pessoa.indicadoPorId ? store.get('pessoas', pessoa.indicadoPorId) : null,
      store.list('pessoas', (p) => p.indicadoPorId === pessoa.id),
      // Dados clínicos só são buscados para quem pode vê-los.
      verClinico ? store.list('anamneses', (a) => a.pessoaId === pessoa.id) : [],
      store.list('servicos'),
      store.get('configuracoes', 'geral'),
    ]);

    const r = NutriDudu.calculos.resumoPessoa(pessoa, { consultas, pacotes, lancamentos }, geral || {});
    const nomeServico = Object.fromEntries(servicos.map((s) => [s.id, s.nome]));

    const anamnese = anamneses.sort((a, b) => b.versao - a.versao)[0];
    const alertas = anamnese ? [
      ...anamnese.alergias
        .filter((a) => a.gravidade === 'grave')
        .map((a) => `Alergia: ${a.substancia} (grave)`),
      ...anamnese.contraindicacoes.map((c) => `Contraindicação: ${c.descricao}`),
    ] : [];

    const idade = utils.idade(pessoa.dataNascimento);
    const origem = config.ORIGENS[pessoa.origem] || '';
    const whatsapp = `https://wa.me/55${utils.soDigitos(pessoa.telefone)}`;
    const cons = pessoa.consentimentos || {};
    const consentimentos = [['saude', 'dados de saúde'], ['whatsapp', 'WhatsApp'], ['fotos', 'fotos clínicas'], ['divulgacao', 'uso de imagem']]
      .map(([k, rotulo]) => `<span class="consentimento${cons[k] ? ' sim' : ''}">${cons[k] ? '✓' : '✗'} ${rotulo}</span>`).join('');
    const linha = (rotulo, valor) => `<tr><th scope="row">${rotulo}</th><td>${valor || '<span class="muted">—</span>'}</td></tr>`;

    container.innerHTML = `
      <div class="ficha-topo card">
        <div class="ficha-identidade">
          ${ui.avatar(utils.iniciais(pessoa.nome))}
          <div class="ficha-nome">
            <h1>${utils.escapeHtml(pessoa.nome)}</h1>
            <p class="muted">
              ${idade !== null ? `${idade} anos · ` : ''}${utils.escapeHtml(pessoa.telefone)}${pessoa.email ? ` · ${utils.escapeHtml(pessoa.email)}` : ''}
            </p>
            <p class="ficha-tags">
              ${ui.statusPessoa(pessoa.status)}
              ${profissional ? ui.badge(profissional.nome) : ''}
              ${ui.badge(`Origem: ${origem}`)}
              ${(pessoa.tags || []).map((t) => ui.badge(t, 'etiqueta')).join('')}
              ${indicadoPor ? `<span class="small">Indicado(a) por <a href="#/clientes/${encodeURIComponent(indicadoPor.id)}">${utils.escapeHtml(indicadoPor.nome)}</a></span>` : ''}
              ${indicados.length ? `<span class="small muted">Indicou ${indicados.length} ${indicados.length === 1 ? 'pessoa' : 'pessoas'}</span>` : ''}
            </p>
          </div>
          <div class="ficha-acoes">
            <a class="btn btn-pequeno" href="${whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" class="btn btn-pequeno" data-editar-cadastro>Editar cadastro</button>
            <button type="button" class="btn btn-pequeno btn-primary" data-agendar>Agendar</button>
          </div>
        </div>
      </div>

      ${alertas.length ? `
        <div class="alerta alerta-perigo" role="note">
          <strong>Atenção:</strong> ${alertas.map(utils.escapeHtml).join(' · ')}
        </div>` : ''}
      ${r.semRetorno ? `
        <div class="alerta alerta-aviso" role="note">
          <strong>Sem retorno marcado:</strong> última consulta há ${r.diasSemConsulta} dias (${utils.data(r.ultima.inicio)}) e nada agendado. O prazo de retorno é de ${r.prazoRetorno} dias.
        </div>` : ''}

      <section class="kpi-grid">
        ${ui.kpi('Última consulta', r.ultima ? utils.data(r.ultima.inicio) : '—', r.ultima ? `há ${utils.dias(r.diasSemConsulta)}` : '')}
        ${ui.kpi('Próximo agendamento', r.proxima ? `${utils.data(r.proxima.inicio)} ${utils.hora(r.proxima.inicio)}` : 'Nenhum')}
        ${ui.kpi('Pacote', r.pacote ? `${r.pacote.usadas} de ${r.pacote.total} usadas` : 'Nenhum ativo',
          r.pacote ? `${nomeServico[r.pacote.servicoId] || 'Pacote'} · vence ${utils.data(r.pacote.validade)}` : '')}
        ${ui.kpi('Em aberto', utils.moeda(r.emAberto), r.atrasado ? `${utils.moeda(r.atrasado)} atrasado` : '')}
      </section>

      <section class="card">
        <h2 class="card-title">Dados do cadastro</h2>
        <table class="tabela-simples tabela-cadastro">
          ${linha('Nascimento', pessoa.dataNascimento ? `${utils.data(pessoa.dataNascimento)}${idade !== null ? ` (${idade} anos)` : ''}` : '')}
          ${linha('Sexo', { F: 'Feminino', M: 'Masculino' }[pessoa.sexo])}
          ${linha('CPF', utils.escapeHtml(pessoa.cpf))}
          ${linha('Endereço', utils.escapeHtml([pessoa.endereco, pessoa.cidade].filter(Boolean).join(' — ')))}
          ${linha('Objetivo', utils.escapeHtml(config.OBJETIVOS[pessoa.objetivo]))}
          ${linha('Serviço de interesse', utils.escapeHtml(nomeServico[pessoa.servicoInteresseId]))}
          ${linha('Retorno a cada', `${r.prazoRetorno} dias${pessoa.retornoDias ? '' : ' <span class="muted small">(padrão da clínica)</span>'}`)}
          ${linha('Cliente desde', pessoa.clienteDesde ? utils.data(pessoa.clienteDesde) : '')}
          ${linha('Consentimentos', `<span class="consentimentos">${consentimentos}</span>`)}
          ${linha('Observações', utils.escapeHtml(pessoa.observacoes))}
        </table>
      </section>

      ${ui.emBreve('5', [
        'Abas: Visão geral, Anamnese, Consultas, Avaliação física, Fotos, Pacotes, Financeiro e Histórico',
        'Registrar atendimento em etapas: anamnese, medidas, fotos, condutas e marcação do retorno',
        'Pré-anamnese enviada pelo paciente, para a nutricionista revisar',
        'Gráficos de evolução e comparador de fotos antes × depois',
      ])}
    `;

    container.querySelector('[data-agendar]').addEventListener('click', () => {
      NutriDudu.agendamento.abrir({ pessoaId: pessoa.id });
    });
    container.querySelector('[data-editar-cadastro]').addEventListener('click', () => {
      NutriDudu.cadastroPessoa.abrir({ pessoa });
    });
  },
};
