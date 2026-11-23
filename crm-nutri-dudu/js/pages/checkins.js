// Página "Check-ins": acompanhamento de quem respondeu, questionários e banco de perguntas.
window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.checkins = (function () {
  const ABAS = { envios: 'Respostas', questionarios: 'Questionários', perguntas: 'Perguntas' };
  const estado = { aba: 'envios', filtro: 'todos' };
  const C = () => NutriDudu.checkin;
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');

  async function carregarCfg() {
    const doc = await NutriDudu.store.get('configuracoes', 'checkin');
    return { doc: doc || null, cfg: C().configuracao(doc || {}) };
  }

  /** Salva o documento "checkin" (só o que difere da biblioteca padrão fica guardado). */
  async function salvarCfg(doc, mudancas) {
    const { store } = NutriDudu;
    const novo = { ...(doc || {}), ...mudancas };
    if (doc) await store.update('configuracoes', 'checkin', mudancas);
    else await store.create('configuracoes', novo, { id: 'checkin' });
  }

  // ---------------- Respostas (todos os pacientes) ----------------
  function abaEnvios(lista, pessoaPor) {
    const { ui, utils } = NutriDudu;
    const agora = new Date();
    const programados = Object.values(pessoaPor).filter((p) => p.checkinProgramado?.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const comSit = lista.filter((x) => !x.cancelado).map((x) => ({ ...x, sit: C().situacao(x, agora) }))
      .sort((a, b) => (b.respondidoEm || b.enviadoEm).localeCompare(a.respondidoEm || a.enviadoEm));
    const filtros = {
      todos: ['Todos', comSit],
      revisar: ['A revisar', comSit.filter((x) => x.sit === 'respondido' && !x.revisadoEm)],
      pendente: ['Aguardando', comSit.filter((x) => x.sit === 'pendente')],
      expirado: ['Sem resposta', comSit.filter((x) => x.sit === 'expirado')],
    };
    const resp = comSit.filter((x) => x.sit === 'respondido');
    const finalizados = comSit.filter((x) => x.sit !== 'pendente');
    const taxa = finalizados.length ? Math.round((resp.length / finalizados.length) * 100) : null;
    const ult30 = resp.filter((x) => agora - new Date(x.respondidoEm) < 30 * 864e5 && x.score !== null);
    const media = ult30.length ? Math.round(ult30.reduce((t, x) => t + x.score, 0) / ult30.length) : null;
    const atencao = resp.filter((x) => x.score !== null && x.score < 55 && !x.revisadoEm).length;
    const SIT = { respondido: ['Respondido', 'sucesso'], pendente: ['Aguardando', 'info'], expirado: ['Sem resposta', 'perigo'] };
    const linhas = filtros[estado.filtro][1].map((x) => {
      const p = pessoaPor[x.pessoaId];
      const [rot, cor] = SIT[x.sit];
      return `<tr>
        <td>${p ? `<a href="#/clientes/${encodeURIComponent(p.id)}/checkins">${esc(p.nome)}</a>` : '—'}</td>
        <td>${esc(x.titulo)}</td>
        <td>${ui.badge(rot, cor)}${x.sit === 'respondido' && !x.revisadoEm ? ` ${ui.badge('A revisar', 'alerta')}` : ''}</td>
        <td>${utils.data(x.enviadoEm)}</td>
        <td>${x.respondidoEm ? utils.data(x.respondidoEm) : x.sit === 'pendente' ? `<span class="muted small">até ${utils.data(x.prazo)}</span>` : '—'}</td>
        <td>${x.score !== null && x.score !== undefined ? `<span class="ck-score ck-score-${C().corScore(x.score)}">${x.score}%</span>` : '—'}</td>
      </tr>`;
    }).join('');
    return `
      <section class="kpi-grid">
        ${ui.kpi('Taxa de resposta', taxa === null ? '—' : `${taxa}%`, `${resp.length} de ${finalizados.length} check-ins`)}
        ${ui.kpi('Nota média (30 dias)', media === null ? '—' : `${media}%`, `${ult30.length} respostas`)}
        ${ui.kpi('A revisar', String(filtros.revisar[1].length), 'respondidos e ainda não vistos')}
        ${ui.kpi('Pontos de atenção', String(atencao), 'nota abaixo de 55%')}
      </section>
      ${programados.length ? `<section class="card"><h2 class="card-title">⏱️ Envios automáticos (${programados.length})</h2>
        <div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Paciente</th><th>Programação</th><th>Próximo envio</th><th>Situação</th></tr></thead><tbody>
        ${programados.map((p) => {
          const prox = p.checkinProgramado.pausado ? null : C().proximosEnvios(p.checkinProgramado, agora, 1)[0];
          return `<tr><td><a href="#/clientes/${encodeURIComponent(p.id)}/checkins">${esc(p.nome)}</a></td><td class="small">${esc(C().descreverProgramacao(p.checkinProgramado))}</td>
            <td>${prox ? `${utils.data(prox)} ${utils.hora(prox)}` : '—'}</td><td>${p.checkinProgramado.pausado ? ui.badge('Pausado', 'alerta') : p.checkinProgramado.tentativa ? ui.badge('Falhou', 'perigo') : ui.badge('Ativo', 'sucesso')}</td></tr>`;
        }).join('')}</tbody></table></div></section>` : ''}
      <section class="card">
        <div class="acoes-linha" role="tablist">${Object.entries(filtros).map(([id, [rot, l]]) => `<button type="button" class="btn btn-pequeno${estado.filtro === id ? ' btn-primary' : ''}" data-filtro="${id}">${rot} (${l.length})</button>`).join('')}</div>
        ${linhas ? `<div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Paciente</th><th>Questionário</th><th>Situação</th><th>Enviado</th><th>Respondido</th><th>Nota</th></tr></thead><tbody>${linhas}</tbody></table></div>`
          : '<p class="muted">Nada por aqui. Para enviar um check-in, abra a ficha do paciente › aba <strong>Check-ins</strong> › <strong>Enviar check-in</strong>.</p>'}
      </section>`;
  }

  // ---------------- Questionários ----------------
  function abaQuestionarios(cfg, pode) {
    const porId = Object.fromEntries(cfg.perguntas.map((p) => [p.id, p]));
    return `
      <div class="ck-grade">
        ${cfg.questionarios.map((q) => {
          const itens = C().montarPerguntas(q, cfg.perguntas);
          return `<article class="card ck-quest${q.ativo === false ? ' ck-inativo' : ''}">
            <h3>${esc(q.titulo)}${q.ativo === false ? ' <span class="badge badge-neutro">Desativado</span>' : ''}</h3>
            <p class="muted small">${esc(q.descricao || '')}</p>
            <p class="ck-icones" aria-label="Perguntas">${itens.map((p) => `<span title="${esc(p.titulo)}">${esc(p.icone || '•')}</span>`).join('')}</p>
            <p class="small muted">${itens.length} perguntas · ${itens.filter((p) => C().nota(p, p.tipo === 'carinhas' ? 2 : p.tipo === 'opcoes' ? 0 : p.tipo === 'escala' ? p.max : null) !== null).length} pontuam</p>
            <div class="acoes-linha">
              <button type="button" class="btn btn-pequeno" data-previa="${esc(q.id)}">👁 Prévia</button>
              ${pode ? `<button type="button" class="btn btn-pequeno" data-editar-q="${esc(q.id)}">Editar</button>
              <button type="button" class="btn btn-pequeno" data-duplicar-q="${esc(q.id)}">Duplicar</button>` : ''}
            </div>
          </article>`;
        }).join('')}
        ${pode ? '<button type="button" class="card ck-novo" data-novo-q>+ Novo questionário</button>' : ''}
      </div>
      ${Object.keys(porId).length ? '' : ''}`;
  }

  function editarQuestionario(cfg, doc, q) {
    const { modal, form: f, ui } = NutriDudu;
    const novo = !q;
    q = q || { id: `qs_${Date.now().toString(36)}`, titulo: '', descricao: '', itens: [] };
    // Ordem de trabalho: as do questionário primeiro (na ordem), depois o resto da biblioteca.
    let itens = q.itens.map((i) => ({ ...i }));
    const ids = new Set(itens.map((i) => i.perguntaId));
    cfg.perguntas.filter((p) => p.ativa !== false && !ids.has(p.id)).forEach((p) => itens.push({ perguntaId: p.id, peso: C().PESO_PADRAO, ativo: false }));
    const porId = Object.fromEntries(cfg.perguntas.map((p) => [p.id, p]));
    itens = itens.filter((i) => porId[i.perguntaId]);
    const dialog = modal.formulario({
      titulo: novo ? 'Novo questionário' : `Editar: ${q.titulo}`,
      largo: true,
      textoSalvar: 'Salvar questionário',
      corpo: `
        ${f.texto('titulo', 'Nome', q.titulo, { obrigatorio: true, placeholder: 'Ex.: Check-in semanal' })}
        ${f.texto('descricao', 'Descrição (opcional)', q.descricao)}
        ${f.chave('ativoQ', 'Questionário ativo (aparece na hora de enviar)', q.ativo !== false)}
        <p class="small"><strong>Perguntas:</strong> marque as que entram, ajuste o <strong>peso</strong> (1 = pouco importante, 5 = muito) e a ordem. O peso conta na nota final.</p>
        <ul class="ck-itens" data-itens></ul>`,
      ler: (form) => ({
        titulo: f.valor(form, 'titulo'), descricao: f.valor(form, 'descricao'), ativo: f.marcado(form, 'ativoQ'),
        itens: [...form.querySelectorAll('[data-item]')].map((li) => ({
          perguntaId: li.dataset.item, ativo: li.querySelector('[data-inc]').checked, peso: Number(li.querySelector('[data-peso]').value) || C().PESO_PADRAO,
        })),
      }),
      validar: (d) => (!d.titulo ? { titulo: 'Dê um nome.' } : !d.itens.some((i) => i.ativo) ? { _geral: 'Marque pelo menos uma pergunta.' } : {}),
      salvar: async (d) => {
        const final = { ...q, titulo: d.titulo, descricao: d.descricao, ativo: d.ativo, itens: d.itens.filter((i) => i.ativo).map((i) => ({ ...i, ativo: true })) };
        const meus = (doc?.questionarios || []).filter((x) => x.id !== final.id);
        await salvarCfg(doc, { questionarios: [...meus, final] });
        ui.toast('Questionário salvo. Vale para os próximos envios.');
      },
    });
    const ul = dialog.querySelector('[data-itens]');
    const desenhar = () => {
      ul.innerHTML = itens.map((i, k) => {
        const p = porId[i.perguntaId];
        return `<li class="ck-item${i.ativo ? '' : ' ck-item-off'}" data-item="${esc(p.id)}">
          <input type="checkbox" data-inc ${i.ativo ? 'checked' : ''} aria-label="Incluir ${esc(p.titulo)}">
          <span class="ck-item-ico" aria-hidden="true">${esc(p.icone || '•')}</span>
          <span class="ck-item-tit"><strong>${esc(p.titulo)}</strong><span class="muted small bloco">${esc(C().TIPOS[p.tipo])}</span></span>
          <label class="small">Peso <select data-peso>${[1, 2, 3, 4, 5].map((n) => `<option${n === Number(i.peso) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <span class="ck-item-ord"><button type="button" class="btn btn-pequeno" data-sobe="${k}" aria-label="Subir" ${k ? '' : 'disabled'}>↑</button><button type="button" class="btn btn-pequeno" data-desce="${k}" aria-label="Descer" ${k < itens.length - 1 ? '' : 'disabled'}>↓</button></span>
        </li>`;
      }).join('');
    };
    const sincronizar = () => {
      ul.querySelectorAll('[data-item]').forEach((li, k) => { itens[k].ativo = li.querySelector('[data-inc]').checked; itens[k].peso = Number(li.querySelector('[data-peso]').value); });
    };
    ul.addEventListener('click', (e) => {
      const sobe = e.target.closest('[data-sobe]'); const desce = e.target.closest('[data-desce]');
      if (!sobe && !desce) return;
      sincronizar();
      const k = Number((sobe || desce).dataset.sobe ?? (sobe || desce).dataset.desce);
      const j = sobe ? k - 1 : k + 1;
      [itens[k], itens[j]] = [itens[j], itens[k]];
      desenhar();
    });
    ul.addEventListener('change', (e) => { if (e.target.matches('[data-inc]')) { sincronizar(); e.target.closest('li').classList.toggle('ck-item-off', !e.target.checked); } });
    desenhar();
  }

  function previa(cfg, q, nome) {
    const { modal } = NutriDudu;
    const d = modal.painel({ titulo: `Prévia: ${q.titulo}`, corpo: '<p class="muted small">É assim que o paciente vê (as respostas aqui não são salvas).</p><div data-previa-tela></div>' });
    NutriDudu.checkinTela.montar(d.querySelector('[data-previa-tela]'), {
      perguntas: C().montarPerguntas(q, cfg.perguntas), nome: 'Mariana', titulo: q.titulo,
      profissional: { nome: nome || 'Eduardo Ribeiro', foto: '../nutri/img/avatar.jpg' },
    });
  }

  // ---------------- Perguntas ----------------
  function abaPerguntas(cfg, pode) {
    const grupos = Object.entries(C().CATEGORIAS).map(([cat, nome]) => {
      const ps = cfg.perguntas.filter((p) => (p.categoria || 'bemestar') === cat);
      if (!ps.length) return '';
      return `<section class="card"><h2 class="card-title">${esc(nome)}</h2><ul class="ck-perguntas">${ps.map((p) => `
        <li class="${p.ativa === false ? 'ck-inativo' : ''}">
          <span class="ck-item-ico" aria-hidden="true">${esc(p.icone || '•')}</span>
          <span class="ck-item-tit"><strong>${esc(p.titulo)}</strong> <span class="badge badge-neutro">${esc(p.sigla || '')}</span>${p.ativa === false ? ' <span class="badge badge-neutro">Desativada</span>' : ''}
            <span class="muted small bloco">${esc(p.texto)}</span><span class="small bloco">${esc(C().TIPOS[p.tipo])}${p.explicacao?.ativo ? ' · pede explicação se a resposta for ruim' : ''}</span></span>
          <span class="acoes-linha sem-margem"><button type="button" class="btn btn-pequeno" data-ver-p="${esc(p.id)}">👁</button>${pode ? `<button type="button" class="btn btn-pequeno" data-editar-p="${esc(p.id)}">Editar</button>` : ''}</span>
        </li>`).join('')}</ul></section>`;
    }).join('');
    return `${pode ? '<div class="acoes-linha"><button type="button" class="btn btn-primary" data-nova-p>+ Nova pergunta</button></div>' : ''}${grupos}`;
  }

  function editarPergunta(cfg, doc, p) {
    const { modal, form: f, ui } = NutriDudu;
    const nova = !p;
    p = p || { id: `q_${Date.now().toString(36)}`, categoria: 'alimentacao', icone: '✨', sigla: '', titulo: '', texto: '', tipo: 'carinhas', explicacao: { ativo: false, texto: '' } };
    const opcoesTxt = (p.opcoes || []).map((o) => `${o.texto} | ${o.nota}`).join('\n');
    const rotulos = C().carinhasDe(p).map((c) => c.rotulo);
    const dialog = modal.formulario({
      titulo: nova ? 'Nova pergunta' : `Editar: ${p.titulo}`,
      largo: true,
      textoSalvar: 'Salvar pergunta',
      corpo: `
        <p class="muted small">Editar uma pergunta não muda os check-ins já enviados: eles guardam a versão da época.</p>
        <div class="grade-2">
          ${f.selecao('categoria', 'Categoria', C().CATEGORIAS, p.categoria)}
          <div class="grade-2">${f.texto('icone', 'Ícone (emoji)', p.icone, { atributos: 'maxlength="4"' })}${f.texto('sigla', 'Sigla', p.sigla, { atributos: 'maxlength="5"', placeholder: 'SONO' })}</div>
        </div>
        ${f.texto('titulo', 'Título', p.titulo, { obrigatorio: true, atributos: 'maxlength="30"', placeholder: 'Ex.: Qualidade do sono' })}
        ${f.areaTexto('texto', 'Pergunta', p.texto, { linhas: 2 })}
        ${f.selecao('tipo', 'Tipo de resposta', C().TIPOS, p.tipo)}
        <div data-tipo="carinhas"><p class="small">Rótulos das carinhas (de 😍 a 😞):</p><div class="grade-2">${rotulos.map((r, i) => f.texto(`rot${i}`, `${C().CARINHAS[i].emoji} (nota ${C().CARINHAS[i].nota > 0 ? '+' : ''}${C().CARINHAS[i].nota})`, r)).join('')}</div></div>
        <div data-tipo="opcoes">${f.areaTexto('opcoesTxt', 'Opções, uma por linha: texto | nota (de 2 a -2)', opcoesTxt, { linhas: 5, ajuda: 'Ex.: Não pulo refeições | 2' })}</div>
        <div data-tipo="escala" class="grade-2">
          ${f.texto('min', 'Menor número', p.min ?? 0, { tipo: 'number' })}${f.texto('max', 'Maior número', p.max ?? 10, { tipo: 'number' })}
          ${f.texto('rotuloMin', 'Rótulo do menor', p.rotuloMin || '')}${f.texto('rotuloMax', 'Rótulo do maior', p.rotuloMax || '')}
          ${f.chave('inverter', 'Número menor é melhor (ex.: refeições fora do plano)', Boolean(p.inverter))}
          ${f.texto('alvo', 'Meta: a partir de quanto já é ótimo (opcional)', p.alvo ?? '', { tipo: 'number', ajuda: 'Ex.: 3 treinos na semana já valem a nota máxima. Em branco: só o maior número é ótimo.' })}
        </div>
        <div data-tipo="numero"><div class="grade-2">${f.texto('unidade', 'Unidade', p.unidade || 'kg', { placeholder: 'kg, cm, km, h…' })}${f.selecao('casas', 'Casas decimais', { 0: '0', 1: '1', 2: '2' }, String(p.casas ?? 1))}</div>
          ${f.selecao('metaTipo', 'Meta (para dar nota)', { '': 'Sem meta (só registra e mostra no gráfico)', porPeso: 'Por peso: ml por kg (ex.: água)', faixa: 'Faixa ideal (ex.: horas de sono)' }, p.meta?.tipo || '')}
          <div data-meta="porPeso" class="grade-2">${f.texto('mlPorKg', 'ml por kg de peso', p.meta?.mlPorKg ?? 35, { tipo: 'number' })}${f.texto('metaPadrao', 'Meta sem peso informado (L)', p.meta?.padrao ?? 2.5, { tipo: 'number' })}</div>
          <div data-meta="faixa" class="grade-2">${f.texto('metaMin', 'Ideal: de', p.meta?.min ?? 7, { tipo: 'number' })}${f.texto('metaMax', 'até', p.meta?.max ?? 9, { tipo: 'number' })}</div></div>
        <div data-pontua>${f.chave('explicar', 'Pedir explicação quando a resposta for ruim', Boolean(p.explicacao?.ativo))}
          ${f.texto('explicacaoTexto', 'Texto do pedido de explicação', p.explicacao?.texto || '', { placeholder: 'Ex.: O que tem atrapalhado?' })}</div>
        ${nova ? '' : f.chave('ativa', 'Pergunta ativa', p.ativa !== false)}`,
      ler: (form) => {
        const tipo = f.valor(form, 'tipo');
        const d = {
          ...p, categoria: f.valor(form, 'categoria'), icone: f.valor(form, 'icone') || '•', sigla: f.valor(form, 'sigla').toUpperCase(),
          titulo: f.valor(form, 'titulo'), texto: f.valor(form, 'texto'), tipo,
          explicacao: { ...(p.explicacao || {}), ativo: f.marcado(form, 'explicar'), texto: f.valor(form, 'explicacaoTexto') },
          ativa: nova ? true : f.marcado(form, 'ativa'),
        };
        delete d.opcoes; delete d.rotulos; delete d.min; delete d.max; delete d.rotuloMin; delete d.rotuloMax; delete d.inverter; delete d.alvo; delete d.unidade; delete d.casas;
        if (tipo === 'carinhas') d.rotulos = [0, 1, 2, 3, 4].map((i) => f.valor(form, `rot${i}`) || C().CARINHAS[i].rotulo);
        if (tipo === 'opcoes') d.opcoes = f.valor(form, 'opcoesTxt').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const [texto, nota] = l.split('|').map((x) => x.trim());
          return { texto, nota: Math.max(-2, Math.min(2, Number(nota) || 0)) };
        });
        if (tipo === 'escala') Object.assign(d, { min: Number(f.valor(form, 'min')) || 0, max: Number(f.valor(form, 'max')) || 10, rotuloMin: f.valor(form, 'rotuloMin'), rotuloMax: f.valor(form, 'rotuloMax'), inverter: f.marcado(form, 'inverter'), alvo: f.valor(form, 'alvo') === '' ? null : Number(f.valor(form, 'alvo')) });
        if (tipo === 'numero') {
          Object.assign(d, { unidade: f.valor(form, 'unidade'), casas: Number(f.valor(form, 'casas')) });
          const mt = f.valor(form, 'metaTipo');
          const num = (n, pad) => { const v = Number(String(f.valor(form, n)).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : pad; };
          d.meta = mt === 'porPeso' ? { tipo: 'porPeso', mlPorKg: num('mlPorKg', 35), padrao: num('metaPadrao', 2.5) }
            : mt === 'faixa' ? { tipo: 'faixa', min: num('metaMin', 7), max: num('metaMax', 9) } : null;
        } else delete d.meta;
        return d;
      },
      validar: (d) => {
        const e = {};
        if (!d.titulo) e.titulo = 'Dê um título.';
        if (!d.texto) e.texto = 'Escreva a pergunta.';
        if (d.tipo === 'opcoes' && (d.opcoes || []).length < 2) e.opcoesTxt = 'Coloque pelo menos 2 opções.';
        if (d.tipo === 'escala' && !(d.max > d.min && d.max - d.min <= 10)) e.max = 'O maior número precisa ser maior que o menor (até 10 números de diferença).';
        return e;
      },
      salvar: async (d) => {
        const minhas = (doc?.perguntas || []).filter((x) => x.id !== d.id);
        await salvarCfg(doc, { perguntas: [...minhas, d] });
        ui.toast('Pergunta salva.');
      },
    });
    const form = dialog.querySelector('form');
    const atualizar = () => {
      const tipo = form.elements.tipo.value;
      form.querySelectorAll('[data-tipo]').forEach((el) => { el.hidden = el.dataset.tipo !== tipo; });
      const mt = form.elements.metaTipo.value;
      form.querySelectorAll('[data-meta]').forEach((el) => { el.hidden = el.dataset.meta !== mt; });
      form.querySelector('[data-pontua]').hidden = !(['carinhas', 'opcoes', 'escala'].includes(tipo) || (tipo === 'numero' && mt));
    };
    form.elements.tipo.addEventListener('change', atualizar);
    form.elements.metaTipo.addEventListener('change', atualizar);
    atualizar();
  }

  // ---------------- Página ----------------
  async function render(container) {
    const { store, ui, permissoes } = NutriDudu;
    if (!permissoes.pode('verClinico')) {
      container.innerHTML = `${ui.cabecalho('Check-ins')}<div class="card"><p>Seu perfil não tem acesso aos check-ins (dados de saúde).</p></div>`;
      return;
    }
    const [{ doc, cfg }, lista, pessoas, profissionais] = await Promise.all([carregarCfg(), store.list('checkins'), store.list('pessoas'), store.list('profissionais')]);
    const pode = permissoes.pode('configurarAgente') || permissoes.atual() === 'admin';
    const pessoaPor = Object.fromEntries(pessoas.map((p) => [p.id, p]));
    const revisar = lista.filter((x) => x.respondidoEm && !x.revisadoEm && !x.cancelado).length;
    const conteudo = { envios: () => abaEnvios(lista, pessoaPor), questionarios: () => abaQuestionarios(cfg, pode), perguntas: () => abaPerguntas(cfg, pode) }[estado.aba]();
    container.innerHTML = `<div class="ck-raiz">
      ${ui.cabecalho('Check-ins', 'Questionários de acompanhamento: o paciente responde pelo celular e você vê a evolução.')}
      <nav class="abas" aria-label="Seções">${Object.entries(ABAS).map(([id, nome]) => `<button type="button" class="aba${estado.aba === id ? ' ativa' : ''}" data-aba="${id}"${estado.aba === id ? ' aria-current="page"' : ''}>${nome}${id === 'envios' && revisar ? ` <span class="contador">${revisar}</span>` : ''}</button>`).join('')}</nav>
      <div class="ck-pagina">${conteudo}</div></div>`;
    const raiz = container.querySelector('.ck-raiz');

    const acharQ = (id) => cfg.questionarios.find((q) => q.id === id);
    const acharP = (id) => cfg.perguntas.find((p) => p.id === id);
    raiz.addEventListener('click', (e) => {
      const alvo = (s) => e.target.closest(s);
      if (alvo('[data-aba]')) { estado.aba = alvo('[data-aba]').dataset.aba; NutriDudu.recarregarPagina(); }
      else if (alvo('[data-filtro]')) { estado.filtro = alvo('[data-filtro]').dataset.filtro; NutriDudu.recarregarPagina(); }
      else if (alvo('[data-previa]')) previa(cfg, acharQ(alvo('[data-previa]').dataset.previa), profissionais[0]?.nome);
      else if (alvo('[data-editar-q]')) editarQuestionario(cfg, doc, acharQ(alvo('[data-editar-q]').dataset.editarQ));
      else if (alvo('[data-duplicar-q]')) {
        const q = acharQ(alvo('[data-duplicar-q]').dataset.duplicarQ);
        editarQuestionario(cfg, doc, { ...q, id: `qs_${Date.now().toString(36)}`, titulo: `${q.titulo} (cópia)` });
      }
      else if (alvo('[data-novo-q]')) editarQuestionario(cfg, doc, null);
      else if (alvo('[data-editar-p]')) editarPergunta(cfg, doc, acharP(alvo('[data-editar-p]').dataset.editarP));
      else if (alvo('[data-nova-p]')) editarPergunta(cfg, doc, null);
      else if (alvo('[data-ver-p]')) previa(cfg, { titulo: acharP(alvo('[data-ver-p]').dataset.verP).titulo, itens: [{ perguntaId: alvo('[data-ver-p]').dataset.verP, peso: 3, ativo: true }] }, profissionais[0]?.nome);
    });
  }

  return { titulo: 'Check-ins', render };
})();
