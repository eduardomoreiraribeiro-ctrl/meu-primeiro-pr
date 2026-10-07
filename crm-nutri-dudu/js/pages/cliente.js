window.NutriDudu = window.NutriDudu || {};
NutriDudu.pages = NutriDudu.pages || {};

// Ficha do cliente (prontuário): cabeçalho, alertas, resumo e abas.
// Endereço: #/clientes/<id>/<aba> — a aba fica no endereço (dá para voltar e compartilhar).
NutriDudu.pages.cliente = (function () {
  const ABAS = {
    visao: { nome: 'Visão geral' },
    anamnese: { nome: 'Anamnese', clinica: true },
    consultas: { nome: 'Consultas' },
    avaliacao: { nome: 'Avaliação física', clinica: true },
    fotos: { nome: 'Fotos', clinica: true },
    pacotes: { nome: 'Pacotes' },
    financeiro: { nome: 'Financeiro' },
    historico: { nome: 'Histórico' },
  };

  const u = () => NutriDudu.utils;
  const fmt = (v, casas = 1) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));

  // ---------------- Visão geral ----------------

  function abaVisao(c) {
    const { utils, config } = NutriDudu;
    const p = c.pessoa;
    const idade = utils.idade(p.dataNascimento);
    const cons = p.consentimentos || {};
    const consentimentos = [['saude', 'dados de saúde'], ['whatsapp', 'WhatsApp'], ['fotos', 'fotos clínicas'], ['divulgacao', 'uso de imagem']]
      .map(([k, rotulo]) => `<span class="consentimento${cons[k] ? ' sim' : ''}">${cons[k] ? '✓' : '✗'} ${rotulo}</span>`).join('');
    const linha = (rotulo, valor) => `<tr><th scope="row">${rotulo}</th><td>${valor || '<span class="muted">—</span>'}</td></tr>`;
    return `
      <section class="card">
        <h2 class="card-title">Dados do cadastro</h2>
        <table class="tabela-simples tabela-cadastro">
          ${linha('Nascimento', p.dataNascimento ? `${utils.data(p.dataNascimento)}${idade !== null ? ` (${idade} anos)` : ''}` : '')}
          ${linha('Sexo', { F: 'Feminino', M: 'Masculino' }[p.sexo])}
          ${linha('CPF', utils.escapeHtml(p.cpf))}
          ${linha('Endereço', utils.escapeHtml([p.endereco, p.cidade].filter(Boolean).join(' — ')))}
          ${linha('Objetivo', utils.escapeHtml(config.OBJETIVOS[p.objetivo]))}
          ${linha('Serviço de interesse', utils.escapeHtml(c.servicoPorId[p.servicoInteresseId]?.nome))}
          ${linha('Retorno a cada', `${c.resumo.prazoRetorno} dias${p.retornoDias ? '' : ' <span class="muted small">(padrão da clínica)</span>'}`)}
          ${linha('Cliente desde', p.clienteDesde ? utils.data(p.clienteDesde) : '')}
          ${linha('Indicou', c.indicados.map((x) => `<a href="#/clientes/${encodeURIComponent(x.id)}">${utils.escapeHtml(x.nome)}</a>`).join(', '))}
          ${linha('Consentimentos', `<span class="consentimentos">${consentimentos}</span>`)}
          ${linha('Observações', utils.escapeHtml(p.observacoes))}
        </table>
      </section>`;
  }

  // ---------------- Anamnese ----------------

  function blocoAnamnese(a) {
    const { utils, anamnese } = NutriDudu;
    const texto = (campo) => (a[campo] ? `<p>${utils.escapeHtml(a[campo])}</p>` : '<p class="muted">Não informado.</p>');
    const tabela = (campo) => {
      const itens = a[campo] || [];
      if (!itens.length) return '<p class="muted">Nenhum.</p>';
      const cols = anamnese.LISTAS[campo].colunas;
      const valor = (item, col) => {
        const v = item[col.campo] || '';
        if (col.opcoes) return col.opcoes[v] || v;
        return col.tipo === 'date' && v ? utils.data(v) : v;
      };
      return `<table class="tabela-simples tabela-lista"><tr>${cols.map((col) => `<th>${col.rotulo}</th>`).join('')}</tr>
        ${itens.map((item) => `<tr class="${item.gravidade === 'grave' ? 'linha-grave' : ''}">${cols.map((col) => `<td>${utils.escapeHtml(valor(item, col))}</td>`).join('')}</tr>`).join('')}</table>`;
    };
    return Object.entries(anamnese.SECOES).map(([campo, nome]) => `
      <div class="secao-leitura">
        <h3 class="subtitulo">${nome}</h3>
        ${anamnese.LISTAS[campo] ? tabela(campo) : texto(campo)}
      </div>`).join('');
  }

  function abaAnamnese(c) {
    const { utils, anamnese, config } = NutriDudu;
    const { atual, pre, versoes } = anamnese.situacao(c.anamneses);
    const historico = versoes.slice(1).map((v, i) => {
      const anterior = versoes[i + 2] || null;
      const mudou = anamnese.mudancas(anterior, v);
      return `
        <details class="versao">
          <summary>Versão ${v.versao} · ${utils.data(v.criadoEm)} · ${utils.escapeHtml(config.PERFIS[v.autor] || 'paciente')}${mudou.length ? ` · ${anterior ? 'mudou' : 'preencheu'}: ${utils.escapeHtml(mudou.join(', ').toLowerCase())}` : ''}</summary>
          ${blocoAnamnese(v)}
        </details>`;
    }).join('');
    const mudouAtual = atual ? anamnese.mudancas(versoes[1] || null, atual) : [];
    return `
      ${pre ? `
        <div class="alerta alerta-aviso alerta-acao">
          <span><strong>Pré-anamnese enviada pelo paciente</strong> em ${utils.data(pre.criadoEm)}, aguardando revisão.</span>
          <button type="button" class="btn btn-pequeno" data-revisar-anamnese>Revisar agora</button>
        </div>` : ''}
      <section class="card">
        <div class="secao-cabecalho">
          <div>
            <h2 class="card-title">${atual ? `Anamnese atual · versão ${atual.versao}` : 'Anamnese'}</h2>
            ${atual ? `<p class="muted small">${utils.data(atual.criadoEm)} · ${utils.escapeHtml(config.PERFIS[atual.autor] || 'paciente')}${versoes.length > 1 && mudouAtual.length ? ` · mudou: ${utils.escapeHtml(mudouAtual.join(', ').toLowerCase())}` : ''}</p>` : ''}
          </div>
          <button type="button" class="btn btn-pequeno" data-revisar-anamnese>${atual ? 'Revisar anamnese' : 'Preencher anamnese'}</button>
        </div>
        ${atual ? blocoAnamnese(atual) : '<p class="muted">Ainda não preenchida. Ela é feita no primeiro atendimento ou aqui.</p>'}
      </section>
      ${historico ? `<section class="card"><h2 class="card-title">Versões anteriores</h2>${historico}</section>` : ''}`;
  }

  // ---------------- Consultas ----------------

  function abaConsultas(c) {
    const { utils, ui, config, permissoes } = NutriDudu;
    const verClinico = permissoes.pode('verClinico');
    const hoje = utils.isoDia(new Date());
    const lista = [...c.consultas].sort((a, b) => b.inicio.localeCompare(a.inicio));
    if (!lista.length) return `<section class="card">${ui.vazio('Nenhuma consulta ainda.')}</section>`;
    return `
      <section class="card">
        <ul class="linha-tempo">
          ${lista.map((x) => {
            const prof = c.profPorId[x.profissionalId];
            const pendente = ['agendada', 'confirmada'].includes(x.status);
            const av = c.avaliacoes.find((a) => a.id === x.avaliacaoId);
            const r = av ? NutriDudu.avaliacao.calcular(av, c.dadosFormula) : null;
            return `
              <li class="item-tempo st-${x.status}">
                <div class="item-tempo-topo">
                  <span><strong>${utils.data(x.inicio)} ${utils.hora(x.inicio)}</strong> · ${utils.escapeHtml(c.servicoPorId[x.servicoId]?.nome || '')} · ${utils.escapeHtml(config.TIPOS_CONSULTA[x.tipo] || '')}</span>
                  ${ui.statusConsulta(x.status)}
                </div>
                <p class="muted small">${utils.escapeHtml(prof?.nome || '')}${x.pacoteId ? ' · pacote' : ''}${x.agendadaPor === 'agente' ? ' · 🤖 agendada pelo agente' : ''}</p>
                ${verClinico && x.status === 'realizada' ? `
                  ${r ? `<p class="small">Avaliação: ${[av.pesoKg ? `${fmt(av.pesoKg)} kg` : '', r.imc ? `IMC ${fmt(r.imc)}` : '', r.percentualGordura !== null ? `${fmt(r.percentualGordura)}% de gordura` : ''].filter(Boolean).join(' · ')}</p>` : ''}
                  ${x.anotacoes ? `<p class="small"><strong>Evolução:</strong> ${utils.escapeHtml(x.anotacoes)}</p>` : ''}
                  ${x.conduta ? `<p class="small"><strong>Conduta:</strong> ${utils.escapeHtml(x.conduta)}</p>` : ''}
                  ${x.proximoRetorno ? `<p class="small muted">Retorno previsto: ${utils.data(x.proximoRetorno)}</p>` : ''}` : ''}
                <div class="acoes-linha">
                  ${pendente && verClinico && utils.isoDia(x.inicio) <= hoje ? `<button type="button" class="btn btn-pequeno btn-primary" data-atender="${x.id}">Registrar atendimento</button>` : ''}
                  <button type="button" class="btn btn-pequeno" data-detalhes="${x.id}">Detalhes</button>
                </div>
              </li>`;
          }).join('')}
        </ul>
      </section>`;
  }

  // ---------------- Avaliação física ----------------

  function abaAvaliacao(c) {
    const { ui, avaliacao: A, utils } = NutriDudu;
    if (!c.avaliacoesOrdenadas.length) {
      return `<section class="card">${ui.vazio('Nenhuma avaliação física ainda. Ela é registrada no atendimento.')}</section>`;
    }
    const linhas = c.avaliacoesOrdenadas;
    const metodoDe = (l) => (l.av.metodo === 'dobras' ? `dobras:${l.av.formula}` : l.av.metodo || '');
    const pontos = (fn, comNota = false) => linhas.map((l, i) => ({
      data: l.data,
      valor: fn(l),
      nota: comNota && i > 0 && fn(l) !== null && metodoDe(l) !== metodoDe(linhas[i - 1]) ? 'método de medida diferente do ponto anterior' : null,
    }));
    const graf = (titulo, ps, unidade, casas = 1) => `
      <div class="card graf-card">
        <h3 class="card-title">${titulo}</h3>
        ${ui.grafLinha(ps, { rotulo: titulo, formatar: (v) => `${fmt(v, casas)}${unidade}` })}
      </div>`;
    const mudouMetodo = linhas.some((l, i) => i > 0 && l.r.percentualGordura !== null && metodoDe(l) !== metodoDe(linhas[i - 1]));

    // Comparativo: até as 5 últimas avaliações + diferença entre a primeira e a última.
    const cols = linhas.slice(-5);
    const primeira = linhas[0];
    const ultima = linhas[linhas.length - 1];
    const medidas = [
      ['Peso (kg)', (l) => l.av.pesoKg],
      ['IMC', (l) => l.r.imc],
      ['% de gordura', (l) => l.r.percentualGordura],
      ['Massa magra (kg)', (l) => l.r.massaMagra],
      ['Massa gorda (kg)', (l) => l.r.massaGorda],
      ...Object.entries(A.CIRCUNFERENCIAS).map(([k, n]) => [`${n} (cm)`, (l) => l.av.circunferencias?.[k] ?? null]),
      ['Cintura / quadril', (l) => l.r.rcq, 2],
      ['Soma das dobras (mm)', (l) => l.r.somaDobras],
    ].filter(([, fn]) => linhas.some((l) => fn(l) !== null && fn(l) !== undefined));
    const diff = (fn, casas) => {
      const a = fn(primeira);
      const b = fn(ultima);
      if (a === null || b === null || a === undefined || b === undefined || primeira === ultima) return '—';
      const d = b - a;
      return `${d > 0 ? '+' : ''}${fmt(d, casas)}`;
    };
    return `
      <div class="grid-graficos">
        ${graf('Peso', pontos((l) => l.av.pesoKg), ' kg')}
        ${graf('IMC', pontos((l) => l.r.imc), '')}
        ${graf('% de gordura', pontos((l) => l.r.percentualGordura, true), '%')}
        ${graf('Massa magra', pontos((l) => l.r.massaMagra, true), ' kg')}
      </div>
      ${mudouMetodo ? '<p class="alerta alerta-aviso small">O método de medida do % de gordura mudou entre avaliações (pontos vazados no gráfico). A comparação entre métodos diferentes não é exata.</p>' : ''}
      <section class="card card-tabela">
        <div class="tabela-rolagem">
          <table class="tabela-clientes tabela-avaliacao">
            <thead><tr><th scope="col">Medida</th>${cols.map((l) => `<th scope="col" class="num">${utils.data(l.data)}</th>`).join('')}<th scope="col" class="num">Diferença</th></tr></thead>
            <tbody>
              ${medidas.map(([nome, fn, casas]) => `<tr><th scope="row">${nome}</th>${cols.map((l) => `<td class="num">${fmt(fn(l), casas ?? 1)}</td>`).join('')}<td class="num"><strong>${diff(fn, casas ?? 1)}</strong></td></tr>`).join('')}
              <tr><th scope="row">Método</th>${cols.map((l) => `<td class="num small">${utils.escapeHtml(l.r.origemPercentual || (l.av.metodo ? A.METODOS[l.av.metodo] : '—'))}</td>`).join('')}<td></td></tr>
            </tbody>
          </table>
        </div>
        <p class="muted small rodape-tabela">Diferença = última − primeira avaliação (${utils.data(primeira.data)} → ${utils.data(ultima.data)}).</p>
      </section>`;
  }

  // ---------------- Fotos ----------------

  function abaFotos(c) {
    const { ui, utils, config } = NutriDudu;
    const consentiu = c.pessoa.consentimentos?.fotos;
    if (!c.fotos.length) {
      return `<section class="card">${ui.vazio(consentiu
        ? 'Nenhuma foto ainda. As fotos são tiradas no registro do atendimento.'
        : 'Nenhuma foto. O cliente ainda não autorizou fotos clínicas (veja os consentimentos no cadastro).')}</section>`;
    }
    const datas = [...new Set(c.fotos.map((f) => u().isoDia(f.data)))].sort();
    const opcoesData = (sel) => datas.map((d) => `<option value="${d}"${d === sel ? ' selected' : ''}>${utils.data(d)}</option>`).join('');
    const estado = c.estadoFotos;
    const de = datas.includes(estado.de) ? estado.de : datas[0];
    const ate = datas.includes(estado.ate) ? estado.ate : datas[datas.length - 1];
    const medidaDo = (dia) => {
      const l = c.avaliacoesOrdenadas.find((x) => u().isoDia(x.data) === dia);
      return l ? [l.av.pesoKg ? `${fmt(l.av.pesoKg)} kg` : '', l.r.percentualGordura !== null ? `${fmt(l.r.percentualGordura)}% gordura` : ''].filter(Boolean).join(' · ') : '';
    };
    const angulos = Object.keys(config.ANGULOS_FOTO).filter((a) => c.fotos.some((f) => f.angulo === a && u().isoDia(f.data) === de) && c.fotos.some((f) => f.angulo === a && u().isoDia(f.data) === ate));
    const imgDe = (f) => `<img data-chave="${utils.escapeHtml(f.chave)}" alt="${utils.escapeHtml(`${config.ANGULOS_FOTO[f.angulo]} em ${utils.data(f.data)}`)}">`;
    const podeApagar = NutriDudu.permissoes.pode('registrarAtendimento');

    return `
      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Antes × depois</h2>
          <div class="comparador-datas">
            <label>De <select data-foto-de>${opcoesData(de)}</select></label>
            <label>para <select data-foto-ate>${opcoesData(ate)}</select></label>
          </div>
        </div>
        ${de === ate ? '<p class="muted small">Escolha duas datas diferentes para comparar.</p>' : ''}
        ${angulos.length && de !== ate ? angulos.map((a) => {
          const fDe = c.fotos.find((f) => f.angulo === a && u().isoDia(f.data) === de);
          const fAte = c.fotos.find((f) => f.angulo === a && u().isoDia(f.data) === ate);
          return `
            <div class="comparacao">
              <h3 class="subtitulo">${utils.escapeHtml(config.ANGULOS_FOTO[a])}</h3>
              <div class="comparacao-par">
                <figure>${imgDe(fDe)}<figcaption>${utils.data(de)}${medidaDo(de) ? ` · ${medidaDo(de)}` : ''}</figcaption></figure>
                <figure>${imgDe(fAte)}<figcaption>${utils.data(ate)}${medidaDo(ate) ? ` · ${medidaDo(ate)}` : ''}</figcaption></figure>
              </div>
            </div>`;
        }).join('') : (de !== ate ? '<p class="muted small">Não há fotos do mesmo ângulo nas duas datas.</p>' : '')}
      </section>
      <section class="card">
        <h2 class="card-title">Todas as fotos</h2>
        ${[...datas].reverse().map((d) => `
          <div class="galeria-dia">
            <h3 class="subtitulo">${utils.data(d)}${medidaDo(d) ? ` · ${medidaDo(d)}` : ''}</h3>
            <div class="galeria">
              ${c.fotos.filter((f) => u().isoDia(f.data) === d).map((f) => `
                <figure class="foto">
                  ${imgDe(f)}
                  <figcaption>${utils.escapeHtml(config.ANGULOS_FOTO[f.angulo])}${podeApagar ? ` <button type="button" class="btn-link btn-texto-perigo" data-apagar-foto="${f.id}">apagar</button>` : ''}</figcaption>
                </figure>`).join('')}
            </div>
          </div>`).join('')}
      </section>`;
  }

  // ---------------- Pacotes ----------------

  function abaPacotes(c) {
    const { ui, utils, calculos, config, permissoes } = NutriDudu;
    const STATUS_VARIANTE = { ativo: 'sucesso', concluido: 'neutro', vencido: 'alerta', cancelado: 'neutro' };
    const lista = [...c.pacotes].sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ativo = lista.find((p) => calculos.statusPacote(p) === 'ativo');
    const ultimo = lista[0];
    // Renovar aparece sem pacote ativo ou quando o ativo está acabando (saldo ≤ 1 ou vence em até 15 dias).
    const usoAtivo = ativo && calculos.usoDoPacote(ativo, c.consultas.filter((x) => x.pacoteId === ativo.id));
    const acabando = ativo && (usoAtivo.saldo <= 1 || utils.diasEntre(new Date(), ativo.validade) <= 15);
    const renovar = ultimo && (!ativo || acabando);
    const cartoes = lista.map((p) => {
      const servico = c.servicoPorId[p.servicoId];
      const nome = servico?.nome || 'Pacote';
      const status = calculos.statusPacote(p);
      const doPacote = c.consultas.filter((x) => x.pacoteId === p.id);
      const uso = calculos.usoDoPacote(p, doPacote);
      const ritmo = status === 'ativo' ? calculos.ritmoPacote(p, uso) : null;
      const pctUsado = Math.round((uso.usadas / uso.total) * 100);
      const pctReservado = Math.round((uso.reservadas / uso.total) * 100);
      const diasParaVencer = utils.diasEntre(new Date(), p.validade);
      const parcelas = c.lancamentos.filter((l) => l.pacoteId === p.id && l.status !== 'cancelado');
      const pago = parcelas.filter((l) => l.status === 'pago').reduce((t, l) => t + calculos.valorLiquido(l), 0);
      return `
        <article class="card pacote">
          <div class="secao-cabecalho">
            <h3 class="card-title">${utils.escapeHtml(nome)}</h3>
            ${ui.badge(config.STATUS_PACOTE[status] || status, STATUS_VARIANTE[status])}
          </div>
          <div class="barra-pacote" role="img" aria-label="${uso.usadas} de ${uso.total} consultas usadas, ${uso.reservadas} agendadas">
            <span class="usado" style="width:${pctUsado}%"></span><span class="reservado" style="width:${pctReservado}%"></span>
          </div>
          <p><strong>${uso.usadas} de ${uso.total}</strong> consultas usadas${uso.reservadas ? ` · ${uso.reservadas} agendada(s)` : ''} · saldo ${uso.saldo}</p>
          <p class="small muted">${utils.data(p.inicio)} a ${utils.data(p.validade)}${status === 'ativo' ? ` (vence em ${utils.dias(diasParaVencer)})` : ''} · ${utils.escapeHtml((config.FREQUENCIAS[p.frequencia] || '').toLowerCase())}</p>
          ${ritmo ? `<p class="small ${ritmo.atrasadas ? 'texto-alerta' : 'muted'}">${ritmo.atrasadas ? `⚠ ${ritmo.atrasadas} consulta(s) atrasada(s) no ritmo previsto` : 'Em dia com o ritmo previsto'} (esperadas até hoje: ${ritmo.esperadas}).</p>` : ''}
          <p class="small">${utils.moeda(p.valorNegociado)}${p.parcelas > 1 ? ` em ${p.parcelas}×` : ''} · ${utils.moeda(pago)} pago</p>
          ${p.motivoCancelamento ? `<p class="small muted">Cancelado: ${utils.escapeHtml(p.motivoCancelamento)}</p>` : ''}
          <div class="acoes-linha">
            ${['ativo', 'vencido'].includes(status) && permissoes.pode('editarRegras') ? `<button type="button" class="btn btn-pequeno" data-prorrogar="${p.id}">Prorrogar</button>` : ''}
            ${status === 'ativo' && permissoes.pode('darBaixaPagamento') ? `<button type="button" class="btn btn-pequeno btn-texto-perigo" data-cancelar-pacote="${p.id}">Cancelar</button>` : ''}
          </div>
        </article>`;
    }).join('');
    return `
      <div class="secao-cabecalho">
        <p class="small ${acabando ? 'texto-alerta' : 'muted'}">${acabando ? '⚠ O pacote ativo está acabando: hora de oferecer a renovação.' : ativo ? 'Há um pacote ativo.' : 'Nenhum pacote ativo.'}</p>
        <div class="acoes-linha sem-margem">
          ${renovar ? `<button type="button" class="btn btn-pequeno btn-primary" data-renovar="${ultimo.id}">Renovar ${utils.escapeHtml(c.servicoPorId[ultimo.servicoId]?.nome || 'pacote')}</button>` : ''}
          <button type="button" class="btn btn-pequeno${renovar ? '' : ' btn-primary'}" data-contratar>+ Contratar pacote</button>
        </div>
      </div>
      ${lista.length ? `<div class="grid-cards">${cartoes}</div>` : `<section class="card">${ui.vazio('Nenhum pacote contratado.')}</section>`}`;
  }

  // ---------------- Financeiro ----------------

  function abaFinanceiro(c) {
    const { ui, utils, calculos, config, permissoes } = NutriDudu;
    const podeMexer = permissoes.pode('darBaixaPagamento');
    const STATUS_VARIANTE = { pago: 'sucesso', pendente: 'info', atrasado: 'perigo', cancelado: 'neutro' };
    const statusDe = (l) => (calculos.lancamentoAtrasado(l) ? 'atrasado' : l.status);
    const ordem = { atrasado: 0, pendente: 1, pago: 2, cancelado: 3 };
    // Em aberto primeiro (vencimento mais próximo no topo); pagos e cancelados depois, os mais recentes primeiro.
    const lista = [...c.lancamentos].sort((a, b) => ordem[statusDe(a)] - ordem[statusDe(b)] ||
      (['pago', 'cancelado'].includes(statusDe(a)) ? b.vencimento.localeCompare(a.vencimento) : a.vencimento.localeCompare(b.vencimento)));
    const soma = (filtro) => lista.filter(filtro).reduce((t, l) => t + calculos.valorLiquido(l), 0);
    return `
      <section class="kpi-grid">
        ${ui.kpi('Total pago', utils.moeda(soma((l) => l.status === 'pago')))}
        ${ui.kpi('A receber', utils.moeda(soma((l) => statusDe(l) === 'pendente')))}
        ${ui.kpi('Atrasado', utils.moeda(soma((l) => statusDe(l) === 'atrasado')))}
      </section>
      <div class="secao-cabecalho">
        <span></span>
        ${podeMexer ? '<button type="button" class="btn btn-pequeno btn-primary" data-nova-cobranca>+ Nova cobrança</button>' : '<p class="aviso-perfil small">Seu perfil só visualiza o financeiro.</p>'}
      </div>
      ${lista.length ? `
        <section class="card card-tabela">
          <div class="tabela-rolagem">
            <table class="tabela-clientes tabela-financeiro">
              <thead><tr><th scope="col">Descrição</th><th scope="col">Vencimento</th><th scope="col" class="num">Valor</th><th scope="col">Situação</th><th scope="col"><span class="visualmente-oculto">Ações</span></th></tr></thead>
              <tbody>
                ${lista.map((l) => {
                  const st = statusDe(l);
                  return `
                    <tr class="${st === 'cancelado' ? 'cancelada' : ''}">
                      <td>${utils.escapeHtml(l.descricao)}${l.desconto ? `<span class="muted small bloco">desconto de ${utils.moeda(l.desconto)}</span>` : ''}</td>
                      <td>${utils.data(l.vencimento)}</td>
                      <td class="num">${utils.moeda(calculos.valorLiquido(l))}</td>
                      <td>${ui.badge(config.STATUS_LANCAMENTO[st], STATUS_VARIANTE[st])}${st === 'pago' ? `<span class="muted small bloco">${utils.data(l.dataPagamento)} · ${utils.escapeHtml(config.FORMAS_PAGAMENTO[l.formaPagamento] || '')}</span>` : ''}</td>
                      <td class="num acoes-celula">${podeMexer && ['pendente', 'atrasado'].includes(st) ? `
                        <button type="button" class="btn btn-pequeno" data-baixa="${l.id}">Receber</button>
                        <button type="button" class="btn-link btn-texto-perigo" data-cancelar-lanc="${l.id}">cancelar</button>` : ''}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>` : `<section class="card">${ui.vazio('Nenhuma cobrança.')}</section>`}`;
  }

  // ---------------- Histórico ----------------

  function abaHistorico(c) {
    const { ui, utils, config } = NutriDudu;
    const filtro = c.estadoHistorico.tipo;
    const lista = [...c.interacoes].sort((a, b) => b.dataHora.localeCompare(a.dataHora)).filter((i) => !filtro || i.tipo === filtro);
    const tipos = [...new Set(c.interacoes.map((i) => i.tipo))];
    const AUTORES = { ...config.PERFIS, agente: 'Agente de IA', sistema: 'Sistema', paciente: 'Paciente' };
    return `
      <div class="secao-cabecalho">
        <select data-filtro-historico aria-label="Filtrar por tipo">
          <option value="">Tudo (${c.interacoes.length})</option>
          ${tipos.map((t) => `<option value="${t}"${t === filtro ? ' selected' : ''}>${utils.escapeHtml(config.TIPOS_INTERACAO[t] || t)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-pequeno btn-primary" data-nova-nota>+ Registrar contato ou nota</button>
      </div>
      <section class="card">
        ${lista.length ? `<ul class="linha-tempo">
          ${lista.map((i) => `
            <li class="item-tempo">
              <div class="item-tempo-topo">
                <span><strong>${utils.data(i.dataHora)} ${utils.hora(i.dataHora)}</strong> · ${utils.escapeHtml(AUTORES[i.autor] || i.autor || '')}${i.automatico ? ' · automático' : ''}</span>
                ${ui.badge(config.TIPOS_INTERACAO[i.tipo] || i.tipo, i.tipo === 'agente' ? 'info' : 'neutro')}
              </div>
              <p>${utils.escapeHtml(i.descricao)}</p>
            </li>`).join('')}
        </ul>` : ui.vazio('Nada registrado.')}
      </section>`;
  }

  function novaNota(pessoa) {
    const { form: f, modal, store, ui, permissoes } = NutriDudu;
    const TIPOS = { ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', nota: 'Nota' };
    modal.formulario({
      titulo: 'Registrar contato ou nota',
      corpo: `
        ${f.selecao('tipo', 'Tipo', TIPOS, 'ligacao')}
        ${f.areaTexto('descricao', 'O que foi conversado', '', { obrigatorio: true, ajuda: 'Visível para toda a equipe. Dados de saúde vão na anamnese.' })}`,
      ler: (form) => ({ tipo: f.valor(form, 'tipo'), descricao: f.valor(form, 'descricao') }),
      validar: (d) => (d.descricao ? {} : { descricao: 'Escreva o que foi conversado.' }),
      salvar: async (d) => {
        await store.create('interacoes', { pessoaId: pessoa.id, dataHora: new Date().toISOString(), ...d, autor: permissoes.atual(), automatico: false });
        ui.toast('Registrado no histórico.');
      },
    });
  }

  // ---------------- Página ----------------

  // Escolhas da tela (datas do comparador, filtro do histórico), por cliente, enquanto o sistema está aberto.
  const estadoFotos = {};
  const estadoHistorico = {};

  async function render(container, params) {
    const { store, ui, config, utils, permissoes, anamnese, calculos } = NutriDudu;
    const pessoa = await store.get('pessoas', params.id);

    if (!pessoa) {
      container.innerHTML = `
        ${ui.cabecalho('Cliente não encontrado')}
        <div class="card">
          <p>Esse cadastro não existe ou foi removido.</p>
          <a class="btn" href="#/clientes">Voltar para Clientes</a>
        </div>`;
      return;
    }

    const verClinico = permissoes.pode('verClinico');
    let aba = ABAS[params.aba] ? params.aba : 'visao';
    if (ABAS[aba].clinica && !verClinico) aba = 'visao';

    const doCliente = (x) => x.pessoaId === pessoa.id;
    const [consultas, pacotes, lancamentos, profissionais, indicadoPor, indicados, anamneses, avaliacoes, fotos, interacoes, servicos, geral] = await Promise.all([
      store.list('consultas', doCliente),
      store.list('pacotes', doCliente),
      store.list('lancamentos', doCliente),
      store.list('profissionais'),
      pessoa.indicadoPorId ? store.get('pessoas', pessoa.indicadoPorId) : null,
      store.list('pessoas', (p) => p.indicadoPorId === pessoa.id),
      // Dados clínicos só são buscados para quem pode vê-los.
      verClinico ? store.list('anamneses', doCliente) : [],
      verClinico ? store.list('avaliacoes', doCliente) : [],
      verClinico ? store.list('fotos', doCliente) : [],
      store.list('interacoes', doCliente),
      store.list('servicos'),
      store.get('configuracoes', 'geral'),
    ]);

    const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
    const resumo = calculos.resumoPessoa(pessoa, { consultas, pacotes, lancamentos }, geral || {});
    const dadosFormula = { sexo: pessoa.sexo, idade: utils.idade(pessoa.dataNascimento) };
    const avaliacoesOrdenadas = avaliacoes
      .map((av) => ({ av, data: consultas.find((x) => x.id === av.consultaId)?.inicio || av.criadoEm, r: NutriDudu.avaliacao.calcular(av, dadosFormula) }))
      .sort((a, b) => a.data.localeCompare(b.data));
    estadoFotos[pessoa.id] = estadoFotos[pessoa.id] || {};
    estadoHistorico[pessoa.id] = estadoHistorico[pessoa.id] || {};

    const c = {
      pessoa, consultas, pacotes, lancamentos, anamneses, avaliacoes, avaliacoesOrdenadas, fotos, interacoes, indicados, resumo, dadosFormula,
      servicoPorId: porId(servicos), profPorId: porId(profissionais),
      estadoFotos: estadoFotos[pessoa.id], estadoHistorico: estadoHistorico[pessoa.id],
    };

    const { atual, pre } = anamnese.situacao(anamneses);
    const alertas = anamnese.alertas(atual || pre);
    const idade = utils.idade(pessoa.dataNascimento);
    const profissional = c.profPorId[pessoa.profissionalId];
    const hoje = utils.isoDia(new Date());
    const podeAtender = permissoes.pode('registrarAtendimento');
    const pendenteHoje = consultas
      .filter((x) => ['agendada', 'confirmada'].includes(x.status) && utils.isoDia(x.inicio) <= hoje)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];

    const conteudo = {
      visao: abaVisao, anamnese: abaAnamnese, consultas: abaConsultas, avaliacao: abaAvaliacao,
      fotos: abaFotos, pacotes: abaPacotes, financeiro: abaFinanceiro, historico: abaHistorico,
    }[aba](c);

    const base = `#/clientes/${encodeURIComponent(pessoa.id)}`;
    container.innerHTML = `<div class="ficha">
      <div class="ficha-topo card">
        <div class="ficha-identidade">
          ${ui.avatar(utils.iniciais(pessoa.nome))}
          <div class="ficha-nome">
            <h1>${utils.escapeHtml(pessoa.nome)}</h1>
            <p class="muted">${idade !== null ? `${idade} anos · ` : ''}${utils.escapeHtml(pessoa.telefone)}${pessoa.email ? ` · ${utils.escapeHtml(pessoa.email)}` : ''}</p>
            <p class="ficha-tags">
              ${ui.statusPessoa(pessoa.status)}
              ${profissional ? ui.badge(profissional.nome) : ''}
              ${ui.badge(`Origem: ${config.ORIGENS[pessoa.origem] || ''}`)}
              ${(pessoa.tags || []).map((t) => ui.badge(t, 'etiqueta')).join('')}
              ${indicadoPor ? `<span class="small">Indicado(a) por <a href="#/clientes/${encodeURIComponent(indicadoPor.id)}">${utils.escapeHtml(indicadoPor.nome)}</a></span>` : ''}
              ${indicados.length ? `<span class="small muted">Indicou ${indicados.length} ${indicados.length === 1 ? 'pessoa' : 'pessoas'}</span>` : ''}
            </p>
          </div>
          <div class="ficha-acoes">
            ${pendenteHoje && podeAtender ? `<button type="button" class="btn btn-pequeno btn-primary" data-atender="${pendenteHoje.id}">Registrar atendimento</button>` : ''}
            <button type="button" class="btn btn-pequeno${pendenteHoje && podeAtender ? '' : ' btn-primary'}" data-agendar>Agendar</button>
            <a class="btn btn-pequeno" href="https://wa.me/55${utils.soDigitos(pessoa.telefone)}" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" class="btn btn-pequeno" data-editar-cadastro>Editar cadastro</button>
          </div>
        </div>
      </div>

      ${verClinico && alertas.length ? `<div class="alerta alerta-perigo" role="note"><strong>Atenção:</strong> ${alertas.map(utils.escapeHtml).join(' · ')}</div>` : ''}
      ${resumo.semRetorno ? `<div class="alerta alerta-aviso" role="note"><strong>Sem retorno marcado:</strong> última consulta há ${utils.dias(resumo.diasSemConsulta)} (${utils.data(resumo.ultima.inicio)}) e nada agendado. O prazo de retorno é de ${resumo.prazoRetorno} dias.</div>` : ''}

      <section class="kpi-grid">
        ${ui.kpi('Última consulta', resumo.ultima ? utils.data(resumo.ultima.inicio) : '—', resumo.ultima ? utils.haDias(resumo.diasSemConsulta) : '')}
        ${ui.kpi('Próximo agendamento', resumo.proxima ? `${utils.data(resumo.proxima.inicio)} ${utils.hora(resumo.proxima.inicio)}` : 'Nenhum')}
        ${ui.kpi('Pacote', resumo.pacote ? `${resumo.pacote.usadas} de ${resumo.pacote.total} usadas` : 'Nenhum ativo',
          resumo.pacote ? `${c.servicoPorId[resumo.pacote.servicoId]?.nome || 'Pacote'} · vence ${utils.data(resumo.pacote.validade)}` : '')}
        ${ui.kpi('Em aberto', utils.moeda(resumo.emAberto), resumo.atrasado ? `${utils.moeda(resumo.atrasado)} atrasado` : '')}
      </section>

      <nav class="abas abas-ficha" aria-label="Seções da ficha">
        ${Object.entries(ABAS).filter(([, a]) => verClinico || !a.clinica).map(([id, a]) => `
          <a href="${base}/${id}" class="aba${id === aba ? ' ativa' : ''}"${id === aba ? ' aria-current="page"' : ''}>${a.nome}${id === 'anamnese' && pre ? ' <span class="ponto-aviso" title="Pré-anamnese a revisar"></span>' : ''}</a>`).join('')}
      </nav>

      <div class="ficha-conteudo">${conteudo}</div>
    </div>`;

    // ----- Ações (os ouvintes ficam no invólucro, que vai para a tela) -----
    const pagina = container.querySelector('.ficha');
    const achar = (lista, id) => lista.find((x) => x.id === id);
    pagina.addEventListener('click', async (e) => {
      const alvo = (sel) => e.target.closest(sel);
      if (alvo('[data-agendar]')) NutriDudu.agendamento.abrir({ pessoaId: pessoa.id });
      else if (alvo('[data-editar-cadastro]')) NutriDudu.cadastroPessoa.abrir({ pessoa });
      else if (alvo('[data-atender]')) NutriDudu.atendimento.abrir(alvo('[data-atender]').dataset.atender);
      else if (alvo('[data-detalhes]')) NutriDudu.agendamento.detalhes(alvo('[data-detalhes]').dataset.detalhes);
      else if (alvo('[data-revisar-anamnese]')) NutriDudu.anamnese.abrir(pessoa);
      else if (alvo('[data-contratar]')) NutriDudu.financeiro.contratarPacote({ pessoa });
      else if (alvo('[data-renovar]')) NutriDudu.financeiro.contratarPacote({ pessoa, renovarDe: achar(pacotes, alvo('[data-renovar]').dataset.renovar) });
      else if (alvo('[data-prorrogar]')) {
        const p = achar(pacotes, alvo('[data-prorrogar]').dataset.prorrogar);
        NutriDudu.financeiro.prorrogar(p, c.servicoPorId[p.servicoId]?.nome || 'Pacote');
      } else if (alvo('[data-cancelar-pacote]')) {
        const p = achar(pacotes, alvo('[data-cancelar-pacote]').dataset.cancelarPacote);
        NutriDudu.financeiro.cancelarPacote(p, c.servicoPorId[p.servicoId]?.nome || 'Pacote');
      } else if (alvo('[data-nova-cobranca]')) NutriDudu.financeiro.novoLancamento({ pessoa });
      else if (alvo('[data-baixa]')) NutriDudu.financeiro.darBaixa(achar(lancamentos, alvo('[data-baixa]').dataset.baixa));
      else if (alvo('[data-cancelar-lanc]')) NutriDudu.financeiro.cancelarLancamento(achar(lancamentos, alvo('[data-cancelar-lanc]').dataset.cancelarLanc));
      else if (alvo('[data-nova-nota]')) novaNota(pessoa);
      else if (alvo('[data-apagar-foto]')) {
        const foto = achar(fotos, alvo('[data-apagar-foto]').dataset.apagarFoto);
        const ok = await NutriDudu.modal.confirmar({ titulo: 'Apagar foto?', mensagem: `${config.ANGULOS_FOTO[foto.angulo]} de ${utils.data(foto.data)}. Não dá para desfazer.`, textoConfirmar: 'Apagar', perigo: true });
        if (!ok) return;
        await NutriDudu.fotosStore.remover(foto.chave);
        await store.remove('fotos', foto.id);
        ui.toast('Foto apagada.');
      }
    });
    pagina.addEventListener('change', (e) => {
      if (e.target.matches('[data-foto-de]')) { c.estadoFotos.de = e.target.value; NutriDudu.recarregarPagina(); }
      if (e.target.matches('[data-foto-ate]')) { c.estadoFotos.ate = e.target.value; NutriDudu.recarregarPagina(); }
      if (e.target.matches('[data-filtro-historico]')) { c.estadoHistorico.tipo = e.target.value; NutriDudu.recarregarPagina(); }
    });

    // Imagens das fotos: vêm do IndexedDB, depois que a página está montada.
    container.querySelectorAll('img[data-chave]').forEach(async (img) => {
      const dados = await NutriDudu.fotosStore.ler(img.dataset.chave);
      if (dados) img.src = dados;
      else img.replaceWith(Object.assign(document.createElement('span'), { className: 'foto-faltando muted small', textContent: 'imagem indisponível neste navegador' }));
    });
  }

  return { titulo: 'Cliente', render, ABAS };
})();
