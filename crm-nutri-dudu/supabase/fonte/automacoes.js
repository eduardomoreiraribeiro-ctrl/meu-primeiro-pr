// Mensagens automáticas (fase 10c) e formulário de pré-anamnese.
// Usa o núcleo (NutriDuduServidor) e as regras do sistema (alertas, cálculos).
//
// Regras gerais:
// - só envia para quem deu consentimento de WhatsApp e não pediu para PARAR;
// - dentro da janela de 24 h (a pessoa escreveu há pouco) manda texto livre, sem custo;
//   fora dela, só com o modelo aprovado pela Meta (configurado em Configurações);
// - só no horário comercial configurado (padrão 8h–20h, segunda a sábado);
// - cada envio fica marcado no próprio registro, para nunca repetir sem querer.
const NutriDuduAutomacoes = (() => {
  const { utils, calculos, alertas, config, agenda } = NutriDudu;
  const E = NutriDudu.espera;
  const S = NutriDuduServidor;

  const HORA = 3600 * 1000;
  const DIA = 24 * HORA;
  const STATUS_FUTURO = ['agendada', 'confirmada'];
  const LIMITE_POR_EXECUCAO = 40;
  const NOVA_TENTATIVA_APOS_ERRO = 6 * HORA;

  const { MODELOS, PADRAO, configuracao, preencher, telefonesDaEquipe } = NutriDudu.mensagensAutomaticas;

  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'tudo bem';

  /** Tempo em palavras: "3 semanas", "2 meses". */
  function tempoDesde(dias) {
    if (dias < 14) return `${dias} dias`;
    if (dias < 60) return `${Math.round(dias / 7)} semanas`;
    const meses = Math.round(dias / 30);
    return meses === 1 ? '1 mês' : `${meses} meses`;
  }

  // ---------------------------------------------------------------------
  // Segurança do link da pré-anamnese: o banco guarda só o "resumo" (hash) do código.
  // ---------------------------------------------------------------------
  function codigoAleatorio() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function resumo(codigo) {
    const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(codigo))));
    return [...dig].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // =====================================================================
  // Motor das automações
  // =====================================================================
  function criar({ repo, whatsapp, relogio = S.criarRelogio(), linkPadrao = '' }) {
    const agoraIso = () => relogio.agora().toISOString();
    const uidDe = (prefixo) => utils.uid(prefixo);

    /** Marca de envio guardada no registro: { em, ok, via?, erro? }. */
    function jaFeito(marca, intervaloMs = null) {
      if (!marca) return false;
      const desde = relogio.agora().getTime() - new Date(marca.em).getTime();
      if (!marca.ok) return desde < NOVA_TENTATIVA_APOS_ERRO;
      return intervaloMs === null ? true : desde < intervaloMs;
    }

    /** Grava a marca relendo o registro antes (para não apagar o que a equipe mudou nesse meio-tempo). */
    async function marcar(tabela, id, chave, marca, extra = {}) {
      const atual = await repo.pega(tabela, id);
      if (!atual) return;
      atual.automacoes = { ...(atual.automacoes || {}), [chave]: marca };
      Object.assign(atual, extra, { atualizadoEm: agoraIso() });
      await repo.grava(tabela, atual);
    }

    /** Tabela de fase nova (ex.: lista de espera): se ainda não existir no banco, segue sem ela. */
    async function lerOpcional(tabela) {
      try { return await repo.todos(tabela); } catch (erro) { console.warn(`Tabela "${tabela}" indisponível:`, erro.message); return []; }
    }

    const podeReceber = (pessoa) => Boolean(pessoa && pessoa.consentimentos?.whatsapp === true && !pessoa.automacoesDesligadas);

    function destinoDe(pessoa, conversa) {
      if (conversa?.waId) return conversa.waId;
      const d = utils.soDigitos(pessoa.telefone);
      if (d.length === 10 || d.length === 11) return `55${d}`;
      if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d;
      return null;
    }

    const janelaAberta = (conversa) => Boolean(conversa?.ultimaMensagemContatoEm
      && relogio.agora().getTime() - new Date(conversa.ultimaMensagemContatoEm).getTime() < DIA - 10 * 60000);

    /**
     * Envia uma automação para a pessoa: texto livre se a janela de 24 h estiver aberta,
     * senão o modelo aprovado. Guarda a mensagem na conversa (cria a conversa se preciso).
     */
    async function enviar({ cfg, automacao, pessoa, valores, botoes = [], botoesLivres = null, dados, conversas, forcarTexto = false }) {
      const modelo = MODELOS[automacao];
      const conversa = conversas.find((c) => c.pessoaId === pessoa.id) || null;
      const para = destinoDe(pessoa, conversa);
      if (!para) return { ok: false, motivo: 'telefone inválido' };
      const texto = preencher(modelo.corpo(dados.geral.nomeClinica || 'clínica'), valores);
      const livre = forcarTexto || janelaAberta(conversa);
      const nomeModelo = String(cfg.modelos[automacao] || '').trim();
      if (!livre && !nomeModelo) return { ok: false, motivo: 'sem modelo aprovado configurado' };

      let waId = null;
      let erro = null;
      try {
        waId = livre
          ? (botoesLivres?.length && whatsapp.enviarBotoes ? await whatsapp.enviarBotoes(para, texto, botoesLivres) : await whatsapp.enviarTexto(para, texto))
          : await whatsapp.enviarModelo(para, { nome: nomeModelo, idioma: cfg.idioma || 'pt_BR', parametros: valores, botoes });
      } catch (e) {
        erro = e.message || String(e);
      }

      const agora = agoraIso();
      let cv = conversa;
      if (!cv) {
        cv = {
          id: uidDe('cvs'), pessoaId: pessoa.id, telefone: pessoa.telefone, waId: para, status: 'encerrada', naoLidas: 0,
          ultimaMensagemEm: agora, ultimaMensagemContatoEm: null, criadoEm: agora, atualizadoEm: agora,
        };
        await repo.cria('conversas', cv);
        conversas.push(cv);
      }
      await repo.cria('mensagens', {
        id: uidDe('msg'), conversaId: cv.id, pessoaId: pessoa.id, dataHora: agora, autor: 'agente', texto,
        tipo: livre ? 'texto' : 'modelo', automacao, ...(livre ? {} : { modelo: nomeModelo }),
        direcao: 'enviada', status: erro ? 'falhou' : 'enviada', waId, ...(erro ? { erro } : {}), criadoEm: agora, atualizadoEm: agora,
      });
      const cvAtual = (await repo.pega('conversas', cv.id)) || cv;
      Object.assign(cvAtual, { ultimaMensagemEm: agora, atualizadoEm: agora });
      await repo.grava('conversas', cvAtual);
      await repo.cria('interacoes', {
        id: uidDe('int'), pessoaId: pessoa.id, dataHora: agora, tipo: 'agente', autor: 'agente', automatico: true,
        descricao: erro ? `Mensagem automática "${modelo.titulo}" não foi enviada: ${erro}` : `Mensagem automática enviada: ${modelo.titulo}${livre ? '' : ' (modelo aprovado)'}.`,
        criadoEm: agora, atualizadoEm: agora,
      });
      return erro ? { ok: false, motivo: erro, erro: true } : { ok: true, via: livre ? 'texto' : 'modelo' };
    }

    // ---------------- Pré-anamnese ----------------

    async function criarLink({ cfg, pessoa, consulta }) {
      const base = String(cfg.linkSistema || linkPadrao || '').trim().replace(/\/+$/, '').replace(/\/index\.html$/, '');
      if (!base) return null;
      const codigo = codigoAleatorio();
      const fimDoDia = relogio.paraLocal(consulta.inicio);
      fimDoDia.setHours(23, 59, 0, 0);
      const agora = agoraIso();
      await repo.cria('pre_anamnese_links', {
        id: await resumo(codigo), pessoaId: pessoa.id, consultaId: consulta.id,
        expiraEm: relogio.deLocal(fimDoDia).toISOString(), usadoEm: null, criadoEm: agora, atualizadoEm: agora,
      });
      return `${base}/pre-anamnese.html#${codigo}`;
    }

    /** Precisa de pré-anamnese? Primeira consulta (sem nenhuma realizada), futura e ainda não preenchida. */
    function precisaPre(consulta, dados) {
      if (!STATUS_FUTURO.includes(consulta.status)) return false;
      if (new Date(consulta.inicio).getTime() - relogio.agora().getTime() < 2 * HORA) return false;
      if (consulta.preAnamnese?.status === 'preenchida') return false;
      const daPessoa = dados.consultas.filter((c) => c.pessoaId === consulta.pessoaId && c.id !== consulta.id);
      if (daPessoa.some((c) => c.status === 'realizada')) return false;
      // Um formulário só por pessoa: vai para a consulta futura mais próxima. Se outra consulta
      // dela já recebeu (ou já tem a pré-anamnese preenchida), não manda de novo.
      const agoraMs = relogio.agora().getTime();
      return !daPessoa.some((c) => STATUS_FUTURO.includes(c.status) && new Date(c.inicio).getTime() > agoraMs && (
        ['enviada', 'preenchida'].includes(c.preAnamnese?.status) || c.automacoes?.preAnamnese?.ok
        || (new Date(c.inicio) < new Date(consulta.inicio) && new Date(c.inicio).getTime() - agoraMs >= 2 * HORA)));
    }

    async function enviarPre({ cfg, dados, conversas, consulta, pessoa, lembrete = false, forcarTexto = false }) {
      const link = await criarLink({ cfg, pessoa, consulta });
      if (!link) return { ok: false, motivo: 'falta o endereço do sistema (Configurações › Mensagens automáticas)' };
      const r = await enviar({
        cfg, automacao: 'preAnamnese', pessoa, dados, conversas, forcarTexto,
        valores: [primeiroNome(pessoa.nome), relogio.descrever(consulta.inicio).replace(/^./, (c) => c.toLowerCase()), link],
      });
      const marca = { em: agoraIso(), ok: r.ok, ...(r.via ? { via: r.via } : {}), ...(r.ok ? {} : { erro: r.motivo }) };
      const atual = await repo.pega('consultas', consulta.id);
      const extra = r.ok ? { preAnamnese: { ...(atual?.preAnamnese || {}), status: 'enviada', enviadaEm: atual?.preAnamnese?.enviadaEm || agoraIso(), ...(lembrete ? { lembreteEm: agoraIso() } : {}) } } : {};
      await marcar('consultas', consulta.id, lembrete ? 'preAnamneseLembrete' : 'preAnamnese', marca, extra);
      return r;
    }

    /** Chamado pelo webhook logo depois que o assistente agenda (a conversa está aberta: texto livre, sem custo). */
    async function enviarPreAnamnese({ consulta, pessoa, conversa, imediato = false }) {
      const configuracoes = await repo.todos('configuracoes');
      const cfg = configuracao(configuracoes.find((c) => c.id === 'automacoes'));
      if (!cfg.ativas.preAnamnese || !podeReceber(pessoa)) return { ok: false, motivo: 'desligada ou sem consentimento' };
      const dados = {
        geral: configuracoes.find((c) => c.id === 'geral') || {},
        consultas: await repo.porCampo('consultas', 'pessoaId', pessoa.id),
      };
      const atual = dados.consultas.find((c) => c.id === consulta.id) || consulta;
      if (!precisaPre(atual, dados) || atual.automacoes?.preAnamnese?.ok) return { ok: false, motivo: 'não precisa' };
      return enviarPre({ cfg, dados, conversas: conversa ? [conversa] : [], consulta: atual, pessoa, forcarTexto: imediato && janelaAberta(conversa) });
    }

    // ---------------- Execução periódica ----------------

    /** Dentro do horário de envio (segunda a sábado, das horaInicio às horaFim, no relógio da clínica)? */
    function dentroDoHorario(cfg) {
      const local = relogio.agoraLocal();
      const hora = local.getHours() + local.getMinutes() / 60;
      return local.getDay() !== 0 && hora >= Number(cfg.horaInicio) && hora < Number(cfg.horaFim);
    }

    // ---------------- Aviso para a equipe ----------------

    /** A conversa está aguardando a equipe e ainda não houve aviso desde que passou a aguardar? */
    function precisaAviso(c) {
      if (c.status !== 'aguardando_equipe') return false;
      if (!c.avisoEquipeEm) return true;
      const desde = new Date(c.aguardandoDesde || 0).getTime();
      const aviso = new Date(c.avisoEquipeEm).getTime();
      if (desde > aviso) return true;
      return c.avisoEquipe?.ok === false && relogio.agora().getTime() - aviso >= NOVA_TENTATIVA_APOS_ERRO;
    }

    async function enviarAvisoEquipe({ cfg, conversa, pessoa, geral, conversas }) {
      const destinos = telefonesDaEquipe(cfg.telefonesEquipe);
      if (!destinos.length) return { ok: false, motivo: 'nenhum celular da equipe cadastrado' };
      const nomeModelo = String(cfg.modelos.avisoEquipe || '').trim();
      const motivo = String(conversa.motivoEquipe || 'nova mensagem para a equipe').replace(/\s+/g, ' ').trim().slice(0, 120);
      const valores = [String(pessoa?.nome || conversa.telefone || 'Um contato').replace(/\s+/g, ' ').slice(0, 80), motivo];
      const texto = preencher(MODELOS.avisoEquipe.corpo(geral.nomeClinica || 'clínica'), valores);
      let enviados = 0;
      let erro = null;
      for (const para of destinos) {
        const doDestino = conversas.find((c) => S.chaveTelefone(c.waId || c.telefone) === S.chaveTelefone(para));
        const livre = janelaAberta(doDestino);
        if (!livre && !nomeModelo) { erro = 'sem modelo aprovado configurado'; continue; }
        try {
          if (livre) await whatsapp.enviarTexto(para, texto);
          else await whatsapp.enviarModelo(para, { nome: nomeModelo, idioma: cfg.idioma || 'pt_BR', parametros: valores });
          enviados++;
        } catch (e) {
          erro = e.message || String(e);
        }
      }
      const atual = await repo.pega('conversas', conversa.id);
      if (atual) {
        Object.assign(atual, { avisoEquipeEm: agoraIso(), avisoEquipe: { ok: enviados > 0, destinos: enviados, ...(enviados ? {} : { erro }) } });
        await repo.grava('conversas', atual);
      }
      return enviados ? { ok: true, via: 'aviso' } : { ok: false, motivo: erro, erro: true };
    }

    /** Chamado pelo webhook quando uma conversa passa a aguardar a equipe (fora do horário, fica para a próxima verificação). */
    async function avisarEquipe(conversaId) {
      const configuracoes = await repo.todos('configuracoes');
      const cfg = configuracao(configuracoes.find((c) => c.id === 'automacoes'));
      if (!cfg.ativas.avisoEquipe || !dentroDoHorario(cfg)) return { ok: false, motivo: 'desligado ou fora do horário' };
      const conversa = await repo.pega('conversas', conversaId);
      if (!conversa || !precisaAviso(conversa)) return { ok: false, motivo: 'não precisa' };
      const [pessoa, conversas] = await Promise.all([repo.pega('pessoas', conversa.pessoaId), repo.todos('conversas')]);
      return enviarAvisoEquipe({ cfg, conversa, pessoa, geral: configuracoes.find((c) => c.id === 'geral') || {}, conversas });
    }

    async function rodar({ manual = false, por = null } = {}) {
      const inicio = relogio.agora();
      const [configuracoes, pessoas, consultas, pacotes, lancamentos, conversas, servicos, profissionais] = await Promise.all(
        ['configuracoes', 'pessoas', 'consultas', 'pacotes', 'lancamentos', 'conversas', 'servicos', 'profissionais'].map((t) => repo.todos(t)),
      );
      const cfg = configuracao(configuracoes.find((c) => c.id === 'automacoes'));
      const geral = configuracoes.find((c) => c.id === 'geral') || {};
      const dados = { geral, consultas };
      const pessoaPor = Object.fromEntries(pessoas.map((p) => [p.id, p]));
      const servicoPor = Object.fromEntries(servicos.map((s) => [s.id, s]));
      const profPor = Object.fromEntries(profissionais.map((p) => [p.id, p]));
      const relatorio = { em: inicio.toISOString(), manual, por, enviados: [], pulados: [], erros: [], foraDoHorario: false };

      if (!dentroDoHorario(cfg)) {
        relatorio.foraDoHorario = true;
        await salvarStatus(relatorio, configuracoes);
        return relatorio;
      }

      let enviados = 0;
      const marketingHoje = new Set(); // no máximo 1 mensagem de "relacionamento" por pessoa por execução
      async function tentar(automacao, pessoa, fazer, rotulo) {
        if (enviados >= LIMITE_POR_EXECUCAO) return;
        if (!cfg.ativas[automacao]) return;
        if (!podeReceber(pessoa)) { relatorio.pulados.push({ automacao, pessoa: pessoa?.nome, motivo: 'sem consentimento ou pediu para parar' }); return; }
        const r = await fazer();
        if (r.ok) { enviados++; relatorio.enviados.push({ automacao, pessoa: pessoa.nome, via: r.via, detalhe: rotulo }); }
        else if (r.erro) relatorio.erros.push({ automacao, pessoa: pessoa.nome, motivo: r.motivo });
        else relatorio.pulados.push({ automacao, pessoa: pessoa.nome, motivo: r.motivo });
      }
      const nomeProf = (id) => profPor[id]?.nome || 'a nutricionista';
      const agoraMs = inicio.getTime();

      // 1. Lembrete de consulta (até 40 h antes, pelo menos 1 h antes).
      for (const c of consultas) {
        if (!STATUS_FUTURO.includes(c.status) || jaFeito(c.automacoes?.lembrete)) continue;
        const falta = new Date(c.inicio).getTime() - agoraMs;
        if (falta < HORA || falta > 40 * HORA) continue;
        const pessoa = pessoaPor[c.pessoaId];
        const quando = relogio.paraLocal(c.inicio);
        await tentar('lembrete', pessoa, async () => {
          const r = await enviar({
            cfg, automacao: 'lembrete', pessoa, dados, conversas,
            valores: [primeiroNome(pessoa.nome), utils.diaPorExtenso(quando).toLowerCase(), utils.hora(quando), nomeProf(c.profissionalId)],
            botoes: [`confirmar:${c.id}`, `remarcar:${c.id}`],
          });
          await marcar('consultas', c.id, 'lembrete', { em: agoraIso(), ok: r.ok, ...(r.via ? { via: r.via } : {}), ...(r.ok ? {} : { erro: r.motivo }) });
          return r;
        }, relogio.descrever(c.inicio));
      }

      // 2. Pré-anamnese: envio ao agendar e lembrete 2 dias antes, se não preenchida.
      for (const c of consultas) {
        if (!precisaPre(c, dados)) continue;
        const pessoa = pessoaPor[c.pessoaId];
        if (!c.automacoes?.preAnamnese?.ok) {
          if (jaFeito(c.automacoes?.preAnamnese)) continue;
          await tentar('preAnamnese', pessoa, () => enviarPre({ cfg, dados, conversas, consulta: c, pessoa }), 'link');
        } else if (c.preAnamnese?.status === 'enviada' && !jaFeito(c.automacoes?.preAnamneseLembrete)) {
          const falta = new Date(c.inicio).getTime() - agoraMs;
          const desdeEnvio = agoraMs - new Date(c.preAnamnese.enviadaEm || c.automacoes.preAnamnese.em).getTime();
          if (falta <= 2 * DIA && desdeEnvio >= 12 * HORA) {
            await tentar('preAnamnese', pessoa, () => enviarPre({ cfg, dados, conversas, consulta: c, pessoa, lembrete: true }), 'lembrete');
          }
        }
      }

      // 3. Pagamento em atraso (1 dia depois do vencimento; 1 por semana por pagamento).
      const hojeLocal = utils.inicioDoDia(relogio.agoraLocal());
      for (const l of lancamentos) {
        if (l.status !== 'pendente' || !l.vencimento || jaFeito(l.automacoes?.cobranca, 7 * DIA)) continue;
        if (utils.diasEntre(l.vencimento, hojeLocal) < 1) continue;
        const pessoa = pessoaPor[l.pessoaId];
        if (!pessoa) continue;
        await tentar('cobranca', pessoa, async () => {
          const r = await enviar({
            cfg, automacao: 'cobranca', pessoa, dados, conversas,
            valores: [primeiroNome(pessoa.nome), l.descricao || 'consulta', utils.moeda(calculos.valorLiquido(l)), utils.data(l.vencimento), geral.chavePix || 'informada pela recepção'],
          });
          await marcar('lancamentos', l.id, 'cobranca', { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
          return r;
        }, l.descricao);
      }

      // 4 e 5. Retorno pendente e reativação (regras de alertas do sistema, no relógio da clínica).
      const local2 = (lista) => lista.map((x) => ({ ...x, inicio: x.inicio && x.inicio.length > 10 ? relogio.paraLocal(x.inicio).toISOString() : x.inicio }));
      const comAlerta = alertas.todos({ pessoas, consultas: local2(consultas), pacotes, geral }, relogio.agoraLocal());
      for (const { pessoa, alerta } of comAlerta) {
        if (marketingHoje.has(pessoa.id)) continue;
        const consultasDela = consultas.filter((c) => c.pessoaId === pessoa.id && c.status === 'realizada').sort((a, b) => b.inicio.localeCompare(a.inicio));
        const ultima = consultasDela[0];
        if (alerta.tipo === 'sumido') {
          if (jaFeito(pessoa.automacoes?.reativacao, 90 * DIA)) continue;
          await tentar('reativacao', pessoa, async () => {
            const r = await enviar({ cfg, automacao: 'reativacao', pessoa, dados, conversas, valores: [primeiroNome(pessoa.nome)] });
            await marcar('pessoas', pessoa.id, 'reativacao', { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
            if (r.ok) marketingHoje.add(pessoa.id);
            return r;
          }, alerta.texto);
        } else if (['sem_retorno', 'retorno_vencido', 'falta_sem_remarcacao'].includes(alerta.tipo) && ultima) {
          if (jaFeito(pessoa.automacoes?.retorno, 30 * DIA)) continue;
          await tentar('retorno', pessoa, async () => {
            const r = await enviar({
              cfg, automacao: 'retorno', pessoa, dados, conversas,
              valores: [primeiroNome(pessoa.nome), tempoDesde(utils.diasEntre(relogio.paraLocal(ultima.inicio), relogio.agoraLocal())), nomeProf(ultima.profissionalId)],
            });
            await marcar('pessoas', pessoa.id, 'retorno', { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
            if (r.ok) marketingHoje.add(pessoa.id);
            return r;
          }, alerta.texto);
        }
      }

      // 6. Pacote acabando, vencendo ou atrasado (1 aviso por situação de cada pacote).
      const consultasDe = calculos.agruparPorPessoa(consultas.filter((c) => c.status !== 'cancelada'));
      for (const pac of pacotes) {
        const pessoa = pessoaPor[pac.pessoaId];
        if (!pessoa || pessoa.status !== 'ativo' || calculos.statusPacote(pac, relogio.agoraLocal()) !== 'ativo') continue;
        const uso = calculos.usoDoPacote(pac, consultasDe(pessoa.id).filter((c) => c.pacoteId === pac.id));
        const diasVence = utils.diasEntre(relogio.agoraLocal(), pac.validade);
        const ritmo = calculos.ritmoPacote(pac, uso, relogio.agoraLocal());
        let situacao = null;
        let texto = '';
        if (uso.saldo <= 1) { situacao = 'saldo'; texto = uso.saldo ? 'resta 1 consulta' : 'todas as consultas já foram usadas'; }
        else if (diasVence <= 15) { situacao = 'vencendo'; texto = `ele vence em ${utils.data(pac.validade)}`; }
        else if (ritmo?.atrasadas) { situacao = 'ritmo'; texto = `${ritmo.atrasadas === 1 ? 'há 1 consulta atrasada' : `há ${ritmo.atrasadas} consultas atrasadas`} em relação ao ritmo combinado`; }
        if (!situacao) continue;
        const chave = `pacote_${pac.id}_${situacao}`;
        if (jaFeito(pessoa.automacoes?.[chave]) || marketingHoje.has(pessoa.id)) continue;
        if (situacao === 'saldo' && diasVence <= 15) texto += ` e ele vence em ${utils.data(pac.validade)}`;
        await tentar('pacote', pessoa, async () => {
          const r = await enviar({ cfg, automacao: 'pacote', pessoa, dados, conversas, valores: [primeiroNome(pessoa.nome), servicoPor[pac.servicoId]?.nome || 'pacote', texto] });
          await marcar('pessoas', pessoa.id, chave, { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
          if (r.ok) marketingHoje.add(pessoa.id);
          return r;
        }, texto);
      }

      // 7. Agradecimento de indicação: indicado virou cliente nos últimos 30 dias.
      for (const indicado of pessoas) {
        if (!indicado.indicadoPorId || indicado.status !== 'ativo' || !indicado.clienteDesde) continue;
        if (utils.diasEntre(indicado.clienteDesde, relogio.agoraLocal()) > 30) continue;
        const quem = pessoaPor[indicado.indicadoPorId];
        const chave = `indicacao_${indicado.id}`;
        if (!quem || jaFeito(quem.automacoes?.[chave]) || marketingHoje.has(quem.id)) continue;
        await tentar('indicacao', quem, async () => {
          const r = await enviar({ cfg, automacao: 'indicacao', pessoa: quem, dados, conversas, valores: [primeiroNome(quem.nome), primeiroNome(indicado.nome)] });
          await marcar('pessoas', quem.id, chave, { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
          if (r.ok) marketingHoje.add(quem.id);
          return r;
        }, indicado.nome);
      }

      // 8. Link da consulta online (entre 3 h e 15 min antes).
      if (cfg.ativas.linkOnline) {
        for (const c of consultas) {
          if (c.tipo !== 'online' || !STATUS_FUTURO.includes(c.status) || jaFeito(c.automacoes?.linkOnline)) continue;
          const falta = new Date(c.inicio).getTime() - agoraMs;
          if (falta < 15 * 60000 || falta > 3 * HORA) continue;
          const pessoa = pessoaPor[c.pessoaId];
          const link = String(profPor[c.profissionalId]?.linkOnline || '').trim();
          if (!link) { relatorio.pulados.push({ automacao: 'linkOnline', pessoa: pessoa?.nome, motivo: 'o profissional não tem link da sala de vídeo cadastrado' }); continue; }
          await tentar('linkOnline', pessoa, async () => {
            const r = await enviar({
              cfg, automacao: 'linkOnline', pessoa, dados, conversas,
              valores: [primeiroNome(pessoa.nome), nomeProf(c.profissionalId), utils.hora(relogio.paraLocal(c.inicio)), link],
            });
            await marcar('consultas', c.id, 'linkOnline', { em: agoraIso(), ok: r.ok, ...(r.ok ? {} : { erro: r.motivo }) });
            return r;
          }, relogio.descrever(c.inicio));
        }
      }

      // 9. Avisos para a equipe que ficaram pendentes (ex.: chegaram fora do horário).
      if (cfg.ativas.avisoEquipe) {
        for (const c of conversas.filter(precisaAviso)) {
          const pessoa = pessoaPor[c.pessoaId];
          const r = await enviarAvisoEquipe({ cfg, conversa: c, pessoa, geral, conversas });
          if (r.ok) relatorio.enviados.push({ automacao: 'avisoEquipe', pessoa: pessoa?.nome || c.telefone, via: 'aviso' });
          else if (r.erro) relatorio.erros.push({ automacao: 'avisoEquipe', pessoa: pessoa?.nome || c.telefone, motivo: r.motivo });
          else relatorio.pulados.push({ automacao: 'avisoEquipe', pessoa: pessoa?.nome || c.telefone, motivo: r.motivo });
        }
      }

      // 10. Lista de espera: horários liberados (cancelados ou remarcados) vão para quem está esperando.
      if (cfg.ativas.vagaEspera) await oferecerVagas({ cfg, dados, conversas, pessoaPor, profPor, tentar, agoraMs });

      // 11. Depois da consulta: no dia seguinte à consulta realizada, pergunta como foi (1 a cada 30 dias por pessoa).
      const hojeIso = utils.isoDia(relogio.agoraLocal());
      const perguntadas = new Set();
      for (const c of [...consultas].sort((a, b) => b.inicio.localeCompare(a.inicio))) {
        if (c.status !== 'realizada' || c.automacoes?.posConsulta || c.avaliacaoPaciente) continue;
        if (utils.isoDia(relogio.paraLocal(c.fim || c.inicio)) >= hojeIso) continue; // só a partir do dia seguinte
        if (agoraMs - new Date(c.fim || c.inicio).getTime() > 4 * DIA) continue;
        const pessoa = pessoaPor[c.pessoaId];
        if (!pessoa || perguntadas.has(pessoa.id) || jaFeito(pessoa.automacoes?.posConsulta, 30 * DIA)) continue;
        perguntadas.add(pessoa.id);
        const botoes = ['otima', 'boa', 'melhorar'].map((n) => `avaliacao:${n}:${c.id}`);
        await tentar('posConsulta', pessoa, async () => {
          const r = await enviar({
            cfg, automacao: 'posConsulta', pessoa, dados, conversas,
            valores: [primeiroNome(pessoa.nome), nomeProf(c.profissionalId)],
            botoes,
            botoesLivres: MODELOS.posConsulta.botoes.map((titulo, i) => ({ id: botoes[i], titulo })),
          });
          const marca = { em: agoraIso(), ok: r.ok, ...(r.via ? { via: r.via } : {}), ...(r.ok ? {} : { erro: r.motivo }) };
          await marcar('consultas', c.id, 'posConsulta', marca);
          await marcar('pessoas', pessoa.id, 'posConsulta', marca);
          return r;
        }, relogio.descrever(c.inicio));
      }

      await salvarStatus(relatorio, configuracoes);
      return relatorio;
    }

    // ---------------- Lista de espera ----------------

    /** Contexto da agenda no relógio da clínica (o mesmo das regras do sistema). */
    function contextoAgenda(d) {
      const local = (x) => ({ ...x, inicio: relogio.paraLocal(x.inicio).toISOString(), fim: relogio.paraLocal(x.fim).toISOString() });
      return {
        horarios: d.horarios, bloqueios: d.bloqueios.map(local), consultas: d.consultas.map(local), geral: d.geral,
        agora: relogio.agoraLocal(), nomePessoa: () => 'outro paciente', nomeProfissional: () => 'O profissional',
      };
    }

    /** Horários que ficaram livres e ainda não foram oferecidos: [{ chave, consultaId, profissionalId, inicio, fim }]. */
    function vagasLiberadas(consultas, agoraMs) {
      const vagas = [];
      const vistas = new Set();
      for (const c of consultas) {
        const fontes = [];
        if (c.status === 'cancelada' && !jaFeito(c.automacoes?.vagaCancelada)) {
          fontes.push({ chave: 'vagaCancelada', inicio: c.inicio, fim: c.fim, profissionalId: c.profissionalId });
        }
        const lib = c.vagaLiberada;
        const marca = c.automacoes?.vagaRemarcada;
        if (lib?.inicio && !(marca && new Date(marca.em) >= new Date(lib.em) && jaFeito(marca))) {
          fontes.push({ chave: 'vagaRemarcada', inicio: lib.inicio, fim: lib.fim, profissionalId: lib.profissionalId });
        }
        for (const f of fontes) {
          const falta = new Date(f.inicio).getTime() - agoraMs;
          if (falta < E.ANTECEDENCIA_MIN_H * HORA || falta > E.ANTECEDENCIA_MAX_DIAS * DIA) continue;
          const id = `${f.profissionalId}|${new Date(f.inicio).toISOString()}`;
          if (vistas.has(id)) continue;
          vistas.add(id);
          vagas.push({ ...f, consultaId: c.id });
        }
      }
      return vagas.sort((a, b) => a.inicio.localeCompare(b.inicio));
    }

    async function oferecerVagas({ cfg, dados, conversas, pessoaPor, profPor, tentar, agoraMs }) {
      const espera = await lerOpcional('espera');
      const hojeIso = utils.isoDia(relogio.agoraLocal());
      if (!espera.some((e) => E.ativo(e, hojeIso))) return;
      const d = await S.carregarContexto(repo);
      const vagas = vagasLiberadas(d.consultas, agoraMs);
      if (!vagas.length) return;
      const ctx = contextoAgenda(d);
      const servicoPor = Object.fromEntries(d.servicos.map((x) => [x.id, x]));
      const consultaPorId = Object.fromEntries(d.consultas.map((c) => [c.id, { ...c, inicioLocal: relogio.paraLocal(c.inicio) }]));
      const ctxEspera = { servicoPorId: servicoPor, consultaPorId, hojeIso, diasPermitidos: (m) => S.diasDoAgente(d.agenteCfg, m) };
      const fila = espera.filter((e) => E.ativo(e, hojeIso)).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
      const agora = relogio.agora();

      for (const vaga of vagas) {
        const inicioLocal = relogio.paraLocal(vaga.inicio);
        const fimLocal = relogio.paraLocal(vaga.fim);
        const livre = ['presencial', 'online'].some((m) => !agenda.verificar({ profissionalId: vaga.profissionalId, inicio: inicioLocal, fim: fimLocal, modalidade: m }, ctx).length);
        if (!livre) { await marcar('consultas', vaga.consultaId, vaga.chave, { em: agoraIso(), ok: true, ocupada: true }); continue; }

        let tentativas = 0;
        let enviadas = 0;
        let ultimoErro = null;
        for (const e of fila) {
          if (enviadas >= E.OFERTAS_POR_VAGA) break;
          const modalidade = E.combina(e, { profissionalId: vaga.profissionalId, inicio: inicioLocal }, ctxEspera);
          if (!modalidade || E.temOfertaAberta(e, agora)) continue;
          if ((e.ofertas || []).some((o) => o.profissionalId === vaga.profissionalId && new Date(o.inicio).getTime() === new Date(vaga.inicio).getTime())) continue;
          const pessoa = pessoaPor[e.pessoaId];
          const servico = servicoPor[e.servicoId];
          if (!pessoa || !servico) continue;
          // O serviço da pessoa cabe no horário? (mesmas regras da agenda; ao antecipar, ignora a consulta dela).
          const fimServico = new Date(inicioLocal.getTime() + (servico.duracaoMin || 60) * 60000);
          if (agenda.verificar({ profissionalId: vaga.profissionalId, inicio: inicioLocal, fim: fimServico, modalidade, ignorarConsultaId: e.consultaId || null }, ctx).length) continue;

          const ofertaId = utils.uid('ofe');
          const quando = `${utils.diaPorExtenso(inicioLocal).toLowerCase()} às ${utils.hora(inicioLocal)}${modalidade === 'online' ? ' (online, por vídeo)' : ''}`;
          const sim = `vaga:sim:${e.id}:${ofertaId}`;
          const nao = `vaga:nao:${e.id}:${ofertaId}`;
          let resultado = null;
          await tentar('vagaEspera', pessoa, async () => {
            tentativas++;
            const r = await enviar({
              cfg, automacao: 'vagaEspera', pessoa, dados, conversas,
              valores: [primeiroNome(pessoa.nome), profPor[vaga.profissionalId]?.nome || 'a nutricionista', quando],
              botoes: [sim, nao],
              botoesLivres: [{ id: sim, titulo: 'Quero este horário' }, { id: nao, titulo: 'Não posso' }],
            });
            const atual = await repo.pega('espera', e.id);
            if (atual) {
              const oferta = {
                id: ofertaId, profissionalId: vaga.profissionalId, servicoId: e.servicoId, modalidade,
                inicio: new Date(vaga.inicio).toISOString(), fim: relogio.deLocal(fimServico).toISOString(),
                em: agoraIso(), ok: r.ok, ...(r.via ? { via: r.via } : {}), status: r.ok ? 'enviada' : 'falhou', ...(r.ok ? {} : { erro: r.motivo }),
              };
              atual.ofertas = [...(atual.ofertas || []), oferta].slice(-20);
              atual.atualizadoEm = agoraIso();
              await repo.grava('espera', atual);
              e.ofertas = atual.ofertas;
            }
            resultado = r;
            return r;
          }, quando);
          if (resultado?.ok) enviadas++;
          else if (resultado) ultimoErro = resultado.motivo;
        }
        if (tentativas) {
          await marcar('consultas', vaga.consultaId, vaga.chave, { em: agoraIso(), ok: enviadas > 0, ofertas: enviadas, ...(enviadas ? {} : { erro: ultimoErro }) });
        }
      }
    }

    /**
     * Resposta ao botão da oferta ("Quero este horário" / "Não posso"). Chamado pelo webhook.
     * Devolve { texto, consulta?, equipe?, resumo?, resultado }.
     */
    async function responderVaga({ pessoa, conversa, resposta, entradaId, ofertaId }) {
      let entrada = null;
      try { entrada = entradaId ? await repo.pega('espera', entradaId) : null; } catch (erro) { entrada = null; }
      const oferta = entrada?.ofertas?.find((o) => o.id === ofertaId);
      if (!entrada || entrada.pessoaId !== pessoa.id || !oferta) {
        return { texto: 'Não encontrei esse horário. Já chamei alguém da equipe para te ajudar. 🙏', equipe: 'Respondeu a uma oferta da lista de espera que não foi encontrada', resultado: 'nao_encontrada' };
      }
      const agora = agoraIso();
      const quando = relogio.descrever(oferta.inicio).replace(/^./, (c) => c.toLowerCase());
      async function salvarOferta(status, extra = {}) {
        const atual = (await repo.pega('espera', entrada.id)) || entrada;
        atual.ofertas = (atual.ofertas || []).map((o) => (o.id === ofertaId ? { ...o, status, respondidaEm: agora } : o));
        Object.assign(atual, extra, { atualizadoEm: agora });
        await repo.grava('espera', atual);
      }
      const anotar = (descricao) => repo.cria('interacoes', {
        id: uidDe('int'), pessoaId: pessoa.id, dataHora: agora, tipo: 'agente', autor: 'agente', automatico: true, descricao, criadoEm: agora, atualizadoEm: agora,
      });

      if (resposta !== 'sim') {
        if (oferta.status === 'enviada') await salvarOferta('recusada');
        await anotar(`Lista de espera: não quis o horário de ${quando}.`);
        return {
          texto: entrada.status === 'aguardando' ? 'Tudo bem! Você continua na nossa lista de espera, e avisamos se abrir outro horário. 🙂' : 'Tudo bem! 🙂',
          resultado: 'recusou',
        };
      }
      if (oferta.status === 'aceita') return { texto: `Esse horário já está reservado para você: ${quando}. ✅`, resultado: 'ja_reservado' };
      if (entrada.status !== 'aguardando') {
        return { texto: 'Esse pedido da lista de espera não está mais ativo. Se ainda quiser um horário, é só escrever por aqui que a gente ajuda. 🙂', resultado: 'inativo' };
      }
      if (new Date(oferta.inicio).getTime() - relogio.agora().getTime() < HORA) {
        await salvarOferta('expirada');
        return { texto: 'Que pena, esse horário já está muito próximo e não dá mais para reservar. Você continua na lista de espera, e avisamos se abrir outro. 🙏', resultado: 'expirada' };
      }

      // Reserva com as mesmas regras do assistente (confere se o horário ainda está livre).
      const dadosAg = await S.carregarContexto(repo);
      const ferramentas = S.criarFerramentas({ repo, relogio, pessoa, conversa, dados: dadosAg });
      const inicio = relogio.localISO(relogio.paraLocal(oferta.inicio));
      const antecipar = entrada.consultaId
        ? dadosAg.consultas.find((c) => c.id === entrada.consultaId && c.pessoaId === pessoa.id && S.STATUS_FUTURO.includes(c.status) && new Date(c.inicio) > relogio.agora())
        : null;
      const r = antecipar
        ? await ferramentas.executar('remarcar_consulta', { consulta_id: antecipar.id, novo_inicio: inicio })
        : await ferramentas.executar('agendar_consulta', { servico_id: oferta.servicoId || entrada.servicoId, profissional_id: oferta.profissionalId, inicio, modalidade: oferta.modalidade || 'presencial' });
      if (r.erro) {
        await salvarOferta('preenchida');
        await anotar(`Lista de espera: quis o horário de ${quando}, mas ele já tinha sido preenchido.`);
        return { texto: 'Que pena! Esse horário acabou de ser reservado por outra pessoa. Você continua na nossa lista de espera, e avisamos assim que abrir outro. 🙏', resultado: 'preenchida' };
      }
      const nova = ferramentas.efeitos.consultasAgendadas[0] || null;
      await salvarOferta('aceita', { status: 'agendado', resolvidoEm: agora, consultaAgendadaId: nova?.id || antecipar?.id || null });
      await anotar(`Lista de espera: aceitou o horário de ${quando}${antecipar ? ' (consulta antecipada)' : ''}.`);
      const link = /^https:\/\//.test(r.consulta?.link_videochamada || '') ? r.consulta.link_videochamada : null;
      const texto = `Pronto, ${primeiroNome(pessoa.nome)}! ✅ ${antecipar ? 'Sua consulta foi antecipada para' : 'Reservei para você:'} ${r.consulta.quando.replace(/^./, (c) => c.toLowerCase())}${r.consulta.profissional ? `, com ${r.consulta.profissional}` : ''}.${link ? ` A consulta é online: entre por este link alguns minutos antes: ${link}` : ''} Se precisar remarcar, é só escrever por aqui.`;
      return { texto, consulta: nova, resultado: antecipar ? 'antecipada' : 'agendado' };
    }

    // ---------------- Depois da consulta: resposta aos botões ----------------

    /**
     * "Ótima" agradece e pede a avaliação no Google (se o link estiver configurado);
     * "Boa" agradece e abre espaço para sugestões; "Poderia ser melhor" chama a equipe.
     * Devolve { texto, equipe?, resumo?, resultado }.
     */
    async function responderAvaliacao({ pessoa, nota, consultaId }) {
      if (!['otima', 'boa', 'melhorar'].includes(nota)) return { texto: '', resultado: 'invalida' };
      const consulta = consultaId ? await repo.pega('consultas', consultaId) : null;
      if (!consulta || consulta.pessoaId !== pessoa.id) {
        return { texto: 'Obrigado pela resposta! 🙂', resultado: 'nao_encontrada' };
      }
      const agora = agoraIso();
      await repo.grava('consultas', { ...consulta, avaliacaoPaciente: { nota, em: agora }, atualizadoEm: agora });
      const quando = relogio.descrever(consulta.inicio).replace(/^./, (x) => x.toLowerCase());
      await repo.cria('interacoes', {
        id: uidDe('int'), pessoaId: pessoa.id, dataHora: agora, tipo: 'nota', autor: 'paciente', automatico: true,
        descricao: `Avaliou a consulta de ${quando}: ${NutriDudu.mensagensAutomaticas.AVALIACOES[nota]}.`, criadoEm: agora, atualizadoEm: agora,
      });
      const nome = primeiroNome(pessoa.nome);
      if (nota === 'otima') {
        const cfg = configuracao((await repo.pega('configuracoes', 'automacoes')) || {});
        const link = /^https:\/\/\S+$/.test(String(cfg.linkAvaliacao || '').trim()) ? cfg.linkAvaliacao.trim() : '';
        return {
          texto: `Que bom saber, ${nome}! 💚 Obrigado pela confiança.${link ? ` Se puder, conte como foi numa avaliação no Google. Leva 1 minuto e ajuda outras pessoas a conhecerem o nosso trabalho: ${link}` : ''}`,
          resultado: 'otima',
        };
      }
      if (nota === 'boa') {
        return { texto: `Obrigado pelo retorno, ${nome}! 🙂 Se quiser contar o que podemos melhorar, é só escrever aqui.`, resultado: 'boa' };
      }
      return {
        texto: `Obrigado por contar, ${nome}. Sentimos muito que não foi como você esperava. Já avisei a nossa equipe, e alguém vai falar com você em breve. 🙏`,
        equipe: 'Avaliou a consulta como "poderia ser melhor"',
        resumo: `Avaliação da consulta de ${quando}: poderia ser melhor. Entrar em contato para entender o que aconteceu.`,
        resultado: 'melhorar',
      };
    }

    /** Resumo da última execução, para a tela de Configurações. */
    async function salvarStatus(relatorio, configuracoes) {
      const agora = agoraIso();
      const doc = {
        id: 'automacoes_status', ultimaExecucao: relatorio.em, manual: relatorio.manual, foraDoHorario: relatorio.foraDoHorario,
        enviados: relatorio.enviados.length, pulados: relatorio.pulados.length, erros: relatorio.erros.slice(0, 10),
        ultimosEnvios: relatorio.enviados.slice(0, 20), atualizadoEm: agora,
      };
      if (configuracoes.some((c) => c.id === 'automacoes_status')) await repo.grava('configuracoes', doc);
      else await repo.cria('configuracoes', { ...doc, criadoEm: agora });
    }

    return { rodar, enviarPreAnamnese, enviar, avisarEquipe, responderVaga, responderAvaliacao };
  }

  // =====================================================================
  // Formulário de pré-anamnese (página pública com link pessoal)
  // =====================================================================
  const LIMITE_TEXTO = 3000;
  const LIMITE_ITEM = 200;
  const LIMITE_LISTA = 20;
  const textoLimpo = (v, max = LIMITE_TEXTO) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

  function lista(itens, campos, obrigatorio) {
    if (!Array.isArray(itens)) return [];
    return itens.slice(0, LIMITE_LISTA).map((item) => {
      const limpo = {};
      Object.entries(campos).forEach(([campo, opcoes]) => {
        const v = textoLimpo(item?.[campo], LIMITE_ITEM);
        limpo[campo] = Array.isArray(opcoes) ? (opcoes.includes(v) ? v : opcoes[0]) : v;
      });
      return limpo;
    }).filter((i) => i[obrigatorio]);
  }

  function criarPreAnamnese({ repo, relogio = S.criarRelogio() }) {
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

    async function abrir(codigo) {
      if (!codigo || String(codigo).length < 20) return { erro: 'Link inválido.', status: 404 };
      const link = await repo.pega('pre_anamnese_links', await resumo(codigo));
      if (!link) return { erro: 'Link inválido.', status: 404 };
      if (link.usadoEm) return { erro: 'Este formulário já foi enviado. Obrigado!', status: 409 };
      if (relogio.agora() > new Date(link.expiraEm)) return { erro: 'Este link expirou. Peça um novo para a clínica pelo WhatsApp.', status: 410 };
      const [pessoa, consulta] = await Promise.all([repo.pega('pessoas', link.pessoaId), repo.pega('consultas', link.consultaId)]);
      if (!pessoa || !consulta || consulta.status === 'cancelada') return { erro: 'Esta consulta não está mais marcada. Fale com a clínica pelo WhatsApp.', status: 410 };
      return { link, pessoa, consulta };
    }

    async function atender(req, corpo = null) {
      if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
      if (req.method === 'GET') {
        const r = await abrir(new URL(req.url).searchParams.get('t'));
        if (r.erro) return json({ erro: r.erro }, r.status);
        const [configuracoes, profissional] = await Promise.all([repo.todos('configuracoes'), repo.pega('profissionais', r.consulta.profissionalId)]);
        const geral = configuracoes.find((c) => c.id === 'geral') || {};
        return json({
          ok: true, nome: primeiroNome(r.pessoa.nome), clinica: geral.nomeClinica || 'Clínica',
          consulta: relogio.descrever(r.consulta.inicio), profissional: profissional?.nome || '',
        });
      }
      if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);
      if (!corpo) { try { corpo = await req.json(); } catch (e) { return json({ erro: 'Pedido inválido.' }, 400); } }
      if (JSON.stringify(corpo).length > 60000) return json({ erro: 'Respostas longas demais.' }, 413);
      const r = await abrir(corpo.t);
      if (r.erro) return json({ erro: r.erro }, r.status);
      if (corpo.consentimento !== true) return json({ erro: 'Para enviar, é preciso concordar com o uso dos dados de saúde.' }, 400);
      const resp = corpo.respostas || {};
      const dadosAnamnese = {
        queixa: textoLimpo(resp.queixa),
        historicoSaude: textoLimpo(resp.historicoSaude),
        alergias: lista(resp.alergias, { substancia: null, tipo: ['alergia', 'intolerancia'], gravidade: ['leve', 'moderada', 'grave'] }, 'substancia'),
        contraindicacoes: [],
        medicamentos: lista(resp.medicamentos, { nome: null, dose: null, frequencia: null, desde: null }, 'nome'),
        habitosVida: textoLimpo(resp.habitosVida),
        habitosAlimentares: textoLimpo(resp.habitosAlimentares),
        exames: [],
      };
      if (!dadosAnamnese.queixa) return json({ erro: 'Conte pelo menos o seu objetivo com a consulta.' }, 400);

      const agora = relogio.agora().toISOString();
      const versoes = await repo.versoesAnamnese(r.pessoa.id);
      await repo.cria('anamneses', {
        id: utils.uid('ana'), pessoaId: r.pessoa.id, consultaId: r.consulta.id, versao: Math.max(0, ...versoes) + 1,
        origem: 'pre', status: 'a_revisar', autor: 'paciente', ...dadosAnamnese, criadoEm: agora, atualizadoEm: agora,
      });
      // Marca o link como usado, a consulta como "preenchida" e o consentimento de saúde.
      await repo.grava('pre_anamnese_links', { ...r.link, usadoEm: agora, atualizadoEm: agora });
      const consulta = await repo.pega('consultas', r.consulta.id);
      await repo.grava('consultas', { ...consulta, preAnamnese: { ...(consulta.preAnamnese || {}), status: 'preenchida', preenchidaEm: agora }, atualizadoEm: agora });
      const pessoa = await repo.pega('pessoas', r.pessoa.id);
      await repo.grava('pessoas', { ...pessoa, consentimentos: { ...(pessoa.consentimentos || {}), saude: true }, consentimentoSaudeEm: agora, atualizadoEm: agora });
      await repo.cria('interacoes', {
        id: utils.uid('int'), pessoaId: pessoa.id, dataHora: agora, tipo: 'nota', autor: 'paciente', automatico: true,
        descricao: 'Pré-anamnese preenchida pelo paciente (a revisar pela nutricionista). Consentimento de dados de saúde registrado.',
        criadoEm: agora, atualizadoEm: agora,
      });
      return json({ ok: true });
    }
    return { atender, CORS };
  }

  /**
   * Função "whatsapp-automacoes": recebe o agendamento (cron) e o formulário de pré-anamnese.
   * - POST { acao: 'rodar' } com o cabeçalho x-chave-automacoes → roda as automações;
   * - GET ?t=… / POST { acao: 'pre-anamnese', t, … } → formulário.
   */
  function criarServidor({ automacoes, preAnamnese, chave }) {
    return async function atender(req) {
      if (req.method === 'OPTIONS' || req.method === 'GET') return preAnamnese.atender(req);
      if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
      let corpo;
      try { corpo = await req.json(); } catch (e) { corpo = {}; }
      if (corpo.acao === 'pre-anamnese') return preAnamnese.atender(req, corpo);
      if (!chave) return new Response(JSON.stringify({ erro: 'AUTOMACOES_CHAVE não configurada.' }), { status: 500 });
      if (req.headers.get('x-chave-automacoes') !== chave) return new Response(JSON.stringify({ erro: 'Chave inválida.' }), { status: 401 });
      const relatorio = await automacoes.rodar();
      return new Response(JSON.stringify({ ok: true, enviados: relatorio.enviados.length, pulados: relatorio.pulados.length, erros: relatorio.erros.length, foraDoHorario: relatorio.foraDoHorario }), { headers: { 'Content-Type': 'application/json' } });
    };
  }

  return { MODELOS, PADRAO, configuracao, preencher, criar, criarPreAnamnese, criarServidor, tempoDesde, resumo };
})();
