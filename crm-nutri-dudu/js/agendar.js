// Página pública de agendamento (agendar.html): o paciente escolhe o serviço, a
// modalidade e um horário livre, e informa nome e WhatsApp. Fala só com a função
// "whatsapp-automacoes" do Supabase. Para ver sem a nuvem: agendar.html#demo
(function () {
  const cfg = (window.NutriDudu && window.NutriDudu.NUVEM) || {};
  const demo = location.hash === '#demo';
  const endereco = cfg.url ? `${cfg.url.replace(/\/+$/, '')}/functions/v1/whatsapp-automacoes` : '';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const form = $('[data-bloco-dados]');
  const MODALIDADES = { presencial: ['🏥', 'Presencial', 'No consultório'], online: ['💻', 'Online', 'Por videochamada'] };
  const estado = { catalogo: null, servico: null, modalidade: null, semana: 0, horario: null };

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
      mensagem: 'Consultas presenciais de segunda a sexta e online também aos sábados.',
      servicos: [
        { id: 'srv_1', nome: 'Consulta inicial', descricao: 'Anamnese completa, avaliação física e plano alimentar personalizado.', valor: 'R$ 250,00', duracaoMin: 60, modalidades: ['presencial', 'online'] },
        { id: 'srv_2', nome: 'Retorno', descricao: 'Acompanhamento da evolução e ajustes no plano.', valor: 'R$ 150,00', duracaoMin: 40, modalidades: ['presencial', 'online'] },
      ],
    };
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

  // ---------- Passo 1: serviço ----------
  function desenharServicos() {
    const lugar = $('[data-servicos]');
    lugar.innerHTML = '';
    estado.catalogo.servicos.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao';
      b.setAttribute('aria-pressed', String(estado.servico?.id === s.id));
      // Só o nome e a descrição: o preço não aparece na página (a nutricionista conversa sobre valores).
      b.innerHTML = '<div><strong></strong><span class="small muted"></span></div>';
      b.querySelector('strong').textContent = s.nome;
      b.querySelector('.small').textContent = s.descricao || '';
      b.addEventListener('click', () => escolherServico(s));
      lugar.appendChild(b);
    });
  }

  function escolherServico(s) {
    estado.servico = s;
    estado.horario = null;
    desenharServicos();
    form.hidden = true;
    const varias = s.modalidades.length > 1;
    $('[data-bloco-modalidade]').hidden = !varias;
    $('[data-passo-horario]').textContent = varias ? '3' : '2';
    $('[data-passo-dados]').textContent = varias ? '4' : '3';
    if (!s.modalidades.includes(estado.modalidade)) estado.modalidade = varias ? null : s.modalidades[0];
    desenharModalidades();
    if (estado.modalidade) carregarHorarios(0);
    else $('[data-bloco-horarios]').hidden = true;
    (varias ? $('[data-bloco-modalidade]') : $('[data-bloco-horarios]')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Passo 2: modalidade ----------
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
        form.hidden = true;
        desenharModalidades();
        carregarHorarios(0);
        $('[data-bloco-horarios]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      lugar.appendChild(b);
    });
  }

  // ---------- Passo 3: horário ----------
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
          abrirDados();
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

  // ---------- Passo 4: dados ----------
  function abrirDados() {
    form.hidden = false;
    const m = MODALIDADES[estado.modalidade][1].toLowerCase();
    $('[data-resumo-escolha]').textContent = `${estado.servico.nome} (${m}) · ${estado.horario.quando} · ${estado.horario.profissional}`;
    $('[data-erro-form]').hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function formatarTelefone(valor) {
    const d = valor.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
  form.elements.telefone.addEventListener('blur', () => { form.elements.telefone.value = formatarTelefone(form.elements.telefone.value); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const aviso = $('[data-erro-form]');
    aviso.hidden = true;
    const falha = (texto, foco) => { aviso.textContent = texto; aviso.hidden = false; if (foco) foco.focus(); };
    const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
    const telefone = form.elements.telefone.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (nome.length < 3 || !nome.includes(' ')) { falha('Informe o seu nome completo.', form.elements.nome); return; }
    if (!/^\d{2}9\d{8}$/.test(telefone)) { falha('Informe um celular com DDD, por exemplo (27) 99999-0000.', form.elements.telefone); return; }
    if (!form.elements.consentimento.checked) { falha('Para agendar, marque a caixa de concordância.', form.elements.consentimento); return; }
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    botao.textContent = 'Agendando…';
    try {
      let r;
      if (demo) {
        r = { ok: true, quando: estado.horario.quando, profissional: estado.horario.profissional, servico: estado.servico.nome, modalidade: estado.modalidade, whatsapp: '', ...(estado.modalidade === 'online' ? { linkOnline: 'https://meet.google.com/exemplo-ficticio' } : {}) };
      } else {
        const resp = await pedir('', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acao: 'agendar-site', servicoId: estado.servico.id, modalidade: estado.modalidade, inicio: estado.horario.inicio,
            profissionalId: estado.horario.profissionalId, nome, telefone, email: form.elements.email.value.trim(),
            consentimento: true, site: form.elements.site.value,
          }),
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
      if (r.whatsapp) whats.href = linkWhats(r.whatsapp, `Olá! Acabei de agendar pelo site: ${minusculo(r.quando)} (${r.servico}). Meu nome é ${nome}.`);
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
    desenharServicos();
    mostrar('agendar');
    if (catalogo.servicos.length === 1) escolherServico(catalogo.servicos[0]);
  }

  iniciar();
})();
