// Camada de dados. As páginas só falam com este arquivo, e todas as funções
// retornam Promises. Dois modos, com a mesma interface:
//  • nuvem (fase 9): os dados ficam no Supabase; aqui fica uma cópia em
//    memória para as telas lerem rápido, atualizada em tempo real;
//  • demonstração/protótipo: os dados ficam só no localStorage deste navegador.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.store = (function () {
  const { uid } = NutriDudu.utils;

  // Versão dos dados de exemplo: ao mudar a estrutura, troque o número e o
  // navegador recomeça com os novos dados de exemplo.
  const STORAGE_KEY = 'nutridudu:v3';

  // Coleção → prefixo dos ids gerados.
  const COLECOES = {
    configuracoes: 'cfg',
    profissionais: 'prof',
    horarios: 'hor',
    bloqueios: 'blq',
    servicos: 'srv',
    pessoas: 'pes',
    consultas: 'con',
    anamneses: 'ana',
    avaliacoes: 'ava',
    fotos: 'fot',
    pacotes: 'pac',
    lancamentos: 'lan',
    interacoes: 'int',
    conversas: 'cvs',
    mensagens: 'msg',
  };

  const nuvem = () => NutriDudu.nuvem?.ativa();
  const ouvintes = new Set();
  // Na nuvem, começa vazio e é preenchido depois do login (conectarNuvem).
  let db = nuvem() ? bancoVazio() : carregar();

  function bancoVazio() {
    const vazio = {};
    Object.keys(COLECOES).forEach((c) => { vazio[c] = []; });
    return vazio;
  }

  function carregar() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      // Coleções novas (de fases futuras) entram vazias em dados já salvos.
      if (salvo) return { ...bancoVazio(), ...JSON.parse(salvo) };
    } catch (erro) {
      console.warn('Não foi possível ler os dados salvos; usando dados de exemplo.', erro);
    }
    const inicial = { ...bancoVazio(), ...NutriDudu.seed.criar() };
    gravar(inicial);
    return inicial;
  }

  function gravar(dados) {
    if (nuvem()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (erro) {
      console.warn('Não foi possível salvar os dados neste navegador.', erro);
    }
  }

  // opcoes.silencioso: grava sem avisar as telas (para ajustes feitos
  // logo antes de desenhar a página, como os movimentos automáticos do Kanban).
  function salvarEAvisar(colecao, opcoes = {}) {
    gravar(db);
    if (!opcoes.silencioso) avisar(colecao);
  }

  function avisar(colecao) {
    ouvintes.forEach((fn) => fn(colecao));
  }

  function validarColecao(colecao) {
    if (!COLECOES[colecao]) throw new Error(`Coleção desconhecida: ${colecao}`);
  }

  // Cópia para que quem chama não altere o banco sem passar por update().
  const copia = (obj) => JSON.parse(JSON.stringify(obj));

  async function list(colecao, filtro) {
    validarColecao(colecao);
    const itens = filtro ? db[colecao].filter(filtro) : db[colecao];
    return copia(itens);
  }

  async function get(colecao, id) {
    validarColecao(colecao);
    const item = db[colecao].find((x) => x.id === id);
    return item ? copia(item) : null;
  }

  // Na nuvem, grava primeiro no servidor: se falhar (sem internet, sem
  // permissão), nada muda na tela e o erro sobe para o formulário mostrar.
  async function create(colecao, dados, opcoes) {
    validarColecao(colecao);
    const agora = new Date().toISOString();
    const item = { ...dados, id: uid(COLECOES[colecao]), criadoEm: agora, atualizadoEm: agora };
    if (nuvem()) await NutriDudu.nuvem.criar(colecao, item);
    db[colecao].push(item);
    salvarEAvisar(colecao, opcoes);
    return copia(item);
  }

  async function update(colecao, id, alteracoes, opcoes) {
    validarColecao(colecao);
    const indice = db[colecao].findIndex((x) => x.id === id);
    if (indice === -1) throw new Error(`Registro não encontrado: ${colecao}/${id}`);
    const { id: _id, criadoEm: _criadoEm, ...resto } = alteracoes;
    const novo = { ...db[colecao][indice], ...resto, atualizadoEm: new Date().toISOString() };
    if (nuvem()) await NutriDudu.nuvem.alterar(colecao, novo);
    const atual = db[colecao].findIndex((x) => x.id === id);
    if (atual !== -1) db[colecao][atual] = novo;
    salvarEAvisar(colecao, opcoes);
    return copia(novo);
  }

  async function remove(colecao, id) {
    validarColecao(colecao);
    if (!db[colecao].some((x) => x.id === id)) return;
    if (nuvem()) await NutriDudu.nuvem.apagar(colecao, [id]);
    db[colecao] = db[colecao].filter((x) => x.id !== id);
    salvarEAvisar(colecao);
  }

  // Troca de uma vez todos os itens que passam no filtro pelos `novos`
  // (ex.: os horários de um profissional). Avisa a tela uma vez só.
  async function substituir(colecao, filtro, novos) {
    validarColecao(colecao);
    const agora = new Date().toISOString();
    const criados = novos.map((dados) => ({
      ...dados, id: uid(COLECOES[colecao]), criadoEm: agora, atualizadoEm: agora,
    }));
    if (nuvem()) {
      await NutriDudu.nuvem.apagar(colecao, db[colecao].filter(filtro).map((x) => x.id));
      if (criados.length) await NutriDudu.nuvem.gravarLote(colecao, criados);
    }
    db[colecao] = [...db[colecao].filter((x) => !filtro(x)), ...criados];
    salvarEAvisar(colecao);
    return copia(criados);
  }

  async function resetarParaExemplo() {
    await importarTudo(NutriDudu.seed.criar(), { limparFotos: true });
  }

  /** Cópia de todas as coleções (para o backup). */
  async function exportarTudo() {
    return copia(db);
  }

  /** Troca todos os dados pelos de um backup (já validado). Coleções ausentes ficam vazias. */
  async function importarTudo(colecoes, { limparFotos = false } = {}) {
    const novo = bancoVazio();
    Object.keys(COLECOES).forEach((c) => { if (Array.isArray(colecoes[c])) novo[c] = copia(colecoes[c]); });
    if (limparFotos) await NutriDudu.fotosStore?.limpar();
    if (nuvem()) {
      await NutriDudu.nuvem.substituirTudo(novo);
      // Recarrega do servidor: cada perfil só fica com o que pode ver.
      db = { ...bancoVazio(), ...(await NutriDudu.nuvem.carregarTudo()) };
    } else {
      db = novo;
    }
    salvarEAvisar('*');
  }

  // ---------------- Nuvem ----------------

  /** Depois do login: carrega tudo do Supabase e passa a ouvir as mudanças. */
  async function conectarNuvem() {
    db = { ...bancoVazio(), ...(await NutriDudu.nuvem.carregarTudo()) };
    NutriDudu.nuvem.ouvir(aplicarMudancaRemota);
    avisar('*');
  }

  /** Ao sair: limpa a cópia em memória (nada fica no navegador). */
  function desconectarNuvem() {
    NutriDudu.nuvem?.parar();
    db = bancoVazio();
  }

  // Mudanças feitas em outros computadores chegam aqui (tempo real).
  let avisoPendente = null;
  function aplicarMudancaRemota({ colecao, tipo, item, id, clinico, campos }) {
    if (!COLECOES[colecao]) return;
    const lista = db[colecao];
    const alvoId = item?.id || id;
    const i = lista.findIndex((x) => x.id === alvoId);
    if (clinico) {
      // Só os campos clínicos (anotações, conduta) de uma consulta.
      if (i === -1) return;
      const atualizado = { ...lista[i] };
      campos.forEach((c) => { if (tipo === 'apagar') delete atualizado[c]; else if (item[c] !== undefined) atualizado[c] = item[c]; });
      lista[i] = atualizado;
    } else if (tipo === 'apagar') {
      if (i === -1) return;
      lista.splice(i, 1);
    } else if (i === -1) {
      lista.push(item);
    } else {
      // Mantém os campos clínicos que já estavam na cópia local.
      lista[i] = { ...pick(lista[i], ['anotacoes', 'conduta']), ...item };
    }
    // Junta várias mudanças seguidas num único redesenho.
    clearTimeout(avisoPendente);
    avisoPendente = setTimeout(() => avisar(colecao), 150);
  }

  const pick = (obj, campos) => Object.fromEntries(campos.filter((c) => c in obj).map((c) => [c, obj[c]]));

  // Avisa quando algum dado muda. Retorna uma função para cancelar o aviso.
  function subscribe(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  return {
    list, get, create, update, remove, substituir, resetarParaExemplo, subscribe, exportarTudo, importarTudo,
    conectarNuvem, desconectarNuvem, COLECOES: Object.keys(COLECOES),
  };
})();
