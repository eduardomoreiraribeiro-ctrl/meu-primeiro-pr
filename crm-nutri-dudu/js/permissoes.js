// O que cada perfil pode ver e fazer (seção 2 do PLANEJAMENTO.md).
// No protótipo o perfil é só simulado por um seletor; na fase 9 vem do login
// e as mesmas regras passam a valer também no banco de dados.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.permissoes = (function () {
  const STORAGE_KEY = 'nutridudu:perfil';
  const PERFIL_PADRAO = 'admin';

  // No protótipo, o perfil "Profissional" simula a Dra. Ana Lima (prof_1).
  // Na fase 9 isso vem do login.
  const PROFISSIONAL_SIMULADO = 'prof_1';

  const REGRAS = {
    verClinico: ['admin', 'profissional'],
    registrarAtendimento: ['admin', 'profissional'],
    darBaixaPagamento: ['admin', 'recepcao'],
    lancarCobranca: ['admin', 'recepcao'],
    editarServicos: ['admin'],
    editarProfissionais: ['admin'],
    editarRegras: ['admin'],
    configurarAgente: ['admin'],
    gerenciarDados: ['admin'],
  };

  const ouvintes = new Set();
  let perfil = ler();

  function ler() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo && NutriDudu.config.PERFIS[salvo]) return salvo;
    } catch (erro) {
      // Sem acesso ao armazenamento (ex.: navegação privada): usa o padrão.
    }
    return PERFIL_PADRAO;
  }

  function atual() {
    return perfil;
  }

  function definir(novo) {
    if (!NutriDudu.config.PERFIS[novo] || novo === perfil) return;
    perfil = novo;
    try {
      localStorage.setItem(STORAGE_KEY, novo);
    } catch (erro) {
      // Só não lembra a escolha na próxima visita.
    }
    ouvintes.forEach((fn) => fn(novo));
  }

  function pode(acao) {
    const permitidos = REGRAS[acao];
    if (!permitidos) throw new Error(`Permissão desconhecida: ${acao}`);
    return permitidos.includes(perfil);
  }

  const MENSAGENS = {
    verClinico: 'Seu perfil não tem acesso aos dados clínicos.',
    registrarAtendimento: 'Só nutricionistas registram atendimentos.',
    darBaixaPagamento: 'Seu perfil só visualiza o financeiro.',
    lancarCobranca: 'Seu perfil só visualiza o financeiro.',
    gerenciarDados: 'Só o administrador gerencia os dados.',
  };

  /** Confere a permissão dentro da própria ação (defesa extra além de esconder o botão). */
  function exigir(acao) {
    if (pode(acao)) return true;
    NutriDudu.ui?.toast(MENSAGENS[acao] || 'Seu perfil não pode fazer isso.', 'info');
    return false;
  }

  // Horários de atendimento: admin edita todos; profissional, só os seus.
  function podeEditarHorarios(profissionalId) {
    return perfil === 'admin' || (perfil === 'profissional' && profissionalId === PROFISSIONAL_SIMULADO);
  }

  // Bloqueios: admin e recepção em qualquer agenda; profissional, só na sua.
  // profissionalId null = bloqueio da clínica toda (só admin e recepção).
  function podeEditarBloqueios(profissionalId) {
    if (perfil === 'admin' || perfil === 'recepcao') return true;
    return perfil === 'profissional' && profissionalId === PROFISSIONAL_SIMULADO;
  }

  /** Id do profissional "logado" (no protótipo, simulado); null para admin e recepção. */
  function idProfissionalAtual() {
    return perfil === 'profissional' ? PROFISSIONAL_SIMULADO : null;
  }

  // Agendar, remarcar, confirmar, cancelar: admin e recepção em qualquer agenda;
  // profissional, só na sua.
  function podeAgendarPara(profissionalId) {
    if (perfil === 'admin' || perfil === 'recepcao') return true;
    return perfil === 'profissional' && profissionalId === PROFISSIONAL_SIMULADO;
  }

  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  return {
    atual, definir, pode, exigir, podeEditarHorarios, podeEditarBloqueios, idProfissionalAtual, podeAgendarPara, aoMudar,
  };
})();
