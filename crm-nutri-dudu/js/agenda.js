// Regras da agenda (sem tela): períodos de atendimento, bloqueios, conflitos,
// horários livres e ocupação. A página Agenda usa estas funções, e o agente do
// WhatsApp (fase 10) vai usar as mesmas para oferecer horários.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.agenda = (function () {
  const { paraData, isoDia, hora } = NutriDudu.utils;

  // Status que ocupam o horário na agenda.
  const OCUPAM = ['agendada', 'confirmada', 'realizada'];
  const MIN = 60000;

  const minutosDe = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  /** Date local do dia (Date ou 'aaaa-mm-dd') às hh:mm. */
  function dataComHora(dia, hhmm) {
    const d = new Date(paraData(typeof dia === 'string' ? dia : isoDia(dia)));
    const total = minutosDe(hhmm);
    d.setHours(Math.floor(total / 60), total % 60, 0, 0);
    return d;
  }

  const somarMin = (data, minutos) => new Date(data.getTime() + minutos * MIN);
  const sobrepoe = (aIni, aFim, bIni, bFim) => aIni < bFim && aFim > bIni;

  /** Períodos de atendimento do profissional no dia: [{ inicio, fim, modalidade }]. */
  function periodosDoDia(profissionalId, dia, horarios) {
    const d = paraData(typeof dia === 'string' ? dia : isoDia(dia));
    return horarios
      .filter((h) => h.profissionalId === profissionalId && h.diaSemana === d.getDay())
      .map((h) => ({ inicio: dataComHora(d, h.inicio), fim: dataComHora(d, h.fim), modalidade: h.modalidade || 'ambos' }))
      .sort((a, b) => a.inicio - b.inicio);
  }

  /** Bloqueios do profissional (ou da clínica toda) que encostam no intervalo. */
  function bloqueiosNoIntervalo(profissionalId, inicio, fim, bloqueios) {
    return bloqueios.filter((b) => (!b.profissionalId || b.profissionalId === profissionalId) &&
      sobrepoe(inicio, fim, new Date(b.inicio), new Date(b.fim)));
  }

  /** Consultas do profissional que conflitam, contando o intervalo mínimo entre consultas. */
  function conflitos(profissionalId, inicio, fim, consultas, intervaloMin = 0, ignorarId = null) {
    return consultas.filter((c) => c.id !== ignorarId && c.profissionalId === profissionalId &&
      OCUPAM.includes(c.status) &&
      // Cada consulta "ocupa" também o intervalo logo depois dela.
      sobrepoe(inicio, somarMin(fim, intervaloMin), new Date(c.inicio), somarMin(new Date(c.fim), intervaloMin)));
  }

  /**
   * Confere se dá para marcar. Devolve a lista de problemas (vazia = pode marcar).
   * pedido: { profissionalId, inicio: Date, fim: Date, modalidade: 'presencial'|'online', ignorarConsultaId }
   * ctx: { horarios, bloqueios, consultas, geral, nomePessoa(id), nomeProfissional(id), agora }
   */
  function verificar(pedido, ctx) {
    const { profissionalId, inicio, fim, modalidade = 'presencial', ignorarConsultaId = null } = pedido;
    const agora = ctx.agora || new Date();
    const problemas = [];
    const nomeProf = ctx.nomeProfissional ? ctx.nomeProfissional(profissionalId) : 'O profissional';

    if (inicio < agora) problemas.push({ tipo: 'passado', mensagem: 'Esse horário já passou.' });

    const periodos = periodosDoDia(profissionalId, inicio, ctx.horarios);
    if (!periodos.length) {
      problemas.push({ tipo: 'fora', mensagem: `${nomeProf} não atende neste dia da semana.` });
    } else {
      const periodo = periodos.find((p) => inicio >= p.inicio && fim <= p.fim);
      if (!periodo) {
        const faixas = periodos.map((p) => `${hora(p.inicio)}–${hora(p.fim)}`).join(' e ');
        problemas.push({ tipo: 'fora', mensagem: `Fora do horário de atendimento (${faixas}).` });
      } else if (periodo.modalidade !== 'ambos' && periodo.modalidade !== modalidade) {
        problemas.push({ tipo: 'modalidade', mensagem: `Neste período o atendimento é só ${periodo.modalidade === 'online' ? 'online' : 'presencial'}.` });
      }
    }

    bloqueiosNoIntervalo(profissionalId, inicio, fim, ctx.bloqueios).forEach((b) => {
      problemas.push({ tipo: 'bloqueio', mensagem: `Horário bloqueado: ${b.motivo}.` });
    });

    const intervalo = ctx.geral?.intervaloEntreConsultasMin || 0;
    conflitos(profissionalId, inicio, fim, ctx.consultas, intervalo, ignorarConsultaId).forEach((c) => {
      const nome = ctx.nomePessoa ? ctx.nomePessoa(c.pessoaId) : 'outro paciente';
      problemas.push({
        tipo: 'conflito',
        mensagem: `Conflita com ${nome} (${hora(c.inicio)}–${hora(c.fim)})${intervalo ? `, contando ${intervalo} min de intervalo` : ''}.`,
      });
    });
    return problemas;
  }

  /**
   * Inícios livres no dia para uma consulta de `duracaoMin`. Candidatos: de `passoMin` em
   * `passoMin` a partir de cada período e logo depois de cada consulta (já com o intervalo),
   * para não deixar buracos na agenda.
   */
  function horariosLivres({ profissionalId, dia, duracaoMin, modalidade = 'presencial', passoMin = 30, ignorarConsultaId = null }, ctx) {
    const intervalo = ctx.geral?.intervaloEntreConsultasMin || 0;
    const candidatos = new Map();
    periodosDoDia(profissionalId, dia, ctx.horarios).forEach((p) => {
      for (let ini = p.inicio; somarMin(ini, duracaoMin) <= p.fim; ini = somarMin(ini, passoMin)) candidatos.set(+ini, ini);
      ctx.consultas
        .filter((c) => c.profissionalId === profissionalId && OCUPAM.includes(c.status) && c.id !== ignorarConsultaId)
        .map((c) => somarMin(new Date(c.fim), intervalo))
        .filter((ini) => ini >= p.inicio && somarMin(ini, duracaoMin) <= p.fim)
        .forEach((ini) => candidatos.set(+ini, ini));
    });
    return [...candidatos.values()]
      .sort((a, b) => a - b)
      .filter((ini) => !verificar({ profissionalId, inicio: ini, fim: somarMin(ini, duracaoMin), modalidade, ignorarConsultaId }, ctx).length);
  }

  /** Minutos disponíveis (períodos menos bloqueios) e ocupados por consultas, entre dois dias (inclusive). */
  function ocupacao(profissionalId, diaInicio, diaFim, ctx) {
    let disponivel = 0;
    let ocupado = 0;
    for (let d = paraData(isoDia(diaInicio)); d <= paraData(isoDia(diaFim)); d.setDate(d.getDate() + 1)) {
      periodosDoDia(profissionalId, d, ctx.horarios).forEach((p) => {
        let livres = (p.fim - p.inicio) / MIN;
        bloqueiosNoIntervalo(profissionalId, p.inicio, p.fim, ctx.bloqueios).forEach((b) => {
          const ini = Math.max(p.inicio, new Date(b.inicio));
          const fim = Math.min(p.fim, new Date(b.fim));
          livres -= Math.max(0, (fim - ini) / MIN);
        });
        disponivel += Math.max(0, livres);
        ctx.consultas
          .filter((c) => c.profissionalId === profissionalId && OCUPAM.includes(c.status))
          .forEach((c) => {
            const ini = Math.max(p.inicio, new Date(c.inicio));
            const fim = Math.min(p.fim, new Date(c.fim));
            ocupado += Math.max(0, (fim - ini) / MIN);
          });
      });
    }
    return { disponivelMin: disponivel, ocupadoMin: Math.min(ocupado, disponivel), taxa: disponivel ? Math.min(1, ocupado / disponivel) : null };
  }

  /**
   * Distribui eventos que se sobrepõem lado a lado.
   * eventos: [{ inicio: Date, fim: Date, ... }] → cada um ganha { coluna, colunas }.
   */
  function distribuirLado(eventos) {
    const ordenados = [...eventos].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
    let grupo = [];
    let fimGrupo = null;
    const fecharGrupo = () => {
      const colunasFim = [];
      grupo.forEach((e) => {
        let col = colunasFim.findIndex((f) => f <= e.inicio);
        if (col === -1) { col = colunasFim.length; colunasFim.push(e.fim); } else colunasFim[col] = e.fim;
        e.coluna = col;
      });
      grupo.forEach((e) => { e.colunas = colunasFim.length; });
      grupo = [];
    };
    ordenados.forEach((e) => {
      if (fimGrupo && e.inicio >= fimGrupo) { fecharGrupo(); fimGrupo = null; }
      grupo.push(e);
      fimGrupo = fimGrupo && fimGrupo > e.fim ? fimGrupo : e.fim;
    });
    if (grupo.length) fecharGrupo();
    return ordenados;
  }

  return {
    OCUPAM, minutosDe, dataComHora, somarMin, periodosDoDia, bloqueiosNoIntervalo, conflitos,
    verificar, horariosLivres, ocupacao, distribuirLado,
  };
})();
