// Tela da área do paciente. Usada na página pública (paciente.html) e na prévia dentro do sistema.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.areaPacienteTela = (function () {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FUSO = 'America/Sao_Paulo';
  const fmt = (v, o) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...o }).format(new Date(v));
  const dataCurta = (v) => fmt(v, { day: '2-digit', month: '2-digit' });
  const dataLonga = (v) => fmt(v, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const diaSemana = (v) => { const s = fmt(v, { weekday: 'long' }).replace('-feira', ''); return s[0].toUpperCase() + s.slice(1); };
  const hora = (v) => fmt(v, { hour: '2-digit', minute: '2-digit' });
  const numero = (n, casas = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  const iniciais = (nome) => String(nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'N';
  const corScore = (s) => (s >= 75 ? 'var(--ap-verde)' : s >= 55 ? 'var(--ap-amarelo)' : 'var(--ap-vermelho)');

  const METRICAS = {
    peso: { rotulo: 'Peso', unidade: 'kg' },
    gordura: { rotulo: '% de gordura', unidade: '%' },
    massaMagra: { rotulo: 'Massa magra', unidade: 'kg' },
    cintura: { rotulo: 'Cintura', unidade: 'cm' },
  };

  /** Gráfico de linha simples (SVG) com os valores e as datas. */
  function grafico(pontos, unidade) {
    if (pontos.length < 2) return '';
    const L = 320; const H = 150; const m = { e: 10, d: 10, t: 22, b: 24 };
    const vals = pontos.map((p) => p.v);
    let min = Math.min(...vals); let max = Math.max(...vals);
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    const x = (i) => m.e + (i * (L - m.e - m.d)) / (pontos.length - 1);
    const y = (v) => m.t + ((max - v) * (H - m.t - m.b)) / (max - min);
    const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const mostrarRotulo = (i) => pontos.length <= 6 || i === 0 || i === pontos.length - 1 || i % Math.ceil(pontos.length / 5) === 0;
    return `<svg class="ap-graf" viewBox="0 0 ${L} ${H}" role="img" aria-label="Evolução em ${esc(unidade)}">
      <path d="${linha} L${x(pontos.length - 1).toFixed(1)},${H - m.b} L${m.e},${H - m.b} Z" class="ap-graf-area"/>
      <path d="${linha}" class="ap-graf-linha"/>
      ${pontos.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" class="ap-graf-ponto"/>
        ${mostrarRotulo(i) ? `<text x="${x(i).toFixed(1)}" y="${(y(p.v) - 9).toFixed(1)}" text-anchor="${i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'}" class="ap-graf-valor">${numero(p.v)}</text>
        <text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'}" class="ap-graf-data">${dataCurta(p.data)}</text>` : ''}`).join('')}
    </svg>`;
  }

  function cartaoEvolucao(d, metrica) {
    const ev = d.evolucao || [];
    if (!ev.length) {
      return `<section class="ap-cartao"><h2>📈 Sua evolução</h2><p class="ap-muted">Suas medidas aparecem aqui depois da primeira avaliação na consulta.</p></section>`;
    }
    const disponiveis = Object.keys(METRICAS).filter((k) => ev.some((e) => e[k] !== null));
    const atual = disponiveis.includes(metrica) ? metrica : disponiveis[0];
    const tiles = disponiveis.map((k) => {
      const comValor = ev.filter((e) => e[k] !== null);
      const ultimo = comValor[comValor.length - 1][k];
      const dif = comValor.length > 1 ? ultimo - comValor[0][k] : null;
      return `<button type="button" class="ap-tile" data-metrica="${k}" aria-pressed="${k === atual}">
        <span class="ap-tile-rot">${METRICAS[k].rotulo}</span>
        <strong>${numero(ultimo)} <small>${METRICAS[k].unidade}</small></strong>
        ${dif !== null && Math.abs(dif) >= 0.05 ? `<span class="ap-tile-dif">${dif > 0 ? '▲ +' : '▼ −'}${numero(Math.abs(dif))} desde ${dataCurta(comValor[0].data)}</span>` : '<span class="ap-tile-dif">&nbsp;</span>'}
      </button>`;
    }).join('');
    const pontos = ev.filter((e) => e[atual] !== null).map((e) => ({ data: e.data, v: e[atual] }));
    return `<section class="ap-cartao"><h2>📈 Sua evolução</h2>
      <div class="ap-tiles">${tiles}</div>
      ${pontos.length > 1 ? grafico(pontos, METRICAS[atual].unidade) : '<p class="ap-muted small">O gráfico aparece a partir da segunda avaliação.</p>'}
      <p class="ap-muted small">Medidas das suas avaliações nas consultas.</p></section>`;
  }

  function cartaoCheckins(d) {
    const lista = (d.checkins || []).filter((c) => c.score !== null).slice(-10);
    const u = d.ultimoCheckin;
    if (!lista.length && !u) return '';
    const barras = lista.length ? `<div class="ap-barras" role="img" aria-label="Pontuação dos últimos check-ins">${lista.map((c) => `
      <div class="ap-barra"><span class="ap-barra-v">${c.score}</span><div class="ap-barra-c"><i style="height:${Math.max(4, c.score)}%;background:${corScore(c.score)}"></i></div><span class="ap-barra-d">${dataCurta(c.data)}</span></div>`).join('')}</div>` : '';
    const C = NutriDudu.checkin;
    const itens = u ? u.itens.map((i) => `<li><span>${esc(i.icone)} ${esc(i.titulo)}</span><b class="ap-f-${i.faixa || 'sem'}">${i.resposta ? `${esc(i.resposta)}${i.faixa ? ' · ' : ''}` : ''}${i.faixa && C ? `${esc(i.rotulo || C.ROTULO_FAIXA[i.faixa])} ${C.EMOJI_FAIXA[i.faixa]}` : ''}</b></li>`).join('') : '';
    return `<section class="ap-cartao"><h2>📋 Seus check-ins</h2>
      ${barras}
      ${u ? `<h3>Último check-in · ${dataCurta(u.data)}${u.score !== null ? ` · <span style="color:${corScore(u.score)}">${u.score}%</span>` : ''}</h3><ul class="ap-lista">${itens}</ul>` : ''}
    </section>`;
  }

  /** Objetivos combinados na consulta + contagem regressiva da meta. */
  function cartaoObjetivos(d) {
    const o = d.objetivos;
    if (!o) return '';
    let dias = null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(o.meta?.data || '');
    if (m) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      dias = Math.round((new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - hoje) / 864e5);
    }
    const linha = (rotulo, t) => (t ? `<li><span>${esc(rotulo)}</span><p>${esc(t).replace(/\n/g, '<br>')}</p></li>` : '');
    const contagem = dias === null ? '' : dias > 1 ? `<strong>${dias}</strong><span>dias</span>` : dias === 1 ? '<strong>1</strong><span>dia</span>' : dias === 0 ? '<strong>Hoje!</strong>' : '<strong>✓</strong><span>concluída</span>';
    return `<section class="ap-cartao"><h2>🎯 Seus objetivos</h2>
      ${o.meta ? `<div class="ap-meta"><div><span>🏁 Meta</span><strong>${esc(o.meta.titulo || 'Sua meta')}</strong>${o.meta.data ? `<span>${dataLonga(`${o.meta.data}T12:00:00`)}</span>` : ''}</div>${contagem ? `<div class="ap-contagem">${contagem}</div>` : ''}</div>` : ''}
      <ul class="ap-objetivos">
        ${linha('Principal', o.objetivoPrincipal)}${linha('Próximos 3 meses', o.objetivoCurto)}${linha('6 a 12 meses', o.objetivoMedio)}${linha('Longo prazo', o.objetivoLongo)}
        ${linha('Como vamos saber que está dando certo', o.sinaisSucesso)}
      </ul></section>`;
  }

  function montar(raiz, d, opcoes = {}) {
    let metrica = 'peso';
    const emoji = d.sexo === 'M' ? '💪' : '💚';
    const prof = { nome: d.profissional || 'Seu nutricionista', foto: opcoes.foto || '' };
    const linkCheckin = (codigo) => (opcoes.linkCheckin ? opcoes.linkCheckin(codigo) : `checkin.html?c=${encodeURIComponent(codigo)}`);
    const zap = d.whatsapp ? `https://wa.me/${d.whatsapp}` : '';

    function desenhar() {
      const foto = prof.foto
        ? `<img class="ap-foto" src="${esc(prof.foto)}" alt="" onerror="this.outerHTML='<span class=&quot;ap-foto&quot;>${esc(iniciais(prof.nome))}</span>'">`
        : `<span class="ap-foto">${esc(iniciais(prof.nome))}</span>`;
      const ck = d.checkinAberto;
      const px = d.proxima;
      const pl = d.plano;
      raiz.innerHTML = `<div class="ap">
        <header class="ap-topo">${foto}<div><strong>${esc(prof.nome)}</strong><span>Nutricionista</span></div></header>
        <div class="ap-ola"><h1>Oi, ${esc(d.nome || 'tudo bem')}! ${emoji}</h1><p>Aqui fica o seu acompanhamento: consultas, evolução e check-ins.</p></div>

        ${ck ? `<section class="ap-cartao ap-destaque"><div><strong>📋 Seu check-in tá esperando</strong>
          <span>${esc(ck.titulo)}${ck.prazo ? ` · responda até ${diaSemana(ck.prazo).toLowerCase()} (${dataCurta(ck.prazo)})` : ''}</span></div>
          <a class="ap-btn" href="${esc(linkCheckin(ck.codigo))}">Responder agora</a></section>` : ''}

        <section class="ap-cartao"><h2>📅 Próxima consulta</h2>
          ${px ? `<div class="ap-consulta"><div class="ap-cal"><span>${fmt(px.inicio, { month: 'short' }).replace('.', '')}</span><strong>${fmt(px.inicio, { day: '2-digit' })}</strong></div>
            <div><strong>${diaSemana(px.inicio)} às ${hora(px.inicio)}</strong><span>${esc(px.servico || 'Consulta')}</span>
            <div class="ap-chips">${px.confirmada ? '<span class="ap-chip ok">✓ Confirmada</span>' : '<span class="ap-chip">Agendada</span>'}${px.online ? '<span class="ap-chip">💻 Online</span>' : ''}</div></div></div>`
            : '<p class="ap-muted">Nenhuma consulta marcada no momento.</p>'}
          ${zap ? `<a class="ap-btn ap-btn-sec" href="${zap}" target="_blank" rel="noopener">${px ? 'Remarcar ou tirar dúvida no WhatsApp' : 'Marcar pelo WhatsApp'}</a>`
            : px ? '' : `<a class="ap-btn ap-btn-sec" href="${esc(opcoes.linkAgendar || 'agendar.html')}">Marcar consulta pelo site</a>`}
        </section>

        ${cartaoObjetivos(d)}

        ${pl ? `<section class="ap-cartao"><h2>🗂️ Seu plano</h2>
          <div class="ap-plano"><strong>${esc(pl.nome)}</strong>${pl.ativo ? '<span class="ap-chip ok">Ativo</span>' : '<span class="ap-chip">Encerrado</span>'}</div>
          ${pl.total ? `<div class="ap-prog"><i style="width:${Math.round((pl.usadas / pl.total) * 100)}%"></i></div>
          <p class="ap-muted small"><strong>${pl.usadas} de ${pl.total}</strong> consultas feitas${pl.ativo ? ` · ${pl.restantes === 1 ? 'falta 1' : `faltam ${pl.restantes}`}` : ''}${pl.validade ? ` · válido até ${dataLonga(pl.validade)}` : ''}</p>` : ''}
        </section>` : ''}

        ${cartaoEvolucao(d, metrica)}
        ${cartaoCheckins(d)}

        ${d.consultas?.length ? `<section class="ap-cartao"><h2>🩺 Suas consultas</h2><ul class="ap-lista">
          ${d.consultas.slice().reverse().map((c) => `<li><span>${dataLonga(c.data)}</span><b>${esc(c.servico || 'Consulta')}</b></li>`).join('')}</ul></section>` : ''}

        <p class="ap-rodape">🔒 Este link é só seu: não compartilhe. Seus dados são vistos só por você e pelo seu nutricionista.</p>
      </div>`;
      raiz.querySelectorAll('[data-metrica]').forEach((b) => b.addEventListener('click', () => { metrica = b.dataset.metrica; desenhar(); }));
    }

    desenhar();
  }

  return { montar };
})();
