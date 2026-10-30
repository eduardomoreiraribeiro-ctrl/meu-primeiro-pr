// Lista de espera (tela): painel aberto pela Agenda, com quem está esperando um
// horário, as preferências de cada um e o que já foi oferecido pelo WhatsApp.
// As regras de "combina com o horário" ficam em js/espera.js (as mesmas do servidor).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.listaEspera = (function () {
  const DIAS_LONGOS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];
  const STATUS_OFERTA = {
    enviada: ['Oferecido, sem resposta', 'alerta'],
    aceita: ['Aceitou', 'sucesso'],
    recusada: ['Não pôde', 'neutro'],
    preenchida: ['Já tinha sido preenchido', 'neutro'],
    expirada: ['Respondeu tarde demais', 'neutro'],
    falhou: ['Não foi enviado', 'perigo'],
  };

  async function carregar() {
    const { store, agendamento } = NutriDudu;
    const [espera, d] = await Promise.all([store.list('espera'), agendamento.carregar()]);
    return { espera, ...d };
  }

  const hojeIso = () => NutriDudu.utils.isoDia(new Date());

  /** Quantos pedidos ativos (para o botão da Agenda). */
  function contarAtivos(espera) {
    return (espera || []).filter((e) => NutriDudu.espera.ativo(e, hojeIso())).length;
  }

  /** Próximo horário livre (até 14 dias) que combina com o pedido, para a equipe oferecer. */
  function proximoHorario(e, d) {
    const { agenda, utils, espera: E } = NutriDudu;
    const servico = d.servicoPorId[e.servicoId];
    if (!servico) return null;
    const profs = (e.profissionalId ? [e.profissionalId] : servico.profissionalIds || []).filter((id) => d.profPorId[id]?.ativo !== false);
    const ctxE = { servicoPorId: d.servicoPorId, consultaPorId: Object.fromEntries(d.consultas.map((c) => [c.id, c])), hojeIso: hojeIso() };
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    for (let i = 0; i < 14; i++) {
      const dia = new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate() + i);
      for (const pid of profs) {
        for (const modalidade of ['presencial', 'online']) {
          const livres = agenda.horariosLivres({ profissionalId: pid, dia: utils.isoDia(dia), duracaoMin: servico.duracaoMin || 60, modalidade, ignorarConsultaId: e.consultaId || null }, d.ctx);
          const achou = livres.find((h) => E.combina(e, { profissionalId: pid, inicio: h }, ctxE) === modalidade);
          if (achou) return { inicio: achou, profissionalId: pid, modalidade };
        }
      }
    }
    return null;
  }

  function linhaPedido(e, d) {
    const { utils, ui, espera: E } = NutriDudu;
    const pessoa = d.pessoaPorId[e.pessoaId];
    const servico = d.servicoPorId[e.servicoId];
    const prof = e.profissionalId ? d.profPorId[e.profissionalId] : null;
    const atual = e.consultaId ? d.consultas.find((c) => c.id === e.consultaId && ['agendada', 'confirmada'].includes(c.status)) : null;
    const ultima = (e.ofertas || []).slice(-1)[0];
    const prox = proximoHorario(e, d);
    const quando = (iso) => `${utils.diaPorExtenso(iso).split(',')[0].slice(0, 3)} ${utils.data(iso).slice(0, 5)} às ${utils.hora(iso)}`;
    return `
      <li class="espera-item" data-id="${utils.escapeHtml(e.id)}">
        <div class="espera-topo">
          <strong>${pessoa ? `<a href="#/clientes/${encodeURIComponent(pessoa.id)}" data-fechar-ao-clicar>${utils.escapeHtml(pessoa.nome)}</a>` : 'Pessoa removida'}</strong>
          ${e.origem === 'agente' ? ui.badge('🤖 pelo assistente', 'info') : ''}
          <span class="muted small">na lista desde ${utils.data(e.criadoEm).slice(0, 5)}</span>
        </div>
        <p class="small">${utils.escapeHtml(servico?.nome || 'Serviço removido')} · ${utils.escapeHtml(prof?.nome || 'qualquer profissional')} · ${utils.escapeHtml(E.descreverPreferencias(e))}</p>
        ${atual ? `<p class="small">Quer antecipar a consulta de ${utils.escapeHtml(quando(atual.inicio))}.</p>` : ''}
        ${e.observacao ? `<p class="small muted">${utils.escapeHtml(e.observacao)}</p>` : ''}
        ${ultima ? `<p class="small">Último horário oferecido: ${utils.escapeHtml(quando(ultima.inicio))} — ${ui.badge(...(STATUS_OFERTA[ultima.status] || [ultima.status, 'neutro']))}</p>` : ''}
        <p class="small ${prox ? '' : 'muted'}">${prox
          ? `Próximo horário livre que combina: <strong>${utils.escapeHtml(quando(prox.inicio))}</strong>${prox.modalidade === 'online' ? ' (online)' : ''}${!e.profissionalId && Object.keys(d.profPorId).length > 1 ? ` com ${utils.escapeHtml(d.profPorId[prox.profissionalId]?.nome || '')}` : ''}`
          : 'Nenhum horário livre que combine nos próximos 14 dias.'}</p>
        <div class="espera-acoes">
          <button type="button" class="btn btn-pequeno btn-primary" data-agendar-espera="${utils.escapeHtml(e.id)}"${prox ? ` data-dia="${utils.isoDia(prox.inicio)}" data-hora="${utils.hora(prox.inicio)}" data-prof="${utils.escapeHtml(prox.profissionalId)}"` : ''}>Agendar</button>
          <button type="button" class="btn btn-pequeno" data-editar-espera="${utils.escapeHtml(e.id)}">Editar</button>
          <button type="button" class="btn btn-pequeno btn-texto-perigo" data-remover-espera="${utils.escapeHtml(e.id)}">Tirar da lista</button>
        </div>
      </li>`;
  }

  /** Painel com a lista. */
  async function abrirPainel() {
    const { modal, ui, utils, config, espera: E } = NutriDudu;
    const d = await carregar();
    const hoje = hojeIso();
    const ativos = d.espera.filter((e) => E.ativo(e, hoje)).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
    const recentes = d.espera.filter((e) => !E.ativo(e, hoje))
      .sort((a, b) => String(b.resolvidoEm || b.atualizadoEm).localeCompare(String(a.resolvidoEm || a.atualizadoEm))).slice(0, 10);
    const automatica = Boolean((await NutriDudu.store.get('configuracoes', 'automacoes'))?.ativas?.vagaEspera);
    const corpo = `
      <p class="small muted">${automatica
        ? 'Quando um horário é cancelado ou remarcado, o sistema oferece pelo WhatsApp a até 3 pessoas daqui que combinam com ele, por ordem de chegada. Fica com quem confirmar primeiro.'
        : 'O aviso automático pelo WhatsApp está desligado (Configurações › Mensagens automáticas › "Horário liberado"). Use esta lista para oferecer os horários vagos.'}</p>
      ${ativos.length ? `<ol class="espera-lista">${ativos.map((e) => linhaPedido(e, d)).join('')}</ol>` : ui.vazio('Ninguém na lista de espera.')}
      ${recentes.length ? `
        <details class="espera-recentes">
          <summary>Saíram da lista (${recentes.length})</summary>
          <ul class="small">${recentes.map((e) => `<li>${utils.escapeHtml(d.pessoaPorId[e.pessoaId]?.nome || '—')} — ${utils.escapeHtml(d.servicoPorId[e.servicoId]?.nome || '')}: ${e.status === 'aguardando' ? 'prazo terminou' : utils.escapeHtml(E.STATUS[e.status] || e.status)}${e.resolvidoEm ? ` em ${utils.data(e.resolvidoEm).slice(0, 5)}` : ''}</li>`).join('')}</ul>
        </details>` : ''}`;
    const dialog = modal.painel({
      titulo: `Lista de espera${ativos.length ? ` (${ativos.length})` : ''}`,
      corpo,
      acoes: [{ texto: '+ Adicionar à lista', classe: 'btn-primary', aoClicar: () => abrirFormulario({}) }],
    });
    dialog.querySelectorAll('[data-fechar-ao-clicar]').forEach((a) => a.addEventListener('click', () => dialog.close()));
    const porId = Object.fromEntries(d.espera.map((e) => [e.id, e]));
    dialog.querySelectorAll('[data-editar-espera]').forEach((b) => b.addEventListener('click', () => {
      dialog.close();
      abrirFormulario({ entrada: porId[b.dataset.editarEspera] });
    }));
    dialog.querySelectorAll('[data-remover-espera]').forEach((b) => b.addEventListener('click', async () => {
      const e = porId[b.dataset.removerEspera];
      dialog.close();
      const ok = await modal.confirmar({ titulo: 'Tirar da lista de espera?', mensagem: `${d.pessoaPorId[e.pessoaId]?.nome || 'Esta pessoa'} deixa de receber os horários que abrirem.`, textoConfirmar: 'Tirar da lista', perigo: true });
      if (ok) {
        await NutriDudu.store.update('espera', e.id, { status: 'cancelado', resolvidoEm: new Date().toISOString() });
        await registrar(e.pessoaId, 'Saiu da lista de espera.');
        ui.toast('Pedido tirado da lista de espera.');
      }
      abrirPainel();
    }));
    dialog.querySelectorAll('[data-agendar-espera]').forEach((b) => b.addEventListener('click', () => {
      const e = porId[b.dataset.agendarEspera];
      dialog.close();
      const atual = e.consultaId ? d.consultas.find((c) => c.id === e.consultaId && ['agendada', 'confirmada'].includes(c.status)) : null;
      // Ao salvar o agendamento, o pedido sai da lista como "agendado".
      const aoSalvar = async () => {
        await NutriDudu.store.update('espera', e.id, { status: 'agendado', resolvidoEm: new Date().toISOString() });
        await registrar(e.pessoaId, 'Agendado(a) pela lista de espera.');
      };
      if (atual) {
        NutriDudu.agendamento.abrir({ consulta: atual, dia: b.dataset.dia || '', hora: b.dataset.hora || '', aoSalvar });
      } else {
        NutriDudu.agendamento.abrir({ pessoaId: e.pessoaId, dia: b.dataset.dia || '', hora: b.dataset.hora || '', profissionalId: b.dataset.prof || e.profissionalId || '', servicoId: e.servicoId, aoSalvar });
      }
    }));
    return dialog;
  }

  async function registrar(pessoaId, descricao) {
    await NutriDudu.store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo: 'nota', descricao,
      autor: NutriDudu.permissoes.atual(), automatico: true,
    });
  }

  /** Formulário: novo pedido ou edição. */
  async function abrirFormulario({ entrada = null, pessoaId = '' } = {}) {
    const { form: f, modal, utils, ui, espera: E } = NutriDudu;
    const d = await carregar();
    const e = entrada || {};
    const opcoesPessoas = d.pessoas
      .filter((p) => p.etapa !== 'perdido' || p.id === e.pessoaId)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => [p.id, `${p.nome} — ${p.telefone}${p.status === 'lead' ? ' (lead)' : ''}`]);
    const servicos = d.servicos.filter((s) => s.ativo !== false || s.id === e.servicoId).map((s) => [s.id, s.nome]);
    const profs = d.profissionais.filter((p) => p.ativo || p.id === e.profissionalId).map((p) => [p.id, p.nome]);
    const consultasFuturas = (pid) => d.consultas
      .filter((c) => c.pessoaId === pid && ['agendada', 'confirmada'].includes(c.status) && new Date(c.inicio) > new Date())
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const opcoesConsulta = (pid) => consultasFuturas(pid).map((c) => [c.id, `${utils.data(c.inicio)} às ${utils.hora(c.inicio)} — ${d.servicoPorId[c.servicoId]?.nome || 'consulta'}`]);
    const pessoaInicial = e.pessoaId || pessoaId;

    const corpo = `
      ${f.selecao('pessoaId', 'Paciente', opcoesPessoas, pessoaInicial, { obrigatorio: true, vazio: 'Escolha o paciente…' })}
      <div class="grade-2">
        ${f.selecao('servicoId', 'Serviço', servicos, e.servicoId || '', { obrigatorio: true, vazio: 'Escolha o serviço…' })}
        ${f.selecao('profissionalId', 'Profissional', profs, e.profissionalId || '', { vazio: 'Qualquer profissional' })}
        ${f.selecao('modalidade', 'Modalidade', E.MODALIDADES, e.modalidade || 'qualquer')}
        ${f.selecao('periodo', 'Período', E.PERIODOS, e.periodo || 'qualquer')}
      </div>
      ${f.marcadores('dias', 'Dias que servem', DIAS_LONGOS, (e.dias || []).map(String), { ajuda: 'Nenhum marcado = qualquer dia.' })}
      <div class="grade-2">
        ${f.texto('ateDia', 'Serve até', e.ateDia || '', { tipo: 'date', ajuda: 'Opcional. Depois dessa data o pedido sai da lista sozinho.' })}
        <div data-campo-consulta></div>
      </div>
      ${f.texto('observacao', 'Observação', e.observacao || '', { placeholder: 'Ex.: prefere logo cedo', ajuda: 'Visível para toda a equipe. Não escreva dados de saúde aqui.' })}`;

    modal.formulario({
      titulo: entrada ? 'Editar pedido da lista de espera' : 'Adicionar à lista de espera',
      corpo,
      largo: true,
      textoSalvar: entrada ? 'Salvar' : 'Adicionar',
      ler: (form) => ({
        pessoaId: f.valor(form, 'pessoaId'),
        servicoId: f.valor(form, 'servicoId'),
        profissionalId: f.valor(form, 'profissionalId') || null,
        modalidade: f.valor(form, 'modalidade') || 'qualquer',
        periodo: f.valor(form, 'periodo') || 'qualquer',
        dias: f.marcadosDe(form, 'dias').map(Number).sort((a, b) => a - b),
        ateDia: f.valor(form, 'ateDia') || null,
        consultaId: f.valor(form, 'consultaId') || null,
        observacao: f.valor(form, 'observacao').slice(0, 300),
      }),
      validar: (x) => {
        const erros = {};
        if (!x.pessoaId) erros.pessoaId = 'Escolha o paciente.';
        if (!x.servicoId) erros.servicoId = 'Escolha o serviço.';
        if (x.ateDia && x.ateDia < hojeIso()) erros.ateDia = 'Essa data já passou.';
        const servico = d.servicoPorId[x.servicoId];
        if (servico && x.profissionalId && !(servico.profissionalIds || []).includes(x.profissionalId)) erros.profissionalId = 'Este profissional não atende este serviço.';
        if (!entrada && !erros.servicoId && d.espera.some((o) => o.pessoaId === x.pessoaId && o.servicoId === x.servicoId && E.ativo(o, hojeIso()))) {
          erros._geral = 'Esta pessoa já está na lista de espera para este serviço. Edite o pedido que já existe.';
        }
        return erros;
      },
      salvar: async (x) => {
        if (entrada) {
          await NutriDudu.store.update('espera', entrada.id, x);
          ui.toast('Pedido atualizado.');
        } else {
          await NutriDudu.store.create('espera', { ...x, status: 'aguardando', origem: 'equipe', ofertas: [] });
          await registrar(x.pessoaId, `Entrou na lista de espera: ${d.servicoPorId[x.servicoId]?.nome || 'consulta'} (${E.descreverPreferencias(x)}).`);
          ui.toast('Adicionado(a) à lista de espera.');
        }
        setTimeout(() => abrirPainel(), 0);
      },
      aoAbrir: (form) => {
        const lugar = form.querySelector('[data-campo-consulta]');
        const desenhar = () => {
          const pid = f.valor(form, 'pessoaId');
          const opcoes = pid ? opcoesConsulta(pid) : [];
          lugar.innerHTML = opcoes.length
            ? f.selecao('consultaId', 'Quer antecipar a consulta', opcoes, e.consultaId || '', { vazio: 'Não (é uma consulta nova)', ajuda: 'Se escolher, o horário que abrir substitui esta consulta (remarca).' })
            : '';
        };
        form.elements.pessoaId.addEventListener('change', desenhar);
        desenhar();
      },
    });
  }

  return { abrirPainel, abrirFormulario, contarAtivos };
})();
