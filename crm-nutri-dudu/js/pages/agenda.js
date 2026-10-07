window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.agenda = (function () {
  const VISOES = { dia: 'Dia', semana: 'Semana', mes: 'Mês', lista: 'Lista' };
  const VISAO_KEY = 'nutridudu:agenda-visao';
  const PX_POR_MIN = 1.1; // 66 px por hora
  const PASSO_CLIQUE = 10; // minutos: clique e arraste "grudam" de 10 em 10
  const DIAS_LISTA = 14;
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // Visão e data ficam guardadas enquanto o sistema está aberto; a visão também neste navegador.
  const estado = { visao: lerVisao(), data: null, profissionalId: '' };

  function lerVisao() {
    try {
      const v = localStorage.getItem(VISAO_KEY);
      if (VISOES[v]) return v;
    } catch (erro) { /* sem armazenamento */ }
    return window.matchMedia('(max-width: 860px)').matches ? 'lista' : 'semana';
  }

  function salvarVisao(v) {
    try { localStorage.setItem(VISAO_KEY, v); } catch (erro) { /* só não lembra */ }
  }

  const somarDias = (iso, n) => {
    const d = NutriDudu.utils.paraData(iso);
    d.setDate(d.getDate() + n);
    return NutriDudu.utils.isoDia(d);
  };
  const segundaDaSemana = (iso) => {
    const d = NutriDudu.utils.paraData(iso);
    return somarDias(iso, -((d.getDay() + 6) % 7));
  };
  const minutosDoDia = (data) => data.getHours() * 60 + data.getMinutes();

  /** Dias exibidos na visão atual. */
  function diasDaVisao(visao, data) {
    if (visao === 'dia') return [data];
    if (visao === 'semana') {
      const seg = segundaDaSemana(data);
      return Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
    }
    if (visao === 'lista') return Array.from({ length: DIAS_LISTA }, (_, i) => somarDias(data, i));
    // Mês: semanas completas (segunda a domingo) que cobrem o mês.
    const d = NutriDudu.utils.paraData(data);
    const primeiro = NutriDudu.utils.isoDia(new Date(d.getFullYear(), d.getMonth(), 1));
    const ultimo = NutriDudu.utils.isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const dias = [];
    for (let dia = segundaDaSemana(primeiro); dia <= ultimo || dias.length % 7; dia = somarDias(dia, 1)) dias.push(dia);
    return dias;
  }

  function tituloPeriodo(visao, dias) {
    const { utils } = NutriDudu;
    const d0 = utils.paraData(dias[0]);
    const d1 = utils.paraData(dias[dias.length - 1]);
    if (visao === 'dia') return `${utils.diaPorExtenso(d0).split(',')[0]}, ${d0.getDate()} de ${MESES[d0.getMonth()]} de ${d0.getFullYear()}`;
    if (visao === 'mes') {
      const meio = utils.paraData(dias[10]);
      return `${MESES[meio.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${meio.getFullYear()}`;
    }
    const mesmoMes = d0.getMonth() === d1.getMonth();
    return `${d0.getDate()}${mesmoMes ? '' : ` de ${MESES[d0.getMonth()]}`} a ${d1.getDate()} de ${MESES[d1.getMonth()]} de ${d1.getFullYear()}`;
  }

  function navegar(direcao) {
    const passos = { dia: 1, semana: 7, lista: DIAS_LISTA };
    if (estado.visao === 'mes') {
      const d = NutriDudu.utils.paraData(estado.data);
      estado.data = NutriDudu.utils.isoDia(new Date(d.getFullYear(), d.getMonth() + direcao, 1));
    } else {
      estado.data = somarDias(estado.data, direcao * passos[estado.visao]);
    }
    NutriDudu.recarregarPagina();
  }

  // ---------------- Pedaços visuais ----------------

  function iconesConsulta(c) {
    return [
      c.status === 'confirmada' ? '<span title="Confirmada">✓</span>' : '',
      c.agendadaPor === 'agente' ? '<span title="Agendada pelo agente">🤖</span>' : '',
      c.encaixe ? '<span title="Encaixe">⤵</span>' : '',
      c.status === 'faltou' ? '<span title="Faltou">⚠</span>' : '',
    ].join('');
  }

  /** Bloco de consulta posicionado na grade de horários. */
  function eventoHtml(c, info, inicioMin, privado) {
    const { utils } = NutriDudu;
    const ini = new Date(c.inicio);
    const fim = new Date(c.fim);
    const top = (minutosDoDia(ini) - inicioMin) * PX_POR_MIN;
    const altura = Math.max(18, ((fim - ini) / 60000) * PX_POR_MIN - 2);
    const largura = 100 / c.colunas;
    const estilo = `--cor:${utils.escapeHtml(info.cor)};top:${top}px;height:${altura}px;left:calc(${c.coluna * largura}% + 2px);width:calc(${largura}% - 4px)`;

    if (privado) {
      return `<div class="evento evento-privado" style="${estilo}" title="Ocupado"><span class="ev-nome">Ocupado</span></div>`;
    }
    const movel = info.movel ? ' data-movel="1"' : '';
    // Consultas curtas: uma linha só ("09:00 Renata").
    const curta = (fim - ini) / 60000 < 35;
    const titulo = `${utils.hora(ini)}–${utils.hora(fim)} · ${info.nome} · ${info.servico} · ${NutriDudu.config.STATUS_CONSULTA[c.status]}`;
    return `
      <button type="button" class="evento st-${c.status}${c.encaixe ? ' encaixe' : ''}${curta ? ' curto' : ''}" style="${estilo}" data-consulta="${c.id}"${movel}
        title="${utils.escapeHtml(titulo)}" aria-label="${utils.escapeHtml(titulo)}">
        <span class="ev-linha"><span class="ev-hora">${utils.hora(ini)}</span>${curta ? ` <span class="ev-nome">${utils.escapeHtml(info.nome)}</span>` : ''} <span class="ev-icones">${iconesConsulta(c)}</span></span>
        ${curta ? '' : `<span class="ev-nome">${utils.escapeHtml(info.nome)}</span>`}
        <span class="ev-servico">${utils.escapeHtml(info.servico)}</span>
      </button>`;
  }

  /** Visões de dia e semana: grade com uma coluna por (dia, profissionais). */
  function gradeHtml(colunas, d, faixa) {
    const { utils, agenda, permissoes } = NutriDudu;
    const [inicioMin, fimMin] = faixa;
    const altura = (fimMin - inicioMin) * PX_POR_MIN;
    const hojeIso = utils.isoDia(new Date());
    const agora = new Date();
    const meuId = permissoes.idProfissionalAtual();

    const horas = [];
    for (let m = inicioMin; m < fimMin; m += 60) horas.push(m);

    const cabecalhos = colunas.map((col) => `
      <div class="cal-col-titulo${col.dia === hojeIso ? ' hoje' : ''}">
        ${col.titulo}
      </div>`).join('');

    const corpoColunas = colunas.map((col) => {
      const dataDia = utils.paraData(col.dia);
      // Períodos abertos (fundo branco) — o resto fica hachurado como fechado.
      const abertos = col.profIds.flatMap((pid) => agenda.periodosDoDia(pid, col.dia, d.horarios)).map((p) => {
        const ini = Math.max(minutosDoDia(p.inicio), inicioMin);
        const fim = Math.min(minutosDoDia(p.fim), fimMin);
        return fim > ini ? `<div class="cal-aberto" style="top:${(ini - inicioMin) * PX_POR_MIN}px;height:${(fim - ini) * PX_POR_MIN}px"></div>` : '';
      }).join('');

      const inicioDia = new Date(dataDia);
      const fimDia = new Date(dataDia.getFullYear(), dataDia.getMonth(), dataDia.getDate() + 1);
      const bloqueios = d.bloqueios.filter((b) => (!b.profissionalId || col.profIds.includes(b.profissionalId)) &&
        new Date(b.inicio) < fimDia && new Date(b.fim) > inicioDia).map((b) => {
        const ini = Math.max(new Date(b.inicio) < inicioDia ? 0 : minutosDoDia(new Date(b.inicio)), inicioMin);
        const fim = Math.min(new Date(b.fim) >= fimDia ? 24 * 60 : minutosDoDia(new Date(b.fim)), fimMin);
        return fim > ini ? `<div class="cal-bloqueio" style="top:${(ini - inicioMin) * PX_POR_MIN}px;height:${(fim - ini) * PX_POR_MIN}px" title="${utils.escapeHtml(b.motivo)}"><span>${utils.escapeHtml(b.motivo)}</span></div>` : '';
      }).join('');

      const doDia = d.consultas
        .filter((c) => c.status !== 'cancelada' && col.profIds.includes(c.profissionalId) && utils.isoDia(c.inicio) === col.dia)
        .map((c) => ({ ...c, inicio: c.inicio, fim: c.fim, _ini: new Date(c.inicio), _fim: new Date(c.fim) }));
      const dispostos = agenda.distribuirLado(doDia.map((c) => ({ ...c, inicio: c._ini, fim: c._fim })))
        .map((c) => ({ ...c, inicio: c.inicio.toISOString(), fim: c.fim.toISOString() }));
      const eventos = dispostos.map((c) => {
        const privado = meuId && c.profissionalId !== meuId;
        const prof = d.profPorId[c.profissionalId];
        return eventoHtml(c, {
          cor: prof?.cor || '#888',
          nome: d.pessoaPorId[c.pessoaId]?.nome || 'Paciente',
          servico: d.servicoPorId[c.servicoId]?.nome || '',
          movel: ['agendada', 'confirmada'].includes(c.status) && permissoes.podeAgendarPara(c.profissionalId) && new Date(c.inicio) > agora,
        }, inicioMin, privado);
      }).join('');

      const linhaAgora = col.dia === hojeIso && minutosDoDia(agora) >= inicioMin && minutosDoDia(agora) <= fimMin
        ? `<div class="cal-agora" style="top:${(minutosDoDia(agora) - inicioMin) * PX_POR_MIN}px"></div>` : '';

      return `
        <div class="cal-col" data-dia="${col.dia}" data-profs="${col.profIds.join(',')}"${col.profIds.length === 1 ? ` data-prof="${col.profIds[0]}"` : ''} style="height:${altura}px">
          ${horas.map((m) => `<div class="cal-linha" style="top:${(m - inicioMin) * PX_POR_MIN}px"></div>`).join('')}
          ${abertos}${bloqueios}${eventos}${linhaAgora}
        </div>`;
    }).join('');

    return `
      <div class="cal-rolagem">
        <div class="cal" style="--colunas:${colunas.length}" data-inicio-min="${inicioMin}">
          <div class="cal-cabecalho"><div class="cal-canto"></div>${cabecalhos}</div>
          <div class="cal-corpo">
            <div class="cal-horas" style="height:${altura}px">
              ${horas.map((m) => `<span style="top:${(m - inicioMin) * PX_POR_MIN}px">${String(m / 60).padStart(2, '0')}:00</span>`).join('')}
            </div>
            ${corpoColunas}
          </div>
        </div>
      </div>`;
  }

  function mesHtml(dias, d, profIds, mesAtual) {
    const { utils } = NutriDudu;
    const hojeIso = utils.isoDia(new Date());
    const meuId = NutriDudu.permissoes.idProfissionalAtual();
    const cabecalho = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((n) => `<div class="mes-titulo">${n}</div>`).join('');
    const celulas = dias.map((dia) => {
      const data = utils.paraData(dia);
      const doDia = d.consultas
        .filter((c) => c.status !== 'cancelada' && profIds.includes(c.profissionalId) && utils.isoDia(c.inicio) === dia)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      const temBloqueio = d.bloqueios.some((b) => (!b.profissionalId || profIds.includes(b.profissionalId)) &&
        utils.isoDia(b.inicio) <= dia && utils.isoDia(b.fim) >= dia);
      const itens = doDia.slice(0, 3).map((c) => {
        const privado = meuId && c.profissionalId !== meuId;
        const cor = d.profPorId[c.profissionalId]?.cor || '#888';
        return `<span class="mes-item st-${c.status}" style="--cor:${utils.escapeHtml(cor)}">${utils.hora(c.inicio)} ${privado ? 'Ocupado' : utils.escapeHtml((d.pessoaPorId[c.pessoaId]?.nome || '').split(' ')[0])}</span>`;
      }).join('');
      return `
        <button type="button" class="mes-dia${data.getMonth() !== mesAtual ? ' fora' : ''}${dia === hojeIso ? ' hoje' : ''}" data-ir-dia="${dia}"
          aria-label="${utils.escapeHtml(utils.diaPorExtenso(dia))}: ${doDia.length} consulta(s)">
          <span class="mes-numero">${data.getDate()}${temBloqueio ? ' <span class="mes-bloqueio" title="Bloqueio">⦸</span>' : ''}</span>
          ${itens}
          ${doDia.length > 3 ? `<span class="mes-mais">+${doDia.length - 3} mais</span>` : ''}
        </button>`;
    }).join('');
    return `<div class="card mes"><div class="mes-grade">${cabecalho}${celulas}</div></div>`;
  }

  function listaHtml(dias, d, profIds) {
    const { utils, ui } = NutriDudu;
    const meuId = NutriDudu.permissoes.idProfissionalAtual();
    const blocos = dias.map((dia) => {
      const doDia = d.consultas
        .filter((c) => profIds.includes(c.profissionalId) && utils.isoDia(c.inicio) === dia)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      const bloqueios = d.bloqueios.filter((b) => (!b.profissionalId || profIds.includes(b.profissionalId)) &&
        utils.isoDia(b.inicio) <= dia && utils.isoDia(b.fim) >= dia);
      if (!doDia.length && !bloqueios.length) return '';
      return `
        <section class="card agenda-dia">
          <h2 class="card-title">${utils.escapeHtml(utils.diaPorExtenso(dia))}</h2>
          <ul class="lista-simples">
            ${bloqueios.map((b) => `<li class="bloqueio"><span class="hora">${b.diaInteiro ? 'Dia todo' : `${utils.hora(b.inicio)}`}</span><span>Bloqueio: ${utils.escapeHtml(b.motivo)}${b.profissionalId ? ` · ${utils.escapeHtml(d.profPorId[b.profissionalId]?.nome || '')}` : ' · clínica toda'}</span></li>`).join('')}
            ${doDia.map((c) => {
              const privado = meuId && c.profissionalId !== meuId;
              const prof = d.profPorId[c.profissionalId];
              if (privado) return `<li><span class="hora">${utils.hora(c.inicio)}</span><span class="muted">Ocupado</span></li>`;
              return `
                <li class="${c.status === 'cancelada' ? 'cancelada' : ''}">
                  <span class="hora">${utils.hora(c.inicio)}</span>
                  <span class="ponto" style="background:${utils.escapeHtml(prof?.cor || '#888')}" title="${utils.escapeHtml(prof?.nome || '')}"></span>
                  <button type="button" class="agenda-info item-lista" data-consulta="${c.id}">
                    <strong>${utils.escapeHtml(d.pessoaPorId[c.pessoaId]?.nome || 'Paciente')}</strong>
                    <span class="muted small">${utils.escapeHtml(d.servicoPorId[c.servicoId]?.nome || '')} · ${utils.hora(c.inicio)}–${utils.hora(c.fim)} ${iconesConsulta(c)}</span>
                  </button>
                  ${ui.statusConsulta(c.status)}
                </li>`;
            }).join('')}
          </ul>
        </section>`;
    }).join('');
    return blocos || `<div class="card">${ui.vazio('Nenhuma consulta nestes dias.')}</div>`;
  }

  // ---------------- Página ----------------

  async function render(container) {
    const { ui, utils, agenda, permissoes, agendamento } = NutriDudu;
    const d = await agendamento.carregar();
    if (!estado.data) estado.data = utils.isoDia(new Date());

    const meuId = permissoes.idProfissionalAtual();
    if (!meuId) estado._perfilAplicado = false;
    const ativos = d.profissionais.filter((p) => p.ativo);
    // O profissional abre direto na própria agenda.
    if (meuId && !estado.profissionalId && !estado._perfilAplicado) {
      estado.profissionalId = meuId;
      estado._perfilAplicado = true;
    }
    if (estado.profissionalId && !ativos.some((p) => p.id === estado.profissionalId)) estado.profissionalId = '';
    const profsVisiveis = estado.profissionalId ? ativos.filter((p) => p.id === estado.profissionalId) : ativos;
    const profIds = profsVisiveis.map((p) => p.id);

    const dias = diasDaVisao(estado.visao, estado.data);
    let conteudo = '';

    if (estado.visao === 'dia' || estado.visao === 'semana') {
      // Faixa de horas: dos períodos e consultas mostrados, em horas cheias.
      let minimo = 8 * 60;
      let maximo = 18 * 60;
      const diasGrade = estado.visao === 'dia' ? dias : dias.filter((dia, i) => {
        // Domingo só aparece se alguém atende ou há consulta.
        if (i < 6) return true;
        return profIds.some((pid) => agenda.periodosDoDia(pid, dia, d.horarios).length) ||
          d.consultas.some((c) => profIds.includes(c.profissionalId) && utils.isoDia(c.inicio) === dia && c.status !== 'cancelada');
      });
      diasGrade.forEach((dia) => {
        profIds.forEach((pid) => agenda.periodosDoDia(pid, dia, d.horarios).forEach((p) => {
          minimo = Math.min(minimo, minutosDoDia(p.inicio));
          maximo = Math.max(maximo, minutosDoDia(p.fim));
        }));
        d.consultas.filter((c) => profIds.includes(c.profissionalId) && utils.isoDia(c.inicio) === dia && c.status !== 'cancelada').forEach((c) => {
          minimo = Math.min(minimo, minutosDoDia(new Date(c.inicio)));
          maximo = Math.max(maximo, minutosDoDia(new Date(c.fim)));
        });
      });
      const faixa = [Math.floor(minimo / 60) * 60, Math.min(24 * 60, Math.ceil(maximo / 60) * 60)];

      const colunas = estado.visao === 'dia'
        ? profsVisiveis.map((p) => ({
            dia: dias[0], profIds: [p.id],
            titulo: `<span class="com-ponto"><span class="ponto" style="background:${utils.escapeHtml(p.cor)}"></span>${utils.escapeHtml(p.nome)}</span>`,
          }))
        : diasGrade.map((dia) => {
            const dt = utils.paraData(dia);
            return { dia, profIds, titulo: `<button type="button" class="link-dia" data-ir-dia="${dia}">${DIAS_CURTOS[dt.getDay()]} <strong>${dt.getDate()}</strong></button>` };
          });
      conteudo = profsVisiveis.length
        ? `<div class="card card-cal">${gradeHtml(colunas, d, faixa)}</div>`
        : `<div class="card">${ui.vazio('Nenhum profissional ativo.')}</div>`;
    } else if (estado.visao === 'mes') {
      conteudo = mesHtml(dias, d, profIds, utils.paraData(estado.data).getMonth());
    } else {
      conteudo = listaHtml(dias, d, profIds);
    }

    // Ocupação de cada profissional no período mostrado.
    const ocupacao = estado.visao === 'lista' ? '' : profsVisiveis.map((p) => {
      const o = agenda.ocupacao(p.id, dias[0], dias[dias.length - 1], d.ctx);
      if (o.taxa === null) return '';
      return `<span class="chip-info" title="${Math.round(o.ocupadoMin / 60 * 10) / 10} h ocupadas de ${Math.round(o.disponivelMin / 60 * 10) / 10} h disponíveis">
        <span class="ponto" style="background:${utils.escapeHtml(p.cor)}"></span>${utils.escapeHtml(p.nome)}: ${Math.round(o.taxa * 100)}% ocupada</span>`;
    }).join('');

    const podeAgendar = d.profissionais.some((p) => p.ativo && permissoes.podeAgendarPara(p.id));

    container.innerHTML = `<div class="agenda-pagina">
      ${ui.cabecalho('Agenda', '', podeAgendar ? '<button type="button" class="btn btn-primary" data-agendar>+ Agendar</button>' : '')}
      <div class="agenda-barra">
        <div class="agenda-nav">
          <button type="button" class="btn btn-pequeno" data-nav="-1" aria-label="Anterior">‹</button>
          <button type="button" class="btn btn-pequeno" data-hoje>Hoje</button>
          <button type="button" class="btn btn-pequeno" data-nav="1" aria-label="Próximo">›</button>
          <h2 class="agenda-titulo">${utils.escapeHtml(tituloPeriodo(estado.visao, dias))}</h2>
        </div>
        <div class="agenda-controles">
          ${ativos.length > 1 ? `
            <select data-filtro-prof aria-label="Profissional">
              <option value="">Todos os profissionais</option>
              ${ativos.map((p) => `<option value="${p.id}"${p.id === estado.profissionalId ? ' selected' : ''}>${utils.escapeHtml(p.nome)}</option>`).join('')}
            </select>` : ''}
          <div class="segmentos" role="group" aria-label="Visão">
            ${Object.entries(VISOES).map(([v, n]) => `<button type="button" class="segmento${estado.visao === v ? ' ativo' : ''}" data-visao="${v}" aria-pressed="${estado.visao === v}">${n}</button>`).join('')}
          </div>
        </div>
      </div>
      ${ocupacao ? `<div class="agenda-ocupacao">${ocupacao}</div>` : ''}
      <p class="agenda-legenda small muted">✓ confirmada · 🤖 agendada pelo agente · ⤵ encaixe · ⚠ faltou · <span class="leg-realizada">realizada</span> · <span class="leg-fechado"></span> fechado · <span class="leg-bloqueio"></span> bloqueio${estado.visao === 'dia' || estado.visao === 'semana' ? ' · clique num horário livre para agendar; arraste para remarcar' : ''}</p>
      ${conteudo}
    </div>`;

    // Os ouvintes ficam no invólucro, que vai para a tela (o `container` não vai).
    const pagina = container.querySelector('.agenda-pagina');
    const inicioGrade = () => Number(pagina.querySelector('.cal')?.dataset.inicioMin || 8 * 60);

    // ----- Eventos -----
    container.querySelector('[data-agendar]')?.addEventListener('click', () => agendamento.abrir({ dia: estado.data }));
    container.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => navegar(Number(b.dataset.nav))));
    container.querySelector('[data-hoje]').addEventListener('click', () => {
      estado.data = utils.isoDia(new Date());
      NutriDudu.recarregarPagina();
    });
    container.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => {
      estado.visao = b.dataset.visao;
      salvarVisao(estado.visao);
      NutriDudu.recarregarPagina();
    }));
    container.querySelector('[data-filtro-prof]')?.addEventListener('change', (e) => {
      estado.profissionalId = e.target.value;
      NutriDudu.recarregarPagina();
    });

    let ignorarClique = false;
    pagina.addEventListener('click', (e) => {
      if (ignorarClique) { ignorarClique = false; return; }
      const irDia = e.target.closest('[data-ir-dia]');
      if (irDia) {
        estado.data = irDia.dataset.irDia;
        estado.visao = 'dia';
        NutriDudu.recarregarPagina();
        return;
      }
      const consulta = e.target.closest('[data-consulta]');
      if (consulta) {
        agendamento.detalhes(consulta.dataset.consulta);
        return;
      }
      // Clique num espaço vazio da grade: agenda naquele horário.
      const col = e.target.closest('.cal-col');
      if (col && !e.target.closest('.evento') && podeAgendar) {
        const rect = col.getBoundingClientRect();
        const min = Math.floor(((e.clientY - rect.top) / PX_POR_MIN + inicioGrade()) / PASSO_CLIQUE) * PASSO_CLIQUE;
        const horaClique = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
        // Na semana com vários profissionais, sugere quem atende naquele horário.
        const candidatos = col.dataset.profs.split(',').filter((pid) => permissoes.podeAgendarPara(pid));
        const inicio = agenda.dataComHora(col.dataset.dia, horaClique);
        const atende = candidatos.find((pid) => agenda.periodosDoDia(pid, col.dataset.dia, d.horarios).some((p) => inicio >= p.inicio && inicio < p.fim));
        agendamento.abrir({ dia: col.dataset.dia, hora: horaClique, profissionalId: atende || candidatos[0] || '' });
      }
    });

    // ----- Arrastar para remarcar (mouse) -----
    let arrasto = null;
    pagina.addEventListener('pointerdown', (e) => {
      const ev = e.target.closest('.evento[data-movel]');
      if (!ev || e.pointerType !== 'mouse' || e.button !== 0) return;
      const rect = ev.getBoundingClientRect();
      arrasto = { ev, x0: e.clientX, y0: e.clientY, offY: e.clientY - rect.top, movendo: false };
      ev.setPointerCapture(e.pointerId);
    });
    pagina.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x0;
      const dy = e.clientY - arrasto.y0;
      if (!arrasto.movendo && Math.hypot(dx, dy) < 6) return;
      arrasto.movendo = true;
      arrasto.ev.classList.add('arrastando');
      arrasto.ev.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    pagina.addEventListener('pointerup', async (e) => {
      if (!arrasto) return;
      const a = arrasto;
      arrasto = null;
      if (!a.movendo) return; // foi só um clique: o "click" abre os detalhes
      ignorarClique = true;
      a.ev.style.visibility = 'hidden';
      const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-col');
      a.ev.style.visibility = '';
      a.ev.style.transform = '';
      a.ev.classList.remove('arrastando');
      if (!alvo) return;
      const c = d.consultas.find((x) => x.id === a.ev.dataset.consulta);
      const rect = alvo.getBoundingClientRect();
      const min = Math.round(((e.clientY - a.offY - rect.top) / PX_POR_MIN + inicioGrade()) / PASSO_CLIQUE) * PASSO_CLIQUE;
      const novoInicio = agenda.dataComHora(alvo.dataset.dia, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
      const profDestino = alvo.dataset.prof || c.profissionalId;
      if (+novoInicio === +new Date(c.inicio) && profDestino === c.profissionalId) return;
      await agendamento.remarcarPara(c, novoInicio, profDestino);
    });
    pagina.addEventListener('pointercancel', () => {
      if (arrasto) {
        arrasto.ev.style.transform = '';
        arrasto.ev.classList.remove('arrastando');
        arrasto = null;
      }
    });

    // Rola até o horário atual (ou o início do expediente) na grade.
    requestAnimationFrame(() => {
      const rolagem = document.querySelector('.cal-rolagem');
      const linhaAgora = document.querySelector('.cal-agora');
      if (rolagem && linhaAgora) rolagem.scrollTop = Math.max(0, linhaAgora.offsetTop - 120);
    });
  }

  return { titulo: 'Agenda', render, estado };
})();
