// Área do paciente na ficha: criar/trocar/desligar o link pessoal, mandar para o paciente
// e ver a prévia exatamente como ele vê.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.areaPacienteFicha = (function () {
  const U = () => NutriDudu.utils;
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');

  function novoCodigo() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function resumo(codigo) {
    const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codigo)));
    return [...dig].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const base = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  const linkDe = (codigo) => `${base()}a/${codigo}`;
  const janelaAberta = (conversa) => Boolean(conversa?.ultimaMensagemContatoEm && Date.now() - new Date(conversa.ultimaMensagemContatoEm).getTime() < 23.5 * 3600 * 1000);

  function textoConvite(pessoa, link) {
    const nome = String(pessoa.nome || '').trim().split(/\s+/)[0];
    const t = `Oi, ${nome}! Agora você tem uma área só sua pra acompanhar sua evolução, suas consultas e seus check-ins 😊 Salva esse link: ${link}`;
    return NutriDudu.mensagensAutomaticas?.paraGenero ? NutriDudu.mensagensAutomaticas.paraGenero(t, pessoa) : t;
  }

  /** Dados da tela, montados com o que já está no sistema (igual ao que o servidor manda). */
  async function dadosDaPessoa(pessoa) {
    const { store } = NutriDudu;
    const doPaciente = (x) => x.pessoaId === pessoa.id;
    const [consultas, pacotes, servicos, avaliacoes, checkins, site, autom] = await Promise.all([
      store.list('consultas', doPaciente), store.list('pacotes', doPaciente), store.list('servicos'),
      store.list('avaliacoes', doPaciente), store.list('checkins', doPaciente), store.get('configuracoes', 'agendamento_site'), store.get('configuracoes', 'automacoes'),
    ]);
    const profissional = pessoa.profissionalId ? await store.get('profissionais', pessoa.profissionalId) : null;
    const A = NutriDudu.acompanhamento;
    const objetivos = A.publico(A.atual(await store.list('acompanhamentos', doPaciente).catch(() => [])));
    return NutriDudu.areaPaciente.montar({
      pessoa, profissional, consultas, pacotes, servicos, avaliacoes, checkins, objetivos, agora: new Date(),
      whatsappClinica: NutriDudu.config.whatsappAtendimento(site?.whatsappClinica),
    });
  }

  async function previa(pessoa) {
    const dialog = NutriDudu.modal.painel({ titulo: `Como ${pessoa.nome.split(' ')[0]} vê`, corpo: '<div class="ap-previa" data-ap-previa></div>' });
    dialog.classList.add('modal-largo');
    NutriDudu.areaPacienteTela.montar(dialog.querySelector('[data-ap-previa]'), await dadosDaPessoa(pessoa), {
      foto: '../nutri/img/avatar.jpg',
      linkCheckin: (codigo) => `${base()}c/${codigo}`,
    });
  }

  async function gerar(pessoa) {
    const codigo = novoCodigo();
    const agora = new Date().toISOString();
    await NutriDudu.store.update('pessoas', pessoa.id, { areaCodigo: codigo, areaHash: await resumo(codigo), areaAtiva: true, areaCriadaEm: agora });
    return { ...pessoa, areaCodigo: codigo, areaAtiva: true, areaCriadaEm: agora };
  }

  /** Painel principal (botão "Área do paciente" na ficha). */
  async function abrir(pessoaInicial) {
    const { modal, ui, nuvem, store } = NutriDudu;
    let pessoa = (await store.get('pessoas', pessoaInicial.id)) || pessoaInicial;
    const conversa = (await store.list('conversas', (x) => x.pessoaId === pessoa.id)).sort((a, b) => (b.ultimaMensagemEm || '').localeCompare(a.ultimaMensagemEm || ''))[0];
    const nome = esc(pessoa.nome.split(' ')[0]);
    const ativo = pessoa.areaAtiva && pessoa.areaCodigo;

    if (!ativo) {
      modal.painel({
        titulo: 'Área do paciente',
        corpo: `<p>Uma página só de ${nome}, aberta por um link pessoal, com:</p>
          <ul class="small"><li>📅 próxima consulta e botão pro WhatsApp da clínica</li><li>🗂️ plano: quantas consultas já fez e quantas faltam</li>
          <li>📈 evolução das avaliações (peso, % de gordura, massa magra, cintura) com gráfico</li><li>📋 notas dos check-ins e o último check-in detalhado</li>
          <li>🎯 objetivos combinados e a contagem regressiva da meta</li>
          <li>🩺 histórico de consultas</li></ul>
          <p class="small muted">Não aparecem anotações da consulta, anamnese nem financeiro.</p>`,
        acoes: [
          { texto: 'Ver prévia', aoClicar: () => previa(pessoa) },
          { texto: pessoa.areaCodigo ? 'Religar com link novo' : 'Criar link', classe: 'btn-primary', aoClicar: async () => { pessoa = await gerar(pessoa); ui.toast('Link criado.'); abrir(pessoa); } },
        ],
      });
      return;
    }

    const link = linkDe(pessoa.areaCodigo);
    const texto = textoConvite(pessoa, link);
    const tel = U().soDigitos(pessoa.telefone);
    const podeClinica = nuvem.ativa() && janelaAberta(conversa);
    const dialog = modal.painel({
      titulo: 'Área do paciente',
      corpo: `
        <p class="small">✅ Ligada desde ${U().data(pessoa.areaCriadaEm)}. Link pessoal de ${nome}:</p>
        <div class="ck-link"><code>${esc(link)}</code></div>
        <p class="small muted">Mensagem sugerida:</p>
        <blockquote class="ck-msg">${esc(texto)}</blockquote>
        <div class="acoes-linha">
          ${podeClinica ? '<button type="button" class="btn btn-primary" data-ap-clinica>Enviar pelo WhatsApp da clínica</button>' : ''}
          <button type="button" class="btn${podeClinica ? '' : ' btn-primary'}" data-ap-copiar>Copiar mensagem</button>
          ${tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(texto)}">Abrir no meu WhatsApp</a>` : ''}
          <button type="button" class="btn" data-ap-previa>Ver como ${nome} vê</button>
        </div>
        <p class="small muted" style="margin-top:14px">Se o link vazar ou a pessoa pedir, troque o link (o antigo para de funcionar) ou desligue a área.</p>
        <div class="acoes-linha">
          <button type="button" class="btn btn-pequeno" data-ap-trocar>Trocar link</button>
          <button type="button" class="btn btn-pequeno btn-texto-perigo" data-ap-desligar>Desligar</button>
        </div>`,
    });
    dialog.querySelector('[data-ap-copiar]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto); ui.toast('Mensagem copiada.'); } catch (e) { ui.toast('Não consegui copiar. Selecione o texto e copie.', 'erro'); }
    });
    dialog.querySelector('[data-ap-clinica]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await nuvem.enviarWhatsApp(conversa.id, texto); ui.toast('Link enviado pelo WhatsApp da clínica.'); dialog.close(); } catch (erro) { ui.toast(erro.message, 'erro'); e.currentTarget.disabled = false; }
    });
    dialog.querySelector('[data-ap-previa]').addEventListener('click', () => previa(pessoa));
    dialog.querySelector('[data-ap-trocar]').addEventListener('click', async () => {
      if (!(await modal.confirmar({ titulo: 'Trocar o link?', mensagem: 'O link antigo para de funcionar na hora. Você vai precisar mandar o novo.', textoConfirmar: 'Trocar link' }))) return;
      dialog.close(); pessoa = await gerar(pessoa); ui.toast('Link novo criado.'); abrir(pessoa);
    });
    dialog.querySelector('[data-ap-desligar]').addEventListener('click', async () => {
      if (!(await modal.confirmar({ titulo: 'Desligar a área do paciente?', mensagem: 'O link para de funcionar. Dá pra religar depois (com um link novo).', textoConfirmar: 'Desligar', perigo: true }))) return;
      await store.update('pessoas', pessoa.id, { areaAtiva: false, areaHash: null });
      dialog.close(); ui.toast('Área do paciente desligada.');
    });
  }

  return { abrir, previa, dadosDaPessoa };
})();
