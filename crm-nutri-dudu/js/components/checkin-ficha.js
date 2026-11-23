// Check-ins na ficha do paciente: enviar, mapa colorido das respostas, gráficos e revisão.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.checkinFicha = (function () {
  const C = () => NutriDudu.checkin;
  const U = () => NutriDudu.utils;
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');

  // ---------------- Link pessoal ----------------
  function novoCodigo() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function resumo(codigo) {
    const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codigo)));
    return [...dig].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const linkDe = (codigo) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}c/${codigo}`;

  const janelaAberta = (conversa) => Boolean(conversa?.ultimaMensagemContatoEm && Date.now() - new Date(conversa.ultimaMensagemContatoEm).getTime() < 23.5 * 3600 * 1000);

  function textoConvite(pessoa, titulo, link) {
    const nome = U().primeiroNome ? U().primeiroNome(pessoa.nome) : String(pessoa.nome).split(' ')[0];
    const t = `Oi, ${nome}! Seu ${titulo.toLowerCase()} tá disponível 😊 Responde rapidinho por aqui, leva uns 2 minutos: ${link}`;
    return NutriDudu.mensagensAutomaticas?.paraGenero ? NutriDudu.mensagensAutomaticas.paraGenero(t, pessoa) : t;
  }

  /** Mostra o link e as formas de mandar para o paciente. */
  function painelEnvio(pessoa, ck, conversa) {
    const { modal, ui, nuvem } = NutriDudu;
    const link = linkDe(ck.codigo);
    const texto = textoConvite(pessoa, ck.titulo, link);
    const tel = U().soDigitos(pessoa.telefone);
    const podeClinica = nuvem.ativa() && janelaAberta(conversa);
    const dialog = modal.painel({
      titulo: 'Check-in pronto para enviar',
      corpo: `
        <p class="small">Prazo para responder: <strong>${U().data(ck.prazo)}</strong>. Mande o link para ${esc(pessoa.nome)}:</p>
        <div class="ck-link"><code>${esc(link)}</code></div>
        <p class="small muted">Mensagem sugerida:</p>
        <blockquote class="ck-msg">${esc(texto)}</blockquote>
        <div class="acoes-linha">
          ${podeClinica ? '<button type="button" class="btn btn-primary" data-ck-clinica>Enviar pelo WhatsApp da clínica</button>' : ''}
          <button type="button" class="btn${podeClinica ? '' : ' btn-primary'}" data-ck-copiar>Copiar mensagem</button>
          ${tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(texto)}">Abrir no meu WhatsApp</a>` : ''}
        </div>
        ${podeClinica ? '' : '<p class="muted small">O WhatsApp da clínica só manda mensagem livre se a pessoa escreveu nas últimas 24 horas. O envio automático pelo número da clínica (com modelo aprovado) vem na próxima etapa.</p>'}`,
    });
    dialog.querySelector('[data-ck-copiar]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); ui.toast('Mensagem copiada.'); } catch (e) { ui.toast('Não consegui copiar. Selecione o texto e copie.', 'erro'); }
    });
    dialog.querySelector('[data-ck-clinica]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await nuvem.enviarWhatsApp(conversa.id, texto); ui.toast('Check-in enviado pelo WhatsApp da clínica.'); dialog.close(); }
      catch (erro) { ui.toast(erro.message, 'erro'); e.currentTarget.disabled = false; }
    });
  }

  /** Escolher questionário e prazo, criar o check-in e mostrar o link. */
  async function enviar(pessoa) {
    const { store, modal, form: f, permissoes, ui } = NutriDudu;
    if (!permissoes.exigir('verClinico')) return;
    const cfg = C().configuracao((await store.get('configuracoes', 'checkin')) || {});
    const ativos = cfg.questionarios.filter((q) => q.ativo !== false);
    if (!ativos.length) { ui.toast('Crie um questionário em Check-ins › Questionários.', 'erro'); return; }
    const conversa = (await store.list('conversas', (x) => x.pessoaId === pessoa.id)).sort((a, b) => (b.ultimaMensagemEm || '').localeCompare(a.ultimaMensagemEm || ''))[0];
    modal.formulario({
      titulo: `Enviar check-in para ${pessoa.nome.split(' ')[0]}`,
      textoSalvar: 'Gerar link',
      corpo: `
        ${f.selecao('questionarioId', 'Questionário', ativos.map((q) => [q.id, `${q.titulo} (${C().montarPerguntas(q, cfg.perguntas).length} perguntas)`]), ativos[0].id)}
        ${f.selecao('prazoDias', 'Prazo para responder', { 1: '1 dia', 2: '2 dias', 3: '3 dias', 5: '5 dias', 7: '7 dias' }, String(cfg.prazoDias || 3))}`,
      ler: (form) => ({ questionarioId: f.valor(form, 'questionarioId'), prazoDias: Number(f.valor(form, 'prazoDias')) || 3 }),
      salvar: async (d) => {
        const q = ativos.find((x) => x.id === d.questionarioId);
        const perguntas = C().montarPerguntas(q, cfg.perguntas);
        const codigo = novoCodigo();
        const prazo = new Date(); prazo.setDate(prazo.getDate() + d.prazoDias); prazo.setHours(23, 59, 0, 0);
        const ck = await store.create('checkins', {
          pessoaId: pessoa.id, questionarioId: q.id, titulo: q.titulo, perguntas, codigo,
          enviadoEm: new Date().toISOString(), prazo: prazo.toISOString(), enviadoPor: permissoes.atual(), respostas: null, score: null,
        }, { id: await resumo(codigo) });
        await store.create('interacoes', {
          pessoaId: pessoa.id, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
          descricao: `Check-in "${q.titulo}" enviado (prazo ${U().data(prazo)}).`,
        });
        setTimeout(() => painelEnvio(pessoa, ck, conversa), 50);
      },
    });
  }

  // ---------------- Envio automático programado ----------------
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function blocoProgramacao(c, cfg) {
    const { ui } = NutriDudu;
    const prog = c.pessoa.checkinProgramado;
    if (!prog?.ativo) {
      return `<div class="ck-prog ck-prog-vazio"><span>⏱️ <strong>Envio automático:</strong> desligado. O check-in sai sozinho pelo WhatsApp da clínica no dia e horário que você escolher.</span>
        <button type="button" class="btn btn-pequeno" data-ck-programar>Programar envio automático</button></div>`;
    }
    const q = cfg?.questionarios.find((x) => x.id === prog.questionarioId);
    const proximos = prog.pausado ? [] : C().proximosEnvios(prog, new Date(), 3);
    const erro = prog.tentativa?.erro;
    return `<div class="ck-prog">
      <div><span>⏱️ <strong>Envio automático:</strong> ${esc(q?.titulo || 'questionário removido')} · ${esc(C().descreverProgramacao(prog))}
        ${prog.pausado ? ui.badge('Pausado', 'alerta') : ui.badge('Ativo', 'sucesso')}</span>
        ${proximos.length ? `<span class="muted small bloco">Próximos: ${proximos.map((d) => `${DIAS[d.getDay()]} ${U().data(d).slice(0, 5)}`).join(' · ')}</span>` : ''}
        ${erro ? `<span class="texto-perigo small bloco">Último envio falhou: ${esc(erro)}</span>` : ''}</div>
      <span class="acoes-linha sem-margem"><button type="button" class="btn btn-pequeno" data-ck-programar>Editar</button>
        <button type="button" class="btn btn-pequeno" data-ck-pausar>${prog.pausado ? 'Retomar' : 'Pausar'}</button>
        <button type="button" class="btn btn-pequeno btn-texto-perigo" data-ck-parar>Desligar</button></span></div>`;
  }

  async function programar(pessoa) {
    const { store, modal, form: f, permissoes, ui } = NutriDudu;
    if (!permissoes.exigir('verClinico')) return;
    const cfg = C().configuracao((await store.get('configuracoes', 'checkin')) || {});
    const ativos = cfg.questionarios.filter((q) => q.ativo !== false);
    const atual = pessoa.checkinProgramado || {};
    const hoje = U().isoDia(new Date());
    const dialog = modal.formulario({
      titulo: `Envio automático para ${pessoa.nome.split(' ')[0]}`,
      textoSalvar: 'Salvar programação',
      corpo: `
        ${f.selecao('questionarioId', 'Questionário', ativos.map((q) => [q.id, q.titulo]), atual.questionarioId || ativos[0]?.id)}
        ${f.selecao('modo', 'Frequência', { dias: 'Em dias da semana', intervalo: 'A cada X semanas' }, atual.modo || 'dias')}
        <div data-modo="dias"><p class="small" style="margin:0 0 6px"><strong>Dias</strong></p><div class="ck-dias">${DIAS.map((d, i) => `<label><input type="checkbox" name="dia" value="${i}"${(atual.dias || [1]).includes(i) ? ' checked' : ''}> ${d}</label>`).join('')}</div>
          <p class="muted small">Dica: 1 ou 2 vezes por semana é o ideal. Mais que isso cansa o paciente.</p></div>
        <div data-modo="intervalo">${f.selecao('intervaloDias', 'Intervalo', C().FREQUENCIAS, String(atual.intervaloDias || 7))}</div>
        <div class="grade-2">
          ${f.texto('hora', 'Horário do envio', atual.hora || '09:00', { tipo: 'time' })}
          ${f.selecao('prazoDias', 'Prazo para responder', { 1: '1 dia', 2: '2 dias', 3: '3 dias', 5: '5 dias', 6: '6 dias' }, String(atual.prazoDias || 3))}
        </div>
        ${f.texto('inicio', 'Começar em', atual.inicio && atual.inicio >= hoje ? atual.inicio : hoje, { tipo: 'date' })}
        <div class="ck-prog-previa" data-previa-datas></div>
        <p class="muted small">Sai pelo WhatsApp da clínica, das ${'8h'} às ${'20h'}, só se a automação <strong>Check-in disponível</strong> estiver ligada em Configurações e o paciente tiver autorizado o WhatsApp. No último dia do prazo vai 1 lembrete (automação <strong>Lembrete do check-in</strong>).</p>`,
      ler: (form) => ({
        questionarioId: f.valor(form, 'questionarioId'), modo: f.valor(form, 'modo'),
        dias: [...form.querySelectorAll('[name="dia"]:checked')].map((x) => Number(x.value)),
        intervaloDias: Number(f.valor(form, 'intervaloDias')) || 7, hora: f.valor(form, 'hora') || '09:00',
        prazoDias: Number(f.valor(form, 'prazoDias')) || 3, inicio: f.valor(form, 'inicio') || hoje,
      }),
      validar: (d) => {
        if (!d.questionarioId) return { _geral: 'Crie um questionário primeiro.' };
        if (d.modo === 'dias' && !d.dias.length) return { _geral: 'Escolha pelo menos um dia da semana.' };
        if (!/^\d{2}:\d{2}$/.test(d.hora)) return { hora: 'Informe o horário.' };
        if (d.modo === 'dias' && d.dias.length > 1) {
          const ord = [...d.dias].sort((a, b) => a - b);
          const menor = Math.min(...ord.map((x, i) => ((ord[(i + 1) % ord.length] - x + 7) % 7) || 7));
          if (d.prazoDias >= menor) return { prazoDias: `Com esses dias, o prazo precisa ser menor que ${menor} dia(s), senão um check-in encavala no outro.` };
        }
        return {};
      },
      salvar: async (d) => {
        const prog = { ...d, ativo: true, pausado: false, ultimoSlot: atual.ultimoSlot || null };
        // Não manda na hora um envio "atrasado" de hoje que já passou: começa no próximo.
        const devido = C().ultimoEnvioDevido(prog, new Date());
        if (devido && !atual.ativo) prog.ultimoSlot = C().isoLocal(devido);
        await store.update('pessoas', pessoa.id, { checkinProgramado: prog });
        await store.create('interacoes', {
          pessoaId: pessoa.id, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
          descricao: `Envio automático de check-in programado: ${C().descreverProgramacao(prog)}.`,
        });
        ui.toast('Envio automático programado.');
      },
    });
    const form = dialog.querySelector('form');
    const atualizar = () => {
      const modo = form.elements.modo.value;
      form.querySelectorAll('[data-modo]').forEach((el) => { el.hidden = el.dataset.modo !== modo; });
      const d = {
        modo, dias: [...form.querySelectorAll('[name="dia"]:checked')].map((x) => Number(x.value)),
        intervaloDias: Number(form.elements.intervaloDias.value), hora: form.elements.hora.value || '09:00', inicio: form.elements.inicio.value || hoje,
      };
      const prox = C().proximosEnvios(d, new Date(), 5);
      form.querySelector('[data-previa-datas]').innerHTML = prox.length
        ? `<p class="small"><strong>Próximos envios:</strong> ${prox.map((x) => `${DIAS[x.getDay()]} ${U().data(x).slice(0, 5)} às ${U().hora(x)}`).join(' · ')}</p>` : '';
    };
    form.addEventListener('change', atualizar);
    form.addEventListener('input', atualizar);
    atualizar();
  }

  // ---------------- Leitura ----------------
  /** Colunas do mapa: perguntas que aparecem nos check-ins, na ordem do mais recente. */
  function colunas(respondidos) {
    const vistas = new Map();
    [...respondidos].sort((a, b) => b.respondidoEm.localeCompare(a.respondidoEm))
      .forEach((ck) => (ck.perguntas || []).forEach((p) => { if (!vistas.has(p.id)) vistas.set(p.id, p); }));
    return [...vistas.values()];
  }

  function celula(p, ck) {
    const pergunta = (ck.perguntas || []).find((x) => x.id === p.id);
    const r = ck.respostas?.[p.id];
    if (!pergunta) return '<td class="hm-vazio" aria-label="não perguntado"></td>';
    if (!r) return '<td class="hm-vazio">–</td>';
    const titulo = `${p.titulo}: ${C().textoResposta(pergunta, r)}${r.explicacao ? ` — "${r.explicacao}"` : ''}`;
    const ctx = { pesoKg: C().pesoDe(ck.perguntas, ck.respostas) };
    if (p.tipo === 'numero') {
      const n = r.pulou ? null : C().nota(pergunta, r.valor, ctx);
      const classe = n === null ? 'hm-num' : `hm-num hm-${C().faixa(n)}`;
      return `<td class="${classe}" title="${esc(titulo)}">${r.pulou ? '—' : esc(Number(r.valor).toLocaleString('pt-BR', { maximumFractionDigits: pergunta.casas ?? 1 }))}</td>`;
    }
    if (p.tipo === 'texto') return `<td class="hm-vazio" title="${esc(titulo)}">💬</td>`;
    const f = C().faixa(C().nota(pergunta, r.valor, ctx));
    return `<td class="hm-${f}" title="${esc(titulo)}">${C().EMOJI_FAIXA[f]}${r.explicacao ? '<sup>✎</sup>' : ''}</td>`;
  }

  function aba(c) {
    const { ui } = NutriDudu;
    const cfgProg = c.checkinCfg;
    const lista = c.checkins || [];
    const agora = new Date();
    const respondidos = lista.filter((x) => x.respondidoEm).sort((a, b) => b.respondidoEm.localeCompare(a.respondidoEm));
    const abertos = lista.filter((x) => !x.respondidoEm && !x.cancelado).sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm));
    const cols = colunas(respondidos);
    const ult = respondidos[0];
    const media = respondidos.slice(0, 4).filter((x) => x.score !== null);
    const mediaScore = media.length ? Math.round(media.reduce((t, x) => t + x.score, 0) / media.length) : null;
    const pesos = respondidos.filter((x) => x.respostas?.q_peso && !x.respostas.q_peso.pulou).map((x) => Number(x.respostas.q_peso.valor));
    const variacao = pesos.length >= 2 ? pesos[0] - pesos[pesos.length - 1] : null;
    const enviados = lista.filter((x) => !x.cancelado && (x.respondidoEm || C().situacao(x, agora) !== 'pendente')).length;
    const taxa = enviados ? Math.round((respondidos.length / enviados) * 100) : null;
    const corScore = (s) => `ck-score ck-score-${C().corScore(s)}`;

    const tabela = respondidos.length ? `
      <div class="tabela-rolagem hm-rolagem"><table class="hm">
        <thead><tr><th class="hm-fixa">Check-ins (${respondidos.length})</th>
          ${cols.map((p) => `<th><button type="button" class="hm-col" data-ck-grafico="${esc(p.id)}" title="${esc(p.titulo)} — ver evolução"><span aria-hidden="true">${esc(p.icone || '•')}</span>${esc(p.sigla || p.titulo.slice(0, 3))}</button></th>`).join('')}
          <th><button type="button" class="hm-col" data-ck-grafico="__score" title="Nota geral — ver evolução"><span aria-hidden="true">📈</span>Nota</button></th><th>Revisão</th></tr></thead>
        <tbody>${respondidos.map((ck) => `<tr>
          <th class="hm-fixa"><button type="button" class="link-botao" data-ck-ver="${esc(ck.id)}">${U().data(ck.respondidoEm)}</button><span class="muted small bloco">${esc(ck.titulo)}</span></th>
          ${cols.map((p) => celula(p, ck)).join('')}
          <td><span class="${corScore(ck.score)}">${ck.score ?? '—'}${ck.score !== null ? '%' : ''}</span></td>
          <td>${ck.revisadoEm ? ui.badge('Revisado', 'sucesso') : `<button type="button" class="btn btn-pequeno" data-ck-ver="${esc(ck.id)}">Revisar</button>`}</td>
        </tr>`).join('')}</tbody></table></div>
      <p class="muted small">Toque numa data para ver as respostas, ou no ícone de uma coluna para ver a evolução daquela pergunta. ✎ = o paciente explicou a resposta.</p>`
      : '<p class="muted">Nenhum check-in respondido ainda.</p>';

    return `
      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Check-ins de acompanhamento</h2>
          <button type="button" class="btn btn-primary btn-pequeno" data-ck-enviar>+ Enviar check-in</button>
        </div>
        ${blocoProgramacao(c, cfgProg)}
        <div class="ck-kpis">
          <div><span class="muted small">Última nota</span><strong class="${ult ? corScore(ult.score) : ''}">${ult?.score ?? '—'}${ult?.score != null ? '%' : ''}</strong></div>
          <div><span class="muted small">Média (últimos 4)</span><strong>${mediaScore ?? '—'}${mediaScore !== null ? '%' : ''}</strong></div>
          <div><span class="muted small">Taxa de resposta</span><strong>${taxa ?? '—'}${taxa !== null ? '%' : ''}</strong></div>
          <div><span class="muted small">Peso no período</span><strong>${variacao === null ? '—' : `${variacao > 0 ? '+' : ''}${variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`}</strong></div>
        </div>
        ${abertos.length ? `<div class="ck-abertos"><h3 class="small">Aguardando resposta</h3><ul>${abertos.map((ck) => {
          const sit = C().situacao(ck, agora);
          return `<li><span>${esc(ck.titulo)} · enviado ${U().data(ck.enviadoEm)} · ${sit === 'expirado' ? ui.badge('Prazo vencido', 'perigo') : `prazo ${U().data(ck.prazo)}`}</span>
            <span class="acoes-linha sem-margem">${sit !== 'expirado' ? `<button type="button" class="btn btn-pequeno" data-ck-reenviar="${esc(ck.id)}">Enviar de novo</button>` : ''}<button type="button" class="btn btn-pequeno btn-texto-perigo" data-ck-cancelar="${esc(ck.id)}">Cancelar</button></span></li>`;
        }).join('')}</ul></div>` : ''}
        ${tabela}
      </section>`;
  }

  // ---------------- Gráfico ----------------
  function grafico(perguntaId, checkins) {
    const { modal } = NutriDudu;
    const resp = checkins.filter((x) => x.respondidoEm).sort((a, b) => a.respondidoEm.localeCompare(b.respondidoEm));
    let titulo; let subtitulo = ''; let pontos; let numerico = true; let unidade = '';
    if (perguntaId === '__score') {
      titulo = '📈 Nota geral dos check-ins';
      pontos = resp.filter((x) => x.score !== null).map((x) => ({ d: x.respondidoEm, v: x.score }));
      unidade = '%';
    } else {
      const p = resp.flatMap((x) => x.perguntas || []).find((x) => x.id === perguntaId);
      titulo = `${p?.icone || ''} ${p?.titulo || ''}`; subtitulo = p?.texto || '';
      numerico = p?.tipo === 'numero'; unidade = p?.unidade || '';
      pontos = resp.map((x) => {
        const pq = (x.perguntas || []).find((y) => y.id === perguntaId);
        const r = x.respostas?.[perguntaId];
        if (!pq || !r || r.pulou) return null;
        const v = numerico ? Number(r.valor) : C().nota(pq, r.valor);
        return v === null || !Number.isFinite(v) ? null : { d: x.respondidoEm, v, rotulo: C().textoResposta(pq, r) };
      }).filter(Boolean);
    }
    const W = 640; const H = 260; const PL = numerico ? 52 : 40; const PR = 16; const PT = 16; const PB = 34;
    let min; let max;
    if (numerico) {
      min = Math.min(...pontos.map((p) => p.v)); max = Math.max(...pontos.map((p) => p.v));
      const folga = (max - min) * 0.15 || Math.max(1, Math.abs(max) * 0.02);
      min -= folga; max += folga;
      if (perguntaId === '__score') { min = Math.max(0, min); max = Math.min(100, max); }
    } else { min = -2.3; max = 2.3; }
    const x = (i) => PL + (pontos.length <= 1 ? (W - PL - PR) / 2 : (i * (W - PL - PR)) / (pontos.length - 1));
    const y = (v) => PT + (1 - (v - min) / (max - min || 1)) * (H - PT - PB);
    const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const linhasY = numerico ? [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3) : [2, 1, 0, -1, -2];
    const eixoY = linhasY.map((v) => `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" class="gr-grade"/>
      <text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end" class="gr-eixo">${numerico ? `${fmt(v)}${unidade === '%' ? '%' : ''}` : C().EMOJI_FAIXA[C().faixa(v)]}</text>`).join('');
    const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = pontos.length > 1 ? `${caminho} L${x(pontos.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z` : '';
    const passoRot = Math.ceil(pontos.length / 8);
    const svg = pontos.length ? `
      <svg viewBox="0 0 ${W} ${H}" class="gr" role="img" aria-label="Evolução de ${esc(titulo)}">
        ${eixoY}
        ${area ? `<path d="${area}" class="gr-area"/>` : ''}
        <path d="${caminho}" class="gr-linha"/>
        ${pontos.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4.5" class="gr-ponto"><title>${U().data(p.d)}: ${esc(p.rotulo || `${fmt(p.v)} ${unidade}`)}</title></circle>
          ${i % passoRot === 0 || i === pontos.length - 1 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="gr-eixo">${U().data(p.d).slice(0, 5)}</text>` : ''}`).join('')}
      </svg>` : '<p class="muted">Ainda não há respostas para essa pergunta.</p>';
    modal.painel({ titulo, corpo: `${subtitulo ? `<p class="muted small">${esc(subtitulo)}</p>` : ''}${svg}` });
  }

  // ---------------- Ver respostas e revisar ----------------
  function ver(ck, aoMudar) {
    const { modal, store, permissoes, ui } = NutriDudu;
    const ctx = { pesoKg: C().pesoDe(ck.perguntas, ck.respostas) };
    const linhas = (ck.perguntas || []).map((p) => {
      const r = ck.respostas?.[p.id];
      const n = r && !r.pulou ? C().nota(p, r.valor, ctx) : null;
      const m = C().metaDe(p, ctx);
      const metaTxt = m?.tipo === 'porPeso' ? ` <span class="muted small">(meta ${String(m.alvo).replace('.', ',')} L${m.pelaPeso ? ' pelo peso' : ''})</span>` : m?.tipo === 'faixa' ? ` <span class="muted small">(ideal ${m.min} a ${m.max} ${esc(p.unidade || '')})</span>` : '';
      const f = C().faixa(n);
      return `<li class="ck-resp">
        <span class="ck-resp-ico" aria-hidden="true">${esc(p.icone || '•')}</span>
        <div><strong>${esc(p.titulo)}</strong><span class="muted small bloco">${esc(p.texto)}</span>
          <span class="${f ? `ck-f-${f}` : ''}">${esc(C().textoResposta(p, r))}</span>${metaTxt}
          ${r?.explicacao ? `<blockquote class="ck-msg">${esc(r.explicacao)}</blockquote>` : ''}</div>
        ${f ? `<span class="ck-resp-emo" title="${esc(C().rotuloResposta(p, r?.valor, ctx))}">${C().EMOJI_FAIXA[f]}</span>` : ''}
      </li>`;
    }).join('');
    modal.painel({
      titulo: `${ck.titulo} · ${U().data(ck.respondidoEm)}`,
      corpo: `<p>Nota: <span class="ck-score ck-score-${C().corScore(ck.score)}">${ck.score ?? '—'}${ck.score !== null ? '%' : ''}</span>
        ${ck.revisadoEm ? ` · <span class="muted small">revisado em ${U().data(ck.revisadoEm)}</span>` : ''}</p><ul class="ck-resps">${linhas}</ul>`,
      acoes: ck.revisadoEm ? [] : [{
        texto: 'Marcar como revisado', classe: 'btn-primary',
        aoClicar: async () => {
          await store.update('checkins', ck.id, { revisadoEm: new Date().toISOString(), revisadoPor: permissoes.atual() });
          ui.toast('Check-in revisado.');
          aoMudar?.();
        },
      }],
    });
  }

  function ligar(raiz, c) {
    const { store, modal, ui } = NutriDudu;
    const lista = c.checkins || [];
    const achar = (id) => lista.find((x) => x.id === id);
    raiz.querySelector('[data-ck-enviar]')?.addEventListener('click', () => enviar(c.pessoa));
    raiz.querySelector('[data-ck-programar]')?.addEventListener('click', () => programar(c.pessoa));
    raiz.querySelector('[data-ck-pausar]')?.addEventListener('click', async () => {
      const prog = c.pessoa.checkinProgramado;
      await store.update('pessoas', c.pessoa.id, { checkinProgramado: { ...prog, pausado: !prog.pausado } });
      ui.toast(prog.pausado ? 'Envio automático retomado.' : 'Envio automático pausado.');
    });
    raiz.querySelector('[data-ck-parar]')?.addEventListener('click', async () => {
      const ok = await modal.confirmar({ titulo: 'Desligar o envio automático?', mensagem: 'Os check-ins já enviados continuam valendo. Dá para programar de novo quando quiser.', textoConfirmar: 'Desligar', perigo: true });
      if (!ok) return;
      await store.update('pessoas', c.pessoa.id, { checkinProgramado: { ...c.pessoa.checkinProgramado, ativo: false } });
      ui.toast('Envio automático desligado.');
    });
    raiz.querySelectorAll('[data-ck-ver]').forEach((b) => b.addEventListener('click', () => ver(achar(b.dataset.ckVer), () => NutriDudu.recarregarPagina())));
    raiz.querySelectorAll('[data-ck-grafico]').forEach((b) => b.addEventListener('click', () => grafico(b.dataset.ckGrafico, lista)));
    raiz.querySelectorAll('[data-ck-reenviar]').forEach((b) => b.addEventListener('click', async () => {
      const conversa = (await store.list('conversas', (x) => x.pessoaId === c.pessoa.id))[0];
      painelEnvio(c.pessoa, achar(b.dataset.ckReenviar), conversa);
    }));
    raiz.querySelectorAll('[data-ck-cancelar]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await modal.confirmar({ titulo: 'Cancelar este check-in?', mensagem: 'O link deixa de funcionar para o paciente.', textoConfirmar: 'Cancelar check-in', perigo: true });
      if (!ok) return;
      await store.update('checkins', b.dataset.ckCancelar, { cancelado: true, canceladoEm: new Date().toISOString() });
      ui.toast('Check-in cancelado.');
    }));
  }

  return { aba, ligar, enviar, programar, ver, grafico, painelEnvio, linkDe };
})();
