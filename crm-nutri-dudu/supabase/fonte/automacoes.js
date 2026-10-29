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
  const { utils, calculos, alertas, config } = NutriDudu;
  const S = NutriDuduServidor;

  const HORA = 3600 * 1000;
  const DIA = 24 * HORA;
  const STATUS_FUTURO = ['agendada', 'confirmada'];
  const LIMITE_POR_EXECUCAO = 40;
  const NOVA_TENTATIVA_APOS_ERRO = 6 * HORA;

  const { MODELOS, PADRAO, configuracao, preencher } = NutriDudu.mensagensAutomaticas;

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
    async function enviar({ cfg, automacao, pessoa, valores, botoes = [], dados, conversas, forcarTexto = false }) {
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
          ? await whatsapp.enviarTexto(para, texto)
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
      return !dados.consultas.some((c) => c.pessoaId === consulta.pessoaId && c.status === 'realizada');
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

      const local = relogio.agoraLocal();
      const hora = local.getHours() + local.getMinutes() / 60;
      if (local.getDay() === 0 || hora < Number(cfg.horaInicio) || hora >= Number(cfg.horaFim)) {
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

      await salvarStatus(relatorio, configuracoes);
      return relatorio;
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

    return { rodar, enviarPreAnamnese, enviar };
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
