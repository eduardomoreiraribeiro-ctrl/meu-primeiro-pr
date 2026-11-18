// ===== Cálculos (funções puras) =====

const TIPOS_DIA = ['MD-4', 'MD-3', 'MD-2', 'MD-1', 'MD', 'MD+1', 'MD+2', 'OFF'];

// Faixas padrão em g/kg (Collins et al., BJSM 2021). Configuráveis na interface.
const METAS_PADRAO = {
  'MD-4': { perfil: 'Treino moderado', choMin: 4, choMax: 6, ptnMin: 1.6, ptnMax: 2.2 },
  'MD-3': { perfil: 'Treino moderado', choMin: 4, choMax: 6, ptnMin: 1.6, ptnMax: 2.2 },
  'MD-2': { perfil: 'Treino moderado', choMin: 4, choMax: 6, ptnMin: 1.6, ptnMax: 2.2 },
  'MD-1': { perfil: 'Véspera de jogo', choMin: 6, choMax: 8, ptnMin: 1.6, ptnMax: 2.2 },
  'MD':   { perfil: 'Dia de jogo', choMin: 6, choMax: 8, ptnMin: 1.6, ptnMax: 2.2 },
  'MD+1': { perfil: 'Recuperação', choMin: 6, choMax: 8, ptnMin: 1.6, ptnMax: 2.2 },
  'MD+2': { perfil: 'Treino leve', choMin: 3, choMax: 4, ptnMin: 1.6, ptnMax: 2.2 },
  'OFF':  { perfil: 'Folga / leve', choMin: 3, choMax: 4, ptnMin: 1.6, ptnMax: 2.2 },
};

// Faixas de referência para normalizar a carga do dia (0 = baixa, 1 = alta).
const REFERENCIAS_CARGA = {
  cargaInterna: [150, 600],   // UA (PSE × min)
  distancia: [3000, 7500],    // m
  altaIntensidade: [150, 700] // m
};

const PROTEINA_POR_REFEICAO = [0.3, 0.4]; // g/kg

const DIA_MS = 86400000;
const paraDia = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / DIA_MS);
const paraIso = (dia) => new Date(dia * DIA_MS).toISOString().slice(0, 10);

function classificarDia(dataIso, jogosIso) {
  const d = paraDia(dataIso);
  const jogos = jogosIso.map(paraDia);
  if (jogos.includes(d)) return 'MD';
  const anteriores = jogos.filter(j => j < d);
  const proximos = jogos.filter(j => j > d);
  const desdeUltimo = anteriores.length ? d - Math.max(...anteriores) : Infinity;
  const ateProximo = proximos.length ? Math.min(...proximos) - d : Infinity;
  // Em calendário congestionado, a recuperação (MD+1) e a véspera (MD-1) têm prioridade.
  if (desdeUltimo === 1) return 'MD+1';
  if (ateProximo === 1) return 'MD-1';
  if (desdeUltimo === 2) return 'MD+2';
  if (ateProximo >= 2 && ateProximo <= 4) return 'MD-' + ateProximo;
  return 'OFF';
}

function normalizar(valor, [baixo, alto]) {
  return Math.min(Math.max((valor - baixo) / (alto - baixo), 0), 1);
}

// Retorna o fator de carga (0–1) e quais fontes foram usadas; null se não há dados.
function fatorCarga(carga) {
  if (!carga) return null;
  const partes = [];
  if (carga.pse > 0 && carga.minutos > 0) {
    partes.push(['PSE', normalizar(carga.pse * carga.minutos, REFERENCIAS_CARGA.cargaInterna)]);
  }
  if (carga.distancia > 0) partes.push(['GPS dist.', normalizar(carga.distancia, REFERENCIAS_CARGA.distancia)]);
  if (carga.altaIntensidade > 0) partes.push(['GPS AI', normalizar(carga.altaIntensidade, REFERENCIAS_CARGA.altaIntensidade)]);
  if (!partes.length) return null;
  return {
    fator: partes.reduce((s, [, v]) => s + v, 0) / partes.length,
    fontes: partes.map(([n]) => n),
  };
}

function distribuirProteina(proteinaG, pesoKg) {
  const maxPorRefeicao = PROTEINA_POR_REFEICAO[1] * pesoKg;
  const refeicoes = proteinaG / 4 <= maxPorRefeicao ? 4 : 5;
  const porRefeicao = proteinaG / refeicoes;
  return { refeicoes, porRefeicaoG: porRefeicao, porRefeicaoGkg: porRefeicao / pesoKg };
}

function calcularMetas(pesoKg, meta, carga) {
  const c = fatorCarga(carga);
  const fator = c ? c.fator : 0.5;
  const choGkg = meta.choMin + fator * (meta.choMax - meta.choMin);
  const ptnGkg = (meta.ptnMin + meta.ptnMax) / 2;
  const proteinaG = ptnGkg * pesoKg;
  return {
    fator,
    fontesCarga: c ? c.fontes : [],
    choGkg,
    choG: choGkg * pesoKg,
    choFaixaG: [meta.choMin * pesoKg, meta.choMax * pesoKg],
    ptnGkg,
    ptnG: proteinaG,
    ptnFaixaG: [meta.ptnMin * pesoKg, meta.ptnMax * pesoKg],
    ...distribuirProteina(proteinaG, pesoKg),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPOS_DIA, METAS_PADRAO, REFERENCIAS_CARGA, classificarDia, fatorCarga,
    distribuirProteina, calcularMetas, paraDia, paraIso,
  };
}

// ===== Interface =====

if (typeof document !== 'undefined') {
  const KEY = 'periodizacao.dados';
  const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const $ = (id) => document.getElementById(id);
  const fmt = (n, casas = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const fmtData = (iso) => iso.split('-').reverse().join('/');
  const escapeHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoje = () => new Date().toISOString().slice(0, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function carregar() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignora */ }
    return {
      jogos: d?.jogos || [],          // [{ data, adversario }]
      atletas: d?.atletas || [],      // [{ id, nome, posicao, peso }]
      metas: { ...clone(METAS_PADRAO), ...(d?.metas || {}) },
      ajustes: d?.ajustes || {},      // { data: tipoDia }
      cargas: d?.cargas || {},        // { data: { atletaId: {pse, minutos, distancia, altaIntensidade} } }
    };
  }
  let estado = carregar();
  const salvar = () => { try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch { /* sem armazenamento */ } };

  let dataSelecionada = hoje();
  let inicioSemana = segundaDaSemana(dataSelecionada);

  function segundaDaSemana(iso) {
    const d = paraDia(iso);
    const dow = new Date(d * DIA_MS).getUTCDay();
    return paraIso(d - ((dow + 6) % 7));
  }

  const jogosIso = () => estado.jogos.map(j => j.data);
  const tipoDoDia = (iso) => estado.ajustes[iso] || classificarDia(iso, jogosIso());
  const jogoDoDia = (iso) => estado.jogos.find(j => j.data === iso);

  // --- Calendário ---
  $('game-date').value = hoje();
  $('game-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = $('game-date').value;
    if (!data || jogoDoDia(data)) return;
    estado.jogos.push({ data, adversario: $('game-opponent').value.trim() });
    estado.jogos.sort((a, b) => a.data.localeCompare(b.data));
    $('game-opponent').value = '';
    salvar();
    dataSelecionada = data;
    inicioSemana = segundaDaSemana(data);
    renderTudo();
  });

  $('game-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-game]');
    if (!b) return;
    estado.jogos = estado.jogos.filter(j => j.data !== b.dataset.removeGame);
    salvar();
    renderTudo();
  });

  function renderJogos() {
    $('game-list').innerHTML = estado.jogos.length
      ? estado.jogos.map(j => `<span class="chip">⚽ ${fmtData(j.data)}${j.adversario ? ' · ' + escapeHtml(j.adversario) : ''}
          <button class="icon-btn" data-remove-game="${j.data}" aria-label="Remover jogo">✕</button></span>`).join('')
      : '<span class="field-hint">Nenhum jogo cadastrado — todos os dias aparecem como OFF.</span>';
  }

  $('week-prev').addEventListener('click', () => { inicioSemana = paraIso(paraDia(inicioSemana) - 7); renderSemana(); });
  $('week-next').addEventListener('click', () => { inicioSemana = paraIso(paraDia(inicioSemana) + 7); renderSemana(); });
  $('week').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    dataSelecionada = b.dataset.day;
    renderSemana();
    renderCartao();
  });

  function renderSemana() {
    const inicio = paraDia(inicioSemana);
    $('week-label').textContent = `${fmtData(paraIso(inicio))} – ${fmtData(paraIso(inicio + 6))}`;
    $('week').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const iso = paraIso(inicio + i);
      const tipo = tipoDoDia(iso);
      const manual = estado.ajustes[iso] ? ' manual' : '';
      return `<button type="button" class="day${iso === dataSelecionada ? ' selected' : ''}" data-day="${iso}">
        <span class="day-dow">${DIAS_SEMANA[new Date((inicio + i) * DIA_MS).getUTCDay()]}</span>
        <span class="day-num">${iso.slice(8)}</span>
        <span class="day-tag tag-${tipo}${manual}">${tipo}</span>
      </button>`;
    }).join('');
  }

  // --- Elenco ---
  $('athlete-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = $('athlete-name').value.trim();
    const peso = parseFloat($('athlete-weight').value);
    if (!nome) { $('athlete-error').textContent = 'Informe o nome do atleta.'; return; }
    if (!(peso >= 40 && peso <= 150)) { $('athlete-error').textContent = 'Informe um peso entre 40 e 150 kg.'; return; }
    $('athlete-error').textContent = '';
    upsertAtleta(nome, $('athlete-position').value, peso);
    $('athlete-form').reset();
    salvar();
    renderTudo();
  });

  function upsertAtleta(nome, posicao, peso) {
    const existente = estado.atletas.find(a => a.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
      existente.peso = peso;
      if (posicao) existente.posicao = posicao;
    } else {
      estado.atletas.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome, posicao, peso });
    }
    estado.atletas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  $('roster').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-athlete]');
    if (!b || !confirm('Remover este atleta do elenco?')) return;
    estado.atletas = estado.atletas.filter(a => a.id !== b.dataset.removeAthlete);
    salvar();
    renderTudo();
  });

  $('roster').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-athlete]');
    if (!b) return;
    const a = estado.atletas.find(x => x.id === b.dataset.editAthlete);
    $('athlete-name').value = a.nome;
    $('athlete-position').value = a.posicao || '';
    $('athlete-weight').value = a.peso;
    $('athlete-weight').focus();
  });

  function renderElenco() {
    $('roster').innerHTML = estado.atletas.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Atleta</th><th>Posição</th><th class="num">Peso</th><th></th></tr></thead>
          <tbody>${estado.atletas.map(a => `<tr>
            <td>${escapeHtml(a.nome)}</td><td>${a.posicao || '—'}</td><td class="num">${fmt(a.peso, 1)} kg</td>
            <td class="num"><button class="icon-btn" data-edit-athlete="${a.id}" title="Editar" aria-label="Editar">✎</button>
              <button class="icon-btn" data-remove-athlete="${a.id}" title="Remover" aria-label="Remover">✕</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">Nenhum atleta cadastrado.</p>';
  }

  // Usa o peso pré-sessão mais recente registrado no módulo Hidratação.
  $('import-hydration').addEventListener('click', () => {
    let sessoes = [];
    try { sessoes = JSON.parse(localStorage.getItem('hidratacao.sessoes')) || []; } catch { /* ignora */ }
    const recentes = new Map();
    for (const s of sessoes) {
      const atual = recentes.get(s.atleta);
      if (!atual || s.data >= atual.data) recentes.set(s.atleta, s);
    }
    recentes.forEach(s => upsertAtleta(s.atleta, s.posicao, s.pesoPre));
    $('import-msg').textContent = recentes.size
      ? `${recentes.size} atleta(s) importado(s) com o peso pré-sessão mais recente.`
      : 'Nenhuma sessão encontrada no módulo Hidratação neste navegador.';
    salvar();
    renderTudo();
  });

  // --- Configuração de metas ---
  function renderConfig() {
    $('config-body').innerHTML = TIPOS_DIA.map(t => {
      const m = estado.metas[t];
      const campo = (k) => `<td class="num"><input type="number" step="0.1" min="0" max="15" data-tipo="${t}" data-campo="${k}" value="${m[k]}" aria-label="${t} ${k}"></td>`;
      return `<tr><td class="label"><span class="day-tag tag-${t}">${t}</span></td><td>${m.perfil}</td>
        ${campo('choMin')}${campo('choMax')}${campo('ptnMin')}${campo('ptnMax')}</tr>`;
    }).join('');
  }
  $('config-body').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-tipo]');
    if (!inp) return;
    const v = parseFloat(inp.value);
    const m = estado.metas[inp.dataset.tipo];
    if (!(v >= 0)) { inp.value = m[inp.dataset.campo]; return; }
    m[inp.dataset.campo] = v;
    // mantém mín ≤ máx
    if (m.choMin > m.choMax) [m.choMin, m.choMax] = [m.choMax, m.choMin];
    if (m.ptnMin > m.ptnMax) [m.ptnMin, m.ptnMax] = [m.ptnMax, m.ptnMin];
    salvar();
    renderConfig();
    renderCartao();
  });
  $('config-reset').addEventListener('click', () => {
    estado.metas = clone(METAS_PADRAO);
    salvar();
    renderConfig();
    renderCartao();
  });

  // --- Cartão diário ---
  $('card-override').innerHTML = '<option value="">Automática</option>' + TIPOS_DIA.map(t => `<option value="${t}">${t}</option>`).join('');

  $('card-date').addEventListener('change', () => {
    if (!$('card-date').value) return;
    dataSelecionada = $('card-date').value;
    inicioSemana = segundaDaSemana(dataSelecionada);
    renderSemana();
    renderCartao();
  });

  $('card-override').addEventListener('change', () => {
    const v = $('card-override').value;
    if (v) estado.ajustes[dataSelecionada] = v; else delete estado.ajustes[dataSelecionada];
    salvar();
    renderSemana();
    renderCartao();
  });

  $('load-body').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-atleta]');
    if (!inp) return;
    const dia = (estado.cargas[dataSelecionada] ||= {});
    const c = (dia[inp.dataset.atleta] ||= {});
    const v = parseFloat(inp.value);
    if (v >= 0) c[inp.dataset.campo] = v; else delete c[inp.dataset.campo];
    salvar();
    renderMetas();
  });

  function linhasDoDia() {
    const tipo = tipoDoDia(dataSelecionada);
    const meta = estado.metas[tipo];
    const cargas = estado.cargas[dataSelecionada] || {};
    return estado.atletas.map(a => ({ atleta: a, tipo, meta, r: calcularMetas(a.peso, meta, cargas[a.id]) }));
  }

  function renderCartao() {
    const tipo = tipoDoDia(dataSelecionada);
    const jogo = jogoDoDia(dataSelecionada);
    $('card-date').value = dataSelecionada;
    $('card-override').value = estado.ajustes[dataSelecionada] || '';
    $('card-title').textContent = `Cartão diário — ${fmtData(dataSelecionada)}`;
    $('card-subtitle').textContent = estado.metas[tipo].perfil + (jogo?.adversario ? ` · vs ${jogo.adversario}` : '');
    const tag = $('card-tag');
    tag.className = `day-tag tag-${tipo}${estado.ajustes[dataSelecionada] ? ' manual' : ''}`;
    tag.textContent = tipo;

    const cargas = estado.cargas[dataSelecionada] || {};
    const campo = (a, k, step) => `<td class="num"><input type="number" min="0" step="${step}" data-atleta="${a.id}" data-campo="${k}"
      value="${cargas[a.id]?.[k] ?? ''}" aria-label="${k} ${escapeHtml(a.nome)}"></td>`;
    $('load-body').innerHTML = estado.atletas.length
      ? estado.atletas.map(a => `<tr><td>${escapeHtml(a.nome)}</td>${campo(a, 'pse', 1)}${campo(a, 'minutos', 1)}${campo(a, 'distancia', 50)}${campo(a, 'altaIntensidade', 10)}</tr>`).join('')
      : '<tr><td colspan="5" class="empty">Cadastre atletas no elenco.</td></tr>';
    renderMetas();
  }

  function renderMetas() {
    const linhas = linhasDoDia();
    $('targets').innerHTML = linhas.length ? linhas.map(({ atleta: a, r }) => `
      <div class="target-card">
        <h4>${escapeHtml(a.nome)}</h4>
        <div class="target-meta">${a.posicao || '—'} · ${fmt(a.peso, 1)} kg</div>
        <div class="target-line"><span>🍚 Carboidrato</span><span class="big cho">${fmt(r.choG)} g</span></div>
        <div class="target-sub">${fmt(r.choGkg, 1)} g/kg · faixa ${fmt(r.choFaixaG[0])}–${fmt(r.choFaixaG[1])} g</div>
        <div class="target-line"><span>🥩 Proteína</span><span class="big ptn">${fmt(r.ptnG)} g</span></div>
        <div class="target-sub">${r.refeicoes} refeições × ${fmt(r.porRefeicaoG)} g (${fmt(r.porRefeicaoGkg, 2)} g/kg)</div>
        <div class="load-note">${r.fontesCarga.length
          ? `Carga ${fmt(r.fator * 100)}% da faixa (${r.fontesCarga.join(', ')})`
          : 'Sem dados de carga · meio da faixa'}</div>
      </div>`).join('')
      : '<p class="empty">Cadastre atletas no elenco para gerar o cartão.</p>';
  }

  $('print-btn').addEventListener('click', () => window.print());

  $('csv-btn').addEventListener('click', () => {
    const linhas = linhasDoDia();
    if (!linhas.length) return;
    const cab = ['Data', 'Dia', 'Atleta', 'Posição', 'Peso (kg)', 'CHO (g/kg)', 'CHO (g)', 'PTN (g/kg)', 'PTN (g)', 'Refeições', 'PTN por refeição (g)'];
    const num = (n, c) => n.toFixed(c).replace('.', ',');
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const corpo = linhas.map(({ atleta: a, tipo, r }) => [
      fmtData(dataSelecionada), tipo, a.nome, a.posicao || '', num(a.peso, 1),
      num(r.choGkg, 1), Math.round(r.choG), num(r.ptnGkg, 1), Math.round(r.ptnG), r.refeicoes, Math.round(r.porRefeicaoG),
    ].map(q).join(';'));
    const csv = '﻿' + [cab.map(q).join(';'), ...corpo].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `metas-${dataSelecionada}.csv` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  function renderTudo() {
    renderJogos();
    renderSemana();
    renderElenco();
    renderConfig();
    renderCartao();
  }

  renderTudo();
}
