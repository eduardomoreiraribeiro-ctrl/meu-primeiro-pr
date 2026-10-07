// Listas fixas usadas em todo o sistema (etapas, origens, opções de formulário).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.config = {
  PERFIS: {
    admin: 'Administrador',
    profissional: 'Profissional',
    recepcao: 'Recepção',
  },

  FUNIS: {
    comercial: {
      nome: 'Comercial',
      etapas: [
        { id: 'novo', nome: 'Novo lead' },
        { id: 'contato', nome: 'Contato feito' },
        { id: 'agendada', nome: 'Consulta agendada' },
        { id: 'proposta', nome: 'Proposta / negociação' },
        { id: 'fechado', nome: 'Fechado' },
        { id: 'perdido', nome: 'Perdido' },
      ],
    },
    acompanhamento: {
      nome: 'Acompanhamento',
      etapas: [
        { id: 'inicio', nome: 'Início do tratamento' },
        { id: 'tratamento', nome: 'Em tratamento' },
        { id: 'retorno', nome: 'Retorno a agendar' },
        { id: 'renovacao', nome: 'Renovação' },
        { id: 'renovado', nome: 'Renovado' },
        { id: 'encerrado', nome: 'Encerrado / inativo' },
      ],
    },
  },

  STATUS_PESSOA: {
    lead: 'Lead',
    ativo: 'Cliente ativo',
    inativo: 'Cliente inativo',
  },

  ORIGENS: {
    instagram: 'Instagram',
    whatsapp: 'WhatsApp direto',
    indicacao: 'Indicação de cliente',
    presencial: 'Presencial',
    outro: 'Outro',
  },

  OBJETIVOS: {
    emagrecimento: 'Emagrecimento',
    hipertrofia: 'Hipertrofia',
    saude: 'Saúde',
    esportiva: 'Nutrição esportiva',
    gestante: 'Gestante',
    outro: 'Outro',
  },

  TIPOS_CONSULTA: {
    primeira: 'Primeira consulta',
    retorno: 'Retorno',
    avaliacao: 'Avaliação',
    online: 'Online',
  },

  STATUS_CONSULTA: {
    agendada: 'Agendada',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    faltou: 'Faltou',
    cancelada: 'Cancelada',
  },

  AGENDADA_POR: {
    recepcao: 'Recepção',
    profissional: 'Profissional',
    agente: 'Agente de IA',
  },

  MODALIDADES: {
    presencial: 'Presencial',
    online: 'Online',
    ambos: 'Presencial e online',
  },

  FORMAS_PAGAMENTO: {
    pix: 'Pix',
    credito: 'Cartão de crédito',
    debito: 'Cartão de débito',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência',
  },

  STATUS_LANCAMENTO: {
    pago: 'Pago',
    pendente: 'Pendente',
    atrasado: 'Atrasado',
    cancelado: 'Cancelado',
  },

  CATEGORIAS_SERVICO: {
    consulta: 'Consulta',
    retorno: 'Retorno',
    pacote: 'Pacote',
    avaliacao: 'Avaliação',
    outro: 'Outro',
  },

  FREQUENCIAS: {
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
    livre: 'Livre',
  },

  STATUS_PACOTE: {
    ativo: 'Ativo',
    concluido: 'Concluído',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
  },

  TIPOS_INTERACAO: {
    ligacao: 'Ligação',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    nota: 'Nota',
    etapa: 'Mudança de etapa',
    consulta: 'Consulta',
    pagamento: 'Pagamento',
    pacote: 'Pacote',
    indicacao: 'Indicação',
    agente: 'Ação do agente',
  },

  ANGULOS_FOTO: {
    frente: 'Frente',
    perfil_direito: 'Perfil direito',
    perfil_esquerdo: 'Perfil esquerdo',
    costas: 'Costas',
    outro: 'Outro',
  },

  DIAS_SEMANA: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
};
