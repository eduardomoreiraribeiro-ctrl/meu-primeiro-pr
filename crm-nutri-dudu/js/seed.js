// Dados de exemplo FICTÍCIOS para testar o protótipo.
// As datas são calculadas a partir de hoje, então o exemplo nunca fica "velho".
window.NutriDudu = window.NutriDudu || {};

NutriDudu.seed = (function () {
  const { isoDia } = NutriDudu.utils;

  // Data local deslocada em dias. Domingo (clínica fechada) vira segunda — ou sábado,
  // se a data é do passado, para uma consulta já realizada não cair no futuro.
  function diaUtil(deslocamento) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + deslocamento);
    if (d.getDay() === 0) d.setDate(d.getDate() + (deslocamento < 0 ? -1 : 1));
    return d;
  }

  function dia(deslocamento) {
    return isoDia(diaUtil(deslocamento));
  }

  function diaHora(deslocamento, hora) {
    const d = diaUtil(deslocamento);
    const [h, m] = hora.split(':').map(Number);
    // Sábado só tem expediente de manhã: compromissos da tarde vão para segunda
    // (ou para sexta, se a data é do passado).
    if (d.getDay() === 6 && h >= 12) d.setDate(d.getDate() + (deslocamento < 0 ? -1 : 2));
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  function acomodar(consultas, horarios, bloqueios, geral) {
    const { agenda } = NutriDudu;
    const colocadas = [];
    // agora = 1970: aqui não importa se o horário já passou.
    const ctx = { horarios, bloqueios, consultas: colocadas, geral, agora: new Date(0) };
    consultas.forEach((c) => {
      const inicio = new Date(c.inicio);
      const duracao = (new Date(c.fim) - inicio) / 60000;
      const pedido = { profissionalId: c.profissionalId, inicio, fim: new Date(c.fim), modalidade: c.tipo === 'online' ? 'online' : 'presencial' };
      if (agenda.verificar(pedido, ctx).length) {
        for (let n = 0; n < 14; n++) {
          const dia = new Date(inicio);
          dia.setDate(dia.getDate() + n);
          const livre = agenda.horariosLivres({ profissionalId: c.profissionalId, dia, duracaoMin: duracao, modalidade: pedido.modalidade, passoMin: 10 }, ctx)
            .find((h) => n > 0 || h >= inicio);
          if (livre) {
            c.inicio = livre.toISOString();
            c.fim = agenda.somarMin(livre, duracao).toISOString();
            break;
          }
        }
      }
      colocadas.push(c);
    });
  }

  function criar() {
    const configuracoes = [{
      id: 'geral',
      nomeClinica: 'Nutri Dudu',
      diasRetornoPadrao: 60,
      diasClienteSumido: 120,
      intervaloEntreConsultasMin: 10,
      chavePix: 'pix@nutridudu.exemplo',
    }];

    const profissionais = [{
      id: 'prof_1',
      nome: 'Dra. Ana Lima',
      registro: 'Nutricionista — CRN-3 00000 (fictício)',
      cor: '#16a34a',
      perfil: 'admin',
      ativo: true,
    }];

    const h = (id, diaSemana, inicio, fim) => ({ id, profissionalId: 'prof_1', diaSemana, inicio, fim, modalidade: 'ambos' });
    const horarios = [
      h('hor_1', 1, '08:00', '12:00'), h('hor_2', 1, '14:00', '18:00'),
      h('hor_3', 2, '08:00', '12:00'), h('hor_4', 2, '14:00', '18:00'),
      h('hor_5', 3, '08:00', '12:00'), h('hor_6', 3, '14:00', '18:00'),
      h('hor_7', 4, '08:00', '12:00'), h('hor_8', 4, '14:00', '18:00'),
      h('hor_9', 5, '08:00', '12:00'), h('hor_10', 5, '14:00', '17:00'),
      h('hor_11', 6, '08:00', '12:00'),
    ];

    const bloqueios = [
      { id: 'blq_1', profissionalId: 'prof_1', inicio: diaHora(9, '08:00'), fim: diaHora(9, '18:00'), motivo: 'Curso de atualização' },
    ];

    const s = (id, dados) => ({
      id, categoria: 'consulta', modalidade: 'ambos', profissionalIds: ['prof_1'],
      qtdConsultas: null, validadeDias: null, frequencia: null, ativo: true, ...dados,
    });
    const servicos = [
      s('srv_1', { nome: 'Consulta inicial', descricao: 'Anamnese completa, avaliação física e plano alimentar personalizado.', valor: 250, duracaoMin: 60 }),
      s('srv_2', { nome: 'Retorno', descricao: 'Acompanhamento da evolução e ajustes no plano alimentar.', valor: 150, duracaoMin: 40, categoria: 'retorno' }),
      s('srv_3', { nome: 'Pacote trimestral', descricao: 'Consulta inicial + 2 retornos mensais e suporte por WhatsApp.', valor: 600, duracaoMin: 60, categoria: 'pacote', qtdConsultas: 3, validadeDias: 90, frequencia: 'mensal' }),
      s('srv_4', { nome: 'Pacote semestral', descricao: 'Consulta inicial + 5 retornos mensais e suporte por WhatsApp.', valor: 1100, duracaoMin: 60, categoria: 'pacote', qtdConsultas: 6, validadeDias: 180, frequencia: 'mensal' }),
      s('srv_5', { nome: 'Plano anual', descricao: '12 consultas ao longo de 12 meses (1 por mês) e suporte por WhatsApp.', valor: 1800, duracaoMin: 60, categoria: 'pacote', qtdConsultas: 12, validadeDias: 365, frequencia: 'mensal' }),
      s('srv_6', { nome: 'Bioimpedância', descricao: 'Avaliação de composição corporal por bioimpedância.', valor: 90, duracaoMin: 20, categoria: 'avaliacao', modalidade: 'presencial' }),
      s('srv_7', { nome: 'Consulta online', descricao: 'Atendimento por videochamada com envio do plano por e-mail.', valor: 200, duracaoMin: 50, modalidade: 'online', ativo: false }),
    ];
    const duracao = Object.fromEntries(servicos.map((x) => [x.id, x.duracaoMin]));

    const p = (id, dados) => ({
      id,
      email: '',
      cpf: '',
      endereco: '',
      cidade: 'São Paulo',
      indicadoPorId: null,
      profissionalId: 'prof_1',
      motivoPerda: null,
      servicoInteresseId: null,
      retornoDias: null,
      observacoes: '',
      tags: [],
      consentimentos: { saude: false, whatsapp: false, fotos: false, divulgacao: false },
      agentePausado: false,
      clienteDesde: null, // data em que fechou (virou cliente); null = ainda é lead
      ...dados,
    });
    const todosConsentimentos = { saude: true, whatsapp: true, fotos: true, divulgacao: false };

    const pessoas = [
      p('pes_1', { clienteDesde: dia(-70), nome: 'Mariana Alves', telefone: '(11) 98123-4501', email: 'mariana.alves@exemplo.com', dataNascimento: '1991-03-14', sexo: 'F', origem: 'instagram', objetivo: 'emagrecimento', funil: 'acompanhamento', etapa: 'renovacao', status: 'ativo', servicoInteresseId: 'srv_3', tags: ['pacote trimestral'], consentimentos: todosConsentimentos, criadoEm: diaHora(-80, '10:00'), etapaDesde: diaHora(-40, '10:00') }),
      p('pes_2', { clienteDesde: dia(-150), nome: 'Rafael Costa', telefone: '(11) 97234-5602', email: 'rafael.costa@exemplo.com', dataNascimento: '1987-07-22', sexo: 'M', origem: 'indicacao', indicadoPorId: 'pes_1', objetivo: 'hipertrofia', funil: 'acompanhamento', etapa: 'tratamento', status: 'ativo', servicoInteresseId: 'srv_5', retornoDias: 30, tags: ['VIP'], consentimentos: todosConsentimentos, criadoEm: diaHora(-155, '09:00'), etapaDesde: diaHora(-150, '09:00') }),
      p('pes_3', { clienteDesde: dia(-3), nome: 'Juliana Ferreira', telefone: '(11) 96345-6703', email: 'ju.ferreira@exemplo.com', dataNascimento: '1995-11-02', sexo: 'F', origem: 'whatsapp', objetivo: 'gestante', funil: 'acompanhamento', etapa: 'inicio', status: 'ativo', servicoInteresseId: 'srv_3', tags: ['gestante'], consentimentos: todosConsentimentos, criadoEm: diaHora(-12, '14:00'), etapaDesde: diaHora(-3, '16:00') }),
      p('pes_4', { nome: 'Bruno Martins', telefone: '(11) 95456-7804', dataNascimento: '1999-01-30', sexo: 'M', origem: 'instagram', objetivo: 'esportiva', funil: 'comercial', etapa: 'proposta', status: 'lead', servicoInteresseId: 'srv_5', criadoEm: diaHora(-9, '11:30'), etapaDesde: diaHora(-2, '11:30') }),
      p('pes_5', { nome: 'Camila Rocha', telefone: '(11) 94567-8905', email: 'camila.rocha@exemplo.com', dataNascimento: '1983-05-18', sexo: 'F', origem: 'presencial', objetivo: 'saude', funil: 'comercial', etapa: 'agendada', status: 'lead', servicoInteresseId: 'srv_1', consentimentos: { saude: false, whatsapp: true, fotos: false, divulgacao: false }, criadoEm: diaHora(-6, '08:45'), etapaDesde: diaHora(-4, '08:45') }),
      p('pes_6', { nome: 'Lucas Pereira', telefone: '(11) 93678-9006', dataNascimento: '2001-09-09', sexo: 'M', origem: 'instagram', objetivo: 'hipertrofia', funil: 'comercial', etapa: 'contato', status: 'lead', servicoInteresseId: 'srv_1', criadoEm: diaHora(-5, '19:10'), etapaDesde: diaHora(-5, '19:10') }),
      p('pes_7', { clienteDesde: dia(-95), nome: 'Fernanda Lima', telefone: '(11) 92789-0107', email: 'fernanda.lima@exemplo.com', dataNascimento: '1993-12-25', sexo: 'F', origem: 'indicacao', indicadoPorId: 'pes_2', objetivo: 'emagrecimento', funil: 'acompanhamento', etapa: 'retorno', status: 'ativo', consentimentos: todosConsentimentos, criadoEm: diaHora(-100, '15:20'), etapaDesde: diaHora(-2, '08:00') }),
      p('pes_8', { nome: 'Gustavo Ribeiro', telefone: '(11) 91890-1208', dataNascimento: '1979-04-07', sexo: 'M', origem: 'whatsapp', objetivo: 'saude', funil: 'comercial', etapa: 'novo', status: 'lead', consentimentos: { saude: false, whatsapp: true, fotos: false, divulgacao: false }, criadoEm: diaHora(0, '09:05'), etapaDesde: diaHora(0, '09:05') }),
      p('pes_9', { nome: 'Patrícia Gomes', telefone: '(11) 90901-2309', dataNascimento: '1988-08-16', sexo: 'F', origem: 'instagram', objetivo: 'emagrecimento', funil: 'comercial', etapa: 'perdido', status: 'lead', motivoPerda: 'Preço', criadoEm: diaHora(-30, '10:00'), etapaDesde: diaHora(-20, '10:00') }),
      p('pes_10', { clienteDesde: dia(-190), nome: 'Thiago Souza', telefone: '(11) 98012-3410', email: 'thiago.souza@exemplo.com', dataNascimento: '1990-02-11', sexo: 'M', origem: 'indicacao', indicadoPorId: 'pes_1', objetivo: 'esportiva', funil: 'acompanhamento', etapa: 'encerrado', status: 'inativo', observacoes: 'Concluiu o pacote; oferecer renovação.', consentimentos: todosConsentimentos, criadoEm: diaHora(-200, '10:00'), etapaDesde: diaHora(-100, '10:00') }),
      p('pes_11', { nome: 'Aline Barbosa', telefone: '(11) 97123-4511', dataNascimento: '1997-06-03', sexo: 'F', origem: 'presencial', objetivo: 'hipertrofia', funil: 'comercial', etapa: 'novo', status: 'lead', servicoInteresseId: 'srv_3', criadoEm: diaHora(-1, '17:40'), etapaDesde: diaHora(-1, '17:40') }),
      p('pes_12', { clienteDesde: dia(-60), nome: 'Diego Carvalho', telefone: '(11) 96234-5612', email: 'diego.c@exemplo.com', dataNascimento: '1985-10-28', sexo: 'M', origem: 'whatsapp', objetivo: 'emagrecimento', funil: 'acompanhamento', etapa: 'renovacao', status: 'ativo', servicoInteresseId: 'srv_3', consentimentos: todosConsentimentos, criadoEm: diaHora(-65, '10:00'), etapaDesde: diaHora(-1, '10:00') }),
    ];

    // Mais clientes e leads recentes, para o Dashboard ter movimento.
    // [id, nome, sexo, origem, indicadoPor, criado há N dias, cliente há N dias (null = lead), etapa]
    const extras = [
      ['pes_13', 'Larissa Mendes', 'F', 'instagram', null, -25, -20, 'tratamento'],
      ['pes_14', 'Pedro Henrique Dias', 'M', 'indicacao', 'pes_7', -40, -35, 'tratamento'],
      ['pes_15', 'Beatriz Nogueira', 'F', 'whatsapp', null, -18, -15, 'tratamento'],
      ['pes_16', 'Marcos Vinícius Teles', 'M', 'presencial', null, -50, -48, 'tratamento'],
      ['pes_17', 'Renata Cardoso', 'F', 'instagram', null, -10, -8, 'tratamento'],
      ['pes_18', 'Felipe Andrade', 'M', 'whatsapp', null, -33, -28, 'tratamento'],
      ['pes_19', 'Sofia Martins', 'F', 'indicacao', 'pes_13', -4, null, 'contato'],
      ['pes_20', 'André Lopes', 'M', 'whatsapp', null, -14, null, 'perdido'],
    ];
    extras.forEach(([id, nome, sexo, origem, indicadoPorId, criado, cliente, etapa], n) => {
      const ehCliente = cliente !== null;
      pessoas.push(p(id, {
        nome, sexo, origem, indicadoPorId,
        telefone: `(11) 9${8100 + n * 37}-${String(4100 + n * 113).padStart(4, '0')}`,
        dataNascimento: `${1980 + n * 2}-0${(n % 9) + 1}-1${n % 9}`,
        objetivo: ['emagrecimento', 'hipertrofia', 'saude', 'esportiva'][n % 4],
        funil: ehCliente ? 'acompanhamento' : 'comercial',
        etapa, status: ehCliente ? 'ativo' : 'lead',
        motivoPerda: etapa === 'perdido' ? 'Sem resposta' : null,
        clienteDesde: ehCliente ? dia(cliente) : null,
        consentimentos: ehCliente ? todosConsentimentos : { saude: false, whatsapp: true, fotos: false, divulgacao: false },
        criadoEm: diaHora(criado, '10:00'),
        etapaDesde: diaHora(ehCliente ? cliente : criado, '10:00'),
      }));
    });

    const pacotes = [
      { id: 'pac_1', pessoaId: 'pes_1', servicoId: 'srv_3', inicio: dia(-70), validade: dia(20), qtdConsultas: 3, frequencia: 'mensal', valorNegociado: 600, parcelas: 1, status: 'ativo' },
      { id: 'pac_2', pessoaId: 'pes_2', servicoId: 'srv_5', inicio: dia(-150), validade: dia(215), qtdConsultas: 12, frequencia: 'mensal', valorNegociado: 1800, parcelas: 12, status: 'ativo' },
      { id: 'pac_3', pessoaId: 'pes_3', servicoId: 'srv_3', inicio: dia(-3), validade: dia(87), qtdConsultas: 3, frequencia: 'mensal', valorNegociado: 550, parcelas: 1, status: 'ativo' },
      { id: 'pac_4', pessoaId: 'pes_12', servicoId: 'srv_3', inicio: dia(-60), validade: dia(30), qtdConsultas: 3, frequencia: 'mensal', valorNegociado: 600, parcelas: 2, status: 'ativo' },
      { id: 'pac_5', pessoaId: 'pes_10', servicoId: 'srv_3', inicio: dia(-190), validade: dia(-100), qtdConsultas: 3, frequencia: 'mensal', valorNegociado: 600, parcelas: 1, status: 'concluido' },
    ];

    const c = (id, dados) => {
      const inicio = diaHora(dados.dia, dados.hora);
      const fim = new Date(new Date(inicio).getTime() + duracao[dados.servicoId] * 60000).toISOString();
      const { dia: _d, hora: _h, ...resto } = dados;
      return {
        id, profissionalId: 'prof_1', inicio, fim, pacoteId: null, agendadaPor: 'recepcao',
        descontarFalta: true, avaliacaoId: null, anamneseId: null, fotoIds: [],
        anotacoes: '', conduta: '', proximoRetorno: null, ...resto,
      };
    };

    const consultas = [
      // Mariana — pacote trimestral (2 de 3 usadas + 1 agendada)
      c('con_1', { pessoaId: 'pes_1', dia: -70, hora: '10:00', tipo: 'primeira', servicoId: 'srv_3', pacoteId: 'pac_1', status: 'realizada', avaliacaoId: 'ava_1', anamneseId: 'ana_1', anotacoes: 'Primeira consulta. Rotina com muitos lanches fora de casa.', proximoRetorno: dia(-40) }),
      c('con_2', { pessoaId: 'pes_1', dia: -40, hora: '10:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_1', status: 'realizada', avaliacaoId: 'ava_2', anotacoes: 'Boa adesão ao plano.', proximoRetorno: dia(5) }),
      c('con_3', { pessoaId: 'pes_1', dia: 5, hora: '10:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_1', status: 'confirmada' }),
      // Rafael — plano anual (4 realizadas em ~5 meses: 1 consulta atrasada no ritmo mensal)
      c('con_4', { pessoaId: 'pes_2', dia: -150, hora: '09:00', tipo: 'primeira', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'realizada', avaliacaoId: 'ava_3', anamneseId: 'ana_2', proximoRetorno: dia(-120) }),
      c('con_5', { pessoaId: 'pes_2', dia: -120, hora: '09:00', tipo: 'retorno', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'realizada', avaliacaoId: 'ava_4', proximoRetorno: dia(-90) }),
      c('con_6', { pessoaId: 'pes_2', dia: -90, hora: '09:00', tipo: 'retorno', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'faltou', proximoRetorno: dia(-85) }),
      c('con_7', { pessoaId: 'pes_2', dia: -85, hora: '09:00', tipo: 'retorno', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'realizada', avaliacaoId: 'ava_5', proximoRetorno: dia(-55) }),
      c('con_8', { pessoaId: 'pes_2', dia: -28, hora: '09:00', tipo: 'retorno', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'realizada', avaliacaoId: 'ava_6', proximoRetorno: dia(3) }),
      c('con_9', { pessoaId: 'pes_2', dia: 3, hora: '15:00', tipo: 'retorno', servicoId: 'srv_5', pacoteId: 'pac_2', status: 'agendada', agendadaPor: 'agente' }),
      // Juliana — primeira consulta hoje
      c('con_10', { pessoaId: 'pes_3', dia: 0, hora: '14:00', tipo: 'primeira', servicoId: 'srv_3', pacoteId: 'pac_3', status: 'confirmada', agendadaPor: 'agente' }),
      // Camila — lead com primeira consulta agendada pelo agente
      c('con_11', { pessoaId: 'pes_5', dia: 2, hora: '08:30', tipo: 'primeira', servicoId: 'srv_1', status: 'agendada', agendadaPor: 'agente' }),
      // Fernanda — última consulta há ~2 meses e nenhum retorno marcado
      c('con_12', { pessoaId: 'pes_7', dia: -95, hora: '16:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada', avaliacaoId: 'ava_7', anamneseId: 'ana_3', proximoRetorno: dia(-65) }),
      c('con_13', { pessoaId: 'pes_7', dia: -62, hora: '16:00', tipo: 'retorno', servicoId: 'srv_2', status: 'realizada', avaliacaoId: 'ava_8', proximoRetorno: dia(-32) }),
      // Thiago — pacote concluído há tempo
      c('con_14', { pessoaId: 'pes_10', dia: -190, hora: '10:00', tipo: 'primeira', servicoId: 'srv_3', pacoteId: 'pac_5', status: 'realizada' }),
      c('con_15', { pessoaId: 'pes_10', dia: -160, hora: '10:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_5', status: 'realizada' }),
      c('con_16', { pessoaId: 'pes_10', dia: -130, hora: '10:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_5', status: 'realizada' }),
      // Diego — 2 de 3 usadas, último retorno amanhã (por isso está em "Renovação")
      c('con_17', { pessoaId: 'pes_12', dia: -60, hora: '16:00', tipo: 'primeira', servicoId: 'srv_3', pacoteId: 'pac_4', status: 'realizada', avaliacaoId: 'ava_9', anamneseId: 'ana_4', proximoRetorno: dia(-30) }),
      c('con_18', { pessoaId: 'pes_12', dia: -30, hora: '16:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_4', status: 'realizada', avaliacaoId: 'ava_10', proximoRetorno: dia(1) }),
      c('con_19', { pessoaId: 'pes_12', dia: 1, hora: '16:00', tipo: 'retorno', servicoId: 'srv_3', pacoteId: 'pac_4', status: 'confirmada' }),
      // Mariana — bioimpedância avulsa
      c('con_20', { pessoaId: 'pes_1', dia: -40, hora: '11:10', tipo: 'avaliacao', servicoId: 'srv_6', status: 'realizada' }),
      // Clientes extras: consulta inicial + retornos avulsos
      c('con_21', { pessoaId: 'pes_13', dia: -20, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_22', { pessoaId: 'pes_13', dia: -9, hora: '11:00', tipo: 'retorno', servicoId: 'srv_2', status: 'realizada' }),
      c('con_23', { pessoaId: 'pes_14', dia: -35, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_24', { pessoaId: 'pes_14', dia: -16, hora: '11:00', tipo: 'retorno', servicoId: 'srv_2', status: 'realizada' }),
      c('con_25', { pessoaId: 'pes_15', dia: -15, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_26', { pessoaId: 'pes_15', dia: -1, hora: '11:00', tipo: 'avaliacao', servicoId: 'srv_6', status: 'realizada' }),
      c('con_27', { pessoaId: 'pes_16', dia: -48, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_28', { pessoaId: 'pes_16', dia: -19, hora: '11:00', tipo: 'retorno', servicoId: 'srv_2', status: 'faltou' }),
      c('con_29', { pessoaId: 'pes_17', dia: -8, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_30', { pessoaId: 'pes_18', dia: -28, hora: '08:00', tipo: 'primeira', servicoId: 'srv_1', status: 'realizada' }),
      c('con_31', { pessoaId: 'pes_18', dia: -11, hora: '11:00', tipo: 'retorno', servicoId: 'srv_2', status: 'realizada' }),
      c('con_32', { pessoaId: 'pes_18', dia: 4, hora: '11:00', tipo: 'retorno', servicoId: 'srv_2', status: 'agendada', agendadaPor: 'agente' }),
      c('con_33', { pessoaId: 'pes_17', dia: 0, hora: '09:00', tipo: 'avaliacao', servicoId: 'srv_6', status: 'agendada' }),
      c('con_34', { pessoaId: 'pes_13', dia: 0, hora: '15:30', tipo: 'retorno', servicoId: 'srv_2', status: 'confirmada', agendadaPor: 'agente' }),
    ];

    // As datas são relativas a hoje (e domingos/sábados à tarde mudam de dia), então
    // duas consultas podem cair no mesmo horário. Usa as próprias regras da agenda
    // para acomodar cada uma no primeiro horário válido do mesmo dia (ou dos seguintes).
    acomodar(consultas, horarios, bloqueios, configuracoes[0]);

    // A anamnese "nasce" no dia da consulta em que foi feita (a pré-anamnese, 2 dias atrás).
    const an = (id, pessoaId, consultaId, dados) => ({
      id, pessoaId, consultaId, versao: 1, origem: 'consulta', status: 'confirmada', autor: 'profissional',
      criadoEm: consultaId ? consultas.find((c) => c.id === consultaId).inicio : diaHora(-2, '19:40'),
      queixa: '', historicoSaude: '', alergias: [], contraindicacoes: [], medicamentos: [],
      habitosVida: '', habitosAlimentares: '', exames: [], ...dados,
    });
    const anamneses = [
      an('ana_1', 'pes_1', 'con_1', { queixa: 'Quer perder 8 kg até o fim do ano.', historicoSaude: 'Sem doenças diagnosticadas. Mãe com diabetes tipo 2.', alergias: [{ substancia: 'Lactose', tipo: 'intolerancia', gravidade: 'leve' }], habitosVida: 'Treina 3x por semana; dorme 6 h; bebe 1,5 L de água.', habitosAlimentares: 'Pula o café da manhã; almoça fora; belisca à tarde.', exames: [{ nome: 'Glicemia de jejum', data: dia(-75), resultado: '92 mg/dL' }] }),
      // Pré-anamnese preenchida pela paciente, aguardando revisão da nutricionista.
      an('ana_5', 'pes_5', null, { origem: 'pre', status: 'a_revisar', autor: 'paciente', queixa: 'Quero melhorar a disposição e controlar o colesterol.', historicoSaude: 'Colesterol alto (exame de agosto).', medicamentos: [{ nome: 'Sinvastatina', dose: '20 mg', frequencia: 'à noite', desde: '2026' }], habitosAlimentares: 'Come muito pão e doce à noite.' }),
      an('ana_2', 'pes_2', 'con_4', { queixa: 'Ganho de massa muscular.', historicoSaude: 'Sem doenças diagnosticadas.', medicamentos: [{ nome: 'Creatina', dose: '5 g', frequencia: 'diária', desde: '2025' }], habitosVida: 'Musculação 5x por semana.' }),
      an('ana_3', 'pes_7', 'con_12', { queixa: 'Compulsão por doces à noite.', historicoSaude: 'Hipotireoidismo.', medicamentos: [{ nome: 'Levotiroxina', dose: '50 mcg', frequencia: 'em jejum', desde: '2022' }] }),
      an('ana_4', 'pes_12', 'con_17', { queixa: 'Perder peso por recomendação médica.', historicoSaude: 'Pré-diabetes.', alergias: [{ substancia: 'Amendoim', tipo: 'alergia', gravidade: 'grave' }], contraindicacoes: [{ descricao: 'Evitar suplemento termogênico', observacao: 'Hipertensão leve' }], medicamentos: [{ nome: 'Metformina', dose: '500 mg', frequencia: '2x ao dia', desde: '2026' }] }),
    ];

    const av = (id, pessoaId, consultaId, pesoKg, alturaCm, percentualGordura, extra = {}) => ({
      id, pessoaId, consultaId, pesoKg, alturaCm, percentualGordura,
      metodo: 'bioimpedancia', formula: null, circunferencias: {}, dobras: {}, ...extra,
    });
    // Diego: dobras cutâneas (Jackson & Pollock 7) — o % de gordura é calculado.
    const dobrasDiego = (k) => ({ peitoral: 22 - k, axilarMedia: 26 - k, tricipital: 18 - k, subescapular: 30 - k, abdominal: 38 - k, suprailiaca: 32 - k, coxa: 24 - k });
    const avaliacoes = [
      av('ava_1', 'pes_1', 'con_1', 82.4, 165, 34, { circunferencias: { cintura: 92, quadril: 112, abdome: 98 } }),
      av('ava_2', 'pes_1', 'con_2', 79.8, 165, 32.5, { circunferencias: { cintura: 88, quadril: 110, abdome: 94 } }),
      av('ava_3', 'pes_2', 'con_4', 74.0, 180, 16),
      av('ava_4', 'pes_2', 'con_5', 75.1, 180, 15.6),
      av('ava_5', 'pes_2', 'con_7', 76.2, 180, 15.3),
      av('ava_6', 'pes_2', 'con_8', 77.5, 180, 15.1),
      av('ava_7', 'pes_7', 'con_12', 71.3, 162, 33),
      av('ava_8', 'pes_7', 'con_13', 69.9, 162, 31.8),
      av('ava_9', 'pes_12', 'con_17', 98.3, 178, null, { metodo: 'dobras', formula: 'jp7', dobras: dobrasDiego(0), circunferencias: { cintura: 104, quadril: 108 } }),
      av('ava_10', 'pes_12', 'con_18', 95.0, 178, null, { metodo: 'dobras', formula: 'jp7', dobras: dobrasDiego(3), circunferencias: { cintura: 100, quadril: 106 } }),
    ];

    // status "atrasado" não é salvo: é calculado (pendente com vencimento já passado).
    const l = (id, dados) => ({
      id, profissionalId: 'prof_1', desconto: 0, consultaId: null, pacoteId: null,
      dataPagamento: null, formaPagamento: null, ...dados,
    });
    const lancamentos = [
      l('lan_1', { pessoaId: 'pes_1', servicoId: 'srv_3', pacoteId: 'pac_1', descricao: 'Pacote trimestral', valor: 600, vencimento: dia(-70), dataPagamento: dia(-70), formaPagamento: 'pix', status: 'pago' }),
      l('lan_2', { pessoaId: 'pes_1', servicoId: 'srv_6', consultaId: 'con_20', descricao: 'Bioimpedância', valor: 90, vencimento: dia(-40), dataPagamento: dia(-40), formaPagamento: 'debito', status: 'pago' }),
      l('lan_3', { pessoaId: 'pes_3', servicoId: 'srv_3', pacoteId: 'pac_3', descricao: 'Pacote trimestral', valor: 600, desconto: 50, vencimento: dia(5), status: 'pendente' }),
      l('lan_4', { pessoaId: 'pes_7', servicoId: 'srv_1', consultaId: 'con_12', descricao: 'Consulta inicial', valor: 250, vencimento: dia(-95), dataPagamento: dia(-95), formaPagamento: 'pix', status: 'pago' }),
      l('lan_5', { pessoaId: 'pes_7', servicoId: 'srv_2', consultaId: 'con_13', descricao: 'Retorno', valor: 150, vencimento: dia(-62), dataPagamento: dia(-62), formaPagamento: 'credito', status: 'pago' }),
      l('lan_6', { pessoaId: 'pes_10', servicoId: 'srv_3', pacoteId: 'pac_5', descricao: 'Pacote trimestral', valor: 600, vencimento: dia(-190), dataPagamento: dia(-190), formaPagamento: 'transferencia', status: 'pago' }),
      l('lan_7', { pessoaId: 'pes_12', servicoId: 'srv_3', pacoteId: 'pac_4', descricao: 'Pacote trimestral — parcela 1/2', valor: 300, vencimento: dia(-60), dataPagamento: dia(-60), formaPagamento: 'pix', status: 'pago' }),
      l('lan_8', { pessoaId: 'pes_12', servicoId: 'srv_3', pacoteId: 'pac_4', descricao: 'Pacote trimestral — parcela 2/2', valor: 300, vencimento: dia(-30), status: 'pendente' }),
    ];
    // Consultas avulsas dos clientes extras: pagas no dia; futuras ficam pendentes.
    const valorServico = Object.fromEntries(servicos.map((x) => [x.id, [x.nome, x.valor]]));
    consultas.filter((x) => Number(x.id.split('_')[1]) >= 21 && x.status !== 'faltou').forEach((x) => {
      const [nomeServico, valor] = valorServico[x.servicoId];
      const venc = isoDia(new Date(x.inicio));
      const paga = x.status === 'realizada';
      lancamentos.push(l(`lan_${x.id}`, {
        pessoaId: x.pessoaId, servicoId: x.servicoId, consultaId: x.id, descricao: nomeServico, valor, vencimento: venc,
        ...(paga ? { dataPagamento: venc, formaPagamento: 'pix', status: 'pago' } : { status: 'pendente' }),
      }));
    });

    // Plano anual do Rafael: 12 parcelas mensais, as já vencidas estão pagas.
    for (let n = 0; n < 12; n++) {
      const venc = -150 + n * 30;
      lancamentos.push(l(`lan_r${n + 1}`, {
        pessoaId: 'pes_2', servicoId: 'srv_5', pacoteId: 'pac_2',
        descricao: `Plano anual — parcela ${n + 1}/12`, valor: 150, vencimento: dia(venc),
        ...(venc <= 0 ? { dataPagamento: dia(venc), formaPagamento: 'credito', status: 'pago' } : { status: 'pendente' }),
      }));
    }

    const i = (id, pessoaId, dataHora, tipo, descricao, autor, automatico) => ({ id, pessoaId, dataHora, tipo, descricao, autor, automatico });
    const interacoes = [
      i('int_1', 'pes_1', diaHora(-80, '10:00'), 'whatsapp', 'Pediu informações sobre o pacote trimestral.', 'recepcao', false),
      i('int_2', 'pes_2', diaHora(-155, '09:00'), 'indicacao', 'Indicado por Mariana Alves.', 'recepcao', true),
      i('int_3', 'pes_3', diaHora(-3, '16:00'), 'etapa', 'Fechou o pacote trimestral e passou para o funil de acompanhamento.', 'recepcao', true),
      i('int_4', 'pes_4', diaHora(-2, '11:30'), 'ligacao', 'Enviada proposta do plano anual; vai pensar até sexta.', 'recepcao', false),
      i('int_5', 'pes_5', diaHora(-4, '08:45'), 'agente', 'Assistente Nutri Dudu agendou a primeira consulta.', 'agente', true),
      i('int_6', 'pes_7', diaHora(-2, '08:00'), 'etapa', 'Movida para "Retorno a agendar": última consulta há 60 dias, sem retorno marcado.', 'sistema', true),
      i('int_7', 'pes_9', diaHora(-20, '10:00'), 'etapa', 'Movida para "Perdido" — motivo: Preço.', 'recepcao', true),
      i('int_8', 'pes_10', diaHora(-100, '11:00'), 'nota', 'Concluiu o pacote. Oferecer renovação com desconto.', 'admin', false),
      i('int_9', 'pes_12', diaHora(-1, '10:00'), 'etapa', 'Movido para "Renovação": resta 1 consulta no pacote.', 'sistema', true),
    ];

    const conversas = [
      { id: 'cvs_1', pessoaId: 'pes_8', telefone: '(11) 91890-1208', status: 'agente', ultimaMensagemEm: diaHora(0, '09:07') },
      { id: 'cvs_2', pessoaId: 'pes_4', telefone: '(11) 95456-7804', status: 'aguardando_equipe', ultimaMensagemEm: diaHora(-1, '20:15') },
    ];
    const m = (id, conversaId, dataHora, autor, texto) => ({ id, conversaId, dataHora, autor, texto, direcao: autor === 'contato' ? 'recebida' : 'enviada' });
    const mensagens = [
      m('msg_1', 'cvs_1', diaHora(0, '09:05'), 'contato', 'Bom dia! Quanto custa a consulta?'),
      m('msg_2', 'cvs_1', diaHora(0, '09:06'), 'agente', 'Olá! Eu sou o Assistente Nutri Dudu, o assistente virtual da clínica 😊 A consulta inicial custa R$ 250,00 e dura 1 hora. Quer que eu veja os horários livres?'),
      m('msg_3', 'cvs_1', diaHora(0, '09:07'), 'contato', 'Quero sim, de preferência de manhã.'),
      m('msg_4', 'cvs_2', diaHora(-1, '20:10'), 'contato', 'Vocês fazem desconto no plano anual se eu pagar à vista?'),
      m('msg_5', 'cvs_2', diaHora(-1, '20:15'), 'agente', 'Ótima pergunta! Condições especiais de pagamento são definidas pela nossa equipe. Já chamei alguém, e eles respondem a partir das 8h do próximo dia útil. Obrigado!'),
    ];

    const agora = new Date().toISOString();
    const comDatas = (lista) => lista.map((x) => ({ criadoEm: agora, atualizadoEm: agora, ...x }));

    return {
      configuracoes: comDatas(configuracoes),
      profissionais: comDatas(profissionais),
      horarios: comDatas(horarios),
      bloqueios: comDatas(bloqueios),
      servicos: comDatas(servicos),
      pessoas: comDatas(pessoas),
      consultas: comDatas(consultas),
      anamneses: comDatas(anamneses),
      avaliacoes: comDatas(avaliacoes),
      fotos: [],
      pacotes: comDatas(pacotes),
      lancamentos: comDatas(lancamentos),
      interacoes: comDatas(interacoes),
      conversas: comDatas(conversas),
      mensagens: comDatas(mensagens),
    };
  }

  return { criar };
})();
