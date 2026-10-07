// Armazenamento das imagens das fotos de evolução. O localStorage é pequeno
// demais para imagens, então ficam no IndexedDB do navegador (na fase 9: num
// armazenamento privado do Supabase). Os dados da foto (ângulo, data, consulta)
// ficam na coleção "fotos" do store; aqui só a imagem, pela mesma chave.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.fotosStore = (function () {
  const BANCO = 'nutridudu-fotos';
  const TABELA = 'imagens';
  const LADO_MAXIMO = 1200; // px: fotos são reduzidas antes de guardar
  let conexao = null;
  const memoria = new Map(); // reserva, se o navegador não oferecer IndexedDB

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

  async function salvar(chave, dataUrl) {
    const db = await abrir();
    if (!db) { memoria.set(chave, dataUrl); return; }
    await operar('readwrite', (t) => t.put(dataUrl, chave));
  }

  async function ler(chave) {
    const db = await abrir();
    if (!db) return memoria.get(chave) || null;
    return (await operar('readonly', (t) => t.get(chave))) || null;
  }

  async function remover(chave) {
    const db = await abrir();
    if (!db) { memoria.delete(chave); return; }
    await operar('readwrite', (t) => t.delete(chave));
  }

  /** Lê um arquivo de imagem e devolve um JPEG reduzido (data URL). */
  function reduzir(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo.type.startsWith('image/')) {
        reject(new Error(`${arquivo.name} não é uma imagem.`));
        return;
      }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error(`Não foi possível ler ${arquivo.name}.`));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error(`${arquivo.name} não é uma imagem válida.`));
        img.onload = () => {
          const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Apaga todas as imagens (usado ao restaurar os dados de exemplo). */
  async function limpar() {
    memoria.clear();
    const db = await abrir();
    if (db) await operar('readwrite', (t) => t.clear());
  }

  return { salvar, ler, remover, reduzir, limpar };
})();
