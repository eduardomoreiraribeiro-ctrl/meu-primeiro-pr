window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.agenda = {
  titulo: 'Agenda',

  async render(container) {
    const { store, ui, utils } = NutriDudu;
    const [consultas, pessoas, profissionais, servicos, bloqueios] = await Promise.all([
      store.list('consultas', (c) => c.status !== 'cancelada'),
      store.list('pessoas'),
      store.list('profissionais'),
      store.list('servicos'),
      store.list('bloqueios'),
    ]);

    const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
    const pessoaPorId = porId(pessoas);
    const profPorId = porId(profissionais);
    const servicoPorId = porId(servicos);

    // Próximos 7 dias, a partir de hoje.
    const hoje = utils.inicioDoDia(new Date());
    const dias = Array.from({ length: 7 }, (_, n) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + n);
      return utils.isoDia(d);
    });

    const blocos = dias.map((dia) => {
      const doDia = consultas
        .filter((c) => utils.isoDia(c.inicio) === dia)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      const bloqueiosDoDia = bloqueios.filter((b) => utils.isoDia(b.inicio) === dia);
      if (!doDia.length && !bloqueiosDoDia.length) return '';

      return `
        <section class="card agenda-dia">
          <h2 class="card-title">${utils.escapeHtml(utils.diaPorExtenso(dia))}</h2>
          <ul class="lista-simples">
            ${bloqueiosDoDia.map((b) => `
              <li class="bloqueio">
                <span class="hora">${utils.hora(b.inicio)}–${utils.hora(b.fim)}</span>
                <span>Bloqueio: ${utils.escapeHtml(b.motivo)}</span>
              </li>`).join('')}
            ${doDia.map((c) => {
              const prof = profPorId[c.profissionalId];
              const pessoa = pessoaPorId[c.pessoaId];
              return `
                <li>
                  <span class="hora">${utils.hora(c.inicio)}</span>
                  <span class="ponto" style="background:${utils.escapeHtml(prof?.cor || '#999')}" title="${utils.escapeHtml(prof?.nome || '')}"></span>
                  <span class="agenda-info">
                    <a href="#/clientes/${encodeURIComponent(c.pessoaId)}">${utils.escapeHtml(pessoa?.nome || 'Cliente')}</a>
                    <span class="muted small">${utils.escapeHtml(servicoPorId[c.servicoId]?.nome || '')}${c.agendadaPor === 'agente' ? ' · 🤖 agendada pelo agente' : ''}</span>
                  </span>
                  ${ui.statusConsulta(c.status)}
                </li>`;
            }).join('')}
          </ul>
        </section>`;
    }).join('');

    container.innerHTML = `
      ${ui.cabecalho('Agenda', 'Próximos 7 dias')}
      ${ui.emBreve(4, [
        'Visões de dia (uma coluna por profissional), semana, mês e lista',
        'Agendar clicando num horário livre e remarcar arrastando',
        'Confirmar, marcar falta e criar bloqueios direto na agenda',
        'Checagem de conflitos e de horário de atendimento; ocupação por profissional',
      ])}
      ${blocos || `<section class="card">${ui.vazio('Nenhuma consulta nos próximos 7 dias.')}</section>`}
    `;
  },
};
