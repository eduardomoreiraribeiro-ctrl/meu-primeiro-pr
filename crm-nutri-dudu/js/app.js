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
    { padrao: /^\/clientes\/([^/]+)(?:\/([a-z]+))?$/, pagina: 'cliente', menu: 'clientes', params: ['id', 'aba'] },
    { padrao: /^\/conversas(?:\/([^/]+))?$/, pagina: 'conversas', menu: 'conversas', params: ['id'] },
    { padrao: /^\/servicos$/, pagina: 'servicos', menu: 'servicos' },
    { padrao: /^\/configuracoes$/, pagina: 'configuracoes', menu: 'configuracoes' },
  ];

  const view = document.getElementById('view');
  let renderAtual = 0;

  function caminhoAtual() {
    const hash = location.hash.replace(/^#/, '');
    return hash || '/';
  }

  // Na nuvem, nada é desenhado antes do login terminar.
  let pronto = false;

  async function renderizar() {
    if (!pronto) return;
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

    const valores = caminho.match(rota.padrao).slice(1).map((v) => (v === undefined ? undefined : decodeURIComponent(v)));
    const params = Object.fromEntries((rota.params || []).map((nome, i) => [nome, valores[i]]));
    const pagina = pages[rota.pagina];

    // Renderiza fora da tela e só troca se ninguém navegou nesse meio-tempo.
    const destino = document.createElement('div');
    try {
      // Movimentos automáticos do funil de acompanhamento (retorno, renovação…).
      await NutriDudu.funil.sincronizar();
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
    menuUsuario.hidden = true;
    btnUsuario.setAttribute('aria-expanded', 'false');
    resultados.hidden = true;
  }

  // ---------- Usuário logado (nuvem) ----------
  const btnUsuario = document.getElementById('btn-usuario');
  const menuUsuario = document.getElementById('menu-usuario');
  btnUsuario.addEventListener('click', () => {
    const abrir = menuUsuario.hidden;
    menuUsuario.hidden = !abrir;
    btnUsuario.setAttribute('aria-expanded', String(abrir));
  });
  menuUsuario.addEventListener('click', (e) => {
    const acao = e.target.closest('[data-usuario]')?.dataset.usuario;
    if (!acao) return;
    fecharMenus();
    if (acao === 'senha') NutriDudu.login.trocarSenha();
    if (acao === 'sair') NutriDudu.login.sair();
  });

  function mostrarUsuario(perfil) {
    document.getElementById('perfil-simulado').hidden = true;
    document.getElementById('usuario-menu').hidden = false;
    document.getElementById('usuario-iniciais').textContent = utils.iniciais(perfil.nome || perfil.email);
    document.getElementById('usuario-nome').textContent = (perfil.nome || perfil.email).split(' ').slice(0, 2).join(' ');
    document.getElementById('usuario-email').textContent = perfil.email;
    document.getElementById('usuario-papel').textContent = NutriDudu.login.NOMES_PAPEL[perfil.papel] || perfil.papel;
    document.getElementById('rodape-modo').textContent = 'Conectado à nuvem da clínica';
  }

  btnNovo.addEventListener('click', () => {
    const abrir = menuNovo.hidden;
    menuNovo.hidden = !abrir;
    btnNovo.setAttribute('aria-expanded', String(abrir));
  });

  menuNovo.addEventListener('click', (e) => {
    const item = e.target.closest('[data-novo]');
    if (!item) return;
    fecharMenus();
    const tipo = item.dataset.novo;
    if (tipo === 'lead' || tipo === 'cliente') {
      NutriDudu.cadastroPessoa.abrir({
        tipo,
        aoSalvar: (p) => { location.hash = `#/clientes/${encodeURIComponent(p.id)}`; },
      });
      return;
    }
    if (tipo === 'consulta') {
      NutriDudu.agendamento.abrir();
      return;
    }
    if (tipo === 'pagamento') {
      NutriDudu.financeiro.novoLancamento();
      return;
    }
    if (tipo === 'pacote') NutriDudu.financeiro.contratarPacote();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.new-menu')) {
      menuNovo.hidden = true;
      btnNovo.setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('.usuario-menu')) {
      menuUsuario.hidden = true;
      btnUsuario.setAttribute('aria-expanded', 'false');
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

  // ---------- Tema (claro/escuro) ----------
  const btnTema = document.getElementById('btn-tema');
  function mostrarTema(efetivo) {
    const escuro = efetivo === 'escuro';
    btnTema.dataset.efetivo = efetivo;
    const texto = escuro ? 'Usar modo claro' : 'Usar modo escuro';
    btnTema.setAttribute('aria-label', texto);
    btnTema.title = texto;
    // Mantém a escolha de Configurações › Aparência em dia, se estiver na tela.
    document.querySelectorAll('#view [name="tema"]').forEach((r) => { r.checked = r.value === NutriDudu.tema.atual(); });
  }
  btnTema.addEventListener('click', () => NutriDudu.tema.alternar());
  NutriDudu.tema.aoMudar(mostrarTema);
  mostrarTema(NutriDudu.tema.efetivo());

  function aplicarPerfil() {
    document.body.dataset.perfil = permissoes.atual();
    // Na nuvem, "voltar aos dados de exemplo" apagaria dados reais: fica só em Configurações.
    btnReset.hidden = !permissoes.pode('gerenciarDados') || NutriDudu.nuvem.ativa();
    menuNovo.querySelector('[data-novo="pagamento"]').hidden = !permissoes.pode('lancarCobranca');
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

  // Para páginas que mudam um filtro e precisam se redesenhar.
  NutriDudu.recarregarPagina = renderizar;

  store.subscribe(() => renderizar());
  window.addEventListener('hashchange', navegar);

  // Link com uma lista de consultas para importar (?importar=…, preparado pelo assistente de configuração):
  // abre a Agenda com a importação já lida; só falta conferir e tocar em "Importar".
  function abrirImportacaoDoLink() {
    // O código vem depois do "#" (não vai para o servidor, só fica no aparelho) ou, nos links antigos, no "?importar=".
    const params = new URLSearchParams(location.search);
    const noHash = /^#importar=([\w-]+)/.exec(location.hash);
    const codigo = noHash ? noHash[1] : params.get('importar');
    if (!codigo) return;
    params.delete('importar');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}#/agenda`);
    let texto = '';
    try {
      const b64 = codigo.replace(/-/g, '+').replace(/_/g, '/');
      texto = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    } catch (erro) {
      ui.toast('O link de importação está incompleto. Peça um novo.', 'erro');
      return;
    }
    // Formato completo: { texto, novos: [dados de pacientes ainda não cadastrados] }.
    let novos = [];
    if (texto.trim().startsWith('{')) {
      try { ({ texto = '', novos = [] } = JSON.parse(texto)); } catch (erro) { texto = ''; }
    }
    renderizar();
    setTimeout(() => NutriDudu.importarConsultas.abrir({ texto, novos }), 400);
  }

  // Link para marcar a autorização de WhatsApp de vários pacientes (#consentir=…, com os nomes completos).
  // Mostra a lista encontrada e só grava depois de "Confirmar".
  async function abrirConsentimentoDoLink() {
    const m = /^#consentir=([\w-]+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', `${location.pathname}${location.search}#/clientes`);
    let nomes = [];
    let todos = false;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const dados = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
      nomes = dados.nomes || [];
      todos = dados.todos === true;
    } catch (erro) {
      ui.toast('O link está incompleto. Peça um novo.', 'erro');
      return;
    }
    renderizar();
    const { store, utils, modal, permissoes } = NutriDudu;
    const pessoas = await store.list('pessoas');
    const chave = (n) => utils.normalizar(n).replace(/\s+/g, ' ').trim();
    // "todos": todos os clientes (não leads) que ainda não autorizaram.
    const achados = todos
      ? pessoas.filter((p) => p.status !== 'lead' && p.consentimentos?.whatsapp !== true).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((p) => ({ nome: p.nome, pessoa: p }))
      : nomes.map((n) => ({ nome: n, pessoa: pessoas.find((p) => chave(p.nome) === chave(n)) }));
    const marcar = achados.filter((a) => a.pessoa && a.pessoa.consentimentos?.whatsapp !== true);
    modal.formulario({
      titulo: 'Autorizar mensagens pelo WhatsApp',
      textoSalvar: marcar.length ? `Confirmar (${marcar.length})` : 'Fechar',
      corpo: `<p class="small">Estes pacientes passam a receber os lembretes e avisos da clínica pelo WhatsApp:</p>
        ${!achados.length ? `<p class="small"><strong>${todos ? 'Todos os clientes já autorizaram as mensagens. ✅' : 'Nenhum nome no link.'}</strong></p>` : ''}
        <ul class="small">${achados.map((a) => `<li>${utils.escapeHtml(a.nome)} — ${!a.pessoa ? '<span class="texto-perigo">não encontrado</span>' : a.pessoa.consentimentos?.whatsapp === true ? 'já autorizado' : 'vai ser autorizado'}</li>`).join('')}</ul>`,
      ler: () => ({}),
      salvar: async () => {
        const agora = new Date().toISOString();
        for (const a of marcar) {
          await store.update('pessoas', a.pessoa.id, { consentimentos: { ...(a.pessoa.consentimentos || {}), whatsapp: true } });
          await store.create('interacoes', {
            pessoaId: a.pessoa.id, dataHora: agora, tipo: 'nota', autor: permissoes.atual(), automatico: true,
            descricao: 'Autorização de mensagens pelo WhatsApp registrada (confirmada pelo profissional).',
          });
        }
        if (marcar.length) ui.toast(`${marcar.length} paciente(s) autorizado(s).`);
      },
    });
  }

  // Link para preencher o sexo de vários pacientes (#sexo=…, com nome completo e "M" ou "F"). Grava só depois de "Confirmar".
  async function abrirSexoDoLink() {
    const m = /^#sexo=([\w-]+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', `${location.pathname}${location.search}#/clientes`);
    let lista = [];
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      lista = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).pessoas || [];
    } catch (erro) {
      ui.toast('O link está incompleto. Peça um novo.', 'erro');
      return;
    }
    renderizar();
    const { store, utils, modal } = NutriDudu;
    const pessoas = await store.list('pessoas');
    const chave = (n) => utils.normalizar(n).replace(/\s+/g, ' ').trim();
    const achados = lista.filter((x) => ['M', 'F'].includes(x.sexo)).map((x) => ({ ...x, pessoa: pessoas.find((p) => chave(p.nome) === chave(x.nome)) }));
    const mudar = achados.filter((a) => a.pessoa && a.pessoa.sexo !== a.sexo);
    const rotulo = { M: 'Masculino', F: 'Feminino' };
    modal.formulario({
      titulo: 'Preencher o sexo dos pacientes',
      textoSalvar: mudar.length ? `Confirmar (${mudar.length})` : 'Fechar',
      corpo: `<p class="small">Usado para os emojis das mensagens (homens: 💪 🚀; mulheres: 😊 💚) e para "pro"/"pra".</p>
        <ul class="small">${achados.map((a) => `<li>${utils.escapeHtml(a.nome)} — ${!a.pessoa ? '<span class="texto-perigo">não encontrado</span>' : a.pessoa.sexo === a.sexo ? `já está ${rotulo[a.sexo]}` : rotulo[a.sexo]}</li>`).join('')}</ul>`,
      ler: () => ({}),
      salvar: async () => {
        for (const a of mudar) await store.update('pessoas', a.pessoa.id, { sexo: a.sexo });
        if (mudar.length) ui.toast(`${mudar.length} cadastro(s) atualizado(s).`);
      },
    });
  }

  // ---------- Início ----------
  // Aviso quando a nuvem existe mas alguém abriu a demonstração.
  document.getElementById('aviso-demo').hidden = !(NutriDudu.nuvem.configurada() && NutriDudu.nuvem.emDemonstracao());

  if (NutriDudu.nuvem.ativa()) {
    NutriDudu.login.iniciar({
      aoPronto: (perfil) => {
        mostrarUsuario(perfil);
        aplicarPerfil();
        pronto = true;
        renderizar();
        abrirImportacaoDoLink();
        abrirConsentimentoDoLink();
        abrirSexoDoLink();
      },
    });
  } else {
    aplicarPerfil();
    pronto = true;
    renderizar();
    abrirImportacaoDoLink();
    abrirConsentimentoDoLink();
    abrirSexoDoLink();
  }
})();
