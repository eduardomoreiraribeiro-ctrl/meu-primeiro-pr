// Visão "Planos" em Clientes: quem está em acompanhamento, quem está com o plano acabando,
// quem terminou o plano (follow-up de renovação) e quem está inativo.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.planosClientes = (function () {
  const GRUPOS = {
    ativos: 'Em acompanhamento',
    acabando: 'Plano acabando',
    finalizados: 'Finalizados',
    semPlano: 'Ativos sem plano',
    inativos: 'Inativos',
  };
  const estado = { grupo: 'ativos' };
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');

  /** Classifica cada cliente (não lead) pela situação do plano. */
  function classificar({ pessoas, pacotes, consultas, servicos }, agora = new Date()) {
    const { calculos, utils } = NutriDudu;
    const pacotesDe = calculos.agruparPorPessoa(pacotes);
    const consultasDe = calculos.agruparPorPessoa(consultas.filter((c) => c.status !== 'cancelada'));
    const servicoPor = Object.fromEntries(servicos.map((s) => [s.id, s]));
    return pessoas.filter((p) => p.status !== 'lead').map((p) => {
      const lista = pacotesDe(p.id).filter((x) => x.status !== 'cancelado').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
      const cs = consultasDe(p.id);
      const proxima = cs.filter((c) => ['agendada', 'confirmada'].includes(c.status) && new Date(c.inicio) >= agora).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] || null;
      const ultima = cs.filter((c) => c.status === 'realizada').sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null;
      const comUso = lista.map((pac) => {
        const uso = calculos.usoDoPacote(pac, cs.filter((c) => c.pacoteId === pac.id));
        const st = calculos.statusPacote(pac, agora);
        const vivo = st === 'ativo' && uso.saldo > 0;
        return { pac, uso, vivo, servico: servicoPor[pac.servicoId] };
      });
      const atual = comUso.find((x) => x.vivo) || null;
      const ultimoPlano = comUso[0] || null;
      let grupo;
      if (p.status === 'inativo') grupo = 'inativos';
      else if (atual) {
        const diasVence = calculos.diasParaVencer(atual.pac, agora);
        grupo = atual.uso.saldo <= 1 || diasVence <= 15 ? 'acabando' : 'ativos';
      } else if (ultimoPlano) grupo = 'finalizados';
      else grupo = 'semPlano';
      // Quando o plano terminou: data da última consulta do plano (ou a validade).
      let terminouEm = null;
      if (!atual && ultimoPlano) {
        const doPlano = cs.filter((c) => c.pacoteId === ultimoPlano.pac.id && c.status === 'realizada').sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
        terminouEm = doPlano?.inicio || ultimoPlano.pac.validade || ultimoPlano.pac.inicio;
      }
      return { pessoa: p, grupo, atual, ultimoPlano, proxima, ultima, terminouEm, diasDesde: terminouEm ? utils.diasEntre(terminouEm, agora) : null };
    });
  }

  function linhaWhats(p) {
    const tel = NutriDudu.utils.soDigitos(p.telefone).replace(/^55(?=\d{10,11}$)/, '');
    return tel ? `<a class="link-whats" href="https://wa.me/55${tel}" target="_blank" rel="noopener">💬 Falar com ${esc(p.nome.split(' ')[0])}</a>` : '—';
  }

  function render(dados, pode) {
    const { ui, utils } = NutriDudu;
    const linhas = classificar(dados);
    const por = (g) => linhas.filter((l) => l.grupo === g);
    const lista = por(estado.grupo).sort((a, b) => {
      if (estado.grupo === 'finalizados' || estado.grupo === 'inativos') return String(b.terminouEm || '').localeCompare(String(a.terminouEm || ''));
      if (estado.grupo === 'acabando' || estado.grupo === 'ativos') return (a.atual?.uso.saldo ?? 0) - (b.atual?.uso.saldo ?? 0);
      return a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR');
    });
    const plano = (l) => {
      const x = l.atual || l.ultimoPlano;
      if (!x) return '<span class="muted">—</span>';
      return `${esc(x.servico?.nome || 'Plano')}<span class="muted small bloco">${x.uso.usadas} de ${x.uso.total} consultas${x.pac.permuta || l.pessoa.permuta ? ' · permuta' : ''}</span>`;
    };
    const situacao = (l) => {
      if (l.grupo === 'acabando') {
        const s = l.atual.uso.saldo;
        const venc = l.atual.pac.validade ? ` · vence ${utils.data(l.atual.pac.validade)}` : '';
        return `⚠️ ${s === 0 ? 'última consulta marcada' : s === 1 ? 'resta 1 consulta' : `restam ${s}`}${venc}`;
      }
      if (l.grupo === 'ativos') return `restam ${l.atual.uso.saldo} consultas${l.atual.pac.validade ? ` · vence ${utils.data(l.atual.pac.validade)}` : ''}`;
      if (l.grupo === 'finalizados' || (l.grupo === 'inativos' && l.terminouEm)) return `terminou ${utils.data(l.terminouEm)} (${utils.haDias(l.diasDesde)})`;
      return l.ultima ? `última consulta ${utils.haDias(utils.diasEntre(l.ultima.inicio, new Date()))}` : 'sem consultas';
    };
    const acoes = (l) => {
      if (!pode) return '';
      const id = esc(l.pessoa.id);
      if (l.grupo === 'finalizados') return `<button type="button" class="btn btn-pequeno btn-primary" data-pl-renovar="${id}">✓ Renovar</button><button type="button" class="btn btn-pequeno btn-texto-perigo" data-pl-inativar="${id}">✕ Inativar</button>`;
      if (l.grupo === 'acabando') return `<button type="button" class="btn btn-pequeno btn-primary" data-pl-renovar="${id}">Renovar plano</button>`;
      if (l.grupo === 'semPlano') return `<button type="button" class="btn btn-pequeno" data-pl-renovar="${id}">Contratar plano</button><button type="button" class="btn btn-pequeno btn-texto-perigo" data-pl-inativar="${id}">Inativar</button>`;
      if (l.grupo === 'inativos') return `<button type="button" class="btn btn-pequeno" data-pl-reativar="${id}">↺ Reativar</button>`;
      return '';
    };
    const AJUDA = {
      ativos: 'Clientes com plano em andamento.',
      acabando: 'Resta 1 consulta (ou nenhuma) ou o plano vence em até 15 dias: hora de conversar sobre a renovação.',
      finalizados: 'O plano terminou e não foi renovado. Faça o follow-up: renove ou marque como inativo.',
      semPlano: 'Clientes ativos sem nenhum plano registrado (ex.: consultas avulsas ou plano ainda não lançado).',
      inativos: 'Clientes que encerraram o acompanhamento. Dá para reativar quando voltarem.',
    };
    return `
      <div class="acoes-linha pl-abas" role="tablist">${Object.entries(GRUPOS).map(([g, nome]) => {
        const n = por(g).length;
        const alerta = (g === 'finalizados' || g === 'acabando') && n ? ' pl-alerta' : '';
        return `<button type="button" role="tab" aria-selected="${estado.grupo === g}" class="btn btn-pequeno${estado.grupo === g ? ' btn-primary' : ''}" data-pl-grupo="${g}">${nome} <span class="contador${alerta}">${n}</span></button>`;
      }).join('')}</div>
      <p class="muted small">${AJUDA[estado.grupo]}</p>
      ${lista.length ? `<div class="tabela-rolagem"><table class="tabela-simples"><thead><tr><th>Cliente</th><th>Plano</th><th>Situação</th><th>Próxima consulta</th><th>WhatsApp</th>${pode ? '<th>Ações</th>' : ''}</tr></thead><tbody>
        ${lista.map((l) => `<tr>
          <td><a href="#/clientes/${encodeURIComponent(l.pessoa.id)}">${esc(l.pessoa.nome)}</a>${l.pessoa.permuta ? ` ${ui.badge('Permuta', 'info')}` : ''}</td>
          <td>${plano(l)}</td>
          <td class="small">${situacao(l)}</td>
          <td class="small">${l.proxima ? `${utils.data(l.proxima.inicio)} ${utils.hora(l.proxima.inicio)}` : '<span class="muted">nada marcado</span>'}</td>
          <td class="small">${linhaWhats(l.pessoa)}</td>
          ${pode ? `<td><span class="acoes-linha sem-margem">${acoes(l)}</span></td>` : ''}
        </tr>`).join('')}</tbody></table></div>` : `<div class="card">${ui.vazio('Ninguém nesta lista agora. 🎉')}</div>`}`;
  }

  function ligar(raiz, dados) {
    const { store, modal, ui, permissoes, financeiro } = NutriDudu;
    const achar = (id) => dados.pessoas.find((p) => p.id === id);
    raiz.querySelectorAll('[data-pl-grupo]').forEach((b) => b.addEventListener('click', () => { estado.grupo = b.dataset.plGrupo; NutriDudu.recarregarPagina(); }));
    raiz.querySelectorAll('[data-pl-renovar]').forEach((b) => b.addEventListener('click', () => {
      const pessoa = achar(b.dataset.plRenovar);
      const ultimo = dados.pacotes.filter((x) => x.pessoaId === pessoa.id && x.status !== 'cancelado').sort((a, c) => String(c.inicio).localeCompare(String(a.inicio)))[0];
      financeiro.contratarPacote({ pessoa, renovarDe: ultimo || null, servicoId: ultimo?.servicoId || null });
    }));
    raiz.querySelectorAll('[data-pl-inativar]').forEach((b) => b.addEventListener('click', async () => {
      const pessoa = achar(b.dataset.plInativar);
      const ok = await modal.confirmar({ titulo: `Marcar ${pessoa.nome.split(' ')[0]} como inativo?`, mensagem: 'Sai da lista de acompanhamento e para de receber lembretes de retorno. Dá para reativar quando voltar.', textoConfirmar: 'Inativar' });
      if (!ok) return;
      const agora = new Date().toISOString();
      await store.update('pessoas', pessoa.id, { status: 'inativo', etapa: 'encerrado', etapaDesde: agora });
      await store.create('interacoes', { pessoaId: pessoa.id, dataHora: agora, tipo: 'nota', autor: permissoes.atual(), automatico: true, descricao: 'Marcado(a) como inativo(a) após o fim do plano.' });
      ui.toast('Cliente marcado como inativo.');
    }));
    raiz.querySelectorAll('[data-pl-reativar]').forEach((b) => b.addEventListener('click', async () => {
      const pessoa = achar(b.dataset.plReativar);
      const agora = new Date().toISOString();
      await store.update('pessoas', pessoa.id, { status: 'ativo', etapa: 'tratamento', etapaDesde: agora });
      await store.create('interacoes', { pessoaId: pessoa.id, dataHora: agora, tipo: 'nota', autor: permissoes.atual(), automatico: true, descricao: 'Reativado(a).' });
      ui.toast('Cliente reativado.');
    }));
  }

  return { render, ligar, classificar, GRUPOS };
})();
