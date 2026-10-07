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

  /**
   * Gráfico de linha de uma medida ao longo do tempo (uma série só).
   * pontos: [{ data, valor, nota? }] — `nota` marca o ponto com um círculo vazado
   * (ex.: mudou o método de medida). formatar(v) → texto do valor.
   */
  function grafLinha(pontos, { formatar = (v) => String(v), rotulo = 'valor' } = {}) {
    const validos = pontos.filter((p) => p.valor !== null && p.valor !== undefined).sort((a, b) => new Date(a.data) - new Date(b.data));
    if (!validos.length) return vazio('Sem medidas ainda.');
    const W = 320, H = 168, mL = 44, mR = 56, mT = 18, mB = 30;
    const t = validos.map((p) => new Date(p.data).getTime());
    const v = validos.map((p) => p.valor);
    let vMin = Math.min(...v), vMax = Math.max(...v);
    const folga = (vMax - vMin) * 0.15 || Math.max(1, Math.abs(vMax) * 0.05);
    vMin -= folga; vMax += folga;
    const tMin = Math.min(...t), tMax = Math.max(...t);
    const X = (ms) => (tMax === tMin ? mL + (W - mL - mR) / 2 : mL + ((ms - tMin) / (tMax - tMin)) * (W - mL - mR));
    const Y = (val) => mT + (1 - (val - vMin) / (vMax - vMin)) * (H - mT - mB);
    const ticks = [vMin + folga, (vMin + vMax) / 2, vMax - folga];
    const dataCurta = (ms) => NutriDudu.utils.data(new Date(ms)).replace(/\/(\d{2})(\d{2})$/, '/$2');
    const caminho = validos.map((p, i) => `${i ? 'L' : 'M'}${X(t[i]).toFixed(1)} ${Y(p.valor).toFixed(1)}`).join('');
    const ultimo = validos[validos.length - 1];
    return `
      <svg class="graf-linha" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(`${rotulo}: de ${formatar(validos[0].valor)} para ${formatar(ultimo.valor)}`)}">
        ${ticks.map((tk) => `
          <line x1="${mL}" x2="${W - mR}" y1="${Y(tk).toFixed(1)}" y2="${Y(tk).toFixed(1)}" class="graf-grade"/>
          <text x="${mL - 6}" y="${(Y(tk) + 4).toFixed(1)}" text-anchor="end" class="graf-eixo">${escapeHtml(formatar(Math.round(tk * 10) / 10))}</text>`).join('')}
        <text x="${mL}" y="${H - 8}" class="graf-eixo">${dataCurta(tMin)}</text>
        ${tMax !== tMin ? `<text x="${W - mR}" y="${H - 8}" text-anchor="end" class="graf-eixo">${dataCurta(tMax)}</text>` : ''}
        <path d="${caminho}" class="graf-traco"/>
        ${validos.map((p, i) => `
          <g class="graf-ponto${p.nota ? ' vazado' : ''}">
            <title>${escapeHtml(`${NutriDudu.utils.data(p.data)}: ${formatar(p.valor)}${p.nota ? ` — ${p.nota}` : ''}`)}</title>
            <circle cx="${X(t[i]).toFixed(1)}" cy="${Y(p.valor).toFixed(1)}" r="10" class="graf-alvo"/>
            <circle cx="${X(t[i]).toFixed(1)}" cy="${Y(p.valor).toFixed(1)}" r="4" class="graf-marca"/>
          </g>`).join('')}
        <text x="${(X(t[t.length - 1]) + 8).toFixed(1)}" y="${(Y(ultimo.valor) + 4).toFixed(1)}" class="graf-valor">${escapeHtml(formatar(ultimo.valor))}</text>
      </svg>`;
  }

  return {
    toast, cabecalho, kpi, emBreve, badge, avatar, vazio, statusPessoa, statusConsulta, barras, colunas, grafLinha,
  };
})();
