// Importar pacientes de uma planilha (Excel, Numbers, Google Planilhas, WebDiet…).
// Duas formas: copiar as células da planilha e colar aqui, ou abrir um arquivo CSV.
// O sistema reconhece as colunas pelos títulos (ou pelo conteúdo), mostra uma prévia
// e não duplica quem já está cadastrado (mesmo celular ou mesmo CPF).
window.NutriDudu = window.NutriDudu || {};

NutriDudu.importarPessoas = (function () {
  const CAMPOS = {
    '': 'Ignorar esta coluna',
    nome: 'Nome',
    telefone: 'Celular / WhatsApp',
    email: 'E-mail',
    dataNascimento: 'Data de nascimento',
    cpf: 'CPF',
    sexo: 'Sexo',
    cidade: 'Cidade',
    observacoes: 'Observações',
  };
  // Palavras dos títulos de coluna → campo.
  const TITULOS = [
    [/^(nome|nome completo|paciente|cliente)$/, 'nome'],
    [/(celular|whats|telefone|fone|^tel)/, 'telefone'],
    [/(e-?mail)/, 'email'],
    [/(nasc|aniversario|^dn$)/, 'dataNascimento'],
    [/^cpf/, 'cpf'],
    [/(sexo|genero)/, 'sexo'],
    [/(cidade|municipio)/, 'cidade'],
    [/(obs|anotac)/, 'observacoes'],
  ];
  const MAX_LINHAS = 2000;

  // ---------------- Leitura do texto ----------------

  /** Separa o texto em linhas e colunas (tabulação, ponto e vírgula ou vírgula; aceita aspas). */
  function lerTabela(texto) {
    const limpo = String(texto || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (!limpo) return [];
    const primeira = limpo.split('\n')[0];
    const conta = (c) => primeira.split(c).length - 1;
    const sep = conta('\t') ? '\t' : conta(';') >= conta(',') && conta(';') ? ';' : ',';
    const linhas = [];
    let linha = [];
    let campo = '';
    let aspas = false;
    for (let i = 0; i < limpo.length; i++) {
      const c = limpo[i];
      if (aspas) {
        if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"' && campo === '') aspas = true;
      else if (c === sep) { linha.push(campo.trim()); campo = ''; }
      else if (c === '\n') { linha.push(campo.trim()); linhas.push(linha); linha = []; campo = ''; }
      else campo += c;
    }
    linha.push(campo.trim());
    linhas.push(linha);
    return linhas.filter((l) => l.some((v) => v !== '')).slice(0, MAX_LINHAS + 1);
  }

  const ehData = (v) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const ehEmail = (v) => /\S+@\S+\.\S+/.test(v);
  const digitos = (v) => String(v || '').replace(/\D/g, '');
  const ehTelefone = (v) => !ehData(v) && /^[\d\s()+.-]+$/.test(v) && [10, 11, 12, 13].includes(digitos(v).length);
  // CPF com pontos, ou 11 números que não parecem celular (DDD + 9).
  const ehCpf = (v) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v) || (/^\d{11}$/.test(v) && !/^\d{2}9/.test(v));

  /** A primeira linha parece de títulos? (nenhuma célula com telefone, e-mail ou data, e algum título conhecido) */
  function temTitulos(linhas) {
    if (!linhas.length) return false;
    const primeira = linhas[0];
    const conhecido = primeira.some((v) => TITULOS.some(([re]) => re.test(NutriDudu.utils.normalizar(v).trim())));
    return conhecido && !primeira.some((v) => ehEmail(v) || ehTelefone(v) || ehData(v));
  }

  /** Adivinha o campo de cada coluna, pelo título ou pelo conteúdo. */
  function adivinharColunas(linhas, comTitulos) {
    const { utils } = NutriDudu;
    const n = Math.max(...linhas.map((l) => l.length));
    const dados = comTitulos ? linhas.slice(1) : linhas;
    const usados = new Set();
    const campos = [];
    for (let i = 0; i < n; i++) {
      let campo = '';
      if (comTitulos) {
        const t = utils.normalizar(linhas[0][i] || '').trim();
        const achado = TITULOS.find(([re, c]) => re.test(t) && !usados.has(c));
        if (achado) campo = achado[1];
      }
      if (!campo) {
        const amostra = dados.slice(0, 20).map((l) => l[i] || '').filter(Boolean);
        const maioria = (teste) => amostra.length && amostra.filter(teste).length >= amostra.length * 0.6;
        if (maioria(ehEmail)) campo = 'email';
        else if (maioria((v) => ehTelefone(v) && !ehCpf(v))) campo = 'telefone';
        else if (maioria(ehCpf)) campo = 'cpf';
        else if (maioria(ehData)) campo = 'dataNascimento';
        else if (!usados.has('nome') && maioria((v) => /[a-zA-ZÀ-ú]{2,}\s+[a-zA-ZÀ-ú]{2,}/.test(v))) campo = 'nome';
      }
      if (campo && usados.has(campo)) campo = '';
      if (campo) usados.add(campo);
      campos.push(campo);
    }
    return campos;
  }

  /** "14/03/1991", "14-03-91", "1991-03-14" → "1991-03-14" (ou null). */
  function lerData(v) {
    const t = String(v || '').trim();
    let d;
    let m;
    let a;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) [a, m, d] = t.split('-').map(Number);
    else {
      const p = t.split(/[/.-]/).map(Number);
      if (p.length !== 3) return null;
      [d, m, a] = p;
      if (a < 100) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000;
    }
    const data = new Date(a, m - 1, d);
    if (Number.isNaN(data.getTime()) || data.getMonth() !== m - 1 || data > new Date() || a < 1900) return null;
    return NutriDudu.utils.isoDia(data);
  }

  function lerSexo(v) {
    const t = NutriDudu.utils.normalizar(v).trim();
    if (/^(f|fem|feminino|mulher)$/.test(t)) return 'F';
    if (/^(m|masc|masculino|homem)$/.test(t)) return 'M';
    return null;
  }

  /** Converte as linhas em cadastros e diz o que acontece com cada uma. */
  function montarRegistros(linhas, comTitulos, campos, pessoas) {
    const { utils } = NutriDudu;
    const telefones = new Set(pessoas.map((p) => utils.soDigitos(p.telefone)).filter(Boolean));
    const cpfs = new Set(pessoas.map((p) => utils.soDigitos(p.cpf)).filter(Boolean));
    const dados = comTitulos ? linhas.slice(1) : linhas;
    return dados.map((l) => {
      const valor = (campo) => {
        const i = campos.indexOf(campo);
        return i >= 0 ? String(l[i] || '').trim() : '';
      };
      let tel = utils.soDigitos(valor('telefone'));
      if ((tel.length === 12 || tel.length === 13) && tel.startsWith('55')) tel = tel.slice(2);
      const r = {
        nome: valor('nome').replace(/\s+/g, ' ').slice(0, 100),
        telefone: tel,
        email: valor('email').toLowerCase().slice(0, 120),
        dataNascimento: valor('dataNascimento') ? lerData(valor('dataNascimento')) : null,
        cpf: valor('cpf'),
        sexo: lerSexo(valor('sexo')),
        cidade: valor('cidade').slice(0, 80),
        observacoes: valor('observacoes').slice(0, 1000),
      };
      const avisos = [];
      if (r.nome.length < 3) return { ...r, situacao: 'erro', motivo: 'sem nome' };
      if (!utils.telefoneValido(r.telefone)) return { ...r, situacao: 'erro', motivo: r.telefone ? 'celular inválido' : 'sem celular' };
      if (telefones.has(r.telefone)) return { ...r, situacao: 'existe', motivo: 'celular já cadastrado' };
      const cpfDig = utils.soDigitos(r.cpf);
      if (r.cpf && !utils.cpfValido(r.cpf)) { avisos.push('CPF inválido (ignorado)'); r.cpf = ''; }
      else if (cpfDig && cpfs.has(cpfDig)) return { ...r, situacao: 'existe', motivo: 'CPF já cadastrado' };
      if (r.email && !utils.emailValido(r.email)) { avisos.push('e-mail inválido (ignorado)'); r.email = ''; }
      if (valor('dataNascimento') && !r.dataNascimento) avisos.push('data de nascimento não entendida (ignorada)');
      telefones.add(r.telefone);
      if (cpfDig && r.cpf) cpfs.add(cpfDig);
      return { ...r, situacao: 'novo', avisos };
    });
  }

  // ---------------- Tela ----------------

  async function abrir() {
    const { form: f, modal, store, ui, utils, config, permissoes } = NutriDudu;
    if (!permissoes.exigir('gerenciarDados')) return;
    const pessoas = await store.list('pessoas');
    let estado = { linhas: [], comTitulos: false, campos: [], registros: [] };

    const corpo = `
      <p class="small">Abra a planilha (Excel, Numbers, Google Planilhas ou a exportação do WebDiet), <strong>selecione as linhas com os pacientes</strong> (pode incluir a linha dos títulos), copie e cole aqui embaixo. Também dá para abrir um arquivo <strong>CSV</strong>.</p>
      ${f.areaTexto('texto', 'Cole aqui as linhas da planilha', '', { linhas: 6 })}
      <div class="acoes-linha">
        <label class="btn btn-pequeno">Abrir arquivo CSV<input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" data-arquivo hidden></label>
        <button type="button" class="btn btn-pequeno btn-primary" data-ler>Ler a planilha</button>
      </div>
      <div data-previa></div>`;

    const dialog = modal.formulario({
      titulo: 'Importar pacientes de uma planilha',
      largo: true,
      textoSalvar: 'Importar',
      corpo,
      ler: (form) => ({
        tipo: f.valor(form, 'tipoImport') || 'cliente',
        origem: f.valor(form, 'origemImport') || 'outro',
        whatsapp: f.marcado(form, 'consWhatsappImport'),
      }),
      validar: () => {
        if (!estado.registros.length) return { _geral: 'Cole as linhas da planilha e toque em "Ler a planilha".' };
        if (!estado.campos.includes('nome') || !estado.campos.includes('telefone')) return { _geral: 'Escolha qual coluna é o Nome e qual é o Celular.' };
        if (!estado.registros.some((r) => r.situacao === 'novo')) return { _geral: 'Nenhum paciente novo para importar.' };
        return {};
      },
      salvar: async (op) => {
        const novos = estado.registros.filter((r) => r.situacao === 'novo');
        const ehCliente = op.tipo === 'cliente';
        const agora = new Date().toISOString();
        const hoje = utils.isoDia(new Date());
        const botao = dialog.querySelector('[type="submit"]');
        let feitos = 0;
        for (const r of novos) {
          const salvo = await store.create('pessoas', {
            nome: r.nome, telefone: utils.formatarTelefone(r.telefone), email: r.email, dataNascimento: r.dataNascimento,
            cpf: r.cpf ? utils.formatarCpf(r.cpf) : '', sexo: r.sexo, cidade: r.cidade, endereco: '', observacoes: r.observacoes,
            origem: op.origem, indicadoPorId: null, objetivo: null, profissionalId: null, servicoInteresseId: null, retornoDias: null, tags: [],
            consentimentos: { saude: false, whatsapp: op.whatsapp, fotos: false, divulgacao: false },
            funil: ehCliente ? 'acompanhamento' : 'comercial', etapa: ehCliente ? 'tratamento' : 'novo', etapaDesde: agora,
            status: ehCliente ? 'ativo' : 'lead', clienteDesde: ehCliente ? hoje : null, motivoPerda: null, agentePausado: false,
            importadoEm: agora,
          });
          await store.create('interacoes', {
            pessoaId: salvo.id, dataHora: agora, tipo: 'nota', autor: permissoes.atual(), automatico: true,
            descricao: `Importado(a) de planilha como ${ehCliente ? 'cliente' : 'lead'}.`,
          });
          feitos++;
          botao.textContent = `Importando… ${feitos} de ${novos.length}`;
        }
        ui.toast(`${feitos} ${feitos === 1 ? 'paciente importado' : 'pacientes importados'}.`);
      },
    });

    const form = dialog.querySelector('form');
    const previa = form.querySelector('[data-previa]');
    const botaoSalvar = form.querySelector('[type="submit"]');
    botaoSalvar.disabled = true;

    function recalcular() {
      estado.registros = montarRegistros(estado.linhas, estado.comTitulos, estado.campos, pessoas);
      desenhar();
    }

    function desenhar() {
      const { linhas, comTitulos, campos, registros } = estado;
      if (!linhas.length) { previa.innerHTML = ''; botaoSalvar.disabled = true; return; }
      const n = Math.max(...linhas.map((l) => l.length));
      const exemplo = (i) => (comTitulos ? linhas.slice(1) : linhas).map((l) => l[i]).find(Boolean) || '';
      const novos = registros.filter((r) => r.situacao === 'novo');
      const existentes = registros.filter((r) => r.situacao === 'existe');
      const erros = registros.filter((r) => r.situacao === 'erro');
      const colunas = Array.from({ length: n }, (_, i) => `
        <div class="import-coluna">
          <span class="muted small">${comTitulos ? utils.escapeHtml(linhas[0][i] || `Coluna ${i + 1}`) : `Coluna ${i + 1}`}</span>
          <select data-coluna="${i}" aria-label="O que é a coluna ${i + 1}">
            ${Object.entries(CAMPOS).map(([v, r]) => `<option value="${v}"${campos[i] === v ? ' selected' : ''}>${utils.escapeHtml(r)}</option>`).join('')}
          </select>
          <span class="small import-exemplo">${utils.escapeHtml(exemplo(i)).slice(0, 60) || '<span class="muted">(vazia)</span>'}</span>
        </div>`).join('');
      const linhaPrevia = (r) => `<tr>
          <td>${utils.escapeHtml(r.nome || '—')}</td>
          <td>${utils.escapeHtml(r.telefone ? utils.formatarTelefone(r.telefone) : '—')}</td>
          <td>${r.dataNascimento ? utils.data(r.dataNascimento) : '—'}</td>
          <td>${r.situacao === 'novo' ? ui.badge('Novo', 'sucesso') : r.situacao === 'existe' ? ui.badge('Já cadastrado', 'neutro') : ui.badge(r.motivo, 'perigo')}${r.avisos?.length ? ` <span class="muted small">${utils.escapeHtml(r.avisos.join('; '))}</span>` : ''}</td>
        </tr>`;
      const amostra = [...novos.slice(0, 5), ...erros.slice(0, 5), ...existentes.slice(0, 3)];
      previa.innerHTML = `
        <h3 class="import-titulo">1. Confira as colunas</h3>
        ${f.chave('comTitulos', 'A primeira linha tem os títulos das colunas', comTitulos)}
        <div class="import-colunas">${colunas}</div>
        <h3 class="import-titulo">2. Prévia</h3>
        <p class="small"><strong>${novos.length}</strong> ${novos.length === 1 ? 'paciente novo' : 'pacientes novos'}${existentes.length ? ` · ${existentes.length} já ${existentes.length === 1 ? 'cadastrado' : 'cadastrados'} (não serão duplicados)` : ''}${erros.length ? ` · <span class="texto-perigo">${erros.length} com problema (não serão importados)</span>` : ''}</p>
        <div class="tabela-rolagem"><table class="tabela-simples small"><thead><tr><th>Nome</th><th>Celular</th><th>Nascimento</th><th>Situação</th></tr></thead><tbody>${amostra.map(linhaPrevia).join('')}</tbody></table></div>
        ${erros.length ? `<details class="small"><summary>Ver os ${erros.length} com problema</summary><ul>${erros.map((r) => `<li>${utils.escapeHtml(r.nome || '(sem nome)')} — ${utils.escapeHtml(r.motivo)}</li>`).join('')}</ul><p class="muted">Corrija na planilha e importe de novo: quem já entrou não é duplicado.</p></details>` : ''}
        <h3 class="import-titulo">3. Como cadastrar</h3>
        <div class="grade-2">
          ${f.selecao('tipoImport', 'Cadastrar como', { cliente: 'Clientes (já são pacientes)', lead: 'Leads (interessados)' }, 'cliente')}
          ${f.selecao('origemImport', 'Como conheceram a clínica', config.ORIGENS, 'outro')}
        </div>
        ${f.chave('consWhatsappImport', 'Estes pacientes autorizaram receber mensagens da clínica pelo WhatsApp (lembretes e avisos)', false, { ajuda: 'Marque só se eles já autorizaram. Sem isso, o sistema não manda mensagens automáticas para eles; dá para marcar depois, um por um, no cadastro.' })}`;
      botaoSalvar.disabled = !novos.length;
      botaoSalvar.textContent = novos.length ? `Importar ${novos.length} ${novos.length === 1 ? 'paciente' : 'pacientes'}` : 'Importar';
      previa.querySelectorAll('[data-coluna]').forEach((sel) => sel.addEventListener('change', () => {
        const i = Number(sel.dataset.coluna);
        // Cada campo em uma coluna só.
        if (sel.value) estado.campos = estado.campos.map((c, j) => (j !== i && c === sel.value ? '' : c));
        estado.campos[i] = sel.value;
        recalcular();
      }));
      previa.querySelector('[name="comTitulos"]').addEventListener('change', (e) => {
        estado.comTitulos = e.target.checked;
        estado.campos = adivinharColunas(estado.linhas, estado.comTitulos);
        recalcular();
      });
    }

    function lerTexto() {
      const linhas = lerTabela(form.elements.texto.value);
      if (!linhas.length) { previa.innerHTML = '<p class="erro-texto small">Nada para ler: cole as linhas da planilha acima.</p>'; return; }
      const comTitulos = temTitulos(linhas);
      estado = { linhas, comTitulos, campos: adivinharColunas(linhas, comTitulos), registros: [] };
      recalcular();
      previa.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.querySelector('[data-ler]').addEventListener('click', lerTexto);
    form.querySelector('[data-arquivo]').addEventListener('change', async (e) => {
      const arquivo = e.target.files?.[0];
      if (!arquivo) return;
      if (arquivo.size > 2 * 1024 * 1024) { ui.toast('Arquivo grande demais (máximo 2 MB).', 'erro'); return; }
      let texto = await arquivo.text();
      // Excel antigo salva CSV em Latin-1: se aparecerem caracteres estragados, tenta de novo.
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(await arquivo.arrayBuffer());
      form.elements.texto.value = texto;
      lerTexto();
    });
  }

  return { abrir, lerTabela, adivinharColunas, temTitulos, montarRegistros, lerData };
})();
