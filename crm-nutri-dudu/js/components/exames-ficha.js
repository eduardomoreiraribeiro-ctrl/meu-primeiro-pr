// Aba "Exames" da ficha: laudos de exames bioquímicos (PDF ou foto), leitura com IA
// (resultado, unidade, referência do laboratório e situação), revisão pela nutricionista
// e a evolução de cada exame ao longo do tempo.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.examesFicha = (function () {
  const SITUACOES = {
    abaixo: { rotulo: 'Abaixo', icone: '🔵', classe: 'ex-abaixo' },
    adequado: { rotulo: 'Adequado', icone: '🟢', classe: 'ex-adequado' },
    acima: { rotulo: 'Acima', icone: '🔴', classe: 'ex-acima' },
    sem_referencia: { rotulo: 'Sem referência', icone: '⚪', classe: 'ex-sem' },
  };
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');
  const chaveNome = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const numero = (v) => {
    const m = String(v ?? '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const dataDo = (e) => e.dataColeta || NutriDudu.utils.isoDia(e.criadoEm);
  const ordenar = (lista) => [...lista].sort((a, b) => String(dataDo(b)).localeCompare(String(dataDo(a))));
  const selo = (s) => { const x = SITUACOES[s] || SITUACOES.sem_referencia; return `<span class="ex-selo ${x.classe}">${x.icone} ${x.rotulo}</span>`; };

  /** Evolução: cada exame que aparece em 2 ou mais laudos analisados, com os últimos 4 valores. */
  function evolucao(exames) {
    const analisados = ordenar(exames.filter((e) => e.analise?.itens?.length)).reverse(); // do mais antigo ao mais novo
    if (analisados.length < 2) return '';
    const porNome = new Map();
    analisados.forEach((e) => e.analise.itens.forEach((i) => {
      const k = chaveNome(i.nome);
      if (!k) return;
      if (!porNome.has(k)) porNome.set(k, { nome: i.nome, unidade: i.unidade, pontos: [] });
      porNome.get(k).pontos.push({ data: dataDo(e), valor: i.valor, situacao: i.situacao });
    }));
    const linhas = [...porNome.values()].filter((x) => x.pontos.length >= 2);
    if (!linhas.length) return '';
    const datas = analisados.slice(-4).map(dataDo);
    return `
      <section class="card">
        <h2 class="card-title">Evolução dos exames</h2>
        <p class="muted small card-sub">Exames que aparecem em mais de um laudo · seta = em relação ao anterior</p>
        <div class="rolagem-x"><table class="tabela-clientes ex-evolucao">
          <thead><tr><th scope="col">Exame</th>${datas.map((d) => `<th scope="col" class="num">${esc(NutriDudu.utils.data(d))}</th>`).join('')}</tr></thead>
          <tbody>${linhas.map((l) => `<tr><th scope="row">${esc(l.nome)}${l.unidade ? ` <span class="muted small">${esc(l.unidade)}</span>` : ''}</th>${datas.map((d) => {
            const i = l.pontos.findIndex((pt) => pt.data === d);
            if (i < 0) return '<td class="num muted">—</td>';
            const pt = l.pontos[i]; const ant = l.pontos[i - 1];
            const a = numero(ant?.valor); const b = numero(pt.valor);
            const seta = ant && a !== null && b !== null ? (b > a ? ' ↑' : b < a ? ' ↓' : ' =') : '';
            return `<td class="num"><span class="${(SITUACOES[pt.situacao] || SITUACOES.sem_referencia).classe}-texto">${esc(pt.valor)}${seta}</span></td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  function cartaoExame(e) {
    const { utils } = NutriDudu;
    const a = e.analise;
    const fora = a?.itens?.filter((i) => i.situacao === 'abaixo' || i.situacao === 'acima') || [];
    return `
      <section class="card ex-cartao" data-exame="${esc(e.id)}">
        <div class="secao-cabecalho">
          <div>
            <h2 class="card-title">Coleta de ${esc(utils.data(dataDo(e)))}${e.laboratorio ? ` · ${esc(e.laboratorio)}` : ''}</h2>
            <p class="muted small">${e.arquivo?.tipo === 'application/pdf' ? '📄' : '🖼️'} ${esc(e.arquivo?.nome || 'arquivo')}${a ? ` · ${a.itens.length} resultados${fora.length ? ` · <strong>${fora.length} fora da referência</strong>` : ''}` : ''}</p>
          </div>
          <span class="acoes-linha sem-margem">
            <button type="button" class="btn btn-pequeno" data-ex-abrir>Ver arquivo</button>
            ${a ? '<button type="button" class="btn btn-pequeno" data-ex-revisar>Editar resultados</button>' : ''}
            <button type="button" class="btn btn-pequeno${a ? '' : ' btn-primary'}" data-ex-analisar>${a ? 'Analisar de novo' : '🤖 Analisar com IA'}</button>
            <button type="button" class="btn btn-pequeno btn-texto-perigo" data-ex-apagar>Apagar</button>
          </span>
        </div>
        ${a ? `
          ${a.resumo ? `<div class="ex-resumo"><strong>Pontos de atenção</strong>${esc(a.resumo).replace(/\n/g, '<br>')}</div>` : ''}
          <div class="rolagem-x"><table class="tabela-clientes ex-tabela">
            <thead><tr><th scope="col">Exame</th><th scope="col">Resultado</th><th scope="col">Referência</th><th scope="col">Situação</th></tr></thead>
            <tbody>${[...a.itens].sort((x, y) => (['acima', 'abaixo'].includes(y.situacao) ? 1 : 0) - (['acima', 'abaixo'].includes(x.situacao) ? 1 : 0)).map((i) => `
              <tr class="${['acima', 'abaixo'].includes(i.situacao) ? 'ex-fora' : ''}">
                <th scope="row">${esc(i.nome)}${i.nota ? `<span class="muted small bloco">${esc(i.nota)}</span>` : ''}</th>
                <td><strong>${esc(i.valor)}</strong> ${esc(i.unidade)}</td>
                <td class="small">${esc(i.referencia) || '—'}</td>
                <td>${selo(i.situacao)}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          <p class="muted small" style="margin-top:8px">Lido pela IA em ${esc(utils.data(a.em))}${a.revisadoPor ? ` · revisado por ${esc(NutriDudu.config.PERFIS[a.revisadoPor] || a.revisadoPor)}` : ''}. A IA é um apoio: confira sempre com o laudo.</p>`
        : '<p class="muted">Ainda não analisado. Toque em <strong>Analisar com IA</strong> para ler os resultados do laudo.</p>'}
      </section>`;
  }

  function aba(c) {
    const lista = ordenar(c.exames || []);
    return `
      <section class="card">
        <div class="secao-cabecalho">
          <h2 class="card-title">Exames bioquímicos</h2>
          <button type="button" class="btn btn-pequeno btn-primary" data-ex-novo>+ Adicionar exame</button>
        </div>
        <p class="muted small">PDF do laboratório ou foto do laudo. A IA lê os resultados e compara com a referência do próprio laboratório; você revisa antes de salvar.</p>
      </section>
      ${evolucao(lista)}
      ${lista.length ? lista.map(cartaoExame).join('') : '<div class="card vazio"><p>Nenhum exame ainda.</p></div>'}`;
  }

  // ---------------- Ações ----------------

  function adicionar(c) {
    const { modal, form: f, utils, ui, store, examesStore } = NutriDudu;
    let arquivo = null;
    modal.formulario({
      titulo: `Adicionar exame · ${c.pessoa.nome.split(' ')[0]}`,
      textoSalvar: 'Salvar exame',
      corpo: `
        <div class="campo"><label for="ex_arquivo">Arquivo do exame (PDF ou foto)</label>
          <input type="file" id="ex_arquivo" name="ex_arquivo" accept="application/pdf,image/jpeg,image/png,image/webp" data-ex-arquivo>
          <p class="campo-ajuda">Até 20 MB. Se o laudo tiver várias fotos, adicione uma por vez.</p></div>
        <div class="grade-2">
          ${f.texto('ex_data', 'Data da coleta', utils.isoDia(new Date()), { tipo: 'date' })}
          ${f.texto('ex_lab', 'Laboratório (opcional)', '', { placeholder: 'Ex.: Tommasi' })}
        </div>
        ${f.chave('ex_analisar', 'Analisar com IA ao salvar', true)}`,
      ler: (form) => ({ data: f.valor(form, 'ex_data'), laboratorio: f.valor(form, 'ex_lab'), analisar: f.marcado(form, 'ex_analisar') }),
      validar: (d) => ({ ...(arquivo ? {} : { ex_arquivo: 'Escolha o arquivo do exame.' }), ...(d.data ? {} : { ex_data: 'Informe a data da coleta.' }) }),
      salvar: async (d) => {
        const blob = await examesStore.preparar(arquivo);
        const chave = `${c.pessoa.id}/${utils.uid('exa')}.${blob.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
        await examesStore.salvar(chave, blob);
        const novo = await store.create('exames', {
          pessoaId: c.pessoa.id, dataColeta: d.data, laboratorio: d.laboratorio,
          arquivo: { chave, nome: arquivo.name, tipo: blob.type, tamanho: blob.size },
        });
        ui.toast('Exame salvo.');
        if (d.analisar) setTimeout(() => analisar(c, novo), 50);
      },
      aoAbrir: (form) => form.querySelector('[data-ex-arquivo]').addEventListener('change', (e) => { arquivo = e.target.files[0] || null; }),
    });
  }

  /** Resultado de exemplo para o modo demonstração (o servidor com IA só existe na nuvem). */
  function analiseDemonstracao() {
    return {
      laboratorio: 'Laboratório Exemplo', dataColeta: '',
      itens: [
        { nome: 'Hemoglobina', valor: '13,8', unidade: 'g/dL', referencia: '12,0 a 15,5', situacao: 'adequado', nota: '' },
        { nome: 'Ferritina', valor: '14', unidade: 'ng/mL', referencia: '15 a 150', situacao: 'abaixo', nota: 'Reserva de ferro baixa: avaliar ingestão e absorção de ferro.' },
        { nome: 'Vitamina D (25-OH)', valor: '22', unidade: 'ng/mL', referencia: '30 a 100', situacao: 'abaixo', nota: 'Insuficiente: avaliar exposição solar e suplementação.' },
        { nome: 'Vitamina B12', valor: '420', unidade: 'pg/mL', referencia: '197 a 771', situacao: 'adequado', nota: '' },
        { nome: 'Glicose em jejum', valor: '88', unidade: 'mg/dL', referencia: '70 a 99', situacao: 'adequado', nota: '' },
        { nome: 'Colesterol LDL', valor: '138', unidade: 'mg/dL', referencia: 'menor que 130', situacao: 'acima', nota: 'Rever gorduras saturadas e fibras.' },
        { nome: 'TSH', valor: '2,1', unidade: 'µUI/mL', referencia: '0,4 a 4,5', situacao: 'adequado', nota: '' },
      ],
      resumo: '- Ferritina baixa: priorizar fontes de ferro e vitamina C nas refeições.\n- Vitamina D insuficiente: avaliar suplementação.\n- LDL acima: reduzir gordura saturada e aumentar fibras.\n(Exemplo do modo demonstração: dados fictícios.)',
      em: new Date().toISOString(),
    };
  }

  async function analisar(c, exame, botao) {
    const { ui, nuvem } = NutriDudu;
    if (botao) { botao.disabled = true; botao.textContent = '⏳ Analisando…'; }
    ui.toast('Lendo o laudo com a IA. Pode levar até 1 minuto…');
    try {
      const analise = nuvem?.ativa() ? await nuvem.analisarExame(exame.id) : await new Promise((r) => setTimeout(() => r(analiseDemonstracao()), 1200));
      revisar(c, exame, analise);
    } catch (erro) {
      ui.toast(erro.message || 'Não foi possível analisar o exame.', 'erro');
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = exame.analise ? 'Analisar de novo' : '🤖 Analisar com IA'; }
    }
  }

  /** Revisão: a nutricionista confere e corrige linha por linha antes de salvar. */
  function revisar(c, exame, analise = exame.analise) {
    const { modal, store, ui, permissoes } = NutriDudu;
    const opcoes = (s) => Object.entries(SITUACOES).map(([v, x]) => `<option value="${v}"${v === s ? ' selected' : ''}>${x.icone} ${x.rotulo}</option>`).join('');
    const linha = (i = {}) => `
      <tr data-ex-linha>
        <td><input name="nome" value="${esc(i.nome)}" aria-label="Exame"><input name="nota" value="${esc(i.nota)}" placeholder="Observação (opcional)" aria-label="Observação" class="ex-nota"></td>
        <td><input name="valor" value="${esc(i.valor)}" aria-label="Resultado" class="ex-curto"> <input name="unidade" value="${esc(i.unidade)}" aria-label="Unidade" class="ex-curto"></td>
        <td><input name="referencia" value="${esc(i.referencia)}" aria-label="Referência"></td>
        <td><select name="situacao" aria-label="Situação">${opcoes(i.situacao)}</select></td>
        <td><button type="button" class="btn-icone" data-ex-tirar aria-label="Remover linha">×</button></td>
      </tr>`;
    const dlg = modal.formulario({
      titulo: 'Conferir resultados',
      largo: true,
      textoSalvar: 'Salvar resultados',
      corpo: `
        <p class="alerta alerta-aviso">Confira com o laudo antes de salvar. A IA pode errar, principalmente em fotos com pouca nitidez.</p>
        <div class="rolagem-x"><table class="tabela-clientes ex-revisao">
          <thead><tr><th>Exame</th><th>Resultado e unidade</th><th>Referência</th><th>Situação</th><th></th></tr></thead>
          <tbody data-ex-linhas>${(analise.itens || []).map(linha).join('')}</tbody>
        </table></div>
        <button type="button" class="btn btn-pequeno" data-ex-linha-nova style="margin-top:8px">+ Linha</button>
        <div class="campo" style="margin-top:14px"><label for="ex_resumo">Pontos de atenção</label>
          <textarea id="ex_resumo" name="ex_resumo" rows="5">${esc(analise.resumo)}</textarea></div>`,
      ler: (form) => ({
        itens: [...form.querySelectorAll('[data-ex-linha]')].map((tr) => Object.fromEntries(['nome', 'valor', 'unidade', 'referencia', 'situacao', 'nota'].map((k) => [k, tr.querySelector(`[name="${k}"]`).value.trim()]))).filter((i) => i.nome),
        resumo: form.querySelector('#ex_resumo').value.trim(),
      }),
      validar: (d) => (d.itens.length ? {} : { _geral: 'Mantenha pelo menos um resultado.' }),
      salvar: async (d) => {
        await store.update('exames', exame.id, {
          ...(!exame.laboratorio && analise.laboratorio ? { laboratorio: analise.laboratorio } : {}),
          ...(analise.dataColeta && !exame.dataColetaConferida ? { dataColeta: analise.dataColeta } : {}),
          analise: { itens: d.itens, resumo: d.resumo, em: analise.em || new Date().toISOString(), revisadoPor: permissoes.atual(), revisadoEm: new Date().toISOString() },
        });
        await store.create('interacoes', {
          pessoaId: exame.pessoaId, dataHora: new Date().toISOString(), tipo: 'nota', autor: permissoes.atual(), automatico: true,
          descricao: `Exames de ${NutriDudu.utils.data(analise.dataColeta || exame.dataColeta)} registrados (${d.itens.length} resultados, ${d.itens.filter((i) => ['abaixo', 'acima'].includes(i.situacao)).length} fora da referência).`,
        });
        ui.toast('Resultados salvos.');
      },
      aoAbrir: (form) => {
        form.querySelector('[data-ex-linha-nova]').addEventListener('click', () => form.querySelector('[data-ex-linhas]').insertAdjacentHTML('beforeend', linha({ situacao: 'adequado' })));
        form.addEventListener('click', (e) => { if (e.target.closest('[data-ex-tirar]')) e.target.closest('[data-ex-linha]').remove(); });
      },
    });
    dlg.classList.add('ex-modal');
  }

  async function abrirArquivo(exame) {
    const janela = window.open('', '_blank'); // abre já no toque (o Safari bloqueia depois de esperar)
    try {
      const blob = await NutriDudu.examesStore.ler(exame.arquivo.chave);
      if (!blob) throw new Error('Arquivo não encontrado.');
      const url = URL.createObjectURL(blob);
      if (janela) janela.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (erro) {
      if (janela) janela.close();
      NutriDudu.ui.toast(erro.message, 'erro');
    }
  }

  async function apagar(exame) {
    const { modal, store, examesStore, ui } = NutriDudu;
    const ok = await modal.confirmar({ titulo: 'Apagar exame?', mensagem: `Coleta de ${NutriDudu.utils.data(dataDo(exame))}: o arquivo e os resultados. Não dá para desfazer.`, textoConfirmar: 'Apagar', perigo: true });
    if (!ok) return;
    try { await examesStore.remover(exame.arquivo.chave); } catch (erro) { console.error(erro); }
    await store.remove('exames', exame.id);
    ui.toast('Exame apagado.');
  }

  function ligar(container, c) {
    container.querySelector('[data-ex-novo]')?.addEventListener('click', () => adicionar(c));
    container.querySelectorAll('[data-exame]').forEach((cartao) => {
      const exame = (c.exames || []).find((e) => e.id === cartao.dataset.exame);
      if (!exame) return;
      cartao.querySelector('[data-ex-abrir]')?.addEventListener('click', () => abrirArquivo(exame));
      cartao.querySelector('[data-ex-revisar]')?.addEventListener('click', () => revisar(c, exame));
      cartao.querySelector('[data-ex-analisar]')?.addEventListener('click', (e) => analisar(c, exame, e.currentTarget));
      cartao.querySelector('[data-ex-apagar]')?.addEventListener('click', () => apagar(exame));
    });
  }

  return { aba, ligar, SITUACOES };
})();
