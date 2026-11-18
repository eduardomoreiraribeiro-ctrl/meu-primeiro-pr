// ===== Cálculos (funções puras) =====

const LIMITES = {
  perdaAmarelo: 1,   // %: a partir daqui, amarelo
  perdaVermelho: 2,  // %: acima disso, vermelho
  usgDesidratado: 1.020,
  corDesidratado: 4,
  fatorReposicao: 1.5,
};

// Escala de cor de urina 1–8 (Armstrong).
const CORES_URINA = ['#fdfbe1', '#f9f3b4', '#f6e88a', '#f2db5e', '#e9c63a', '#d9ae25', '#c08f1b', '#9a6c14'];

function calcularPerdaPercentual(pesoPre, pesoPos) {
  return (pesoPre - pesoPos) / pesoPre * 100;
}

function calcularTaxaSudorese(pesoPre, pesoPos, liquidoIngerido, urina, duracaoMin) {
  return (pesoPre - pesoPos + liquidoIngerido - (urina || 0)) / (duracaoMin / 60);
}

function calcularReposicao(pesoPre, pesoPos) {
  return Math.max(pesoPre - pesoPos, 0) * LIMITES.fatorReposicao;
}

function classificarPerda(perdaPct) {
  if (perdaPct > LIMITES.perdaVermelho) return 'vermelho';
  if (perdaPct >= LIMITES.perdaAmarelo) return 'amarelo';
  return 'verde';
}

function chegouDesidratado(usg, corUrina) {
  return (usg != null && usg > LIMITES.usgDesidratado) ||
         (corUrina != null && corUrina >= LIMITES.corDesidratado);
}

function calcularSessao(s) {
  const perdaPct = calcularPerdaPercentual(s.pesoPre, s.pesoPos);
  return {
    perdaPct,
    taxaSudorese: calcularTaxaSudorese(s.pesoPre, s.pesoPos, s.liquido, s.urina, s.duracao),
    reposicao: calcularReposicao(s.pesoPre, s.pesoPos),
    semaforo: classificarPerda(perdaPct),
    desidratadoPre: chegouDesidratado(s.usg, s.corUrina),
  };
}

function rankingSudorese(sessoes) {
  const porAtleta = new Map();
  for (const s of sessoes) {
    const item = porAtleta.get(s.atleta) || { atleta: s.atleta, posicao: s.posicao, soma: 0, n: 0, maxima: -Infinity };
    const taxa = calcularSessao(s).taxaSudorese;
    item.soma += taxa;
    item.n += 1;
    item.maxima = Math.max(item.maxima, taxa);
    if (s.posicao) item.posicao = s.posicao;
    porAtleta.set(s.atleta, item);
  }
  return [...porAtleta.values()]
    .map(i => ({ atleta: i.atleta, posicao: i.posicao, media: i.soma / i.n, maxima: i.maxima, sessoes: i.n }))
    .sort((a, b) => b.media - a.media);
}

if (typeof module !== 'undefined') {
  module.exports = {
    LIMITES, calcularPerdaPercentual, calcularTaxaSudorese, calcularReposicao,
    classificarPerda, chegouDesidratado, calcularSessao, rankingSudorese,
  };
}

// ===== Interface =====

if (typeof document !== 'undefined') {
  const STORAGE_KEY = 'hidratacao.sessoes';
  const ROTULO_SEMAFORO = { verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho' };

  const fmt = (n, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const fmtData = (iso) => iso.split('-').reverse().join('/');
  const escapeHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function carregar() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function salvar(lista) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lista)); } catch { /* sem armazenamento: mantém em memória */ }
  }

  let sessoes = carregar();
  let corUrina = null;

  const $ = (id) => document.getElementById(id);
  const form = $('session-form');
  const colorScale = $('urine-color');
  const historySelect = $('history-athlete');

  // Escala de cor
  CORES_URINA.forEach((cor, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'urine-swatch';
    b.dataset.value = i + 1;
    b.style.background = cor;
    b.textContent = i + 1;
    b.setAttribute('aria-label', `Cor de urina ${i + 1}`);
    colorScale.appendChild(b);
  });
  colorScale.addEventListener('click', (e) => {
    const btn = e.target.closest('.urine-swatch');
    if (!btn) return;
    colorScale.querySelectorAll('.urine-swatch').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    corUrina = btn.dataset.value ? parseInt(btn.dataset.value, 10) : null;
  });

  $('date').value = new Date().toISOString().slice(0, 10);

  // Preenche posição ao escolher atleta já cadastrado
  $('athlete').addEventListener('change', () => {
    const anterior = [...sessoes].reverse().find(s => s.atleta === $('athlete').value.trim());
    if (anterior && anterior.posicao) $('position').value = anterior.posicao;
  });

  const numOuNull = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : parseFloat(v.replace(',', '.'));
  };

  function validar(s) {
    if (!s.atleta) return 'Informe o nome do atleta.';
    if (!s.data) return 'Informe a data da sessão.';
    if (!(s.pesoPre > 0) || !(s.pesoPos > 0)) return 'Informe o peso pré e pós-sessão.';
    if (s.liquido == null || s.liquido < 0) return 'Informe o volume de líquido ingerido (0 se nada).';
    if (s.urina != null && s.urina < 0) return 'Volume de urina inválido.';
    if (!(s.duracao > 0)) return 'Informe a duração da sessão em minutos.';
    if (s.corUrina == null && s.usg == null) return 'Informe a cor da urina e/ou a densidade urinária (USG).';
    if (s.usg != null && (s.usg < 1 || s.usg > 1.05)) return 'USG deve estar entre 1,000 e 1,050.';
    if (Math.abs(calcularPerdaPercentual(s.pesoPre, s.pesoPos)) > 10) return 'Diferença entre peso pré e pós acima de 10%. Confira os valores.';
    return null;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      atleta: $('athlete').value.trim(),
      posicao: $('position').value,
      data: $('date').value,
      sessao: $('session').value.trim() || 'Sessão',
      pesoPre: numOuNull('weight-pre'),
      pesoPos: numOuNull('weight-post'),
      liquido: numOuNull('fluid'),
      urina: numOuNull('urine-volume'),
      duracao: numOuNull('duration'),
      corUrina,
      usg: numOuNull('usg'),
    };

    const erro = validar(s);
    $('form-error').textContent = erro || '';
    if (erro) return;

    sessoes.push(s);
    salvar(sessoes);
    mostrarResultado(s);
    renderTudo(s.atleta);
  });

  function mostrarResultado(s) {
    const r = calcularSessao(s);
    $('r-loss').textContent = fmt(r.perdaPct) + '%';
    const light = $('r-light');
    light.className = 'light ' + r.semaforo;
    light.textContent = ROTULO_SEMAFORO[r.semaforo];
    $('r-sweat').textContent = fmt(r.taxaSudorese, 2);
    $('r-replace').textContent = fmt(r.reposicao, 2);

    const pre = $('r-pre');
    const detalhes = [s.corUrina != null ? `cor ${s.corUrina}` : null, s.usg != null ? `USG ${s.usg.toFixed(3).replace('.', ',')}` : null]
      .filter(Boolean).join(' · ');
    if (r.desidratadoPre) {
      pre.className = 'alert-banner danger';
      pre.textContent = `⚠️ Atleta chegou desidratado à sessão (${detalhes}).`;
    } else {
      pre.className = 'alert-banner ok';
      pre.textContent = `Atleta chegou hidratado (${detalhes}).`;
    }

    const res = $('results');
    res.classList.remove('hidden');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function atletas() {
    return [...new Set(sessoes.map(s => s.atleta))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function renderAtletas(selecionado) {
    const lista = atletas();
    $('athlete-list').innerHTML = lista.map(a => `<option value="${escapeHtml(a)}">`).join('');
    historySelect.innerHTML = lista.length
      ? lista.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')
      : '<option value="">Nenhum atleta registrado</option>';
    if (selecionado && lista.includes(selecionado)) historySelect.value = selecionado;
  }

  function renderHistorico() {
    const atleta = historySelect.value;
    const linhas = sessoes
      .filter(s => s.atleta === atleta)
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));

    if (!linhas.length) {
      $('history').innerHTML = '<p class="empty">Nenhuma sessão registrada ainda.</p>';
      return;
    }

    $('history').innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Data</th><th>Sessão</th><th class="num">Pré</th><th class="num">Pós</th>
          <th class="num">Perda</th><th class="num">Sudorese</th><th class="num">Repor</th><th></th>
        </tr></thead>
        <tbody>${linhas.map(s => {
          const r = calcularSessao(s);
          const flag = r.desidratadoPre ? ' <span class="flag-pre" title="Chegou desidratado">●</span>' : '';
          return `<tr>
            <td>${fmtData(s.data)}${flag}</td>
            <td>${escapeHtml(s.sessao)}</td>
            <td class="num">${fmt(s.pesoPre)}</td>
            <td class="num">${fmt(s.pesoPos)}</td>
            <td class="num"><span class="light ${r.semaforo}">${fmt(r.perdaPct)}%</span></td>
            <td class="num">${fmt(r.taxaSudorese, 2)} L/h</td>
            <td class="num">${fmt(r.reposicao, 2)} L</td>
            <td><button class="icon-btn" data-delete="${s.id}" aria-label="Excluir sessão" title="Excluir">✕</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  $('history').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn || !confirm('Excluir esta sessão?')) return;
    sessoes = sessoes.filter(s => s.id !== btn.dataset.delete);
    salvar(sessoes);
    renderTudo(historySelect.value);
  });

  historySelect.addEventListener('change', renderHistorico);

  function renderRanking() {
    const ranking = rankingSudorese(sessoes);
    if (!ranking.length) {
      $('ranking').innerHTML = '<p class="empty">Registre sessões para ver o ranking do elenco.</p>';
      return;
    }
    const maior = Math.max(...ranking.map(r => r.media), 0.01);
    $('ranking').innerHTML = ranking.map((r, i) => `
      <div>
        <div class="rank-header">
          <span class="rank-name">${i + 1}. ${escapeHtml(r.atleta)}${r.posicao ? `<span class="rank-pos">${r.posicao}</span>` : ''}</span>
          <span class="rank-numbers"><strong>${fmt(r.media, 2)} L/h</strong> · máx ${fmt(r.maxima, 2)} · ${r.sessoes} ${r.sessoes === 1 ? 'sessão' : 'sessões'}</span>
        </div>
        <div class="bar-track"><div class="bar-fill water-fill" style="width:${Math.max(r.media, 0) / maior * 100}%"></div></div>
      </div>`).join('');
  }

  function renderTudo(selecionado) {
    renderAtletas(selecionado);
    renderHistorico();
    renderRanking();
  }

  renderTudo();
}
