// Aba "Plano de acompanhamento" da ficha: dados rápidos, radar de engajamento, objetivos e
// combinados. "Modo consulta" abre em tela cheia, com letra grande, para preencher junto com o paciente.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.acompanhamentoFicha = (function () {
  const A = () => NutriDudu.acompanhamento;
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');
  const quebra = (t) => esc(t).replace(/\n/g, '<br>');

  function tempoDesde(iso) {
    const dias = NutriDudu.utils.diasEntre(iso, new Date());
    if (dias < 30) return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    const meses = Math.floor(dias / 30);
    if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
    const anos = Math.floor(meses / 12); const resto = meses % 12;
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''}`;
  }

  /** Dados rápidos (do cadastro, das avaliações e das consultas). */
  function dadosRapidos(c) {
    const { utils } = NutriDudu;
    const p = c.pessoa;
    const avs = c.avaliacoesOrdenadas || [];
    const pesoInicial = avs.find((x) => x.av.pesoKg)?.av.pesoKg;
    const pesoAtual = [...avs].reverse().find((x) => x.av.pesoKg)?.av.pesoKg;
    const altura = [...avs].reverse().find((x) => x.av.alturaCm)?.av.alturaCm;
    const primeira = (c.consultas || []).filter((x) => x.status === 'realizada').sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    const desde = p.clienteDesde || primeira?.inicio;
    const idade = utils.idade(p.dataNascimento);
    const itens = [
      ['Peso inicial', pesoInicial ? `${String(pesoInicial).replace('.', ',')} kg` : '—'],
      ['Peso atual', pesoAtual ? `${String(pesoAtual).replace('.', ',')} kg` : '—'],
      ['Altura', altura ? `${altura} cm` : '—'],
      ['Idade', idade !== null ? `${idade} anos` : '—'],
      ['Cidade', p.cidade || '—'],
      ['Em acompanhamento há', desde ? tempoDesde(desde) : '—'],
    ];
    return `<div class="ac-rapidos">${itens.map(([r, v]) => `<div><span>${esc(r)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
  }

  function blocoRadar(r) {
    return `<div class="ac-radar ac-radar-${r.nivel}">
      <strong>${A().ICONE_RADAR[r.nivel]} Radar de engajamento: ${esc(r.rotulo)}</strong>
      ${r.motivos.length ? `<ul class="small">${r.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="small muted">Consultas em dia, sem alertas de retorno e respondendo os check-ins.</p>'}
    </div>`;
  }

  /** Conteúdo do plano (só leitura). grande = modo consulta. */
  function visualizar(d) {
    if (!d) return '';
    const linha = (rotulo, valor) => (valor ? `<div class="ac-item"><span>${esc(rotulo)}</span><p>${quebra(valor)}</p></div>` : '');
    const dias = d.meta?.data ? A().diasAte(d.meta.data) : null;
    const rot = d.rotina || {};
    const rotina = [['Acorda', rot.acorda], ['Trabalho', rot.trabalho], ['Treino', rot.treino], ['Dorme', rot.dorme]].filter(([, v]) => v);
    return `
      ${d.meta?.titulo || d.meta?.data ? `<div class="ac-meta"><span>🏁 ${esc(d.meta.titulo || 'Meta')}</span>
        ${d.meta.data ? `<strong>${esc(NutriDudu.utils.data(d.meta.data))} · ${esc(A().textoContagem(dias))}</strong>` : ''}</div>` : ''}
      <div class="ac-grade">
        <section><h4>🎯 Objetivos</h4>
          ${linha('Principal', d.objetivoPrincipal)}${linha('Curto prazo (3 meses)', d.objetivoCurto)}
          ${linha('Médio prazo (6 a 12 meses)', d.objetivoMedio)}${linha('Longo prazo (anos)', d.objetivoLongo)}
          ${linha('Como vamos saber que está dando certo', d.sinaisSucesso)}${linha('Motivação', d.motivacao)}
        </section>
        <section><h4>🍽️ Fome e dificuldades</h4>
          ${d.apetite !== null && d.apetite !== undefined ? `<div class="ac-item"><span>Apetite</span><p><strong>${esc(d.apetite)}/10</strong></p></div>` : ''}
          ${(d.dificuldades || []).length ? `<div class="ac-item"><span>Maiores dificuldades</span><p class="ac-chips">${d.dificuldades.map((x) => `<span>${esc(x)}</span>`).join('')}</p></div>` : ''}
          ${linha('Momentos de mais fome', d.momentosFome)}
          <h4 style="margin-top:14px">🕒 Rotina</h4>
          ${rotina.length ? `<div class="ac-item"><p>${rotina.map(([r, v]) => `<b>${esc(r)}:</b> ${esc(v)}`).join('<br>')}</p></div>` : '<p class="muted small">Não informada.</p>'}
          ${linha('Combinados e observações', d.observacoes)}
        </section>
      </div>`;
  }

  function aba(c) {
    const { utils, permissoes } = NutriDudu;
    const lista = c.acompanhamentos || [];
    const d = A().atual(lista);
    const r = A().radar({ pessoa: c.pessoa, consultas: c.consultas, pacotes: c.pacotes, checkins: c.checkins, geral: c.geral });
    const pode = permissoes.pode('verClinico');
    return `
      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Plano de acompanhamento</h2>
          ${pode ? `<span class="acoes-linha sem-margem">
            <button type="button" class="btn btn-pequeno btn-primary" data-ac-consulta>🖥️ Modo consulta</button>
            <button type="button" class="btn btn-pequeno" data-ac-editar>${d ? 'Editar' : 'Preencher'}</button>
            ${lista.length > 1 ? `<button type="button" class="btn btn-pequeno" data-ac-historico>Histórico (${lista.length})</button>` : ''}
          </span>` : ''}
        </div>
        ${dadosRapidos(c)}
        ${blocoRadar(r)}
        ${d ? visualizar(d) : '<div class="vazio"><p>Ainda não preenchido.</p><p class="small muted">Na próxima consulta, toque em <strong>Modo consulta</strong> e preencha os objetivos junto com o paciente.</p></div>'}
        ${d ? `<p class="small muted" style="margin-top:12px">Versão ${esc(d.versao)} · atualizado em ${esc(utils.data(d.criadoEm))}${d.autor ? ` por ${esc(NutriDudu.config.PERFIS[d.autor] || d.autor)}` : ''}</p>` : ''}
      </section>`;
  }

  /** Editar (normal ou em tela cheia para preencher junto com o paciente). */
  function editar(c, { consulta = false } = {}) {
    const { modal, ui } = NutriDudu;
    const d = A().atual(c.acompanhamentos || []) || {};
    const nome = c.pessoa.nome.split(' ')[0];
    const dlg = modal.formulario({
      titulo: consulta ? `Plano de acompanhamento · ${c.pessoa.nome}` : `Plano de acompanhamento de ${nome}`,
      largo: true,
      textoSalvar: 'Salvar',
      corpo: `${consulta ? `<p class="muted">Preencha junto com ${esc(nome)}. Cada vez que salvar, fica guardada uma versão.</p>` : ''}${A().formulario(d)}`,
      ler: (form) => A().ler(form),
      validar: () => ({}),
      salvar: async (dados) => {
        const novo = await A().salvarVersao(c.pessoa.id, dados, { lista: c.acompanhamentos });
        ui.toast(novo ? 'Plano de acompanhamento salvo.' : 'Nada mudou.');
      },
      aoAbrir: (form) => A().ligar(form),
    });
    if (consulta) dlg.classList.add('ac-tela-cheia');
  }

  function historico(c) {
    const { modal, utils } = NutriDudu;
    const lista = [...(c.acompanhamentos || [])].sort((a, b) => (Number(b.versao) || 0) - (Number(a.versao) || 0));
    const dlg = modal.painel({
      titulo: 'Histórico do plano de acompanhamento',
      corpo: lista.map((v) => `<details class="ac-versao"${v === lista[0] ? ' open' : ''}><summary><strong>Versão ${esc(v.versao)}</strong> · ${esc(utils.data(v.criadoEm))}${v.autor ? ` · ${esc(NutriDudu.config.PERFIS[v.autor] || v.autor)}` : ''}</summary>${visualizar(v)}</details>`).join(''),
    });
    dlg.classList.add('modal-largo');
  }

  function ligar(container, c) {
    container.querySelector('[data-ac-editar]')?.addEventListener('click', () => editar(c));
    container.querySelector('[data-ac-consulta]')?.addEventListener('click', () => editar(c, { consulta: true }));
    container.querySelector('[data-ac-historico]')?.addEventListener('click', () => historico(c));
  }

  return { aba, ligar, editar, visualizar };
})();
