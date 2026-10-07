// Kanban com os dois funis: comercial (leads) e acompanhamento (clientes).
// Cards arrastáveis (mouse e toque), filtros, contadores, somas por coluna e
// painel de resumo. As regras de cada movimento ficam em js/funil.js.
window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.kanban = (function () {
  const FILTROS_PADRAO = { busca: '', origem: '', objetivo: '', profissionalId: '', servicoId: '' };
  // Filtros de cada funil ficam guardados enquanto o sistema estiver aberto.
  const estado = { comercial: { ...FILTROS_PADRAO }, acompanhamento: { ...FILTROS_PADRAO } };
  const DIAS_PERDIDO_VISIVEL = 60;

  async function carregar() {
    const { store } = NutriDudu;
    const [pessoas, consultas, pacotes, lancamentos, servicos, profissionais, interacoes, geral] = await Promise.all([
      store.list('pessoas'),
      store.list('consultas', (c) => c.status !== 'cancelada'),
      store.list('pacotes'),
      store.list('lancamentos', (l) => l.status !== 'cancelado'),
      store.list('servicos'),
      store.list('profissionais'),
      store.list('interacoes'),
      store.get('configuracoes', 'geral'),
    ]);
    return { pessoas, consultas, pacotes, lancamentos, servicos, profissionais, interacoes, geral: geral || {} };
  }

  /** Uma linha por pessoa com tudo o que o card, os filtros e o painel precisam. */
  function montarLinhas(dados) {
    const { calculos, utils } = NutriDudu;
    const consultasDe = calculos.agruparPorPessoa(dados.consultas);
    const pacotesDe = calculos.agruparPorPessoa(dados.pacotes);
    const lancamentosDe = calculos.agruparPorPessoa(dados.lancamentos);
    const servico = Object.fromEntries(dados.servicos.map((s) => [s.id, s]));
    const prof = Object.fromEntries(dados.profissionais.map((p) => [p.id, p]));
    const pessoa = Object.fromEntries(dados.pessoas.map((p) => [p.id, p]));
    const agora = new Date();
    return dados.pessoas.map((p) => {
      const r = calculos.resumoPessoa(p, { consultas: consultasDe(p.id), pacotes: pacotesDe(p.id), lancamentos: lancamentosDe(p.id) }, dados.geral, agora);
      return {
        pessoa: p,
        resumo: r,
        interesse: servico[p.servicoInteresseId] || null,
        pacoteServico: r.pacote ? servico[r.pacote.servicoId] || null : null,
        profissional: prof[p.profissionalId] || null,
        indicadoPor: pessoa[p.indicadoPorId] || null,
        diasNaEtapa: Math.max(0, utils.diasEntre(p.etapaDesde || p.criadoEm, agora)),
        textoBusca: utils.normalizar(`${p.nome} ${p.email || ''} ${(p.tags || []).join(' ')}`),
        digitos: utils.soDigitos(p.telefone),
      };
    });
  }

  function filtrar(linhas, fl) {
    const { utils } = NutriDudu;
    const termo = utils.normalizar(fl.busca.trim());
    const digitos = utils.soDigitos(fl.busca);
    return linhas.filter((l) => {
      const p = l.pessoa;
      if (termo && !l.textoBusca.includes(termo) && !(digitos.length >= 3 && l.digitos.includes(digitos))) return false;
      if (fl.origem && p.origem !== fl.origem) return false;
      if (fl.objetivo && p.objetivo !== fl.objetivo) return false;
      if (fl.profissionalId && p.profissionalId !== fl.profissionalId) return false;
      if (fl.servicoId && p.servicoInteresseId !== fl.servicoId && l.resumo.pacote?.servicoId !== fl.servicoId) return false;
      return true;
    });
  }

  // ---------------- Cards ----------------

  /** Bolinha de tempo na etapa (comercial): verde até 2 dias, amarela até 6, vermelha a partir de 7. */
  function tempoNaEtapa(dias) {
    const { utils } = NutriDudu;
    const nivel = dias >= 7 ? 'perigo' : dias >= 3 ? 'alerta' : 'ok';
    return `<span class="tempo-etapa tempo-${nivel}" title="${utils.dias(dias)} nesta etapa">● ${dias ? utils.dias(dias) : 'hoje'}</span>`;
  }

  function proximaHtml(r) {
    const { utils } = NutriDudu;
    if (!r.proxima) return '';
    const d = new Date(r.proxima.inicio);
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    return `<span class="small">📅 ${dia} ${utils.data(r.proxima.inicio).slice(0, 5)} ${utils.hora(r.proxima.inicio)}${r.proxima.agendadaPor === 'agente' ? ' 🤖' : ''}</span>`;
  }

  function cardComercial(l, { fechado = false } = {}) {
    const { utils, config } = NutriDudu;
    const p = l.pessoa;
    const perdido = p.etapa === 'perdido';
    const origem = config.ORIGENS[p.origem] || '';
    return `
      <article class="kanban-card${fechado ? ' kanban-card-fechado' : ''}" data-pessoa="${p.id}"${fechado ? '' : ' data-arrastavel'} tabindex="0"
        aria-label="${utils.escapeHtml(p.nome)}. Abrir resumo${fechado ? '' : ' ou arrastar para outra etapa'}.">
        <div class="kanban-card-topo">
          <strong>${utils.escapeHtml(p.nome)}</strong>
          ${fechado ? '<span class="small muted">✓ cliente</span>' : perdido ? '' : tempoNaEtapa(l.diasNaEtapa)}
        </div>
        <span class="muted small">${utils.escapeHtml([config.OBJETIVOS[p.objetivo], origem].filter(Boolean).join(' · '))}${l.indicadoPor ? ` (por ${utils.escapeHtml(l.indicadoPor.nome.split(' ')[0])})` : ''}</span>
        ${l.interesse ? `<span class="small">${utils.escapeHtml(l.interesse.nome)} · ${utils.moeda(l.interesse.valor)}</span>` : ''}
        ${perdido && p.motivoPerda ? `<span class="small texto-perigo">✕ ${utils.escapeHtml(p.motivoPerda)}</span>` : ''}
        ${fechado ? `<span class="small muted">Fechou em ${utils.data(p.clienteDesde)}</span>` : proximaHtml(l.resumo)}
      </article>`;
  }

  function cardAcompanhamento(l, { variosProfissionais }) {
    const { utils } = NutriDudu;
    const p = l.pessoa;
    const r = l.resumo;
    const pac = r.pacote;
    const pct = pac ? Math.round((pac.usadas / pac.total) * 100) : 0;
    const pctReservado = pac ? Math.round((pac.reservadas / pac.total) * 100) : 0;
    return `
      <article class="kanban-card" data-pessoa="${p.id}" data-arrastavel tabindex="0"
        aria-label="${utils.escapeHtml(p.nome)}. Abrir resumo ou arrastar para outra etapa.">
        <div class="kanban-card-topo">
          <strong>${utils.escapeHtml(p.nome)}</strong>
          ${variosProfissionais && l.profissional ? `<span class="com-ponto small" title="${utils.escapeHtml(l.profissional.nome)}"><span class="ponto" style="background:${utils.escapeHtml(l.profissional.cor)}"></span>${utils.escapeHtml(utils.iniciais(l.profissional.nome))}</span>` : ''}
        </div>
        ${pac ? `
          <span class="small">${utils.escapeHtml(l.pacoteServico?.nome || 'Pacote')} · ${pac.usadas} de ${pac.total}</span>
          <span class="barra-pacote barra-mini" aria-hidden="true"><span class="usado" style="width:${pct}%"></span><span class="reservado" style="width:${pctReservado}%"></span></span>`
        : ''}
        <span class="small ${r.semRetorno ? 'texto-alerta' : 'muted'}">${r.ultima ? `Última consulta: ${utils.haDias(r.diasSemConsulta)}${r.semRetorno ? '&nbsp;⚠' : ''}` : 'Ainda sem consulta realizada'}</span>
        ${proximaHtml(r)}
        ${p.etapa === 'encerrado' && p.motivoEncerramento ? `<span class="small muted">${utils.escapeHtml(p.motivoEncerramento)}</span>` : ''}
        <div class="kanban-card-rodape">
          ${r.emAberto > 0 ? `<span class="small sem-quebra ${r.atrasado > 0 ? 'texto-perigo' : ''}">${utils.moeda(r.emAberto)} ${r.atrasado > 0 ? 'atrasado' : 'em aberto'}</span>` : '<span></span>'}
          <a class="link-whatsapp small" href="https://wa.me/55${utils.soDigitos(p.telefone)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${utils.escapeHtml(p.nome)}">WhatsApp</a>
        </div>
      </article>`;
  }

  // ---------------- Quadro ----------------

  function quadro(funilId, linhas, opcoes) {
    const { config, utils, funil } = NutriDudu;
    const agora = new Date();
    return config.FUNIS[funilId].etapas.map((etapa) => {
      let itens = linhas.filter((l) => l.pessoa.funil === funilId && l.pessoa.etapa === etapa.id);
      let rodape = '';
      let cards;
      if (funilId === 'comercial' && etapa.id === 'fechado') {
        // Quem fechou continua visível aqui por 30 dias, esmaecido.
        const fechados = linhas.filter((l) => l.pessoa.clienteDesde && l.pessoa.funil === 'acompanhamento'
          && utils.diasEntre(l.pessoa.clienteDesde, agora) <= funil.DIAS_FECHADO_VISIVEL)
          .sort((a, b) => b.pessoa.clienteDesde.localeCompare(a.pessoa.clienteDesde));
        cards = [...itens.map((l) => cardComercial(l)), ...fechados.map((l) => cardComercial(l, { fechado: true }))];
        itens = [...itens, ...fechados];
        rodape = `<p class="kanban-dica">Fecharam nos últimos ${funil.DIAS_FECHADO_VISIVEL} dias. Arraste um lead para cá para fechar a venda.</p>`;
      } else {
        if (etapa.id === 'perdido') {
          const antigos = itens.filter((l) => l.diasNaEtapa > DIAS_PERDIDO_VISIVEL).length;
          itens = itens.filter((l) => l.diasNaEtapa <= DIAS_PERDIDO_VISIVEL);
          if (antigos) rodape = `<p class="kanban-dica">+ ${antigos} perdido(s) há mais de ${DIAS_PERDIDO_VISIVEL} dias (veja em Clientes › Leads).</p>`;
        }
        itens.sort((a, b) => (b.diasNaEtapa - a.diasNaEtapa) || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
        cards = itens.map((l) => (funilId === 'comercial' ? cardComercial(l) : cardAcompanhamento(l, opcoes)));
      }

      // Soma da coluna: valor em negociação (comercial) ou em aberto (acompanhamento).
      let soma = '';
      if (funilId === 'comercial' && !['fechado', 'perdido'].includes(etapa.id)) {
        const total = itens.reduce((t, l) => t + (l.interesse?.valor || 0), 0);
        if (total) soma = `<span class="kanban-soma" title="Soma do valor dos serviços de interesse">${utils.moeda(total)}</span>`;
      } else if (funilId === 'acompanhamento') {
        const total = itens.reduce((t, l) => t + l.resumo.emAberto, 0);
        if (total) soma = `<span class="kanban-soma" title="Total em aberto dos clientes desta etapa">${utils.moeda(total)} em aberto</span>`;
      }
      const vazio = funilId === 'comercial' && etapa.id === 'fechado'
        ? '' : (!cards.length ? '<p class="kanban-vazio">Arraste um card para cá</p>' : '');
      return `
        <section class="kanban-col" data-etapa="${etapa.id}" aria-label="${utils.escapeHtml(etapa.nome)}: ${itens.length}">
          <header class="kanban-col-header">
            <span>${utils.escapeHtml(etapa.nome)}</span>
            <span class="count">${itens.length}</span>
          </header>
          ${soma}
          <div class="kanban-cards">${cards.join('')}${vazio}</div>
          ${rodape}
        </section>`;
    }).join('');
  }

  // ---------------- Painel de resumo ----------------

  function abrirPainel(l, dados) {
    const { modal, utils, config, funil, ui } = NutriDudu;
    const p = l.pessoa;
    const r = l.resumo;
    const funilId = p.funil;
    const ultimas = dados.interacoes.filter((i) => i.pessoaId === p.id)
      .sort((a, b) => b.dataHora.localeCompare(a.dataHora)).slice(0, 3);
    const linha = (rotulo, valor) => (valor ? `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>` : '');
    const opcoes = config.FUNIS[funilId].etapas
      .map((e) => `<option value="${e.id}"${e.id === p.etapa ? ' selected' : ''}>${utils.escapeHtml(e.nome)}</option>`).join('');
    const corpo = `
      <div class="painel-kanban">
        <p>${ui.statusPessoa(p.status)} ${ui.badge(funil.nomeEtapa(funilId, p.etapa), 'neutro')} <span class="muted small">há ${utils.dias(l.diasNaEtapa)} nesta etapa</span></p>
        <dl class="lista-dados">
          ${linha('Telefone', utils.escapeHtml(p.telefone))}
          ${linha('Origem', `${utils.escapeHtml(config.ORIGENS[p.origem] || '—')}${l.indicadoPor ? ` (indicação de ${utils.escapeHtml(l.indicadoPor.nome)})` : ''}`)}
          ${linha('Objetivo', utils.escapeHtml(config.OBJETIVOS[p.objetivo] || ''))}
          ${p.status === 'lead' ? linha('Interesse', l.interesse ? `${utils.escapeHtml(l.interesse.nome)} · ${utils.moeda(l.interesse.valor)}` : '') : ''}
          ${linha('Pacote', r.pacote ? `${utils.escapeHtml(l.pacoteServico?.nome || 'Pacote')}: ${r.pacote.usadas} de ${r.pacote.total} usadas, vence ${utils.data(r.pacote.validade)}` : '')}
          ${linha('Última consulta', r.ultima ? `${utils.data(r.ultima.inicio)} (${utils.haDias(r.diasSemConsulta)})` : '')}
          ${linha('Próxima consulta', r.proxima ? `${utils.data(r.proxima.inicio)} às ${utils.hora(r.proxima.inicio)}` : '')}
          ${linha('Em aberto', r.emAberto > 0 ? `${utils.moeda(r.emAberto)}${r.atrasado > 0 ? ` (${utils.moeda(r.atrasado)} atrasado)` : ''}` : '')}
          ${linha('Motivo da perda', p.etapa === 'perdido' ? utils.escapeHtml(p.motivoPerda || '') : '')}
        </dl>
        ${ultimas.length ? `
          <h3 class="painel-subtitulo">Últimos registros</h3>
          <ul class="lista-simples small">${ultimas.map((i) => `<li><span class="muted">${utils.data(i.dataHora)}</span> ${utils.escapeHtml(i.descricao)}</li>`).join('')}</ul>` : ''}
        <div class="campo mover-para">
          <label for="mover-etapa">Mover para</label>
          <div class="linha-mover">
            <select id="mover-etapa" data-mover-etapa>${opcoes}</select>
            <button type="button" class="btn btn-pequeno" data-mover>Mover</button>
          </div>
        </div>
      </div>`;
    const acoes = [
      { texto: 'Abrir ficha', classe: 'btn-primary', aoClicar: () => { location.hash = `#/clientes/${encodeURIComponent(p.id)}`; } },
      { texto: 'Agendar', aoClicar: () => NutriDudu.agendamento.abrir({ pessoaId: p.id }) },
      { texto: 'WhatsApp', aoClicar: () => window.open(`https://wa.me/55${utils.soDigitos(p.telefone)}`, '_blank', 'noopener') },
    ];
    if (p.funil === 'comercial' && p.etapa !== 'perdido') acoes.splice(1, 0, { texto: 'Fechar venda', aoClicar: () => funil.fecharVenda(p) });
    const dialog = modal.painel({ titulo: p.nome, corpo, acoes });
    dialog.querySelector('[data-mover]').addEventListener('click', () => {
      const etapa = dialog.querySelector('[data-mover-etapa]').value;
      dialog.close();
      funil.soltar(p, etapa);
    });
  }

  // ---------------- Arrastar e soltar (mouse e toque) ----------------

  /**
   * Mouse: arrasta depois de mover alguns pixels.
   * Toque: segure o card por um instante (o deslizar normal continua rolando a tela).
   */
  function ligarArraste(board, aoSoltar) {
    const LIMIAR = 6;
    const ESPERA_TOQUE = 350;
    let atual = null;
    let ignorarClique = false;

    const colunaEm = (x, y) => document.elementFromPoint(x, y)?.closest('.kanban-col');

    function comecar() {
      const { card, x, y } = atual;
      atual.arrastando = true;
      const r = card.getBoundingClientRect();
      atual.dx = x - r.left;
      atual.dy = y - r.top;
      const fantasma = card.cloneNode(true);
      fantasma.classList.add('kanban-fantasma');
      fantasma.style.width = `${r.width}px`;
      fantasma.removeAttribute('tabindex');
      fantasma.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fantasma);
      atual.fantasma = fantasma;
      card.classList.add('arrastando');
      board.classList.add('com-arraste');
      board.setPointerCapture?.(atual.id);
      if (navigator.vibrate && atual.toque) navigator.vibrate(20);
      mover(x, y);
    }

    function mover(x, y) {
      atual.fantasma.style.transform = `translate(${x - atual.dx}px, ${y - atual.dy}px) rotate(2deg)`;
      const col = colunaEm(x, y);
      board.querySelectorAll('.kanban-col.alvo').forEach((c) => { if (c !== col) c.classList.remove('alvo'); });
      if (col && col.dataset.etapa !== atual.etapaOrigem) col.classList.add('alvo');
      // Rola o quadro quando o card chega perto das bordas.
      const r = board.getBoundingClientRect();
      const borda = 48;
      if (x < r.left + borda) board.scrollLeft -= 14;
      else if (x > r.right - borda) board.scrollLeft += 14;
    }

    function terminar(soltou, x, y) {
      clearTimeout(atual.timer);
      if (atual.arrastando) {
        atual.fantasma.remove();
        atual.card.classList.remove('arrastando');
        board.classList.remove('com-arraste');
        board.querySelectorAll('.kanban-col.alvo').forEach((c) => c.classList.remove('alvo'));
        ignorarClique = true;
        setTimeout(() => { ignorarClique = false; }, 0);
        if (soltou) {
          const col = colunaEm(x, y);
          if (col && col.dataset.etapa !== atual.etapaOrigem) aoSoltar(atual.card.dataset.pessoa, col.dataset.etapa);
        }
      }
      atual = null;
    }

    board.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.kanban-card[data-arrastavel]');
      if (!card || e.button !== 0 || e.target.closest('a')) return;
      atual = {
        card, x: e.clientX, y: e.clientY, id: e.pointerId, toque: e.pointerType !== 'mouse',
        etapaOrigem: card.closest('.kanban-col').dataset.etapa, arrastando: false,
      };
      if (atual.toque) atual.timer = setTimeout(() => { if (atual && !atual.arrastando) comecar(); }, ESPERA_TOQUE);
    });

    board.addEventListener('pointermove', (e) => {
      if (!atual || e.pointerId !== atual.id) return;
      const distancia = Math.hypot(e.clientX - atual.x, e.clientY - atual.y);
      if (!atual.arrastando) {
        if (atual.toque) {
          // Deslizou antes de segurar: é rolagem, não arraste.
          if (distancia > 10) { clearTimeout(atual.timer); atual = null; }
          return;
        }
        if (distancia < LIMIAR) return;
        atual.x = e.clientX; atual.y = e.clientY;
        comecar();
      }
      e.preventDefault();
      mover(e.clientX, e.clientY);
    });
    board.addEventListener('pointerup', (e) => { if (atual && e.pointerId === atual.id) terminar(true, e.clientX, e.clientY); });
    board.addEventListener('pointercancel', (e) => { if (atual && e.pointerId === atual.id) terminar(false); });
    // No toque, impede a página de rolar enquanto o card está sendo arrastado.
    board.addEventListener('touchmove', (e) => { if (atual?.arrastando) e.preventDefault(); }, { passive: false });
    // Segurar o card no celular não deve abrir o menu de contexto.
    board.addEventListener('contextmenu', (e) => { if (e.target.closest('.kanban-card[data-arrastavel]')) e.preventDefault(); });

    return { deveIgnorarClique: () => ignorarClique };
  }

  // ---------------- Página ----------------

  async function render(container, params) {
    const { ui, config, utils, funil } = NutriDudu;
    const funilId = params.funil;
    const fl = estado[funilId];
    const dados = await carregar();
    const todas = montarLinhas(dados);
    const linhaPorId = Object.fromEntries(todas.map((l) => [l.pessoa.id, l]));
    const ativos = dados.profissionais.filter((p) => p.ativo);
    const variosProfissionais = ativos.length > 1;
    const servicosFiltro = dados.servicos.filter((s) => s.ativo || s.categoria === 'pacote');

    const abas = Object.entries(config.FUNIS).map(([id, f]) => {
      const qtd = dados.pessoas.filter((p) => p.funil === id && !['perdido', 'encerrado', 'fechado'].includes(p.etapa)).length;
      return `<a href="#/kanban/${id}" class="aba${id === funilId ? ' ativa' : ''}"${id === funilId ? ' aria-current="page"' : ''}>${utils.escapeHtml(f.nome)} <span class="aba-contagem">${qtd}</span></a>`;
    }).join('');

    const extrasAtivos = ['origem', 'objetivo', 'servicoId', 'profissionalId'].filter((k) => fl[k]).length;
    const opcoes = (lista, valor, vazio) => `<option value="">${vazio}</option>${Object.entries(lista)
      .map(([id, nome]) => `<option value="${id}"${id === valor ? ' selected' : ''}>${utils.escapeHtml(nome)}</option>`).join('')}`;

    container.innerHTML = `
      <div class="kanban-pagina">
        ${ui.cabecalho('Kanban', funilId === 'comercial'
          ? 'Leads do primeiro contato até fechar (ou não). Arraste os cards entre as etapas.'
          : 'Clientes em acompanhamento. Os cards também andam sozinhos: retorno, renovação e início do tratamento.')}
        <div class="kanban-topo">
          <nav class="abas" aria-label="Funis">${abas}</nav>
          ${funilId === 'comercial' ? '<button type="button" class="btn btn-pequeno btn-primary" data-novo-lead>+ Novo lead</button>' : ''}
        </div>
        <div class="card filtros-clientes filtros-kanban" role="search">
          <input type="search" data-filtro="busca" value="${utils.escapeHtml(fl.busca)}" placeholder="Buscar por nome ou telefone" aria-label="Buscar no funil">
          <button type="button" class="btn btn-pequeno so-celular" data-mostrar-filtros aria-expanded="${extrasAtivos ? 'true' : 'false'}">Filtros${extrasAtivos ? ` (${extrasAtivos})` : ''}</button>
          <div class="filtros-extra${extrasAtivos ? ' aberto' : ''}" data-filtros-extra>
          <select data-filtro="origem" aria-label="Origem">${opcoes(config.ORIGENS, fl.origem, 'Todas as origens')}</select>
          <select data-filtro="objetivo" aria-label="Objetivo">${opcoes(config.OBJETIVOS, fl.objetivo, 'Todos os objetivos')}</select>
          <select data-filtro="servicoId" aria-label="Serviço ou pacote">${opcoes(Object.fromEntries(servicosFiltro.map((s) => [s.id, s.nome])), fl.servicoId, 'Todos os serviços')}</select>
          ${variosProfissionais ? `<select data-filtro="profissionalId" aria-label="Profissional">${opcoes(Object.fromEntries(ativos.map((p) => [p.id, p.nome])), fl.profissionalId, 'Todos os profissionais')}</select>` : ''}
          <button type="button" class="btn btn-pequeno" data-limpar>Limpar</button>
          </div>
        </div>
        <p class="muted small kanban-ajuda">Toque ou clique num card para ver o resumo. Para mover, arraste (no celular, segure o card antes) ou use "Mover para" no resumo.</p>
        <div class="kanban-board" data-board></div>
      </div>`;

    const board = container.querySelector('[data-board]');
    const atualizar = () => {
      const linhas = filtrar(todas, fl);
      board.innerHTML = quadro(funilId, linhas, { variosProfissionais });
    };

    container.querySelectorAll('[data-filtro]').forEach((el) => {
      el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
        fl[el.dataset.filtro] = el.value;
        atualizar();
      });
    });
    container.querySelector('[data-limpar]').addEventListener('click', () => {
      Object.assign(fl, FILTROS_PADRAO);
      NutriDudu.recarregarPagina();
    });
    container.querySelector('[data-mostrar-filtros]').addEventListener('click', (e) => {
      const extra = e.currentTarget.parentElement.querySelector('[data-filtros-extra]');
      extra.classList.toggle('aberto');
      e.currentTarget.setAttribute('aria-expanded', String(extra.classList.contains('aberto')));
    });
    container.querySelector('[data-novo-lead]')?.addEventListener('click', () => NutriDudu.cadastroPessoa.abrir({ tipo: 'lead' }));

    const arraste = ligarArraste(board, (pessoaId, etapa) => funil.soltar(linhaPorId[pessoaId]?.pessoa, etapa));
    board.addEventListener('click', (e) => {
      if (arraste.deveIgnorarClique() || e.target.closest('a')) return;
      const card = e.target.closest('.kanban-card');
      if (card) abrirPainel(linhaPorId[card.dataset.pessoa], dados);
    });
    board.addEventListener('keydown', (e) => {
      const card = e.target.closest?.('.kanban-card');
      if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault();
        abrirPainel(linhaPorId[card.dataset.pessoa], dados);
      }
    });
    atualizar();
  }

  return { titulo: 'Kanban', render, filtrar, montarLinhas };
})();
