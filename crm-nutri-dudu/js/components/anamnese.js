// Anamnese / ficha de avaliação: formulário por seções, listas estruturadas
// (alergias, contraindicações, medicamentos, exames) e versões.
// Cada revisão cria uma versão nova; as anteriores continuam guardadas.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.anamnese = (function () {
  const SECOES = {
    queixa: 'Queixa e objetivo',
    historicoSaude: 'Histórico de saúde',
    alergias: 'Alergias e intolerâncias',
    contraindicacoes: 'Contraindicações',
    medicamentos: 'Medicamentos e suplementos',
    habitosVida: 'Hábitos de vida',
    habitosAlimentares: 'Hábitos alimentares',
    exames: 'Exames',
  };

  const LISTAS = {
    alergias: {
      obrigatorio: 'substancia',
      colunas: [
        { campo: 'substancia', rotulo: 'Substância ou alimento', placeholder: 'Ex.: amendoim' },
        { campo: 'tipo', rotulo: 'Tipo', opcoes: { alergia: 'Alergia', intolerancia: 'Intolerância' } },
        { campo: 'gravidade', rotulo: 'Gravidade', opcoes: { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' } },
      ],
    },
    contraindicacoes: {
      obrigatorio: 'descricao',
      colunas: [
        { campo: 'descricao', rotulo: 'Contraindicação', placeholder: 'Ex.: evitar termogênicos' },
        { campo: 'observacao', rotulo: 'Motivo / observação', placeholder: 'Ex.: hipertensão' },
      ],
    },
    medicamentos: {
      obrigatorio: 'nome',
      colunas: [
        { campo: 'nome', rotulo: 'Nome', placeholder: 'Ex.: metformina' },
        { campo: 'dose', rotulo: 'Dose', placeholder: '500 mg' },
        { campo: 'frequencia', rotulo: 'Frequência', placeholder: '2x ao dia' },
        { campo: 'desde', rotulo: 'Desde', placeholder: '2025' },
      ],
    },
    exames: {
      obrigatorio: 'nome',
      colunas: [
        { campo: 'nome', rotulo: 'Exame', placeholder: 'Ex.: glicemia de jejum' },
        { campo: 'data', rotulo: 'Data', tipo: 'date' },
        { campo: 'resultado', rotulo: 'Resultado', placeholder: '92 mg/dL' },
      ],
    },
  };

  const TEXTOS = {
    queixa: 'Queixa principal, objetivo, expectativas, tentativas anteriores.',
    historicoSaude: 'Doenças, cirurgias, internações, histórico familiar, gestação/lactação, ciclo menstrual.',
    habitosVida: 'Sono, atividade física, água, álcool, tabagismo, intestino, estresse.',
    habitosAlimentares: 'Rotina de refeições, recordatório 24 h, preferências, aversões, quem cozinha.',
  };

  // ---------- Leitura das versões ----------

  /** Versão atual (a mais recente confirmada) e a pré-anamnese a revisar, se houver uma mais nova. */
  function situacao(anamneses) {
    const ordenadas = [...anamneses].sort((a, b) => b.versao - a.versao);
    const atual = ordenadas.find((a) => a.status !== 'a_revisar') || null;
    const pre = ordenadas.find((a) => a.status === 'a_revisar' && (!atual || a.versao > atual.versao)) || null;
    return { atual, pre, versoes: ordenadas.filter((a) => a.status !== 'a_revisar') };
  }

  /** Alertas que ficam em vermelho na ficha: alergias graves e contraindicações. */
  function alertas(anamnese) {
    if (!anamnese) return [];
    return [
      ...(anamnese.alergias || []).filter((a) => a.gravidade === 'grave').map((a) => `Alergia: ${a.substancia} (grave)`),
      ...(anamnese.contraindicacoes || []).map((c) => `Contraindicação: ${c.descricao}`),
    ];
  }

  /** Quais seções mudaram de uma versão para a outra. */
  function mudancas(anterior, nova) {
    // Listas são comparadas coluna a coluna, sem depender da ordem em que os campos foram gravados.
    const norm = (obj, campo) => JSON.stringify(LISTAS[campo]
      ? (obj?.[campo] || []).map((item) => LISTAS[campo].colunas.map((c) => item[c.campo] || ''))
      : (obj?.[campo] || '').trim());
    return Object.entries(SECOES)
      .filter(([campo]) => norm(anterior, campo) !== norm(nova, campo))
      .map(([, nome]) => nome);
  }

  // ---------- Formulário ----------

  function linhaLista(nome, item = {}) {
    const { escapeHtml } = NutriDudu.utils;
    return `
      <div class="linha-lista">
        ${LISTAS[nome].colunas.map((c) => (c.opcoes
          ? `<select data-campo="${c.campo}" aria-label="${escapeHtml(c.rotulo)}">
              ${Object.entries(c.opcoes).map(([v, r]) => `<option value="${v}"${(item[c.campo] || Object.keys(c.opcoes)[0]) === v ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('')}
            </select>`
          : `<input type="${c.tipo || 'text'}" data-campo="${c.campo}" value="${escapeHtml(item[c.campo] || '')}" placeholder="${escapeHtml(c.placeholder || '')}" aria-label="${escapeHtml(c.rotulo)}">`)).join('')}
        <button type="button" class="btn-icone" data-remover-linha aria-label="Remover">×</button>
      </div>`;
  }

  function listaHtml(nome, itens) {
    const { escapeHtml } = NutriDudu.utils;
    return `
      <div class="lista-editor" data-lista="${nome}">
        <div class="linha-lista cabecalho-lista" aria-hidden="true">
          ${LISTAS[nome].colunas.map((c) => `<span>${escapeHtml(c.rotulo)}</span>`).join('')}<span></span>
        </div>
        <div data-linhas>${(itens || []).map((i) => linhaLista(nome, i)).join('')}</div>
        <button type="button" class="btn-link" data-adicionar-linha="${nome}">+ adicionar</button>
        <p class="campo-erro" data-erro-para="${nome}" role="alert"></p>
      </div>`;
  }

  /** HTML dos campos (usado na revisão avulsa e no registro do atendimento). */
  function campos(a = {}) {
    const f = NutriDudu.form;
    const secao = (campo, corpo, aberta = true) => `
      <details class="secao-anamnese"${aberta ? ' open' : ''}>
        <summary>${SECOES[campo]}</summary>
        ${corpo}
      </details>`;
    const texto = (campo) => f.areaTexto(`an_${campo}`, SECOES[campo], a[campo] || '', { linhas: 3, ajuda: TEXTOS[campo] });
    return `
      <div class="anamnese-form">
        ${secao('queixa', texto('queixa'))}
        ${secao('historicoSaude', texto('historicoSaude'))}
        ${secao('alergias', listaHtml('alergias', a.alergias))}
        ${secao('contraindicacoes', listaHtml('contraindicacoes', a.contraindicacoes))}
        ${secao('medicamentos', listaHtml('medicamentos', a.medicamentos))}
        ${secao('habitosVida', texto('habitosVida'), !!a.habitosVida)}
        ${secao('habitosAlimentares', texto('habitosAlimentares'), !!a.habitosAlimentares)}
        ${secao('exames', listaHtml('exames', a.exames), !!a.exames?.length)}
      </div>`;
  }

  /** Liga os botões "+ adicionar" e "×" das listas. */
  function ligar(raiz) {
    raiz.addEventListener('click', (e) => {
      const add = e.target.closest('[data-adicionar-linha]');
      if (add) {
        const nome = add.dataset.adicionarLinha;
        const linhas = raiz.querySelector(`[data-lista="${nome}"] [data-linhas]`);
        linhas.insertAdjacentHTML('beforeend', linhaLista(nome));
        linhas.lastElementChild.querySelector('input, select').focus();
      }
      const rem = e.target.closest('[data-remover-linha]');
      if (rem) rem.closest('.linha-lista').remove();
    });
  }

  function ler(raiz) {
    const valor = (nome) => (raiz.querySelector(`[name="an_${nome}"]`)?.value || '').trim();
    const dados = {};
    ['queixa', 'historicoSaude', 'habitosVida', 'habitosAlimentares'].forEach((c) => { dados[c] = valor(c); });
    Object.keys(LISTAS).forEach((nome) => {
      dados[nome] = [...raiz.querySelectorAll(`[data-lista="${nome}"] [data-linhas] .linha-lista`)].map((linha) => {
        const item = {};
        linha.querySelectorAll('[data-campo]').forEach((el) => { item[el.dataset.campo] = el.value.trim(); });
        return item;
      // Linha só com os valores padrão das listas de opções = linha vazia.
      }).filter((item) => LISTAS[nome].colunas.some((c) => !c.opcoes && item[c.campo]));
    });
    return dados;
  }

  function validar(dados) {
    const erros = {};
    Object.entries(LISTAS).forEach(([nome, def]) => {
      if (dados[nome].some((item) => !item[def.obrigatorio])) {
        const col = def.colunas.find((c) => c.campo === def.obrigatorio);
        erros[nome] = `Preencha "${col.rotulo.toLowerCase()}" em todas as linhas, ou remova a linha.`;
      }
    });
    return erros;
  }

  /** Grava uma nova versão confirmada; a pré-anamnese revisada deixa de estar "a revisar". */
  async function salvarVersao(pessoaId, dados, { consultaId = null } = {}) {
    const { store, permissoes } = NutriDudu;
    const todas = await store.list('anamneses', (a) => a.pessoaId === pessoaId);
    const { atual, pre } = situacao(todas);
    const versao = Math.max(0, ...todas.filter((a) => a.origem !== 'pre').map((a) => a.versao)) + 1;
    const nova = await store.create('anamneses', {
      pessoaId, consultaId, versao, origem: consultaId ? 'consulta' : 'revisao', status: 'confirmada',
      autor: permissoes.atual(), ...dados,
    });
    if (pre) await store.update('anamneses', pre.id, { status: 'revisada' });
    const mudou = mudancas(atual, dados);
    await store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
      descricao: `Anamnese ${atual ? 'atualizada' : 'registrada'} (versão ${versao})${mudou.length ? `: ${mudou.join(', ').toLowerCase()}` : ''}.`,
    });
    return nova;
  }

  /** Revisão avulsa (fora de um atendimento), aberta pela aba Anamnese. */
  async function abrir(pessoa) {
    const { store, modal, ui } = NutriDudu;
    const { atual, pre } = situacao(await store.list('anamneses', (a) => a.pessoaId === pessoa.id));
    const base = pre || atual || {};
    modal.formulario({
      titulo: atual ? `Revisar anamnese de ${pessoa.nome}` : `Anamnese de ${pessoa.nome}`,
      corpo: `${pre ? '<p class="alerta alerta-aviso">Preenchido a partir da pré-anamnese enviada pelo paciente. Confira cada seção antes de salvar.</p>' : ''}${campos(base)}`,
      largo: true,
      textoSalvar: atual ? 'Salvar nova versão' : 'Salvar anamnese',
      ler,
      validar,
      salvar: async (dados) => {
        if (atual && !mudancas(atual, dados).length && !pre) throw new Error('Nada mudou em relação à versão atual.');
        await salvarVersao(pessoa.id, dados);
        ui.toast('Anamnese salva.');
      },
      aoAbrir: ligar,
    });
  }

  return { SECOES, LISTAS, situacao, alertas, mudancas, campos, ligar, ler, validar, salvarVersao, abrir };
})();
