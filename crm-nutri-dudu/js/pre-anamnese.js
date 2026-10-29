// Página pública da pré-anamnese: o paciente abre pelo link pessoal recebido no
// WhatsApp (o código vem depois do "#", que não é enviado a nenhum servidor de páginas).
// Fala só com a função "whatsapp-automacoes" do Supabase. Endereço de teste: pre-anamnese.html#demo
(function () {
  const cfg = (window.NutriDudu && window.NutriDudu.NUVEM) || {};
  const codigo = decodeURIComponent(location.hash.replace(/^#/, ''));
  const demo = codigo === 'demo';
  const endereco = cfg.url ? `${cfg.url.replace(/\/+$/, '')}/functions/v1/whatsapp-automacoes` : '';
  const chaveRascunho = `nutridudu-pre:${codigo.slice(0, 12)}`;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const form = $('form');

  function mostrar(tela) {
    $$('[data-tela]').forEach((el) => { el.hidden = el.dataset.tela !== tela; });
    window.scrollTo(0, 0);
  }
  function erro(texto) {
    $('[data-erro-texto]').textContent = texto;
    mostrar('erro');
  }

  // ---------- Listas (alergias, medicamentos) ----------
  const LISTAS = {
    alergias: {
      campos: [
        { nome: 'substancia', tipo: 'texto', rotulo: 'Alimento ou substância', placeholder: 'Ex.: camarão' },
        { nome: 'tipo', tipo: 'opcoes', rotulo: 'Tipo', opcoes: { alergia: 'Alergia', intolerancia: 'Intolerância' } },
        { nome: 'gravidade', tipo: 'opcoes', rotulo: 'Gravidade', opcoes: { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' } },
      ],
    },
    medicamentos: {
      classe: 'med',
      campos: [
        { nome: 'nome', tipo: 'texto', rotulo: 'Nome', placeholder: 'Ex.: vitamina D' },
        { nome: 'dose', tipo: 'texto', rotulo: 'Dose', placeholder: 'Ex.: 2.000 UI' },
        { nome: 'frequencia', tipo: 'texto', rotulo: 'Quando', placeholder: 'Ex.: 1x ao dia' },
      ],
    },
  };

  function adicionarLinha(lista, valores = {}) {
    const def = LISTAS[lista];
    const linha = document.createElement('div');
    linha.className = `linha ${def.classe || ''}`;
    def.campos.forEach((c) => {
      let el;
      if (c.tipo === 'opcoes') {
        el = document.createElement('select');
        Object.entries(c.opcoes).forEach(([v, r]) => { const o = document.createElement('option'); o.value = v; o.textContent = r; el.appendChild(o); });
        if (valores[c.nome]) el.value = valores[c.nome];
      } else {
        el = document.createElement('input');
        el.type = 'text';
        el.maxLength = 200;
        el.placeholder = c.placeholder;
        el.value = valores[c.nome] || '';
      }
      el.dataset.campo = c.nome;
      el.setAttribute('aria-label', c.rotulo);
      linha.appendChild(el);
    });
    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'remover';
    remover.setAttribute('aria-label', 'Remover');
    remover.textContent = '×';
    remover.addEventListener('click', () => { linha.remove(); guardarRascunho(); });
    linha.appendChild(remover);
    $(`[data-lista="${lista}"]`).appendChild(linha);
    return linha;
  }

  function lerLista(lista) {
    return $$(`[data-lista="${lista}"] .linha`).map((linha) => Object.fromEntries(
      [...linha.querySelectorAll('[data-campo]')].map((el) => [el.dataset.campo, el.value.trim()]),
    )).filter((item) => Object.values(item)[0]);
  }

  function respostas() {
    const v = (nome) => form.elements[nome].value.trim();
    return {
      queixa: v('queixa'), historicoSaude: v('historicoSaude'), habitosVida: v('habitosVida'), habitosAlimentares: v('habitosAlimentares'),
      alergias: lerLista('alergias'), medicamentos: lerLista('medicamentos'),
    };
  }

  // ---------- Rascunho (só nesta aba, para não perder o que foi digitado) ----------
  function guardarRascunho() {
    try { sessionStorage.setItem(chaveRascunho, JSON.stringify(respostas())); } catch (e) { /* sem armazenamento */ }
  }
  function lerRascunho() {
    try { return JSON.parse(sessionStorage.getItem(chaveRascunho) || 'null'); } catch (e) { return null; }
  }

  // ---------- Início ----------
  async function iniciar() {
    if (!codigo) { erro('Este link está incompleto. Abra de novo pelo link que a clínica enviou no WhatsApp.'); return; }
    let info;
    if (demo) {
      info = { nome: 'Mariana', clinica: 'Nutri Dudu', consulta: 'Quinta-feira, 05/11 às 10:00', profissional: 'Dra. Ana Lima' };
    } else {
      if (!endereco) { erro('O sistema da clínica ainda não está configurado.'); return; }
      try {
        const resp = await fetch(`${endereco}?t=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
        info = await resp.json().catch(() => ({}));
        if (!resp.ok) { erro(info.erro || 'Este link não é válido.'); return; }
      } catch (e) {
        erro('Sem conexão com a clínica agora. Confira a internet e tente de novo.');
        return;
      }
    }
    $$('[data-clinica]').forEach((el) => { el.textContent = info.clinica || 'Nutri Dudu'; });
    document.title = `Pré-anamnese · ${info.clinica || 'Nutri Dudu'}`;
    $('[data-nome]').textContent = info.nome || '';
    $('[data-consulta]').textContent = String(info.consulta || '').replace(/^./, (c) => c.toLowerCase());
    $('[data-profissional]').textContent = info.profissional ? ` com ${info.profissional}` : '';

    const rascunho = lerRascunho();
    if (rascunho) {
      ['queixa', 'historicoSaude', 'habitosVida', 'habitosAlimentares'].forEach((n) => { form.elements[n].value = rascunho[n] || ''; });
      (rascunho.alergias || []).forEach((a) => adicionarLinha('alergias', a));
      (rascunho.medicamentos || []).forEach((m) => adicionarLinha('medicamentos', m));
    }
    mostrar('formulario');
  }

  $$('[data-adicionar]').forEach((b) => b.addEventListener('click', () => {
    const linha = adicionarLinha(b.dataset.adicionar);
    linha.querySelector('input').focus();
  }));
  form.addEventListener('input', guardarRascunho);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const aviso = $('[data-erro-form]');
    aviso.hidden = true;
    const r = respostas();
    const falha = (texto, foco) => { aviso.textContent = texto; aviso.hidden = false; if (foco) foco.focus(); };
    if (!r.queixa) { falha('Conte pelo menos o seu objetivo (pergunta 1).', form.elements.queixa); return; }
    if (!form.elements.consentimento.checked) { falha('Para enviar, marque a autorização de uso dos dados de saúde.', form.elements.consentimento); return; }
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    try {
      if (!demo) {
        const resp = await fetch(endereco, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'pre-anamnese', t: codigo, consentimento: true, respostas: r }),
        });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          if ([409, 410, 404].includes(resp.status)) { erro(corpo.erro || 'Este link não é mais válido.'); return; }
          falha(corpo.erro || 'Não foi possível enviar agora. Tente de novo em instantes.');
          return;
        }
      }
      try { sessionStorage.removeItem(chaveRascunho); } catch (er) { /* ok */ }
      mostrar('pronto');
    } catch (er) {
      falha('Sem conexão. Suas respostas continuam aqui: confira a internet e toque em enviar de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Enviar para a nutricionista';
    }
  });

  iniciar();
})();
