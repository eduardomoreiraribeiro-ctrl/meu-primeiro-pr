window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.configuracoes = (function () {
  const CORES_SUGERIDAS = ['#16a34a', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2', '#4d7c0f', '#b45309'];
  // Ordem de exibição: segunda a domingo.
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
  const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  const minutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  // ---------------- Profissionais ----------------

  function validarProfissional(dados, profissionais) {
    const { utils } = NutriDudu;
    const erros = {};
    if (!dados.nome) erros.nome = 'Informe o nome.';
    else if (profissionais.some((p) => p.id !== dados.id && utils.normalizar(p.nome) === utils.normalizar(dados.nome))) {
      erros.nome = 'Já existe um profissional com esse nome.';
    }
    if (!dados.registro) erros.registro = 'Informe o registro profissional (CRN).';
    if (!/^#[0-9a-f]{6}$/i.test(dados.cor)) erros.cor = 'Escolha uma cor.';
    if (!['admin', 'profissional'].includes(dados.perfil)) erros.perfil = 'Escolha o perfil de acesso.';

    // A clínica nunca pode ficar sem um administrador ativo.
    const outrosAdmins = profissionais.filter((p) => p.id !== dados.id && p.ativo && p.perfil === 'admin');
    if (dados.id && !outrosAdmins.length && dados.perfil !== 'admin') {
      erros.perfil = 'Este é o único administrador ativo. Defina outro administrador antes de mudar o perfil.';
    }
    return erros;
  }

  function abrirProfissional(prof, profissionais, servicos) {
    const { form: f, modal, store, ui, utils } = NutriDudu;
    const novo = !prof;
    const corLivre = CORES_SUGERIDAS.find((c) => !profissionais.some((p) => p.cor === c)) || CORES_SUGERIDAS[0];
    const p = prof || { nome: '', registro: 'Nutricionista — CRN ', cor: corLivre, perfil: 'profissional', ativo: true };
    const realiza = servicos.filter((s) => prof && s.profissionalIds.includes(prof.id)).map((s) => s.nome);

    const corpo = `
      ${f.texto('nome', 'Nome', p.nome, { obrigatorio: true, placeholder: 'Ex.: Dra. Ana Lima' })}
      ${f.texto('registro', 'Registro profissional', p.registro, { obrigatorio: true, placeholder: 'Nutricionista — CRN-3 00000' })}
      <div class="grade-2">
        ${f.selecao('perfil', 'Perfil de acesso', [['profissional', 'Profissional'], ['admin', 'Administrador']], p.perfil, {
          ajuda: 'O administrador configura serviços, preços, profissionais e o agente.',
        })}
        <div class="campo">
          <label for="f-cor">Cor na agenda <span class="obrigatorio" aria-hidden="true">*</span></label>
          <div class="cores">
            <input id="f-cor" name="cor" type="color" value="${utils.escapeHtml(p.cor)}">
            ${CORES_SUGERIDAS.map((c) => `<button type="button" class="cor-amostra" style="background:${c}" data-cor="${c}" aria-label="Usar a cor ${c}"></button>`).join('')}
          </div>
          <p class="campo-erro" data-erro-para="cor" role="alert"></p>
        </div>
      </div>
      ${novo ? '' : `<p class="campo-ajuda">Serviços que realiza: ${utils.escapeHtml(realiza.join(', ') || 'nenhum')}. Para mudar, edite cada serviço em Serviços.</p>`}
    `;

    modal.formulario({
      titulo: novo ? 'Novo profissional' : `Editar ${p.nome}`,
      corpo,
      textoSalvar: novo ? 'Cadastrar profissional' : 'Salvar alterações',
      ler: (form) => ({
        id: prof?.id,
        nome: f.valor(form, 'nome'),
        registro: f.valor(form, 'registro'),
        cor: f.valor(form, 'cor'),
        perfil: f.valor(form, 'perfil'),
      }),
      validar: (dados) => validarProfissional(dados, profissionais),
      salvar: async ({ id, ...campos }) => {
        if (novo) await store.create('profissionais', { ...campos, ativo: true });
        else await store.update('profissionais', id, campos);
        ui.toast(novo ? 'Profissional cadastrado. Agora defina os horários de atendimento.' : 'Profissional atualizado.');
      },
      aoAbrir: (form) => {
        form.querySelectorAll('[data-cor]').forEach((b) => b.addEventListener('click', () => {
          form.elements.cor.value = b.dataset.cor;
        }));
      },
    });
  }

  async function alternarProfissional(prof, profissionais, consultas) {
    const { store, ui, modal } = NutriDudu;
    if (prof.ativo) {
      const ativos = profissionais.filter((p) => p.ativo);
      if (ativos.length === 1) {
        ui.toast('A clínica precisa de pelo menos um profissional ativo.', 'info');
        return;
      }
      if (prof.perfil === 'admin' && !ativos.some((p) => p.id !== prof.id && p.perfil === 'admin')) {
        ui.toast('Este é o único administrador ativo. Defina outro administrador antes.', 'info');
        return;
      }
      const futuras = consultas.filter((c) => c.profissionalId === prof.id &&
        ['agendada', 'confirmada'].includes(c.status) && new Date(c.inicio) >= new Date()).length;
      const ok = await modal.confirmar({
        titulo: `Desativar ${prof.nome}?`,
        mensagem: `A agenda deixa de oferecer horários com este profissional. O histórico continua guardado.${futuras ? ` Atenção: há ${futuras} consulta(s) futura(s) marcada(s) com ele(a) — remarque-as.` : ''}`,
        textoConfirmar: 'Desativar',
      });
      if (!ok) return;
    }
    await store.update('profissionais', prof.id, { ativo: !prof.ativo });
    ui.toast(prof.ativo ? 'Profissional desativado.' : 'Profissional reativado.');
  }

  // ---------------- Horários de atendimento ----------------

  function linhaPeriodo(periodo = { inicio: '', fim: '', modalidade: 'ambos' }) {
    const { config, utils } = NutriDudu;
    return `
      <div class="periodo">
        <input type="time" data-campo="inicio" value="${utils.escapeHtml(periodo.inicio)}" aria-label="Início" step="300">
        <span class="muted small">às</span>
        <input type="time" data-campo="fim" value="${utils.escapeHtml(periodo.fim)}" aria-label="Fim" step="300">
        <select data-campo="modalidade" aria-label="Modalidade">
          ${Object.entries(config.MODALIDADES).map(([v, r]) => `<option value="${v}"${v === periodo.modalidade ? ' selected' : ''}>${utils.escapeHtml(r)}</option>`).join('')}
        </select>
        <button type="button" class="btn-icone" data-remover aria-label="Remover período">×</button>
      </div>`;
  }

  /** Lê os períodos do editor: [{ diaSemana, inicio, fim, modalidade }]. */
  function lerHorarios(form) {
    const periodos = [];
    form.querySelectorAll('[data-dia]').forEach((dia) => {
      dia.querySelectorAll('.periodo').forEach((linha) => {
        const campo = (nome) => linha.querySelector(`[data-campo="${nome}"]`).value.trim();
        periodos.push({ diaSemana: Number(dia.dataset.dia), inicio: campo('inicio'), fim: campo('fim'), modalidade: campo('modalidade') });
      });
    });
    return periodos;
  }

  function validarHorarios(periodos) {
    const { DIAS_SEMANA } = NutriDudu.config;
    const problemas = [];
    ORDEM_DIAS.forEach((d) => {
      const doDia = periodos.filter((p) => p.diaSemana === d);
      doDia.forEach((p) => {
        if (!HORA_RE.test(p.inicio) || !HORA_RE.test(p.fim)) problemas.push(`${DIAS_SEMANA[d]}: preencha o início e o fim de cada período.`);
        else if (minutos(p.fim) <= minutos(p.inicio)) problemas.push(`${DIAS_SEMANA[d]}: o período ${p.inicio}–${p.fim} termina antes de começar.`);
      });
      const validos = doDia.filter((p) => HORA_RE.test(p.inicio) && HORA_RE.test(p.fim)).sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
      for (let i = 1; i < validos.length; i++) {
        if (minutos(validos[i].inicio) < minutos(validos[i - 1].fim)) {
          problemas.push(`${DIAS_SEMANA[d]}: os períodos ${validos[i - 1].inicio}–${validos[i - 1].fim} e ${validos[i].inicio}–${validos[i].fim} se sobrepõem.`);
        }
      }
    });
    return problemas.length ? { _geral: [...new Set(problemas)].join(' ') } : {};
  }

  function abrirHorarios(prof, horarios) {
    const { config, modal, store, ui, utils } = NutriDudu;
    const seus = horarios.filter((h) => h.profissionalId === prof.id);

    const corpo = `
      <p class="campo-ajuda">Defina os períodos em que ${utils.escapeHtml(prof.nome)} atende. Dias sem período ficam fechados na agenda. O agente do WhatsApp só oferece horários dentro destes períodos.</p>
      <div class="horarios-editor">
        ${ORDEM_DIAS.map((d) => `
          <div class="dia-horario" data-dia="${d}">
            <span class="dia-nome">${config.DIAS_SEMANA[d]}</span>
            <div class="periodos">
              ${seus.filter((h) => h.diaSemana === d).sort((a, b) => a.inicio.localeCompare(b.inicio)).map(linhaPeriodo).join('')}
            </div>
            <button type="button" class="btn-link" data-adicionar>+ período</button>
          </div>`).join('')}
      </div>`;

    modal.formulario({
      titulo: `Horários de ${prof.nome}`,
      corpo,
      largo: true,
      ler: lerHorarios,
      validar: validarHorarios,
      salvar: async (periodos) => {
        await store.substituir('horarios', (h) => h.profissionalId === prof.id,
          periodos.map((p) => ({ ...p, profissionalId: prof.id })));
        ui.toast('Horários de atendimento salvos.');
      },
      aoAbrir: (form) => {
        form.addEventListener('click', (e) => {
          const adicionar = e.target.closest('[data-adicionar]');
          if (adicionar) {
            const lista = adicionar.closest('[data-dia]').querySelector('.periodos');
            // Sugere o período seguinte ao último do dia.
            const ultimo = [...lista.querySelectorAll('[data-campo="fim"]')].pop()?.value;
            const sugestao = ultimo ? { inicio: ultimo < '14:00' ? '14:00' : ultimo, fim: '18:00', modalidade: 'ambos' } : { inicio: '08:00', fim: '12:00', modalidade: 'ambos' };
            lista.insertAdjacentHTML('beforeend', linhaPeriodo(sugestao));
            lista.lastElementChild.querySelector('input').focus();
          }
          const remover = e.target.closest('[data-remover]');
          if (remover) remover.closest('.periodo').remove();
        });
      },
    });
  }

  // ---------------- Bloqueios ----------------

  function descreverBloqueio(b) {
    const { utils } = NutriDudu;
    if (b.diaInteiro) {
      const ini = utils.data(b.inicio);
      const fim = utils.data(b.fim);
      return ini === fim ? `${ini}, dia inteiro` : `${ini} a ${fim}, dias inteiros`;
    }
    const mesmoDia = utils.isoDia(b.inicio) === utils.isoDia(b.fim);
    return mesmoDia
      ? `${utils.data(b.inicio)}, ${utils.hora(b.inicio)}–${utils.hora(b.fim)}`
      : `${utils.data(b.inicio)} ${utils.hora(b.inicio)} a ${utils.data(b.fim)} ${utils.hora(b.fim)}`;
  }

  function lerBloqueio(form) {
    const f = NutriDudu.form;
    const diaInteiro = f.marcado(form, 'diaInteiro');
    const dataInicio = f.valor(form, 'dataInicio');
    const dataFim = f.valor(form, 'dataFim') || dataInicio;
    const horaInicio = diaInteiro ? '00:00' : f.valor(form, 'horaInicio');
    const horaFim = diaInteiro ? '23:59' : f.valor(form, 'horaFim');
    const quando = (d, h) => (d && HORA_RE.test(h) ? new Date(`${d}T${h}`) : null);
    return {
      profissionalId: f.valor(form, 'profissionalId') || null,
      motivo: f.valor(form, 'motivo'),
      diaInteiro,
      dataInicio, dataFim, horaInicio, horaFim,
      inicio: quando(dataInicio, horaInicio),
      fim: quando(dataFim, horaFim),
    };
  }

  function validarBloqueio(d) {
    const erros = {};
    if (!d.dataInicio) erros.dataInicio = 'Informe a data.';
    if (!d.diaInteiro && !HORA_RE.test(d.horaInicio)) erros.horaInicio = 'Informe a hora de início.';
    if (!d.diaInteiro && !HORA_RE.test(d.horaFim)) erros.horaFim = 'Informe a hora de fim.';
    if (d.inicio && d.fim && d.fim <= d.inicio) erros.dataFim = 'O fim precisa ser depois do início.';
    else if (d.fim && d.fim <= new Date()) erros.dataFim = 'Esse período já passou. Bloqueios servem para horários futuros.';
    if (!d.motivo) erros.motivo = 'Informe o motivo (ex.: férias, feriado, curso).';
    return erros;
  }

  function abrirBloqueio(profissionais, consultas) {
    const { form: f, modal, store, ui, utils, permissoes } = NutriDudu;
    const opcoes = [
      ...(permissoes.podeEditarBloqueios(null) ? [['', 'Clínica toda']] : []),
      ...profissionais.filter((p) => p.ativo && permissoes.podeEditarBloqueios(p.id)).map((p) => [p.id, p.nome]),
    ];
    const hoje = utils.isoDia(new Date());

    const corpo = `
      ${f.selecao('profissionalId', 'Agenda bloqueada', opcoes, opcoes[0]?.[0] ?? '')}
      ${f.texto('motivo', 'Motivo', '', { obrigatorio: true, placeholder: 'Ex.: Férias, Feriado, Curso' })}
      ${f.chave('diaInteiro', 'Dia inteiro', true)}
      <div class="grade-2">
        ${f.texto('dataInicio', 'De', hoje, { tipo: 'date', obrigatorio: true })}
        ${f.texto('dataFim', 'Até', hoje, { tipo: 'date' })}
        ${f.texto('horaInicio', 'Hora de início', '08:00', { tipo: 'time', classe: 'so-com-hora' })}
        ${f.texto('horaFim', 'Hora de fim', '12:00', { tipo: 'time', classe: 'so-com-hora' })}
      </div>
      <p class="alerta alerta-aviso" data-conflitos hidden></p>
    `;

    modal.formulario({
      titulo: 'Novo bloqueio na agenda',
      corpo,
      textoSalvar: 'Bloquear',
      ler: lerBloqueio,
      validar: validarBloqueio,
      salvar: async (d) => {
        await store.create('bloqueios', {
          profissionalId: d.profissionalId,
          inicio: d.inicio.toISOString(),
          fim: d.fim.toISOString(),
          diaInteiro: d.diaInteiro,
          motivo: d.motivo,
        });
        ui.toast('Bloqueio criado.');
      },
      aoAbrir: (form) => {
        const aviso = form.querySelector('[data-conflitos]');
        const atualizar = () => {
          const d = lerBloqueio(form);
          form.querySelectorAll('.so-com-hora').forEach((el) => { el.hidden = d.diaInteiro; });
          // Mantém o "até" depois do "de".
          if (form.elements.dataFim.value < form.elements.dataInicio.value) form.elements.dataFim.value = form.elements.dataInicio.value;

          const conflitos = d.inicio && d.fim && d.fim > d.inicio
            ? consultas.filter((c) => ['agendada', 'confirmada'].includes(c.status) &&
                (!d.profissionalId || c.profissionalId === d.profissionalId) &&
                new Date(c.inicio) < d.fim && new Date(c.fim) > d.inicio).length
            : 0;
          aviso.hidden = !conflitos;
          aviso.textContent = conflitos
            ? `Atenção: há ${conflitos} consulta(s) marcada(s) nesse intervalo. Elas não são remarcadas automaticamente — avise os pacientes.`
            : '';
        };
        form.addEventListener('input', atualizar);
        form.addEventListener('change', atualizar);
        atualizar();
      },
    });
  }

  async function excluirBloqueio(b) {
    const { modal, store, ui } = NutriDudu;
    const ok = await modal.confirmar({
      titulo: 'Remover bloqueio?',
      mensagem: `"${b.motivo}" (${descreverBloqueio(b)}). Os horários voltam a ficar livres na agenda.`,
      textoConfirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;
    await store.remove('bloqueios', b.id);
    ui.toast('Bloqueio removido.');
  }

  // ---------------- Regras gerais ----------------

  function abrirRegras(geral) {
    const { form: f, modal, store, ui } = NutriDudu;
    const corpo = `
      ${f.texto('diasRetornoPadrao', 'Alerta de retorno após (dias)', geral.diasRetornoPadrao, {
        tipo: 'number', obrigatorio: true, atributos: 'min="7" max="365" step="1"',
        ajuda: 'Cliente ativo sem consulta há mais que isso e sem retorno marcado gera alerta (fase 7).',
      })}
      ${f.texto('diasClienteSumido', 'Cliente sumido após (dias)', geral.diasClienteSumido, {
        tipo: 'number', obrigatorio: true, atributos: 'min="8" max="730" step="1"',
        ajuda: 'Depois disso, o sistema sugere marcar como inativo e enviar reativação.',
      })}
      ${f.texto('intervaloEntreConsultasMin', 'Intervalo entre consultas (min)', geral.intervaloEntreConsultasMin, {
        tipo: 'number', obrigatorio: true, atributos: 'min="0" max="60" step="5"',
      })}
      ${f.texto('chavePix', 'Chave Pix da clínica', geral.chavePix, {
        ajuda: 'Enviada pelo agente nos lembretes de pagamento (fase 10).',
      })}
    `;
    modal.formulario({
      titulo: 'Regras gerais',
      corpo,
      ler: (form) => ({
        diasRetornoPadrao: f.numero(form, 'diasRetornoPadrao'),
        diasClienteSumido: f.numero(form, 'diasClienteSumido'),
        intervaloEntreConsultasMin: f.numero(form, 'intervaloEntreConsultasMin'),
        chavePix: f.valor(form, 'chavePix'),
      }),
      validar: (d) => {
        const erros = {};
        const faixa = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
        if (!faixa(d.diasRetornoPadrao, 7, 365)) erros.diasRetornoPadrao = 'Use um número inteiro entre 7 e 365.';
        if (!faixa(d.diasClienteSumido, 8, 730)) erros.diasClienteSumido = 'Use um número inteiro entre 8 e 730.';
        else if (!erros.diasRetornoPadrao && d.diasClienteSumido <= d.diasRetornoPadrao) {
          erros.diasClienteSumido = 'Precisa ser maior que o prazo do alerta de retorno.';
        }
        if (!faixa(d.intervaloEntreConsultasMin, 0, 60)) erros.intervaloEntreConsultasMin = 'Use um número inteiro entre 0 e 60.';
        return erros;
      },
      salvar: async (d) => {
        await store.update('configuracoes', 'geral', d);
        ui.toast('Regras salvas.');
      },
    });
  }

  // ---------------- Página ----------------

  async function render(container) {
    const { store, ui, config, utils, permissoes } = NutriDudu;
    const [profissionais, horarios, bloqueios, geral, servicos, consultas] = await Promise.all([
      store.list('profissionais'),
      store.list('horarios'),
      store.list('bloqueios'),
      store.get('configuracoes', 'geral'),
      store.list('servicos'),
      store.list('consultas'),
    ]);
    const podeProf = permissoes.pode('editarProfissionais');
    const nomeProf = Object.fromEntries(profissionais.map((p) => [p.id, p.nome]));
    const agora = new Date();

    const blocoProfissional = (prof) => {
      const tabela = ORDEM_DIAS.map((d) => {
        const periodos = horarios
          .filter((h) => h.profissionalId === prof.id && h.diaSemana === d)
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
          .map((h) => `<span class="sem-quebra">${utils.escapeHtml(`${h.inicio}–${h.fim}${h.modalidade !== 'ambos' ? ` (${config.MODALIDADES[h.modalidade].toLowerCase()})` : ''}`)}</span>`);
        return `<tr><th scope="row">${config.DIAS_SEMANA[d]}</th><td>${periodos.length ? periodos.join(' e ') : '<span class="muted">Fechado</span>'}</td></tr>`;
      }).join('');
      const realiza = servicos.filter((s) => s.ativo && s.profissionalIds.includes(prof.id)).map((s) => s.nome);

      return `
        <section class="card${prof.ativo ? '' : ' inativo'}">
          <div class="prof-topo">
            <span class="ponto grande" style="background:${utils.escapeHtml(prof.cor)}"></span>
            <div class="prof-nome">
              <h3 class="card-title">${utils.escapeHtml(prof.nome)}</h3>
              <p class="muted small">${utils.escapeHtml(prof.registro)}</p>
            </div>
            <div class="prof-badges">
              ${ui.badge(config.PERFIS[prof.perfil] || prof.perfil, prof.perfil === 'admin' ? 'info' : 'neutro')}
              ${prof.ativo ? '' : ui.badge('Inativo')}
            </div>
          </div>
          <p class="small muted">Serviços: ${utils.escapeHtml(realiza.join(', ') || 'nenhum')}</p>
          <h4 class="subtitulo">Horários de atendimento</h4>
          <table class="tabela-simples">${tabela}</table>
          <div class="acoes-linha">
            ${permissoes.podeEditarHorarios(prof.id) && prof.ativo ? `<button type="button" class="btn btn-pequeno" data-horarios="${prof.id}">Editar horários</button>` : ''}
            ${podeProf ? `
              <button type="button" class="btn btn-pequeno" data-editar-prof="${prof.id}">Editar dados</button>
              <button type="button" class="btn btn-pequeno" data-ativo-prof="${prof.id}">${prof.ativo ? 'Desativar' : 'Reativar'}</button>` : ''}
          </div>
        </section>`;
    };

    const futuros = bloqueios.filter((b) => new Date(b.fim) >= agora).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const passados = bloqueios.filter((b) => new Date(b.fim) < agora).sort((a, b) => b.inicio.localeCompare(a.inicio));
    const itemBloqueio = (b) => `
      <li>
        <span class="agenda-info">
          <strong>${utils.escapeHtml(b.motivo)}</strong>
          <span class="muted small">${utils.escapeHtml(descreverBloqueio(b))} · ${utils.escapeHtml(b.profissionalId ? (nomeProf[b.profissionalId] || 'Profissional removido') : 'Clínica toda')}</span>
        </span>
        ${permissoes.podeEditarBloqueios(b.profissionalId) ? `<button type="button" class="btn btn-pequeno btn-texto-perigo" data-remover-bloqueio="${b.id}">Remover</button>` : ''}
      </li>`;
    const podeCriarBloqueio = permissoes.podeEditarBloqueios(null) || profissionais.some((p) => p.ativo && permissoes.podeEditarBloqueios(p.id));

    const ordenados = [...profissionais].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));

    container.innerHTML = `
      ${ui.cabecalho('Configurações', 'Profissionais, horários e regras da clínica')}

      <div class="secao-cabecalho">
        <h2 class="secao-titulo">Profissionais</h2>
        ${podeProf ? '<button type="button" class="btn btn-primary btn-pequeno" data-novo-prof>+ Novo profissional</button>' : ''}
      </div>
      <div class="grid-largo">${ordenados.map(blocoProfissional).join('')}</div>

      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Bloqueios na agenda</h2>
          ${podeCriarBloqueio ? '<button type="button" class="btn btn-pequeno" data-novo-bloqueio>+ Novo bloqueio</button>' : ''}
        </div>
        <p class="muted small card-sub">Férias, feriados e compromissos: a agenda e o agente não oferecem esses horários.</p>
        ${futuros.length ? `<ul class="lista-simples">${futuros.map(itemBloqueio).join('')}</ul>` : ui.vazio('Nenhum bloqueio programado.')}
        ${passados.length ? `
          <details class="anteriores">
            <summary class="small">Ver ${passados.length} bloqueio(s) anterior(es)</summary>
            <ul class="lista-simples">${passados.map(itemBloqueio).join('')}</ul>
          </details>` : ''}
      </section>

      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Regras gerais</h2>
          ${permissoes.pode('editarRegras') ? '<button type="button" class="btn btn-pequeno" data-editar-regras>Editar</button>' : ''}
        </div>
        <table class="tabela-simples">
          <tr><th scope="row">Alerta de retorno após</th><td>${geral?.diasRetornoPadrao ?? '—'} dias sem consulta e sem retorno marcado</td></tr>
          <tr><th scope="row">Cliente sumido após</th><td>${geral?.diasClienteSumido ?? '—'} dias</td></tr>
          <tr><th scope="row">Intervalo entre consultas</th><td>${geral?.intervaloEntreConsultasMin ?? '—'} min</td></tr>
          <tr><th scope="row">Chave Pix</th><td>${utils.escapeHtml(geral?.chavePix || '—')}</td></tr>
        </table>
      </section>

      ${ui.emBreve('7 e 10', [
        'Regras de retorno e recorrência aplicadas no Dashboard, na lista de clientes e no Kanban (fase 7)',
        'Textos do agente de IA e das mensagens automáticas do WhatsApp (fase 10)',
      ])}
    `;

    const porId = (lista, id) => lista.find((x) => x.id === id);
    container.querySelector('[data-novo-prof]')?.addEventListener('click', () => abrirProfissional(null, profissionais, servicos));
    container.querySelectorAll('[data-editar-prof]').forEach((b) => b.addEventListener('click', () => abrirProfissional(porId(profissionais, b.dataset.editarProf), profissionais, servicos)));
    container.querySelectorAll('[data-ativo-prof]').forEach((b) => b.addEventListener('click', () => alternarProfissional(porId(profissionais, b.dataset.ativoProf), profissionais, consultas)));
    container.querySelectorAll('[data-horarios]').forEach((b) => b.addEventListener('click', () => abrirHorarios(porId(profissionais, b.dataset.horarios), horarios)));
    container.querySelector('[data-novo-bloqueio]')?.addEventListener('click', () => abrirBloqueio(profissionais, consultas));
    container.querySelectorAll('[data-remover-bloqueio]').forEach((b) => b.addEventListener('click', () => excluirBloqueio(porId(bloqueios, b.dataset.removerBloqueio))));
    container.querySelector('[data-editar-regras]')?.addEventListener('click', () => abrirRegras(geral));
  }

  return { titulo: 'Configurações', render, validarHorarios, validarProfissional, validarBloqueio };
})();
