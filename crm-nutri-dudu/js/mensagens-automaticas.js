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
  };

  const PADRAO = {
    ativas: Object.fromEntries(Object.keys(MODELOS).map((k) => [k, false])),
    modelos: Object.fromEntries(Object.entries(MODELOS).map(([k, m]) => [k, m.nomePadrao])),
    idioma: 'pt_BR',
    horaInicio: 8,
    horaFim: 20,
    linkSistema: '',
  };

  const configuracao = (doc = {}) => ({
    ...PADRAO, ...doc,
    ativas: { ...PADRAO.ativas, ...(doc.ativas || {}) },
    modelos: { ...PADRAO.modelos, ...(doc.modelos || {}) },
  });

  const preencher = (texto, valores) => texto.replace(/\{\{(\d+)\}\}/g, (_, n) => String(valores[Number(n) - 1] ?? ''));

  const CATEGORIAS = { UTILITY: 'Utilidade', MARKETING: 'Marketing' };

  return { MODELOS, PADRAO, configuracao, preencher, CATEGORIAS };
})();
