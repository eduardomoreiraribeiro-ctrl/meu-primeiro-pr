// Mensagens prontas: cada botão "WhatsApp" das Pendências, do Acompanhamento e dos alertas da ficha
// abre a conversa já com o texto certo para a situação (sumido, sem retorno, faltou, check-in em queda…).
// É só conferir e tocar em enviar. Ao abrir, fica anotado no histórico do paciente.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.mensagensProntas = (function () {
  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
  const tempoDesde = (dias) => {
    if (dias < 14) return `${dias} dias`;
    if (dias < 60) return `${Math.round(dias / 7)} semanas`;
    const meses = Math.round(dias / 30);
    return meses === 1 ? '1 mês' : `${meses} meses`;
  };

  /** Situações com mensagem pronta. grupo: igual ao da fila "Mensagens do dia" (evita mandar duas vezes no mesmo dia). */
  const SITUACOES = {
    sumido: { nome: 'Reativação (sumido)', grupo: 'reativacao' },
    inativo: { nome: 'Reativação (inativo)', grupo: 'reativacao' },
    sem_retorno: { nome: 'Retorno pendente', grupo: 'retorno' },
    retorno_vencido: { nome: 'Retorno vencido', grupo: 'retorno' },
    falta_sem_remarcacao: { nome: 'Faltou e não remarcou', grupo: 'retorno' },
    pacote_atrasado: { nome: 'Pacote atrasado no ritmo' },
    pacote: { nome: 'Pacote para renovar' },
    checkin_queda: { nome: 'Check-in em queda' },
    checkin_sem_resposta: { nome: 'Check-ins sem resposta' },
    confirmar: { nome: 'Confirmar consulta' },
    cobranca: { nome: 'Pagamento em atraso' },
    lead: { nome: 'Lead parado' },
    aniversario: { nome: 'Feliz aniversário' },
  };

  function ultimaRealizada(consultas = []) {
    return consultas.filter((c) => c.status === 'realizada').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))[0] || null;
  }

  /**
   * Texto pronto para a situação. ctx (opcional): { consultas, consulta, pacoteNome, motivo, lancamento, chavePix }.
   * Devolve '' quando não há mensagem para a situação (ex.: cobrança para paciente de permuta).
   */
  function texto(situacao, pessoa, ctx = {}) {
    const { utils, mensagensAutomaticas: MA } = NutriDudu;
    const nome = primeiroNome(pessoa?.nome);
    const modelo = (id, valores) => MA.preencher(MA.MODELOS[id].corpo('clínica'), valores);
    let t = '';
    switch (situacao) {
      case 'sumido':
      case 'inativo':
        t = modelo('reativacao', [nome]);
        break;
      case 'sem_retorno':
      case 'retorno_vencido': {
        const ultima = ultimaRealizada(ctx.consultas);
        t = modelo('retorno', [nome, ultima ? tempoDesde(utils.diasEntre(ultima.inicio, new Date())) : 'um tempo']);
        break;
      }
      case 'falta_sem_remarcacao': {
        const falta = (ctx.consultas || []).filter((c) => c.status === 'faltou').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))[0];
        t = `Oi, ${nome}! Tudo bem? Senti sua falta na nossa consulta${falta ? ` do dia ${utils.data(falta.inicio).slice(0, 5)}` : ''}. Aconteceu alguma coisa? Vamos remarcar? Me fala o melhor dia e horário pra você que eu vejo aqui 💚`;
        break;
      }
      case 'pacote_atrasado':
      case 'pacote':
        t = modelo('pacote', [nome, ctx.pacoteNome || 'pacote', ctx.motivo || 'tá na hora de marcar a próxima consulta']);
        break;
      case 'checkin_queda':
        t = `Oi, ${nome}! Tudo bem? Vi no seu último check-in que a semana não foi das melhores. Quer me contar o que pegou? Às vezes um ajuste pequeno no plano já ajuda bastante. Tô por aqui 💚`;
        break;
      case 'checkin_sem_resposta':
        t = `Oi, ${nome}! Tudo bem? Vi que os últimos check-ins ficaram sem resposta e quis saber como você está 😊 Se a rotina apertou, me conta que a gente ajusta o plano junto 💚`;
        break;
      case 'confirmar': {
        const c = ctx.consulta;
        if (!c) return '';
        t = modelo('lembrete', [nome, utils.diaPorExtenso(c.inicio).toLowerCase(), utils.hora(c.inicio)]).replace(/\s*É só tocar num botão aqui embaixo 👇/, ' É só me responder aqui.');
        break;
      }
      case 'cobranca': {
        const l = ctx.lancamento;
        if (!l || pessoa?.permuta) return '';
        t = modelo('cobranca', [nome, l.descricao || 'consulta', utils.moeda(NutriDudu.calculos.valorLiquido(l)), utils.data(l.vencimento), ctx.chavePix || '']);
        if (!ctx.chavePix) t = t.replace(/Se preferir, pague pelo Pix: \s*\./, 'Se quiser, te passo o Pix por aqui.');
        break;
      }
      case 'lead':
        t = `Oi, ${nome}! Aqui é o Eduardo, nutricionista. Vi que você teve interesse no acompanhamento e quis saber se ficou alguma dúvida. Posso te ajudar com alguma informação? Se quiser, já vejo um horário pra você 😊`;
        break;
      case 'aniversario':
        t = modelo('aniversario', [nome]);
        break;
      default:
        return '';
    }
    return MA.paraGenero(t, pessoa);
  }

  const telefone = (p) => {
    const d = NutriDudu.utils.soDigitos(p?.telefone);
    if (d.length === 10 || d.length === 11) return `55${d}`;
    if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d;
    return '';
  };

  // Por quantos dias o botão mostra "✓ Enviada" (depois disso, a situação pode ter mudado).
  const JANELA_DIAS = { checkin_queda: 7, checkin_sem_resposta: 7, cobranca: 7, pacote: 15, pacote_atrasado: 15, confirmar: 3, aniversario: 2 };

  /** Chave do envio: por consulta, por cobrança, por ano (aniversário) ou só pela situação. */
  function chave(situacao, ctx = {}) {
    if (situacao === 'confirmar' && ctx.consulta) return `confirmar:${ctx.consulta.id}`;
    if (situacao === 'cobranca' && ctx.lancamento) return `cobranca:${ctx.lancamento.id}`;
    if (situacao === 'aniversario') return `aniversario:${new Date().getFullYear()}`;
    return situacao;
  }

  /** Quando a mensagem desta situação foi enviada (ISO) ou null. */
  function enviadaEm(pessoa, situacao, ctx = {}, agora = new Date()) {
    const em = pessoa?.prontas?.[chave(situacao, ctx)];
    if (!em) return null;
    const dias = JANELA_DIAS[situacao] ?? 30;
    return agora - new Date(em) < dias * 864e5 ? em : null;
  }

  const rotuloEnviada = (iso) => {
    const { utils } = NutriDudu;
    const quando = utils.isoDia(iso) === utils.isoDia(new Date()) ? `hoje às ${utils.hora(iso)}` : utils.data(iso).slice(0, 5);
    return `✓ Enviada ${quando}`;
  };

  /**
   * Botão "WhatsApp" que abre a conversa com a mensagem pronta (sem mensagem: abre a conversa em branco).
   * Se a mensagem já foi enviada, mostra "✓ Enviada" e o botão vira "Enviar de novo".
   * opcoes: { rotulo, classe }.
   */
  function botao(pessoa, situacao, ctx = {}, { rotulo = 'WhatsApp', classe = 'btn btn-pequeno' } = {}) {
    const { escapeHtml } = NutriDudu.utils;
    const fone = telefone(pessoa);
    if (!fone) return '';
    const t = situacao ? texto(situacao, pessoa, ctx) : '';
    const href = `https://wa.me/${fone}${t ? `?text=${encodeURIComponent(t)}` : ''}`;
    const em = t ? enviadaEm(pessoa, situacao, ctx) : null;
    const link = `<a class="${classe}${em ? ' btn-reenviar' : ''}" href="${escapeHtml(href)}" target="_blank" rel="noopener"${t ? ` data-msg-pronta="${escapeHtml(situacao)}" data-chave="${escapeHtml(chave(situacao, ctx))}" data-pessoa="${escapeHtml(pessoa.id)}" title="Abre o WhatsApp com a mensagem pronta"` : ''} aria-label="WhatsApp de ${escapeHtml(pessoa.nome)}">${em ? 'Enviar de novo' : `${t ? '💬 ' : ''}${escapeHtml(rotulo)}`}</a>`;
    return em ? `<span class="msg-enviada" title="Mensagem aberta no WhatsApp em ${escapeHtml(NutriDudu.utils.data(em))} às ${escapeHtml(NutriDudu.utils.hora(em))}">${escapeHtml(rotuloEnviada(em))}</span> ${link}` : link;
  }

  /** Anota que foi enviada (no cadastro e no histórico) e marca retorno/reativação, para a fila do dia não repetir. */
  async function registrar(pessoaId, situacao, chaveEnvio = situacao) {
    const { store, permissoes } = NutriDudu;
    const s = SITUACOES[situacao];
    if (!s) return;
    const agoraIso = new Date().toISOString();
    try {
      const p = await store.get('pessoas', pessoaId);
      if (p) {
        const mudancas = { prontas: { ...(p.prontas || {}), [chaveEnvio]: agoraIso } };
        if (s.grupo) mudancas.automacoes = { ...(p.automacoes || {}), [s.grupo]: { em: agoraIso, ok: true, via: 'manual' } };
        await store.update('pessoas', p.id, mudancas);
      }
      await store.create('interacoes', {
        pessoaId, dataHora: agoraIso, tipo: 'nota', autor: permissoes.atual(), automatico: true,
        descricao: `${s.nome}: mensagem pronta aberta no WhatsApp para enviar.`,
      });
    } catch (erro) {
      console.error(erro); // A mensagem já abriu; só não ficou anotada.
    }
  }

  // Um ouvinte só, para todos os botões (em qualquer tela). Marca na hora, sem esperar a tela recarregar.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-msg-pronta]');
    if (!a) return;
    if (!a.classList.contains('btn-reenviar')) {
      a.insertAdjacentHTML('beforebegin', `<span class="msg-enviada">${NutriDudu.utils.escapeHtml(rotuloEnviada(new Date().toISOString()))}</span> `);
      a.classList.add('btn-reenviar');
      a.textContent = 'Enviar de novo';
    }
    registrar(a.dataset.pessoa, a.dataset.msgPronta, a.dataset.chave || a.dataset.msgPronta);
  });

  /** Mensagens abertas no WhatsApp hoje (prontas e da fila do dia), da mais recente para a mais antiga. */
  function enviadasHoje(interacoes, agora = new Date()) {
    const hoje = NutriDudu.utils.isoDia(agora);
    return interacoes
      .filter((i) => i.automatico && NutriDudu.utils.isoDia(i.dataHora) === hoje && /aberta no WhatsApp|marcado como já enviado/.test(i.descricao || ''))
      .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
  }

  return { SITUACOES, texto, botao, registrar, enviadaEm, enviadasHoje };
})();
