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

    return {
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

  return { PERIODOS, intervalo, dentro, calcular };
})();
