// "Cadastrar planos atuais": passo a passo, um paciente por vez, para lançar o plano de quem
// já estava em acompanhamento antes do sistema. As consultas que já estão no sistema desde o
// início do plano entram no plano sozinhas (o saldo fica certo sem contar à mão).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.planosAtuais = (function () {
  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');
  const STATUS_CONTA = ['realizada', 'agendada', 'confirmada'];

  async function carregar() {
    const { store } = NutriDudu;
    const [pessoas, pacotes, consultas, servicos] = await Promise.all([
      store.list('pessoas'), store.list('pacotes'), store.list('consultas'), store.list('servicos'),
    ]);
    return { pessoas, pacotes, consultas, servicos };
  }

  /** Quem ainda precisa de plano: ativo, sem plano registrado e não marcado como avulso. */
  async function pendentes(pulados = new Set()) {
    const dados = await carregar();
    return NutriDudu.planosClientes.classificar(dados)
      .filter((l) => l.grupo === 'semPlano' && !l.pessoa.atendeAvulso && !pulados.has(l.pessoa.id))
      .map((l) => l.pessoa)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + dias); return NutriDudu.utils.isoDia(d); };

  /** Consultas da pessoa (desde o início, ainda sem plano) que vão contar no plano, em ordem. */
  // Exames e serviços avulsos (ex.: bioimpedância) não gastam consulta do plano.
  function consultasDoPlano(consultas, pessoaId, inicio, limite, servicoPor = {}) {
    return consultas
      .filter((c) => c.pessoaId === pessoaId && !c.pacoteId && STATUS_CONTA.includes(c.status) && NutriDudu.utils.isoDia(c.inicio) >= inicio)
      .filter((c) => !['avaliacao', 'outro'].includes(servicoPor[c.servicoId]?.categoria))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, Math.max(0, limite));
  }

  async function abrir({ pulados = new Set(), feitos = 0 } = {}) {
    const { store, form: f, modal, ui, utils, permissoes } = NutriDudu;
    if (!permissoes.pode('darBaixaPagamento') && !permissoes.pode('editarRegras')) { ui.toast('Seu perfil não pode cadastrar planos.', 'erro'); return; }
    const fila = await pendentes(pulados);
    if (!fila.length) {
      ui.toast(feitos ? `Pronto! ${feitos} ${feitos === 1 ? 'plano cadastrado' : 'planos cadastrados'}. 🎉` : 'Todos os clientes ativos já têm plano (ou estão como avulsos).');
      NutriDudu.recarregarPagina?.();
      return;
    }
    const pessoa = fila[0];
    const { consultas, servicos: todos } = await carregar();
    const servicoPor = Object.fromEntries(todos.map((x) => [x.id, x]));
    const servicos = todos.filter((s) => s.categoria === 'pacote' && s.ativo).sort((a, b) => a.qtdConsultas - b.qtdConsultas);
    if (!servicos.length) { ui.toast('Cadastre um serviço do tipo pacote em Serviços.', 'info'); return; }
    const minhas = consultas.filter((c) => c.pessoaId === pessoa.id && c.status !== 'cancelada').sort((a, b) => a.inicio.localeCompare(b.inicio));
    const realizadas = minhas.filter((c) => c.status === 'realizada');
    const primeira = [...realizadas].reverse().find((c) => c.tipo === 'primeira') || realizadas[0];
    const hoje = utils.isoDia(new Date());
    const inicioSugerido = primeira ? utils.isoDia(primeira.inicio) : hoje;
    const opcoesPacote = [...servicos.map((s) => [s.id, `${s.nome} (${s.qtdConsultas} consultas${s.semPrazo ? '' : `, ${s.validadeDias} dias`})`]),
      ['avulso', 'Não tem plano: atende avulso'], ['pular', 'Decidir depois (pular por agora)']];

    modal.formulario({
      titulo: `Plano atual de ${pessoa.nome.split(' ')[0]} · ${feitos + 1} de ${feitos + fila.length}`,
      textoSalvar: 'Salvar e ir pro próximo',
      corpo: `
        <p class="small"><strong>${esc(pessoa.nome)}</strong>${pessoa.permuta ? ' · permuta' : ''}<span class="muted"> · ${realizadas.length ? `${realizadas.length} consulta(s) no sistema, a última em ${utils.data(realizadas[realizadas.length - 1].inicio)}` : 'nenhuma consulta registrada no sistema'}</span></p>
        ${f.selecao('servicoId', 'Qual plano a pessoa tem hoje?', opcoesPacote, servicos[0].id, { obrigatorio: true })}
        <div data-pa-plano>
          <div class="grade-2">
            ${f.texto('inicio', 'Começou em', inicioSugerido, { tipo: 'date', obrigatorio: true, ajuda: 'Data da primeira consulta deste plano.' })}
            ${f.texto('validade', 'Válido até', '', { tipo: 'date', ajuda: 'Calculado pelo plano. Mude se combinou outra data.' })}
          </div>
          ${f.texto('usadasAntes', 'Consultas feitas ANTES do sistema', 0, { tipo: 'number', atributos: 'step="1" min="0" max="99"', ajuda: 'Só as que não estão registradas aqui.' })}
          <p class="campo-ajuda" data-pa-achadas></p>
          ${f.selecao('pagamento', 'Pagamento', { pago: 'Já está pago (lança como pago)', pendente: 'Ainda tem valor a receber (lança pendente)', fora: 'Não lançar no financeiro' }, pessoa.permuta ? 'fora' : 'pago')}
          <div data-pa-valor>${f.texto('valor', 'Valor (R$)', servicos[0].valor, { tipo: 'number', atributos: 'step="0.01" min="0"', ajuda: 'O valor que a pessoa pagou (ou vai pagar) pelo plano.' })}</div>
        </div>`,
      aoAbrir: (form) => {
        const campo = (n) => form.querySelector(`[name="${n}"]`);
        let validadeMexida = false;
        campo('validade').addEventListener('input', () => { validadeMexida = true; });
        const atualizar = (trocouPlano = false) => {
          const id = campo('servicoId').value;
          const s = servicos.find((x) => x.id === id);
          form.querySelector('[data-pa-plano]').hidden = !s;
          if (!s) return;
          if (trocouPlano) campo('valor').value = s.valor;
          if (!validadeMexida && campo('inicio').value) campo('validade').value = s.semPrazo ? '' : somarDias(campo('inicio').value, Number(s.validadeDias) || 90);
          campo('validade').closest('.campo').hidden = Boolean(s.semPrazo);
          form.querySelector('[data-pa-valor]').hidden = campo('pagamento').value === 'fora';
          const antes = Math.max(0, Number(campo('usadasAntes').value) || 0);
          const achadas = campo('inicio').value ? consultasDoPlano(consultas, pessoa.id, campo('inicio').value, s.qtdConsultas - antes, servicoPor) : [];
          const feitas = achadas.filter((c) => c.status === 'realizada').length;
          const marcadas = achadas.length - feitas;
          const usadas = antes + feitas;
          form.querySelector('[data-pa-achadas]').innerHTML = `✓ ${feitas ? `${feitas} consulta(s) feita(s) no sistema desde essa data entram no plano` : 'Nenhuma consulta feita no sistema desde essa data'}${marcadas ? ` + ${marcadas} já marcada(s)` : ''}.
            <strong>Fica: ${Math.min(usadas, s.qtdConsultas)} de ${s.qtdConsultas} usadas${s.qtdConsultas - usadas - marcadas > 0 ? `, ${s.qtdConsultas - usadas - marcadas} pra marcar` : ''}.</strong>`;
        };
        campo('servicoId').addEventListener('change', () => atualizar(true));
        ['inicio', 'usadasAntes', 'pagamento'].forEach((n) => campo(n).addEventListener('input', () => atualizar()));
        campo('pagamento').addEventListener('change', () => atualizar());
        atualizar();
      },
      ler: (form) => ({
        servicoId: f.valor(form, 'servicoId'), inicio: f.valor(form, 'inicio'), validade: f.valor(form, 'validade'),
        usadasAntes: f.numero(form, 'usadasAntes') ?? 0, pagamento: f.valor(form, 'pagamento'), valor: f.numero(form, 'valor'),
      }),
      validar: (d) => {
        if (d.servicoId === 'avulso' || d.servicoId === 'pular') return {};
        const erros = {};
        const s = servicos.find((x) => x.id === d.servicoId);
        if (!d.inicio) erros.inicio = 'Informe quando começou.';
        else if (d.inicio > hoje) erros.inicio = 'Para um plano que ainda vai começar, use "Contratar plano".';
        if (!s.semPrazo && d.validade && d.inicio && d.validade <= d.inicio) erros.validade = 'Precisa ser depois do início.';
        if (!Number.isInteger(d.usadasAntes) || d.usadasAntes < 0 || d.usadasAntes >= s.qtdConsultas) erros.usadasAntes = `De 0 a ${s.qtdConsultas - 1}.`;
        if (d.pagamento !== 'fora' && (d.valor === null || d.valor < 0 || d.valor > 100000)) erros.valor = 'Informe o valor.';
        return erros;
      },
      salvar: async (d) => {
        const agora = new Date().toISOString();
        if (d.servicoId === 'pular') { pulados.add(pessoa.id); setTimeout(() => abrir({ pulados, feitos }), 60); return; }
        if (d.servicoId === 'avulso') {
          await store.update('pessoas', pessoa.id, { atendeAvulso: true });
          await store.create('interacoes', { pessoaId: pessoa.id, dataHora: agora, tipo: 'nota', autor: permissoes.atual(), automatico: true, descricao: 'Marcado(a) como atendimento avulso (sem plano).' });
          setTimeout(() => abrir({ pulados, feitos }), 60);
          return;
        }
        const s = servicos.find((x) => x.id === d.servicoId);
        const validade = s.semPrazo ? null : (d.validade || somarDias(d.inicio, Number(s.validadeDias) || 90));
        const pacote = await store.create('pacotes', {
          pessoaId: pessoa.id, servicoId: s.id, inicio: d.inicio, validade, semPrazo: Boolean(s.semPrazo),
          qtdConsultas: s.qtdConsultas, frequencia: s.frequencia, valorNegociado: d.pagamento === 'fora' ? 0 : d.valor,
          parcelas: 1, status: 'ativo', renovacaoDe: null, usadasAntes: d.usadasAntes || 0, permuta: Boolean(pessoa.permuta),
          cadastroRetroativo: true,
        });
        const ligar = consultasDoPlano(await store.list('consultas'), pessoa.id, d.inicio, s.qtdConsultas - (d.usadasAntes || 0), servicoPor);
        for (const c of ligar) await store.update('consultas', c.id, { pacoteId: pacote.id });
        if (d.pagamento !== 'fora' && d.valor > 0) {
          await store.create('lancamentos', {
            pessoaId: pessoa.id, servicoId: s.id, pacoteId: pacote.id, consultaId: null, profissionalId: pessoa.profissionalId || null,
            descricao: s.nome, valor: d.valor, desconto: 0, vencimento: d.pagamento === 'pago' ? d.inicio : hoje,
            status: d.pagamento === 'pago' ? 'pago' : 'pendente', dataPagamento: d.pagamento === 'pago' ? d.inicio : null, formaPagamento: null,
          });
        }
        await store.create('interacoes', {
          pessoaId: pessoa.id, dataHora: agora, tipo: 'pacote', autor: permissoes.atual(), automatico: true,
          descricao: `Plano atual cadastrado: ${s.nome}, desde ${utils.data(d.inicio)}${validade ? `, válido até ${utils.data(validade)}` : ''}${d.usadasAntes ? ` (${d.usadasAntes} consulta(s) antes do sistema)` : ''}${ligar.length ? `; ${ligar.length} consulta(s) do sistema ligadas ao plano` : ''}.`,
        });
        setTimeout(() => abrir({ pulados, feitos: feitos + 1 }), 60);
      },
    });
  }

  return { abrir, pendentes };
})();
