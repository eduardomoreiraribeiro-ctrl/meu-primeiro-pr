// Check-ins de acompanhamento: perguntas, questionários e cálculo da nota.
// Usado pelo sistema (telas), pela página do paciente (checkin.html) e pelo servidor
// (supabase/fonte/automacoes.js), para os três calcularem sempre igual.
//
// Pergunta: { id, categoria, icone (emoji), sigla (até 5 letras), titulo (até 30), texto, tipo, …config }
//   tipo 'carinhas'  → 5 opções fixas (Ótimo…Péssimo), notas 2…-2; rótulos editáveis em `rotulos`.
//   tipo 'opcoes'    → `opcoes: [{ texto, nota }]` (nota de -2 a 2).
//   tipo 'escala'    → números de `min` a `max`, `rotuloMin`/`rotuloMax`; nota proporcional
//                      (`inverter`: true quando número menor é melhor).
//   tipo 'numero'    → medida com `unidade` (kg, cm, km…); sem nota, vira gráfico.
//   tipo 'texto'     → resposta livre; sem nota.
//   `explicacao: { ativo, texto }` → pede "por quê?" quando a nota for negativa.
// Questionário: { id, titulo, descricao, itens: [{ perguntaId, peso (1–5), ativo }] }
// Check-in (enviado a um paciente): guarda uma cópia das perguntas no momento do envio,
// para editar uma pergunta depois não mudar o que já foi respondido.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.checkin = (function () {
  const TIPOS = {
    carinhas: 'Carinhas (Ótimo a Péssimo)',
    opcoes: 'Múltipla escolha',
    escala: 'Escala numérica',
    numero: 'Medida (kg, cm, km…)',
    texto: 'Resposta livre',
  };
  const CARINHAS = [
    { nota: 2, emoji: '😍', rotulo: 'Ótimo' },
    { nota: 1, emoji: '🙂', rotulo: 'Bom' },
    { nota: 0, emoji: '😐', rotulo: 'Neutro' },
    { nota: -1, emoji: '🙁', rotulo: 'Ruim' },
    { nota: -2, emoji: '😞', rotulo: 'Péssimo' },
  ];
  const CATEGORIAS = {
    alimentacao: '🥗 Alimentação',
    corpo: '⚖️ Corpo e medidas',
    treino: '🏋️ Treino',
    sono: '😴 Sono e disposição',
    digestao: '🫄 Digestão',
    bemestar: '💚 Bem-estar',
  };
  const PESO_PADRAO = 3;

  // Biblioteca inicial: perguntas prontas (dá para editar, desativar e criar outras).
  const BIBLIOTECA = [
    { id: 'q_peso', categoria: 'corpo', icone: '⚖️', sigla: 'KG', titulo: 'Peso atual', texto: 'Qual foi o seu último peso em jejum?', tipo: 'numero', unidade: 'kg', casas: 1 },
    { id: 'q_cintura', categoria: 'corpo', icone: '📏', sigla: 'CIN', titulo: 'Circunferência da cintura', texto: 'Qual a medida da sua cintura (na altura do umbigo)?', tipo: 'numero', unidade: 'cm', casas: 1 },
    { id: 'q_aderencia', categoria: 'alimentacao', icone: '👍', sigla: 'ADE', titulo: 'Aderência ao plano', texto: 'Você está conseguindo fazer as refeições do seu plano?', tipo: 'opcoes', opcoes: [
      { texto: 'Estou fazendo tudo tranquilamente', nota: 2 },
      { texto: 'Faço quase tudo, com alguma dificuldade', nota: 1 },
      { texto: 'Faço só uma parte', nota: -1 },
      { texto: 'Não estou conseguindo seguir', nota: -2 },
    ], explicacao: { ativo: true, texto: 'O que está dificultando? Me conta pra gente ajustar 💚' } },
    { id: 'q_livres', categoria: 'alimentacao', icone: '🍔', sigla: 'LIV', titulo: 'Refeições fora do plano', texto: 'Quantas refeições fora do plano você fez na última semana?', tipo: 'escala', min: 0, max: 5, rotuloMin: 'Nenhuma', rotuloMax: '5 ou mais', inverter: true, explicacao: { ativo: true, texto: 'Conta o que você comeu nessas ocasiões e mais ou menos as quantidades.' } },
    { id: 'q_pular', categoria: 'alimentacao', icone: '⏭️', sigla: 'PUL', titulo: 'Pular refeições', texto: 'Você costuma pular alguma refeição?', tipo: 'opcoes', opcoes: [
      { texto: 'Não pulo refeições', nota: 2 },
      { texto: 'Às vezes pulo uma ou outra na semana', nota: 0 },
      { texto: 'Pulo uma ou mais quase todo dia', nota: -2 },
    ], explicacao: { ativo: true, texto: 'Qual refeição você mais pula e por quê?' } },
    { id: 'q_frutas', categoria: 'alimentacao', icone: '🍎', sigla: 'FRU', titulo: 'Consumo de frutas', texto: 'Quantas porções de fruta você comeu por dia, em média?', tipo: 'escala', min: 0, max: 4, rotuloMin: 'Nenhuma', rotuloMax: '4 ou mais' },
    { id: 'q_vegetais', categoria: 'alimentacao', icone: '🥦', sigla: 'VEG', titulo: 'Consumo de vegetais', texto: 'Quantas porções de verduras e legumes você comeu por dia, em média?', tipo: 'escala', min: 0, max: 4, rotuloMin: 'Nenhuma', rotuloMax: '4 ou mais' },
    { id: 'q_fome', categoria: 'alimentacao', icone: '🍽️', sigla: 'FOM', titulo: 'Níveis de fome', texto: 'Como está a sua fome e o seu apetite?', tipo: 'opcoes', opcoes: [
      { texto: 'Tranquila, bem controlada', nota: 2 },
      { texto: 'Sinto fome em alguns momentos', nota: 0 },
      { texto: 'Sinto muita fome com frequência', nota: -2 },
    ], explicacao: { ativo: true, texto: 'Em que horários a fome aperta mais?' } },
    // Meta de água: 35 ml/kg/dia (faixa usual de 30–40 ml/kg); sem peso no check-in, 2,5 L (referência EFSA p/ adultos).
    { id: 'q_agua', categoria: 'alimentacao', icone: '💧', sigla: 'H2O', titulo: 'Ingestão de água', texto: 'Quantos litros de água você bebeu por dia, em média, nos últimos dias?', tipo: 'numero', unidade: 'L', casas: 1,
      meta: { tipo: 'porPeso', mlPorKg: 35, padrao: 2.5 }, explicacao: { ativo: true, texto: 'O que tem dificultado beber mais água?' } },
    { id: 'q_intestino', categoria: 'digestao', icone: '🚽', sigla: 'INT', titulo: 'Frequência intestinal', texto: 'Como está o funcionamento do seu intestino?', tipo: 'opcoes', opcoes: [
      { texto: 'Todo dia ou quase todo dia', nota: 2 },
      { texto: 'A cada 2 dias', nota: 0 },
      { texto: 'A cada 3 dias ou mais', nota: -2 },
    ] },
    { id: 'q_digestao', categoria: 'digestao', icone: '🫄', sigla: 'DIG', titulo: 'Digestão', texto: 'Alguma refeição está causando desconforto? (azia, gases, estufamento…)', tipo: 'opcoes', opcoes: [
      { texto: 'Não, tudo tranquilo', nota: 2 },
      { texto: 'Às vezes', nota: 0 },
      { texto: 'Sim, com frequência', nota: -2 },
    ], explicacao: { ativo: true, texto: 'Qual refeição ou alimento e o que você sente?' } },
    { id: 'q_sono', categoria: 'sono', icone: '😴', sigla: 'SON', titulo: 'Qualidade do sono', texto: 'Como você avalia a qualidade do seu sono?', tipo: 'carinhas', explicacao: { ativo: true, texto: 'O que tem atrapalhado o seu sono?' } },
    // Sono: 7–9 h por noite para adultos (recomendação AASM/National Sleep Foundation).
    { id: 'q_horas_sono', categoria: 'sono', icone: '🌙', sigla: 'HSO', titulo: 'Horas de sono', texto: 'Quantas horas você está dormindo por noite, em média?', tipo: 'numero', unidade: 'h', casas: 1,
      meta: { tipo: 'faixa', min: 7, max: 9 }, explicacao: { ativo: true, texto: 'O que tem atrapalhado o seu sono?' } },
    { id: 'q_disposicao', categoria: 'sono', icone: '⚡', sigla: 'DIS', titulo: 'Disposição', texto: 'Como está a sua disposição no dia a dia?', tipo: 'carinhas', rotulos: ['Muita disposição', 'Boa', 'Depende do dia', 'Geralmente indisposto(a)', 'Zero disposição'], explicacao: { ativo: true, texto: 'Em quais situações você sente mais cansaço?' } },
    // Treino separado em força e cardio (pedido do Eduardo). "valores": nota e nome de cada número
    // (força: ótimo a partir de 5x na semana; cardio em dias: excelente só com os 7).
    { id: 'q_treino', categoria: 'treino', icone: '🏋️', sigla: 'FOR', titulo: 'Treino de força', texto: 'Quantos treinos de força você fez na última semana? (musculação, crossfit, hyrox, funcional, calistenia…)', tipo: 'escala', min: 0, max: 7, rotuloMin: 'Nenhum', rotuloMax: '7 ou mais',
      valores: [[-2, 'Péssimo'], [-1, 'Ruim'], [0, 'Neutro'], [1, 'Bom'], [1.5, 'Muito bom'], [2, 'Ótimo'], [2, 'Ótimo'], [2, 'Ótimo']].map(([nota, rotulo]) => ({ nota, rotulo })),
      explicacao: { ativo: true, texto: 'O que atrapalhou os treinos nessa semana?' } },
    { id: 'q_aerobico', categoria: 'treino', icone: '🏃', sigla: 'CAR', titulo: 'Cardio e esportes', texto: 'E de cardio ou esporte, em quantos dias da semana? (corrida, bike, natação, caminhada, futebol, futevôlei, beach tennis, lutas…)', tipo: 'escala', min: 0, max: 7, rotuloMin: 'Nenhum dia', rotuloMax: 'Todos os dias', emDias: true,
      valores: [[-2, 'Péssimo'], [-1.5, 'Muito ruim'], [-1, 'Ruim'], [0, 'Neutro'], [1, 'Bom'], [1.5, 'Muito bom'], [1.8, 'Ótimo'], [2, 'Excelente']].map(([nota, rotulo]) => ({ nota, rotulo })) },
    { id: 'q_desempenho', categoria: 'treino', icone: '🚀', sigla: 'DES', titulo: 'Desempenho no treino', texto: 'Como você sentiu o seu rendimento nos treinos?', tipo: 'carinhas' },
    { id: 'q_evolucao', categoria: 'bemestar', icone: '🪞', sigla: 'EVO', titulo: 'Percepção corporal', texto: 'Você consegue notar evolução no corpo em direção ao seu objetivo?', tipo: 'carinhas', rotulos: ['Bastante evolução', 'Consigo notar evolução', 'Não noto evolução', 'Talvez esteja regredindo', 'Estou regredindo'] },
    { id: 'q_humor', categoria: 'bemestar', icone: '💚', sigla: 'HUM', titulo: 'Humor e ansiedade', texto: 'Como você se sentiu emocionalmente nos últimos dias?', tipo: 'carinhas', explicacao: { ativo: true, texto: 'Quer me contar um pouco? Só eu vejo.' } },
    { id: 'q_recado', categoria: 'bemestar', icone: '💬', sigla: 'REC', titulo: 'Recado pro nutri', texto: 'Quer me contar mais alguma coisa? Dúvida, conquista, dificuldade…', tipo: 'texto' },
  ];

  const QUESTIONARIOS_PADRAO = [
    {
      id: 'qs_semanal', titulo: 'Check-in semanal', descricao: 'Revisão rápida da semana: alimentação, corpo, treino e bem-estar.',
      itens: [
        ['q_peso', 3], ['q_aderencia', 5], ['q_livres', 4], ['q_pular', 3], ['q_fome', 3], ['q_agua', 3],
        ['q_intestino', 2], ['q_sono', 3], ['q_horas_sono', 2], ['q_disposicao', 3], ['q_treino', 3], ['q_aerobico', 3], ['q_evolucao', 3], ['q_recado', 1],
      ].map(([perguntaId, peso]) => ({ perguntaId, peso, ativo: true })),
    },
    {
      id: 'qs_atleta', titulo: 'Check-in do atleta', descricao: 'Para quem treina forte: rendimento, recuperação e alimentação no treino.',
      itens: [
        ['q_peso', 3], ['q_aderencia', 5], ['q_treino', 4], ['q_aerobico', 3], ['q_desempenho', 5], ['q_sono', 4],
        ['q_horas_sono', 2], ['q_disposicao', 4], ['q_agua', 4], ['q_digestao', 3], ['q_recado', 1],
      ].map(([perguntaId, peso]) => ({ perguntaId, peso, ativo: true })),
    },
  ];

  const PADRAO = { perguntas: BIBLIOTECA, questionarios: QUESTIONARIOS_PADRAO, prazoDias: 3 };

  /** Configuração salva (documento "checkin") com a biblioteca padrão por baixo. */
  function configuracao(doc = {}) {
    const minhas = Array.isArray(doc.perguntas) ? doc.perguntas : [];
    const ids = new Set(minhas.map((p) => p.id));
    const perguntas = [...minhas, ...BIBLIOTECA.filter((p) => !ids.has(p.id))];
    const meusQ = (Array.isArray(doc.questionarios) ? doc.questionarios : []).map((q) => {
      // Treino separado em força + cardio: o semanal salvo antes ganha o cardio (uma vez só).
      if (q.id !== 'qs_semanal' || q.comCardio || !Array.isArray(q.itens)) return q;
      const itens = [...q.itens];
      const i = itens.findIndex((x) => x.perguntaId === 'q_treino');
      if (i >= 0 && !itens.some((x) => x.perguntaId === 'q_aerobico')) itens.splice(i + 1, 0, { perguntaId: 'q_aerobico', peso: 3, ativo: true });
      return { ...q, itens, comCardio: true };
    });
    const idsQ = new Set(meusQ.map((q) => q.id));
    const questionarios = [...meusQ, ...QUESTIONARIOS_PADRAO.filter((q) => !idsQ.has(q.id) && !(doc.removidos || []).includes(q.id))];
    return { ...PADRAO, ...doc, perguntas, questionarios };
  }

  /** Opções de uma pergunta de carinhas, com os rótulos dela. */
  function carinhasDe(p) {
    return CARINHAS.map((c, i) => ({ ...c, rotulo: (p.rotulos && p.rotulos[i]) || c.rotulo }));
  }

  /** Meta da medida no contexto do check-in (ex.: litros de água pelo peso). */
  function metaDe(p, ctx = {}) {
    const m = p.meta;
    if (!m) return null;
    if (m.tipo === 'porPeso') {
      const peso = Number(ctx.pesoKg);
      const alvo = Number.isFinite(peso) && peso > 20 && peso < 400 ? (peso * Number(m.mlPorKg || 35)) / 1000 : Number(m.padrao || 2.5);
      return { tipo: 'porPeso', alvo: Math.round(alvo * 10) / 10, pelaPeso: Number.isFinite(peso) && peso > 20 };
    }
    if (m.tipo === 'faixa') return { tipo: 'faixa', min: Number(m.min), max: Number(m.max) };
    return null;
  }

  /** Peso (kg) informado no mesmo check-in, para as metas que dependem dele. */
  function pesoDe(perguntas, respostas) {
    const p = (perguntas || []).find((x) => x.id === 'q_peso') || (perguntas || []).find((x) => x.tipo === 'numero' && x.unidade === 'kg');
    const r = p && respostas?.[p.id];
    const v = r && !r.pulou ? Number(String(r.valor).replace(',', '.')) : NaN;
    return Number.isFinite(v) ? v : null;
  }

  /** Nota de -2 a 2 de uma resposta (ou null quando a pergunta não pontua). ctx: { pesoKg }. */
  function nota(p, valor, ctx = {}) {
    if (valor === null || valor === undefined || valor === '') return null;
    if (p.tipo === 'numero') {
      const v = Number(String(valor).replace(',', '.'));
      const m = metaDe(p, ctx);
      if (!m || !Number.isFinite(v)) return null;
      if (m.tipo === 'porPeso') {
        const pct = v / m.alvo;
        return pct >= 1 ? 2 : pct >= 0.85 ? 1 : pct >= 0.7 ? 0 : pct >= 0.5 ? -1 : -2;
      }
      if (m.tipo === 'faixa') {
        if (v >= m.min && v <= m.max) return 2;
        const fora = v < m.min ? m.min - v : v - m.max;
        return fora <= 0.5 ? 1 : fora <= 1 ? 0 : fora <= 2 ? -1 : -2;
      }
      return null;
    }
    if (p.tipo === 'carinhas') { const n = Number(valor); return [2, 1, 0, -1, -2].includes(n) ? n : null; }
    if (p.tipo === 'opcoes') { const o = (p.opcoes || [])[Number(valor)]; return o ? Math.max(-2, Math.min(2, Number(o.nota) || 0)) : null; }
    if (p.tipo === 'escala') {
      const min = Number(p.min ?? 0); const max = Number(p.max ?? 10); const v = Number(valor);
      if (!Number.isFinite(v) || max <= min) return null;
      const fixo = valorFixo(p, v);
      if (fixo) return Math.max(-2, Math.min(2, Number(fixo.nota) || 0));
      // Com meta ("alvo"): chegou na meta = nota máxima; abaixo, proporcional até a meta.
      const alvo = Number(p.alvo);
      if (!p.inverter && Number.isFinite(alvo) && alvo > min && alvo <= max) {
        if (v >= alvo) return 2;
        return Math.round((((Math.max(min, v) - min) / (alvo - min)) * 4 - 2) * 10) / 10;
      }
      let frac = (Math.min(max, Math.max(min, v)) - min) / (max - min);
      if (p.inverter) frac = 1 - frac;
      return Math.round((frac * 4 - 2) * 10) / 10;
    }
    return null;
  }

  /** Rótulo legível da resposta ("😍 Ótimo", "62,4 kg", "3"…). */
  function textoResposta(p, r) {
    if (!r || r.pulou) return r?.pulou ? 'Preferiu não informar' : '—';
    const v = r.valor;
    if (p.tipo === 'carinhas') { const c = carinhasDe(p).find((x) => x.nota === Number(v)); return c ? `${c.emoji} ${c.rotulo}` : '—'; }
    if (p.tipo === 'opcoes') return (p.opcoes || [])[Number(v)]?.texto || '—';
    if (p.tipo === 'numero') return `${Number(String(v).replace(',', '.')).toLocaleString('pt-BR', { maximumFractionDigits: p.casas ?? 1 })} ${p.unidade || ''}`.trim();
    if (p.tipo === 'escala') { const fixo = valorFixo(p, v); return fixo?.rotulo ? `${v} · ${fixo.rotulo}` : String(v); }
    return String(v || '—');
  }

  /** Escala com nota e nome definidos para cada número (p.valores, a partir de p.min). */
  function valorFixo(p, v) {
    if (p.tipo !== 'escala' || !Array.isArray(p.valores) || !p.valores.length) return null;
    const i = Math.round(Number(v)) - Number(p.min ?? 0);
    if (!Number.isFinite(i)) return null;
    return p.valores[Math.max(0, Math.min(p.valores.length - 1, i))] || null;
  }

  /** Quantidade de uma escala: "4x" ou, quando conta dias, "1 dia" / "6 dias". */
  const quantidade = (p, v) => (p.emDias ? `${v} ${Number(v) === 1 ? 'dia' : 'dias'}` : `${v}x`);

  /** Nome da avaliação de uma resposta ("Muito bom", "Ruim"…): o da pergunta, se houver; senão o da faixa. */
  function rotuloResposta(p, valor, ctx = {}) {
    const fixo = valorFixo(p, valor);
    if (fixo?.rotulo) return fixo.rotulo;
    const f = faixa(nota(p, valor, ctx));
    return f ? ROTULO_FAIXA[f] : '';
  }

  /** Cor de uma nota: 'otimo' | 'bom' | 'neutro' | 'ruim' | 'pessimo' | null. */
  function faixa(n) {
    if (n === null || n === undefined) return null;
    if (n >= 1.5) return 'otimo';
    if (n >= 0.5) return 'bom';
    if (n > -0.5) return 'neutro';
    if (n > -1.5) return 'ruim';
    return 'pessimo';
  }
  const EMOJI_FAIXA = { otimo: '😍', bom: '🙂', neutro: '😐', ruim: '🙁', pessimo: '😞' };
  const ROTULO_FAIXA = { otimo: 'Ótimo', bom: 'Bom', neutro: 'Neutro', ruim: 'Ruim', pessimo: 'Péssimo' };

  /** Nota geral (0–100%) ponderada pelos pesos; null se nada pontuou. */
  function score(perguntas, respostas) {
    let soma = 0; let total = 0;
    const ctx = { pesoKg: pesoDe(perguntas, respostas) };
    for (const p of perguntas) {
      const r = respostas?.[p.id];
      const n = r && !r.pulou ? nota(p, r.valor, ctx) : null;
      if (n === null) continue;
      const peso = Number(p.peso) || PESO_PADRAO;
      soma += peso * (n + 2); total += peso * 4;
    }
    return total ? Math.round((soma / total) * 100) : null;
  }
  /** Cor da nota geral: verde ≥ 75, amarela ≥ 55, vermelha abaixo. */
  const corScore = (s) => (s === null || s === undefined ? 'neutro' : s >= 75 ? 'otimo' : s >= 55 ? 'neutro' : 'pessimo');

  /** Cópia das perguntas ativas de um questionário (com o peso de cada uma), para guardar no check-in. */
  function montarPerguntas(questionario, perguntas) {
    const porId = Object.fromEntries(perguntas.map((p) => [p.id, p]));
    return (questionario.itens || [])
      .filter((i) => i.ativo !== false && porId[i.perguntaId] && porId[i.perguntaId].ativa !== false)
      .map((i) => ({ ...porId[i.perguntaId], peso: Number(i.peso) || PESO_PADRAO }));
  }

  /**
   * Confere e limpa as respostas enviadas pelo paciente (servidor).
   * Devolve { respostas } ou { erro }.
   */
  function validarRespostas(perguntas, enviadas = {}) {
    const limpo = (t, max = 1500) => String(t ?? '').replace(/\u0000/g, '').trim().slice(0, max);
    const respostas = {};
    for (const p of perguntas) {
      const r = enviadas[p.id];
      if (!r) continue;
      if (r.pulou === true && p.tipo === 'numero') { respostas[p.id] = { pulou: true }; continue; }
      let valor = r.valor;
      if (p.tipo === 'numero') {
        valor = Number(String(valor).replace(',', '.'));
        if (!Number.isFinite(valor) || valor < 0 || valor > 100000) return { erro: `Confira o valor em "${p.titulo}".` };
      } else if (p.tipo === 'carinhas') {
        valor = Number(valor); if (![2, 1, 0, -1, -2].includes(valor)) continue;
      } else if (p.tipo === 'opcoes') {
        valor = Number(valor); if (!Number.isInteger(valor) || !(p.opcoes || [])[valor]) continue;
      } else if (p.tipo === 'escala') {
        valor = Number(valor); if (!Number.isFinite(valor) || valor < Number(p.min ?? 0) || valor > Number(p.max ?? 10)) continue;
      } else {
        valor = limpo(valor, 3000); if (!valor) continue;
      }
      const item = { valor };
      const explicacao = limpo(r.explicacao);
      if (explicacao) item.explicacao = explicacao;
      respostas[p.id] = item;
    }
    return { respostas };
  }

  /** Situação de um check-in no momento: 'pendente' | 'respondido' | 'expirado'. */
  function situacao(c, agora = new Date()) {
    if (c.respondidoEm) return 'respondido';
    if (c.prazo && new Date(c.prazo) < agora) return 'expirado';
    return 'pendente';
  }

  // ---------------- Envio programado ----------------
  // prog: { ativo, pausado, questionarioId, modo: 'dias' | 'intervalo', dias: [0..6], intervaloDias: 7|14|21|28,
  //         hora: 'HH:MM', prazoDias, inicio: 'AAAA-MM-DD', ultimoSlot: 'AAAA-MM-DD' }
  // Datas no relógio da clínica (Date "local").
  const FREQUENCIAS = { 7: 'Toda semana', 14: 'A cada 2 semanas', 21: 'A cada 3 semanas', 28: 'A cada 4 semanas' };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function diaComHora(iso, hora) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const [h, mi] = String(hora || '09:00').split(':').map(Number);
    return new Date(y, m - 1, d, h || 0, mi || 0);
  }
  const maisDias = (data, n) => { const d = new Date(data); d.setDate(d.getDate() + n); return d; };

  /** Os próximos `n` envios a partir de `de` (inclusive). */
  function proximosEnvios(prog, de, n = 5) {
    if (!prog || !prog.inicio) return [];
    const inicio = diaComHora(prog.inicio, prog.hora);
    const lista = [];
    if (prog.modo === 'intervalo') {
      const passo = Number(prog.intervaloDias) || 7;
      let k = Math.max(0, Math.ceil((de - inicio) / (passo * 864e5)) - 1);
      for (let guard = 0; lista.length < n && guard < n + 400; guard++, k++) {
        const slot = maisDias(inicio, k * passo);
        if (slot >= de) lista.push(slot);
      }
      return lista;
    }
    const dias = (prog.dias || []).map(Number);
    if (!dias.length) return [];
    let d = diaComHora(isoLocal(de > inicio ? de : inicio), prog.hora);
    for (let guard = 0; lista.length < n && guard < 400; guard++, d = maisDias(d, 1)) {
      if (d >= inicio && d >= de && dias.includes(d.getDay())) lista.push(new Date(d));
    }
    return lista;
  }

  /** O envio que já deveria ter acontecido mais recentemente (até `agora`), ou null. */
  function ultimoEnvioDevido(prog, agora) {
    if (!prog || !prog.inicio) return null;
    const inicio = diaComHora(prog.inicio, prog.hora);
    if (agora < inicio) return null;
    if (prog.modo === 'intervalo') {
      const passo = Number(prog.intervaloDias) || 7;
      let k = Math.floor((agora - inicio) / (passo * 864e5));
      let slot = maisDias(inicio, k * passo);
      if (slot > agora) slot = maisDias(inicio, (k - 1) * passo);
      return slot >= inicio ? slot : null;
    }
    const dias = (prog.dias || []).map(Number);
    for (let i = 0; i <= 7; i++) {
      const d = diaComHora(isoLocal(maisDias(agora, -i)), prog.hora);
      if (d <= agora && d >= inicio && dias.includes(d.getDay())) return d;
    }
    return null;
  }

  /** Texto curto da programação: "Toda seg e qui, às 09:00" / "A cada 2 semanas, às 09:00". */
  function descreverProgramacao(prog) {
    if (!prog) return '';
    const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const quando = prog.modo === 'intervalo' ? FREQUENCIAS[prog.intervaloDias] || `A cada ${prog.intervaloDias} dias`
      : `Toda ${[...(prog.dias || [])].sort((a, b) => a - b).map((d) => NOMES[d]).join(', ').replace(/, ([^,]*)$/, ' e $1')}`;
    return `${quando}, às ${prog.hora || '09:00'} · prazo de ${prog.prazoDias || 3} dia(s)`;
  }

  return {
    FREQUENCIAS, proximosEnvios, ultimoEnvioDevido, descreverProgramacao, isoLocal, diaComHora,
    TIPOS, CARINHAS, CATEGORIAS, BIBLIOTECA, QUESTIONARIOS_PADRAO, PESO_PADRAO, EMOJI_FAIXA, ROTULO_FAIXA,
    configuracao, carinhasDe, nota, rotuloResposta, quantidade, metaDe, pesoDe, textoResposta, faixa, score, corScore, montarPerguntas, validarRespostas, situacao,
  };
})();
