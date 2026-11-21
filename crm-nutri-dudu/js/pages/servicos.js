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

      if (dados.semPrazo) { /* sem validade nem ritmo */ }
      else if (dados.validadeDias === null || !inteiro(dados.validadeDias)) erros.validadeDias = 'Informe a validade em dias.';
      else if (dados.validadeDias < 1 || dados.validadeDias > 1095) erros.validadeDias = 'A validade deve ficar entre 1 e 1095 dias (3 anos).';

      if (!dados.frequencia) erros.frequencia = 'Escolha a frequência prevista.';

      const passo = DIAS_FREQUENCIA[dados.frequencia] || 0;
      if (dados.parcelasSugeridas !== null && (!inteiro(dados.parcelasSugeridas) || dados.parcelasSugeridas < 1 || dados.parcelasSugeridas > 24)) erros.parcelasSugeridas = 'De 1 a 24 parcelas.';
      if (!dados.semPrazo && !erros.qtdConsultas && !erros.validadeDias && passo) {
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
      semPrazo: ehPacote && f.marcado(form, 'semPrazo'),
      validadeDias: ehPacote && !f.marcado(form, 'semPrazo') ? f.numero(form, 'validadeDias') : null,
      // Sem prazo: sem ritmo previsto (não gera alerta de "pacote atrasado").
      frequencia: ehPacote ? (f.marcado(form, 'semPrazo') ? 'livre' : (f.valor(form, 'frequencia') || null)) : null,
      parcelasSugeridas: ehPacote ? f.numero(form, 'parcelasSugeridas') : null,
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
          ${f.texto('parcelasSugeridas', 'Parcelas sugeridas na venda', s.parcelasSugeridas ?? '', { tipo: 'number', atributos: 'min="1" max="24" step="1"', ajuda: 'Ex.: 3 para "3x de R$ 330". Pode mudar na hora de vender.' })}
        </div>
        ${f.chave('semPrazo', 'Sem prazo de validade (vale até usar todas as consultas)', Boolean(s.semPrazo), { ajuda: 'O pacote só termina quando as consultas acabam. O sistema avisa quando faltar 1 consulta, para oferecer a renovação.' })}
        <div class="grade-2" data-prazo>
          ${f.selecao('frequencia', 'Frequência prevista', config.FREQUENCIAS, s.frequencia && s.frequencia !== 'livre' ? s.frequencia : 'mensal', { obrigatorio: true })}
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
          form.querySelector('[data-prazo]').hidden = f.marcado(form, 'semPrazo');

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

  const estadoVendas = { meses: 6 };

  /**
   * Vendas por serviço no período: cada plano contratado conta como 1 venda (valor negociado, pela data de início);
   * consultas avulsas contam pelos lançamentos sem plano (pela data de vencimento). Cancelados ficam de fora.
   */
  function vendas(servicos, pacotes, lancamentos, meses, agora = new Date()) {
    const { utils } = NutriDudu;
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - (meses - 1), 1);
    const chave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lista = [];
    pacotes.filter((p) => p.status !== 'cancelado').forEach((p) => {
      const d = utils.paraData(p.inicio);
      if (d && d >= inicio && d <= agora) lista.push({ servicoId: p.servicoId, valor: Number(p.valorNegociado) || 0, mes: chave(d), renovacao: Boolean(p.renovacaoDe) });
    });
    lancamentos.filter((l) => !l.pacoteId && l.status !== 'cancelado' && l.servicoId).forEach((l) => {
      const d = utils.paraData(l.vencimento);
      if (d && d >= inicio && d <= agora) lista.push({ servicoId: l.servicoId, valor: (Number(l.valor) || 0) - (Number(l.desconto) || 0), mes: chave(d) });
    });
    const mesesLista = Array.from({ length: meses }, (_, i) => chave(new Date(inicio.getFullYear(), inicio.getMonth() + i, 1)));
    const porMes = Object.fromEntries(mesesLista.map((m) => [m, 0]));
    lista.forEach((v) => { porMes[v.mes] = (porMes[v.mes] || 0) + v.valor; });
    const porServico = servicos.map((s) => {
      const vs = lista.filter((v) => v.servicoId === s.id);
      const total = vs.reduce((t, v) => t + v.valor, 0);
      return { s, vendas: vs.length, total, ticket: vs.length ? total / vs.length : 0, renovacoes: vs.filter((v) => v.renovacao).length };
    }).filter((x) => x.vendas).sort((a, b) => b.total - a.total);
    const total = lista.reduce((t, v) => t + v.valor, 0);
    const planos = lista.filter((v) => servicos.find((s) => s.id === v.servicoId)?.categoria === 'pacote');
    return { total, vendas: lista.length, ticket: lista.length ? total / lista.length : 0, porMes, porServico, renovacoes: planos.filter((v) => v.renovacao).length, planos: planos.length };
  }

  function cartaoVendas(v) {
    const { utils } = NutriDudu;
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const meses = Object.entries(v.porMes);
    const max = Math.max(1, ...meses.map(([, x]) => x));
    const W = 560; const H = 190; const PB = 26; const PT = 18; const larg = (W / meses.length) * 0.62;
    const barras = meses.map(([m, x], i) => {
      const h = ((H - PB - PT) * x) / max;
      const cx = (W / meses.length) * (i + 0.5);
      return `<rect x="${cx - larg / 2}" y="${H - PB - h}" width="${larg}" height="${Math.max(h, x ? 2 : 0)}" rx="6" class="vd-barra"><title>${MESES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}: ${utils.moeda(x)}</title></rect>
        ${x ? `<text x="${cx}" y="${H - PB - h - 5}" text-anchor="middle" class="vd-valor">${utils.moedaCurta ? utils.moedaCurta(x) : Math.round(x)}</text>` : ''}
        <text x="${cx}" y="${H - 8}" text-anchor="middle" class="gr-eixo">${MESES[Number(m.slice(5)) - 1]}</text>`;
    }).join('');
    const taxaRenov = v.planos ? Math.round((v.renovacoes / v.planos) * 100) : null;
    return `<section class="card vd">
      <div class="secao-cabecalho"><h2 class="card-title">Vendas e faturamento</h2>
        <select data-vd-meses aria-label="Período">${[3, 6, 12].map((n) => `<option value="${n}"${n === estadoVendas.meses ? ' selected' : ''}>Últimos ${n} meses</option>`).join('')}</select></div>
      <div class="ck-kpis">
        <div><span class="muted small">Total vendido</span><strong>${utils.moeda(v.total)}</strong></div>
        <div><span class="muted small">Vendas</span><strong>${v.vendas}</strong></div>
        <div><span class="muted small">Ticket médio</span><strong>${utils.moeda(v.ticket)}</strong></div>
        <div><span class="muted small">Renovações de plano</span><strong>${v.renovacoes}${taxaRenov !== null ? ` <span class="muted small">(${taxaRenov}%)</span>` : ''}</strong></div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" class="gr" role="img" aria-label="Vendas por mês">${barras}</svg>
      ${v.porServico.length ? `<div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Serviço</th><th>Vendas</th><th>Faturamento</th><th>Ticket médio</th><th>% do total</th></tr></thead><tbody>
        ${v.porServico.map((x) => `<tr><td>${utils.escapeHtml(x.s.nome)}${x.renovacoes ? `<span class="muted small bloco">${x.renovacoes} renovação(ões)</span>` : ''}</td><td>${x.vendas}</td><td>${utils.moeda(x.total)}</td><td>${utils.moeda(x.ticket)}</td><td>${v.total ? Math.round((x.total / v.total) * 100) : 0}%</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Nenhuma venda no período. As vendas entram quando você contrata um plano ou lança uma consulta avulsa no Financeiro.</p>'}
      <p class="muted small">Plano conta pela data de início e pelo valor negociado; consulta avulsa, pelo lançamento. Cancelados ficam de fora.</p>
    </section>`;
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
        ? `<p class="muted small">${s.qtdConsultas} consultas · ${s.semPrazo ? 'sem prazo de validade' : `${utils.escapeHtml((config.FREQUENCIAS[s.frequencia] || '').toLowerCase())} · validade de ${s.validadeDias} dias`}${s.parcelasSugeridas > 1 ? ` · ${s.parcelasSugeridas}x de ${utils.moeda(s.valor / s.parcelasSugeridas)}` : ''} · ${utils.moeda(s.valor / s.qtdConsultas)} por consulta</p>`
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
      ${permissoes.pode('gerenciarDados') ? cartaoVendas(vendas(servicos, pacotes, lancamentos, estadoVendas.meses)) : ''}
      <div class="grid-cards">
        ${ativos.length ? ativos.map(cartao).join('') : `<div class="card">${ui.vazio('Nenhum serviço ativo.')}</div>`}
      </div>
      ${inativos.length ? `
        <h2 class="secao-titulo">Inativos</h2>
        <div class="grid-cards">${inativos.map(cartao).join('')}</div>` : ''}
    `;

    const porId = (id) => servicos.find((s) => s.id === id);
    container.querySelector('[data-vd-meses]')?.addEventListener('change', (e) => { estadoVendas.meses = Number(e.target.value); NutriDudu.recarregarPagina(); });
    container.querySelector('[data-novo-servico]')?.addEventListener('click', () => abrirFormulario(null, servicos, profissionais));
    container.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormulario(porId(b.dataset.editar), servicos, profissionais)));
    container.querySelectorAll('[data-ativo]').forEach((b) => b.addEventListener('click', () => alternarAtivo(porId(b.dataset.ativo))));
    container.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', () => excluir(porId(b.dataset.excluir))));
  }

  return { titulo: 'Serviços', render, validar };
})();
