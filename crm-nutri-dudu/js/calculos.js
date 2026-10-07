// Regras de negócio calculadas a partir dos dados (sem mexer na tela):
// uso de pacotes, valores em aberto/atrasados e o resumo de cada cliente.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.calculos = (function () {
  const { paraData, inicioDoDia, diasEntre } = NutriDudu.utils;

  const DIAS_AVISO_VENCIMENTO = 15;
  const STATUS_FUTURO = ['agendada', 'confirmada'];

  const valorLiquido = (l) => (Number(l.valor) || 0) - (Number(l.desconto) || 0);

  /** Pendente com vencimento antes de hoje. */
  function lancamentoAtrasado(l, hoje = new Date()) {
    return l.status === 'pendente' && paraData(l.vencimento) < inicioDoDia(hoje);
  }

  /** Quantas consultas do pacote já foram usadas (realizadas + faltas que descontam) e quantas estão reservadas. */
  function usoDoPacote(pacote, consultasDoPacote) {
    const usadas = consultasDoPacote.filter((c) =>
      c.status === 'realizada' || (c.status === 'faltou' && c.descontarFalta !== false)).length;
    const reservadas = consultasDoPacote.filter((c) => STATUS_FUTURO.includes(c.status)).length;
    return { usadas, reservadas, total: pacote.qtdConsultas, saldo: Math.max(0, pacote.qtdConsultas - usadas) };
  }

  /**
   * Resumo de uma pessoa para listas e cartões.
   * ctx: { consultas, pacotes, lancamentos } JÁ filtrados para esta pessoa; geral: configurações.
   */
  function resumoPessoa(pessoa, ctx, geral = {}, agora = new Date()) {
    const { consultas, pacotes, lancamentos } = ctx;

    const realizadas = consultas
      .filter((c) => c.status === 'realizada')
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ultima = realizadas[0] || null;
    const proxima = consultas
      .filter((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio) >= agora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0] || null;
    const diasSemConsulta = ultima ? diasEntre(ultima.inicio, agora) : null;

    const ativo = pacotes
      .filter((p) => statusPacote(p, agora) === 'ativo')
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null;
    let pacote = null;
    if (ativo) {
      const uso = usoDoPacote(ativo, consultas.filter((c) => c.pacoteId === ativo.id));
      const diasParaVencer = diasEntre(agora, ativo.validade);
      pacote = {
        ...uso, id: ativo.id, servicoId: ativo.servicoId, validade: ativo.validade, diasParaVencer,
        acabando: uso.saldo <= 1 || diasParaVencer <= DIAS_AVISO_VENCIMENTO,
      };
    }

    const pendentes = lancamentos.filter((l) => l.status === 'pendente');
    const emAberto = pendentes.reduce((t, l) => t + valorLiquido(l), 0);
    const atrasado = pendentes.filter((l) => lancamentoAtrasado(l, agora)).reduce((t, l) => t + valorLiquido(l), 0);

    // Sem retorno marcado: cliente ativo, sem consulta há mais que o prazo e nada agendado.
    const prazo = pessoa.retornoDias || geral.diasRetornoPadrao || 60;
    const semRetorno = pessoa.status === 'ativo' && !proxima && diasSemConsulta !== null && diasSemConsulta > prazo;

    return { ultima, diasSemConsulta, proxima, pacote, emAberto, atrasado, semRetorno, prazoRetorno: prazo };
  }

  /** Agrupa uma lista por pessoaId, para montar o ctx de várias pessoas de uma vez. */
  function agruparPorPessoa(lista) {
    const mapa = new Map();
    lista.forEach((item) => {
      if (!mapa.has(item.pessoaId)) mapa.set(item.pessoaId, []);
      mapa.get(item.pessoaId).push(item);
    });
    return (pessoaId) => mapa.get(pessoaId) || [];
  }

  const DIAS_FREQUENCIA = { semanal: 7, quinzenal: 15, mensal: 30 };

  /** Status de verdade do pacote: um "ativo" com validade vencida é "vencido". */
  function statusPacote(pacote, hoje = new Date()) {
    if (pacote.status === 'ativo' && paraData(pacote.validade) < inicioDoDia(hoje)) return 'vencido';
    return pacote.status;
  }

  /**
   * Ritmo do pacote com frequência prevista: quantas consultas já deveriam ter sido
   * feitas até hoje (a primeira no início) e quantas estão atrasadas.
   */
  function ritmoPacote(pacote, uso, hoje = new Date()) {
    const passo = DIAS_FREQUENCIA[pacote.frequencia];
    if (!passo) return null;
    const dias = diasEntre(pacote.inicio, hoje);
    if (dias < 0) return { esperadas: 0, atrasadas: 0 };
    const esperadas = Math.min(pacote.qtdConsultas, Math.floor(dias / passo) + 1);
    return { esperadas, atrasadas: Math.max(0, esperadas - uso.usadas - uso.reservadas) };
  }

  return {
    valorLiquido, lancamentoAtrasado, usoDoPacote, resumoPessoa, agruparPorPessoa, statusPacote, ritmoPacote, DIAS_FREQUENCIA,
  };
})();
