// Tela do check-in, uma pergunta por vez. Usada na página do paciente (checkin.html)
// e na prévia dentro do sistema, para as duas ficarem idênticas.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.checkinTela = (function () {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iniciais = (nome) => String(nome || '').split(/\s+/).filter((p) => p && !/^(nutricionista|nutri|dra?\.?)$/i.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'N';

  /**
   * raiz: elemento onde a tela é desenhada.
   * opcoes: { perguntas, nome (primeiro nome do paciente), titulo, profissional: { nome, foto },
   *           aoEnviar(respostas) → Promise<{ score? }> (sem ele, é prévia), aoTerminar() }
   */
  function montar(raiz, opcoes) {
    const C = NutriDudu.checkin;
    const perguntas = opcoes.perguntas || [];
    const respostas = {};
    const prof = opcoes.profissional || {};
    let passo = -1; // -1 = abertura; perguntas.length = enviando/resultado
    let enviando = false;
    let erro = '';

    const precisaExplicar = (p, r) => p.explicacao?.ativo && r && !r.pulou && (C.nota(p, r.valor) ?? 0) < 0;
    const respondida = (p) => {
      const r = respostas[p.id];
      if (p.tipo === 'texto') return true; // resposta livre é opcional
      if (!r) return false;
      if (r.pulou) return true;
      if (p.tipo === 'numero') return r.valor !== '' && Number.isFinite(Number(String(r.valor).replace(',', '.')));
      return r.valor !== undefined && r.valor !== null && r.valor !== '';
    };

    function topo() {
      const pct = passo < 0 ? 0 : Math.min(100, Math.round(((passo + 1) / perguntas.length) * 100));
      const foto = prof.foto
        ? `<img class="ckt-foto" src="${esc(prof.foto)}" alt="" onerror="this.outerHTML='<span class=&quot;ckt-foto&quot;>${esc(iniciais(prof.nome))}</span>'">`
        : `<span class="ckt-foto">${esc(iniciais(prof.nome))}</span>`;
      return `<div class="ckt-barra"><span style="width:${pct}%"></span></div>
        <div class="ckt-topo">${foto}<div class="ckt-quem"><strong>${esc(prof.nome || 'Seu nutricionista')}</strong><span>Nutricionista</span></div>
        ${passo >= 0 && passo < perguntas.length ? `<span class="ckt-contador">${passo + 1}/${perguntas.length}</span>` : ''}</div>`;
    }

    function campo(p) {
      const r = respostas[p.id] || {};
      if (p.tipo === 'carinhas') {
        return `<p class="ckt-dica">Escolha uma opção</p><div class="ckt-opcoes">${C.carinhasDe(p).map((c) => `
          <button type="button" class="ckt-opcao" data-valor="${c.nota}" aria-pressed="${String(r.valor) === String(c.nota)}"><span class="emo" aria-hidden="true">${c.emoji}</span>${esc(c.rotulo)}</button>`).join('')}</div>`;
      }
      if (p.tipo === 'opcoes') {
        return `<p class="ckt-dica">Escolha uma opção</p><div class="ckt-opcoes">${(p.opcoes || []).map((o, i) => `
          <button type="button" class="ckt-opcao" data-valor="${i}" aria-pressed="${String(r.valor) === String(i)}">${esc(o.texto)}</button>`).join('')}</div>`;
      }
      if (p.tipo === 'escala') {
        const nums = []; for (let n = Number(p.min ?? 0); n <= Number(p.max ?? 10); n++) nums.push(n);
        return `<p class="ckt-dica">Escolha um número</p><div class="ckt-escala">${nums.map((n) => `
          <button type="button" class="ckt-opcao" data-valor="${n}" aria-pressed="${String(r.valor) === String(n)}">${n}</button>`).join('')}</div>
          <div class="ckt-escala-rot"><span>(${esc(p.min ?? 0)}) ${esc(p.rotuloMin || '')}</span><span>(${esc(p.max ?? 10)}) ${esc(p.rotuloMax || '')}</span></div>`;
      }
      if (p.tipo === 'numero') {
        return `<p class="ckt-dica">Informe em ${esc(p.unidade || '')}</p>
          <div class="ckt-medida"><input inputmode="decimal" data-numero placeholder="0,0" value="${r.pulou ? '' : esc(r.valor ?? '')}" ${r.pulou ? 'disabled' : ''} aria-label="${esc(p.titulo)}"><span>${esc(p.unidade || '')}</span></div>
          <label class="ckt-pular"><input type="checkbox" data-pular ${r.pulou ? 'checked' : ''}> Prefiro não informar</label>`;
      }
      return `<textarea data-texto placeholder="Escreva aqui (opcional)" aria-label="${esc(p.titulo)}">${esc(r.valor || '')}</textarea>`;
    }

    function desenhar() {
      let corpo = '';
      let rodape = '';
      if (passo < 0) {
        corpo = `<div class="ckt-intro"><div class="grande">📋</div><h2>Oi${opcoes.nome ? `, ${esc(opcoes.nome)}` : ''}!</h2>
          <p>Seu <strong>${esc(opcoes.titulo || 'check-in')}</strong> tá aqui. São ${perguntas.length} perguntas rapidinhas, leva uns 2 minutos 😊</p>
          <p class="small">Suas respostas são vistas só pelo seu nutricionista.</p></div>`;
        rodape = '<button type="button" class="ckt-btn" data-proximo>Começar →</button>';
      } else if (passo < perguntas.length) {
        const p = perguntas[passo];
        const r = respostas[p.id];
        corpo = `<div class="ckt-tit"><span class="ckt-ico" aria-hidden="true">${esc(p.icone || '•')}</span>${esc(p.titulo)}</div>
          <p class="ckt-pergunta">${esc(p.texto)}</p>${campo(p)}
          ${precisaExplicar(p, r) ? `<div class="ckt-explica"><label for="ckt-exp">${esc(p.explicacao.texto || 'Quer explicar um pouco?')}</label><textarea id="ckt-exp" data-explicacao placeholder="Opcional">${esc(r.explicacao || '')}</textarea></div>` : ''}
          ${erro ? `<p class="ckt-erro" role="alert">${esc(erro)}</p>` : ''}`;
        const ultima = passo === perguntas.length - 1;
        rodape = `<button type="button" class="ckt-btn ckt-voltar" data-voltar aria-label="Voltar">‹</button>
          <button type="button" class="ckt-btn" data-proximo ${respondida(p) && !enviando ? '' : 'disabled'}>${enviando ? 'Enviando…' : ultima ? 'Enviar respostas ✓' : 'Prosseguir →'}</button>`;
      }
      raiz.innerHTML = `<div class="ckt">${topo()}<div class="ckt-corpo">${corpo}</div>${rodape ? `<div class="ckt-rodape">${rodape}</div>` : ''}</div>`;
      ligar();
    }

    function resultado(scoreServidor) {
      const score = scoreServidor ?? C.score(perguntas, respostas);
      const cor = { otimo: 'var(--ckt-verde)', neutro: 'var(--ckt-amarelo)', pessimo: 'var(--ckt-vermelho)' }[C.corScore(score)];
      const itens = perguntas.map((p) => {
        const r = respostas[p.id];
        if (!r || r.pulou) return '';
        const n = C.nota(p, r.valor);
        if (n === null) return p.tipo === 'numero' ? `<li><span>${esc(p.icone || '')} ${esc(p.titulo)}</span><b>${esc(C.textoResposta(p, r))}</b></li>` : '';
        const f = C.faixa(n);
        return `<li><span>${esc(p.icone || '')} ${esc(p.titulo)}</span><b class="ckt-f-${f}">${C.ROTULO_FAIXA[f]} ${C.EMOJI_FAIXA[f]}</b></li>`;
      }).join('');
      raiz.innerHTML = `<div class="ckt">${topo()}<div class="ckt-corpo ckt-resultado">
        <h2 style="margin:4px 0 2px">Valeu${opcoes.nome ? `, ${esc(opcoes.nome)}` : ''}! 💚</h2>
        <p class="ckt-dica" style="margin-bottom:6px">Nesta semana, sua pontuação foi</p>
        ${score === null ? '' : `<div class="ckt-placar" style="--ckt-p:${score};--ckt-cor:${cor}"><div>${score}%</div></div>`}
        <ul class="ckt-lista">${itens}</ul>
        <p class="ckt-dica" style="margin-top:16px">Suas respostas já chegaram pro seu nutricionista 😊</p></div></div>`;
      opcoes.aoTerminar?.(score);
    }

    async function avancar() {
      if (passo < perguntas.length - 1) { passo += 1; erro = ''; desenhar(); return; }
      if (!opcoes.aoEnviar) { resultado(); return; }
      enviando = true; erro = ''; desenhar();
      try {
        const r = await opcoes.aoEnviar(respostas);
        resultado(r?.score);
      } catch (e) {
        enviando = false; erro = e.message || 'Não foi possível enviar agora. Tente de novo.'; desenhar();
      }
    }

    function ligar() {
      const p = perguntas[passo];
      raiz.querySelector('[data-proximo]')?.addEventListener('click', avancar);
      raiz.querySelector('[data-voltar]')?.addEventListener('click', () => { passo = Math.max(-1, passo - 1); erro = ''; desenhar(); });
      if (!p) return;
      raiz.querySelectorAll('[data-valor]').forEach((b) => b.addEventListener('click', () => {
        const anterior = respostas[p.id] || {};
        respostas[p.id] = { ...anterior, valor: Number(b.dataset.valor) };
        desenhar();
        // Avança sozinho quando não precisa explicar (fica mais rápido de responder).
        if (!precisaExplicar(p, respostas[p.id]) && passo < perguntas.length - 1) setTimeout(() => { if (perguntas[passo] === p) avancar(); }, 280);
      }));
      const num = raiz.querySelector('[data-numero]');
      num?.addEventListener('input', () => {
        respostas[p.id] = { valor: num.value.replace(',', '.') };
        const btn = raiz.querySelector('[data-proximo]');
        if (btn) btn.disabled = !respondida(p);
      });
      raiz.querySelector('[data-pular]')?.addEventListener('change', (e) => { respostas[p.id] = e.target.checked ? { pulou: true } : {}; desenhar(); });
      const txt = raiz.querySelector('[data-texto]');
      txt?.addEventListener('input', () => { respostas[p.id] = { valor: txt.value }; });
      const exp = raiz.querySelector('[data-explicacao]');
      exp?.addEventListener('input', () => { respostas[p.id] = { ...respostas[p.id], explicacao: exp.value }; });
    }

    desenhar();
  }

  return { montar };
})();
