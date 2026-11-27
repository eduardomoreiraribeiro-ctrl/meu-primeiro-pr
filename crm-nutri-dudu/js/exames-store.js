// Arquivos dos exames (PDF ou foto do laudo). Na nuvem, ficam no depósito privado "exames" do
// Supabase (só administrador e profissional acessam). No modo demonstração, ficam no IndexedDB
// deste navegador. Os dados do exame (data, laboratório, resultados) ficam na coleção "exames".
window.NutriDudu = window.NutriDudu || {};

NutriDudu.examesStore = (function () {
  const BANCO = 'nutridudu-exames';
  const TABELA = 'arquivos';
  const LADO_MAXIMO = 2200; // px: fotos de laudo são reduzidas, mas legíveis
  const TAMANHO_MAXIMO = 20 * 1024 * 1024;
  const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  let conexao = null;
  const memoria = new Map();
  const nuvem = () => NutriDudu.nuvem?.ativa();

  function abrir() {
    if (conexao) return conexao;
    conexao = new Promise((resolve) => {
      try {
        const pedido = indexedDB.open(BANCO, 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABELA);
        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => resolve(null);
      } catch (erro) {
        resolve(null);
      }
    });
    return conexao;
  }

  async function operar(modo, fn) {
    const db = await abrir();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABELA, modo);
      const pedido = fn(tx.objectStore(TABELA));
      tx.oncomplete = () => resolve(pedido?.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Foto do laudo: reduz para no máximo 2200 px (JPEG). PDF: vai como está. */
  function preparar(arquivo) {
    return new Promise((resolve, reject) => {
      const tipo = arquivo.type === 'image/heic' || arquivo.type === 'image/heif' ? '' : arquivo.type;
      if (!TIPOS.includes(tipo)) { reject(new Error('Envie o exame em PDF, JPG ou PNG.')); return; }
      if (arquivo.size > TAMANHO_MAXIMO) { reject(new Error('Arquivo grande demais (máximo 20 MB).')); return; }
      if (tipo === 'application/pdf') { resolve(arquivo); return; }
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${arquivo.name} não é uma imagem válida.`)); };
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível ler a imagem.'))), 'image/jpeg', 0.88);
      };
      img.src = url;
    });
  }

  async function salvar(chave, blob) {
    if (nuvem()) { await NutriDudu.nuvem.exameSalvar(chave, blob); return; }
    const db = await abrir();
    if (!db) { memoria.set(chave, blob); return; }
    await operar('readwrite', (t) => t.put(blob, chave));
  }

  async function ler(chave) {
    if (nuvem()) return NutriDudu.nuvem.exameLer(chave);
    const db = await abrir();
    if (!db) return memoria.get(chave) || null;
    return (await operar('readonly', (t) => t.get(chave))) || null;
  }

  async function remover(chave) {
    if (nuvem()) { await NutriDudu.nuvem.exameRemover(chave); return; }
    const db = await abrir();
    if (!db) { memoria.delete(chave); return; }
    await operar('readwrite', (t) => t.delete(chave));
  }

  return { TIPOS, TAMANHO_MAXIMO, preparar, salvar, ler, remover };
})();
