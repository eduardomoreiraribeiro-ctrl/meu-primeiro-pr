// Pedaços de interface reutilizados pelas páginas.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.ui = (function () {
  const { escapeHtml } = NutriDudu.utils;

  function toast(mensagem, tipo = 'sucesso') {
    const area = document.getElementById('toast-area');
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = mensagem;
    area.appendChild(el);
    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  function cabecalho(titulo, subtitulo = '', acoesHtml = '') {
    return `
      <div class="page-header">
        <div>
          <h1>${escapeHtml(titulo)}</h1>
          ${subtitulo ? `<p class="muted">${escapeHtml(subtitulo)}</p>` : ''}
        </div>
        ${acoesHtml ? `<div class="page-actions">${acoesHtml}</div>` : ''}
      </div>`;
  }

  function kpi(rotulo, valor, detalhe = '') {
    return `
      <div class="card kpi">
        <span class="kpi-label">${escapeHtml(rotulo)}</span>
        <strong class="kpi-value">${escapeHtml(valor)}</strong>
        ${detalhe ? `<span class="kpi-detail">${escapeHtml(detalhe)}</span>` : ''}
      </div>`;
  }

  // Aviso das funcionalidades que chegam nas próximas fases do roadmap.
  function emBreve(fase, itens) {
    return `
      <details class="card em-breve">
        <summary>
          <span class="badge badge-info">Fase ${escapeHtml(fase)}</span>
          <span>Esta página ainda está em construção — ver o que vem</span>
        </summary>
        <ul>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
      </details>`;
  }

  function badge(texto, variante = 'neutro') {
    return `<span class="badge badge-${variante}">${escapeHtml(texto)}</span>`;
  }

  function avatar(iniciais) {
    return `<span class="avatar" aria-hidden="true">${escapeHtml(iniciais)}</span>`;
  }

  function vazio(mensagem) {
    return `<p class="vazio muted">${escapeHtml(mensagem)}</p>`;
  }

  const VARIANTE_STATUS_PESSOA = { lead: 'info', ativo: 'sucesso', inativo: 'neutro' };
  const VARIANTE_STATUS_CONSULTA = {
    agendada: 'info', confirmada: 'sucesso', realizada: 'neutro', faltou: 'perigo', cancelada: 'neutro',
  };

  function statusPessoa(status) {
    return badge(NutriDudu.config.STATUS_PESSOA[status] || status, VARIANTE_STATUS_PESSOA[status]);
  }

  function statusConsulta(status) {
    return badge(NutriDudu.config.STATUS_CONSULTA[status] || status, VARIANTE_STATUS_CONSULTA[status]);
  }

  const porcento = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

  /**
   * Barras horizontais com rótulo e valor visíveis (a cor nunca é a única pista).
   * itens: [{ nome, qtd, apagado? }]; opcoes.unidade: ['lead', 'leads'].
   */
  function barras(itens, { unidade = ['item', 'itens'], vazio: msgVazio = 'Sem dados no período.' } = {}) {
    const total = itens.reduce((t, i) => t + i.qtd, 0);
    if (!total) return vazio(msgVazio);
    const maior = Math.max(...itens.map((i) => i.qtd));
    return `
      <ul class="barras">
        ${itens.map((i) => {
          const texto = `${i.nome}: ${i.qtd} ${i.qtd === 1 ? unidade[0] : unidade[1]} (${porcento(i.qtd, total)}%)`;
          return `
            <li class="barra${i.apagado ? ' apagado' : ''}" title="${escapeHtml(texto)}">
              <span class="barra-rotulo">${escapeHtml(i.nome)}</span>
              <span class="barra-trilho"><span class="barra-valor" style="width:${(i.qtd / maior) * 100}%"></span></span>
              <span class="barra-numero">${i.qtd}</span>
            </li>`;
        }).join('')}
      </ul>`;
  }

  /** Colunas verticais (ex.: dias da semana). itens: [{ nome, curto, qtd }]. */
  function colunas(itens, { unidade = ['item', 'itens'], vazio: msgVazio = 'Sem dados no período.' } = {}) {
    const maior = Math.max(0, ...itens.map((i) => i.qtd));
    if (!maior) return vazio(msgVazio);
    return `
      <div class="colunas">
        ${itens.map((i) => {
          const texto = `${i.nome}: ${i.qtd} ${i.qtd === 1 ? unidade[0] : unidade[1]}`;
          return `
            <div class="coluna${i.qtd === maior ? ' destaque' : ''}" title="${escapeHtml(texto)}">
              <span class="coluna-numero">${i.qtd}</span>
              <span class="coluna-trilho"><span class="coluna-valor" style="height:${(i.qtd / maior) * 100}%"></span></span>
              <span class="coluna-rotulo">${escapeHtml(i.curto || i.nome)}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  return {
    toast, cabecalho, kpi, emBreve, badge, avatar, vazio, statusPessoa, statusConsulta, barras, colunas,
  };
})();
