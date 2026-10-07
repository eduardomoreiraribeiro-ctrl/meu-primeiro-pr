// Camada de dados. Hoje salva no localStorage do navegador; na fase 9 será
// trocada pelo Supabase. As páginas só falam com este arquivo, e todas as
// funções retornam Promises — por isso a troca não exige reescrever as telas.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.store = (function () {
  const { uid } = NutriDudu.utils;

  // Versão dos dados de exemplo: ao mudar a estrutura, troque o número e o
  // navegador recomeça com os novos dados de exemplo.
  const STORAGE_KEY = 'nutridudu:v2';

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

  const ouvintes = new Set();
  let db = carregar();

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (erro) {
      console.warn('Não foi possível salvar os dados neste navegador.', erro);
    }
  }

  function salvarEAvisar(colecao) {
    gravar(db);
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

  async function create(colecao, dados) {
    validarColecao(colecao);
    const agora = new Date().toISOString();
    const item = { ...dados, id: uid(COLECOES[colecao]), criadoEm: agora, atualizadoEm: agora };
    db[colecao].push(item);
    salvarEAvisar(colecao);
    return copia(item);
  }

  async function update(colecao, id, alteracoes) {
    validarColecao(colecao);
    const indice = db[colecao].findIndex((x) => x.id === id);
    if (indice === -1) throw new Error(`Registro não encontrado: ${colecao}/${id}`);
    const { id: _id, criadoEm: _criadoEm, ...resto } = alteracoes;
    db[colecao][indice] = { ...db[colecao][indice], ...resto, atualizadoEm: new Date().toISOString() };
    salvarEAvisar(colecao);
    return copia(db[colecao][indice]);
  }

  async function remove(colecao, id) {
    validarColecao(colecao);
    const antes = db[colecao].length;
    db[colecao] = db[colecao].filter((x) => x.id !== id);
    if (db[colecao].length !== antes) salvarEAvisar(colecao);
  }

  async function resetarParaExemplo() {
    db = { ...bancoVazio(), ...NutriDudu.seed.criar() };
    salvarEAvisar('*');
  }

  // Avisa quando algum dado muda. Retorna uma função para cancelar o aviso.
  function subscribe(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  return { list, get, create, update, remove, resetarParaExemplo, subscribe };
})();
