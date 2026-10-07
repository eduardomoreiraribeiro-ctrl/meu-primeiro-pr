// Backup dos dados do protótipo: exportar tudo (inclusive as fotos) num
// arquivo .json e importar de volta, com validação antes de trocar os dados.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.backup = (function () {
  const APP = 'nutri-dudu-crm';
  const FORMATO = 1;
  const TAMANHO_MAXIMO = 50 * 1024 * 1024; // 50 MB

  async function montar() {
    const { store, fotosStore } = NutriDudu;
    const colecoes = await store.exportarTudo();
    const fotos = {};
    for (const f of colecoes.fotos || []) {
      if (!f.chave) continue;
      const dados = await fotosStore.ler(f.chave);
      if (dados) fotos[f.chave] = dados;
    }
    return { app: APP, formato: FORMATO, exportadoEm: new Date().toISOString(), colecoes, fotos };
  }

  function nomeArquivo(data = new Date()) {
    return `nutri-dudu-backup-${NutriDudu.utils.isoDia(data)}.json`;
  }

  function baixar(conteudo, nome) {
    const blob = new Blob([JSON.stringify(conteudo)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Baixa o arquivo de backup. Devolve o resumo do que foi exportado. */
  async function exportar() {
    const conteudo = await montar();
    baixar(conteudo, nomeArquivo());
    return resumo(conteudo);
  }

  function resumo(conteudo) {
    const c = conteudo.colecoes || {};
    const n = (k) => (Array.isArray(c[k]) ? c[k].length : 0);
    return {
      exportadoEm: conteudo.exportadoEm,
      pessoas: n('pessoas'),
      clientes: (c.pessoas || []).filter((p) => p.status !== 'lead').length,
      leads: (c.pessoas || []).filter((p) => p.status === 'lead').length,
      consultas: n('consultas'),
      lancamentos: n('lancamentos'),
      pacotes: n('pacotes'),
      fotos: Object.keys(conteudo.fotos || {}).length,
    };
  }

  /** Confere se o conteúdo é um backup deste sistema. Devolve a lista de problemas (vazia = ok). */
  function validar(conteudo) {
    const problemas = [];
    if (!conteudo || typeof conteudo !== 'object' || Array.isArray(conteudo)) return ['O arquivo não é um backup do Nutri Dudu.'];
    if (conteudo.app !== APP) return ['O arquivo não é um backup do Nutri Dudu.'];
    if (typeof conteudo.formato !== 'number' || conteudo.formato > FORMATO) {
      problemas.push('O backup foi feito por uma versão mais nova do sistema.');
    }
    const c = conteudo.colecoes;
    if (!c || typeof c !== 'object') return [...problemas, 'O backup não tem os dados.'];
    NutriDudu.store.COLECOES.forEach((nome) => {
      if (c[nome] === undefined) return;
      if (!Array.isArray(c[nome])) { problemas.push(`"${nome}" está num formato inválido.`); return; }
      const semId = c[nome].filter((x) => !x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id).length;
      if (semId) problemas.push(`"${nome}" tem ${semId} registro(s) sem identificação.`);
      const ids = c[nome].map((x) => x?.id);
      if (new Set(ids).size !== ids.length) problemas.push(`"${nome}" tem registros repetidos.`);
    });
    if (!Array.isArray(c.pessoas)) problemas.push('O backup não tem o cadastro de pessoas.');
    else if (c.pessoas.some((p) => !p?.nome)) problemas.push('Há pessoas sem nome no backup.');
    if (!Array.isArray(c.configuracoes) || !c.configuracoes.some((x) => x?.id === 'geral')) problemas.push('Faltam as configurações gerais da clínica.');
    if (conteudo.fotos && (typeof conteudo.fotos !== 'object' || Object.values(conteudo.fotos).some((v) => typeof v !== 'string' || !v.startsWith('data:image/')))) {
      problemas.push('As fotos do backup estão num formato inválido.');
    }
    return problemas;
  }

  /** Lê o arquivo escolhido. Devolve { conteudo } ou { erro }. */
  async function ler(arquivo) {
    if (!arquivo) return { erro: 'Escolha um arquivo.' };
    if (arquivo.size > TAMANHO_MAXIMO) return { erro: 'O arquivo é grande demais para um backup do protótipo (máximo 50 MB).' };
    let conteudo;
    try {
      conteudo = JSON.parse(await arquivo.text());
    } catch (erro) {
      return { erro: 'Não foi possível ler o arquivo: ele não é um backup válido (.json).' };
    }
    const problemas = validar(conteudo);
    return problemas.length ? { erro: problemas.join(' ') } : { conteudo };
  }

  /** Troca todos os dados (e fotos) pelos do backup. */
  async function restaurar(conteudo) {
    const { store, fotosStore } = NutriDudu;
    await fotosStore.limpar();
    for (const [chave, dados] of Object.entries(conteudo.fotos || {})) await fotosStore.salvar(chave, dados);
    await store.importarTudo(conteudo.colecoes);
  }

  /** Janela de importação: escolher arquivo → conferir resumo → confirmar. */
  function abrirImportacao() {
    const { modal, form: f, ui, utils } = NutriDudu;
    let lido = null;
    modal.formulario({
      titulo: 'Importar backup',
      corpo: `
        <p class="alerta alerta-aviso">Importar <strong>substitui todos os dados</strong> deste navegador (clientes, agenda, prontuários, financeiro e fotos) pelos do arquivo.</p>
        <div class="campo">
          <label for="arquivo-backup">Arquivo de backup (.json)</label>
          <input type="file" id="arquivo-backup" name="arquivo" accept="application/json,.json">
          <p class="campo-erro" data-erro-para="arquivo" role="alert"></p>
        </div>
        <div data-resumo-backup class="resumo-backup" hidden></div>
        ${f.chave('copiaAntes', 'Baixar uma cópia dos dados atuais antes de importar', true, { ajuda: 'Recomendado: se algo der errado, dá para voltar.' })}`,
      textoSalvar: 'Importar e substituir',
      ler: (form) => ({ copiaAntes: f.marcado(form, 'copiaAntes') }),
      validar: () => (lido ? {} : { arquivo: 'Escolha um arquivo de backup válido.' }),
      salvar: async (d) => {
        if (d.copiaAntes) await exportar();
        await restaurar(lido);
        ui.toast('Backup importado.');
      },
      aoAbrir: (form) => {
        const campo = form.querySelector('[name="arquivo"]');
        const caixa = form.querySelector('[data-resumo-backup]');
        const erro = form.querySelector('[data-erro-para="arquivo"]');
        campo.addEventListener('change', async () => {
          lido = null;
          caixa.hidden = true;
          erro.textContent = '';
          campo.removeAttribute('aria-invalid');
          const r = await ler(campo.files[0]);
          if (r.erro) {
            erro.textContent = r.erro;
            campo.setAttribute('aria-invalid', 'true');
            return;
          }
          lido = r.conteudo;
          const s = resumo(lido);
          caixa.innerHTML = `
            <p><strong>Backup de ${utils.data(s.exportadoEm)} às ${utils.hora(s.exportadoEm)}</strong></p>
            <p class="small">${s.clientes} cliente(s) e ${s.leads} lead(s) · ${s.consultas} consulta(s) · ${s.pacotes} pacote(s) · ${s.lancamentos} lançamento(s) · ${s.fotos} foto(s)</p>`;
          caixa.hidden = false;
        });
      },
    });
  }

  return { APP, FORMATO, exportar, validar, ler, restaurar, resumo, abrirImportacao, nomeArquivo, montar };
})();
