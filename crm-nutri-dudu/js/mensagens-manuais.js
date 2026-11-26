// Mensagens do dia pelo WhatsApp do próprio profissional (sem o WhatsApp oficial da clínica):
// o sistema monta a lista do que precisa sair hoje e o texto pronto; um toque abre o WhatsApp
// com a mensagem e marca como enviada. Nada é enviado sozinho.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.mensagensManuais = (function () {
  const STATUS_FUTURO = ['agendada', 'confirmada'];
  const HORA = 3600 * 1000;
  const DIA = 24 * HORA;
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');
  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
  const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  const TIPOS = {
    lembrete: { icone: '📅', nome: 'Lembrete de consulta' },
    pre: { icone: '📝', nome: 'Pré-anamnese' },
    checkin: { icone: '📋', nome: 'Check-in' },
    checkinLembrete: { icone: '⏰', nome: 'Lembrete do check-in' },
    aniversario: { icone: '🎂', nome: 'Aniversário' },
    cobranca: { icone: '💰', nome: 'Pagamento em atraso' },
  };

  /** Texto de um modelo, preenchido e no "gênero" da pessoa (só muda os emojis). */
  function texto(id, valores, pessoa) {
    const MA = NutriDudu.mensagensAutomaticas;
    let t = MA.preencher(MA.MODELOS[id].corpo('clínica'), valores);
    // No WhatsApp pessoal não existem os botões do modelo aprovado.
    if (id === 'lembrete') t = t.replace(/\s*É só tocar num botão aqui embaixo 👇/, '');
    return MA.paraGenero(t, pessoa);
  }

  const telefone = (p) => {
    const d = NutriDudu.utils.soDigitos(p?.telefone);
    if (d.length === 10 || d.length === 11) return `55${d}`;
    if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d;
    return '';
  };

  /**
   * O que precisa sair hoje. d: { pessoas, consultas, lancamentos, checkins, checkinCfg, geral, profissionais }
   * Devolve [{ chave, tipo, pessoa, detalhe, ... }] (o texto de alguns só existe depois de criar o link).
   */
  function pendentes(d, agora = new Date()) {
    const { utils, calculos } = NutriDudu;
    const pessoaPor = Object.fromEntries(d.pessoas.map((p) => [p.id, p]));
    const profPor = Object.fromEntries((d.profissionais || []).map((p) => [p.id, p]));
    const itens = [];
    const add = (x) => { if (x.pessoa && telefone(x.pessoa) && !x.pessoa.automacoesDesligadas) itens.push(x); };
    const consultas = d.consultas.filter((c) => c.status !== 'cancelada');

    // 1. Lembrete: consultas de agora até o fim de amanhã ainda sem lembrete (e sem confirmação).
    const fimAmanha = utils.inicioDoDia(agora); fimAmanha.setDate(fimAmanha.getDate() + 2);
    consultas.filter((c) => c.status === 'agendada' && new Date(c.inicio) > agora && new Date(c.inicio) < fimAmanha && !c.manual?.lembrete && !c.automacoes?.lembrete?.ok)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .forEach((c) => {
        const p = pessoaPor[c.pessoaId];
        const dia = utils.diaPorExtenso(c.inicio).toLowerCase();
        let t = texto('lembrete', [primeiroNome(p?.nome), dia, utils.hora(c.inicio)], p);
        const link = String(profPor[c.profissionalId]?.linkOnline || '').trim();
        if (c.tipo === 'online' && link) t += ` A consulta é online, por esse link: ${link}`;
        add({ chave: `lembrete:${c.id}`, tipo: 'lembrete', pessoa: p, consulta: c, detalhe: `${utils.isoDia(c.inicio) === utils.isoDia(agora) ? 'Hoje' : 'Amanhã'} às ${utils.hora(c.inicio)}${c.tipo === 'online' ? ' · online' : ''}`, texto: t });
      });

    // 2. Pré-anamnese: primeira consulta futura (mais de 2 h pela frente), sem formulário enviado nem preenchido.
    const comRealizada = new Set(consultas.filter((c) => c.status === 'realizada').map((c) => c.pessoaId));
    const jaTemPre = new Set(consultas.filter((c) => ['enviada', 'preenchida'].includes(c.preAnamnese?.status) || c.manual?.pre || c.automacoes?.preAnamnese?.ok).map((c) => c.pessoaId));
    const primeiraFutura = {};
    consultas.filter((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio) - agora > 2 * HORA)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .forEach((c) => { if (!primeiraFutura[c.pessoaId]) primeiraFutura[c.pessoaId] = c; });
    Object.values(primeiraFutura).forEach((c) => {
      if (comRealizada.has(c.pessoaId) || jaTemPre.has(c.pessoaId)) return;
      add({ chave: `pre:${c.id}`, tipo: 'pre', pessoa: pessoaPor[c.pessoaId], consulta: c, detalhe: `Primeira consulta ${utils.data(c.inicio).slice(0, 5)} às ${utils.hora(c.inicio)}`, precisaLink: true });
    });

    // 3. Check-in programado que já deu a hora (até 1 dia de atraso).
    const C = NutriDudu.checkin;
    if (C && d.checkinCfg) {
      d.pessoas.forEach((p) => {
        const prog = p.checkinProgramado;
        if (!prog?.ativo || prog.pausado || p.status === 'inativo') return;
        const slot = C.ultimoEnvioDevido(prog, agora);
        if (!slot || prog.ultimoSlot === C.isoLocal(slot) || agora - slot > DIA) return;
        const q = d.checkinCfg.questionarios.find((x) => x.id === prog.questionarioId && x.ativo !== false);
        if (!q) return;
        add({ chave: `checkin:${p.id}:${C.isoLocal(slot)}`, tipo: 'checkin', pessoa: p, questionario: q, slot, detalhe: `${q.titulo} · programado ${NOMES_DIA[slot.getDay()]} às ${utils.hora(slot)}`, precisaLink: true });
      });
      // 4. Lembrete do check-in: último dia do prazo, ainda sem resposta.
      (d.checkins || []).filter((ck) => !ck.respondidoEm && !ck.cancelado && ck.codigo && ck.prazo && !ck.lembreteEm
        && utils.isoDia(ck.prazo) === utils.isoDia(agora) && new Date(ck.prazo) > agora)
        .forEach((ck) => {
          const p = pessoaPor[ck.pessoaId];
          add({ chave: `ckl:${ck.id}`, tipo: 'checkinLembrete', pessoa: p, checkin: ck, detalhe: `${ck.titulo} · prazo termina hoje`,
            texto: texto('checkinLembrete', [primeiroNome(p?.nome), String(ck.titulo || 'check-in').toLowerCase(), 'hoje', linkCheckin(ck.codigo)], p) });
        });
    }

    // 5. Aniversário hoje (clientes ativos e ex-clientes).
    const md = utils.isoDia(agora).slice(5);
    const chaveAno = `aniversario_${agora.getFullYear()}`;
    d.pessoas.filter((p) => ['ativo', 'inativo'].includes(p.status) && p.dataNascimento && String(p.dataNascimento).slice(5, 10) === md && !p.automacoes?.[chaveAno]?.ok)
      .forEach((p) => add({ chave: `aniv:${p.id}`, tipo: 'aniversario', pessoa: p, detalhe: 'Faz aniversário hoje 🎉', texto: texto('aniversario', [primeiroNome(p.nome)], p) }));

    // 6. Pagamento em atraso (não vai para permuta); de novo só depois de 7 dias.
    (d.lancamentos || []).filter((l) => calculos.lancamentoAtrasado(l, agora) && utils.diasEntre(l.vencimento, agora) >= 1)
      .forEach((l) => {
        const p = pessoaPor[l.pessoaId];
        if (!p || p.permuta) return;
        const ultima = l.manual?.cobranca || l.automacoes?.cobranca?.em;
        if (ultima && agora - new Date(ultima) < 7 * DIA) return;
        add({ chave: `cob:${l.id}`, tipo: 'cobranca', pessoa: p, lancamento: l, detalhe: `${l.descricao} · ${utils.moeda(calculos.valorLiquido(l))} · venceu ${utils.data(l.vencimento)}`,
          texto: texto('cobranca', [primeiroNome(p.nome), l.descricao || 'consulta', utils.moeda(calculos.valorLiquido(l)), utils.data(l.vencimento), d.geral?.chavePix || 'informada pela recepção'], p) });
      });

    const ordem = Object.keys(TIPOS);
    return itens.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
  }

  const base = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  const linkCheckin = (codigo) => `${base()}c/${codigo}`;

  /** Cria o que falta (link do check-in ou da pré-anamnese), devolve o texto e grava "enviado". */
  async function preparar(item) {
    const { store, utils, permissoes } = NutriDudu;
    const agoraIso = new Date().toISOString();
    if (item.tipo === 'checkin') {
      const C = NutriDudu.checkin;
      const ficha = NutriDudu.checkinFicha;
      const cfg = C.configuracao((await store.get('configuracoes', 'checkin')) || {});
      const p = (await store.get('pessoas', item.pessoa.id)) || item.pessoa;
      const prog = p.checkinProgramado;
      const codigo = ficha.novoCodigo();
      const fim = new Date(item.slot); fim.setDate(fim.getDate() + (Number(prog.prazoDias) || 3)); fim.setHours(23, 59, 0, 0);
      await store.create('checkins', {
        pessoaId: p.id, questionarioId: item.questionario.id, titulo: item.questionario.titulo, perguntas: C.montarPerguntas(item.questionario, cfg.perguntas), codigo,
        enviadoEm: agoraIso, prazo: fim.toISOString(), enviadoPor: permissoes.atual(), manual: true, respostas: null, score: null,
      }, { id: await ficha.resumo(codigo) });
      await store.update('pessoas', p.id, { checkinProgramado: { ...prog, ultimoSlot: C.isoLocal(item.slot) } });
      const prazo = `${NOMES_DIA[fim.getDay()]} (${utils.data(fim).slice(0, 5)})`;
      return texto('checkinDisponivel', [primeiroNome(p.nome), item.questionario.titulo.toLowerCase(), linkCheckin(codigo), prazo], p);
    }
    if (item.tipo === 'pre') {
      const { link } = await NutriDudu.nuvem.linkPreAnamnese(item.consulta.id);
      const c = item.consulta;
      await store.update('consultas', c.id, { manual: { ...(c.manual || {}), pre: agoraIso } });
      const quando = `${utils.diaPorExtenso(c.inicio).toLowerCase()} às ${utils.hora(c.inicio)}`;
      return texto('preAnamnese', [primeiroNome(item.pessoa.nome), quando, link], item.pessoa);
    }
    return item.texto;
  }

  async function marcarEnviado(item, { pulou = false } = {}) {
    const { store } = NutriDudu;
    const agoraIso = new Date().toISOString();
    if (item.tipo === 'lembrete') await store.update('consultas', item.consulta.id, { manual: { ...(item.consulta.manual || {}), lembrete: agoraIso } });
    if (item.tipo === 'checkinLembrete') await store.update('checkins', item.checkin.id, { lembreteEm: agoraIso });
    if (item.tipo === 'aniversario') {
      const p = (await store.get('pessoas', item.pessoa.id)) || item.pessoa;
      await store.update('pessoas', p.id, { automacoes: { ...(p.automacoes || {}), [`aniversario_${new Date().getFullYear()}`]: { em: agoraIso, ok: true, via: 'manual' } } });
    }
    if (item.tipo === 'cobranca') await store.update('lancamentos', item.lancamento.id, { manual: { ...(item.lancamento.manual || {}), cobranca: agoraIso } });
    await store.create('interacoes', {
      pessoaId: item.pessoa.id, dataHora: agoraIso, tipo: 'nota', autor: NutriDudu.permissoes.atual(), automatico: true,
      descricao: pulou ? `${TIPOS[item.tipo].nome}: marcado como já enviado.` : `${TIPOS[item.tipo].nome}: mensagem aberta no WhatsApp para enviar.`,
    });
  }

  /** Cartão do Dashboard. */
  function cartao(itens) {
    const lista = itens.map((x, i) => `
      <li>
        <span class="item-acao-texto"><strong>${TIPOS[x.tipo].icone} ${esc(TIPOS[x.tipo].nome)}</strong> · <a href="#/clientes/${encodeURIComponent(x.pessoa.id)}">${esc(x.pessoa.nome)}</a>
          <span class="muted small bloco">${esc(x.detalhe)}</span></span>
        <span class="item-acao-botoes"><button type="button" class="btn btn-pequeno btn-primary" data-msg-manual="${i}">Abrir no WhatsApp</button>
          <button type="button" class="btn btn-pequeno" data-msg-pular="${i}" title="Já mandei ou não precisa">Já foi</button></span>
      </li>`).join('');
    return `
      <section class="card acao mm-cartao" data-lista="mensagens">
        <div class="secao-cabecalho">
          <h2 class="card-title">📤 Mensagens pra mandar hoje</h2>
          <span class="contador${itens.length ? ' tem' : ''}">${itens.length}</span>
        </div>
        <p class="muted small card-sub">Pelo seu WhatsApp: toque em "Abrir no WhatsApp", confira e envie. Os links de check-in e pré-anamnese são criados na hora.</p>
        ${itens.length ? `<ul class="lista-acao">${lista}</ul>` : '<p class="tudo-certo">✓ Nenhuma mensagem pendente agora.</p>'}
      </section>`;
  }

  function ligar(raiz, itens) {
    const { ui } = NutriDudu;
    raiz.querySelectorAll('[data-msg-manual]').forEach((b) => b.addEventListener('click', async () => {
      const item = itens[Number(b.dataset.msgManual)];
      const fone = telefone(item.pessoa);
      // Abre a janela já no toque (o Safari bloqueia janelas abertas depois de esperar o servidor).
      const janela = item.precisaLink ? window.open('', '_blank') : null;
      b.disabled = true;
      try {
        const t = await preparar(item);
        const url = `https://wa.me/${fone}?text=${encodeURIComponent(t)}`;
        if (janela) janela.location.href = url; else window.open(url, '_blank', 'noopener');
        await marcarEnviado(item);
        ui.toast('Mensagem aberta no WhatsApp. É só tocar em enviar.');
      } catch (erro) {
        if (janela) janela.close();
        b.disabled = false;
        ui.toast(erro.message || 'Não foi possível preparar a mensagem.', 'erro');
      }
    }));
    raiz.querySelectorAll('[data-msg-pular]').forEach((b) => b.addEventListener('click', async () => {
      const item = itens[Number(b.dataset.msgPular)];
      b.disabled = true;
      try {
        if (item.tipo === 'checkin') {
          const p = (await NutriDudu.store.get('pessoas', item.pessoa.id)) || item.pessoa;
          await NutriDudu.store.update('pessoas', p.id, { checkinProgramado: { ...p.checkinProgramado, ultimoSlot: NutriDudu.checkin.isoLocal(item.slot) } });
        } else if (item.tipo === 'pre') {
          await NutriDudu.store.update('consultas', item.consulta.id, { manual: { ...(item.consulta.manual || {}), pre: new Date().toISOString() } });
        } else await marcarEnviado(item, { pulou: true });
      } catch (erro) { b.disabled = false; ui.toast(erro.message, 'erro'); }
    }));
  }

  return { TIPOS, pendentes, texto, cartao, ligar, telefone };
})();
