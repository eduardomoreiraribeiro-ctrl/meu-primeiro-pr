// Agendar, remarcar, confirmar, marcar falta e cancelar consultas.
// Usado pela Agenda, pelo "+ Novo › Consulta" e pela ficha do cliente.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.agendamento = (function () {
  const ATIVAS = ['agendada', 'confirmada'];

  async function carregar() {
    const { store } = NutriDudu;
    const [pessoas, profissionais, servicos, horarios, bloqueios, consultas, pacotes, geral] = await Promise.all([
      store.list('pessoas'), store.list('profissionais'), store.list('servicos'), store.list('horarios'),
      store.list('bloqueios'), store.list('consultas'), store.list('pacotes'), store.get('configuracoes', 'geral'),
    ]);
    const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
    const pessoaPorId = porId(pessoas);
    const profPorId = porId(profissionais);
    return {
      pessoas, profissionais, servicos, horarios, bloqueios, consultas, pacotes, geral: geral || {},
      pessoaPorId, profPorId, servicoPorId: porId(servicos),
      // Contexto usado pelas regras de NutriDudu.agenda.
      ctx: {
        horarios, bloqueios, consultas, geral: geral || {},
        nomePessoa: (id) => pessoaPorId[id]?.nome || 'outro paciente',
        nomeProfissional: (id) => profPorId[id]?.nome || 'O profissional',
      },
    };
  }

  // Quem está agendando, no vocabulário da consulta.
  const agendadaPorAtual = () => (NutriDudu.permissoes.atual() === 'recepcao' ? 'recepcao' : 'profissional');

  function quando(c) {
    const { utils } = NutriDudu;
    return `${utils.data(c.inicio)} às ${utils.hora(c.inicio)}`;
  }

  async function registrar(pessoaId, descricao) {
    await NutriDudu.store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo: 'consulta', descricao,
      autor: NutriDudu.permissoes.atual(), automatico: true,
    });
  }

  /** Pacotes ativos da pessoa que ainda têm saldo livre (sem contar a própria consulta em edição). */
  function pacotesDisponiveis(pessoaId, d, ignorarConsultaId) {
    const { calculos } = NutriDudu;
    return d.pacotes
      .filter((p) => p.pessoaId === pessoaId && p.status === 'ativo')
      .map((p) => {
        const doPacote = d.consultas.filter((c) => c.pacoteId === p.id && c.id !== ignorarConsultaId);
        const uso = calculos.usoDoPacote(p, doPacote);
        return { ...p, uso, livre: p.qtdConsultas - uso.usadas - uso.reservadas };
      })
      .filter((p) => p.livre > 0);
  }

  // ---------------- Formulário de agendamento ----------------

  /**
   * Abre o formulário. Sem `consulta`: novo agendamento (pode vir com pessoaId, dia,
   * hora, profissionalId pré-preenchidos). Com `consulta`: remarcar/editar.
   */
  async function abrir({ consulta = null, pessoaId = '', dia = '', hora = '', profissionalId = '', aoSalvar } = {}) {
    const { form: f, modal, config, utils, permissoes, agenda, store, ui } = NutriDudu;
    const d = await carregar();
    const editando = Boolean(consulta);

    const profsPermitidos = d.profissionais.filter((p) => (p.ativo || p.id === consulta?.profissionalId) && permissoes.podeAgendarPara(p.id));
    if (!profsPermitidos.length) {
      ui.toast('Seu perfil não pode agendar nesta agenda.', 'info');
      return;
    }

    const c = consulta || {};
    const inicial = {
      pessoaId: c.pessoaId || pessoaId,
      profissionalId: c.profissionalId || profissionalId || permissoes.idProfissionalAtual() || profsPermitidos[0].id,
      servicoId: c.servicoId || '',
      pacoteId: c.pacoteId || '',
      tipo: c.tipo || '',
      dia: c.inicio ? utils.isoDia(c.inicio) : (dia || utils.isoDia(new Date())),
      hora: c.inicio ? utils.hora(c.inicio) : hora,
      observacaoAgenda: c.observacaoAgenda || '',
    };

    const opcoesPessoas = d.pessoas
      .filter((p) => p.etapa !== 'perdido' || p.id === inicial.pessoaId)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => [p.id, `${p.nome} — ${p.telefone}${p.status === 'lead' ? ' (lead)' : ''}`]);

    const corpo = `
      <div class="campo-com-botao">
        ${f.selecao('pessoaId', 'Paciente', opcoesPessoas, inicial.pessoaId, { obrigatorio: true, vazio: 'Escolha o paciente…' })}
        ${editando ? '' : '<button type="button" class="btn btn-pequeno" data-cadastrar>+ Cadastrar</button>'}
      </div>
      <div class="grade-2">
        ${f.selecao('profissionalId', 'Profissional', profsPermitidos.map((p) => [p.id, p.nome]), inicial.profissionalId, { obrigatorio: true })}
        <div data-campo-pacote></div>
        <div data-campo-servico></div>
        ${f.selecao('tipo', 'Tipo', config.TIPOS_CONSULTA, inicial.tipo, { obrigatorio: true })}
        ${f.texto('dia', 'Data', inicial.dia, { tipo: 'date', obrigatorio: true })}
        ${f.texto('hora', 'Horário', inicial.hora, { tipo: 'time', obrigatorio: true, atributos: 'step="300"' })}
      </div>
      <p class="campo-ajuda" data-termino></p>
      <div class="livres" data-livres></div>
      <div class="alerta alerta-aviso" data-problemas hidden></div>
      <div data-encaixe hidden>
        ${f.chave('encaixe', 'Marcar mesmo assim (encaixe)', false, { ajuda: 'Só o administrador pode marcar um encaixe. Ele aparece destacado na agenda.' })}
      </div>
      ${f.texto('observacaoAgenda', 'Observação para a agenda', inicial.observacaoAgenda, { placeholder: 'Ex.: prefere ser lembrada por ligação', ajuda: 'Visível para toda a equipe. Não escreva dados de saúde aqui.' })}
    `;

    // Lê o formulário e calcula início/fim e os problemas do horário.
    const montar = (form) => {
      const servico = d.servicoPorId[f.valor(form, 'servicoId')];
      const diaSel = f.valor(form, 'dia');
      const horaSel = f.valor(form, 'hora');
      const inicio = diaSel && /^\d{2}:\d{2}$/.test(horaSel) ? agenda.dataComHora(diaSel, horaSel) : null;
      const fim = inicio && servico ? agenda.somarMin(inicio, servico.duracaoMin) : null;
      const tipo = f.valor(form, 'tipo');
      const dados = {
        id: consulta?.id,
        pessoaId: f.valor(form, 'pessoaId'),
        profissionalId: f.valor(form, 'profissionalId'),
        servicoId: servico?.id || '',
        pacoteId: f.valor(form, 'pacoteId') || null,
        tipo,
        inicio, fim,
        modalidade: tipo === 'online' ? 'online' : 'presencial',
        encaixe: f.marcado(form, 'encaixe'),
        observacaoAgenda: f.valor(form, 'observacaoAgenda'),
      };
      dados.problemas = inicio && fim && dados.profissionalId
        ? agenda.verificar({ ...dados, ignorarConsultaId: consulta?.id }, d.ctx)
        : [];
      return dados;
    };

    modal.formulario({
      titulo: editando ? 'Remarcar ou editar consulta' : 'Agendar consulta',
      corpo,
      largo: true,
      textoSalvar: editando ? 'Salvar' : 'Agendar',
      ler: montar,
      validar: (dados) => {
        const erros = {};
        if (!dados.pessoaId) erros.pessoaId = 'Escolha o paciente.';
        if (!dados.servicoId) erros.servicoId = 'Escolha o serviço.';
        if (!dados.tipo) erros.tipo = 'Escolha o tipo.';
        if (!dados.inicio) erros.hora = 'Informe a data e o horário.';
        const podeEncaixe = permissoes.atual() === 'admin';
        const bloqueantes = dados.problemas.filter((p) => p.tipo === 'passado' || !(podeEncaixe && dados.encaixe));
        if (!Object.keys(erros).length && bloqueantes.length) {
          erros._geral = `Não é possível agendar: ${bloqueantes.map((p) => p.mensagem).join(' ')}`;
        }
        return erros;
      },
      salvar: async (dados) => {
        const campos = {
          pessoaId: dados.pessoaId,
          profissionalId: dados.profissionalId,
          servicoId: dados.servicoId,
          pacoteId: dados.pacoteId,
          tipo: dados.tipo,
          inicio: dados.inicio.toISOString(),
          fim: dados.fim.toISOString(),
          encaixe: dados.problemas.length > 0,
          observacaoAgenda: dados.observacaoAgenda,
        };
        const servico = d.servicoPorId[dados.servicoId];
        if (editando) {
          const mudouHorario = campos.inicio !== consulta.inicio || campos.profissionalId !== consulta.profissionalId;
          await store.update('consultas', consulta.id, {
            ...campos,
            // Mudou o horário: precisa confirmar de novo.
            ...(mudouHorario ? { status: 'agendada' } : {}),
          });
          await registrar(dados.pessoaId, mudouHorario
            ? `Consulta remarcada de ${quando(consulta)} para ${quando(campos)}.`
            : `Agendamento de ${quando(campos)} atualizado.`);
          ui.toast(mudouHorario ? 'Consulta remarcada.' : 'Agendamento atualizado.');
        } else {
          const nova = await store.create('consultas', {
            ...campos,
            status: 'agendada',
            agendadaPor: agendadaPorAtual(),
            descontarFalta: true,
            avaliacaoId: null, anamneseId: null, fotoIds: [], anotacoes: '', conduta: '', proximoRetorno: null,
          });
          await registrar(dados.pessoaId, `Consulta agendada para ${quando(campos)} (${servico?.nome || 'consulta'}).`);
          // Lead que marcou consulta avança no funil comercial.
          const pessoa = d.pessoaPorId[dados.pessoaId];
          if (pessoa?.funil === 'comercial' && ['novo', 'contato'].includes(pessoa.etapa)) {
            await store.update('pessoas', pessoa.id, { etapa: 'agendada', etapaDesde: new Date().toISOString() });
            await NutriDudu.store.create('interacoes', {
              pessoaId: pessoa.id, dataHora: new Date().toISOString(), tipo: 'etapa', autor: permissoes.atual(),
              automatico: true, descricao: 'Movido(a) para "Consulta agendada".',
            });
          }
          ui.toast(`Consulta agendada: ${quando(campos)}.`);
          if (aoSalvar) aoSalvar(nova);
        }
      },
      aoAbrir: (form) => {
        const campoPacote = form.querySelector('[data-campo-pacote]');
        const campoServico = form.querySelector('[data-campo-servico]');
        const termino = form.querySelector('[data-termino]');
        const livres = form.querySelector('[data-livres]');
        const caixaProblemas = form.querySelector('[data-problemas]');
        const caixaEncaixe = form.querySelector('[data-encaixe]');

        // Pacote e serviço dependem do paciente e do profissional: são remontados.
        const montarPacoteEServico = (manterServico) => {
          const pessoaSel = f.valor(form, 'pessoaId');
          const profSel = f.valor(form, 'profissionalId');
          const servicoAntes = manterServico ? (f.valor(form, 'servicoId') || inicial.servicoId) : inicial.servicoId;
          const pacotes = pacotesDisponiveis(pessoaSel, d, consulta?.id);
          const pacoteAtual = consulta?.pacoteId && !pacotes.some((p) => p.id === consulta.pacoteId)
            ? d.pacotes.filter((p) => p.id === consulta.pacoteId).map((p) => ({ ...p, livre: 0 })) : [];
          const opcoesPacote = [...pacotes, ...pacoteAtual].map((p) => [p.id,
            `${d.servicoPorId[p.servicoId]?.nome || 'Pacote'} (${p.livre > 0 ? `${p.livre} livre${p.livre > 1 ? 's' : ''}` : 'este agendamento'})`]);
          const pacoteSel = editando ? (consulta.pacoteId || '') : (opcoesPacote[0]?.[0] || '');
          campoPacote.innerHTML = f.selecao('pacoteId', 'Pacote', opcoesPacote, pacoteSel, { vazio: 'Consulta avulsa (sem pacote)' });

          const servicos = d.servicos.filter((s) => (s.ativo || s.id === servicoAntes) && (!profSel || s.profissionalIds.includes(profSel)));
          campoServico.innerHTML = f.selecao('servicoId', 'Serviço', servicos.map((s) => [s.id, `${s.nome} (${s.duracaoMin} min)`]), servicoAntes, { obrigatorio: true, vazio: 'Escolha…' });
          aplicarPacote();
        };

        // Com pacote escolhido, o serviço é o do pacote.
        const aplicarPacote = () => {
          const pacote = d.pacotes.find((p) => p.id === f.valor(form, 'pacoteId'));
          const sel = form.elements.servicoId;
          if (pacote && sel) {
            if (![...sel.options].some((o) => o.value === pacote.servicoId)) {
              const s = d.servicoPorId[pacote.servicoId];
              sel.insertAdjacentHTML('beforeend', `<option value="${utils.escapeHtml(s.id)}">${utils.escapeHtml(`${s.nome} (${s.duracaoMin} min)`)}</option>`);
            }
            sel.value = pacote.servicoId;
          }
          if (sel) sel.disabled = Boolean(pacote);
          sugerirTipo();
        };

        // Sugere o tipo: primeira consulta para quem nunca foi atendido, avaliação, online…
        const sugerirTipo = () => {
          if (editando || form.elements.tipo.dataset.mexido) return;
          const servico = d.servicoPorId[f.valor(form, 'servicoId')];
          const jaAtendida = d.consultas.some((x) => x.pessoaId === f.valor(form, 'pessoaId') && x.status === 'realizada');
          let tipo = jaAtendida ? 'retorno' : 'primeira';
          if (servico?.categoria === 'avaliacao') tipo = 'avaliacao';
          if (servico?.modalidade === 'online') tipo = 'online';
          form.elements.tipo.value = tipo;
        };

        const atualizar = () => {
          const dados = montar(form);
          const servico = d.servicoPorId[dados.servicoId];
          termino.textContent = dados.fim ? `Termina às ${utils.hora(dados.fim)} (${servico.duracaoMin} min).` : '';

          // Horários livres do dia escolhido.
          if (servico && dados.profissionalId && f.valor(form, 'dia')) {
            const lista = agenda.horariosLivres({
              profissionalId: dados.profissionalId, dia: f.valor(form, 'dia'), duracaoMin: servico.duracaoMin,
              modalidade: dados.modalidade, ignorarConsultaId: consulta?.id,
            }, d.ctx);
            const horaSel = f.valor(form, 'hora');
            livres.innerHTML = lista.length
              ? `<span class="campo-ajuda">Horários livres:</span> ${lista.map((h) => {
                  const t = utils.hora(h);
                  return `<button type="button" class="chip${t === horaSel ? ' ativo' : ''}" data-hora="${t}">${t}</button>`;
                }).join('')}`
              : '<span class="campo-ajuda">Nenhum horário livre neste dia para esse serviço.</span>';
          } else {
            livres.innerHTML = '';
          }

          caixaProblemas.hidden = !dados.problemas.length;
          caixaProblemas.innerHTML = dados.problemas.map((p) => `<span class="bloco">⚠ ${utils.escapeHtml(p.mensagem)}</span>`).join('');
          caixaEncaixe.hidden = !(permissoes.atual() === 'admin' && dados.problemas.length && !dados.problemas.some((p) => p.tipo === 'passado'));
        };

        form.addEventListener('change', (e) => {
          if (e.target.name === 'pessoaId' || e.target.name === 'profissionalId') montarPacoteEServico(true);
          if (e.target.name === 'pacoteId') aplicarPacote();
          if (e.target.name === 'servicoId') sugerirTipo();
          if (e.target.name === 'tipo') form.elements.tipo.dataset.mexido = '1';
          atualizar();
        });
        form.addEventListener('input', atualizar);
        form.addEventListener('click', async (e) => {
          const chip = e.target.closest('[data-hora]');
          if (chip) {
            form.elements.hora.value = chip.dataset.hora;
            atualizar();
          }
          if (e.target.closest('[data-cadastrar]')) {
            NutriDudu.cadastroPessoa.abrir({
              tipo: 'lead',
              aoSalvar: (p) => {
                d.pessoas.push(p);
                d.pessoaPorId[p.id] = p;
                form.elements.pessoaId.insertAdjacentHTML('beforeend',
                  `<option value="${utils.escapeHtml(p.id)}">${utils.escapeHtml(`${p.nome} — ${p.telefone} (lead)`)}</option>`);
                form.elements.pessoaId.value = p.id;
                montarPacoteEServico(true);
                atualizar();
              },
            });
          }
        });

        montarPacoteEServico(false);
        atualizar();
      },
    });
  }

  // ---------------- Ações sobre uma consulta ----------------

  async function confirmar(c) {
    await NutriDudu.store.update('consultas', c.id, { status: 'confirmada' });
    await registrar(c.pessoaId, `Consulta de ${quando(c)} confirmada.`);
    NutriDudu.ui.toast('Consulta confirmada.');
  }

  function marcarFalta(c) {
    const { form: f, modal, store, ui } = NutriDudu;
    modal.formulario({
      titulo: 'Marcar falta',
      corpo: `
        <p>O paciente não compareceu à consulta de ${NutriDudu.utils.escapeHtml(quando(c))}.</p>
        ${c.pacoteId ? f.chave('descontar', 'Descontar do pacote', true, { ajuda: 'Desmarque se a falta foi avisada com antecedência.' }) : ''}`,
      textoSalvar: 'Marcar falta',
      ler: (form) => ({ descontar: c.pacoteId ? f.marcado(form, 'descontar') : true }),
      salvar: async ({ descontar }) => {
        await store.update('consultas', c.id, { status: 'faltou', descontarFalta: descontar });
        await registrar(c.pessoaId, `Faltou à consulta de ${quando(c)}${c.pacoteId ? (descontar ? ' (descontada do pacote)' : ' (não descontada do pacote)') : ''}.`);
        ui.toast('Falta registrada.');
      },
    });
  }

  function cancelar(c) {
    const { form: f, modal, store, ui } = NutriDudu;
    const MOTIVOS = { paciente: 'Paciente desmarcou', clinica: 'Clínica desmarcou', remarcar: 'Vai remarcar depois', outro: 'Outro' };
    modal.formulario({
      titulo: 'Cancelar consulta',
      corpo: `
        <p>Cancelar a consulta de ${NutriDudu.utils.escapeHtml(quando(c))}? O horário fica livre na agenda.</p>
        ${f.selecao('motivo', 'Motivo', MOTIVOS, 'paciente')}
        ${f.texto('detalhe', 'Detalhe (opcional)', '')}`,
      textoSalvar: 'Cancelar consulta',
      ler: (form) => ({ motivo: f.valor(form, 'motivo'), detalhe: f.valor(form, 'detalhe') }),
      salvar: async ({ motivo, detalhe }) => {
        const texto = `${MOTIVOS[motivo]}${detalhe ? ` — ${detalhe}` : ''}`;
        await store.update('consultas', c.id, { status: 'cancelada', motivoCancelamento: texto });
        await registrar(c.pessoaId, `Consulta de ${quando(c)} cancelada: ${texto}.`);
        ui.toast('Consulta cancelada.');
      },
    });
  }

  /**
   * Remarca arrastando na agenda. Devolve true se remarcou.
   * Com problemas: o administrador pode confirmar um encaixe; os demais recebem o aviso.
   */
  async function remarcarPara(c, novoInicio, profissionalId) {
    const { agenda, modal, store, ui, utils, permissoes } = NutriDudu;
    const d = await carregar();
    const duracao = (new Date(c.fim) - new Date(c.inicio)) / 60000;
    const novoFim = agenda.somarMin(novoInicio, duracao);
    const problemas = agenda.verificar({
      profissionalId, inicio: novoInicio, fim: novoFim, modalidade: c.tipo === 'online' ? 'online' : 'presencial', ignorarConsultaId: c.id,
    }, d.ctx);
    const nome = d.pessoaPorId[c.pessoaId]?.nome || 'paciente';
    const destino = `${utils.diaPorExtenso(novoInicio)} às ${utils.hora(novoInicio)}${profissionalId !== c.profissionalId ? ` com ${d.profPorId[profissionalId]?.nome}` : ''}`;

    if (problemas.length) {
      if (permissoes.atual() !== 'admin' || problemas.some((p) => p.tipo === 'passado')) {
        ui.toast(`Não dá para remarcar: ${problemas[0].mensagem}`, 'erro');
        return false;
      }
      const ok = await modal.confirmar({
        titulo: 'Remarcar como encaixe?',
        mensagem: `${problemas.map((p) => p.mensagem).join(' ')} Remarcar ${nome} para ${destino} mesmo assim?`,
        textoConfirmar: 'Marcar encaixe',
      });
      if (!ok) return false;
    } else {
      const ok = await modal.confirmar({
        titulo: 'Remarcar consulta?',
        mensagem: `${nome}: de ${quando(c)} para ${destino}.`,
        textoConfirmar: 'Remarcar',
      });
      if (!ok) return false;
    }
    await store.update('consultas', c.id, {
      inicio: novoInicio.toISOString(), fim: novoFim.toISOString(), profissionalId,
      status: 'agendada', encaixe: problemas.length > 0,
    });
    await registrar(c.pessoaId, `Consulta remarcada de ${quando(c)} para ${quando({ inicio: novoInicio })}.`);
    ui.toast('Consulta remarcada.');
    return true;
  }

  /** Painel com os detalhes da consulta e as ações permitidas. */
  async function detalhes(consultaId) {
    const { store, modal, ui, utils, config, permissoes, calculos } = NutriDudu;
    const c = await store.get('consultas', consultaId);
    if (!c) return;
    const d = await carregar();
    const pessoa = d.pessoaPorId[c.pessoaId];
    const prof = d.profPorId[c.profissionalId];
    const servico = d.servicoPorId[c.servicoId];
    const pacote = d.pacotes.find((p) => p.id === c.pacoteId);
    const uso = pacote ? calculos.usoDoPacote(pacote, d.consultas.filter((x) => x.pacoteId === pacote.id)) : null;
    const linha = (rotulo, valor) => `<tr><th scope="row">${rotulo}</th><td>${valor}</td></tr>`;
    const ativa = ATIVAS.includes(c.status);
    const podeMexer = permissoes.podeAgendarPara(c.profissionalId);
    const comecou = new Date(c.inicio) <= new Date();

    const corpo = `
      <div class="detalhe-consulta">
        <p class="detalhe-quando">${utils.escapeHtml(utils.diaPorExtenso(c.inicio))}, ${utils.hora(c.inicio)}–${utils.hora(c.fim)}</p>
        <p>${ui.statusConsulta(c.status)} ${c.encaixe ? ui.badge('Encaixe', 'alerta') : ''} ${c.agendadaPor === 'agente' ? ui.badge('🤖 Agendada pelo agente', 'info') : ''}</p>
        <table class="tabela-simples">
          ${linha('Paciente', pessoa ? `<a href="#/clientes/${encodeURIComponent(pessoa.id)}" data-fechar-ao-clicar>${utils.escapeHtml(pessoa.nome)}</a> <span class="muted small">${utils.escapeHtml(pessoa.telefone)}${pessoa.status === 'lead' ? ' · lead' : ''}</span>` : '—')}
          ${linha('Serviço', utils.escapeHtml(`${servico?.nome || '—'} · ${config.TIPOS_CONSULTA[c.tipo] || c.tipo}`))}
          ${linha('Profissional', prof ? `<span class="com-ponto"><span class="ponto" style="background:${utils.escapeHtml(prof.cor)}"></span>${utils.escapeHtml(prof.nome)}</span>` : '—')}
          ${pacote ? linha('Pacote', utils.escapeHtml(`${d.servicoPorId[pacote.servicoId]?.nome || 'Pacote'} · ${uso.usadas} de ${uso.total} usadas, ${uso.reservadas} agendada(s)`)) : ''}
          ${linha('Agendada por', utils.escapeHtml(config.AGENDADA_POR[c.agendadaPor] || '—'))}
          ${c.observacaoAgenda ? linha('Observação', utils.escapeHtml(c.observacaoAgenda)) : ''}
          ${c.status === 'cancelada' && c.motivoCancelamento ? linha('Cancelamento', utils.escapeHtml(c.motivoCancelamento)) : ''}
          ${c.status === 'faltou' && c.pacoteId ? linha('Falta', c.descontarFalta === false ? 'Não descontada do pacote' : 'Descontada do pacote') : ''}
        </table>
      </div>`;

    const acoes = [];
    if (ativa && podeMexer && c.status === 'agendada') acoes.push({ texto: 'Confirmar', classe: 'btn-primary', aoClicar: () => confirmar(c) });
    if (ativa && podeMexer) acoes.push({ texto: 'Remarcar', aoClicar: () => abrir({ consulta: c }) });
    if (ativa && podeMexer && comecou) acoes.push({ texto: 'Marcar falta', aoClicar: () => marcarFalta(c) });
    if (ativa && permissoes.pode('registrarAtendimento') && comecou) {
      acoes.push({ texto: 'Registrar atendimento', aoClicar: () => ui.toast('O registro do atendimento chega na fase 5.', 'info') });
    }
    if (pessoa) acoes.push({ texto: 'WhatsApp', aoClicar: () => window.open(`https://wa.me/55${utils.soDigitos(pessoa.telefone)}`, '_blank', 'noopener') });
    if (ativa && podeMexer) acoes.push({ texto: 'Cancelar consulta', classe: 'btn-texto-perigo', aoClicar: () => cancelar(c) });

    const dialog = modal.painel({ titulo: pessoa?.nome || 'Consulta', corpo, acoes });
    dialog.querySelector('[data-fechar-ao-clicar]')?.addEventListener('click', () => dialog.close());
  }

  return { abrir, detalhes, confirmar, marcarFalta, cancelar, remarcarPara, carregar };
})();
