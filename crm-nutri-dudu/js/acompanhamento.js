// Plano de acompanhamento: objetivos em camadas, meta com data, como saber que está dando certo,
// motivação, apetite, dificuldades, momentos de fome e rotina. Preenchido junto com o paciente
// na consulta; cada atualização vira uma versão nova (dá para ver como os objetivos mudaram).
// Também calcula o "radar de engajamento" (em dia / atenção / sumindo).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.acompanhamento = (function () {
  const DIFICULDADES = [
    'Controle de quantidade', 'Beliscar fora de hora', 'Fome à noite', 'Ansiedade / compulsão', 'Doces',
    'Comer fora / delivery', 'Álcool / fim de semana', 'Rotina corrida', 'Falta de planejamento', 'Pular refeições',
    'Pouca água', 'Sono ruim', 'Intestino preso', 'Gases / desconforto', 'Pouca proteína', 'Treino irregular',
  ];

  const TEXTOS = [
    ['objetivoPrincipal', 'Objetivo principal', 'Ex.: correr 10 km abaixo de 50 min e baixar 2 kg'],
    ['objetivoCurto', 'Objetivo de curto prazo (3 meses)', ''],
    ['objetivoMedio', 'Objetivo de médio prazo (6 a 12 meses)', ''],
    ['objetivoLongo', 'Objetivo de longo prazo (anos)', ''],
  ];

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vazio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

  /** Versão mais recente (ou null). */
  function atual(lista = []) {
    return [...lista].sort((a, b) => (Number(b.versao) || 0) - (Number(a.versao) || 0) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))[0] || null;
  }

  /** Dias até a data da meta (negativo: já passou; null: sem data). */
  function diasAte(data, agora = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ''));
    if (!m) return null;
    const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    return Math.round((alvo - hoje) / 864e5);
  }
  const textoContagem = (dias) => (dias === null ? '' : dias > 1 ? `faltam ${dias} dias` : dias === 1 ? 'é amanhã' : dias === 0 ? 'é hoje!' : `foi há ${-dias} dias`);

  /**
   * Campos do formulário (nomes com o prefixo "ac_", para conviver com outros formulários).
   * grande: letra maior (modo consulta).
   */
  function formulario(d = {}, { f = NutriDudu.form } = {}) {
    const rot = d.rotina || {};
    const dif = new Set(d.dificuldades || []);
    const outras = (d.dificuldades || []).filter((x) => !DIFICULDADES.includes(x));
    return `
      <div class="ac-form">
        <h4 class="ac-sec">🎯 Objetivos</h4>
        ${TEXTOS.map(([id, rotulo, ph]) => f.areaTexto(`ac_${id}`, rotulo, d[id] || '', { linhas: 2, placeholder: ph })).join('')}
        <div class="grade-2">
          ${f.texto('ac_metaTitulo', 'Meta com data (prova, viagem, evento…)', d.meta?.titulo || '', { placeholder: 'Ex.: Maratona de Londres' })}
          ${f.texto('ac_metaData', 'Data da meta', d.meta?.data || '', { tipo: 'date' })}
        </div>
        ${f.areaTexto('ac_sinaisSucesso', 'Como vamos saber que está dando certo? (nas palavras do paciente)', d.sinaisSucesso || '', { linhas: 3, placeholder: 'Ex.: mais disposição nos treinos, apetite controlado, sem me sentir inchado' })}
        ${f.areaTexto('ac_motivacao', 'Motivação', d.motivacao || '', { linhas: 2 })}

        <h4 class="ac-sec">🍽️ Fome e dificuldades</h4>
        <div class="campo"><label for="ac_apetite">Apetite (0 a 10): <strong data-ac-apetite-val>${vazio(d.apetite) ? '—' : esc(d.apetite)}</strong></label>
          <input type="range" id="ac_apetite" name="ac_apetite" min="0" max="10" step="1" value="${vazio(d.apetite) ? 5 : esc(d.apetite)}" data-ac-apetite ${vazio(d.apetite) ? 'data-intocado="1"' : ''}></div>
        <div class="campo"><span class="campo-rotulo">Maiores dificuldades</span>
          <div class="ac-tags">${DIFICULDADES.map((x) => `<label class="ac-tag"><input type="checkbox" name="ac_dif" value="${esc(x)}"${dif.has(x) ? ' checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div></div>
        ${f.texto('ac_difOutras', 'Outras dificuldades', outras.join(', '), { placeholder: 'Separe por vírgula' })}
        ${f.texto('ac_momentosFome', 'Dias e momentos de mais fome', d.momentosFome || '', { placeholder: 'Ex.: pós-treino e quando chega em casa' })}

        <h4 class="ac-sec">🕒 Rotina</h4>
        <div class="grade-2">
          ${f.texto('ac_acorda', 'Acorda às', rot.acorda || '', { tipo: 'time' })}
          ${f.texto('ac_dorme', 'Dorme às', rot.dorme || '', { tipo: 'time' })}
          ${f.texto('ac_trabalho', 'Trabalho (horário)', rot.trabalho || '', { placeholder: 'Ex.: 9h às 18h' })}
          ${f.texto('ac_treino', 'Treino (modalidade e horário)', rot.treino || '', { placeholder: 'Ex.: corrida 5h30, musculação 19h' })}
        </div>
        ${f.areaTexto('ac_observacoes', 'Combinados e observações', d.observacoes || '', { linhas: 3 })}
      </div>`;
  }

  /** Lê o formulário (null se tudo vazio). */
  function ler(form, { f = NutriDudu.form } = {}) {
    const v = (n) => f.valor(form, `ac_${n}`);
    const apetiteEl = form.elements.ac_apetite;
    const dif = [...form.querySelectorAll('input[name="ac_dif"]:checked')].map((i) => i.value);
    v('difOutras').split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => { if (!dif.includes(x)) dif.push(x); });
    return {
      objetivoPrincipal: v('objetivoPrincipal'), objetivoCurto: v('objetivoCurto'), objetivoMedio: v('objetivoMedio'), objetivoLongo: v('objetivoLongo'),
      meta: { titulo: v('metaTitulo'), data: v('metaData') },
      sinaisSucesso: v('sinaisSucesso'), motivacao: v('motivacao'),
      apetite: apetiteEl && !apetiteEl.dataset.intocado ? Number(apetiteEl.value) : null,
      dificuldades: dif, momentosFome: v('momentosFome'),
      rotina: { acorda: v('acorda'), dorme: v('dorme'), trabalho: v('trabalho'), treino: v('treino') },
      observacoes: v('observacoes'),
    };
  }

  /** Liga o controle de apetite (mostra o número e marca como "mexido"). */
  function ligar(raiz) {
    raiz.querySelectorAll('[data-ac-apetite]').forEach((r) => r.addEventListener('input', () => {
      delete r.dataset.intocado;
      const val = raiz.querySelector('[data-ac-apetite-val]');
      if (val) val.textContent = r.value;
    }));
  }

  const normal = (d) => JSON.stringify({ ...d, criadoEm: undefined, atualizadoEm: undefined, id: undefined, versao: undefined, pessoaId: undefined, consultaId: undefined, autor: undefined });
  const conteudo = (d) => {
    if (!d) return '';
    const { objetivoPrincipal, objetivoCurto, objetivoMedio, objetivoLongo, meta, sinaisSucesso, motivacao, apetite, dificuldades, momentosFome, rotina, observacoes } = d;
    return normal({ objetivoPrincipal, objetivoCurto, objetivoMedio, objetivoLongo, meta, sinaisSucesso, motivacao, apetite, dificuldades, momentosFome, rotina, observacoes });
  };
  /** Mudou alguma coisa em relação à versão anterior? */
  const mudou = (anterior, novo) => conteudo(anterior) !== conteudo(novo);
  const estaVazio = (d) => !d || (!d.objetivoPrincipal && !d.objetivoCurto && !d.objetivoMedio && !d.objetivoLongo && !d.meta?.titulo && !d.meta?.data
    && !d.sinaisSucesso && !d.motivacao && vazio(d.apetite) && !(d.dificuldades || []).length && !d.momentosFome && !d.observacoes
    && !Object.values(d.rotina || {}).some(Boolean));

  /** Grava uma versão nova (só se mudou). Devolve o registro criado ou null. */
  async function salvarVersao(pessoaId, dados, { consultaId = null, lista = null } = {}) {
    const { store, permissoes } = NutriDudu;
    const todas = lista || await store.list('acompanhamentos', (a) => a.pessoaId === pessoaId);
    const ant = atual(todas);
    if (!mudou(ant, dados) || (!ant && estaVazio(dados))) return null;
    const novo = await store.create('acompanhamentos', { pessoaId, consultaId, versao: (Number(ant?.versao) || 0) + 1, autor: permissoes.atual(), ...dados });
    await store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
      descricao: `Plano de acompanhamento atualizado (versão ${novo.versao}).`,
    });
    return novo;
  }

  /**
   * Radar de engajamento. ctx: { pessoa, consultas, pacotes, checkins, geral }.
   * Devolve { nivel: 'verde'|'amarelo'|'vermelho', rotulo, motivos: [] }.
   */
  function radar(ctx, agora = new Date()) {
    const { pessoa } = ctx;
    if (pessoa.status === 'inativo') return { nivel: 'vermelho', rotulo: 'Inativo', motivos: ['Marcado como inativo.'], situacao: 'inativo' };
    const alertas = NutriDudu.alertas ? NutriDudu.alertas.daPessoa(pessoa, { consultas: ctx.consultas || [], pacotes: ctx.pacotes || [], checkins: ctx.checkins || [] }, ctx.geral || {}, agora) : [];
    const motivos = alertas.map((a) => `${a.nome}: ${a.texto}`);
    // Check-ins sem resposta: os 2 últimos com prazo vencido.
    const vencidos = (ctx.checkins || []).filter((c) => !c.cancelado && c.prazo && new Date(c.prazo) < agora)
      .sort((a, b) => String(b.enviadoEm || b.criadoEm || '').localeCompare(String(a.enviadoEm || a.criadoEm || ''))).slice(0, 2);
    const semResposta = vencidos.length === 2 && vencidos.every((c) => !c.respondidoEm);
    if (semResposta) motivos.push('Não respondeu os 2 últimos check-ins.');
    // Situação principal (para a mensagem pronta do WhatsApp).
    const tipo = alertas[0]?.tipo;
    const situacao = alertas.some((a) => a.tipo === 'sumido') ? 'sumido' : tipo === 'pacote_atrasado' ? 'pacote' : tipo || (semResposta ? 'checkin_sem_resposta' : null);
    if (alertas.some((a) => a.tipo === 'sumido')) return { nivel: 'vermelho', rotulo: 'Sumindo', motivos, situacao };
    if (motivos.length) return { nivel: 'amarelo', rotulo: 'Atenção', motivos, situacao };
    return { nivel: 'verde', rotulo: 'Em dia', motivos: [] };
  }

  const ICONE_RADAR = { verde: '🟢', amarelo: '🟡', vermelho: '🔴' };

  /** O que o paciente vê na área dele: objetivos e a meta com data. */
  function publico(d, agora = new Date()) {
    if (!d || estaVazio(d)) return null;
    const dias = d.meta?.data ? diasAte(d.meta.data, agora) : null;
    return {
      objetivoPrincipal: d.objetivoPrincipal || '', objetivoCurto: d.objetivoCurto || '', objetivoMedio: d.objetivoMedio || '', objetivoLongo: d.objetivoLongo || '',
      sinaisSucesso: d.sinaisSucesso || '',
      meta: d.meta?.titulo || d.meta?.data ? { titulo: d.meta.titulo || '', data: d.meta.data || '', dias } : null,
    };
  }

  return { DIFICULDADES, atual, diasAte, textoContagem, formulario, ler, ligar, mudou, estaVazio, salvarVersao, radar, ICONE_RADAR, publico };
})();
