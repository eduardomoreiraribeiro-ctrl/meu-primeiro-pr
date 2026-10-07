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

  return { toast, cabecalho, kpi, emBreve, badge, avatar, vazio, statusPessoa, statusConsulta };
})();
