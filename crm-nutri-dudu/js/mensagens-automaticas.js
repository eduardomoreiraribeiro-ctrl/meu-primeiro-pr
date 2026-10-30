// Mensagens automáticas do WhatsApp (fase 10c): os modelos que a clínica cadastra
// na Meta e a configuração padrão. Usado pelo sistema (tela de Configurações) e
// pelo servidor (supabase/fonte/automacoes.js), para os textos nunca ficarem diferentes.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.mensagensAutomaticas = (function () {
  // ---------------------------------------------------------------------
  // Modelos de mensagem. O texto aqui é o MESMO que deve ser cadastrado na Meta
  // (o nome da clínica entra no texto; o resto são variáveis {{1}}, {{2}}…).
  // ---------------------------------------------------------------------
  const MODELOS = {
    lembrete: {
      titulo: 'Lembrete de consulta',
      quando: 'Até 40 horas antes da consulta (uma vez). Os botões confirmam a consulta ou pedem para remarcar.',
      nomePadrao: 'nutridudu_lembrete_consulta',
      categoria: 'UTILITY',
      corpo: (clinica) => `Olá, {{1}}! Lembrete da sua consulta na ${clinica}: {{2}}, às {{3}}, com {{4}}. Toque em um botão abaixo para confirmar ou remarcar.`,
      variaveis: ['primeiro nome', 'dia (ex.: quinta-feira, 29/10)', 'hora (ex.: 16:00)', 'profissional'],
      exemplo: ['Mariana', 'quinta-feira, 29/10', '16:00', 'Dra. Ana Lima'],
      botoes: ['Confirmar', 'Remarcar'],
    },
    preAnamnese: {
      titulo: 'Pré-anamnese',
      quando: 'Ao agendar a primeira consulta, e um lembrete 2 dias antes se ainda não foi preenchida.',
      nomePadrao: 'nutridudu_pre_anamnese',
      categoria: 'UTILITY',
      corpo: () => 'Olá, {{1}}! Para aproveitarmos melhor a sua consulta de {{2}}, preencha este formulário rápido (cerca de 5 minutos): {{3}} Suas respostas são vistas só pela nutricionista.',
      variaveis: ['primeiro nome', 'dia e hora da consulta', 'link do formulário'],
      exemplo: ['Mariana', 'quinta-feira, 29/10 às 16:00', 'https://exemplo.com/pre-anamnese.html#abc123'],
    },
    cobranca: {
      titulo: 'Pagamento em atraso',
      quando: 'A partir de 1 dia depois do vencimento; no máximo 1 aviso por semana para cada pagamento.',
      nomePadrao: 'nutridudu_pagamento_pendente',
      categoria: 'UTILITY',
      corpo: () => 'Olá, {{1}}! Consta em aberto o pagamento de {{2}}, no valor de {{3}}, com vencimento em {{4}}. Se preferir, pague pelo Pix: {{5}}. Se já pagou, por favor desconsidere esta mensagem.',
      variaveis: ['primeiro nome', 'descrição', 'valor', 'vencimento', 'chave Pix'],
      exemplo: ['Mariana', 'Pacote trimestral — parcela 2/3', 'R$ 300,00', '20/10/2026', 'pix@clinica.com.br'],
    },
    retorno: {
      titulo: 'Retorno pendente',
      quando: 'Cliente sem retorno marcado depois do prazo (regras de retorno); no máximo 1 a cada 30 dias.',
      nomePadrao: 'nutridudu_retorno',
      categoria: 'MARKETING',
      corpo: () => 'Olá, {{1}}! Já faz {{2}} desde a sua última consulta com {{3}}. Que tal marcar o seu retorno? Responda esta mensagem que a gente encontra um horário para você.',
      variaveis: ['primeiro nome', 'tempo (ex.: 2 meses)', 'profissional'],
      exemplo: ['Fernanda', '2 meses', 'Dra. Ana Lima'],
    },
    pacote: {
      titulo: 'Pacote acabando ou vencendo',
      quando: 'Pacote com 1 consulta restante, vencendo em até 15 dias ou atrasado no ritmo; 1 aviso para cada situação.',
      nomePadrao: 'nutridudu_pacote',
      categoria: 'UTILITY',
      corpo: () => 'Olá, {{1}}! Uma atualização sobre o seu {{2}}: {{3}}. Quer agendar a próxima consulta ou conversar sobre a renovação? É só responder esta mensagem.',
      variaveis: ['primeiro nome', 'nome do pacote', 'situação (ex.: resta 1 consulta)'],
      exemplo: ['Diego', 'Pacote trimestral', 'resta 1 consulta e ele vence em 10/11'],
    },
    reativacao: {
      titulo: 'Reativação',
      quando: 'Cliente sumido (sem consulta há mais do que o prazo de "cliente sumido"); no máximo 1 a cada 90 dias.',
      nomePadrao: 'nutridudu_reativacao',
      categoria: 'MARKETING',
      corpo: (clinica) => `Olá, {{1}}! Sentimos sua falta aqui na ${clinica}. Que tal retomar o seu acompanhamento? Responda esta mensagem e a gente encontra um horário para você.`,
      variaveis: ['primeiro nome'],
      exemplo: ['Thiago'],
    },
    indicacao: {
      titulo: 'Agradecimento de indicação',
      quando: 'Quando uma pessoa indicada vira cliente (até 30 dias depois); agradece a quem indicou, uma vez.',
      nomePadrao: 'nutridudu_agradecimento_indicacao',
      categoria: 'MARKETING',
      corpo: (clinica) => `Olá, {{1}}! Passando para agradecer por ter indicado {{2}} para a ${clinica}. Sua confiança significa muito para nós!`,
      variaveis: ['primeiro nome de quem indicou', 'primeiro nome de quem foi indicado'],
      exemplo: ['Mariana', 'Rafael'],
    },
    linkOnline: {
      titulo: 'Link da consulta online',
      quando: 'Entre 3 horas e 15 minutos antes de cada consulta online, com o link da sala de vídeo do profissional (cadastrado em Profissionais › Editar dados).',
      nomePadrao: 'nutridudu_link_online',
      categoria: 'UTILITY',
      corpo: () => 'Olá, {{1}}! Sua consulta online com {{2}} começa às {{3}}. Entre pela videochamada neste link: {{4}} Até já!',
      variaveis: ['primeiro nome', 'profissional', 'hora (ex.: 16:00)', 'link da videochamada'],
      exemplo: ['Mariana', 'Dra. Ana Lima', '16:00', 'https://meet.google.com/abc-defg-hij'],
    },
    avisoEquipe: {
      titulo: 'Aviso para a equipe',
      quando: 'Quando uma conversa passa a aguardar a equipe (o assistente chamou, está desligado ou deu erro). Vai para os celulares da equipe cadastrados aqui, não para o paciente. Fora do horário de envio, sai no começo do próximo.',
      nomePadrao: 'nutridudu_aviso_equipe',
      categoria: 'UTILITY',
      corpo: (clinica) => `Aviso do sistema ${clinica}: {{1}} está aguardando resposta da equipe no WhatsApp. Motivo: {{2}}. Abra Conversas no sistema para responder.`,
      variaveis: ['nome do paciente', 'motivo'],
      exemplo: ['Mariana Alves', 'Pergunta sobre suplemento'],
      paraEquipe: true,
    },
    vagaEspera: {
      titulo: 'Horário liberado (lista de espera)',
      quando: 'Quando um horário é cancelado ou remarcado, ele é oferecido a até 3 pessoas da lista de espera que combinam com ele (por ordem de chegada na lista). Quem tocar primeiro em "Quero este horário" fica com ele.',
      nomePadrao: 'nutridudu_vaga_disponivel',
      // A Meta classifica oferta de horário como Marketing (como Utilidade, rejeita).
      categoria: 'MARKETING',
      corpo: () => 'Olá, {{1}}! Abriu um horário na agenda de {{2}}: {{3}}. Como você está na nossa lista de espera, estamos avisando você primeiro. O horário fica com quem confirmar antes. Quer ficar com ele?',
      variaveis: ['primeiro nome', 'profissional', 'dia e hora (ex.: terça, 03/11 às 10:00)'],
      exemplo: ['Mariana', 'Dra. Ana Lima', 'terça-feira, 03/11 às 10:00'],
      botoes: ['Quero este horário', 'Não posso'],
    },
    posConsulta: {
      titulo: 'Depois da consulta',
      quando: 'No dia seguinte à consulta realizada (até 4 dias depois), no máximo 1 a cada 30 dias por pessoa. "Ótima" agradece e pede uma avaliação no Google (se o link estiver informado); "Poderia ser melhor" avisa a equipe.',
      nomePadrao: 'nutridudu_pos_consulta',
      // Pedido de opinião que leva à avaliação no Google: a Meta trata como Marketing.
      categoria: 'MARKETING',
      corpo: () => 'Olá, {{1}}! Como foi a sua consulta com {{2}}? Sua opinião ajuda a gente a cuidar cada vez melhor de você. Toque em uma opção abaixo.',
      variaveis: ['primeiro nome', 'profissional'],
      exemplo: ['Mariana', 'Dra. Ana Lima'],
      botoes: ['Ótima', 'Boa', 'Poderia ser melhor'],
    },
    resumoDia: {
      titulo: 'Resumo do dia (para a equipe)',
      quando: 'Uma vez por dia, de segunda a sábado, logo no começo do horário de envio. Vai para os celulares da equipe: consultas de hoje, quem não confirmou, pré-anamneses para revisar, conversas aguardando, pagamentos atrasados, lista de espera e aniversariantes.',
      nomePadrao: 'nutridudu_resumo_dia',
      categoria: 'UTILITY',
      corpo: () => 'Bom dia! Resumo de {{1}} no sistema: {{2}}. Abra o sistema para ver os detalhes.',
      variaveis: ['dia (ex.: sexta-feira, 30/10)', 'resumo do dia'],
      exemplo: ['sexta-feira, 30/10', '3 consultas (08:00 Mariana ✓, 10:00 Bruno (online), 16:00 Leila (sem confirmar)); 1 sem confirmar; 2 conversas aguardando a equipe'],
      paraEquipe: true,
    },
  };

  const PADRAO = {
    ativas: Object.fromEntries(Object.keys(MODELOS).map((k) => [k, false])),
    modelos: Object.fromEntries(Object.entries(MODELOS).map(([k, m]) => [k, m.nomePadrao])),
    idioma: 'pt_BR',
    horaInicio: 8,
    horaFim: 20,
    linkSistema: '',
    telefonesEquipe: '',
    linkAvaliacao: '',
  };

  /** Celulares da equipe para os avisos: "(27) 99999-0000, 27988887777" → ['5527999990000', '5527988887777']. */
  function telefonesDaEquipe(texto) {
    return [...new Set(String(texto || '').split(/[,;\n]+/)
      .map((t) => t.replace(/\D/g, ''))
      .filter((d) => d.length >= 10 && d.length <= 13)
      .map((d) => (d.length >= 12 && d.startsWith('55') ? d : `55${d}`)))];
  }

  const configuracao = (doc = {}) => ({
    ...PADRAO, ...doc,
    ativas: { ...PADRAO.ativas, ...(doc.ativas || {}) },
    modelos: { ...PADRAO.modelos, ...(doc.modelos || {}) },
  });

  const preencher = (texto, valores) => texto.replace(/\{\{(\d+)\}\}/g, (_, n) => String(valores[Number(n) - 1] ?? ''));

  /** Respostas do "Depois da consulta" (botões): rótulo para a tela. */
  const AVALIACOES = { otima: '😍 Ótima', boa: '🙂 Boa', melhorar: '😕 Poderia ser melhor' };

  const CATEGORIAS = { UTILITY: 'Utilidade', MARKETING: 'Marketing' };

  return { MODELOS, PADRAO, configuracao, preencher, CATEGORIAS, AVALIACOES, telefonesDaEquipe };
})();
