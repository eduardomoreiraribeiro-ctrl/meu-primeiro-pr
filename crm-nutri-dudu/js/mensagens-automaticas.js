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
      nomePadrao: 'nutridudu_lembrete_v2',
      categoria: 'UTILITY',
      // Textos dos pacientes no jeito do Eduardo falar: leve, próximo, com emoji (versão 2).
      corpo: () => 'Oi, {{1}}! Tudo bem? 😊 Passando pra lembrar da nossa consulta {{2}}, às {{3}}. Consegue confirmar pra mim? É só tocar num botão aqui embaixo 👇',
      variaveis: ['primeiro nome', 'dia (ex.: quinta-feira, 29/10)', 'hora (ex.: 16:00)'],
      exemplo: ['Mariana', 'quinta-feira, 29/10', '16:00'],
      botoes: ['Confirmar', 'Remarcar'],
    },
    preAnamnese: {
      titulo: 'Pré-anamnese',
      quando: 'Ao agendar a primeira consulta, e um lembrete 2 dias antes se ainda não foi preenchida.',
      nomePadrao: 'nutridudu_pre_anamnese_v2',
      categoria: 'UTILITY',
      corpo: () => 'Oi, {{1}}! Que bom que você vai começar comigo 💚 Pra nossa consulta de {{2}} render ao máximo, preenche esse formulário rapidinho (uns 5 minutos): {{3}} Só eu vejo suas respostas, tá?',
      variaveis: ['primeiro nome', 'dia e hora da consulta', 'link do formulário'],
      exemplo: ['Mariana', 'quinta-feira, 29/10 às 16:00', 'https://exemplo.com/p/abc123'],
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
      nomePadrao: 'nutridudu_retorno_v2',
      categoria: 'MARKETING',
      // Em primeira pessoa, do nutricionista (versão 2: a 1ª ficou impessoal).
      corpo: () => 'Oi, {{1}}! Tudo bem? Já faz {{2}} desde a nossa última consulta e fiquei curioso pra saber como você está 😊 Vamos marcar o retorno pra gente ajustar o plano? Me responde aqui que eu vejo um horário pra você 💚',
      variaveis: ['primeiro nome', 'tempo (ex.: 2 meses)'],
      exemplo: ['Fernanda', '2 meses'],
    },
    pacote: {
      titulo: 'Pacote acabando ou vencendo',
      quando: 'Pacote com 1 consulta restante, vencendo em até 15 dias ou atrasado no ritmo; 1 aviso para cada situação.',
      nomePadrao: 'nutridudu_pacote_v2',
      categoria: 'UTILITY',
      corpo: () => 'Oi, {{1}}! Passando pra te dar um toque sobre o seu {{2}}: {{3}} 😊 Quer que eu já veja o próximo horário pra você? É só me responder aqui.',
      variaveis: ['primeiro nome', 'nome do pacote', 'situação (ex.: resta 1 consulta)'],
      exemplo: ['Diego', 'Pacote trimestral', 'resta 1 consulta e ele vence em 10/11'],
    },
    reativacao: {
      titulo: 'Reativação',
      quando: 'Cliente sumido (sem consulta há mais do que o prazo de "cliente sumido"); no máximo 1 a cada 90 dias.',
      nomePadrao: 'nutridudu_reativacao_v2',
      categoria: 'MARKETING',
      corpo: () => 'Oi, {{1}}! Tudo bem? Faz um tempo desde o nosso último acompanhamento e quis saber como você está 😊 Se quiser retomar o acompanhamento nutricional, me responde aqui que eu vejo o melhor horário pra você 💚',
      variaveis: ['primeiro nome'],
      exemplo: ['Thiago'],
    },
    indicacao: {
      titulo: 'Agradecimento de indicação',
      quando: 'Quando uma pessoa indicada vira cliente (até 30 dias depois); agradece a quem indicou, uma vez.',
      nomePadrao: 'nutridudu_agradecimento_indicacao_v2',
      categoria: 'MARKETING',
      corpo: () => 'Oi, {{1}}! Passando pra te agradecer de coração por ter me indicado {{2}} 💚 Isso significa muito pra mim. Obrigado pela confiança!',
      variaveis: ['primeiro nome de quem indicou', '"pro" ou "pra" + primeiro nome de quem foi indicado'],
      exemplo: ['Mariana', 'pro Rafael'],
    },
    linkOnline: {
      titulo: 'Link da consulta online',
      quando: 'Entre 3 horas e 15 minutos antes de cada consulta online, com o link da sala de vídeo do profissional (cadastrado em Profissionais › Editar dados).',
      nomePadrao: 'nutridudu_link_online_v2',
      categoria: 'UTILITY',
      corpo: () => 'Oi, {{1}}! Nossa consulta online começa às {{2}} 😊 É só entrar por esse link uns minutinhos antes: {{3}} Te espero lá!',
      variaveis: ['primeiro nome', 'hora (ex.: 16:00)', 'link da videochamada'],
      exemplo: ['Mariana', '16:00', 'https://meet.google.com/abc-defg-hij'],
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
      nomePadrao: 'nutridudu_vaga_v2',
      // A Meta classifica oferta de horário como Marketing (como Utilidade, rejeita).
      categoria: 'MARKETING',
      corpo: () => 'Oi, {{1}}! Abriu um horário na minha agenda: {{2}} 🙌 Como você está na lista de espera, quis te avisar primeiro. Fica com quem confirmar antes, tá? Quer esse horário?',
      variaveis: ['primeiro nome', 'dia e hora (ex.: terça, 03/11 às 10:00)'],
      exemplo: ['Mariana', 'terça-feira, 03/11 às 10:00'],
      botoes: ['Quero este horário', 'Não posso'],
    },
    posConsulta: {
      titulo: 'Depois da consulta',
      quando: 'No dia seguinte à consulta realizada (até 4 dias depois), no máximo 1 a cada 30 dias por pessoa. "Ótima" agradece e pede uma avaliação no Google (se o link estiver informado); "Poderia ser melhor" avisa a equipe.',
      nomePadrao: 'nutridudu_pos_consulta_v2',
      // Pedido de opinião que leva à avaliação no Google: a Meta trata como Marketing.
      categoria: 'MARKETING',
      corpo: () => 'Oi, {{1}}! Foi muito bom te atender 💚 Me conta: o que você achou da nossa consulta? Toca numa opção aqui embaixo 👇',
      variaveis: ['primeiro nome'],
      exemplo: ['Mariana'],
      botoes: ['Ótima', 'Boa', 'Poderia ser melhor'],
    },
    checkinDisponivel: {
      titulo: 'Check-in disponível',
      quando: 'No dia e horário programados na ficha de cada paciente (aba Check-ins › Programar envio automático). Cria o link pessoal e manda.',
      nomePadrao: 'nutridudu_checkin',
      categoria: 'UTILITY',
      corpo: () => 'Oi, {{1}}! Seu {{2}} tá disponível 😊 Responde rapidinho, leva uns 2 minutos: {{3}} Vale até {{4}}, tá?',
      variaveis: ['primeiro nome', 'nome do questionário (ex.: check-in semanal)', 'link pessoal', 'prazo (ex.: quinta (27/11))'],
      exemplo: ['Mariana', 'check-in semanal', 'https://nutriduduribeiro.com.br/crm-nutri-dudu/c/abc123', 'quinta (27/11)'],
    },
    checkinLembrete: {
      titulo: 'Lembrete do check-in',
      quando: 'No último dia do prazo, se o paciente ainda não respondeu (1 lembrete por check-in).',
      nomePadrao: 'nutridudu_checkin_lembrete',
      categoria: 'UTILITY',
      // A Meta não aceita variável no fim do texto: o link fica antes da última frase.
      corpo: () => 'Oi, {{1}}! Passando pra lembrar do seu {{2}}: o prazo termina {{3}} ⏰ É só tocar aqui: {{4}} Leva só 2 minutinhos e me ajuda muito a acompanhar sua evolução 💚',
      variaveis: ['primeiro nome', 'nome do questionário', 'quando (ex.: hoje)', 'link pessoal'],
      exemplo: ['Mariana', 'check-in semanal', 'hoje', 'https://nutriduduribeiro.com.br/crm-nutri-dudu/c/abc123'],
    },
    aniversario: {
      titulo: 'Feliz aniversário',
      quando: 'No dia do aniversário (data de nascimento do cadastro), logo no começo do horário de envio, uma vez por ano. Vai para clientes ativos e ex-clientes; leads não recebem.',
      nomePadrao: 'nutridudu_aniversario',
      categoria: 'MARKETING',
      corpo: () => 'Oi, {{1}}! Hoje é o seu dia! 🎉 Feliz aniversário! Que esse novo ciclo venha com muita saúde, energia e conquistas. Conta sempre comigo 💚',
      variaveis: ['primeiro nome'],
      exemplo: ['Mariana'],
    },
    resumoDia: {
      titulo: 'Resumo do dia (para a equipe)',
      quando: 'Todo dia (inclusive sábado e domingo), no horário escolhido acima (padrão: 7h). Vai para os celulares da equipe: consultas de hoje, quem não confirmou, pré-anamneses para revisar, conversas aguardando, pagamentos atrasados, lista de espera e aniversariantes.',
      nomePadrao: 'nutridudu_resumo_dia',
      categoria: 'UTILITY',
      corpo: () => 'Bom dia, Nutri! Resumo de {{1}} no sistema: {{2}}. Abra o sistema para ver os detalhes.',
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
    // E-mails automáticos (Resend, domínio da clínica). Respostas vão para emailResponderPara.
    emailAtivo: false,
    emailRemetente: 'contato@nutriduduribeiro.com.br',
    emailNome: 'Eduardo Ribeiro – Nutricionista',
    emailResponderPara: '',
    emailEquipe: '',
    emailAtivas: { lembrete: true, preAnamnese: true, checkin: true, checkinLembrete: true, aniversario: true, resumoDia: true },
    whatsappOficial: true, // false: o número da clínica está fora do ar; as mensagens vão pelo WhatsApp do profissional
    horaResumo: 7, // o resumo do dia tem horário próprio, todos os dias (inclusive domingo)
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

  // Modelos substituídos por uma versão nova: quem ainda usa o nome antigo passa para o novo.
  const RENOMEADOS = {
    nutridudu_lembrete_consulta: 'nutridudu_lembrete_v2',
    nutridudu_pre_anamnese: 'nutridudu_pre_anamnese_v2',
    nutridudu_link_online: 'nutridudu_link_online_v2',
    nutridudu_vaga_disponivel: 'nutridudu_vaga_v2',
    nutridudu_pos_consulta: 'nutridudu_pos_consulta_v2',
    nutridudu_pacote: 'nutridudu_pacote_v2',
    nutridudu_retorno: 'nutridudu_retorno_v2',
    nutridudu_reativacao: 'nutridudu_reativacao_v2',
    nutridudu_agradecimento_indicacao: 'nutridudu_agradecimento_indicacao_v2',
  };

  const configuracao = (doc = {}) => ({
    ...PADRAO, ...doc,
    ativas: { ...PADRAO.ativas, ...(doc.ativas || {}) },
    modelos: Object.fromEntries(Object.entries({ ...PADRAO.modelos, ...(doc.modelos || {}) }).map(([k, v]) => [k, RENOMEADOS[v] || v])),
  });

  // Emojis no masculino: para homens, 😊 vira 💪 e 💚 vira 🚀 (pedido do Eduardo).
  // Os modelos com esses emojis ganham uma versão masculina na Meta, com o nome + "_m".
  const EMOJIS_MASCULINOS = [['😊', '💪'], ['💚', '🚀']];
  const masculinizar = (texto) => EMOJIS_MASCULINOS.reduce((t, [de, para]) => t.split(de).join(para), String(texto || ''));
  const ehHomem = (pessoa) => pessoa?.sexo === 'M';
  /** Texto no "gênero" de quem recebe (só troca os emojis). */
  const paraGenero = (texto, pessoa) => (ehHomem(pessoa) ? masculinizar(texto) : texto);
  /** O modelo tem versão masculina? (algum emoji muda) */
  const temVersaoMasculina = (id, clinica = 'clínica') => Boolean(MODELOS[id] && !MODELOS[id].paraEquipe && masculinizar(MODELOS[id].corpo(clinica)) !== MODELOS[id].corpo(clinica));
  /** "pro Rafael" / "pra Rafaela" (sem sexo informado: "pra"). */
  const proOuPra = (pessoa, nome) => `${ehHomem(pessoa) ? 'pro' : 'pra'} ${nome}`;

  const preencher = (texto, valores) => texto.replace(/\{\{(\d+)\}\}/g, (_, n) => String(valores[Number(n) - 1] ?? ''));

  /** Respostas do "Depois da consulta" (botões): rótulo para a tela. */
  const AVALIACOES = { otima: '😍 Ótima', boa: '🙂 Boa', melhorar: '😕 Poderia ser melhor' };

  const CATEGORIAS = { UTILITY: 'Utilidade', MARKETING: 'Marketing' };

  return { MODELOS, PADRAO, configuracao, preencher, CATEGORIAS, AVALIACOES, telefonesDaEquipe, masculinizar, paraGenero, temVersaoMasculina, ehHomem, proOuPra };
})();
