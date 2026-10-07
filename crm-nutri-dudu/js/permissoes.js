// O que cada perfil pode ver e fazer (seção 2 do PLANEJAMENTO.md).
// No protótipo o perfil é só simulado por um seletor; na fase 9 vem do login
// e as mesmas regras passam a valer também no banco de dados.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.permissoes = (function () {
  const STORAGE_KEY = 'nutridudu:perfil';
  const PERFIL_PADRAO = 'admin';

  const REGRAS = {
    verClinico: ['admin', 'profissional'],
    registrarAtendimento: ['admin', 'profissional'],
    darBaixaPagamento: ['admin', 'recepcao'],
    editarServicos: ['admin'],
    editarProfissionais: ['admin'],
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

  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  return { atual, definir, pode, aoMudar };
})();
