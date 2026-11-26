// Tela "Acompanhamento": todos os clientes ativos separados pelo radar de engajamento
// (sumindo / atenção / em dia), as metas com data chegando e quem ainda está sem plano preenchido.
window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.acompanhamento = (function () {
  const ORDEM = ['vermelho', 'amarelo', 'verde'];
  const TITULOS = { vermelho: 'Sumindo', amarelo: 'Atenção', verde: 'Em dia' };
  const SUBS = {
    vermelho: 'Sem consulta há muito tempo: vale mandar uma mensagem ou marcar como inativo',
    amarelo: 'Retorno atrasado, sem próximo passo ou sem responder os check-ins',
    verde: 'Consultas em dia e respondendo os check-ins',
  };

  async function render(container) {
    const { store, utils, ui, permissoes, calculos } = NutriDudu;
    const A = NutriDudu.acompanhamento;
    if (!permissoes.pode('verClinico')) {
      container.innerHTML = `${ui.cabecalho('Acompanhamento')}<div class="card"><p>${utils.escapeHtml(permissoes.MENSAGENS?.verClinico || 'Seu perfil não tem acesso aos dados clínicos.')}</p></div>`;
      return;
    }
    const [pessoasTodas, consultas, pacotes, checkins, planos, geral] = await Promise.all([
      store.list('pessoas', (p) => p.status === 'ativo'),
      store.list('consultas'),
      store.list('pacotes'),
      store.list('checkins'),
      store.list('acompanhamentos').catch(() => []),
      store.get('configuracoes', 'geral'),
    ]);
    const proprio = permissoes.idProfissionalAtual();
    const pessoas = proprio ? pessoasTodas.filter((p) => p.profissionalId === proprio) : pessoasTodas;
    const de = {
      consultas: calculos.agruparPorPessoa(consultas), pacotes: calculos.agruparPorPessoa(pacotes),
      checkins: calculos.agruparPorPessoa(checkins), planos: calculos.agruparPorPessoa(planos),
    };

    const linhas = pessoas.map((p) => ({
      p,
      radar: A.radar({ pessoa: p, consultas: de.consultas(p.id), pacotes: de.pacotes(p.id), checkins: de.checkins(p.id), geral: geral || {} }),
      plano: A.atual(de.planos(p.id)),
    })).sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
    const grupos = Object.fromEntries(ORDEM.map((n) => [n, linhas.filter((l) => l.radar.nivel === n)]));
    const semPlano = linhas.filter((l) => !l.plano || A.estaVazio(l.plano));
    const metas = linhas
      .filter((l) => l.plano?.meta?.data)
      .map((l) => ({ ...l, dias: A.diasAte(l.plano.meta.data) }))
      .filter((l) => l.dias !== null && l.dias >= 0)
      .sort((a, b) => a.dias - b.dias);

    const esc = utils.escapeHtml;
    const link = (p, aba = '') => `#/clientes/${encodeURIComponent(p.id)}${aba ? `/${aba}` : ''}`;
    const zap = (p, radar) => NutriDudu.mensagensProntas.botao(p, radar.situacao, { consultas: de.consultas(p.id) });

    const cartaoGrupo = (nivel) => {
      const itens = grupos[nivel];
      return `
        <section class="card acao ac-grupo ac-grupo-${nivel}">
          <div class="secao-cabecalho">
            <h2 class="card-title">${A.ICONE_RADAR[nivel]} ${TITULOS[nivel]}</h2>
            <span class="contador${itens.length && nivel !== 'verde' ? ' tem' : ''}">${itens.length}</span>
          </div>
          <p class="muted small card-sub">${SUBS[nivel]}</p>
          ${itens.length ? `<ul class="lista-acao">${itens.map(({ p, radar, plano }) => `
            <li>
              <span class="item-acao-texto"><a href="${link(p)}">${esc(p.nome)}</a>
                <span class="muted small bloco">${esc(radar.motivos.join(' · ') || (plano?.objetivoPrincipal ? `🎯 ${plano.objetivoPrincipal}` : 'Tudo em dia'))}</span></span>
              <span class="item-acao-botoes">
                ${nivel !== 'verde' ? `<button type="button" class="btn btn-pequeno btn-primary" data-agendar="${p.id}">Agendar</button> ${zap(p, radar)}` : ''}
                <a class="btn btn-pequeno" href="${link(p, 'acompanhamento')}">Plano</a>
              </span>
            </li>`).join('')}</ul>` : `<p class="tudo-certo">✓ Ninguém aqui.</p>`}
        </section>`;
    };

    container.innerHTML = `
      <div class="pagina-acompanhamento">
        ${ui.cabecalho('Acompanhamento', 'Como estão os seus pacientes ativos, pelo radar de engajamento')}
        <section class="kpi-grid">
          ${ui.kpi('🔴 Sumindo', String(grupos.vermelho.length), 'pacientes ativos')}
          ${ui.kpi('🟡 Atenção', String(grupos.amarelo.length), 'pacientes ativos')}
          ${ui.kpi('🟢 Em dia', String(grupos.verde.length), 'pacientes ativos')}
          ${ui.kpi('Com plano preenchido', `${linhas.length - semPlano.length} de ${linhas.length}`, semPlano.length ? `${semPlano.length} sem objetivos registrados` : 'todos com objetivos')}
        </section>

        <div class="grid-acoes">
          ${ORDEM.map(cartaoGrupo).join('')}

          <section class="card acao">
            <div class="secao-cabecalho"><h2 class="card-title">🏁 Metas chegando</h2><span class="contador${metas.length ? ' tem' : ''}">${metas.length}</span></div>
            <p class="muted small card-sub">Provas, viagens e eventos com data, do mais próximo pro mais distante</p>
            ${metas.length ? `<ul class="lista-acao">${metas.map(({ p, plano, dias }) => `
              <li>
                <span class="item-acao-texto"><a href="${link(p, 'acompanhamento')}">${esc(p.nome)}</a>
                  <span class="muted small bloco">${esc(plano.meta.titulo || 'Meta')} · ${esc(utils.data(plano.meta.data))}</span></span>
                <span class="item-acao-botoes"><strong class="ac-dias">${esc(A.textoContagem(dias))}</strong></span>
              </li>`).join('')}</ul>` : '<p class="tudo-certo">Nenhuma meta com data registrada.</p>'}
          </section>

          <section class="card acao">
            <div class="secao-cabecalho"><h2 class="card-title">📝 Sem plano preenchido</h2><span class="contador">${semPlano.length}</span></div>
            <p class="muted small card-sub">Na próxima consulta, preencha os objetivos junto com o paciente (Modo consulta)</p>
            ${semPlano.length ? `<ul class="lista-acao">${semPlano.map(({ p }) => `
              <li>
                <span class="item-acao-texto"><a href="${link(p)}">${esc(p.nome)}</a></span>
                <span class="item-acao-botoes"><a class="btn btn-pequeno" href="${link(p, 'acompanhamento')}">Preencher</a></span>
              </li>`).join('')}</ul>` : '<p class="tudo-certo">✓ Todos com plano preenchido.</p>'}
          </section>
        </div>
      </div>`;

    container.querySelector('.pagina-acompanhamento').addEventListener('click', (e) => {
      const b = e.target.closest('[data-agendar]');
      if (b) NutriDudu.agendamento.abrir({ pessoaId: b.dataset.agendar });
    });
  }

  return { titulo: 'Acompanhamento', render };
})();
