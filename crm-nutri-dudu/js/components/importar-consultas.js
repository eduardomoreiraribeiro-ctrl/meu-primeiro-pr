// Importar consultas de outra agenda (ex.: o sistema da clínica onde a sala é sublocada).
// Cola-se uma lista, uma consulta por linha:  23/11/2026 08:00-09:00 YURI PESS
// O nome pode vir cortado (como aparece na agenda da clínica): o sistema procura o paciente
// cadastrado cujo nome começa assim. Mostra uma prévia; nada é gravado antes de confirmar.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.importarConsultas = (function () {
  const MAX_LINHAS = 300;

  /**
   * Lê uma linha: data (dd/mm ou dd/mm/aaaa), início, fim (opcional) e nome.
   * Devolve { dia: 'AAAA-MM-DD', inicio: 'HH:MM', fim: 'HH:MM' | null, nome } ou { erro }.
   */
  function lerLinha(linha, anoPadrao) {
    const t = String(linha || '').replace(/\s+/g, ' ').trim();
    const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s+(\d{1,2})[:h](\d{2})(?:\s*(?:-|–|a|até)\s*(\d{1,2})[:h](\d{2}))?\s*[-–:]?\s*(.*)$/i.exec(t);
    if (!m) return { erro: 'não entendi a data e o horário' };
    const [, d, mes, a, h1, m1, h2, m2, resto] = m;
    let ano = a ? Number(a) : anoPadrao(Number(mes), Number(d));
    if (ano < 100) ano += 2000;
    const dia = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = new Date(`${dia}T12:00:00`);
    if (Number.isNaN(data.getTime()) || data.getDate() !== Number(d)) return { erro: 'data inválida' };
    const hora = (h, mm) => `${String(h).padStart(2, '0')}:${mm}`;
    if (Number(h1) > 23 || Number(m1) > 59) return { erro: 'horário inválido' };
    // Tira marcações da agenda da clínica, como "[A]", e reticências do nome cortado.
    const nome = resto.replace(/\[[^\]]*\]/g, ' ').replace(/(\.\.\.|…)\s*$/, '').replace(/\s+/g, ' ').trim();
    if (nome.length < 2) return { erro: 'sem nome' };
    return { dia, inicio: hora(h1, m1), fim: h2 ? hora(h2, m2) : null, nome };
  }

  /**
   * Pacientes cujo nome combina com o nome (possivelmente cortado) da lista.
   * "YURI PESS" combina com "Yuri Pessoa Lima": cada palavra da lista é o começo de uma palavra
   * do cadastro, na mesma ordem.
   */
  function candidatos(nomeLista, pessoas) {
    const { utils } = NutriDudu;
    const palavras = (s) => utils.normalizar(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
    const busca = palavras(nomeLista);
    if (!busca.length) return [];
    const combina = (p) => {
      const nome = palavras(p.nome);
      let i = 0;
      for (const termo of busca) {
        while (i < nome.length && !nome[i].startsWith(termo)) i++;
        if (i >= nome.length) return false;
        i++;
      }
      // A primeira palavra tem que ser o começo do primeiro nome.
      return nome[0].startsWith(busca[0]);
    };
    return pessoas.filter(combina);
  }

  async function abrir({ texto: textoInicial = '' } = {}) {
    const { form: f, modal, store, ui, utils, agenda, permissoes, calculos } = NutriDudu;
    if (!permissoes.exigir('gerenciarDados')) return;
    const [pessoas, profissionais, servicos, consultas, pacotes, horarios, bloqueios, geral] = await Promise.all([
      store.list('pessoas'), store.list('profissionais'), store.list('servicos'), store.list('consultas'),
      store.list('pacotes'), store.list('horarios'), store.list('bloqueios'), store.get('configuracoes', 'geral'),
    ]);
    const ativos = profissionais.filter((p) => p.ativo !== false);
    const servicosConsulta = servicos.filter((s) => s.ativo !== false && s.categoria !== 'pacote');
    const servicoPadrao = servicosConsulta.find((s) => /avulsa/i.test(s.nome)) || servicosConsulta[0];
    const pessoaPorId = Object.fromEntries(pessoas.map((p) => [p.id, p]));
    const ordenadas = [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const ctx = {
      horarios, bloqueios, consultas, geral: geral || {},
      nomePessoa: (id) => pessoaPorId[id]?.nome || 'outro paciente',
      nomeProfissional: (id) => profissionais.find((p) => p.id === id)?.nome || 'O profissional',
    };
    // Sem ano na linha: o ano em que essa data ainda está por vir.
    const hoje = new Date();
    const anoPadrao = (mes, dia) => {
      const ano = hoje.getFullYear();
      return new Date(ano, mes - 1, dia, 23, 59) < hoje ? ano + 1 : ano;
    };
    let linhas = [];

    const corpo = `
      <p class="small">Uma consulta por linha: <strong>data, horário e nome</strong>, como aparece na agenda da clínica. O nome pode estar cortado. Exemplo:</p>
      <pre class="small import-exemplo-bloco">23/11/2026 08:00-09:00 YURI PESS
24/11/2026 09:00-10:00 ENZO SCA</pre>
      ${f.areaTexto('texto', 'Cole aqui a lista de consultas', '', { linhas: 6 })}
      <div class="acoes-linha"><button type="button" class="btn btn-pequeno btn-primary" data-ler>Ler a lista</button></div>
      <div data-previa></div>`;

    const dialog = modal.formulario({
      titulo: 'Importar consultas de outra agenda',
      largo: true,
      textoSalvar: 'Importar',
      corpo,
      ler: (form) => ({
        profissionalId: f.valor(form, 'profImport') || ativos[0]?.id,
        servicoId: f.valor(form, 'servicoImport') || servicoPadrao?.id,
        tipo: f.valor(form, 'tipoImport') || 'presencial',
        semPre: f.marcado(form, 'semPreImport'),
        escolhas: linhas.map((l, i) => (l.erro || l.situacao === 'passada' || l.situacao === 'existe' ? '' : f.valor(form, `pessoa${i}`))),
      }),
      validar: (op) => {
        if (!linhas.length) return { _geral: 'Cole a lista e toque em "Ler a lista".' };
        if (!op.escolhas.some(Boolean)) return { _geral: 'Nenhuma consulta para importar: escolha o paciente de cada linha.' };
        if (!op.profissionalId || !op.servicoId) return { _geral: 'Escolha o profissional e o serviço.' };
        return {};
      },
      salvar: async (op) => {
        const agora = new Date().toISOString();
        const servico = servicos.find((s) => s.id === op.servicoId);
        const botao = dialog.querySelector('[type="submit"]');
        // Saldo livre dos pacotes ativos, para ligar cada consulta ao pacote da pessoa.
        const livre = Object.fromEntries(pacotes.filter((p) => p.status === 'ativo').map((p) => {
          const uso = calculos.usoDoPacote(p, consultas.filter((c) => c.pacoteId === p.id));
          return [p.id, p.qtdConsultas - uso.usadas - uso.reservadas];
        }));
        let feitos = 0;
        const total = op.escolhas.filter(Boolean).length;
        for (const [i, l] of linhas.entries()) {
          const pessoaId = op.escolhas[i];
          if (!pessoaId) continue;
          const inicio = agenda.dataComHora(l.dia, l.inicio);
          const fim = l.fim ? agenda.dataComHora(l.dia, l.fim) : agenda.somarMin(inicio, servico?.duracaoMin || 60);
          const pacote = pacotes
            .filter((p) => p.pessoaId === pessoaId && p.status === 'ativo' && livre[p.id] > 0)
            .sort((a, b) => String(a.inicio || a.criadoEm).localeCompare(String(b.inicio || b.criadoEm)))[0];
          if (pacote) livre[pacote.id]--;
          const problemas = agenda.verificar({ pessoaId, profissionalId: op.profissionalId, inicio, fim, tipo: op.tipo, modalidade: op.tipo }, ctx);
          const nova = await store.create('consultas', {
            pessoaId, profissionalId: op.profissionalId,
            servicoId: pacote?.servicoId || op.servicoId, pacoteId: pacote?.id || null,
            tipo: op.tipo, inicio: inicio.toISOString(), fim: fim.toISOString(),
            status: 'agendada', agendadaPor: 'profissional', encaixe: problemas.length > 0, descontarFalta: true,
            avaliacaoId: null, anamneseId: null, fotoIds: [], anotacoes: '', conduta: '', proximoRetorno: null,
            observacaoAgenda: 'Importada da agenda da clínica.',
            importada: true,
            // Quem já é acompanhado não precisa da pré-anamnese.
            ...(op.semPre ? { automacoes: { preAnamnese: { em: agora, ok: true, importada: true, dispensada: true } } } : {}),
          });
          ctx.consultas.push(nova);
          await store.create('interacoes', {
            pessoaId, dataHora: agora, tipo: 'consulta', autor: permissoes.atual(), automatico: true,
            descricao: `Consulta de ${utils.data(inicio)} às ${utils.hora(inicio)} importada da agenda da clínica${pacote ? ' (descontada do pacote)' : ''}.`,
          });
          feitos++;
          botao.textContent = `Importando… ${feitos} de ${total}`;
        }
        ui.toast(`${feitos} ${feitos === 1 ? 'consulta importada' : 'consultas importadas'}.`);
        NutriDudu.recarregarPagina?.();
      },
    });

    const form = dialog.querySelector('form');
    const previa = form.querySelector('[data-previa]');
    const botaoSalvar = form.querySelector('[type="submit"]');
    botaoSalvar.disabled = true;

    function ler() {
      const texto = String(form.elements.texto.value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_LINHAS);
      if (!texto.length) { previa.innerHTML = '<p class="erro-texto small">Nada para ler: cole a lista acima.</p>'; return; }
      const agoraMs = Date.now();
      linhas = texto.map((original) => {
        const l = { original, ...lerLinha(original, anoPadrao) };
        if (l.erro) return l;
        const inicio = agenda.dataComHora(l.dia, l.inicio);
        l.quando = inicio;
        if (inicio.getTime() < agoraMs) return { ...l, situacao: 'passada' };
        l.opcoes = candidatos(l.nome, pessoas);
        // Já existe uma consulta dessa pessoa nesse horário? Não duplica.
        const ja = l.opcoes.length === 1 && consultas.some((c) => c.pessoaId === l.opcoes[0].id && !['cancelada', 'remarcada'].includes(c.status) && new Date(c.inicio).getTime() === inicio.getTime());
        if (ja) return { ...l, situacao: 'existe' };
        l.situacao = l.opcoes.length === 1 ? 'ok' : l.opcoes.length ? 'varios' : 'nenhum';
        return l;
      });
      desenhar();
    }

    function desenhar() {
      const contar = (s) => linhas.filter((l) => l.situacao === s).length;
      const erros = linhas.filter((l) => l.erro);
      const seletor = (l, i) => {
        const primeiras = l.opcoes;
        const resto = ordenadas.filter((p) => !primeiras.includes(p));
        const sel = l.situacao === 'ok' ? primeiras[0].id : '';
        return `<select name="pessoa${i}" aria-label="Paciente da linha ${i + 1}">
          <option value="">— não importar —</option>
          ${primeiras.length ? `<optgroup label="Combinam com &quot;${utils.escapeHtml(l.nome)}&quot;">${primeiras.map((p) => `<option value="${utils.escapeHtml(p.id)}"${p.id === sel ? ' selected' : ''}>${utils.escapeHtml(p.nome)}</option>`).join('')}</optgroup>` : ''}
          <optgroup label="Todos os pacientes">${resto.map((p) => `<option value="${utils.escapeHtml(p.id)}">${utils.escapeHtml(p.nome)}</option>`).join('')}</optgroup>
        </select>`;
      };
      const situacao = (l) => ({
        ok: ui.badge('Encontrado', 'sucesso'),
        varios: ui.badge('Escolha o paciente', 'alerta'),
        nenhum: ui.badge('Não encontrado', 'perigo'),
        existe: ui.badge('Já está na agenda', 'neutro'),
        passada: ui.badge('Data já passou', 'neutro'),
      }[l.situacao] || '');
      const linhasTabela = linhas.map((l, i) => (l.erro ? '' : `<tr>
          <td>${utils.escapeHtml(utils.data(l.quando))}<span class="muted small bloco">${utils.escapeHtml(l.inicio)}${l.fim ? `–${utils.escapeHtml(l.fim)}` : ''}</span></td>
          <td>${utils.escapeHtml(l.nome)}</td>
          <td>${['ok', 'varios', 'nenhum'].includes(l.situacao) ? seletor(l, i) : '—'}</td>
          <td>${situacao(l)}</td>
        </tr>`)).join('');
      const opcoesServico = servicosConsulta.map((s) => [s.id, `${s.nome} (${s.duracaoMin} min)`]);
      previa.innerHTML = `
        <h3 class="import-titulo">1. Confira os pacientes</h3>
        <p class="small"><strong>${contar('ok')}</strong> encontrado(s)${contar('varios') ? ` · <strong>${contar('varios')}</strong> com mais de um paciente possível (escolha)` : ''}${contar('nenhum') ? ` · <span class="texto-perigo">${contar('nenhum')} não encontrado(s)</span>` : ''}${contar('existe') ? ` · ${contar('existe')} já na agenda` : ''}${contar('passada') ? ` · ${contar('passada')} com data passada` : ''}</p>
        ${contar('nenhum') ? '<p class="muted small">Paciente não encontrado: cadastre-o em Clientes (com o celular, para receber os lembretes) e leia a lista de novo, ou escolha o nome certo na lista.</p>' : ''}
        <div class="tabela-rolagem"><table class="tabela-simples small"><thead><tr><th>Quando</th><th>Na agenda da clínica</th><th>Paciente</th><th>Situação</th></tr></thead><tbody>${linhasTabela}</tbody></table></div>
        ${erros.length ? `<details class="small"><summary>${erros.length} linha(s) não entendida(s)</summary><ul>${erros.map((l) => `<li><code>${utils.escapeHtml(l.original)}</code> — ${utils.escapeHtml(l.erro)}</li>`).join('')}</ul></details>` : ''}
        <h3 class="import-titulo">2. Como agendar</h3>
        <div class="grade-2">
          ${ativos.length > 1 ? f.selecao('profImport', 'Profissional', ativos.map((p) => [p.id, p.nome]), ativos[0]?.id) : ''}
          ${f.selecao('servicoImport', 'Serviço', opcoesServico, servicoPadrao?.id)}
          ${f.selecao('tipoImport', 'Tipo', { presencial: 'Presencial', online: 'Online' }, 'presencial')}
        </div>
        <p class="muted small">O horário de término é o da agenda da clínica. Quem tem pacote ativo com consultas livres tem a consulta descontada do pacote. Horários fora do seu expediente entram como encaixe.</p>
        ${f.chave('semPreImport', 'Não enviar a pré-anamnese para estas consultas (pacientes que já fazem acompanhamento)', true, { ajuda: 'Desmarque se houver paciente novo na lista: ele recebe o formulário antes da primeira consulta.' })}
        <p class="muted small">Os lembretes saem normalmente (até 40 h antes de cada consulta), só para quem autorizou mensagens pelo WhatsApp.</p>`;
      const atualizarBotao = () => {
        const n = [...previa.querySelectorAll('select[name^="pessoa"]')].filter((s) => s.value).length;
        botaoSalvar.disabled = !n;
        botaoSalvar.textContent = n ? `Importar ${n} ${n === 1 ? 'consulta' : 'consultas'}` : 'Importar';
      };
      previa.querySelectorAll('select[name^="pessoa"]').forEach((s) => s.addEventListener('change', atualizarBotao));
      atualizarBotao();
      previa.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.querySelector('[data-ler]').addEventListener('click', ler);
    if (textoInicial) { form.elements.texto.value = textoInicial; ler(); }
  }

  return { abrir, lerLinha, candidatos };
})();
