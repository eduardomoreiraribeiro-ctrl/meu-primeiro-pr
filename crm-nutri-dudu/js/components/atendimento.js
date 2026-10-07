// Registrar atendimento: fluxo único em etapas, para a nutricionista não pular nada.
// 1 Anamnese · 2 Avaliação física · 3 Fotos · 4 Evolução e condutas · 5 Próximo retorno · 6 Fechamento
window.NutriDudu = window.NutriDudu || {};

NutriDudu.atendimento = (function () {
  const PASSOS = ['Anamnese', 'Avaliação física', 'Fotos', 'Evolução e condutas', 'Próximo retorno', 'Fechamento'];
  const DIAS_FREQUENCIA = { semanal: 7, quinzenal: 15, mensal: 30 };

  // Em qual etapa está cada campo (para abrir a etapa certa quando há erro).
  function passoDoCampo(nome) {
    if (nome.startsWith('an_') || nome in NutriDudu.anamnese.LISTAS) return 0;
    if (nome.startsWith('av_') || nome.startsWith('circ_') || nome.startsWith('dob_')) return 1;
    if (nome === 'proximoRetorno') return 4;
    if (['valor', 'formaPagamento'].includes(nome)) return 5;
    return 3;
  }

  async function carregar(consultaId) {
    const { store } = NutriDudu;
    const consulta = await store.get('consultas', consultaId);
    if (!consulta) return null;
    const [pessoa, servico, profissional, anamneses, avaliacoes, consultas, pacotes, lancamentos, geral] = await Promise.all([
      store.get('pessoas', consulta.pessoaId),
      store.get('servicos', consulta.servicoId),
      store.get('profissionais', consulta.profissionalId),
      store.list('anamneses', (a) => a.pessoaId === consulta.pessoaId),
      store.list('avaliacoes', (a) => a.pessoaId === consulta.pessoaId),
      store.list('consultas', (c) => c.pessoaId === consulta.pessoaId),
      store.list('pacotes', (p) => p.pessoaId === consulta.pessoaId),
      store.list('lancamentos', (l) => l.consultaId === consultaId && l.status !== 'cancelado'),
      store.get('configuracoes', 'geral'),
    ]);
    const anterior = avaliacoes
      .map((a) => ({ ...a, data: consultas.find((c) => c.id === a.consultaId)?.inicio || a.criadoEm }))
      .sort((a, b) => b.data.localeCompare(a.data))[0] || null;
    const ultimaConduta = consultas
      .filter((c) => c.status === 'realizada' && c.conduta)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]?.conduta || '';
    return {
      consulta, pessoa, servico, profissional, anamneses, anterior, ultimaConduta, consultas, geral: geral || {},
      pacote: pacotes.find((p) => p.id === consulta.pacoteId) || null,
      cobrancaExistente: lancamentos[0] || null,
    };
  }

  // ---------------- Etapas (HTML) ----------------

  function passoAnamnese(d) {
    const { anamnese, utils, form: f } = NutriDudu;
    const { atual, pre } = anamnese.situacao(d.anamneses);
    if (pre) {
      return `
        <p class="alerta alerta-aviso">O paciente enviou a pré-anamnese. Confira cada seção: ao concluir, ela vira a anamnese oficial.</p>
        <input type="hidden" name="atualizarAnamnese" value="1">
        ${anamnese.campos(pre)}`;
    }
    if (!atual) {
      return `
        <p class="campo-ajuda">Primeira anamnese de ${utils.escapeHtml(d.pessoa.nome)}. Preencha o que for possível; dá para completar nas próximas consultas.</p>
        <input type="hidden" name="atualizarAnamnese" value="1">
        ${anamnese.campos({})}`;
    }
    const alertas = anamnese.alertas(atual);
    const lista = (titulo, itens) => (itens.length ? `<p><strong>${titulo}:</strong> ${itens.map(utils.escapeHtml).join(', ')}</p>` : '');
    return `
      ${alertas.length ? `<div class="alerta alerta-perigo"><strong>Atenção:</strong> ${alertas.map(utils.escapeHtml).join(' · ')}</div>` : ''}
      <div class="resumo-anamnese">
        <p class="muted small">Versão ${atual.versao}, de ${utils.data(atual.criadoEm)}.</p>
        ${atual.queixa ? `<p><strong>Queixa:</strong> ${utils.escapeHtml(atual.queixa)}</p>` : ''}
        ${lista('Alergias e intolerâncias', (atual.alergias || []).map((a) => `${a.substancia} (${a.gravidade})`))}
        ${lista('Medicamentos', (atual.medicamentos || []).map((m) => `${m.nome} ${m.dose || ''}`.trim()))}
        ${atual.historicoSaude ? `<p><strong>Histórico:</strong> ${utils.escapeHtml(atual.historicoSaude)}</p>` : ''}
      </div>
      ${f.chave('atualizarAnamnese', 'Houve mudanças: atualizar a anamnese nesta consulta')}
      <div data-editar-anamnese hidden>${anamnese.campos(atual)}</div>`;
  }

  function passoAvaliacao(d) {
    const { avaliacao: A, form: f, utils } = NutriDudu;
    const ant = d.anterior || {};
    const antCirc = ant.circunferencias || {};
    const antDob = ant.dobras || {};
    const dica = (v, unidade) => (v ? `Anterior: ${String(v).replace('.', ',')} ${unidade}` : '');
    const numero = (nome, rotulo, anterior, unidade, extra = '') => f.texto(nome, rotulo, '', {
      tipo: 'number', atributos: `step="0.1" min="0" inputmode="decimal" ${extra}`, ajuda: dica(anterior, unidade),
    });
    return `
      <p class="campo-ajuda">Todos os campos são opcionais: preencha só o que mediu. Deixe em branco se não houve avaliação nesta consulta.</p>
      <div class="grade-3">
        ${numero('av_peso', 'Peso (kg)', ant.pesoKg, 'kg')}
        ${f.texto('av_altura', 'Altura (cm)', ant.alturaCm || '', { tipo: 'number', atributos: 'step="0.1" min="0" inputmode="decimal"' })}
        ${f.selecao('av_metodo', 'Composição corporal', A.METODOS, '', { vazio: 'Não medida' })}
        <div data-so-manual>${numero('av_pg', '% de gordura', ant.percentualGordura, '%')}</div>
        <div data-so-dobras>${f.selecao('av_formula', 'Fórmula', Object.fromEntries(Object.entries(A.FORMULAS).map(([k, v]) => [k, v.nome])), ant.formula || 'jp7')}</div>
      </div>
      <details class="secao-anamnese" open>
        <summary>Circunferências (cm)</summary>
        <div class="grade-4">${Object.entries(A.CIRCUNFERENCIAS).map(([k, r]) => numero(`circ_${k}`, r, antCirc[k], 'cm')).join('')}</div>
      </details>
      <details class="secao-anamnese" data-so-dobras open>
        <summary>Dobras cutâneas (mm)</summary>
        <div class="grade-4">${Object.entries(A.DOBRAS).map(([k, r]) => numero(`dob_${k}`, r, antDob[k], 'mm')).join('')}</div>
      </details>
      <div class="resultado-avaliacao" data-resultado aria-live="polite"></div>
      <p class="muted small">Idade: ${utils.idade(d.pessoa.dataNascimento) ?? 'não informada'} · Sexo: ${{ F: 'feminino', M: 'masculino' }[d.pessoa.sexo] || 'não informado'} (usados nas fórmulas).</p>`;
  }

  function passoFotos(d) {
    if (!d.pessoa.consentimentos?.fotos) {
      return `<p class="alerta alerta-aviso">${NutriDudu.utils.escapeHtml(d.pessoa.nome)} ainda não autorizou fotos clínicas. Registre o consentimento no cadastro antes de tirar fotos.</p>`;
    }
    return `
      <p class="campo-ajuda">Tire as fotos com a câmera do celular/tablet ou escolha arquivos. Marque o ângulo de cada uma — o comparador usa o ângulo.</p>
      <label class="btn btn-pequeno seletor-arquivo">+ Adicionar fotos
        <input type="file" accept="image/*" multiple data-fotos hidden>
      </label>
      <div class="fotos-novas" data-fotos-novas></div>`;
  }

  function passoEvolucao(d) {
    const { form: f, utils } = NutriDudu;
    return `
      ${f.areaTexto('anotacoes', 'Evolução e anotações da consulta', d.consulta.anotacoes || '', { linhas: 4 })}
      ${f.areaTexto('conduta', 'Plano alimentar e condutas', d.consulta.conduta || '', { linhas: 5 })}
      ${d.ultimaConduta ? `<details class="conduta-anterior"><summary>Ver a conduta da consulta anterior</summary><p>${utils.escapeHtml(d.ultimaConduta)}</p></details>` : ''}`;
  }

  function sugestaoRetorno(d) {
    const passo = (d.pacote && DIAS_FREQUENCIA[d.pacote.frequencia]) || d.pessoa.retornoDias || 30;
    const data = new Date(d.consulta.inicio);
    data.setDate(data.getDate() + passo);
    return { dia: NutriDudu.utils.isoDia(data), passo };
  }

  function passoRetorno(d) {
    const { form: f } = NutriDudu;
    const s = sugestaoRetorno(d);
    const motivo = d.pacote && DIAS_FREQUENCIA[d.pacote.frequencia]
      ? `frequência ${NutriDudu.config.FREQUENCIAS[d.pacote.frequencia].toLowerCase()} do pacote`
      : (d.pessoa.retornoDias ? 'periodicidade definida para este cliente' : 'padrão de 30 dias');
    return `
      ${f.texto('proximoRetorno', 'Próximo retorno', s.dia, { tipo: 'date', ajuda: `Sugestão: ${s.passo} dias (${motivo}). Deixe em branco se não houver retorno previsto.` })}
      ${f.chave('agendarRetorno', 'Abrir a agenda para marcar o retorno ao concluir', true, { ajuda: 'Marcar na hora evita que o cliente fique sem retorno.' })}`;
  }

  function passoFechamento(d) {
    const { form: f, utils, config } = NutriDudu;
    const ehLead = d.pessoa.status === 'lead';
    const podeReceber = NutriDudu.permissoes.pode('darBaixaPagamento');
    let cobranca;
    if (d.pacote) {
      cobranca = `<p>Consulta do pacote <strong>${utils.escapeHtml(d.servico?.nome || 'pacote')}</strong>: não gera cobrança avulsa.</p><p data-uso-pacote></p>`;
    } else if (d.cobrancaExistente) {
      const l = d.cobrancaExistente;
      const receber = l.status === 'pendente' && podeReceber;
      cobranca = `
        <p>Cobrança desta consulta já lançada: ${utils.moeda(NutriDudu.calculos.valorLiquido(l))} (${utils.escapeHtml(config.STATUS_LANCAMENTO[l.status])}).</p>
        ${receber ? `
          <input type="hidden" name="receberExistente" value="1">
          <div class="grade-3">
            ${f.chave('pagoAgora', 'Pago agora', true)}
            ${f.selecao('formaPagamento', 'Forma de pagamento', config.FORMAS_PAGAMENTO, 'pix')}
          </div>` : ''}`;
    } else {
      cobranca = `
        <input type="hidden" name="gerarCobranca" value="1">
        <div class="grade-3">
          ${f.texto('valor', 'Valor da consulta (R$)', d.servico?.valor ?? '', { tipo: 'number', atributos: 'step="0.01" min="0"' })}
          ${podeReceber ? `
            ${f.chave('pagoAgora', 'Pago agora', true)}
            ${f.selecao('formaPagamento', 'Forma de pagamento', config.FORMAS_PAGAMENTO, 'pix')}` : ''}
        </div>
        ${podeReceber ? '' : '<p class="campo-ajuda">A cobrança fica pendente; a recepção registra o pagamento.</p>'}`;
    }
    return `
      <ul class="resumo-fechamento">
        <li>A consulta de ${utils.escapeHtml(utils.data(d.consulta.inicio))} será marcada como <strong>realizada</strong>.</li>
        <li data-resumo-itens></li>
      </ul>
      ${cobranca}
      ${ehLead ? f.chave('tornarCliente', `${d.pessoa.nome} fechou com a clínica: passar a cliente ativo`, true, { ajuda: 'Sai do funil comercial e entra no acompanhamento, com "cliente desde" hoje.' }) : ''}`;
  }

  // ---------------- Leitura e validação ----------------

  function lerAvaliacao(form) {
    const { form: f, avaliacao: A } = NutriDudu;
    const circ = {};
    Object.keys(A.CIRCUNFERENCIAS).forEach((k) => { const v = f.numero(form, `circ_${k}`); if (v !== null) circ[k] = v; });
    const metodo = f.valor(form, 'av_metodo') || null;
    const dobras = {};
    if (metodo === 'dobras') Object.keys(A.DOBRAS).forEach((k) => { const v = f.numero(form, `dob_${k}`); if (v !== null) dobras[k] = v; });
    return {
      pesoKg: f.numero(form, 'av_peso'),
      alturaCm: f.numero(form, 'av_altura'),
      metodo,
      formula: metodo === 'dobras' ? f.valor(form, 'av_formula') : null,
      percentualGordura: metodo && metodo !== 'dobras' ? f.numero(form, 'av_pg') : null,
      circunferencias: circ,
      dobras,
    };
  }

  const avaliacaoVazia = (av) => av.pesoKg === null && !av.metodo && !Object.keys(av.circunferencias).length;

  function ler(form, d, fotos) {
    const { form: f, anamnese } = NutriDudu;
    const atualizar = form.elements.atualizarAnamnese?.type === 'hidden' ? true : f.marcado(form, 'atualizarAnamnese');
    return {
      anamnese: atualizar ? anamnese.ler(form) : null,
      avaliacao: lerAvaliacao(form),
      fotos,
      anotacoes: f.valor(form, 'anotacoes'),
      conduta: f.valor(form, 'conduta'),
      proximoRetorno: f.valor(form, 'proximoRetorno') || null,
      agendarRetorno: f.marcado(form, 'agendarRetorno'),
      gerarCobranca: Boolean(form.elements.gerarCobranca),
      receberExistente: Boolean(form.elements.receberExistente),
      valor: f.numero(form, 'valor'),
      pagoAgora: f.marcado(form, 'pagoAgora'),
      formaPagamento: f.valor(form, 'formaPagamento'),
      tornarCliente: f.marcado(form, 'tornarCliente'),
    };
  }

  function validar(dados, d) {
    const erros = {};
    if (dados.anamnese) Object.assign(erros, NutriDudu.anamnese.validar(dados.anamnese));
    const av = dados.avaliacao;
    const faixa = (v, min, max) => v === null || (v >= min && v <= max);
    if (!faixa(av.pesoKg, 20, 400)) erros.av_peso = 'Peso entre 20 e 400 kg.';
    if (!faixa(av.alturaCm, 80, 250)) erros.av_altura = 'Altura entre 80 e 250 cm.';
    if (av.percentualGordura !== null && !faixa(av.percentualGordura, 2, 70)) erros.av_pg = '% de gordura entre 2 e 70.';
    if (av.metodo && av.metodo !== 'dobras' && av.percentualGordura === null) erros.av_pg = 'Informe o % de gordura medido.';
    Object.entries(av.circunferencias).forEach(([k, v]) => { if (!faixa(v, 10, 250)) erros[`circ_${k}`] = 'Entre 10 e 250 cm.'; });
    Object.entries(av.dobras).forEach(([k, v]) => { if (!faixa(v, 1, 80)) erros[`dob_${k}`] = 'Entre 1 e 80 mm.'; });
    if (dados.proximoRetorno && dados.proximoRetorno <= NutriDudu.utils.isoDia(d.consulta.inicio)) {
      erros.proximoRetorno = 'O retorno precisa ser depois desta consulta.';
    } else if (dados.proximoRetorno && NutriDudu.utils.diasEntre(d.consulta.inicio, dados.proximoRetorno) > 400) {
      erros.proximoRetorno = 'O retorno ficou para mais de um ano — confira a data.';
    }
    if (dados.gerarCobranca && (dados.valor === null || dados.valor < 0)) erros.valor = 'Informe o valor (0 se for cortesia).';
    else if (dados.gerarCobranca && dados.valor > 100000) erros.valor = 'Valor alto demais — confira.';
    return erros;
  }

  // ---------------- Gravação ----------------

  async function salvar(dados, d) {
    const { store, utils, permissoes, anamnese, avaliacao: A, fotosStore, calculos } = NutriDudu;
    const autor = permissoes.atual();
    const agora = new Date().toISOString();
    const hoje = utils.isoDia(new Date());
    const c = d.consulta;
    const registros = [];
    const interacao = (descricao, tipo = 'consulta') => store.create('interacoes', {
      pessoaId: c.pessoaId, dataHora: new Date().toISOString(), tipo, descricao, autor, automatico: true,
    });

    let anamneseId = c.anamneseId || null;
    if (dados.anamnese) {
      const { atual, pre } = anamnese.situacao(d.anamneses);
      const temConteudo = anamnese.mudancas(null, dados.anamnese).length > 0;
      if (pre || (temConteudo && anamnese.mudancas(atual, dados.anamnese).length)) {
        anamneseId = (await anamnese.salvarVersao(c.pessoaId, dados.anamnese, { consultaId: c.id })).id;
      }
    }

    let avaliacaoId = c.avaliacaoId || null;
    const av = dados.avaliacao;
    if (!avaliacaoVazia(av)) {
      const r = A.calcular(av, { sexo: d.pessoa.sexo, idade: utils.idade(d.pessoa.dataNascimento) });
      const salva = await store.create('avaliacoes', {
        pessoaId: c.pessoaId, consultaId: c.id, ...av, percentualGordura: r.percentualGordura,
      });
      avaliacaoId = salva.id;
      const partes = [av.pesoKg ? `peso ${String(av.pesoKg).replace('.', ',')} kg` : '', r.imc ? `IMC ${String(r.imc).replace('.', ',')}` : '',
        r.percentualGordura !== null ? `gordura ${String(r.percentualGordura).replace('.', ',')}%` : ''].filter(Boolean);
      registros.push(`avaliação física${partes.length ? ` (${partes.join(', ')})` : ''}`);
    }

    const fotoIds = [...(c.fotoIds || [])];
    for (const foto of dados.fotos) {
      const chave = utils.uid('img');
      await fotosStore.salvar(chave, foto.dataUrl);
      const salva = await store.create('fotos', {
        pessoaId: c.pessoaId, consultaId: c.id, angulo: foto.angulo, data: c.inicio, observacao: foto.observacao || '', chave,
      });
      fotoIds.push(salva.id);
    }
    if (dados.fotos.length) registros.push(`${dados.fotos.length} foto(s)`);

    await store.update('consultas', c.id, {
      status: 'realizada', realizadaEm: agora, anotacoes: dados.anotacoes, conduta: dados.conduta,
      proximoRetorno: dados.proximoRetorno, anamneseId, avaliacaoId, fotoIds,
    });

    if (dados.gerarCobranca) {
      await store.create('lancamentos', {
        pessoaId: c.pessoaId, servicoId: c.servicoId, consultaId: c.id, pacoteId: null, profissionalId: c.profissionalId,
        descricao: d.servico?.nome || 'Consulta', valor: dados.valor, desconto: 0, vencimento: hoje,
        status: dados.pagoAgora ? 'pago' : 'pendente',
        dataPagamento: dados.pagoAgora ? hoje : null,
        formaPagamento: dados.pagoAgora ? dados.formaPagamento : null,
      });
      registros.push(`cobrança de ${utils.moeda(dados.valor)}${dados.pagoAgora ? ' (paga)' : ' (pendente)'}`);
    }

    if (dados.receberExistente && dados.pagoAgora) {
      await store.update('lancamentos', d.cobrancaExistente.id, { status: 'pago', dataPagamento: hoje, formaPagamento: dados.formaPagamento });
      registros.push(`pagamento de ${utils.moeda(NutriDudu.calculos.valorLiquido(d.cobrancaExistente))} recebido`);
    }

    await interacao(`Atendimento registrado: ${d.servico?.nome || 'consulta'} de ${utils.data(c.inicio)}${registros.length ? ` — ${registros.join(', ')}` : ''}.`);

    // Pacote que chegou ao fim.
    if (d.pacote) {
      const consultasPacote = (await store.list('consultas', (x) => x.pacoteId === d.pacote.id));
      const uso = calculos.usoDoPacote(d.pacote, consultasPacote);
      if (uso.saldo === 0 && d.pacote.status === 'ativo') {
        await store.update('pacotes', d.pacote.id, { status: 'concluido' });
        await interacao(`Pacote ${d.servico?.nome || ''} concluído (${uso.total} de ${uso.total} consultas).`, 'pacote');
      }
    }

    // Funis: lead que fechou vira cliente; cliente começando ou voltando fica "Em tratamento".
    const p = d.pessoa;
    if (p.status === 'lead' && dados.tornarCliente) {
      await store.update('pessoas', p.id, {
        status: 'ativo', clienteDesde: p.clienteDesde || hoje, funil: 'acompanhamento', etapa: 'tratamento', etapaDesde: agora,
      });
      await interacao('Fechou com a clínica: passou a cliente ativo, em tratamento.', 'etapa');
    } else if (p.funil === 'acompanhamento' && ['inicio', 'retorno', 'renovado'].includes(p.etapa)) {
      await store.update('pessoas', p.id, { etapa: 'tratamento', etapaDesde: agora });
      await interacao('Movido(a) para "Em tratamento".', 'etapa');
    }
  }

  // ---------------- Janela ----------------

  async function abrir(consultaId) {
    const { modal, ui, utils, permissoes, avaliacao: A, anamnese, config, calculos } = NutriDudu;
    if (!permissoes.pode('registrarAtendimento')) {
      ui.toast('Só a nutricionista ou o administrador registram atendimentos.', 'info');
      return;
    }
    const d = await carregar(consultaId);
    if (!d) return;
    if (!['agendada', 'confirmada'].includes(d.consulta.status)) {
      ui.toast('Esta consulta já foi registrada ou não está mais agendada.', 'info');
      return;
    }
    if (utils.isoDia(d.consulta.inicio) > utils.isoDia(new Date())) {
      ui.toast('O atendimento pode ser registrado a partir do dia da consulta.', 'info');
      return;
    }

    const fotos = [];
    let passo = 0;
    const corpos = [passoAnamnese, passoAvaliacao, passoFotos, passoEvolucao, passoRetorno, passoFechamento].map((fn) => fn(d));

    const corpo = `
      <ol class="passos" aria-label="Etapas">
        ${PASSOS.map((p, i) => `<li><button type="button" data-ir-passo="${i}"><span class="passo-num">${i + 1}</span> ${p}</button></li>`).join('')}
      </ol>
      ${corpos.map((html, i) => `<section class="passo" data-passo="${i}"${i ? ' hidden' : ''} aria-label="${PASSOS[i]}"><h3 class="passo-titulo">${i + 1}. ${PASSOS[i]}</h3>${html}</section>`).join('')}
      <div class="passos-nav">
        <button type="button" class="btn" data-anterior>‹ Anterior</button>
        <button type="button" class="btn btn-primary" data-proximo>Próximo ›</button>
      </div>`;

    let formRef = null;
    const irPara = (n) => {
      passo = Math.max(0, Math.min(PASSOS.length - 1, n));
      formRef.querySelectorAll('[data-passo]').forEach((s) => { s.hidden = Number(s.dataset.passo) !== passo; });
      formRef.querySelectorAll('[data-ir-passo]').forEach((b) => {
        const i = Number(b.dataset.irPasso);
        b.classList.toggle('ativo', i === passo);
        b.classList.toggle('feito', i < passo);
        if (i === passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      formRef.querySelector('[data-anterior]').disabled = passo === 0;
      formRef.querySelector('[data-proximo]').hidden = passo === PASSOS.length - 1;
      formRef.closest('dialog').querySelector('[type="submit"]').hidden = passo !== PASSOS.length - 1;
      formRef.querySelector('.modal-corpo').scrollTop = 0;
      if (passo === PASSOS.length - 1) atualizarResumo();
    };

    const atualizarResumo = () => {
      const dados = ler(formRef, d, fotos);
      const itens = [];
      if (dados.anamnese) itens.push('anamnese atualizada');
      if (!avaliacaoVazia(dados.avaliacao)) itens.push('avaliação física registrada');
      if (fotos.length) itens.push(`${fotos.length} foto(s) guardada(s)`);
      if (dados.proximoRetorno) itens.push(`próximo retorno previsto para ${utils.data(dados.proximoRetorno)}`);
      formRef.querySelector('[data-resumo-itens]').textContent = itens.length ? `Também: ${itens.join('; ')}.` : 'Sem avaliação física nem fotos nesta consulta.';
      const usoEl = formRef.querySelector('[data-uso-pacote]');
      if (usoEl && d.pacote) {
        const uso = calculos.usoDoPacote(d.pacote, d.consultas.filter((x) => x.pacoteId === d.pacote.id).map((x) => (x.id === d.consulta.id ? { ...x, status: 'realizada' } : x)));
        usoEl.textContent = `Depois deste atendimento: ${uso.usadas} de ${uso.total} consultas usadas${uso.saldo === 0 ? ' — o pacote será concluído.' : '.'}`;
      }
    };

    const atualizarAvaliacao = () => {
      const av = lerAvaliacao(formRef);
      formRef.querySelectorAll('[data-so-dobras]').forEach((el) => { el.hidden = av.metodo !== 'dobras'; });
      formRef.querySelectorAll('[data-so-manual]').forEach((el) => { el.hidden = !av.metodo || av.metodo === 'dobras'; });
      const r = A.calcular(av, { sexo: d.pessoa.sexo, idade: utils.idade(d.pessoa.dataNascimento) });
      const item = (rotulo, valor) => `<div><span class="kpi-label">${rotulo}</span><strong>${valor}</strong></div>`;
      const fmt = (v, casas = 1) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
      const difPeso = av.pesoKg && d.anterior?.pesoKg ? av.pesoKg - d.anterior.pesoKg : null;
      formRef.querySelector('[data-resultado]').innerHTML = `
        ${item('IMC', r.imc === null ? '—' : `${fmt(r.imc)} <span class="muted small">${r.classificacaoImc}</span>`)}
        ${item('Cintura / quadril', fmt(r.rcq, 2))}
        ${item('Soma das dobras', r.somaDobras === null ? '—' : `${fmt(r.somaDobras)} mm`)}
        ${item('% de gordura', r.percentualGordura === null ? '—' : `${fmt(r.percentualGordura)}%`)}
        ${item('Massa gorda', r.massaGorda === null ? '—' : `${fmt(r.massaGorda)} kg`)}
        ${item('Massa magra', r.massaMagra === null ? '—' : `${fmt(r.massaMagra)} kg`)}
        ${difPeso !== null ? item('Desde a última', `${difPeso > 0 ? '+' : ''}${fmt(difPeso)} kg`) : ''}
        ${r.erroPercentual ? `<p class="texto-alerta small resultado-erro">${utils.escapeHtml(r.erroPercentual)}</p>` : ''}
        ${r.origemPercentual ? `<p class="muted small resultado-erro">% de gordura: ${utils.escapeHtml(r.origemPercentual)}.</p>` : ''}`;
    };

    const desenharFotos = () => {
      const area = formRef.querySelector('[data-fotos-novas]');
      if (!area) return;
      area.innerHTML = fotos.map((foto, i) => `
        <figure class="foto-nova">
          <img src="${foto.dataUrl}" alt="Foto ${i + 1}">
          <select data-angulo="${i}" aria-label="Ângulo da foto ${i + 1}">
            ${Object.entries(config.ANGULOS_FOTO).map(([v, r]) => `<option value="${v}"${v === foto.angulo ? ' selected' : ''}>${utils.escapeHtml(r)}</option>`).join('')}
          </select>
          <button type="button" class="btn-icone" data-tirar-foto="${i}" aria-label="Remover foto ${i + 1}">×</button>
        </figure>`).join('');
    };

    modal.formulario({
      titulo: `Atendimento · ${d.pessoa.nome}`,
      corpo,
      largo: true,
      textoSalvar: 'Concluir atendimento',
      ler: (form) => ler(form, d, fotos),
      validar: (dados) => {
        const erros = validar(dados, d);
        const primeiro = Object.keys(erros)[0];
        if (primeiro) irPara(passoDoCampo(primeiro));
        return erros;
      },
      salvar: async (dados) => {
        await salvar(dados, d);
        ui.toast('Atendimento registrado.');
        if (dados.agendarRetorno && dados.proximoRetorno) {
          setTimeout(() => NutriDudu.agendamento.abrir({
            pessoaId: d.pessoa.id, dia: dados.proximoRetorno, profissionalId: d.consulta.profissionalId,
          }), 50);
        }
      },
      aoAbrir: (form) => {
        formRef = form;
        // O corpo do modal rola; a lista de etapas fica no topo.
        anamnese.ligar(form);
        form.querySelector('[data-proximo]').addEventListener('click', () => irPara(passo + 1));
        form.querySelector('[data-anterior]').addEventListener('click', () => irPara(passo - 1));
        form.querySelectorAll('[data-ir-passo]').forEach((b) => b.addEventListener('click', () => irPara(Number(b.dataset.irPasso))));
        form.elements.atualizarAnamnese?.addEventListener?.('change', (e) => {
          form.querySelector('[data-editar-anamnese]').hidden = !e.target.checked;
        });
        form.addEventListener('input', (e) => {
          if (/^(av_|circ_|dob_)/.test(e.target.name || '')) atualizarAvaliacao();
        });
        form.addEventListener('change', (e) => {
          if (/^(av_|circ_|dob_)/.test(e.target.name || '')) atualizarAvaliacao();
          if (e.target.dataset.angulo !== undefined) fotos[Number(e.target.dataset.angulo)].angulo = e.target.value;
        });
        form.querySelector('[data-fotos]')?.addEventListener('change', async (e) => {
          for (const arquivo of e.target.files) {
            try {
              fotos.push({ dataUrl: await NutriDudu.fotosStore.reduzir(arquivo), angulo: 'frente' });
            } catch (erro) {
              ui.toast(erro.message, 'erro');
            }
          }
          e.target.value = '';
          desenharFotos();
        });
        form.addEventListener('click', (e) => {
          const tirar = e.target.closest('[data-tirar-foto]');
          if (tirar) { fotos.splice(Number(tirar.dataset.tirarFoto), 1); desenharFotos(); }
        });
        atualizarAvaliacao();
        irPara(0);
      },
    });
  }

  return { abrir, carregar, PASSOS };
})();
