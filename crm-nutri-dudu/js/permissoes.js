// O que cada perfil pode ver e fazer (seção 2 do PLANEJAMENTO.md).
// Na nuvem, o perfil vem do login (fixar) e as mesmas regras também valem no
// banco de dados (supabase/schema.sql). No modo demonstração, o perfil é só
// simulado pelo seletor "Ver como".
window.NutriDudu = window.NutriDudu || {};

NutriDudu.permissoes = (function () {
  const STORAGE_KEY = 'nutridudu:perfil';
  const PERFIL_PADRAO = 'admin';

  // No modo demonstração, o perfil "Profissional" simula a Dra. Ana Lima (prof_1).
  // Na nuvem, vem do perfil de quem entrou.
  let profissionalAtual = 'prof_1';
  let fixo = false;

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
    if (fixo || !NutriDudu.config.PERFIS[novo] || novo === perfil) return;
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
    return perfil === 'admin' || (perfil === 'profissional' && profissionalId === profissionalAtual);
  }

  // Bloqueios: admin e recepção em qualquer agenda; profissional, só na sua.
  // profissionalId null = bloqueio da clínica toda (só admin e recepção).
  function podeEditarBloqueios(profissionalId) {
    if (perfil === 'admin' || perfil === 'recepcao') return true;
    return perfil === 'profissional' && profissionalId === profissionalAtual;
  }

  /** Id do profissional "logado" (no protótipo, simulado); null para admin e recepção. */
  function idProfissionalAtual() {
    return perfil === 'profissional' ? profissionalAtual : null;
  }

  // Agendar, remarcar, confirmar, cancelar: admin e recepção em qualquer agenda;
  // profissional, só na sua.
  function podeAgendarPara(profissionalId) {
    if (perfil === 'admin' || perfil === 'recepcao') return true;
    return perfil === 'profissional' && profissionalId === profissionalAtual;
  }

  /** Na nuvem: o perfil vem do login e não pode ser trocado na tela. */
  function fixar({ papel, profissionalId }) {
    perfil = papel;
    profissionalAtual = profissionalId || null;
    fixo = true;
  }

  const estaFixo = () => fixo;

  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  return {
    atual, definir, fixar, estaFixo, pode, exigir, podeEditarHorarios, podeEditarBloqueios, idProfissionalAtual, podeAgendarPara, aoMudar,
  };
})();
