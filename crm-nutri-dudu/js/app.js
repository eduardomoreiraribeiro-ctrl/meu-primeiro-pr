// Inicialização: navegação entre páginas (pelo endereço #/...), busca global,
// menu "+ Novo", seletor de perfil e restauração dos dados de exemplo.
(function () {
  const { store, ui, utils, config, permissoes, pages } = NutriDudu;

  const ROTAS = [
    { padrao: /^\/$/, pagina: 'dashboard', menu: 'dashboard' },
    { padrao: /^\/agenda$/, pagina: 'agenda', menu: 'agenda' },
    { padrao: /^\/kanban$/, redirecionar: '/kanban/comercial' },
    { padrao: /^\/kanban\/(comercial|acompanhamento)$/, pagina: 'kanban', menu: 'kanban', params: ['funil'] },
    { padrao: /^\/clientes$/, pagina: 'clientes', menu: 'clientes' },
    { padrao: /^\/clientes\/([^/]+)$/, pagina: 'cliente', menu: 'clientes', params: ['id'] },
    { padrao: /^\/conversas$/, pagina: 'conversas', menu: 'conversas' },
    { padrao: /^\/servicos$/, pagina: 'servicos', menu: 'servicos' },
    { padrao: /^\/configuracoes$/, pagina: 'configuracoes', menu: 'configuracoes' },
  ];

  // Em que fase cada item do "+ Novo" fica pronto (seção 16 do planejamento).
  const FASE_DO_NOVO = {
    lead: ['Cadastro de lead', 3],
    cliente: ['Cadastro de cliente', 3],
    consulta: ['Agendamento de consulta', 4],
    pagamento: ['Lançamento de pagamento', '5b'],
    pacote: ['Contratação de pacote', '5b'],
  };

  const view = document.getElementById('view');
  let renderAtual = 0;

  function caminhoAtual() {
    const hash = location.hash.replace(/^#/, '');
    return hash || '/';
  }

  async function renderizar() {
    const caminho = caminhoAtual();
    const rota = ROTAS.find((r) => r.padrao.test(caminho));

    if (rota?.redirecionar) {
      location.replace(`#${rota.redirecionar}`);
      return;
    }

    const execucao = ++renderAtual;
    marcarMenu(rota?.menu);

    if (!rota) {
      document.title = 'Página não encontrada · Nutri Dudu';
      view.innerHTML = `
        ${ui.cabecalho('Página não encontrada')}
        <div class="card"><p>Esse endereço não existe.</p><a class="btn" href="#/">Ir para o Dashboard</a></div>`;
      return;
    }

    const valores = caminho.match(rota.padrao).slice(1).map(decodeURIComponent);
    const params = Object.fromEntries((rota.params || []).map((nome, i) => [nome, valores[i]]));
    const pagina = pages[rota.pagina];

    // Renderiza fora da tela e só troca se ninguém navegou nesse meio-tempo.
    const destino = document.createElement('div');
    try {
      await pagina.render(destino, params);
    } catch (erro) {
      console.error(erro);
      destino.innerHTML = `
        ${ui.cabecalho('Algo deu errado')}
        <div class="card"><p>Não foi possível abrir esta página. Tente recarregar.</p></div>`;
    }
    if (execucao !== renderAtual) return;

    view.replaceChildren(...destino.childNodes);
    const titulo = view.querySelector('h1')?.textContent || pagina.titulo;
    document.title = `${titulo} · Nutri Dudu`;
  }

  function marcarMenu(menu) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      const ativo = link.dataset.menu === menu;
      link.classList.toggle('ativo', ativo);
      if (ativo) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function navegar() {
    fecharMenus();
    renderizar().then(() => {
      window.scrollTo(0, 0);
      view.focus({ preventScroll: true });
    });
  }

  // ---------- Busca global ----------
  const busca = document.getElementById('busca-global');
  const resultados = document.getElementById('busca-resultados');

  async function buscar() {
    const termo = utils.normalizar(busca.value.trim());
    const digitos = utils.soDigitos(busca.value);
    if (termo.length < 2) {
      resultados.hidden = true;
      return;
    }

    const encontrados = (await store.list('pessoas', (p) =>
      utils.normalizar(p.nome).includes(termo) ||
      utils.normalizar(p.email).includes(termo) ||
      (digitos.length >= 3 && utils.soDigitos(p.telefone).includes(digitos))
    )).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 6);

    resultados.innerHTML = encontrados.length
      ? encontrados.map((p) => `
          <a href="#/clientes/${encodeURIComponent(p.id)}" class="search-item">
            <strong>${utils.escapeHtml(p.nome)}</strong>
            <span class="muted small">${utils.escapeHtml(p.telefone)} · ${utils.escapeHtml(config.STATUS_PESSOA[p.status] || '')}</span>
          </a>`).join('')
      : '<p class="search-vazio muted small">Ninguém encontrado.</p>';
    resultados.hidden = false;
  }

  busca.addEventListener('input', buscar);
  busca.addEventListener('focus', buscar);
  busca.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      busca.value = '';
      resultados.hidden = true;
    } else if (e.key === 'Enter') {
      const primeiro = resultados.querySelector('a');
      if (primeiro) location.hash = primeiro.getAttribute('href');
    }
  });
  resultados.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      busca.value = '';
      resultados.hidden = true;
    }
  });

  // ---------- Menu "+ Novo" ----------
  const btnNovo = document.getElementById('btn-novo');
  const menuNovo = document.getElementById('menu-novo');

  function fecharMenus() {
    menuNovo.hidden = true;
    btnNovo.setAttribute('aria-expanded', 'false');
    resultados.hidden = true;
  }

  btnNovo.addEventListener('click', () => {
    const abrir = menuNovo.hidden;
    menuNovo.hidden = !abrir;
    btnNovo.setAttribute('aria-expanded', String(abrir));
  });

  menuNovo.addEventListener('click', (e) => {
    const item = e.target.closest('[data-novo]');
    if (!item) return;
    const [nome, fase] = FASE_DO_NOVO[item.dataset.novo];
    fecharMenus();
    ui.toast(`${nome} chega na fase ${fase}.`, 'info');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.new-menu')) {
      menuNovo.hidden = true;
      btnNovo.setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('.search')) resultados.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenus();
  });

  // ---------- Perfil simulado ----------
  const seletorPerfil = document.getElementById('perfil');
  seletorPerfil.innerHTML = Object.entries(config.PERFIS)
    .map(([id, nome]) => `<option value="${id}">${utils.escapeHtml(nome)}</option>`)
    .join('');
  seletorPerfil.value = permissoes.atual();
  seletorPerfil.addEventListener('change', () => permissoes.definir(seletorPerfil.value));

  const btnReset = document.getElementById('btn-reset');

  function aplicarPerfil() {
    document.body.dataset.perfil = permissoes.atual();
    btnReset.hidden = !permissoes.pode('gerenciarDados');
  }

  permissoes.aoMudar(() => {
    aplicarPerfil();
    renderizar();
    ui.toast(`Vendo como ${config.PERFIS[permissoes.atual()]}.`, 'info');
  });

  // ---------- Dados de exemplo ----------
  btnReset.addEventListener('click', async () => {
    if (!permissoes.pode('gerenciarDados')) return;
    const ok = confirm('Apagar tudo o que foi alterado e voltar aos dados de exemplo?');
    if (!ok) return;
    await store.resetarParaExemplo();
    ui.toast('Dados de exemplo restaurados.');
  });

  store.subscribe(() => renderizar());

  window.addEventListener('hashchange', navegar);
  aplicarPerfil();
  renderizar();
})();
