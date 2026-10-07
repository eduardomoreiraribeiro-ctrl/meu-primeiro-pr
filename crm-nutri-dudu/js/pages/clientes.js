window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

NutriDudu.pages.clientes = (function () {
  const FILTROS_PADRAO = {
    busca: '', status: 'clientes', profissionalId: '', origem: '', objetivo: '', tag: '', situacao: '', clinico: '',
  };
  const SITUACOES = {
    sem_retorno: 'Sem retorno marcado',
    pendente: 'Com pagamento em aberto',
    atrasado: 'Com pagamento atrasado',
    pacote_acabando: 'Pacote acabando ou vencendo',
    sem_agendamento: 'Sem próximo agendamento',
  };
  const CONTAGEM = {
    clientes: 'clientes', ativo: 'clientes ativos', inativo: 'clientes inativos', lead: 'leads', todos: 'cadastros',
  };
  const STATUS_FILTRO = {
    clientes: 'Todos os clientes',
    ativo: 'Clientes ativos',
    inativo: 'Clientes inativos',
    lead: 'Leads',
    todos: 'Todos (clientes e leads)',
  };

  // Filtros e ordenação ficam guardados enquanto o sistema estiver aberto.
  const estado = { filtros: { ...FILTROS_PADRAO }, ordem: { campo: 'nome', direcao: 1 } };

  /** Monta uma linha de dados por pessoa, com tudo que a tabela, os filtros e o CSV precisam. */
  function montarLinhas(dados) {
    const { calculos, config, utils } = NutriDudu;
    const { pessoas, consultas, pacotes, lancamentos, profissionais, servicos, anamneses, geral } = dados;
    const consultasDe = calculos.agruparPorPessoa(consultas);
    const pacotesDe = calculos.agruparPorPessoa(pacotes);
    const lancamentosDe = calculos.agruparPorPessoa(lancamentos);
    const anamnesesDe = calculos.agruparPorPessoa(anamneses);
    const prof = Object.fromEntries(profissionais.map((p) => [p.id, p]));
    const nomeServico = Object.fromEntries(servicos.map((s) => [s.id, s.nome]));

    return pessoas.map((p) => {
      const r = calculos.resumoPessoa(p, {
        consultas: consultasDe(p.id), pacotes: pacotesDe(p.id), lancamentos: lancamentosDe(p.id),
      }, geral);
      // Texto clínico pesquisável (só usado quando o perfil pode ver dados clínicos).
      const anamnese = anamnesesDe(p.id).sort((a, b) => b.versao - a.versao)[0];
      const textoClinico = anamnese ? utils.normalizar([
        ...anamnese.alergias.map((a) => a.substancia),
        ...anamnese.medicamentos.map((m) => m.nome),
        ...anamnese.contraindicacoes.map((c) => c.descricao),
        anamnese.historicoSaude,
      ].join(' ')) : '';

      return {
        pessoa: p,
        resumo: r,
        profissional: prof[p.profissionalId] || null,
        pacoteNome: r.pacote ? nomeServico[r.pacote.servicoId] || 'Pacote' : '',
        origem: config.ORIGENS[p.origem] || '',
        textoBusca: utils.normalizar(`${p.nome} ${p.email} ${(p.tags || []).join(' ')}`),
        digitos: utils.soDigitos(p.telefone),
        textoClinico,
      };
    });
  }

  function filtrar(linhas, filtros, verClinico) {
    const { utils } = NutriDudu;
    const termo = utils.normalizar(filtros.busca.trim());
    const digitos = utils.soDigitos(filtros.busca);
    const clinico = utils.normalizar(filtros.clinico.trim());

    return linhas.filter(({ pessoa: p, resumo: r, textoBusca, digitos: tel, textoClinico }) => {
      if (filtros.status === 'clientes' && p.status === 'lead') return false;
      if (['ativo', 'inativo', 'lead'].includes(filtros.status) && p.status !== filtros.status) return false;
      if (termo && !textoBusca.includes(termo) && !(digitos.length >= 3 && tel.includes(digitos))) return false;
      if (filtros.profissionalId && p.profissionalId !== filtros.profissionalId) return false;
      if (filtros.origem && p.origem !== filtros.origem) return false;
      if (filtros.objetivo && p.objetivo !== filtros.objetivo) return false;
      if (filtros.tag && !(p.tags || []).some((t) => t.toLowerCase() === filtros.tag.toLowerCase())) return false;
      if (filtros.situacao === 'sem_retorno' && !r.semRetorno) return false;
      if (filtros.situacao === 'pendente' && !(r.emAberto > 0)) return false;
      if (filtros.situacao === 'atrasado' && !(r.atrasado > 0)) return false;
      if (filtros.situacao === 'pacote_acabando' && !r.pacote?.acabando) return false;
      if (filtros.situacao === 'sem_agendamento' && r.proxima) return false;
      if (verClinico && clinico && !textoClinico.includes(clinico)) return false;
      return true;
    });
  }

  const ORDENACAO = {
    nome: (l) => NutriDudu.utils.normalizar(l.pessoa.nome),
    status: (l) => l.pessoa.status,
    ultima: (l) => (l.resumo.diasSemConsulta ?? Infinity),
    proxima: (l) => (l.resumo.proxima ? l.resumo.proxima.inicio : '9999'),
    aberto: (l) => l.resumo.emAberto,
  };

  function ordenar(linhas, { campo, direcao }) {
    const chave = ORDENACAO[campo] || ORDENACAO.nome;
    return [...linhas].sort((a, b) => {
      const va = chave(a);
      const vb = chave(b);
      if (va < vb) return -direcao;
      if (va > vb) return direcao;
      return a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR');
    });
  }

  // ---------- Pedaços da tabela ----------

  function celulaUltima(r) {
    const { utils } = NutriDudu;
    if (!r.ultima) return '<span class="muted">—</span>';
    return `
      ${utils.data(r.ultima.inicio)}
      <span class="muted small bloco">há ${utils.dias(r.diasSemConsulta)}</span>
      ${r.semRetorno ? '<span class="badge badge-alerta" title="Sem consulta há mais que o prazo de retorno e sem nada agendado">⚠ sem retorno</span>' : ''}`;
  }

  function celulaProxima(r) {
    const { utils } = NutriDudu;
    if (!r.proxima) return '<span class="muted">—</span>';
    return `${utils.data(r.proxima.inicio)} <span class="muted small bloco">${utils.hora(r.proxima.inicio)}</span>`;
  }

  function celulaPacote(l) {
    const r = l.resumo;
    if (!r.pacote) return '<span class="muted">—</span>';
    const pct = Math.round((r.pacote.usadas / r.pacote.total) * 100);
    return `
      <span class="bloco small">${NutriDudu.utils.escapeHtml(l.pacoteNome)}</span>
      <span class="mini-barra" title="${r.pacote.usadas} de ${r.pacote.total} consultas usadas"><span style="width:${pct}%"></span></span>
      <span class="small${r.pacote.acabando ? ' texto-alerta' : ' muted'}">${r.pacote.usadas} de ${r.pacote.total}${r.pacote.acabando ? ' · acabando' : ''}</span>`;
  }

  function celulaAberto(r) {
    const { utils } = NutriDudu;
    if (!r.emAberto) return '<span class="muted">—</span>';
    return `${utils.moeda(r.emAberto)}${r.atrasado ? `<span class="small texto-perigo bloco">${utils.moeda(r.atrasado)} atrasado</span>` : ''}`;
  }

  function tabelaHtml(linhas, mostrarProfissional) {
    const { ui, utils } = NutriDudu;
    const { campo, direcao } = estado.ordem;
    const th = (id, rotulo) => {
      const ativo = campo === id;
      const aria = ativo ? (direcao === 1 ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" aria-sort="${aria}"><button type="button" class="ordenar" data-ordenar="${id}">${rotulo}${ativo ? (direcao === 1 ? ' ↑' : ' ↓') : ''}</button></th>`;
    };

    const linhasHtml = linhas.map((l) => {
      const p = l.pessoa;
      const link = `#/clientes/${encodeURIComponent(p.id)}`;
      return `
        <tr data-href="${link}">
          <td>
            <div class="cliente-celula">
              ${ui.avatar(utils.iniciais(p.nome))}
              <div>
                <a href="${link}" class="cliente-nome">${utils.escapeHtml(p.nome)}</a>
                <span class="muted small bloco">${utils.escapeHtml(p.telefone)}</span>
              </div>
            </div>
          </td>
          <td>${ui.statusPessoa(p.status)}</td>
          ${mostrarProfissional ? `<td>${l.profissional ? `<span class="com-ponto"><span class="ponto" style="background:${utils.escapeHtml(l.profissional.cor)}"></span>${utils.escapeHtml(l.profissional.nome)}</span>` : '<span class="muted">—</span>'}</td>` : ''}
          <td class="small">${utils.escapeHtml(l.origem)}</td>
          <td>${celulaPacote(l)}</td>
          <td>${celulaUltima(l.resumo)}</td>
          <td>${celulaProxima(l.resumo)}</td>
          <td class="num">${celulaAberto(l.resumo)}</td>
        </tr>`;
    }).join('');

    return `
      <div class="tabela-rolagem">
        <table class="tabela-clientes">
          <thead>
            <tr>
              ${th('nome', 'Cliente')}${th('status', 'Status')}
              ${mostrarProfissional ? '<th scope="col">Profissional</th>' : ''}<th scope="col">Origem</th><th scope="col">Pacote</th>
              ${th('ultima', 'Última consulta')}${th('proxima', 'Próximo agendamento')}${th('aberto', 'Em aberto')}
            </tr>
          </thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </div>`;
  }

  /** No celular a tabela vira lista de cartões. */
  function cartoesHtml(linhas) {
    const { ui, utils } = NutriDudu;
    return `
      <ul class="cartoes-clientes">
        ${linhas.map((l) => {
          const p = l.pessoa;
          const r = l.resumo;
          const avisos = [
            r.semRetorno ? '<span class="badge badge-alerta">⚠ sem retorno</span>' : '',
            r.atrasado ? `<span class="badge badge-perigo">${utils.moeda(r.atrasado)} atrasado</span>` : '',
            r.pacote?.acabando ? '<span class="badge badge-info">pacote acabando</span>' : '',
          ].join('');
          return `
            <li>
              <a class="cartao-cliente" href="#/clientes/${encodeURIComponent(p.id)}">
                ${ui.avatar(utils.iniciais(p.nome))}
                <span class="lista-item-info">
                  <strong>${utils.escapeHtml(p.nome)}</strong>
                  <span class="muted small">${utils.escapeHtml(p.telefone)}${r.ultima ? ` · última consulta há ${utils.dias(r.diasSemConsulta)}` : ''}</span>
                  ${r.proxima ? `<span class="small">Próximo: ${utils.data(r.proxima.inicio)} ${utils.hora(r.proxima.inicio)}</span>` : ''}
                  ${avisos ? `<span class="avisos">${avisos}</span>` : ''}
                </span>
                ${ui.statusPessoa(p.status)}
              </a>
            </li>`;
        }).join('')}
      </ul>`;
  }

  function resultadosHtml(linhas, total, mostrarProfissional) {
    const { ui } = NutriDudu;
    const lista = ordenar(linhas, estado.ordem);
    if (!lista.length) {
      return `<div class="card">${ui.vazio(total ? 'Ninguém encontrado com esses filtros.' : 'Nenhum cadastro ainda.')}</div>`;
    }
    return `
      <div class="card card-tabela so-desktop">${tabelaHtml(lista, mostrarProfissional)}</div>
      <div class="so-celular">${cartoesHtml(lista)}</div>`;
  }

  // ---------- Exportar CSV ----------

  function exportarCsv(linhas) {
    const { utils, config } = NutriDudu;
    const cabecalho = ['Nome', 'Telefone', 'E-mail', 'Status', 'Origem', 'Objetivo', 'Profissional', 'Pacote', 'Consultas usadas',
      'Última consulta', 'Dias sem consulta', 'Próximo agendamento', 'Em aberto (R$)', 'Atrasado (R$)', 'Etiquetas'];
    const linhasCsv = ordenar(linhas, estado.ordem).map(({ pessoa: p, resumo: r, profissional, pacoteNome }) => [
      p.nome, p.telefone, p.email, config.STATUS_PESSOA[p.status], config.ORIGENS[p.origem] || '', config.OBJETIVOS[p.objetivo] || '',
      profissional?.nome || '', pacoteNome, r.pacote ? `${r.pacote.usadas}/${r.pacote.total}` : '',
      r.ultima ? utils.data(r.ultima.inicio) : '', r.diasSemConsulta ?? '',
      r.proxima ? `${utils.data(r.proxima.inicio)} ${utils.hora(r.proxima.inicio)}` : '',
      r.emAberto.toFixed(2).replace('.', ','), r.atrasado.toFixed(2).replace('.', ','), (p.tags || []).join(', '),
    ]);
    // Ponto e vírgula + BOM: abre certinho no Excel em português.
    const escapar = (v) => {
      const texto = String(v ?? '');
      // Evita que o Excel interprete o texto como fórmula.
      const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
      return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
    };
    const conteudo = [cabecalho, ...linhasCsv].map((l) => l.map(escapar).join(';')).join('\r\n');
    const blob = new Blob(['﻿', conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-nutri-dudu-${utils.isoDia(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Página ----------

  async function render(container) {
    const { store, ui, config, utils, permissoes } = NutriDudu;
    const [pessoas, consultas, pacotes, lancamentos, profissionais, servicos, anamneses, geral] = await Promise.all([
      store.list('pessoas'), store.list('consultas'), store.list('pacotes'), store.list('lancamentos'),
      store.list('profissionais'), store.list('servicos'),
      permissoes.pode('verClinico') ? store.list('anamneses') : [],
      store.get('configuracoes', 'geral'),
    ]);
    const verClinico = permissoes.pode('verClinico');
    if (!verClinico) estado.filtros.clinico = '';

    const linhas = montarLinhas({ pessoas, consultas, pacotes, lancamentos, profissionais, servicos, anamneses, geral: geral || {} });
    const tags = [...new Set(pessoas.flatMap((p) => p.tags || []))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const fl = estado.filtros;

    const opcoes = (pares, valor, vazio) => `
      ${vazio !== undefined ? `<option value="">${utils.escapeHtml(vazio)}</option>` : ''}
      ${pares.map(([v, r]) => `<option value="${utils.escapeHtml(v)}"${v === valor ? ' selected' : ''}>${utils.escapeHtml(r)}</option>`).join('')}`;

    container.innerHTML = `
      ${ui.cabecalho('Clientes', '', `
        ${permissoes.pode('gerenciarDados') ? '<button type="button" class="btn" data-exportar>Exportar CSV</button>' : ''}
        <button type="button" class="btn" data-novo="lead">+ Lead</button>
        <button type="button" class="btn btn-primary" data-novo="cliente">+ Cliente</button>`)}

      <div class="card filtros-clientes" role="search">
        <div class="filtro-busca">
          <input type="search" data-filtro="busca" value="${utils.escapeHtml(fl.busca)}" placeholder="Buscar por nome, telefone, e-mail ou etiqueta" aria-label="Buscar clientes">
        </div>
        <select data-filtro="status" aria-label="Status">${opcoes(Object.entries(STATUS_FILTRO), fl.status)}</select>
        <select data-filtro="situacao" aria-label="Situação">${opcoes(Object.entries(SITUACOES), fl.situacao, 'Qualquer situação')}</select>
        <select data-filtro="origem" aria-label="Origem">${opcoes(Object.entries(config.ORIGENS), fl.origem, 'Todas as origens')}</select>
        <select data-filtro="objetivo" aria-label="Objetivo">${opcoes(Object.entries(config.OBJETIVOS), fl.objetivo, 'Todos os objetivos')}</select>
        ${profissionais.length > 1 ? `<select data-filtro="profissionalId" aria-label="Profissional">${opcoes(profissionais.map((p) => [p.id, p.nome]), fl.profissionalId, 'Todos os profissionais')}</select>` : ''}
        ${tags.length ? `<select data-filtro="tag" aria-label="Etiqueta">${opcoes(tags.map((t) => [t, t]), fl.tag, 'Todas as etiquetas')}</select>` : ''}
        ${verClinico ? `<input type="search" data-filtro="clinico" value="${utils.escapeHtml(fl.clinico)}" placeholder="Alergia, medicamento ou condição…" aria-label="Filtrar por dado clínico" class="filtro-clinico">` : ''}
        <button type="button" class="btn-link" data-limpar>Limpar filtros</button>
      </div>

      <p class="muted small contagem" data-contagem aria-live="polite"></p>
      <div data-resultados></div>
    `;

    const resultados = container.querySelector('[data-resultados]');
    const contagem = container.querySelector('[data-contagem]');
    let filtradas = [];

    const atualizar = () => {
      filtradas = filtrar(linhas, fl, verClinico);
      const base = linhas.filter((l) => (fl.status === 'clientes' ? l.pessoa.status !== 'lead'
        : fl.status === 'todos' ? true : l.pessoa.status === fl.status)).length;
      contagem.textContent = `${filtradas.length} de ${base} ${CONTAGEM[fl.status]}`;
      // Com uma só profissional, a coluna não acrescenta nada.
      resultados.innerHTML = resultadosHtml(filtradas, linhas.length, profissionais.filter((p) => p.ativo).length > 1);
    };

    container.querySelectorAll('[data-filtro]').forEach((el) => {
      el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
        fl[el.dataset.filtro] = el.value;
        atualizar();
      });
    });
    container.querySelector('[data-limpar]').addEventListener('click', () => {
      Object.assign(fl, FILTROS_PADRAO);
      NutriDudu.recarregarPagina();
    });
    resultados.addEventListener('click', (e) => {
      const botao = e.target.closest('[data-ordenar]');
      if (botao) {
        const campo = botao.dataset.ordenar;
        estado.ordem = { campo, direcao: estado.ordem.campo === campo ? -estado.ordem.direcao : 1 };
        atualizar();
        resultados.querySelector(`[data-ordenar="${campo}"]`)?.focus();
        return;
      }
      // Clique em qualquer lugar da linha abre a ficha.
      const linha = e.target.closest('tr[data-href]');
      if (linha && !e.target.closest('a, button')) location.hash = linha.dataset.href;
    });
    container.querySelectorAll('[data-novo]').forEach((b) => b.addEventListener('click', () => {
      NutriDudu.cadastroPessoa.abrir({
        tipo: b.dataset.novo,
        aoSalvar: (p) => { location.hash = `#/clientes/${encodeURIComponent(p.id)}`; },
      });
    }));
    container.querySelector('[data-exportar]')?.addEventListener('click', () => {
      exportarCsv(filtradas);
      ui.toast(`${filtradas.length} cadastro(s) exportado(s).`);
    });

    atualizar();
  }

  return { titulo: 'Clientes', render, filtrar, montarLinhas };
})();
