// Cálculo dos indicadores do Dashboard. Funções puras: recebem os dados e o
// período e devolvem números — sem mexer na tela.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.indicadores = (function () {
  const { paraData, inicioDoDia } = NutriDudu.utils;
  const { FUNIS, ORIGENS } = NutriDudu.config;

  const PERIODOS = {
    hoje: 'Hoje',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    mes: 'Este mês',
    mes_passado: 'Mês passado',
    personalizado: 'Personalizado',
  };

  const somarDias = (data, dias) => {
    const d = new Date(data);
    d.setDate(d.getDate() + dias);
    return d;
  };

  // Intervalo [inicio, fim) — o fim não entra. `de`/`ate` (aaaa-mm-dd) só no personalizado.
  function intervalo(preset, de, ate) {
    const hoje = inicioDoDia(new Date());
    const amanha = somarDias(hoje, 1);
    switch (preset) {
      case 'hoje': return { inicio: hoje, fim: amanha };
      case '7d': return { inicio: somarDias(hoje, -6), fim: amanha };
      case '30d': return { inicio: somarDias(hoje, -29), fim: amanha };
      case 'mes_passado':
        return {
          inicio: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
          fim: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
        };
      case 'personalizado': {
        const inicio = inicioDoDia(paraData(de) || hoje);
        const fimIncluso = inicioDoDia(paraData(ate) || hoje);
        return fimIncluso < inicio
          ? { inicio: fimIncluso, fim: somarDias(inicio, 1) }
          : { inicio, fim: somarDias(fimIncluso, 1) };
      }
      case 'mes':
      default:
        return {
          inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
          fim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1),
        };
    }
  }

  function dentro(valor, periodo) {
    const d = paraData(valor);
    return Boolean(d) && d >= periodo.inicio && d < periodo.fim;
  }

  const contarPor = (lista, chave) => lista.reduce((acc, item) => {
    const k = chave(item);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const valorLiquido = (l) => (Number(l.valor) || 0) - (Number(l.desconto) || 0);

  /**
   * dados: { pessoas, consultas, lancamentos, servicos }
   * periodo: { inicio, fim }
   */
  function calcular(dados, periodo) {
    const { pessoas, consultas, lancamentos, servicos } = dados;

    // Clientes novos: quem fechou (virou cliente) dentro do período.
    const clientesNovos = pessoas.filter((p) => dentro(p.clienteDesde, periodo)).length;

    // Atendimentos: consultas realizadas; agendadas/confirmadas do período à parte.
    const doPeriodo = consultas.filter((c) => dentro(c.inicio, periodo));
    const realizadas = doPeriodo.filter((c) => c.status === 'realizada');
    const previstas = doPeriodo.filter((c) => ['agendada', 'confirmada'].includes(c.status));

    // Faturamento estimado: tudo que vence no período (pago + a receber), sem cancelados.
    const lancPeriodo = lancamentos.filter((l) => l.status !== 'cancelado' && dentro(l.vencimento, periodo));
    const faturamentoEstimado = lancPeriodo.reduce((t, l) => t + valorLiquido(l), 0);
    const recebido = lancPeriodo.filter((l) => l.status === 'pago').reduce((t, l) => t + valorLiquido(l), 0);

    // Conversão: dos leads que chegaram no período, quantos já viraram clientes.
    const leadsPeriodo = pessoas.filter((p) => dentro(p.criadoEm, periodo));
    const convertidos = leadsPeriodo.filter((p) => p.clienteDesde).length;

    // Serviços e planos mais realizados (atendimentos realizados por serviço).
    const nomeServico = Object.fromEntries(servicos.map((s) => [s.id, s.nome]));
    const porServico = Object.entries(contarPor(realizadas, (c) => c.servicoId))
      .map(([id, qtd]) => ({ id, nome: nomeServico[id] || 'Serviço removido', qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));

    // Dias mais movimentados: realizadas + previstas por dia da semana (0 = domingo).
    const porDiaSemana = Array(7).fill(0);
    [...realizadas, ...previstas].forEach((c) => { porDiaSemana[paraData(c.inicio).getDay()]++; });

    // Origem dos leads que chegaram no período, na ordem fixa das origens.
    const contagemOrigem = contarPor(leadsPeriodo, (p) => p.origem);
    const porOrigem = Object.entries(ORIGENS)
      .map(([id, nome]) => ({ id, nome, qtd: contagemOrigem[id] || 0 }))
      .filter((o) => o.id !== 'outro' || o.qtd > 0);

    // Leads por etapa do funil comercial: retrato de agora (não depende do período).
    const contagemEtapa = contarPor(pessoas.filter((p) => p.funil === 'comercial'), (p) => p.etapa);
    const porEtapa = FUNIS.comercial.etapas.map((e) => ({ id: e.id, nome: e.nome, qtd: contagemEtapa[e.id] || 0 }));

    // Faltas: das consultas que já aconteceram no período, quantas foram falta.
    const faltou = doPeriodo.filter((c) => c.status === 'faltou').length;
    const baseFaltas = realizadas.length + faltou;

    // Ticket médio: valor médio de cada pagamento recebido (vencimento no período).
    const pagos = lancPeriodo.filter((l) => l.status === 'pago');

    // Conversão por origem.
    const convertidosOrigem = contarPor(leadsPeriodo.filter((p) => p.clienteDesde), (p) => p.origem);
    porOrigem.forEach((o) => { o.convertidos = convertidosOrigem[o.id] || 0; });

    return {
      faltas: { faltou, base: baseFaltas, taxa: baseFaltas ? faltou / baseFaltas : null },
      ticketMedio: pagos.length ? recebido / pagos.length : null,
      pagamentos: pagos.length,
      retorno: taxaRetorno(dados, periodo),
      clientesNovos,
      atendimentos: realizadas.length,
      atendimentosPrevistos: previstas.length,
      faturamentoEstimado,
      recebido,
      conversao: {
        leads: leadsPeriodo.length,
        convertidos,
        taxa: leadsPeriodo.length ? convertidos / leadsPeriodo.length : null,
      },
      porServico,
      porDiaSemana,
      porOrigem,
      porEtapa,
    };
  }

  /**
   * Taxa de retorno: de cada consulta realizada cujo retorno "vencia" no período
   * (data de próximo retorno, ou a consulta + prazo do cliente), o cliente voltou
   * a tempo? Voltar = ter outra consulta (feita ou marcada) até 7 dias depois do prazo.
   */
  function taxaRetorno(dados, periodo, agora = new Date()) {
    const { pessoas, consultas, geral = {} } = dados;
    const TOLERANCIA = 7;
    const pessoa = Object.fromEntries(pessoas.map((p) => [p.id, p]));
    const validas = consultas.filter((c) => !['cancelada', 'faltou'].includes(c.status));
    let devidos = 0;
    let voltaram = 0;
    validas.filter((c) => c.status === 'realizada').forEach((c) => {
      const p = pessoa[c.pessoaId];
      if (!p) return;
      let prazo = paraData(c.proximoRetorno);
      if (!prazo) {
        prazo = inicioDoDia(c.inicio);
        prazo.setDate(prazo.getDate() + (p.retornoDias || geral.diasRetornoPadrao || 60));
      }
      if (prazo < periodo.inicio || prazo >= periodo.fim || prazo > agora) return;
      // Cliente que encerrou antes do prazo não conta.
      if (p.status === 'inativo' && p.etapaDesde && new Date(p.etapaDesde) < prazo) return;
      devidos += 1;
      const limite = somarDias(prazo, TOLERANCIA + 1);
      if (validas.some((o) => o.pessoaId === c.pessoaId && o.inicio > c.inicio && new Date(o.inicio) < limite)) voltaram += 1;
    });
    return { devidos, voltaram, taxa: devidos ? voltaram / devidos : null };
  }

  /** Retrato de agora (não depende do período): carteira de clientes, valores a receber e pacotes. */
  function carteira(dados, agora = new Date()) {
    const { calculos } = NutriDudu;
    const { pessoas, lancamentos, pacotes } = dados;
    const pendentes = lancamentos.filter((l) => l.status === 'pendente');
    const aReceber = pendentes.reduce((t, l) => t + valorLiquido(l), 0);
    const atrasado = pendentes.filter((l) => calculos.lancamentoAtrasado(l, agora)).reduce((t, l) => t + valorLiquido(l), 0);
    const pacotesAtivos = pacotes.filter((p) => calculos.statusPacote(p, agora) === 'ativo').length;
    // Renovação: dos pacotes que terminaram (concluídos ou vencidos), quantos tiveram um pacote seguinte.
    const terminados = pacotes.filter((p) => ['concluido', 'vencido'].includes(calculos.statusPacote(p, agora)));
    const renovados = terminados.filter((p) => pacotes.some((o) => o.pessoaId === p.pessoaId && o.id !== p.id && o.inicio >= p.inicio)).length;
    return {
      clientesAtivos: pessoas.filter((p) => p.status === 'ativo').length,
      leadsNoFunil: pessoas.filter((p) => p.funil === 'comercial' && !['perdido', 'fechado'].includes(p.etapa)).length,
      aReceber,
      atrasado,
      pacotesAtivos,
      renovacao: { terminados: terminados.length, renovados, taxa: terminados.length ? renovados / terminados.length : null },
    };
  }

  /** Faturamento (lançamentos não cancelados, pelo vencimento) dos últimos N meses, terminando no mês atual. */
  function faturamentoMensal(lancamentos, meses = 12, agora = new Date()) {
    const lista = [];
    for (let i = meses - 1; i >= 0; i--) {
      const inicio = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
      const doMes = lancamentos.filter((l) => l.status !== 'cancelado' && dentro(l.vencimento, { inicio, fim }));
      const nomeMes = inicio.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      lista.push({
        nome: inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        curto: inicio.getMonth() === 0 || i === meses - 1 ? `${nomeMes}/${String(inicio.getFullYear()).slice(2)}` : nomeMes,
        qtd: doMes.reduce((t, l) => t + valorLiquido(l), 0),
        recebido: doMes.filter((l) => l.status === 'pago').reduce((t, l) => t + valorLiquido(l), 0),
        atual: i === 0,
      });
    }
    return lista;
  }

  /** Clientes que mais indicaram (desde sempre). */
  function quemMaisIndicou(pessoas, limite = 5) {
    const nome = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]));
    const indicadas = pessoas.filter((p) => p.indicadoPorId && nome[p.indicadoPorId]);
    const fecharam = contarPor(indicadas.filter((p) => p.clienteDesde), (p) => p.indicadoPorId);
    return Object.entries(contarPor(indicadas, (p) => p.indicadoPorId))
      .map(([id, qtd]) => ({ id, nome: nome[id], qtd, fecharam: fecharam[id] || 0 }))
      .sort((a, b) => b.qtd - a.qtd || b.fecharam - a.fecharam || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, limite);
  }

  return { PERIODOS, intervalo, dentro, calcular, taxaRetorno, carteira, faturamentoMensal, quemMaisIndicou };
})();
