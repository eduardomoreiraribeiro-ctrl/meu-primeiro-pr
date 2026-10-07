// Regras dos dois funis do Kanban: em que etapa cada cliente deveria estar
// (movimentos automáticos) e o que acontece ao mover um card (fechar venda,
// perder lead, encerrar e reabrir). As telas ficam em pages/kanban.js.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.funil = (function () {
  const DIAS_FECHADO_VISIVEL = 30;
  const DIAS_AVISO_PACOTE = 15;
  const STATUS_FUTURO = ['agendada', 'confirmada'];

  const MOTIVOS_PERDA = {
    preco: 'Preço',
    sem_resposta: 'Sem resposta',
    desistiu: 'Desistiu',
    concorrente: 'Escolheu outro profissional',
    horario: 'Horário / agenda',
    outro: 'Outro',
  };

  function nomeEtapa(funilId, etapaId) {
    return NutriDudu.config.FUNIS[funilId]?.etapas.find((e) => e.id === etapaId)?.nome || etapaId;
  }

  /**
   * Etapa que os dados indicam no funil de acompanhamento, com o motivo.
   * Só vale para cliente ativo; "Encerrado" é sempre escolha manual.
   * ctx: { consultas, pacotes } desta pessoa.
   */
  function etapaSugerida(pessoa, ctx, geral = {}, agora = new Date()) {
    if (pessoa.funil !== 'acompanhamento' || pessoa.status !== 'ativo') return null;
    const { calculos, utils } = NutriDudu;
    const { consultas, pacotes } = ctx;
    const realizadas = consultas.filter((c) => c.status === 'realizada').sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ultima = realizadas[0];
    const temFutura = consultas.some((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio) >= agora);

    if (!ultima) return { etapa: 'inicio', motivo: 'ainda não fez a primeira consulta' };

    const porInicio = [...pacotes].sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ativo = porInicio.find((p) => calculos.statusPacote(p, agora) === 'ativo');
    if (ativo) {
      const renovou = porInicio.some((p) => p !== ativo && p.inicio <= ativo.inicio);
      const usouONovo = realizadas.some((c) => c.pacoteId === ativo.id);
      if (renovou && !usouONovo) return { etapa: 'renovado', motivo: 'renovou e ainda não usou o novo pacote' };
      const uso = calculos.usoDoPacote(ativo, consultas.filter((c) => c.pacoteId === ativo.id));
      const dias = utils.diasEntre(agora, ativo.validade);
      if (uso.saldo <= 1) return { etapa: 'renovacao', motivo: uso.saldo ? 'resta 1 consulta no pacote' : 'pacote sem saldo' };
      if (dias <= DIAS_AVISO_PACOTE) return { etapa: 'renovacao', motivo: `o pacote vence em ${utils.dias(dias)}` };
    } else if (porInicio.length && ['vencido', 'concluido'].includes(calculos.statusPacote(porInicio[0], agora))) {
      return { etapa: 'renovacao', motivo: `pacote ${calculos.statusPacote(porInicio[0], agora) === 'vencido' ? 'vencido' : 'concluído'}` };
    }

    if (!temFutura) {
      const prazo = pessoa.retornoDias || geral.diasRetornoPadrao || 60;
      const dias = utils.diasEntre(ultima.inicio, agora);
      if (dias > prazo) return { etapa: 'retorno', motivo: `sem consulta há ${utils.dias(dias)} e nada agendado` };
      if (ultima.proximoRetorno && utils.paraData(ultima.proximoRetorno) < utils.inicioDoDia(agora)) {
        return { etapa: 'retorno', motivo: `retorno previsto para ${utils.data(ultima.proximoRetorno)} não foi agendado` };
      }
    }
    return { etapa: 'tratamento', motivo: 'consultas em dia' };
  }

  async function carregarContexto() {
    const { store, calculos } = NutriDudu;
    const [consultas, pacotes, geral] = await Promise.all([
      store.list('consultas', (c) => c.status !== 'cancelada'),
      store.list('pacotes'),
      store.get('configuracoes', 'geral'),
    ]);
    return { consultasDe: calculos.agruparPorPessoa(consultas), pacotesDe: calculos.agruparPorPessoa(pacotes), geral: geral || {} };
  }

  /**
   * Aplica os movimentos automáticos do acompanhamento.
   * Guarda em `etapaAuto` a última etapa sugerida: o card só é movido quando a
   * sugestão MUDA — assim um movimento feito à mão continua valendo até a
   * situação do cliente mudar de novo.
   */
  let emAndamento = null;
  let proxima = null;
  function sincronizar() {
    if (!emAndamento) {
      emAndamento = executarSincronizacao().finally(() => { emAndamento = null; });
      return emAndamento;
    }
    // Já há uma rodando (com dados de antes): agenda mais uma para depois dela.
    if (!proxima) proxima = emAndamento.then(() => { proxima = null; return sincronizar(); });
    return proxima;
  }

  async function executarSincronizacao() {
    const { store } = NutriDudu;
    const pessoas = await store.list('pessoas', (p) => p.funil === 'acompanhamento' && p.status === 'ativo');
    if (!pessoas.length) return 0;
    const ctx = await carregarContexto();
    const agora = new Date();
    let movidos = 0;
    for (const p of pessoas) {
      const s = etapaSugerida(p, { consultas: ctx.consultasDe(p.id), pacotes: ctx.pacotesDe(p.id) }, ctx.geral, agora);
      if (!s || s.etapa === p.etapaAuto) continue;
      const mover = s.etapa !== p.etapa;
      await store.update('pessoas', p.id, {
        etapaAuto: s.etapa,
        ...(mover ? { etapa: s.etapa, etapaDesde: agora.toISOString() } : {}),
      }, { silencioso: true });
      if (mover) {
        movidos += 1;
        await store.create('interacoes', {
          pessoaId: p.id, dataHora: agora.toISOString(), tipo: 'etapa', autor: 'sistema', automatico: true,
          descricao: `Movido(a) automaticamente de "${nomeEtapa('acompanhamento', p.etapa)}" para "${nomeEtapa('acompanhamento', s.etapa)}": ${s.motivo}.`,
        }, { silencioso: true });
      }
    }
    return movidos;
  }

  /** Etapa sugerida agora para uma pessoa (para registrar junto de um movimento manual). */
  async function sugestaoAtual(pessoa) {
    const ctx = await carregarContexto();
    return etapaSugerida(pessoa, { consultas: ctx.consultasDe(pessoa.id), pacotes: ctx.pacotesDe(pessoa.id) }, ctx.geral);
  }

  async function registrar(pessoaId, descricao) {
    const { store, permissoes } = NutriDudu;
    await store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo: 'etapa', autor: permissoes.atual(), automatico: false, descricao,
    });
  }

  /**
   * Movimento simples dentro do mesmo funil (sem perguntas).
   * Sai de "Perdido": lead reaberto. Sai de "Encerrado": cliente volta a ativo.
   */
  async function mover(pessoa, etapa) {
    const { store } = NutriDudu;
    if (pessoa.etapa === etapa) return;
    const mudancas = { etapa, etapaDesde: new Date().toISOString() };
    if (pessoa.etapa === 'perdido') mudancas.motivoPerda = null;
    if (pessoa.etapa === 'encerrado') {
      mudancas.status = 'ativo';
      mudancas.motivoEncerramento = null;
    }
    if (pessoa.funil === 'acompanhamento') {
      const s = await sugestaoAtual({ ...pessoa, ...mudancas });
      mudancas.etapaAuto = s?.etapa ?? pessoa.etapaAuto ?? null;
    }
    await store.update('pessoas', pessoa.id, mudancas);
    const extra = pessoa.etapa === 'perdido' ? ' (lead reaberto)' : pessoa.etapa === 'encerrado' ? ' (voltou a cliente ativo)' : '';
    await registrar(pessoa.id, `Movido(a) de "${nomeEtapa(pessoa.funil, pessoa.etapa)}" para "${nomeEtapa(pessoa.funil, etapa)}"${extra}.`);
  }

  /** Lead perdido: pede o motivo. */
  function perder(pessoa) {
    const { modal, form: f, store, ui } = NutriDudu;
    modal.formulario({
      titulo: `Lead perdido: ${pessoa.nome}`,
      corpo: `
        ${f.selecao('motivo', 'Motivo', MOTIVOS_PERDA, '', { obrigatorio: true, vazio: 'Escolha o motivo…' })}
        ${f.texto('detalhe', 'Detalhe (opcional)', '', { placeholder: 'Ex.: achou caro o plano anual' })}
        <p class="campo-ajuda">O lead sai do funil ativo, mas continua no cadastro. Dá para reabrir arrastando o card de volta.</p>`,
      textoSalvar: 'Marcar como perdido',
      ler: (form) => ({ motivo: f.valor(form, 'motivo'), detalhe: f.valor(form, 'detalhe') }),
      validar: (d) => (d.motivo ? {} : { motivo: 'Escolha o motivo.' }),
      salvar: async (d) => {
        const texto = `${MOTIVOS_PERDA[d.motivo]}${d.detalhe ? ` — ${d.detalhe}` : ''}`;
        await store.update('pessoas', pessoa.id, { etapa: 'perdido', etapaDesde: new Date().toISOString(), motivoPerda: texto });
        await registrar(pessoa.id, `Movido(a) de "${nomeEtapa('comercial', pessoa.etapa)}" para "Perdido": ${texto}.`);
        ui.toast('Lead marcado como perdido.');
      },
    });
  }

  /**
   * Fechar venda: lead vira cliente ativo e passa para o acompanhamento
   * ("Início do tratamento"). Em seguida, oferece registrar o pacote ou a cobrança.
   */
  async function fecharVenda(pessoa) {
    const { modal, form: f, store, ui, utils } = NutriDudu;
    const [servicos, profissionais] = await Promise.all([
      store.list('servicos', (s) => s.ativo),
      store.list('profissionais', (p) => p.ativo),
    ]);
    servicos.sort((a, b) => (a.categoria === 'pacote') - (b.categoria === 'pacote') || a.nome.localeCompare(b.nome, 'pt-BR'));
    const interesse = servicos.find((s) => s.id === pessoa.servicoInteresseId);
    const corpo = `
      <p class="campo-ajuda">${utils.escapeHtml(pessoa.nome)} vira <strong>cliente ativo</strong> e passa para o funil de acompanhamento, em "Início do tratamento".</p>
      ${f.selecao('servicoId', 'O que foi vendido', servicos.map((s) => [s.id, `${s.nome} — ${utils.moeda(s.valor)}${s.categoria === 'pacote' ? ` (pacote de ${s.qtdConsultas})` : ''}`]), interesse?.id || '', { vazio: 'Decidir depois' })}
      ${f.selecao('profissionalId', 'Profissional responsável', profissionais.map((p) => [p.id, p.nome]), pessoa.profissionalId || profissionais[0]?.id || '', { obrigatorio: true })}
      ${f.chave('registrar', 'Registrar o pacote ou a cobrança em seguida', true, { ajuda: 'Abre o formulário já preenchido com o serviço escolhido.' })}`;
    modal.formulario({
      titulo: `Fechar venda: ${pessoa.nome}`,
      corpo,
      textoSalvar: 'Fechar venda',
      ler: (form) => ({ servicoId: f.valor(form, 'servicoId') || null, profissionalId: f.valor(form, 'profissionalId'), registrar: f.marcado(form, 'registrar') }),
      validar: (d) => (d.profissionalId ? {} : { profissionalId: 'Escolha o profissional.' }),
      salvar: async (d) => {
        const agora = new Date().toISOString();
        const servico = servicos.find((s) => s.id === d.servicoId);
        const atualizada = await store.update('pessoas', pessoa.id, {
          status: 'ativo', clienteDesde: pessoa.clienteDesde || utils.isoDia(new Date()), funil: 'acompanhamento',
          etapa: 'inicio', etapaDesde: agora, etapaAuto: null, motivoPerda: null,
          profissionalId: d.profissionalId, servicoInteresseId: d.servicoId || pessoa.servicoInteresseId,
        });
        await registrar(pessoa.id, `Venda fechada${servico ? ` (${servico.nome})` : ''}: passou a cliente ativo, em "Início do tratamento" no acompanhamento.`);
        ui.toast(`${pessoa.nome} agora é cliente. O card foi para o acompanhamento.`);
        if (d.registrar && servico) {
          // Abre depois que esta janela fechar.
          setTimeout(() => {
            if (servico.categoria === 'pacote') NutriDudu.financeiro.contratarPacote({ pessoa: atualizada, servicoId: servico.id });
            else NutriDudu.financeiro.novoLancamento({ pessoa: atualizada, servicoId: servico.id });
          }, 0);
        }
      },
    });
  }

  /** Encerrar acompanhamento: cliente fica inativo. */
  function encerrar(pessoa) {
    const { modal, form: f, store, ui } = NutriDudu;
    modal.formulario({
      titulo: `Encerrar acompanhamento: ${pessoa.nome}`,
      corpo: `
        ${f.texto('motivo', 'Motivo (opcional)', '', { placeholder: 'Ex.: atingiu a meta, mudou de cidade' })}
        <p class="campo-ajuda">O cliente passa a <strong>inativo</strong> e sai dos movimentos automáticos. O histórico continua guardado.</p>`,
      textoSalvar: 'Encerrar',
      ler: (form) => ({ motivo: f.valor(form, 'motivo') }),
      salvar: async (d) => {
        await store.update('pessoas', pessoa.id, { etapa: 'encerrado', etapaDesde: new Date().toISOString(), status: 'inativo', motivoEncerramento: d.motivo || null });
        await registrar(pessoa.id, `Movido(a) de "${nomeEtapa('acompanhamento', pessoa.etapa)}" para "Encerrado / inativo"${d.motivo ? `: ${d.motivo}` : ''}.`);
        ui.toast('Acompanhamento encerrado.');
      },
    });
  }

  /** Decide o que fazer ao soltar um card numa etapa. */
  function soltar(pessoa, etapa) {
    if (!pessoa || pessoa.etapa === etapa) return;
    if (pessoa.funil === 'comercial' && etapa === 'fechado') return fecharVenda(pessoa);
    if (pessoa.funil === 'comercial' && etapa === 'perdido') return perder(pessoa);
    if (pessoa.funil === 'acompanhamento' && etapa === 'encerrado') return encerrar(pessoa);
    return mover(pessoa, etapa).then(() => NutriDudu.ui.toast(`Movido para "${nomeEtapa(pessoa.funil, etapa)}".`));
  }

  return {
    DIAS_FECHADO_VISIVEL, MOTIVOS_PERDA, nomeEtapa, etapaSugerida, sincronizar, mover, perder, fecharVenda, encerrar, soltar,
  };
})();
