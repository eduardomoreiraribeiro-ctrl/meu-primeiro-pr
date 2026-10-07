window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.servicos = (function () {
  // Dias entre consultas em cada frequência (para checar se a validade é suficiente).
  const DIAS_FREQUENCIA = { semanal: 7, quinzenal: 15, mensal: 30, livre: 0 };

  const inteiro = (n) => Number.isInteger(n);

  /** Regras do cadastro de serviço. Devolve { campo: 'mensagem' }. */
  function validar(dados, servicos) {
    const { utils } = NutriDudu;
    const erros = {};

    if (!dados.nome) erros.nome = 'Informe o nome do serviço.';
    else if (dados.nome.length > 80) erros.nome = 'Use no máximo 80 caracteres.';
    else if (servicos.some((s) => s.id !== dados.id && utils.normalizar(s.nome) === utils.normalizar(dados.nome))) {
      erros.nome = 'Já existe um serviço com esse nome.';
    }

    if (!dados.categoria) erros.categoria = 'Escolha a categoria.';

    if (dados.valor === null || Number.isNaN(dados.valor)) erros.valor = 'Informe o valor.';
    else if (dados.valor < 0) erros.valor = 'O valor não pode ser negativo.';
    else if (dados.valor > 100000) erros.valor = 'Valor alto demais — confira.';

    if (dados.duracaoMin === null || !inteiro(dados.duracaoMin)) erros.duracaoMin = 'Informe a duração em minutos (número inteiro).';
    else if (dados.duracaoMin < 5 || dados.duracaoMin > 480) erros.duracaoMin = 'A duração deve ficar entre 5 e 480 minutos.';

    if (!dados.profissionalIds.length) erros.profissionalIds = 'Marque pelo menos um profissional.';

    if (dados.categoria === 'pacote') {
      if (dados.qtdConsultas === null || !inteiro(dados.qtdConsultas)) erros.qtdConsultas = 'Informe quantas consultas o pacote inclui.';
      else if (dados.qtdConsultas < 2 || dados.qtdConsultas > 100) erros.qtdConsultas = 'Um pacote tem de 2 a 100 consultas.';

      if (dados.validadeDias === null || !inteiro(dados.validadeDias)) erros.validadeDias = 'Informe a validade em dias.';
      else if (dados.validadeDias < 1 || dados.validadeDias > 1095) erros.validadeDias = 'A validade deve ficar entre 1 e 1095 dias (3 anos).';

      if (!dados.frequencia) erros.frequencia = 'Escolha a frequência prevista.';

      const passo = DIAS_FREQUENCIA[dados.frequencia] || 0;
      if (!erros.qtdConsultas && !erros.validadeDias && passo) {
        const minimo = passo * (dados.qtdConsultas - 1) + 1;
        if (dados.validadeDias < minimo) {
          erros.validadeDias = `Com ${dados.qtdConsultas} consultas (${NutriDudu.config.FREQUENCIAS[dados.frequencia].toLowerCase()}), a validade precisa de pelo menos ${minimo} dias.`;
        }
      }
    }
    return erros;
  }

  function ler(form, id) {
    const f = NutriDudu.form;
    const categoria = f.valor(form, 'categoria');
    const ehPacote = categoria === 'pacote';
    return {
      id,
      nome: f.valor(form, 'nome'),
      descricao: f.valor(form, 'descricao'),
      categoria,
      valor: f.numero(form, 'valor'),
      duracaoMin: f.numero(form, 'duracaoMin'),
      modalidade: f.valor(form, 'modalidade') || 'ambos',
      profissionalIds: f.marcadosDe(form, 'profissionalIds'),
      qtdConsultas: ehPacote ? f.numero(form, 'qtdConsultas') : null,
      validadeDias: ehPacote ? f.numero(form, 'validadeDias') : null,
      frequencia: ehPacote ? (f.valor(form, 'frequencia') || null) : null,
    };
  }

  function abrirFormulario(servico, servicos, profissionais) {
    const { config, form: f, modal, store, ui, utils } = NutriDudu;
    const novo = !servico;
    const s = servico || {
      nome: '', descricao: '', categoria: 'consulta', valor: null, duracaoMin: 60, modalidade: 'ambos',
      profissionalIds: profissionais.filter((p) => p.ativo).map((p) => p.id),
      qtdConsultas: null, validadeDias: null, frequencia: 'mensal', ativo: true,
    };
    const opcoesProf = profissionais
      .filter((p) => p.ativo || s.profissionalIds.includes(p.id))
      .map((p) => [p.id, p.ativo ? p.nome : `${p.nome} (inativo)`]);

    const corpo = `
      ${f.texto('nome', 'Nome', s.nome, { obrigatorio: true, placeholder: 'Ex.: Consulta inicial', atributos: 'maxlength="80"' })}
      ${f.areaTexto('descricao', 'Descrição', s.descricao, { ajuda: 'Aparece para a equipe e é usada pelo agente do WhatsApp para explicar o serviço.' })}
      <div class="grade-2">
        ${f.selecao('categoria', 'Categoria', config.CATEGORIAS_SERVICO, s.categoria, { obrigatorio: true })}
        ${f.selecao('modalidade', 'Modalidade', config.MODALIDADES, s.modalidade)}
        ${f.texto('valor', 'Valor (R$)', s.valor ?? '', { tipo: 'number', obrigatorio: true, atributos: 'min="0" step="0.01" inputmode="decimal"', placeholder: '0,00' })}
        ${f.texto('duracaoMin', 'Duração de cada consulta (min)', s.duracaoMin ?? '', { tipo: 'number', obrigatorio: true, atributos: 'min="5" max="480" step="5"' })}
      </div>
      <fieldset class="bloco-pacote" data-pacote>
        <legend>Pacote</legend>
        <div class="grade-3">
          ${f.texto('qtdConsultas', 'Consultas incluídas', s.qtdConsultas ?? '', { tipo: 'number', obrigatorio: true, atributos: 'min="2" max="100" step="1"' })}
          ${f.selecao('frequencia', 'Frequência prevista', config.FREQUENCIAS, s.frequencia || 'mensal', { obrigatorio: true })}
          ${f.texto('validadeDias', 'Validade (dias)', s.validadeDias ?? '', { tipo: 'number', obrigatorio: true, atributos: 'min="1" max="1095" step="1"' })}
        </div>
        <p class="campo-ajuda" data-resumo-pacote></p>
      </fieldset>
      ${f.marcadores('profissionalIds', 'Profissionais que realizam', opcoesProf, s.profissionalIds, { obrigatorio: true })}
    `;

    modal.formulario({
      titulo: novo ? 'Novo serviço' : `Editar ${s.nome}`,
      corpo,
      largo: true,
      textoSalvar: novo ? 'Cadastrar serviço' : 'Salvar alterações',
      ler: (form) => ler(form, servico?.id),
      validar: (dados) => validar(dados, servicos),
      salvar: async (dados) => {
        const { id, ...campos } = dados;
        if (novo) await store.create('servicos', { ...campos, ativo: true });
        else await store.update('servicos', id, campos);
        ui.toast(novo ? 'Serviço cadastrado.' : 'Serviço atualizado.');
      },
      aoAbrir: (form) => {
        const blocoPacote = form.querySelector('[data-pacote]');
        const resumo = form.querySelector('[data-resumo-pacote]');
        const PASSO_SUGERIDO = { semanal: 7, quinzenal: 15, mensal: 30 };

        const atualizar = (origem) => {
          const ehPacote = f.valor(form, 'categoria') === 'pacote';
          blocoPacote.hidden = !ehPacote;
          if (!ehPacote) return;

          const qtd = f.numero(form, 'qtdConsultas');
          const freq = f.valor(form, 'frequencia');
          const validade = form.elements.validadeDias;
          // Sugere a validade enquanto ela não foi digitada à mão.
          if (origem !== 'validadeDias' && qtd > 0 && PASSO_SUGERIDO[freq] && (!validade.value || validade.dataset.sugerida)) {
            validade.value = PASSO_SUGERIDO[freq] * qtd;
            validade.dataset.sugerida = '1';
          }
          if (origem === 'validadeDias') delete validade.dataset.sugerida;

          const valor = f.numero(form, 'valor');
          resumo.textContent = qtd > 0 && valor > 0
            ? `Equivale a ${utils.moeda(valor / qtd)} por consulta.`
            : '';
        };

        form.addEventListener('input', (e) => atualizar(e.target.name));
        form.addEventListener('change', (e) => atualizar(e.target.name));
        atualizar();
      },
    });
  }

  async function alternarAtivo(servico) {
    const { store, ui, modal } = NutriDudu;
    if (servico.ativo) {
      const ok = await modal.confirmar({
        titulo: `Desativar ${servico.nome}?`,
        mensagem: 'Ele deixa de aparecer nos formulários e para o agente do WhatsApp. O histórico de consultas e pagamentos continua guardado, e você pode reativar quando quiser.',
        textoConfirmar: 'Desativar',
      });
      if (!ok) return;
    }
    await store.update('servicos', servico.id, { ativo: !servico.ativo });
    ui.toast(servico.ativo ? 'Serviço desativado.' : 'Serviço reativado.');
  }

  async function excluir(servico) {
    const { store, ui, modal } = NutriDudu;
    const ok = await modal.confirmar({
      titulo: `Excluir ${servico.nome}?`,
      mensagem: 'Esse serviço ainda não foi usado em nenhuma consulta, pacote ou pagamento, então pode ser apagado. Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    await store.remove('servicos', servico.id);
    ui.toast('Serviço excluído.');
  }

  async function render(container) {
    const { store, ui, config, utils, permissoes } = NutriDudu;
    const [servicos, profissionais, consultas, pacotes, lancamentos] = await Promise.all([
      store.list('servicos'),
      store.list('profissionais'),
      store.list('consultas'),
      store.list('pacotes'),
      store.list('lancamentos'),
    ]);
    const podeEditar = permissoes.pode('editarServicos');
    const nomeProf = Object.fromEntries(profissionais.map((p) => [p.id, p.nome]));

    const uso = (s) => {
      const realizadas = consultas.filter((c) => c.servicoId === s.id && c.status === 'realizada').length;
      const contratados = pacotes.filter((p) => p.servicoId === s.id).length;
      const faturado = lancamentos
        .filter((l) => l.servicoId === s.id && l.status === 'pago')
        .reduce((t, l) => t + l.valor - (l.desconto || 0), 0);
      const emUso = consultas.some((c) => c.servicoId === s.id) || contratados > 0 || lancamentos.some((l) => l.servicoId === s.id);
      return { realizadas, contratados, faturado, emUso };
    };

    const cartao = (s) => {
      const u = uso(s);
      const pacoteInfo = s.categoria === 'pacote'
        ? `<p class="muted small">${s.qtdConsultas} consultas · ${utils.escapeHtml((config.FREQUENCIAS[s.frequencia] || '').toLowerCase())} · validade de ${s.validadeDias} dias · ${utils.moeda(s.valor / s.qtdConsultas)} por consulta</p>`
        : '';
      const uso1 = s.categoria === 'pacote'
        ? `${u.contratados} ${u.contratados === 1 ? 'contratado' : 'contratados'}`
        : `${u.realizadas} ${u.realizadas === 1 ? 'realizado' : 'realizados'}`;
      const acoes = podeEditar ? `
        <div class="servico-acoes">
          <button type="button" class="btn btn-pequeno" data-editar="${s.id}">Editar</button>
          <button type="button" class="btn btn-pequeno" data-ativo="${s.id}">${s.ativo ? 'Desativar' : 'Reativar'}</button>
          ${u.emUso ? '' : `<button type="button" class="btn btn-pequeno btn-texto-perigo" data-excluir="${s.id}">Excluir</button>`}
        </div>` : '';

      return `
        <article class="card servico${s.ativo ? '' : ' inativo'}">
          <div class="servico-topo">
            ${ui.badge(config.CATEGORIAS_SERVICO[s.categoria] || s.categoria, s.categoria === 'pacote' ? 'info' : 'neutro')}
            ${s.ativo ? '' : ui.badge('Inativo')}
          </div>
          <h2>${utils.escapeHtml(s.nome)}</h2>
          ${s.descricao ? `<p class="muted small">${utils.escapeHtml(s.descricao)}</p>` : ''}
          <p class="servico-valor">${utils.moeda(s.valor)}</p>
          <p class="muted small">${s.duracaoMin} min por consulta · ${utils.escapeHtml(config.MODALIDADES[s.modalidade] || '')}</p>
          ${pacoteInfo}
          <p class="muted small">${utils.escapeHtml(s.profissionalIds.map((id) => nomeProf[id]).filter(Boolean).join(', ') || 'Nenhum profissional')}</p>
          <p class="servico-uso small">${uso1} · ${utils.moeda(u.faturado)} recebidos</p>
          ${acoes}
        </article>`;
    };

    const ordenar = (lista) => lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const ativos = ordenar(servicos.filter((s) => s.ativo));
    const inativos = ordenar(servicos.filter((s) => !s.ativo));

    container.innerHTML = `
      ${ui.cabecalho('Serviços', 'Serviços, pacotes e valores da clínica',
        podeEditar ? '<button type="button" class="btn btn-primary" data-novo-servico>+ Novo serviço</button>' : '')}
      ${podeEditar ? '' : '<p class="aviso-perfil small">Só o administrador pode cadastrar ou alterar serviços e preços.</p>'}
      <div class="grid-cards">
        ${ativos.length ? ativos.map(cartao).join('') : `<div class="card">${ui.vazio('Nenhum serviço ativo.')}</div>`}
      </div>
      ${inativos.length ? `
        <h2 class="secao-titulo">Inativos</h2>
        <div class="grid-cards">${inativos.map(cartao).join('')}</div>` : ''}
    `;

    const porId = (id) => servicos.find((s) => s.id === id);
    container.querySelector('[data-novo-servico]')?.addEventListener('click', () => abrirFormulario(null, servicos, profissionais));
    container.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormulario(porId(b.dataset.editar), servicos, profissionais)));
    container.querySelectorAll('[data-ativo]').forEach((b) => b.addEventListener('click', () => alternarAtivo(porId(b.dataset.ativo))));
    container.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', () => excluir(porId(b.dataset.excluir))));
  }

  return { titulo: 'Serviços', render, validar };
})();
