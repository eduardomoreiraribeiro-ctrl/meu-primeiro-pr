// Área do paciente: monta SÓ o que o paciente pode ver dele mesmo (sem anotações da consulta,
// anamnese ou financeiro). Usado pelo servidor (link pessoal) e pela prévia dentro do sistema.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.areaPaciente = (function () {
  const STATUS_FUTURO = ['agendada', 'confirmada'];
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

  function idade(dataNascimento, agora) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataNascimento || ''));
    if (!m) return null;
    let anos = agora.getFullYear() - Number(m[1]);
    if (agora.getMonth() + 1 < Number(m[2]) || (agora.getMonth() + 1 === Number(m[2]) && agora.getDate() < Number(m[3]))) anos -= 1;
    return anos;
  }

  /**
   * d: { pessoa, profissional, consultas, pacotes, servicos, avaliacoes, checkins, whatsappClinica, agora }
   * (listas já filtradas para a pessoa). Devolve um objeto pronto para a tela.
   */
  function montar(d) {
    const agora = d.agora || new Date();
    const pessoa = d.pessoa || {};
    const servicoPorId = Object.fromEntries((d.servicos || []).map((s) => [s.id, s]));
    const consultas = (d.consultas || []).filter((c) => c.status !== 'cancelada').sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    const nomeServico = (id) => servicoPorId[id]?.nome || '';
    // "Retorno" / "Primeira consulta" diz mais do que o nome do pacote.
    const TIPOS = { primeira: 'Primeira consulta', retorno: 'Retorno' };
    const rotuloConsulta = (c) => TIPOS[c.tipo] || nomeServico(c.servicoId) || 'Consulta';

    const proxima = consultas.find((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio) >= new Date(agora.getTime() - 3600000));
    const realizadas = consultas.filter((c) => c.status === 'realizada');

    // Plano: o ativo mais recente (ou o último, se nenhum estiver ativo).
    let plano = null;
    const pacotes = (d.pacotes || []).filter((p) => p.status !== 'cancelado').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    const pac = pacotes.find((p) => p.status === 'ativo') || pacotes[0];
    if (pac) {
      const doPacote = consultas.filter((c) => c.pacoteId === pac.id);
      const uso = NutriDudu.calculos?.usoDoPacote ? NutriDudu.calculos.usoDoPacote(pac, doPacote)
        : { usadas: doPacote.filter((c) => c.status === 'realizada').length, total: pac.qtdConsultas };
      const total = Number(pac.qtdConsultas) || 0;
      const vencido = pac.validade && String(pac.validade).slice(0, 10) < agora.toISOString().slice(0, 10);
      plano = {
        nome: nomeServico(pac.servicoId) || 'Seu plano', total, usadas: Math.min(total, uso.usadas || 0),
        restantes: Math.max(0, total - (uso.usadas || 0)), inicio: pac.inicio || null, validade: pac.validade || null,
        ativo: pac.status === 'ativo' && !vencido && (total === 0 || (uso.usadas || 0) < total),
      };
    }

    // Evolução das avaliações físicas (data da consulta da avaliação).
    const A = NutriDudu.avaliacao;
    const dadosFormula = { sexo: pessoa.sexo, idade: idade(pessoa.dataNascimento, agora) };
    const evolucao = (d.avaliacoes || []).map((av) => {
      const data = consultas.find((c) => c.id === av.consultaId)?.inicio || av.data || av.criadoEm;
      const r = A ? A.calcular(av, dadosFormula) : {};
      const circ = av.circunferencias || {};
      return {
        data, peso: num(av.pesoKg), gordura: num(r.percentualGordura), massaMagra: num(r.massaMagra),
        cintura: num(circ.cintura), abdome: num(circ.abdome), quadril: num(circ.quadril),
      };
    }).filter((x) => x.data && (x.peso !== null || x.gordura !== null || x.cintura !== null))
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));

    // Check-ins respondidos, do mais antigo pro mais novo.
    const C = NutriDudu.checkin;
    const todos = d.checkins || [];
    const respondidos = todos.filter((c) => c.respondidoEm).sort((a, b) => String(a.respondidoEm).localeCompare(String(b.respondidoEm)));
    const checkins = respondidos.map((c) => ({ data: c.respondidoEm, titulo: c.titulo || 'Check-in', score: num(c.score) }));
    let ultimoCheckin = null;
    const ult = respondidos[respondidos.length - 1];
    if (ult && C) {
      const perguntas = ult.perguntas || [];
      const respostas = ult.respostas || {};
      const ctx = { pesoKg: C.pesoDe(perguntas, respostas) };
      const itens = perguntas.map((p) => {
        const r = respostas[p.id];
        if (!r || r.pulou || p.tipo === 'texto') return null;
        const n = C.nota(p, r.valor, ctx);
        const f = n === null ? null : C.faixa(n);
        return { icone: p.icone || '', titulo: p.titulo, resposta: p.tipo === 'numero' ? C.textoResposta(p, r) : '', faixa: f };
      }).filter(Boolean);
      ultimoCheckin = { data: ult.respondidoEm, titulo: ult.titulo || 'Check-in', score: num(ult.score), itens };
    }
    const aberto = todos.filter((c) => !c.respondidoEm && !c.cancelado && c.codigo && (!c.prazo || new Date(c.prazo) >= agora))
      .sort((a, b) => String(b.enviadoEm).localeCompare(String(a.enviadoEm)))[0];

    return {
      nome: primeiroNome(pessoa.nome),
      sexo: pessoa.sexo || '',
      profissional: d.profissional?.nome || '',
      whatsapp: String(d.whatsappClinica || '').replace(/\D/g, ''),
      proxima: proxima ? { inicio: proxima.inicio, servico: rotuloConsulta(proxima), confirmada: proxima.status === 'confirmada', online: proxima.tipo === 'online' || proxima.modalidade === 'online' } : null,
      consultas: realizadas.map((c) => ({ data: c.inicio, servico: rotuloConsulta(c) })),
      plano,
      evolucao,
      checkins,
      ultimoCheckin,
      checkinAberto: aberto ? { titulo: aberto.titulo || 'Check-in', prazo: aberto.prazo || null, codigo: aberto.codigo } : null,
      geradoEm: agora.toISOString(),
    };
  }

  return { montar };
})();
