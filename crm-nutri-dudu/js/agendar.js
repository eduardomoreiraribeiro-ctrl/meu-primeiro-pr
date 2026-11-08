// Página pública de agendamento (agendar.html), em 3 passos:
//   1. cadastro rápido (nome, WhatsApp, e-mail): a pessoa já vira lead no sistema;
//   2. planos com os preços (só aparecem depois do cadastro);
//   3. presencial ou online, horário e confirmação.
// Fala só com a função "whatsapp-automacoes" do Supabase. Para ver sem a nuvem: agendar.html#demo
(function () {
  const cfg = (window.NutriDudu && window.NutriDudu.NUVEM) || {};
  const demo = location.hash === '#demo';
  const endereco = cfg.url ? `${cfg.url.replace(/\/+$/, '')}/functions/v1/whatsapp-automacoes` : '';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const formCadastro = $('[data-form-cadastro]');
  const MODALIDADES = { presencial: ['🏥', 'Presencial', 'No consultório'], online: ['💻', 'Online', 'Por videochamada'] };
  const estado = { catalogo: null, contato: null, servicos: [], servico: null, modalidade: null, semana: 0, horario: null };
  const CHAVE_CONTATO = 'nutridudu-agendar-contato';

  function mostrar(tela) {
    $$('[data-tela]').forEach((el) => { el.hidden = el.dataset.tela !== tela; });
    window.scrollTo(0, 0);
  }
  function linkWhats(numero, texto) {
    return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : '';
  }
  function erro(texto, whatsapp = '') {
    $('[data-erro-texto]').textContent = texto;
    const a = $('[data-whats-erro]');
    a.hidden = !whatsapp;
    if (whatsapp) a.href = linkWhats(whatsapp, 'Olá! Gostaria de agendar uma consulta.');
    mostrar('erro');
  }
  // Iniciais do logo: "Nutricionista Eduardo Ribeiro" → "ER" (ignora títulos como Nutricionista, Nutri, Dra.).
  function iniciais(nome) {
    const palavras = String(nome || '').split(/\s+/).filter((p) => p && !/^(nutricionista|nutri|dra?\.?|clínica|clinica|consultório|consultorio|de|da|do|das|dos|e)$/i.test(p));
    const letras = (palavras.length > 1 ? [palavras[0], palavras[palavras.length - 1]] : palavras).map((p) => p[0].toUpperCase()).join('');
    return letras || 'N';
  }
  function mostrarNome(nome) {
    $$('[data-clinica]').forEach((el) => { el.textContent = nome; });
    $$('[data-iniciais]').forEach((el) => { el.textContent = iniciais(nome); });
  }
  const minusculo = (t) => String(t || '').replace(/^./, (c) => c.toLowerCase());

  // ---------- Dados de demonstração (sem a nuvem) ----------
  function demoCatalogo() {
    return {
      ok: true, clinica: 'Nutri Dudu', whatsapp: '',
      mensagem: 'Comece com um cadastro rápido. Em seguida, você vê os planos e escolhe o melhor horário.',
      servicos: [{ id: 'srv_1', nome: 'Consulta avulsa', modalidades: ['presencial', 'online'] }, { id: 'srv_3', nome: 'Plano trimestral', modalidades: ['presencial', 'online'] }],
    };
  }
  function demoPrecos() {
    return [
      { id: 'srv_1', nome: 'Consulta avulsa', categoria: 'consulta', valor: 'R$ 390,00', modalidades: ['presencial', 'online'] },
      { id: 'srv_3', nome: 'Plano trimestral', categoria: 'pacote', valor: 'R$ 990,00', parcelas: 3, valorParcela: 'R$ 330,00', consultas: 3, modalidades: ['presencial', 'online'] },
      { id: 'srv_4', nome: 'Plano semestral', categoria: 'pacote', valor: 'R$ 1.740,00', parcelas: 6, valorParcela: 'R$ 290,00', consultas: 6, modalidades: ['presencial', 'online'] },
      { id: 'srv_5', nome: 'Plano anual', categoria: 'pacote', valor: 'R$ 3.000,00', parcelas: 12, valorParcela: 'R$ 250,00', consultas: 12, modalidades: ['presencial', 'online'] },
    ];
  }
  function demoHorarios(semana) {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const lista = [];
    for (let i = 1 + semana * 7; lista.length < 5 && i < 8 + semana * 7; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const p = (n) => String(n).padStart(2, '0');
      const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const nomeDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(d);
      [lista.length % 2 ? '14:00' : '09:00'].forEach((h) => lista.push({ inicio: `${dia}T${h}`, quando: `${nomeDia.replace(/^./, (c) => c.toUpperCase())} às ${h}`, profissionalId: 'prof_1', profissional: 'Dra. Ana Lima' }));
    }
    return { ok: true, horarios: lista, poucos: false, temMais: semana < 3 };
  }

  async function pedir(caminho, opcoes) {
    const resp = await fetch(`${endereco}${caminho}`, { cache: 'no-store', ...opcoes });
    const corpo = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, corpo };
  }
  const postar = (corpo) => pedir('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

  // ---------- Passo 1: cadastro (vira lead) ----------
  function formatarTelefone(valor) {
    const d = valor.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
  formCadastro.elements.telefone.addEventListener('blur', () => { formCadastro.elements.telefone.value = formatarTelefone(formCadastro.elements.telefone.value); });

  formCadastro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formCadastro.elements;
    const aviso = $('[data-erro-cadastro]');
    aviso.hidden = true;
    const falha = (texto, foco) => { aviso.textContent = texto; aviso.hidden = false; if (foco) foco.focus(); };
    const contato = {
      nome: f.nome.value.replace(/\s+/g, ' ').trim(),
      telefone: f.telefone.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''),
      email: f.email.value.trim(),
    };
    if (contato.nome.length < 3 || !contato.nome.includes(' ')) { falha('Informe o seu nome completo.', f.nome); return; }
    if (!/^\d{2}9\d{8}$/.test(contato.telefone)) { falha('Informe um celular com DDD, por exemplo (27) 99999-0000.', f.telefone); return; }
    if (contato.email && !/\S+@\S+\.\S+/.test(contato.email)) { falha('E-mail inválido.', f.email); return; }
    if (!f.consentimento.checked) { falha('Para continuar, marque a caixa de concordância.', f.consentimento); return; }
    const botao = formCadastro.querySelector('[type="submit"]');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    try {
      let r;
      if (demo) r = { ok: true, nome: contato.nome.split(' ')[0], servicos: demoPrecos() };
      else {
        const resp = await postar({ acao: 'cadastro-site', ...contato, consentimento: true, site: f.site.value });
        if (!resp.ok) { falha(resp.corpo.erro || 'Não foi possível continuar agora. Tente de novo em instantes.'); return; }
        r = resp.corpo;
      }
      estado.contato = contato;
      estado.servicos = r.servicos || [];
      try { sessionStorage.setItem(CHAVE_CONTATO, JSON.stringify({ contato, servicos: estado.servicos, nome: r.nome })); } catch (er) { /* sem armazenamento */ }
      abrirPlanos(r.nome);
    } catch (er) {
      falha('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Continuar';
    }
  });

  // ---------- Passo 2: planos com preços ----------
  function abrirPlanos(primeiroNome) {
    $('[data-ola]').textContent = primeiroNome ? `${primeiroNome}, escolha o seu plano` : 'Escolha o seu plano';
    desenharServicos();
    mostrar('agendar');
    if (estado.servicos.length === 1) escolherServico(estado.servicos[0]);
  }

  function desenharServicos() {
    const lugar = $('[data-servicos]');
    lugar.innerHTML = '';
    estado.servicos.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao';
      b.setAttribute('aria-pressed', String(estado.servico?.id === s.id));
      b.innerHTML = '<div><strong></strong><span class="small muted"></span></div><span class="preco"></span>';
      b.querySelector('strong').textContent = s.nome;
      b.querySelector('.small').textContent = s.consultas ? `${s.consultas} consultas` : (s.descricao || '');
      const preco = b.querySelector('.preco');
      if (s.parcelas > 1) {
        preco.textContent = `${s.parcelas}x de ${s.valorParcela}`;
        const total = document.createElement('small');
        total.textContent = `total ${s.valor}`;
        preco.appendChild(total);
      } else {
        preco.textContent = s.valor || '';
      }
      b.addEventListener('click', () => escolherServico(s));
      lugar.appendChild(b);
    });
  }

  function escolherServico(s) {
    estado.servico = s;
    estado.horario = null;
    desenharServicos();
    $('[data-bloco-confirmar]').hidden = true;
    const varias = s.modalidades.length > 1;
    $('[data-bloco-modalidade]').hidden = !varias;
    $('[data-passo-horario]').textContent = varias ? '3' : '2';
    $('[data-passo-confirmar]').textContent = varias ? '4' : '3';
    if (!s.modalidades.includes(estado.modalidade)) estado.modalidade = varias ? null : s.modalidades[0];
    desenharModalidades();
    if (estado.modalidade) carregarHorarios(0);
    else $('[data-bloco-horarios]').hidden = true;
    (varias ? $('[data-bloco-modalidade]') : $('[data-bloco-horarios]')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Presencial ou online ----------
  function desenharModalidades() {
    const lugar = $('[data-modalidades]');
    lugar.innerHTML = '';
    estado.servico.modalidades.forEach((m) => {
      const [icone, nome, ajuda] = MODALIDADES[m];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao';
      b.setAttribute('aria-pressed', String(estado.modalidade === m));
      b.innerHTML = '<div><strong></strong><span class="small muted"></span></div>';
      b.querySelector('strong').textContent = `${icone} ${nome}`;
      b.querySelector('.small').textContent = ajuda;
      b.addEventListener('click', () => {
        estado.modalidade = m;
        estado.horario = null;
        $('[data-bloco-confirmar]').hidden = true;
        desenharModalidades();
        carregarHorarios(0);
        $('[data-bloco-horarios]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      lugar.appendChild(b);
    });
  }

  // ---------- Horário ----------
  async function carregarHorarios(semana) {
    estado.semana = semana;
    const bloco = $('[data-bloco-horarios]');
    bloco.hidden = false;
    const lugar = $('[data-horarios]');
    lugar.innerHTML = '<p class="muted small">Procurando horários…</p>';
    $('[data-mais-datas]').hidden = true;
    $('[data-datas-anteriores]').hidden = true;
    let r;
    if (demo) {
      r = demoHorarios(semana);
    } else {
      try {
        const resp = await pedir(`?site=horarios&servico=${encodeURIComponent(estado.servico.id)}&modalidade=${estado.modalidade}&semana=${semana}`);
        if (!resp.ok) { lugar.innerHTML = ''; lugar.appendChild(Object.assign(document.createElement('p'), { className: 'erro', textContent: resp.corpo.erro || 'Não foi possível ver os horários agora.' })); return; }
        r = resp.corpo;
      } catch (e) {
        lugar.innerHTML = '<p class="erro">Sem conexão. Confira a internet e tente de novo.</p>';
        return;
      }
    }
    lugar.innerHTML = '';
    $('[data-horarios-ajuda]').textContent = r.poucos
      ? 'Restam poucos horários nesta semana. Separamos os próximos livres:'
      : 'Separamos os próximos horários livres da agenda:';
    if (!r.horarios.length) {
      lugar.appendChild(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Nenhum horário livre nestes dias.' }));
    }
    // Agrupa por dia: "Quarta-feira, 04/11" → 09:00 · 14:00
    const porDia = new Map();
    r.horarios.forEach((h) => {
      const [dia] = h.quando.split(' às ');
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(h);
    });
    const variosProfs = new Set(r.horarios.map((h) => h.profissionalId)).size > 1;
    porDia.forEach((lista, dia) => {
      const grupo = document.createElement('div');
      grupo.className = 'dia';
      grupo.innerHTML = '<h3></h3><div class="horas"></div>';
      grupo.querySelector('h3').textContent = dia;
      lista.forEach((h) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hora';
        b.setAttribute('aria-pressed', String(estado.horario === h));
        b.textContent = h.inicio.slice(11, 16);
        if (variosProfs) {
          const s = document.createElement('small');
          s.textContent = ` · ${h.profissional}`;
          b.appendChild(s);
        }
        b.addEventListener('click', () => {
          estado.horario = h;
          $$('.hora').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          abrirConfirmacao();
        });
        grupo.querySelector('.horas').appendChild(b);
      });
      lugar.appendChild(grupo);
    });
    $('[data-mais-datas]').hidden = !r.temMais;
    $('[data-datas-anteriores]').hidden = semana === 0;
  }
  const irParaHorarios = (semana) => {
    carregarHorarios(semana);
    $('[data-bloco-horarios]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('[data-mais-datas]').addEventListener('click', () => irParaHorarios(estado.semana + 1));
  $('[data-datas-anteriores]').addEventListener('click', () => irParaHorarios(Math.max(0, estado.semana - 1)));

  // ---------- Confirmação ----------
  function abrirConfirmacao() {
    const bloco = $('[data-bloco-confirmar]');
    bloco.hidden = false;
    const m = MODALIDADES[estado.modalidade][1].toLowerCase();
    $('[data-resumo-escolha]').textContent = `${estado.servico.nome} (${m}) · ${estado.horario.quando} · ${estado.horario.profissional}`;
    $('[data-erro-form]').hidden = true;
    bloco.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('[data-confirmar]').addEventListener('click', async () => {
    const aviso = $('[data-erro-form]');
    aviso.hidden = true;
    const falha = (texto) => { aviso.textContent = texto; aviso.hidden = false; };
    const botao = $('[data-confirmar]');
    botao.disabled = true;
    botao.textContent = 'Agendando…';
    try {
      let r;
      if (demo) {
        r = { ok: true, quando: estado.horario.quando, profissional: estado.horario.profissional, servico: estado.servico.nome, modalidade: estado.modalidade, whatsapp: '', ...(estado.modalidade === 'online' ? { linkOnline: 'https://meet.google.com/exemplo-ficticio' } : {}) };
      } else {
        const resp = await postar({
          acao: 'agendar-site', servicoId: estado.servico.id, modalidade: estado.modalidade, inicio: estado.horario.inicio,
          profissionalId: estado.horario.profissionalId, ...estado.contato, consentimento: true,
        });
        if (!resp.ok) {
          falha(resp.corpo.erro || 'Não foi possível agendar agora. Tente de novo em instantes.');
          if (resp.status === 409 && /preenchido|disponível/.test(resp.corpo.erro || '')) carregarHorarios(estado.semana);
          return;
        }
        r = resp.corpo;
      }
      $('[data-pronto-quando]').textContent = r.quando;
      $('[data-pronto-detalhe]').textContent = `${r.servico}${r.modalidade === 'online' ? ' online' : ''}${r.profissional ? ` com ${r.profissional}` : ''}`;
      const online = $('[data-pronto-online]');
      online.hidden = r.modalidade !== 'online';
      online.textContent = r.linkOnline
        ? `A consulta é por videochamada. O link também vai pelo WhatsApp: ${r.linkOnline}`
        : 'A consulta é por videochamada. O link chega pelo WhatsApp antes do horário.';
      const whats = $('[data-whats-pronto]');
      whats.hidden = !r.whatsapp;
      if (r.whatsapp) whats.href = linkWhats(r.whatsapp, `Olá! Acabei de agendar pelo site: ${minusculo(r.quando)} (${r.servico}). Meu nome é ${estado.contato.nome}.`);
      try { sessionStorage.removeItem(CHAVE_CONTATO); } catch (er) { /* ok */ }
      mostrar('pronto');
    } catch (er) {
      falha('Sem conexão. Confira a internet e toque em confirmar de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Confirmar agendamento';
    }
  });

  // ---------- Início ----------
  async function iniciar() {
    let catalogo;
    if (demo) {
      catalogo = demoCatalogo();
    } else {
      if (!endereco) { erro('O sistema da clínica ainda não está configurado.'); return; }
      try {
        const resp = await pedir('?site=catalogo');
        if (!resp.ok) { if (resp.corpo.clinica) mostrarNome(resp.corpo.clinica); erro(resp.corpo.erro || 'O agendamento pelo site está fechado no momento.', resp.corpo.whatsapp); return; }
        catalogo = resp.corpo;
      } catch (e) {
        erro('Sem conexão com a clínica agora. Confira a internet e tente de novo.');
        return;
      }
    }
    estado.catalogo = catalogo;
    mostrarNome(catalogo.clinica || 'Consultório de nutrição');
    if (catalogo.clinica) document.title = `Agendar consulta · ${catalogo.clinica}`;
    if (catalogo.mensagem) $('[data-mensagem]').textContent = catalogo.mensagem;
    // Já se cadastrou nesta aba (ex.: recarregou a página)? Volta direto para os planos.
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE_CONTATO) || 'null');
      if (salvo?.contato && Array.isArray(salvo.servicos) && salvo.servicos.length) {
        estado.contato = salvo.contato;
        estado.servicos = salvo.servicos;
        abrirPlanos(salvo.nome);
        return;
      }
    } catch (e) { /* sem armazenamento */ }
    mostrar('cadastro');
  }

  iniciar();
})();
