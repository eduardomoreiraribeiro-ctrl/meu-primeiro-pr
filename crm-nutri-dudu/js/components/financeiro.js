// Pacotes (contratar, renovar, prorrogar, cancelar) e financeiro (cobranças,
// parcelas, baixa de pagamento, cancelamento). Usado pela ficha do cliente e
// pelo "+ Novo › Pagamento / Pacote".
window.NutriDudu = window.NutriDudu || {};

NutriDudu.financeiro = (function () {
  const somarMeses = (iso, n) => {
    const d = NutriDudu.utils.paraData(iso);
    const dia = d.getDate();
    const alvo = new Date(d.getFullYear(), d.getMonth() + n, 1);
    // 31/01 + 1 mês = 28/02 (ou 29), não 03/03.
    alvo.setDate(Math.min(dia, new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()));
    return NutriDudu.utils.isoDia(alvo);
  };
  const somarDias = (iso, n) => {
    const d = NutriDudu.utils.paraData(iso);
    d.setDate(d.getDate() + n);
    return NutriDudu.utils.isoDia(d);
  };

  /** Divide um valor em parcelas; os centavos que sobram vão para a última. */
  function dividir(valor, parcelas) {
    const centavos = Math.round(valor * 100);
    const base = Math.floor(centavos / parcelas);
    return Array.from({ length: parcelas }, (_, i) => (i === parcelas - 1 ? centavos - base * (parcelas - 1) : base) / 100);
  }

  async function registrar(pessoaId, descricao, tipo) {
    await NutriDudu.store.create('interacoes', {
      pessoaId, dataHora: new Date().toISOString(), tipo, descricao, autor: NutriDudu.permissoes.atual(), automatico: true,
    });
  }

  async function opcoesPessoas() {
    const pessoas = await NutriDudu.store.list('pessoas', (p) => p.etapa !== 'perdido');
    return pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => [p.id, `${p.nome} — ${p.telefone}${p.status === 'lead' ? ' (lead)' : ''}`]);
  }

  // ---------------- Pacotes ----------------

  /** Contratar (ou renovar) um pacote. Sem `pessoa`, o formulário pede o paciente. */
  async function contratarPacote({ pessoa = null, renovarDe = null, servicoId = null } = {}) {
    const { store, form: f, modal, ui, utils, config } = NutriDudu;
    const servicos = (await store.list('servicos', (s) => s.categoria === 'pacote' && s.ativo))
      .sort((a, b) => a.qtdConsultas - b.qtdConsultas);
    if (!servicos.length) {
      ui.toast('Cadastre um serviço do tipo pacote em Serviços.', 'info');
      return;
    }
    const hoje = utils.isoDia(new Date());
    const inicial = servicos.find((s) => s.id === (servicoId || renovarDe?.servicoId)) || servicos[0];

    const corpo = `
      ${pessoa ? '' : f.selecao('pessoaId', 'Paciente', await opcoesPessoas(), '', { obrigatorio: true, vazio: 'Escolha o paciente…' })}
      ${f.selecao('servicoId', 'Pacote', servicos.map((s) => [s.id, `${s.nome} — ${s.qtdConsultas} consultas, ${utils.moeda(s.valor)}`]), inicial.id, { obrigatorio: true })}
      <div class="grade-2">
        ${f.texto('inicio', 'Início', hoje, { tipo: 'date', obrigatorio: true })}
        ${f.texto('validade', 'Válido até', '', { tipo: 'date', obrigatorio: true, ajuda: 'Sugerida pela validade do serviço.' })}
        ${f.texto('valor', 'Valor negociado (R$)', inicial.valor, { tipo: 'number', obrigatorio: true, atributos: 'step="0.01" min="0"' })}
        ${f.texto('parcelas', 'Parcelas', 1, { tipo: 'number', obrigatorio: true, atributos: 'step="1" min="1" max="24"' })}
        ${f.texto('primeiroVencimento', '1º vencimento', hoje, { tipo: 'date', obrigatorio: true, ajuda: 'As demais vencem no mesmo dia dos meses seguintes.' })}
        ${f.selecao('formaPagamento', 'Forma de pagamento', config.FORMAS_PAGAMENTO, 'pix')}
      </div>
      ${f.chave('primeiraPaga', '1ª parcela paga agora', true)}
      <p class="campo-ajuda" data-resumo-parcelas></p>`;

    modal.formulario({
      titulo: renovarDe ? 'Renovar pacote' : 'Contratar pacote',
      corpo,
      textoSalvar: renovarDe ? 'Renovar' : 'Contratar',
      ler: (form) => ({
        pessoaId: pessoa?.id || f.valor(form, 'pessoaId'),
        servicoId: f.valor(form, 'servicoId'),
        inicio: f.valor(form, 'inicio'),
        validade: f.valor(form, 'validade'),
        valor: f.numero(form, 'valor'),
        parcelas: f.numero(form, 'parcelas'),
        primeiroVencimento: f.valor(form, 'primeiroVencimento'),
        formaPagamento: f.valor(form, 'formaPagamento'),
        primeiraPaga: f.marcado(form, 'primeiraPaga'),
      }),
      validar: (d) => {
        const erros = {};
        if (!d.pessoaId) erros.pessoaId = 'Escolha o paciente.';
        if (!d.inicio) erros.inicio = 'Informe o início.';
        if (!d.validade) erros.validade = 'Informe a validade.';
        else if (d.inicio && d.validade <= d.inicio) erros.validade = 'A validade precisa ser depois do início.';
        if (d.valor === null || d.valor < 0) erros.valor = 'Informe o valor.';
        if (!Number.isInteger(d.parcelas) || d.parcelas < 1 || d.parcelas > 24) erros.parcelas = 'De 1 a 24 parcelas.';
        if (!d.primeiroVencimento) erros.primeiroVencimento = 'Informe o vencimento.';
        if (d.primeiraPaga && d.primeiroVencimento > hoje) erros.primeiroVencimento = 'Parcela paga agora não pode vencer no futuro — ajuste a data ou desmarque "paga agora".';
        return erros;
      },
      salvar: async (d) => {
        const servico = servicos.find((s) => s.id === d.servicoId);
        const alvo = pessoa || await store.get('pessoas', d.pessoaId);
        const pacote = await store.create('pacotes', {
          pessoaId: alvo.id, servicoId: servico.id, inicio: d.inicio, validade: d.validade,
          qtdConsultas: servico.qtdConsultas, frequencia: servico.frequencia, valorNegociado: d.valor,
          parcelas: d.parcelas, status: 'ativo', renovacaoDe: renovarDe?.id || null,
        });
        const valores = dividir(d.valor, d.parcelas);
        for (let i = 0; i < d.parcelas; i++) {
          const paga = i === 0 && d.primeiraPaga;
          await store.create('lancamentos', {
            pessoaId: alvo.id, servicoId: servico.id, pacoteId: pacote.id, consultaId: null,
            profissionalId: alvo.profissionalId || null,
            descricao: d.parcelas > 1 ? `${servico.nome} — parcela ${i + 1}/${d.parcelas}` : servico.nome,
            valor: valores[i], desconto: 0, vencimento: somarMeses(d.primeiroVencimento, i),
            status: paga ? 'pago' : 'pendente', dataPagamento: paga ? hoje : null, formaPagamento: paga ? d.formaPagamento : null,
          });
        }
        await registrar(alvo.id, `${renovarDe ? 'Renovou' : 'Contratou'} ${servico.nome}: ${utils.moeda(d.valor)}${d.parcelas > 1 ? ` em ${d.parcelas} parcelas` : ''}, válido até ${utils.data(d.validade)}.`, 'pacote');

        // Funis: lead que contrata vira cliente; cliente que renova vai para "Renovado".
        const agora = new Date().toISOString();
        if (alvo.status === 'lead') {
          await store.update('pessoas', alvo.id, { status: 'ativo', clienteDesde: alvo.clienteDesde || hoje, funil: 'acompanhamento', etapa: 'inicio', etapaDesde: agora });
          await registrar(alvo.id, 'Fechou com a clínica: passou a cliente ativo, no início do tratamento.', 'etapa');
        } else if (alvo.funil === 'acompanhamento' && ['renovacao', 'encerrado', 'retorno'].includes(alvo.etapa)) {
          await store.update('pessoas', alvo.id, { etapa: 'renovado', etapaDesde: agora, status: 'ativo' });
          await registrar(alvo.id, 'Movido(a) para "Renovado".', 'etapa');
        }
        ui.toast(renovarDe ? 'Pacote renovado.' : 'Pacote contratado.');
      },
      aoAbrir: (form) => {
        const resumo = form.querySelector('[data-resumo-parcelas]');
        const atualizar = (origem) => {
          const servico = servicos.find((s) => s.id === f.valor(form, 'servicoId'));
          if (origem === 'servicoId') form.elements.valor.value = servico.valor;
          if (['servicoId', 'inicio', undefined].includes(origem) && f.valor(form, 'inicio')) {
            form.elements.validade.value = somarDias(f.valor(form, 'inicio'), servico.validadeDias || 90);
          }
          const valor = f.numero(form, 'valor');
          const parcelas = f.numero(form, 'parcelas');
          resumo.textContent = valor > 0 && parcelas >= 1 && Number.isInteger(parcelas)
            ? `${parcelas}× de ${utils.moeda(dividir(valor, parcelas)[0])} · ${utils.moeda(valor / servico.qtdConsultas)} por consulta`
            : '';
        };
        form.addEventListener('change', (e) => atualizar(e.target.name));
        form.addEventListener('input', (e) => { if (['valor', 'parcelas'].includes(e.target.name)) atualizar(e.target.name); });
        atualizar();
      },
    });
  }

  function prorrogar(pacote, nomeServico) {
    const { form: f, modal, store, ui, utils } = NutriDudu;
    modal.formulario({
      titulo: 'Prorrogar validade',
      corpo: `
        <p>${utils.escapeHtml(nomeServico)}: hoje vale até ${utils.data(pacote.validade)}.</p>
        ${f.texto('validade', 'Nova validade', somarDias(pacote.validade, 30), { tipo: 'date', obrigatorio: true })}
        ${f.texto('motivo', 'Motivo', '', { placeholder: 'Ex.: viagem, licença médica' })}`,
      textoSalvar: 'Prorrogar',
      ler: (form) => ({ validade: f.valor(form, 'validade'), motivo: f.valor(form, 'motivo') }),
      validar: (d) => (d.validade > pacote.validade ? {} : { validade: 'A nova validade precisa ser depois da atual.' }),
      salvar: async (d) => {
        await store.update('pacotes', pacote.id, { validade: d.validade, status: 'ativo' });
        await registrar(pacote.pessoaId, `Pacote ${nomeServico} prorrogado de ${utils.data(pacote.validade)} para ${utils.data(d.validade)}${d.motivo ? ` (${d.motivo})` : ''}.`, 'pacote');
        ui.toast('Validade prorrogada.');
      },
    });
  }

  function cancelarPacote(pacote, nomeServico) {
    const { form: f, modal, store, ui } = NutriDudu;
    modal.formulario({
      titulo: 'Cancelar pacote',
      corpo: `
        <p>Cancelar ${NutriDudu.utils.escapeHtml(nomeServico)}? As consultas já feitas continuam no histórico.</p>
        ${f.texto('motivo', 'Motivo', '', { obrigatorio: true })}
        ${f.chave('cancelarParcelas', 'Cancelar também as parcelas em aberto', true)}`,
      textoSalvar: 'Cancelar pacote',
      ler: (form) => ({ motivo: f.valor(form, 'motivo'), cancelarParcelas: f.marcado(form, 'cancelarParcelas') }),
      validar: (d) => (d.motivo ? {} : { motivo: 'Informe o motivo.' }),
      salvar: async (d) => {
        await store.update('pacotes', pacote.id, { status: 'cancelado', motivoCancelamento: d.motivo });
        if (d.cancelarParcelas) {
          const abertas = await store.list('lancamentos', (l) => l.pacoteId === pacote.id && l.status === 'pendente');
          for (const l of abertas) await store.update('lancamentos', l.id, { status: 'cancelado' });
        }
        await registrar(pacote.pessoaId, `Pacote ${nomeServico} cancelado: ${d.motivo}.`, 'pacote');
        ui.toast('Pacote cancelado.');
      },
    });
  }

  // ---------------- Lançamentos ----------------

  async function novoLancamento({ pessoa = null, servicoId = null } = {}) {
    const { store, form: f, modal, ui, utils, config } = NutriDudu;
    const servicos = await store.list('servicos', (s) => s.ativo);
    const preServico = servicos.find((s) => s.id === servicoId) || null;
    const hoje = utils.isoDia(new Date());
    const corpo = `
      ${pessoa ? '' : f.selecao('pessoaId', 'Paciente', await opcoesPessoas(), '', { obrigatorio: true, vazio: 'Escolha o paciente…' })}
      ${f.selecao('servicoId', 'Serviço (opcional)', servicos.map((s) => [s.id, s.nome]), preServico?.id || '', { vazio: 'Nenhum' })}
      ${f.texto('descricao', 'Descrição', preServico?.nome || '', { obrigatorio: true, placeholder: 'Ex.: Consulta inicial' })}
      <div class="grade-3">
        ${f.texto('valor', 'Valor (R$)', preServico?.valor ?? '', { tipo: 'number', obrigatorio: true, atributos: 'step="0.01" min="0"' })}
        ${f.texto('desconto', 'Desconto (R$)', '0', { tipo: 'number', atributos: 'step="0.01" min="0"' })}
        ${f.texto('vencimento', 'Vencimento', hoje, { tipo: 'date', obrigatorio: true })}
      </div>
      ${f.chave('pago', 'Já foi pago', false)}
      <div class="grade-2" data-so-pago hidden>
        ${f.selecao('formaPagamento', 'Forma de pagamento', config.FORMAS_PAGAMENTO, 'pix')}
        ${f.texto('dataPagamento', 'Data do pagamento', hoje, { tipo: 'date' })}
      </div>`;
    modal.formulario({
      titulo: 'Nova cobrança',
      corpo,
      ler: (form) => ({
        pessoaId: pessoa?.id || f.valor(form, 'pessoaId'),
        servicoId: f.valor(form, 'servicoId') || null,
        descricao: f.valor(form, 'descricao'),
        valor: f.numero(form, 'valor'),
        desconto: f.numero(form, 'desconto') || 0,
        vencimento: f.valor(form, 'vencimento'),
        pago: f.marcado(form, 'pago'),
        formaPagamento: f.valor(form, 'formaPagamento'),
        dataPagamento: f.valor(form, 'dataPagamento'),
      }),
      validar: (d) => {
        const erros = {};
        if (!d.pessoaId) erros.pessoaId = 'Escolha o paciente.';
        if (!d.descricao) erros.descricao = 'Informe a descrição.';
        if (d.valor === null || d.valor <= 0) erros.valor = 'Informe um valor maior que zero.';
        else if (d.desconto < 0 || d.desconto > d.valor) erros.desconto = 'O desconto não pode passar do valor.';
        if (!d.vencimento) erros.vencimento = 'Informe o vencimento.';
        if (d.pago && (!d.dataPagamento || d.dataPagamento > hoje)) erros.dataPagamento = 'Informe uma data de pagamento até hoje.';
        return erros;
      },
      salvar: async (d) => {
        const alvo = pessoa || await store.get('pessoas', d.pessoaId);
        await store.create('lancamentos', {
          pessoaId: alvo.id, servicoId: d.servicoId, consultaId: null, pacoteId: null, profissionalId: alvo.profissionalId || null,
          descricao: d.descricao, valor: d.valor, desconto: d.desconto, vencimento: d.vencimento,
          status: d.pago ? 'pago' : 'pendente', dataPagamento: d.pago ? d.dataPagamento : null, formaPagamento: d.pago ? d.formaPagamento : null,
        });
        await registrar(alvo.id, `Cobrança lançada: ${d.descricao}, ${utils.moeda(d.valor - d.desconto)}${d.pago ? ' (paga)' : `, vence ${utils.data(d.vencimento)}`}.`, 'pagamento');
        ui.toast('Cobrança lançada.');
      },
      aoAbrir: (form) => {
        form.addEventListener('change', (e) => {
          if (e.target.name === 'pago') form.querySelector('[data-so-pago]').hidden = !e.target.checked;
          if (e.target.name === 'servicoId' && e.target.value) {
            const s = servicos.find((x) => x.id === e.target.value);
            if (!f.valor(form, 'descricao')) form.elements.descricao.value = s.nome;
            if (!f.valor(form, 'valor')) form.elements.valor.value = s.valor;
          }
        });
      },
    });
  }

  function darBaixa(lancamento) {
    const { form: f, modal, store, ui, utils, config, calculos } = NutriDudu;
    const hoje = utils.isoDia(new Date());
    modal.formulario({
      titulo: 'Registrar pagamento',
      corpo: `
        <p>${utils.escapeHtml(lancamento.descricao)} · <strong>${utils.moeda(calculos.valorLiquido(lancamento))}</strong> · vencimento ${utils.data(lancamento.vencimento)}</p>
        <div class="grade-2">
          ${f.selecao('formaPagamento', 'Forma de pagamento', config.FORMAS_PAGAMENTO, 'pix')}
          ${f.texto('dataPagamento', 'Data do pagamento', hoje, { tipo: 'date', obrigatorio: true })}
        </div>`,
      textoSalvar: 'Marcar como pago',
      ler: (form) => ({ formaPagamento: f.valor(form, 'formaPagamento'), dataPagamento: f.valor(form, 'dataPagamento') }),
      validar: (d) => (d.dataPagamento && d.dataPagamento <= hoje ? {} : { dataPagamento: 'Informe uma data até hoje.' }),
      salvar: async (d) => {
        await store.update('lancamentos', lancamento.id, { status: 'pago', ...d });
        await registrar(lancamento.pessoaId, `Pagamento recebido: ${lancamento.descricao}, ${utils.moeda(calculos.valorLiquido(lancamento))} (${config.FORMAS_PAGAMENTO[d.formaPagamento]}).`, 'pagamento');
        ui.toast('Pagamento registrado.');
      },
    });
  }

  async function cancelarLancamento(lancamento) {
    const { modal, store, ui, utils, calculos } = NutriDudu;
    const ok = await modal.confirmar({
      titulo: 'Cancelar cobrança?',
      mensagem: `${lancamento.descricao} · ${utils.moeda(calculos.valorLiquido(lancamento))}. Ela deixa de contar como valor a receber.`,
      textoConfirmar: 'Cancelar cobrança',
      perigo: true,
    });
    if (!ok) return;
    await store.update('lancamentos', lancamento.id, { status: 'cancelado' });
    await registrar(lancamento.pessoaId, `Cobrança cancelada: ${lancamento.descricao}.`, 'pagamento');
    ui.toast('Cobrança cancelada.');
  }

  return { dividir, somarMeses, contratarPacote, prorrogar, cancelarPacote, novoLancamento, darBaixa, cancelarLancamento };
})();
