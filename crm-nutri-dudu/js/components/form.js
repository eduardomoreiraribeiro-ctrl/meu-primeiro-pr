// Montagem dos campos de formulário, sempre com rótulo e espaço para a mensagem de erro.
// Atenção: `ajuda` aceita HTML e por isso só pode receber texto fixo do código,
// nunca algo digitado por alguém.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.form = (function () {
  const { escapeHtml } = NutriDudu.utils;
  let contador = 0;

  const idNovo = (nome) => `f-${nome}-${++contador}`;

  function envolver(nome, rotulo, controle, { ajuda = '', obrigatorio = false, classe = '' } = {}, id) {
    return `
      <div class="campo ${classe}">
        <label for="${id}">${escapeHtml(rotulo)}${obrigatorio ? ' <span class="obrigatorio" aria-hidden="true">*</span>' : ''}</label>
        ${controle}
        ${ajuda ? `<p class="campo-ajuda">${ajuda}</p>` : ''}
        <p class="campo-erro" data-erro-para="${escapeHtml(nome)}" role="alert"></p>
      </div>`;
  }

  /** Campo de texto/número/data/hora. opcoes.atributos: texto extra (ex.: 'min="0" step="0.01"'). */
  function texto(nome, rotulo, valor = '', opcoes = {}) {
    const id = idNovo(nome);
    const { tipo = 'text', atributos = '', obrigatorio = false, placeholder = '' } = opcoes;
    const controle = `<input id="${id}" name="${escapeHtml(nome)}" type="${tipo}" value="${escapeHtml(valor ?? '')}"
      ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''} ${obrigatorio ? 'required' : ''} ${atributos}>`;
    return envolver(nome, rotulo, controle, opcoes, id);
  }

  function areaTexto(nome, rotulo, valor = '', opcoes = {}) {
    const id = idNovo(nome);
    const controle = `<textarea id="${id}" name="${escapeHtml(nome)}" rows="${opcoes.linhas || 3}">${escapeHtml(valor ?? '')}</textarea>`;
    return envolver(nome, rotulo, controle, opcoes, id);
  }

  /** Lista de opções: { valor: 'rótulo' } ou [[valor, rótulo], …]. */
  function selecao(nome, rotulo, opcoesLista, valor = '', opcoes = {}) {
    const id = idNovo(nome);
    const pares = Array.isArray(opcoesLista) ? opcoesLista : Object.entries(opcoesLista);
    const controle = `
      <select id="${id}" name="${escapeHtml(nome)}">
        ${opcoes.vazio ? `<option value="">${escapeHtml(opcoes.vazio)}</option>` : ''}
        ${pares.map(([v, r]) => `<option value="${escapeHtml(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('')}
      </select>`;
    return envolver(nome, rotulo, controle, opcoes, id);
  }

  /** Várias caixinhas de marcar com o mesmo nome. */
  function marcadores(nome, rotulo, opcoesLista, marcados = [], opcoes = {}) {
    const pares = Array.isArray(opcoesLista) ? opcoesLista : Object.entries(opcoesLista);
    return `
      <fieldset class="campo ${opcoes.classe || ''}">
        <legend>${escapeHtml(rotulo)}${opcoes.obrigatorio ? ' <span class="obrigatorio" aria-hidden="true">*</span>' : ''}</legend>
        <div class="marcadores">
          ${pares.map(([v, r]) => `
            <label class="marcador">
              <input type="checkbox" name="${escapeHtml(nome)}" value="${escapeHtml(v)}"${marcados.includes(v) ? ' checked' : ''}>
              <span>${escapeHtml(r)}</span>
            </label>`).join('')}
        </div>
        ${opcoes.ajuda ? `<p class="campo-ajuda">${opcoes.ajuda}</p>` : ''}
        <p class="campo-erro" data-erro-para="${escapeHtml(nome)}" role="alert"></p>
      </fieldset>`;
  }

  /** Uma caixinha sim/não. */
  function chave(nome, rotulo, ligado = false, opcoes = {}) {
    return `
      <div class="campo campo-chave">
        <label class="marcador">
          <input type="checkbox" name="${escapeHtml(nome)}" value="1"${ligado ? ' checked' : ''}>
          <span>${escapeHtml(rotulo)}</span>
        </label>
        ${opcoes.ajuda ? `<p class="campo-ajuda">${opcoes.ajuda}</p>` : ''}
      </div>`;
  }

  // ---------- Leitura ----------
  const valor = (form, nome) => (form.elements[nome]?.value ?? '').trim();
  const numero = (form, nome) => {
    const v = valor(form, nome).replace(',', '.');
    return v === '' ? null : Number(v);
  };
  const marcado = (form, nome) => Boolean(form.querySelector(`[name="${nome}"]`)?.checked);
  const marcadosDe = (form, nome) => [...form.querySelectorAll(`[name="${nome}"]:checked`)].map((el) => el.value);

  return { texto, areaTexto, selecao, marcadores, chave, valor, numero, marcado, marcadosDe };
})();
