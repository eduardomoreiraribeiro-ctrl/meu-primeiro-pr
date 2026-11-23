// Página pública do check-in: o paciente abre pelo link pessoal (o código vem depois do "#",
// que não vai para nenhum servidor de páginas). Fala só com a função "whatsapp-automacoes".
// Endereço de teste, sem servidor: checkin.html#demo
(function () {
  const cfg = (window.NutriDudu && window.NutriDudu.NUVEM) || {};
  // O código vem em ?c= (o navegador do WhatsApp perde o que vem depois do #); links antigos com # continuam valendo.
  const codigo = (new URLSearchParams(location.search).get('c') || decodeURIComponent(location.hash.replace(/^#/, ''))).trim();
  const endereco = cfg.url ? `${cfg.url.replace(/\/+$/, '')}/functions/v1/whatsapp-automacoes` : '';
  const raiz = document.getElementById('checkin');
  const foto = '../nutri/img/avatar.jpg';

  function aviso(titulo, texto) {
    raiz.innerHTML = `<div class="aviso"><strong>${titulo}</strong>${texto}</div>`;
  }

  if (codigo === 'demo') {
    const C = NutriDudu.checkin;
    const q = C.QUESTIONARIOS_PADRAO[0];
    NutriDudu.checkinTela.montar(raiz, {
      perguntas: C.montarPerguntas(q, C.BIBLIOTECA), nome: 'Mariana', titulo: q.titulo,
      profissional: { nome: 'Eduardo Ribeiro', foto },
    });
    return;
  }
  if (!codigo || codigo.length < 20 || !endereco) { aviso('Link inválido', 'Confira se você abriu o link completo que chegou no WhatsApp.'); return; }

  fetch(`${endereco}?checkin=${encodeURIComponent(codigo)}`)
    .then(async (r) => ({ ok: r.ok, corpo: await r.json().catch(() => ({})) }))
    .then(({ ok, corpo }) => {
      if (!ok || corpo.erro) { aviso(corpo.titulo || 'Ops!', corpo.erro || 'Não foi possível abrir o check-in agora. Tente de novo mais tarde.'); return; }
      document.title = corpo.titulo || 'Check-in';
      NutriDudu.checkinTela.montar(raiz, {
        perguntas: corpo.perguntas, nome: corpo.nome, titulo: corpo.titulo,
        profissional: { nome: corpo.profissional || 'Seu nutricionista', foto },
        aoEnviar: async (respostas) => {
          const r = await fetch(endereco, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'checkin', t: codigo, respostas }) });
          const dados = await r.json().catch(() => ({}));
          if (!r.ok || dados.erro) throw new Error(dados.erro || 'Não foi possível enviar agora. Tente de novo.');
          return dados;
        },
      });
    })
    .catch(() => aviso('Sem conexão', 'Confira a internet e abra o link de novo.'));
})();
