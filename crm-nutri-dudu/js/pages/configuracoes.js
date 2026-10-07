window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.configuracoes = {
  titulo: 'Configurações',

  async render(container) {
    const { store, ui, config, utils } = NutriDudu;
    const [profissionais, horarios, bloqueios, geral] = await Promise.all([
      store.list('profissionais'),
      store.list('horarios'),
      store.list('bloqueios'),
      store.get('configuracoes', 'geral'),
    ]);

    const blocoProfissional = (prof) => {
      const porDia = config.DIAS_SEMANA.map((nomeDia, diaSemana) => {
        const periodos = horarios
          .filter((h) => h.profissionalId === prof.id && h.diaSemana === diaSemana)
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
          .map((h) => `${h.inicio}–${h.fim}`);
        return `<tr><th scope="row">${nomeDia}</th><td>${periodos.length ? periodos.join(' e ') : '<span class="muted">Fechado</span>'}</td></tr>`;
      }).join('');
      const seus = bloqueios.filter((b) => b.profissionalId === prof.id);

      return `
        <section class="card">
          <div class="prof-topo">
            <span class="ponto grande" style="background:${utils.escapeHtml(prof.cor)}"></span>
            <div>
              <h2 class="card-title">${utils.escapeHtml(prof.nome)}</h2>
              <p class="muted small">${utils.escapeHtml(prof.registro)} · perfil ${utils.escapeHtml(config.PERFIS[prof.perfil] || prof.perfil)}</p>
            </div>
          </div>
          <h3 class="subtitulo">Horários de atendimento</h3>
          <table class="tabela-simples">${porDia}</table>
          <h3 class="subtitulo">Bloqueios</h3>
          ${seus.length ? `<ul class="lista-simples">${seus.map((b) => `
            <li><span class="hora">${utils.data(b.inicio)}</span> ${utils.escapeHtml(b.motivo)}</li>`).join('')}</ul>` : ui.vazio('Nenhum bloqueio.')}
        </section>`;
    };

    container.innerHTML = `
      ${ui.cabecalho('Configurações', 'Profissionais, horários e regras da clínica')}
      ${ui.emBreve(2, [
        'Cadastrar e editar profissionais, cores, horários de atendimento e bloqueios',
        'Regras de retorno e recorrência (fase 7) e textos do agente e automações (fase 10)',
      ])}
      ${profissionais.map(blocoProfissional).join('')}
      <section class="card">
        <h2 class="card-title">Regras gerais</h2>
        <table class="tabela-simples">
          <tr><th scope="row">Alerta de retorno após</th><td>${geral?.diasRetornoPadrao ?? '—'} dias sem consulta e sem retorno marcado</td></tr>
          <tr><th scope="row">Cliente sumido após</th><td>${geral?.diasClienteSumido ?? '—'} dias</td></tr>
          <tr><th scope="row">Intervalo entre consultas</th><td>${geral?.intervaloEntreConsultasMin ?? '—'} min</td></tr>
        </table>
      </section>
    `;
  },
};
