// Envio em grupo pelo WhatsApp: "Retorno pendente" (sem consulta marcada) e "Reativação"
// (sumidos e inativos). Mostra quem está em cada grupo, com a situação de cada um; o
// administrador escolhe e envia. Quem manda de fato é o servidor (função whatsapp-enviar),
// com o modelo aprovado pela Meta, respeitando autorização, horário e intervalo mínimo.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.enviarGrupo = (function () {
  const DIA = 24 * 3600 * 1000;
  const GRUPOS = {
    retorno: {
      nome: 'Sem consulta marcada (retorno)',
      ajuda: 'Clientes ativos que já passaram do prazo de retorno, com o retorno previsto vencido ou que faltaram e não remarcaram.',
      intervaloDias: 30,
    },
    reativacao: {
      nome: 'Sumidos e inativos (reativação)',
      ajuda: 'Clientes sem consulta há mais tempo que o prazo de "cliente sumido" e clientes marcados como inativos, sem nada agendado.',
      intervaloDias: 90,
    },
  };
  const LIMITE = 50;

  /** Quem está em cada grupo: [{ pessoa, situacao }]. */
  function montarGrupos(d, agora = new Date()) {
    const { alertas, utils } = NutriDudu;
    const lista = alertas.todos({ pessoas: d.pessoas, consultas: d.consultas, pacotes: d.pacotes, geral: d.geral }, agora);
    const retorno = new Map();
    const reativacao = new Map();
    for (const { pessoa, alerta } of lista) {
      if (['sem_retorno', 'retorno_vencido', 'falta_sem_remarcacao'].includes(alerta.tipo) && !retorno.has(pessoa.id)) retorno.set(pessoa.id, { pessoa, situacao: alerta.texto });
      if (alerta.tipo === 'sumido' && !reativacao.has(pessoa.id)) reativacao.set(pessoa.id, { pessoa, situacao: alerta.texto });
    }
    // Inativos (ex.: "pausados" da planilha) sem nada marcado também entram na reativação.
    const futuras = new Set(d.consultas.filter((c) => ['agendada', 'confirmada'].includes(c.status) && new Date(c.inicio) >= agora).map((c) => c.pessoaId));
    for (const p of d.pessoas) {
      if (p.status !== 'inativo' || p.funil === 'comercial' || futuras.has(p.id) || reativacao.has(p.id)) continue;
      const ultima = d.consultas.filter((c) => c.pessoaId === p.id && c.status === 'realizada').sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
      reativacao.set(p.id, { pessoa: p, situacao: ultima ? `inativo · última consulta ${utils.haDias(utils.diasEntre(ultima.inicio, agora))}` : 'inativo' });
    }
    const ordenar = (m) => [...m.values()].sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
    return { retorno: ordenar(retorno), reativacao: ordenar(reativacao) };
  }

  /** Pode receber agora? Devolve null (pode) ou o motivo. */
  function bloqueio(pessoa, grupo, agora = new Date()) {
    if (pessoa.consentimentos?.whatsapp !== true || pessoa.automacoesDesligadas) return 'sem autorização de WhatsApp';
    if (!NutriDudu.utils.telefoneValido(NutriDudu.utils.soDigitos(pessoa.telefone).replace(/^55(?=\d{10,11}$)/, ''))) return 'celular inválido';
    const marca = pessoa.automacoes?.[grupo];
    if (marca?.ok && agora - new Date(marca.em) < GRUPOS[grupo].intervaloDias * DIA) {
      return `já recebeu ${NutriDudu.utils.haDias(NutriDudu.utils.diasEntre(marca.em, agora))}`;
    }
    return null;
  }

  async function abrir() {
    const { store, modal, ui, utils, nuvem, permissoes, mensagensAutomaticas: MA } = NutriDudu;
    if (!permissoes.exigir('gerenciarDados')) return;
    const [pessoas, consultas, pacotes, geral, cfgDoc] = await Promise.all([
      store.list('pessoas'), store.list('consultas'), store.list('pacotes'),
      store.get('configuracoes', 'geral'), store.get('configuracoes', 'automacoes'),
    ]);
    const cfg = MA.configuracao(cfgDoc || {});
    const grupos = montarGrupos({ pessoas, consultas, pacotes, geral: geral || {} });
    const clinica = geral?.nomeClinica || 'clínica';
    let grupo = grupos.retorno.length || !grupos.reativacao.length ? 'retorno' : 'reativacao';

    const dialog = modal.formulario({
      titulo: 'Enviar mensagens pelo WhatsApp',
      largo: true,
      textoSalvar: 'Enviar',
      corpo: '<div data-envio></div>',
      ler: (form) => ({ ids: [...form.querySelectorAll('input[name="pessoaEnvio"]:checked')].map((i) => i.value) }),
      validar: (d) => {
        if (!d.ids.length) return { _geral: 'Marque pelo menos uma pessoa.' };
        if (d.ids.length > LIMITE) return { _geral: `Envie para no máximo ${LIMITE} pessoas por vez.` };
        return {};
      },
      salvar: async (d) => {
        if (!nuvem.ativa()) {
          ui.toast(`Demonstração: as mensagens não são enviadas de verdade (${d.ids.length} selecionada(s)).`);
          return;
        }
        const r = await nuvem.enviarGrupo(grupo, d.ids);
        const linha = (x) => `<li>${utils.escapeHtml(x.pessoa)}${x.motivo ? ` — ${utils.escapeHtml(x.motivo)}` : ''}</li>`;
        modal.painel({
          titulo: 'Resultado do envio',
          corpo: `
            <p><strong>${r.enviados.length}</strong> mensagem(ns) enviada(s).</p>
            ${r.pulados.length ? `<p class="small">Não enviadas (${r.pulados.length}):</p><ul class="small">${r.pulados.map(linha).join('')}</ul>` : ''}
            ${r.erros.length ? `<div class="alerta alerta-aviso small"><strong>Erros (${r.erros.length}):</strong><ul>${r.erros.map(linha).join('')}</ul>
              <p>Se o erro fala de modelo ("template"), o modelo <code>${utils.escapeHtml(cfg.modelos[grupo])}</code> ainda não foi aprovado na Meta.</p></div>` : ''}`,
        });
      },
    });

    const form = dialog.querySelector('form');
    const area = form.querySelector('[data-envio]');
    const botao = form.querySelector('[type="submit"]');

    function desenhar() {
      const membros = grupos[grupo];
      const m = MA.MODELOS[grupo];
      const exemplo = grupo === 'retorno' ? ['Mariana', '2 meses', 'Nutri Eduardo Ribeiro'] : ['Mariana'];
      const linhas = membros.map(({ pessoa, situacao }) => {
        const motivo = bloqueio(pessoa, grupo);
        return `<tr${motivo ? ' class="muted"' : ''}>
          <td><input type="checkbox" name="pessoaEnvio" value="${utils.escapeHtml(pessoa.id)}"${motivo ? ' disabled' : ' checked'} aria-label="Enviar para ${utils.escapeHtml(pessoa.nome)}"></td>
          <td><a href="#/clientes/${encodeURIComponent(pessoa.id)}">${utils.escapeHtml(pessoa.nome)}</a><span class="muted small bloco">${utils.escapeHtml(situacao)}</span></td>
          <td>${motivo ? ui.badge(motivo, 'neutro') : ui.badge('Pode receber', 'sucesso')}</td>
        </tr>`;
      }).join('');
      area.innerHTML = `
        <div class="acoes-linha" role="tablist">
          ${Object.entries(GRUPOS).map(([id, g]) => `<button type="button" class="btn btn-pequeno${id === grupo ? ' btn-primary' : ''}" data-grupo="${id}" role="tab" aria-selected="${id === grupo}">${utils.escapeHtml(g.nome)} (${grupos[id].length})</button>`).join('')}
        </div>
        <p class="muted small">${utils.escapeHtml(GRUPOS[grupo].ajuda)} Cada pessoa recebe no máximo 1 mensagem deste tipo a cada ${GRUPOS[grupo].intervaloDias} dias.</p>
        <div class="modelo-linha"><span class="muted small">Mensagem (modelo <code>${utils.escapeHtml(cfg.modelos[grupo])}</code>, categoria Marketing):</span>
          <p class="small">${utils.escapeHtml(MA.preencher(m.corpo(clinica), exemplo))}</p></div>
        ${membros.length ? `
          <p class="small"><button type="button" class="link-botao" data-marcar-todos>Marcar todos</button> · <button type="button" class="link-botao" data-desmarcar-todos>Desmarcar todos</button></p>
          <div class="tabela-rolagem"><table class="tabela-simples small"><thead><tr><th></th><th>Paciente</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>`
          : '<p class="small">Ninguém neste grupo agora. 🎉</p>'}
        <p class="muted small">Só recebe quem autorizou mensagens pelo WhatsApp. O envio acontece de segunda a sábado, das ${cfg.horaInicio}h às ${cfg.horaFim}h. Cada mensagem de marketing tem um custo pequeno cobrado pela Meta.</p>`;
      const atualizar = () => {
        const n = area.querySelectorAll('input[name="pessoaEnvio"]:checked').length;
        botao.disabled = !n;
        botao.textContent = n ? `Enviar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : 'Enviar';
      };
      area.querySelectorAll('[data-grupo]').forEach((b) => b.addEventListener('click', () => { grupo = b.dataset.grupo; desenhar(); }));
      area.querySelectorAll('input[name="pessoaEnvio"]').forEach((i) => i.addEventListener('change', atualizar));
      area.querySelector('[data-marcar-todos]')?.addEventListener('click', () => { area.querySelectorAll('input[name="pessoaEnvio"]:not(:disabled)').forEach((i) => { i.checked = true; }); atualizar(); });
      area.querySelector('[data-desmarcar-todos]')?.addEventListener('click', () => { area.querySelectorAll('input[name="pessoaEnvio"]').forEach((i) => { i.checked = false; }); atualizar(); });
      atualizar();
    }
    desenhar();
  }

  return { abrir, montarGrupos, bloqueio, GRUPOS };
})();
