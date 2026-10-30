// Lista de espera: regras usadas pelo sistema (tela da Agenda) e pelo servidor
// (supabase/fonte/automacoes.js), para os dois sempre concordarem.
//
// Um pedido da lista de espera:
// { pessoaId, servicoId, profissionalId (null = qualquer), modalidade ('presencial' | 'online' | 'qualquer'),
//   dias: [1, 2…] (dias da semana; vazio = qualquer), periodo ('manha' | 'tarde' | 'qualquer'),
//   ateDia ('AAAA-MM-DD' ou null), consultaId (consulta que a pessoa quer antecipar, ou null),
//   observacao, status ('aguardando' | 'agendado' | 'cancelado'), origem ('equipe' | 'agente'),
//   ofertas: [{ id, profissionalId, inicio, servicoId, modalidade, em, ok, via, status }] }
window.NutriDudu = window.NutriDudu || {};

NutriDudu.espera = (function () {
  const PERIODOS = { qualquer: 'Qualquer horário', manha: 'Manhã (antes das 12h)', tarde: 'Tarde (a partir das 12h)' };
  const MODALIDADES = { qualquer: 'Presencial ou online', presencial: 'Presencial', online: 'Online' };
  const STATUS = { aguardando: 'Aguardando', agendado: 'Agendado', cancelado: 'Saiu da lista' };
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Quantas pessoas recebem a oferta de cada horário (o primeiro que confirmar fica com ele).
  const OFERTAS_POR_VAGA = 3;
  // Antecedência mínima e máxima do horário liberado para valer a pena oferecer.
  const ANTECEDENCIA_MIN_H = 3;
  const ANTECEDENCIA_MAX_DIAS = 30;
  // Uma oferta sem resposta "segura" a pessoa por este tempo antes de ela receber outra.
  const OFERTA_ABERTA_H = 12;

  const isoDia = (d) => NutriDudu.utils.isoDia(d);

  /** O pedido ainda vale hoje? (aguardando e sem ter passado o "até"). */
  function ativo(entrada, hojeIso) {
    return entrada?.status === 'aguardando' && (!entrada.ateDia || entrada.ateDia >= hojeIso);
  }

  /**
   * O horário liberado combina com o pedido? Devolve a modalidade a usar ('presencial' | 'online') ou null.
   * vaga: { profissionalId, inicio: Date (relógio da clínica) }
   * ctx: { servicoPorId, consultaPorId, diasPermitidos(modalidade) → [0..6], hojeIso }
   */
  function combina(entrada, vaga, ctx) {
    if (!ativo(entrada, ctx.hojeIso)) return null;
    if (entrada.profissionalId && entrada.profissionalId !== vaga.profissionalId) return null;
    const servico = ctx.servicoPorId[entrada.servicoId];
    if (!servico || servico.ativo === false || !(servico.profissionalIds || []).includes(vaga.profissionalId)) return null;
    const dia = vaga.inicio.getDay();
    if ((entrada.dias || []).length && !entrada.dias.includes(dia)) return null;
    const hora = vaga.inicio.getHours();
    if (entrada.periodo === 'manha' && hora >= 12) return null;
    if (entrada.periodo === 'tarde' && hora < 12) return null;
    if (entrada.ateDia && isoDia(vaga.inicio) > entrada.ateDia) return null;
    // Quer antecipar uma consulta: só serve horário antes dela, com o mesmo profissional e a mesma modalidade.
    let opcoes = entrada.modalidade === 'online' ? ['online'] : entrada.modalidade === 'presencial' ? ['presencial'] : ['presencial', 'online'];
    const atual = entrada.consultaId ? ctx.consultaPorId[entrada.consultaId] : null;
    if (atual && ['agendada', 'confirmada'].includes(atual.status)) {
      if (new Date(atual.inicioLocal || atual.inicio) <= vaga.inicio || atual.profissionalId !== vaga.profissionalId) return null;
      opcoes = [atual.tipo === 'online' ? 'online' : 'presencial'];
    }
    const servicoAceita = (m) => !servico.modalidade || servico.modalidade === 'ambos' || servico.modalidade === m;
    const podeDia = (m) => !ctx.diasPermitidos || ctx.diasPermitidos(m).includes(dia);
    return opcoes.find((m) => servicoAceita(m) && podeDia(m)) || null;
  }

  /** A pessoa já tem uma oferta recente sem resposta? (não manda outra em cima). */
  function temOfertaAberta(entrada, agora) {
    return (entrada.ofertas || []).some((o) => o.status === 'enviada'
      && new Date(o.inicio) > agora
      && agora - new Date(o.em) < OFERTA_ABERTA_H * 3600 * 1000);
  }

  /** Texto curto das preferências: "Seg, Qua · manhã · online · até 20/11". */
  function descreverPreferencias(entrada) {
    const partes = [];
    if ((entrada.dias || []).length && entrada.dias.length < 7) partes.push([...entrada.dias].sort((a, b) => a - b).map((d) => DIAS_CURTOS[d]).join(', '));
    else partes.push('qualquer dia');
    if (entrada.periodo && entrada.periodo !== 'qualquer') partes.push(entrada.periodo === 'manha' ? 'manhã' : 'tarde');
    if (entrada.modalidade && entrada.modalidade !== 'qualquer') partes.push(entrada.modalidade);
    if (entrada.ateDia) partes.push(`até ${NutriDudu.utils.data(entrada.ateDia).slice(0, 5)}`);
    return partes.join(' · ');
  }

  return {
    PERIODOS, MODALIDADES, STATUS, DIAS_CURTOS, OFERTAS_POR_VAGA, ANTECEDENCIA_MIN_H, ANTECEDENCIA_MAX_DIAS, OFERTA_ABERTA_H,
    ativo, combina, temOfertaAberta, descreverPreferencias,
  };
})();
