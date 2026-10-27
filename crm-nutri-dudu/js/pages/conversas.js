// Conversas do WhatsApp (fase 10): caixa de entrada e conversa aberta.
// Na nuvem, as mensagens chegam pelo servidor (supabase/functions) e a equipe
// responde pela função "whatsapp-enviar". No modo demonstração, o envio é simulado.
window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.conversas = (function () {
  const STATUS = {
    aguardando_equipe: ['Aguardando equipe', 'alerta'],
    agente: ['🤖 Assistente', 'info'],
    equipe: ['Equipe atendendo', 'sucesso'],
    encerrada: ['Encerrada', 'neutro'],
  };
  const FILTROS = { todas: 'Todas', aguardando_equipe: 'Aguardando equipe', agente: 'Assistente', equipe: 'Equipe', encerrada: 'Encerradas' };
  const ICONE_STATUS = { enviando: '🕓', enviada: '✓', entregue: '✓✓', lida: '✓✓', falhou: '⚠' };
  const ROTULO_STATUS = { enviando: 'Enviando', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Não enviada' };
  const JANELA_MS = 24 * 60 * 60 * 1000;

  // Guardados entre redesenhos (a página é redesenhada a cada mudança nos dados).
  const estado = { filtro: 'todas', busca: '' };
  const rascunhos = {};

  const ordemStatus = (s) => (s === 'aguardando_equipe' ? 0 : s === 'encerrada' ? 2 : 1);

  function quemSouEu() {
    const { nuvem, config, permissoes } = NutriDudu;
    return nuvem.ativa() ? (nuvem.perfilAtual()?.nome || 'Equipe') : config.PERFIS[permissoes.atual()];
  }

  /** Última mensagem do contato: o WhatsApp só deixa a clínica escrever livremente até 24 h depois dela. */
  function janelaAberta(conversa, mensagens, agora = new Date()) {
    const ultima = conversa.ultimaMensagemContatoEm
      || mensagens.filter((m) => m.autor === 'contato').map((m) => m.dataHora).sort().pop();
    if (!ultima) return { aberta: false, fechaEm: null };
    const fechaEm = new Date(new Date(ultima).getTime() + JANELA_MS);
    return { aberta: fechaEm > agora, fechaEm };
  }

  function quando(iso) {
    const { utils } = NutriDudu;
    const d = new Date(iso);
    const hoje = utils.isoDia(new Date());
    if (utils.isoDia(d) === hoje) return utils.hora(d);
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (utils.isoDia(d) === utils.isoDia(ontem)) return 'Ontem';
    return utils.data(d).slice(0, 5);
  }

  function rotuloDia(iso) {
    const { utils } = NutriDudu;
    const dia = utils.isoDia(iso);
    if (dia === utils.isoDia(new Date())) return 'Hoje';
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (dia === utils.isoDia(ontem)) return 'Ontem';
    return utils.diaPorExtenso(iso);
  }

  // ---------------- Lista (caixa de entrada) ----------------

  function itemLista(c, pessoa, ultima, ativa) {
    const { ui, utils } = NutriDudu;
    const [rotulo, variante] = STATUS[c.status] || [c.status, 'neutro'];
    const nome = pessoa?.nome || c.telefone || 'Contato';
    const previa = ultima ? `${ultima.autor === 'agente' ? '🤖 ' : ultima.autor === 'equipe' ? 'Você: ' : ''}${ultima.texto || ''}` : '';
    const busca = utils.normalizar(`${nome} ${c.telefone || ''} ${pessoa?.telefone || ''}`);
    return `
      <a class="conversa-item${ativa ? ' ativa' : ''}${c.naoLidas ? ' nao-lida' : ''}" href="#/conversas/${encodeURIComponent(c.id)}"
         data-status="${utils.escapeHtml(c.status)}" data-busca="${utils.escapeHtml(busca)}"${ativa ? ' aria-current="true"' : ''}>
        ${ui.avatar(utils.iniciais(nome))}
        <span class="conversa-item-info">
          <span class="conversa-item-topo">
            <strong class="texto-cortado">${utils.escapeHtml(nome)}</strong>
            <span class="muted small sem-quebra">${c.ultimaMensagemEm ? utils.escapeHtml(quando(c.ultimaMensagemEm)) : ''}</span>
          </span>
          <span class="muted small texto-cortado">${utils.escapeHtml(previa)}</span>
          <span class="conversa-item-rodape">
            ${ui.badge(rotulo, variante)}
            ${c.naoLidas ? `<span class="nao-lidas" aria-label="${c.naoLidas} não lida(s)">${c.naoLidas}</span>` : ''}
          </span>
        </span>
      </a>`;
  }

  // ---------------- Conversa aberta ----------------

  function bolha(m) {
    const { utils } = NutriDudu;
    const lado = m.autor === 'contato' ? 'recebida' : 'enviada';
    const autor = m.autor === 'agente' ? '🤖 Assistente' : m.autor === 'equipe' ? (m.autorNome || 'Equipe') : '';
    const st = lado === 'enviada' && m.status ? `<span class="bolha-status status-${utils.escapeHtml(m.status)}" title="${utils.escapeHtml(ROTULO_STATUS[m.status] || m.status)}" aria-label="${utils.escapeHtml(ROTULO_STATUS[m.status] || m.status)}">${ICONE_STATUS[m.status] || ''}</span>` : '';
    return `
      <div class="bolha bolha-${lado} bolha-${utils.escapeHtml(m.autor)}" data-mensagem="${utils.escapeHtml(m.id)}">
        ${autor ? `<span class="bolha-autor">${utils.escapeHtml(autor)}</span>` : ''}
        <p class="bolha-texto">${utils.escapeHtml(m.texto || '')}</p>
        <span class="bolha-meta">${m.simulada ? 'simulada · ' : ''}${utils.escapeHtml(utils.hora(m.dataHora))} ${st}</span>
        ${m.status === 'falhou' && m.erro ? `<span class="bolha-erro">Não foi enviada: ${utils.escapeHtml(m.erro)}</span>` : ''}
      </div>`;
  }

  function painelConversa(c, pessoa, mensagens, agenteCfg) {
    const { ui, utils } = NutriDudu;
    const nome = pessoa?.nome || c.telefone || 'Contato';
    const [rotulo, variante] = STATUS[c.status] || [c.status, 'neutro'];
    const janela = janelaAberta(c, mensagens);
    const ordenadas = [...mensagens].sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    let diaAnterior = '';
    const corpo = ordenadas.map((m) => {
      const dia = NutriDudu.utils.isoDia(m.dataHora);
      const sep = dia !== diaAnterior ? `<div class="chat-dia"><span>${utils.escapeHtml(rotuloDia(m.dataHora))}</span></div>` : '';
      diaAnterior = dia;
      return sep + bolha(m);
    }).join('');

    const botoes = [];
    if (c.status === 'agente' || c.status === 'aguardando_equipe') botoes.push('<button type="button" class="btn btn-pequeno btn-primary" data-assumir>Assumir conversa</button>');
    if (c.status === 'equipe' || c.status === 'aguardando_equipe') botoes.push('<button type="button" class="btn btn-pequeno" data-devolver>Devolver ao assistente</button>');
    botoes.push(c.status === 'encerrada'
      ? '<button type="button" class="btn btn-pequeno" data-reabrir>Reabrir</button>'
      : '<button type="button" class="btn btn-pequeno" data-encerrar>Encerrar</button>');
    if (pessoa) botoes.push(`<a class="btn btn-pequeno" href="#/clientes/${encodeURIComponent(pessoa.id)}">Ver ficha</a>`);

    const avisoAgente = !agenteCfg.ativo && c.status === 'agente'
      ? '<p class="alerta alerta-aviso small">O assistente está desligado (Configurações › Assistente do WhatsApp). Novas mensagens ficam esperando a equipe.</p>' : '';
    const faixaEquipe = c.status === 'aguardando_equipe' ? `
      <div class="alerta alerta-aviso chat-faixa" role="note">
        <strong>${utils.escapeHtml(c.motivoEquipe || 'Esperando alguém da equipe')}</strong>
        ${c.resumo ? `<span class="bloco">Resumo do assistente: ${utils.escapeHtml(c.resumo)}</span>` : ''}
        ${c.ultimoErro ? `<span class="bloco small muted">Detalhe técnico: ${utils.escapeHtml(c.ultimoErro)}</span>` : ''}
      </div>` : '';
    const assumida = c.status === 'equipe' && c.assumidaPor
      ? `<p class="muted small chat-assumida">Atendida por ${utils.escapeHtml(c.assumidaPor)} · o assistente não responde enquanto a equipe atende.</p>` : '';

    const fechada = !janela.aberta;
    const avisoJanela = fechada
      ? `<p class="alerta alerta-info small chat-janela">Passaram mais de 24 horas desde a última mensagem de ${utils.escapeHtml(nome.split(' ')[0])}. O WhatsApp só deixa a clínica escrever de novo quando a pessoa responder (mensagens com modelos aprovados chegam na fase 10c).
          ${pessoa?.telefone ? `<a href="https://wa.me/55${utils.soDigitos(pessoa.telefone)}" target="_blank" rel="noopener">Abrir no WhatsApp do celular</a>` : ''}</p>`
      : '';
    const demo = !NutriDudu.nuvem.ativa();

    return `
      <section class="chat-painel card" aria-label="Conversa com ${utils.escapeHtml(nome)}">
        <header class="chat-topo">
          <a class="btn btn-pequeno chat-voltar" href="#/conversas" aria-label="Voltar para a lista">←</a>
          ${ui.avatar(utils.iniciais(nome))}
          <div class="chat-topo-info">
            <h2 class="chat-nome">${utils.escapeHtml(nome)}</h2>
            <span class="muted small">${utils.escapeHtml(c.telefone || pessoa?.telefone || '')} ${ui.badge(rotulo, variante)}</span>
          </div>
          <div class="chat-acoes acoes-linha sem-margem">${botoes.join('')}</div>
        </header>
        ${faixaEquipe}${avisoAgente}${assumida}
        <div class="chat-mensagens" data-chat-mensagens tabindex="0" aria-label="Mensagens">
          ${corpo || '<p class="vazio muted">Nenhuma mensagem ainda.</p>'}
        </div>
        ${avisoJanela}
        <form class="chat-envio" data-chat-envio novalidate>
          <label class="visualmente-oculto" for="chat-texto">Mensagem</label>
          <textarea id="chat-texto" name="texto" rows="2" maxlength="4000" placeholder="${fechada ? 'Janela de 24 horas fechada' : 'Escreva uma mensagem…'}"${fechada ? ' disabled' : ''}>${utils.escapeHtml(rascunhos[c.id] || '')}</textarea>
          <button type="submit" class="btn btn-primary"${fechada ? ' disabled' : ''}>Enviar</button>
        </form>
        <p class="muted small chat-rodape">${demo ? 'Demonstração: o envio é simulado e nada sai pelo WhatsApp.' : 'Enter envia · Shift+Enter quebra a linha. Ao responder, você assume a conversa.'}</p>
      </section>`;
  }

  // ---------------- Ações ----------------

  async function mudar(conversa, alteracoes, aviso) {
    try {
      await NutriDudu.store.update('conversas', conversa.id, alteracoes);
      if (aviso) NutriDudu.ui.toast(aviso);
    } catch (erro) {
      NutriDudu.ui.toast(erro.message || 'Não foi possível alterar a conversa.', 'erro');
    }
  }

  const assumir = (c) => mudar(c, { status: 'equipe', assumidaPor: quemSouEu(), naoLidas: 0 }, 'Você assumiu a conversa. O assistente para de responder.');
  const devolver = (c) => mudar(c, { status: 'agente', assumidaPor: null, motivoEquipe: null, resumo: null, ultimoErro: null }, 'Conversa devolvida ao assistente.');
  const encerrar = (c) => mudar(c, { status: 'encerrada', naoLidas: 0 }, 'Conversa encerrada. Se a pessoa escrever de novo, ela reabre sozinha.');
  const reabrir = (c) => mudar(c, { status: 'equipe', assumidaPor: quemSouEu() }, 'Conversa reaberta.');

  async function enviar(c, form) {
    const { store, nuvem, ui } = NutriDudu;
    const campo = form.elements.texto;
    const texto = campo.value.trim();
    if (!texto) { campo.focus(); return; }
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      if (nuvem.ativa()) {
        // O servidor envia, guarda a mensagem e marca a conversa como "equipe";
        // a tela atualiza sozinha pelo tempo real.
        await nuvem.enviarWhatsApp(c.id, texto);
      } else {
        const agora = new Date().toISOString();
        await store.create('mensagens', {
          conversaId: c.id, pessoaId: c.pessoaId, dataHora: agora, autor: 'equipe', autorNome: quemSouEu(),
          texto, direcao: 'enviada', status: 'enviada', simulada: true,
        }, { silencioso: true });
        await store.update('conversas', c.id, { status: 'equipe', assumidaPor: quemSouEu(), naoLidas: 0, ultimaMensagemEm: agora });
      }
      delete rascunhos[c.id];
      campo.value = '';
    } catch (erro) {
      ui.toast(erro.message || 'Não foi possível enviar.', 'erro');
      botao.disabled = false;
    }
  }

  // ---------------- Página ----------------

  async function render(container, params = {}) {
    const { store, ui, utils } = NutriDudu;
    const [conversas, mensagens, pessoas, agenteCfg] = await Promise.all([
      store.list('conversas'),
      store.list('mensagens'),
      store.list('pessoas'),
      store.get('configuracoes', 'agente'),
    ]);
    const cfg = agenteCfg || { ativo: false };
    const pessoaPorId = Object.fromEntries(pessoas.map((p) => [p.id, p]));
    const porConversa = {};
    mensagens.forEach((m) => { (porConversa[m.conversaId] = porConversa[m.conversaId] || []).push(m); });
    const ultimaDe = (id) => (porConversa[id] || []).reduce((u, m) => (!u || m.dataHora > u.dataHora ? m : u), null);

    const ordenadas = conversas.sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status)
      || (b.ultimaMensagemEm || '').localeCompare(a.ultimaMensagemEm || ''));
    const aberta = params.id ? conversas.find((c) => c.id === params.id) : null;
    const contagem = (f) => (f === 'todas' ? conversas.length : conversas.filter((c) => c.status === f).length);
    const aguardando = contagem('aguardando_equipe');

    container.innerHTML = `
      <div class="conversas-pagina${params.id ? ' com-conversa' : ''}">
        ${ui.cabecalho('Conversas', `WhatsApp da clínica · assistente ${cfg.ativo ? 'ligado' : 'desligado'}${aguardando ? ` · ${aguardando} aguardando a equipe` : ''}`)}
        <div class="conversas-layout">
          <section class="conversas-lista card" aria-label="Lista de conversas">
            <div class="conversas-filtros">
              <label class="visualmente-oculto" for="busca-conversa">Buscar conversa</label>
              <input id="busca-conversa" type="search" placeholder="Buscar por nome ou telefone" value="${utils.escapeHtml(estado.busca)}" data-busca-conversa>
              <div class="segmentos segmentos-quebra" role="group" aria-label="Filtrar conversas">
                ${Object.entries(FILTROS).map(([v, r]) => `<button type="button" class="segmento${estado.filtro === v ? ' ativo' : ''}" data-filtro="${v}" aria-pressed="${estado.filtro === v}">${utils.escapeHtml(r)} <span class="muted">${contagem(v)}</span></button>`).join('')}
              </div>
            </div>
            <div class="conversas-itens" data-itens>
              ${ordenadas.map((c) => itemLista(c, pessoaPorId[c.pessoaId], ultimaDe(c.id), c.id === params.id)).join('')}
              <p class="vazio muted" data-sem-resultado hidden>Nenhuma conversa neste filtro.</p>
            </div>
          </section>
          ${aberta
            ? painelConversa(aberta, pessoaPorId[aberta.pessoaId], porConversa[aberta.id] || [], cfg)
            : `<section class="chat-painel chat-vazio card">${params.id
              ? `<p>Essa conversa não existe mais.</p><a class="btn" href="#/conversas">Ver todas</a>`
              : `<p class="muted">${conversas.length ? 'Escolha uma conversa na lista.' : 'Nenhuma conversa ainda. Quando alguém escrever para o WhatsApp da clínica, ela aparece aqui.'}</p>`}</section>`}
        </div>
      </div>`;

    // Filtro e busca: só escondem itens (sem redesenhar, para não perder o foco).
    const raiz = container.querySelector('.conversas-pagina');
    const aplicarFiltro = () => {
      const termo = utils.normalizar(estado.busca.trim());
      let visiveis = 0;
      raiz.querySelectorAll('.conversa-item').forEach((el) => {
        const mostra = (estado.filtro === 'todas' || el.dataset.status === estado.filtro) && (!termo || el.dataset.busca.includes(termo));
        el.hidden = !mostra;
        if (mostra) visiveis++;
      });
      raiz.querySelector('[data-sem-resultado]').hidden = visiveis > 0;
    };
    raiz.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
      estado.filtro = b.dataset.filtro;
      raiz.querySelectorAll('[data-filtro]').forEach((x) => {
        x.classList.toggle('ativo', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      aplicarFiltro();
    }));
    raiz.querySelector('[data-busca-conversa]').addEventListener('input', (e) => { estado.busca = e.target.value; aplicarFiltro(); });
    aplicarFiltro();

    if (!aberta) return;

    raiz.querySelector('[data-assumir]')?.addEventListener('click', () => assumir(aberta));
    raiz.querySelector('[data-devolver]')?.addEventListener('click', () => devolver(aberta));
    raiz.querySelector('[data-encerrar]')?.addEventListener('click', () => encerrar(aberta));
    raiz.querySelector('[data-reabrir]')?.addEventListener('click', () => reabrir(aberta));
    const form = raiz.querySelector('[data-chat-envio]');
    const campo = form.elements.texto;
    campo.addEventListener('input', () => { rascunhos[aberta.id] = campo.value; });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); enviar(aberta, form); });

    // Abriu a conversa: zera as não lidas (sem redesenhar a página de novo).
    if (aberta.naoLidas) store.update('conversas', aberta.id, { naoLidas: 0 }, { silencioso: true }).catch(() => {});

    // Depois que a página entra na tela: rola até a última mensagem e devolve o foco ao campo.
    const estavaDigitando = document.activeElement?.id === 'chat-texto';
    setTimeout(() => {
      const lista = document.querySelector('[data-chat-mensagens]');
      if (lista) lista.scrollTop = lista.scrollHeight;
      if (estavaDigitando) document.getElementById('chat-texto')?.focus();
    }, 0);
  }

  return { titulo: 'Conversas', render, janelaAberta };
})();
