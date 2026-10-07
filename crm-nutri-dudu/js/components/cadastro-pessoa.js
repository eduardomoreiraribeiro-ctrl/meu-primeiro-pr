// Cadastro e edição de lead/cliente. Usado pelo "+ Novo", pela página de
// Clientes e pela ficha (e, nas próximas fases, pelo Kanban e pela agenda).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.cadastroPessoa = (function () {
  const TIPOS = { lead: 'Lead', cliente: 'Cliente' };

  /** Regras do cadastro. `pessoas` = todos os cadastros (para checar duplicados). */
  function validar(d, pessoas) {
    const { utils } = NutriDudu;
    const erros = {};
    const outros = pessoas.filter((p) => p.id !== d.id);

    if (d.nome.length < 3) erros.nome = 'Informe o nome completo.';
    else if (d.nome.length > 100) erros.nome = 'Use no máximo 100 caracteres.';

    if (!utils.telefoneValido(d.telefone)) erros.telefone = 'Informe o telefone com DDD, ex.: (11) 91234-5678.';
    else {
      const mesmo = outros.find((p) => utils.soDigitos(p.telefone) === utils.soDigitos(d.telefone));
      if (mesmo) erros.telefone = `Este telefone já está cadastrado para ${mesmo.nome}.`;
    }

    if (d.email && !utils.emailValido(d.email)) erros.email = 'E-mail inválido.';

    if (d.dataNascimento) {
      const nasc = utils.paraData(d.dataNascimento);
      const idade = utils.idade(d.dataNascimento);
      if (Number.isNaN(nasc.getTime()) || nasc > new Date()) erros.dataNascimento = 'Data de nascimento inválida.';
      else if (idade > 120) erros.dataNascimento = 'Confira o ano de nascimento.';
    }

    if (d.cpf) {
      if (!utils.cpfValido(d.cpf)) erros.cpf = 'CPF inválido — confira os números.';
      else {
        const mesmo = outros.find((p) => p.cpf && utils.soDigitos(p.cpf) === utils.soDigitos(d.cpf));
        if (mesmo) erros.cpf = `Este CPF já está cadastrado para ${mesmo.nome}.`;
      }
    }

    if (!d.origem) erros.origem = 'Como a pessoa conheceu a clínica?';
    if (d.origem === 'indicacao') {
      if (!d.indicadoPorId) erros.indicadoPorId = 'Escolha quem indicou.';
      else if (d.indicadoPorId === d.id) erros.indicadoPorId = 'A pessoa não pode indicar a si mesma.';
    }

    if (d.retornoDias !== null && (!Number.isInteger(d.retornoDias) || d.retornoDias < 7 || d.retornoDias > 365)) {
      erros.retornoDias = 'Use um número inteiro entre 7 e 365, ou deixe em branco para usar o padrão.';
    }
    return erros;
  }

  function ler(form, id) {
    const f = NutriDudu.form;
    const origem = f.valor(form, 'origem');
    return {
      id,
      tipo: f.valor(form, 'tipo') || null,
      nome: f.valor(form, 'nome').replace(/\s+/g, ' '),
      telefone: NutriDudu.utils.formatarTelefone(f.valor(form, 'telefone')),
      origem,
      indicadoPorId: origem === 'indicacao' ? (f.valor(form, 'indicadoPorId') || null) : null,
      objetivo: f.valor(form, 'objetivo') || null,
      email: f.valor(form, 'email').toLowerCase(),
      dataNascimento: f.valor(form, 'dataNascimento') || null,
      sexo: f.valor(form, 'sexo') || null,
      cpf: f.valor(form, 'cpf') ? NutriDudu.utils.formatarCpf(f.valor(form, 'cpf')) : '',
      cidade: f.valor(form, 'cidade'),
      endereco: f.valor(form, 'endereco'),
      profissionalId: f.valor(form, 'profissionalId') || null,
      servicoInteresseId: f.valor(form, 'servicoInteresseId') || null,
      retornoDias: f.numero(form, 'retornoDias'),
      tags: f.valor(form, 'tags').split(',').map((t) => t.trim()).filter(Boolean)
        .filter((t, i, todas) => todas.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i),
      observacoes: f.valor(form, 'observacoes'),
      consentimentos: {
        saude: f.marcado(form, 'consSaude'),
        whatsapp: f.marcado(form, 'consWhatsapp'),
        fotos: f.marcado(form, 'consFotos'),
        divulgacao: f.marcado(form, 'consDivulgacao'),
      },
    };
  }

  /**
   * Abre o formulário.
   * opcoes.tipo: 'lead' | 'cliente' (cadastro novo); opcoes.pessoa: edição.
   * opcoes.aoSalvar(pessoa): chamado depois de gravar.
   */
  async function abrir({ tipo = 'lead', pessoa = null, aoSalvar } = {}) {
    const { store, form: f, modal, config, ui, utils, permissoes } = NutriDudu;
    const [pessoas, profissionais, servicos] = await Promise.all([
      store.list('pessoas'), store.list('profissionais'), store.list('servicos'),
    ]);
    const novo = !pessoa;
    const p = pessoa || {
      nome: '', telefone: '', origem: '', indicadoPorId: null, objetivo: '', email: '', dataNascimento: '',
      sexo: '', cpf: '', cidade: '', endereco: '', retornoDias: null, tags: [], observacoes: '',
      profissionalId: profissionais.filter((x) => x.ativo).length === 1 ? profissionais.find((x) => x.ativo).id : '',
      servicoInteresseId: '', consentimentos: { saude: false, whatsapp: false, fotos: false, divulgacao: false },
    };

    const indicadores = pessoas
      .filter((x) => x.id !== p.id && x.status !== 'lead')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((x) => [x.id, `${x.nome} — ${x.telefone}`]);
    const profs = profissionais.filter((x) => x.ativo || x.id === p.profissionalId).map((x) => [x.id, x.nome]);
    const servs = servicos.filter((s) => s.ativo || s.id === p.servicoInteresseId).map((s) => [s.id, s.nome]);
    const cons = p.consentimentos || {};

    const corpo = `
      ${novo ? `
        <div class="campo">
          <span class="rotulo-grupo">Cadastrar como</span>
          <div class="segmentos segmentos-form" role="radiogroup" aria-label="Cadastrar como">
            ${Object.entries(TIPOS).map(([v, r]) => `
              <label class="segmento-radio"><input type="radio" name="tipo" value="${v}"${v === tipo ? ' checked' : ''}><span>${r}</span></label>`).join('')}
          </div>
          <p class="campo-ajuda" data-ajuda-tipo></p>
        </div>` : ''}
      ${f.texto('nome', 'Nome completo', p.nome, { obrigatorio: true, atributos: 'maxlength="100" autocomplete="off"' })}
      <div class="grade-2">
        ${f.texto('telefone', 'Telefone / WhatsApp', p.telefone, { tipo: 'tel', obrigatorio: true, placeholder: '(11) 91234-5678', atributos: 'inputmode="tel"' })}
        ${f.selecao('objetivo', 'Objetivo', config.OBJETIVOS, p.objetivo, { vazio: 'Não informado' })}
        ${f.selecao('origem', 'Como conheceu a clínica', config.ORIGENS, p.origem, { obrigatorio: true, vazio: 'Escolha…' })}
        <div data-indicacao>
          ${f.selecao('indicadoPorId', 'Indicado(a) por', indicadores, p.indicadoPorId, { obrigatorio: true, vazio: 'Escolha o cliente…' })}
        </div>
      </div>

      <details class="mais-dados"${novo ? '' : ' open'}>
        <summary>Mais dados${novo ? ' (opcional)' : ''}</summary>
        <div class="grade-2">
          ${f.texto('email', 'E-mail', p.email, { tipo: 'email', atributos: 'autocomplete="off"' })}
          ${f.texto('dataNascimento', 'Data de nascimento', p.dataNascimento, { tipo: 'date' })}
          ${f.selecao('sexo', 'Sexo', [['F', 'Feminino'], ['M', 'Masculino']], p.sexo, { vazio: 'Não informado', ajuda: 'Usado nas fórmulas de % de gordura.' })}
          ${f.texto('cpf', 'CPF', p.cpf, { placeholder: '000.000.000-00', atributos: 'inputmode="numeric"' })}
          ${f.texto('cidade', 'Cidade', p.cidade)}
          ${f.texto('endereco', 'Endereço', p.endereco)}
          ${f.selecao('profissionalId', 'Profissional responsável', profs, p.profissionalId, { vazio: 'A definir' })}
          ${f.selecao('servicoInteresseId', 'Serviço de interesse', servs, p.servicoInteresseId, { vazio: 'Nenhum' })}
          ${f.texto('retornoDias', 'Retorno a cada (dias)', p.retornoDias ?? '', { tipo: 'number', atributos: 'min="7" max="365" step="1"', placeholder: 'Padrão da clínica', ajuda: 'Deixe em branco para usar o prazo padrão das Configurações.' })}
          ${f.texto('tags', 'Etiquetas', (p.tags || []).join(', '), { placeholder: 'Ex.: VIP, gestante', ajuda: 'Separe por vírgula.' })}
        </div>
        ${f.areaTexto('observacoes', 'Observações gerais', p.observacoes, { ajuda: 'Visível para toda a equipe. Não escreva dados de saúde aqui — eles ficam na anamnese.' })}
        <fieldset class="campo">
          <legend>Consentimentos (LGPD)</legend>
          <div class="marcadores marcadores-coluna">
            ${f.chave('consSaude', 'Autoriza guardar dados de saúde', cons.saude)}
            ${f.chave('consWhatsapp', 'Autoriza receber mensagens no WhatsApp', cons.whatsapp)}
            ${f.chave('consFotos', 'Autoriza fotos clínicas (antes e depois)', cons.fotos)}
            ${f.chave('consDivulgacao', 'Autoriza uso de imagem em divulgação', cons.divulgacao)}
          </div>
        </fieldset>
      </details>
    `;

    modal.formulario({
      titulo: novo ? 'Novo cadastro' : `Editar cadastro de ${p.nome}`,
      corpo,
      largo: true,
      textoSalvar: novo ? 'Cadastrar' : 'Salvar alterações',
      ler: (form) => ler(form, pessoa?.id),
      validar: (dados) => validar(dados, pessoas),
      salvar: async ({ tipo: tipoEscolhido, id, ...dados }) => {
        const autor = permissoes.atual();
        const agora = new Date().toISOString();
        let salvo;
        if (novo) {
          const ehCliente = tipoEscolhido === 'cliente';
          salvo = await store.create('pessoas', {
            ...dados,
            funil: ehCliente ? 'acompanhamento' : 'comercial',
            etapa: ehCliente ? 'inicio' : 'novo',
            etapaDesde: agora,
            status: ehCliente ? 'ativo' : 'lead',
            clienteDesde: ehCliente ? utils.isoDia(new Date()) : null,
            motivoPerda: null,
            agentePausado: false,
          });
          await store.create('interacoes', {
            pessoaId: salvo.id, dataHora: agora, tipo: 'nota', autor, automatico: true,
            descricao: `Cadastrado(a) como ${ehCliente ? 'cliente' : 'lead'} — origem: ${config.ORIGENS[dados.origem]}.`,
          });
          if (dados.indicadoPorId) {
            await store.create('interacoes', {
              pessoaId: dados.indicadoPorId, dataHora: agora, tipo: 'indicacao', autor, automatico: true,
              descricao: `Indicou ${dados.nome}.`,
            });
          }
          ui.toast(`${dados.nome} cadastrado(a) como ${ehCliente ? 'cliente' : 'lead'}.`);
        } else {
          salvo = await store.update('pessoas', id, dados);
          ui.toast('Cadastro atualizado.');
        }
        if (aoSalvar) aoSalvar(salvo);
      },
      aoAbrir: (form) => {
        const blocoIndicacao = form.querySelector('[data-indicacao]');
        const ajudaTipo = form.querySelector('[data-ajuda-tipo]');
        const atualizar = () => {
          blocoIndicacao.hidden = f.valor(form, 'origem') !== 'indicacao';
          if (ajudaTipo) {
            ajudaTipo.textContent = f.valor(form, 'tipo') === 'cliente'
              ? 'Entra direto no funil de acompanhamento, como cliente ativo desde hoje.'
              : 'Entra no funil comercial, na etapa "Novo lead".';
          }
        };
        form.addEventListener('change', atualizar);
        // Máscaras enquanto digita.
        form.elements.telefone.addEventListener('input', (e) => { e.target.value = utils.formatarTelefone(e.target.value); });
        form.elements.cpf.addEventListener('input', (e) => { e.target.value = utils.formatarCpf(e.target.value); });
        atualizar();
      },
    });
  }

  return { abrir, validar };
})();
