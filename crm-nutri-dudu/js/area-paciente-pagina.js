// Página pública da área do paciente: abre pelo link pessoal (o código vem depois do "#",
// que não vai para nenhum servidor de páginas). Fala só com a função "whatsapp-automacoes".
(function () {
  const cfg = (window.NutriDudu && window.NutriDudu.NUVEM) || {};
  const codigo = decodeURIComponent(location.hash.replace(/^#/, ''));
  const endereco = cfg.url ? `${cfg.url.replace(/\/+$/, '')}/functions/v1/whatsapp-automacoes` : '';
  const raiz = document.getElementById('area');

  function aviso(titulo, texto) {
    raiz.innerHTML = `<div class="aviso"><strong>${titulo}</strong>${texto}</div>`;
  }

  if (!codigo || codigo.length < 20 || !endereco) { aviso('Link inválido', 'Confira se você abriu o link completo que chegou no WhatsApp.'); return; }

  fetch(`${endereco}?area=${encodeURIComponent(codigo)}`)
    .then(async (r) => ({ ok: r.ok, corpo: await r.json().catch(() => ({})) }))
    .then(({ ok, corpo }) => {
      if (!ok || corpo.erro) { aviso(corpo.titulo || 'Ops!', corpo.erro || 'Não foi possível abrir agora. Tente de novo mais tarde.'); return; }
      document.title = corpo.nome ? `${corpo.nome} · Meu acompanhamento` : 'Meu acompanhamento';
      NutriDudu.areaPacienteTela.montar(raiz, corpo, { foto: '../nutri/img/avatar.jpg' });
    })
    .catch(() => aviso('Sem conexão', 'Confira a internet e abra o link de novo.'));
})();
