// Aparência: automático (segue o sistema), claro ou escuro. A escolha fica
// neste navegador; o <head> do index.html já aplica antes de desenhar a página.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.tema = (function () {
  const STORAGE_KEY = 'nutridudu:tema';
  const OPCOES = { auto: 'Automático (igual ao sistema)', claro: 'Claro', escuro: 'Escuro' };
  const ouvintes = new Set();
  const sistemaEscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function atual() {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      if (t === 'claro' || t === 'escuro') return t;
    } catch (erro) {
      // Sem armazenamento: automático.
    }
    return 'auto';
  }

  /** O tema que está valendo agora: 'claro' ou 'escuro'. */
  function efetivo() {
    const t = atual();
    if (t !== 'auto') return t;
    return sistemaEscuro?.matches ? 'escuro' : 'claro';
  }

  function aplicar() {
    const t = atual();
    if (t === 'auto') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = t;
    ouvintes.forEach((fn) => fn(efetivo()));
  }

  function definir(t) {
    if (!OPCOES[t]) return;
    try {
      if (t === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, t);
    } catch (erro) {
      // Só não lembra na próxima visita.
    }
    aplicar();
  }

  /** Botão rápido da barra superior: troca entre claro e escuro. */
  function alternar() {
    definir(efetivo() === 'escuro' ? 'claro' : 'escuro');
  }

  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  sistemaEscuro?.addEventListener?.('change', () => { if (atual() === 'auto') aplicar(); });

  return { OPCOES, atual, efetivo, definir, alternar, aoMudar, aplicar };
})();
