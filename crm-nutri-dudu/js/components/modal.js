// Janela (modal) para formulários e confirmações, usando o <dialog> do navegador:
// fecha com Esc, prende o foco dentro dela e escurece o fundo.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.modal = (function () {
  const { escapeHtml } = NutriDudu.utils;

  function criarDialog(classe) {
    const dialog = document.createElement('dialog');
    dialog.className = `modal ${classe || ''}`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    // Todo pedido de fechar (×, Cancelar, Esc, clique no fundo) passa por aqui,
    // para o formulário poder perguntar antes de descartar o que foi digitado.
    dialog.pedirFechar = () => dialog.close();
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      dialog.pedirFechar();
    });
    // Clique no fundo escuro fecha.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.pedirFechar();
    });
    return dialog;
  }

  function mostrarErros(form, erros) {
    form.querySelectorAll('.campo-erro').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const geral = form.querySelector('.form-erro-geral');
    geral.hidden = true;

    let primeiro = null;
    Object.entries(erros).forEach(([nome, mensagem]) => {
      const alvo = form.querySelector(`[data-erro-para="${nome}"]`);
      if (alvo) {
        alvo.textContent = mensagem;
        const campo = form.querySelector(`[name="${nome}"]`);
        if (campo) {
          campo.setAttribute('aria-invalid', 'true');
          primeiro = primeiro || campo;
        }
      } else {
        geral.textContent = mensagem;
        geral.hidden = false;
      }
    });
    (primeiro || geral).focus?.();
  }

  /**
   * Abre um formulário.
   * - corpo: HTML dos campos (use NutriDudu.form para montar)
   * - ler(form): devolve os dados digitados
   * - validar(dados): devolve { campo: 'mensagem' } (vazio = tudo certo)
   * - salvar(dados): grava; se lançar erro, a janela continua aberta
   * - aoAbrir(form): para ligar comportamentos extras (mostrar/esconder campos…)
   */
  function formulario({ titulo, corpo, textoSalvar = 'Salvar', ler, validar = () => ({}), salvar, aoAbrir, largo = false }) {
    const dialog = criarDialog(largo ? 'modal-largo' : '');
    dialog.innerHTML = `
      <form novalidate>
        <header class="modal-topo">
          <h2>${escapeHtml(titulo)}</h2>
          <button type="button" class="modal-fechar" data-fechar aria-label="Fechar">×</button>
        </header>
        <div class="modal-corpo">
          ${corpo}
          <p class="form-erro-geral" role="alert" tabindex="-1" hidden></p>
        </div>
        <footer class="modal-rodape">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">${escapeHtml(textoSalvar)}</button>
        </footer>
      </form>`;

    const form = dialog.querySelector('form');
    // Alterações não salvas: só conta o que a pessoa digitou ou escolheu.
    let alterado = false;
    let perguntando = false;
    form.addEventListener('input', () => { alterado = true; });
    form.addEventListener('change', () => { alterado = true; });
    dialog.pedirFechar = async () => {
      if (!alterado) { dialog.close(); return; }
      if (perguntando) return;
      perguntando = true;
      const descartar = await confirmar({
        titulo: 'Descartar alterações?',
        mensagem: 'O que você preencheu nesta janela ainda não foi salvo.',
        textoConfirmar: 'Descartar',
        textoCancelar: 'Continuar editando',
        perigo: true,
      });
      perguntando = false;
      if (descartar) dialog.close();
    };
    dialog.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dialog.pedirFechar()));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = ler(form);
      const erros = validar(dados);
      if (Object.keys(erros).length) {
        mostrarErros(form, erros);
        return;
      }
      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      try {
        await salvar(dados);
        dialog.close();
      } catch (erro) {
        console.error(erro);
        mostrarErros(form, { _geral: erro.message || 'Não foi possível salvar. Tente de novo.' });
      } finally {
        botao.disabled = false;
      }
    });

    if (aoAbrir) aoAbrir(form);
    dialog.showModal();
    form.querySelector('input:not([type="hidden"]), select, textarea')?.focus();
    return dialog;
  }

  /**
   * Painel de informações com botões de ação (ex.: detalhes de uma consulta).
   * acoes: [{ texto, classe?, aoClicar }] — o painel fecha antes de executar a ação.
   */
  function painel({ titulo, corpo, acoes = [] }) {
    const dialog = criarDialog('');
    dialog.innerHTML = `
      <div class="modal-topo">
        <h2>${escapeHtml(titulo)}</h2>
        <button type="button" class="modal-fechar" data-fechar aria-label="Fechar">×</button>
      </div>
      <div class="modal-corpo">${corpo}</div>
      ${acoes.length ? `
        <div class="modal-rodape modal-acoes">
          ${acoes.map((a, i) => `<button type="button" class="btn btn-pequeno ${a.classe || ''}" data-acao="${i}">${escapeHtml(a.texto)}</button>`).join('')}
        </div>` : ''}`;
    dialog.querySelector('[data-fechar]').addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => {
      dialog.close();
      acoes[Number(b.dataset.acao)].aoClicar();
    }));
    dialog.showModal();
    return dialog;
  }

  /** Pergunta sim/não. Devolve uma Promise<boolean>. */
  function confirmar({ titulo, mensagem, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigo = false }) {
    return new Promise((resolve) => {
      const dialog = criarDialog('modal-pequeno');
      let resposta = false;
      dialog.innerHTML = `
        <div class="modal-topo"><h2>${escapeHtml(titulo)}</h2></div>
        <div class="modal-corpo"><p>${escapeHtml(mensagem)}</p></div>
        <div class="modal-rodape">
          <button type="button" class="btn" data-nao>${escapeHtml(textoCancelar)}</button>
          <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-primary'}" data-sim>${escapeHtml(textoConfirmar)}</button>
        </div>`;
      dialog.querySelector('[data-nao]').addEventListener('click', () => dialog.close());
      dialog.querySelector('[data-sim]').addEventListener('click', () => {
        resposta = true;
        dialog.close();
      });
      dialog.addEventListener('close', () => resolve(resposta));
      dialog.showModal();
      dialog.querySelector('[data-nao]').focus();
    });
  }

  return { formulario, painel, confirmar };
})();
