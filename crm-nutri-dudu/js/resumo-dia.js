// Resumo do dia para a equipe (WhatsApp): consultas de hoje e o que precisa de atenção.
// Usado pelo servidor (envio automático) e pelo sistema (prévia em Configurações),
// para os dois mostrarem sempre o mesmo texto. Nada de dados de saúde: só primeiro
// nome, horário e situação.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.resumoDia = (function () {
  const MAX_CONSULTAS_LISTADAS = 12;
  const MAX_PARAMETRO = 700; // a Meta limita o tamanho das variáveis do modelo

  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'Paciente';

  /**
   * dados: { consultas, pessoas, lancamentos, conversas, espera, profissionais }
   * opcoes:
   *   agora: Date (instante real)
   *   local(iso) → Date no relógio da clínica (no navegador, new Date(iso))
   * Devolve { dia, texto (com quebras de linha), parametros: [dia, resumo numa linha], vazio }.
   */
  function montar(dados, { agora = new Date(), local = (iso) => new Date(iso) } = {}) {
    const { utils, calculos } = NutriDudu;
    const hojeLocal = local(agora.toISOString());
    const hoje = utils.isoDia(hojeLocal);
    const dia = utils.diaPorExtenso(hojeLocal).replace(/^./, (c) => c.toLowerCase());
    const pessoaPor = Object.fromEntries((dados.pessoas || []).map((p) => [p.id, p]));
    const profissionais = (dados.profissionais || []).filter((p) => p.ativo !== false);
    const nomeProf = Object.fromEntries(profissionais.map((p) => [p.id, primeiroNome(p.nome)]));
    const variosProfs = profissionais.length > 1;

    const deHoje = (dados.consultas || [])
      .filter((c) => ['agendada', 'confirmada', 'realizada'].includes(c.status) && utils.isoDia(local(c.inicio)) === hoje)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const semConfirmar = deHoje.filter((c) => c.status === 'agendada' && new Date(c.inicio) > agora);
    const preRevisar = deHoje.filter((c) => c.preAnamnese?.status === 'preenchida');
    const aguardando = (dados.conversas || []).filter((c) => c.status === 'aguardando_equipe');
    const atrasados = (dados.lancamentos || []).filter((l) => calculos.lancamentoAtrasado(l, hojeLocal));
    const totalAtrasado = atrasados.reduce((t, l) => t + calculos.valorLiquido(l), 0);
    const naEspera = (dados.espera || []).filter((e) => NutriDudu.espera?.ativo(e, hoje));
    const mesDia = hoje.slice(5);
    const aniversarios = (dados.pessoas || []).filter((p) => p.status !== 'lead' && p.dataNascimento && String(p.dataNascimento).slice(5, 10) === mesDia);

    const descreverConsulta = (c, curto = false) => {
      const nome = primeiroNome(pessoaPor[c.pessoaId]?.nome);
      const extras = [
        c.tipo === 'online' ? 'online' : '',
        variosProfs ? nomeProf[c.profissionalId] || '' : '',
        c.status === 'agendada' && new Date(c.inicio) > agora ? 'sem confirmar' : '',
        c.status === 'realizada' ? 'realizada' : '',
      ].filter(Boolean);
      const marca = c.status === 'confirmada' ? ' ✓' : '';
      return curto
        ? `${utils.hora(local(c.inicio))} ${nome}${marca}${extras.length ? ` (${extras.join(', ')})` : ''}`
        : `- ${utils.hora(local(c.inicio))} ${nome}${marca}${extras.length ? ` — ${extras.join(', ')}` : ''}`;
    };

    // ---------- Texto completo (mensagem normal, dentro das 24 h) ----------
    const linhas = [`☀️ Bom dia! Resumo de ${dia}`, ''];
    if (deHoje.length) {
      linhas.push(`📅 Consultas de hoje (${deHoje.length}):`);
      deHoje.slice(0, MAX_CONSULTAS_LISTADAS).forEach((c) => linhas.push(descreverConsulta(c)));
      if (deHoje.length > MAX_CONSULTAS_LISTADAS) linhas.push(`- e mais ${deHoje.length - MAX_CONSULTAS_LISTADAS}`);
    } else {
      linhas.push('📅 Nenhuma consulta marcada para hoje.');
    }
    const avisos = [];
    if (semConfirmar.length) avisos.push(`⚠️ Sem confirmar: ${semConfirmar.length}`);
    if (preRevisar.length) avisos.push(`📝 Pré-anamnese preenchida (revise antes): ${preRevisar.map((c) => primeiroNome(pessoaPor[c.pessoaId]?.nome)).join(', ')}`);
    if (aguardando.length) avisos.push(`💬 Conversas aguardando a equipe: ${aguardando.length}`);
    if (atrasados.length) avisos.push(`💰 Pagamentos atrasados: ${atrasados.length} (${utils.moeda(totalAtrasado)})`);
    if (naEspera.length) avisos.push(`⏳ Lista de espera: ${naEspera.length} ${naEspera.length === 1 ? 'pessoa' : 'pessoas'}`);
    if (aniversarios.length) avisos.push(`🎂 Aniversário: ${aniversarios.map((p) => primeiroNome(p.nome)).join(', ')}`);
    if (avisos.length) linhas.push('', ...avisos);
    linhas.push('', 'Abra o sistema para ver os detalhes.');

    // ---------- Uma linha só (variável do modelo: sem quebras de linha) ----------
    const partes = [];
    partes.push(deHoje.length
      ? `${deHoje.length} ${deHoje.length === 1 ? 'consulta' : 'consultas'} (${deHoje.slice(0, MAX_CONSULTAS_LISTADAS).map((c) => descreverConsulta(c, true)).join(', ')}${deHoje.length > MAX_CONSULTAS_LISTADAS ? `, e mais ${deHoje.length - MAX_CONSULTAS_LISTADAS}` : ''})`
      : 'nenhuma consulta marcada');
    if (semConfirmar.length) partes.push(`${semConfirmar.length} sem confirmar`);
    if (preRevisar.length) partes.push(`pré-anamnese para revisar: ${preRevisar.map((c) => primeiroNome(pessoaPor[c.pessoaId]?.nome)).join(', ')}`);
    if (aguardando.length) partes.push(`${aguardando.length} ${aguardando.length === 1 ? 'conversa aguardando' : 'conversas aguardando'} a equipe`);
    if (atrasados.length) partes.push(`${atrasados.length} ${atrasados.length === 1 ? 'pagamento atrasado' : 'pagamentos atrasados'} (${utils.moeda(totalAtrasado)})`);
    if (naEspera.length) partes.push(`${naEspera.length} na lista de espera`);
    if (aniversarios.length) partes.push(`aniversário: ${aniversarios.map((p) => primeiroNome(p.nome)).join(', ')}`);
    let resumo = partes.join('; ').replace(/\s+/g, ' ').trim();
    if (resumo.length > MAX_PARAMETRO) resumo = `${resumo.slice(0, MAX_PARAMETRO - 1)}…`;

    return {
      dia,
      texto: linhas.join('\n'),
      parametros: [dia, resumo],
      vazio: !deHoje.length && !avisos.length,
    };
  }

  return { montar };
})();
