// Alertas de retorno e recorrência: "nenhum cliente ativo fica sem próximo
// passo". Calcula os alertas de cada pessoa a partir das consultas e pacotes,
// e permite dispensar um alerta por um tempo (ex.: cliente viajando).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.alertas = (function () {
  const STATUS_FUTURO = ['agendada', 'confirmada'];

  // Ordem = prioridade na tela.
  const TIPOS = {
    falta_sem_remarcacao: { nome: 'Faltou e não remarcou', variante: 'perigo' },
    sumido: { nome: 'Cliente sumido', variante: 'perigo' },
    sem_retorno: { nome: 'Sem retorno marcado', variante: 'alerta' },
    retorno_vencido: { nome: 'Retorno vencido', variante: 'alerta' },
    pacote_atrasado: { nome: 'Pacote atrasado', variante: 'alerta' },
  };

  const PADROES = { diasRetornoPadrao: 60, diasClienteSumido: 120, diasFaltaRemarcar: 7, diasLeadParado: 7 };
  const regras = (geral = {}) => ({ ...PADROES, ...Object.fromEntries(Object.entries(geral).filter(([, v]) => v !== null && v !== undefined)) });

  /** Alerta dispensado e ainda dentro do prazo? */
  function dispensado(pessoa, tipo, agora = new Date()) {
    const d = pessoa.alertasDispensados?.[tipo];
    return Boolean(d && NutriDudu.utils.paraData(d.ate) >= NutriDudu.utils.inicioDoDia(agora));
  }

  /**
   * Alertas de uma pessoa. ctx: { consultas, pacotes } desta pessoa (sem canceladas).
   * Devolve [{ tipo, nome, variante, texto, dias, dispensado, dispensa }], do mais urgente ao menos.
   */
  function daPessoa(pessoa, ctx, geral = {}, agora = new Date(), { incluirDispensados = false } = {}) {
    const { utils, calculos } = NutriDudu;
    const r = regras(geral);
    const consultas = ctx.consultas.filter((c) => c.status !== 'cancelada');
    const lista = [];
    const add = (tipo, texto, dias) => lista.push({
      tipo, ...TIPOS[tipo], texto, dias, dispensado: dispensado(pessoa, tipo, agora), dispensa: pessoa.alertasDispensados?.[tipo] || null,
    });

    if (!['ativo', 'lead'].includes(pessoa.status) || pessoa.etapa === 'perdido') return [];
    const temFutura = consultas.some((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio) >= agora);
    const passadas = consultas.filter((c) => new Date(c.inicio) < agora).sort((a, b) => b.inicio.localeCompare(a.inicio));

    // Faltou e não remarcou: a última consulta que passou foi falta, há N dias ou mais, e nada novo marcado.
    const ultimaPassada = passadas.find((c) => ['realizada', 'faltou'].includes(c.status));
    if (ultimaPassada?.status === 'faltou' && !temFutura) {
      const dias = utils.diasEntre(ultimaPassada.inicio, agora);
      if (dias >= r.diasFaltaRemarcar) add('falta_sem_remarcacao', `faltou em ${utils.data(ultimaPassada.inicio)} (${utils.haDias(dias)}) e não remarcou`, dias);
    }

    if (pessoa.status === 'ativo') {
      const ultima = passadas.find((c) => c.status === 'realizada');
      if (ultima && !temFutura) {
        const dias = utils.diasEntre(ultima.inicio, agora);
        const prazo = pessoa.retornoDias || r.diasRetornoPadrao;
        const retornoPrevisto = ultima.proximoRetorno && utils.paraData(ultima.proximoRetorno) < utils.inicioDoDia(agora);
        if (dias > r.diasClienteSumido) {
          add('sumido', `sem consulta ${utils.haDias(dias)} (${utils.data(ultima.inicio)}) — sugerimos marcar como inativo e tentar a reativação`, dias);
        } else if (dias > prazo) {
          add('sem_retorno', `última consulta ${utils.haDias(dias)} (${utils.data(ultima.inicio)}) e nada agendado; o prazo de retorno é de ${prazo} dias`, dias);
        } else if (retornoPrevisto) {
          add('retorno_vencido', `o retorno estava previsto para ${utils.data(ultima.proximoRetorno)} e não foi agendado`, utils.diasEntre(ultima.proximoRetorno, agora));
        }
      }

      // Pacote atrasado: menos consultas (feitas + marcadas) que o ritmo previsto.
      const ativo = ctx.pacotes.filter((p) => calculos.statusPacote(p, agora) === 'ativo').sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
      if (ativo) {
        const uso = calculos.usoDoPacote(ativo, consultas.filter((c) => c.pacoteId === ativo.id));
        const ritmo = calculos.ritmoPacote(ativo, uso, agora);
        if (ritmo?.atrasadas) {
          add('pacote_atrasado', `${ritmo.atrasadas} consulta(s) atrás do ritmo do pacote (esperadas até hoje: ${ritmo.esperadas}; feitas ou marcadas: ${uso.usadas + uso.reservadas})`, ritmo.atrasadas);
        }
      }
    }

    const ordem = Object.keys(TIPOS);
    return lista
      .filter((a) => incluirDispensados || !a.dispensado)
      .sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
  }

  /** Alertas de todas as pessoas: [{ pessoa, alerta }], dos mais antigos para os mais recentes dentro de cada tipo. */
  function todos(dados, agora = new Date(), opcoes = {}) {
    const { calculos } = NutriDudu;
    const consultasDe = calculos.agruparPorPessoa(dados.consultas);
    const pacotesDe = calculos.agruparPorPessoa(dados.pacotes);
    const ordem = Object.keys(TIPOS);
    return dados.pessoas
      .flatMap((p) => daPessoa(p, { consultas: consultasDe(p.id), pacotes: pacotesDe(p.id) }, dados.geral, agora, opcoes)
        .map((alerta) => ({ pessoa: p, alerta })))
      .sort((a, b) => ordem.indexOf(a.alerta.tipo) - ordem.indexOf(b.alerta.tipo) || b.alerta.dias - a.alerta.dias);
  }

  /** Dispensar um alerta por um tempo, com motivo (vai para o histórico). */
  function dispensar(pessoa, tipo) {
    const { modal, form: f, store, ui, utils, permissoes } = NutriDudu;
    const DIAS = { 7: '7 dias', 15: '15 dias', 30: '30 dias', 60: '60 dias', 90: '90 dias' };
    modal.formulario({
      titulo: `Dispensar alerta: ${pessoa.nome}`,
      corpo: `
        <p>${utils.escapeHtml(TIPOS[tipo].nome)}. O alerta some pelo período escolhido e volta se a situação continuar.</p>
        ${f.selecao('dias', 'Dispensar por', DIAS, '30')}
        ${f.texto('motivo', 'Motivo', '', { obrigatorio: true, placeholder: 'Ex.: viajando até o fim do mês' })}`,
      textoSalvar: 'Dispensar',
      ler: (form) => ({ dias: Number(f.valor(form, 'dias')), motivo: f.valor(form, 'motivo') }),
      validar: (d) => (d.motivo ? {} : { motivo: 'Informe o motivo (fica no histórico).' }),
      salvar: async (d) => {
        const ate = new Date();
        ate.setDate(ate.getDate() + d.dias);
        await store.update('pessoas', pessoa.id, {
          alertasDispensados: { ...(pessoa.alertasDispensados || {}), [tipo]: { ate: utils.isoDia(ate), motivo: d.motivo, por: permissoes.atual() } },
        });
        await store.create('interacoes', {
          pessoaId: pessoa.id, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
          descricao: `Alerta "${TIPOS[tipo].nome}" dispensado até ${utils.data(ate)}: ${d.motivo}.`,
        });
        ui.toast(`Alerta dispensado até ${utils.data(ate)}.`);
      },
    });
  }

  /** Volta a mostrar um alerta dispensado. */
  async function reativar(pessoa, tipo) {
    const { store } = NutriDudu;
    const resto = { ...(pessoa.alertasDispensados || {}) };
    delete resto[tipo];
    await store.update('pessoas', pessoa.id, { alertasDispensados: resto });
  }

  return { TIPOS, PADROES, regras, daPessoa, todos, dispensar, reativar, dispensado };
})();
