// Login na nuvem (fase 9): tela de entrada, acesso pendente, primeira
// configuração da clínica (banco vazio), trocar senha e sair.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.login = (function () {
  const PAPEIS_EQUIPE = ['admin', 'profissional', 'recepcao'];
  const NOMES_PAPEL = { admin: 'Administrador', profissional: 'Profissional', recepcao: 'Recepção', pendente: 'Aguardando liberação', desativado: 'Desativado' };

  const tela = () => document.getElementById('tela-login');
  const conteudo = () => document.getElementById('login-conteudo');

  function mostrar(html) {
    document.getElementById('app').hidden = true;
    tela().hidden = false;
    conteudo().innerHTML = html;
  }

  function esconder() {
    tela().hidden = true;
    document.getElementById('app').hidden = false;
  }

  const esc = (t) => NutriDudu.utils.escapeHtml(t ?? '');

  // ---------------- Telas ----------------

  function telaCarregando(texto = 'Carregando…') {
    mostrar(`<p class="login-status" role="status">${esc(texto)}</p>`);
  }

  function telaErro(texto, podeTentar = true) {
    mostrar(`
      <p class="alerta alerta-perigo" role="alert">${esc(texto)}</p>
      ${podeTentar ? '<button type="button" class="btn btn-primary btn-largo" data-tentar>Tentar de novo</button>' : ''}
      <p class="login-rodape"><a href="?modo=demo">Abrir a demonstração (dados fictícios)</a></p>`);
  }

  function telaEntrar(erro = '', email = '') {
    mostrar(`
      <h1 class="login-titulo">Entrar</h1>
      <form class="login-form" novalidate>
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input type="email" id="login-email" name="email" autocomplete="username" required value="${esc(email)}">
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input type="password" id="login-senha" name="senha" autocomplete="current-password" required>
        </div>
        <p class="form-erro-geral" role="alert"${erro ? '' : ' hidden'}>${esc(erro)}</p>
        <button type="submit" class="btn btn-primary btn-largo">Entrar</button>
      </form>
      <p class="login-rodape small muted">Esqueceu a senha ou ainda não tem acesso? Fale com o administrador da clínica.</p>
      <p class="login-rodape small"><a href="?modo=demo">Abrir a demonstração (dados fictícios)</a></p>`);
    const campo = conteudo().querySelector(email ? '#login-senha' : '#login-email');
    campo?.focus();
  }

  function telaPendente(perfil) {
    const desativado = perfil.papel === 'desativado';
    mostrar(`
      <h1 class="login-titulo">${desativado ? 'Acesso desativado' : 'Acesso aguardando liberação'}</h1>
      <p>Você entrou como <strong>${esc(perfil.email)}</strong>.</p>
      <p class="muted">${desativado
        ? 'Seu acesso foi desativado pelo administrador da clínica.'
        : 'O administrador da clínica precisa liberar o seu acesso e escolher o seu perfil (profissional ou recepção) em Configurações › Equipe.'}</p>
      <button type="button" class="btn btn-largo" data-sair>Sair</button>`);
  }

  /** Banco vazio: o administrador escolhe como começar. */
  function telaPrimeiroUso(perfil) {
    mostrar(`
      <h1 class="login-titulo">Bem-vindo(a) ao Nutri Dudu!</h1>
      <p class="muted">O banco de dados da clínica ainda está vazio. Como você quer começar?</p>
      <div class="opcoes-inicio">
        <form class="opcao-inicio" data-zero novalidate>
          <h2>Começar a clínica do zero</h2>
          <p class="small muted">Cria as configurações, os serviços básicos (dá para editar depois) e a sua ficha de nutricionista com horário de segunda a sábado. Sem nenhum paciente.</p>
          <div class="campo">
            <label for="inicio-nome">Seu nome como profissional</label>
            <input id="inicio-nome" name="nome" value="${esc(perfil.nome && !perfil.nome.includes('@') ? perfil.nome : '')}" placeholder="Ex.: Dra. Fulana de Tal" required>
          </div>
          <div class="campo">
            <label for="inicio-registro">Registro (CRN)</label>
            <input id="inicio-registro" name="registro" placeholder="Ex.: CRN-3 12345">
          </div>
          <p class="campo-erro" data-erro-inicio role="alert"></p>
          <button type="submit" class="btn btn-primary">Começar do zero</button>
        </form>
        <div class="opcao-inicio">
          <h2>Trazer os dados do protótipo</h2>
          <p class="small muted">Importa um arquivo de backup exportado no protótipo (Configurações › Dados e backup).</p>
          <button type="button" class="btn" data-importar>Importar backup…</button>
        </div>
        <div class="opcao-inicio">
          <h2>Treinar com dados de exemplo</h2>
          <p class="small muted">Carrega pacientes e consultas fictícios para a equipe aprender. Depois, apague em Configurações › Dados e backup › Começar do zero.</p>
          <button type="button" class="btn" data-exemplo>Carregar dados de exemplo</button>
        </div>
      </div>
      <p class="login-rodape small"><button type="button" class="link-botao" data-sair>Sair</button></p>`);
  }

  // ---------------- Fluxo ----------------

  let aoProntoGuardado = null;

  async function iniciar({ aoPronto }) {
    aoProntoGuardado = aoPronto;
    tela().addEventListener('submit', aoEnviar);
    tela().addEventListener('click', aoClicar);

    const problema = NutriDudu.nuvem.problemaNaConfiguracao();
    if (problema) { telaErro(problema, false); return; }

    telaCarregando('Conectando…');
    try {
      const sessao = await NutriDudu.nuvem.sessaoAtual();
      if (!sessao) { telaEntrar(); return; }
      await depoisDoLogin();
    } catch (erro) {
      telaErro(erro.message || NutriDudu.nuvem.traduzir(erro));
    }
  }

  async function depoisDoLogin() {
    telaCarregando('Carregando seu perfil…');
    const perfil = await NutriDudu.nuvem.carregarPerfil();
    if (!perfil) { telaEntrar(); return; }
    if (!PAPEIS_EQUIPE.includes(perfil.papel)) { telaPendente(perfil); return; }

    NutriDudu.permissoes.fixar({ papel: perfil.papel, profissionalId: perfil.profissionalId });
    telaCarregando('Carregando os dados da clínica…');
    await NutriDudu.store.conectarNuvem();

    const geral = await NutriDudu.store.get('configuracoes', 'geral');
    if (!geral) {
      if (perfil.papel === 'admin') { telaPrimeiroUso(perfil); return; }
      telaErro('O administrador ainda não configurou o sistema. Tente de novo mais tarde.');
      return;
    }
    esconder();
    aoProntoGuardado?.(perfil);
  }

  async function aoEnviar(e) {
    const form = e.target;
    e.preventDefault();
    if (form.matches('.login-form')) {
      const email = form.email.value.trim();
      const senha = form.senha.value;
      if (!email || !senha) { telaEntrar('Informe o e-mail e a senha.', email); return; }
      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      try {
        await NutriDudu.nuvem.entrar(email, senha);
        await depoisDoLogin();
      } catch (erro) {
        telaEntrar(erro.message, email);
      }
    } else if (form.matches('[data-zero]')) {
      const nome = form.nome.value.trim();
      if (nome.length < 3) { form.querySelector('[data-erro-inicio]').textContent = 'Informe o seu nome.'; return; }
      await executar(() => comecarDoZero({ nome, registro: form.registro.value.trim() }), 'Preparando a clínica…');
    }
  }

  async function aoClicar(e) {
    const alvo = e.target.closest('button');
    if (!alvo) return;
    if (alvo.matches('[data-tentar]')) location.reload();
    else if (alvo.matches('[data-sair]')) sair();
    else if (alvo.matches('[data-exemplo]')) {
      await executar(async () => {
        await NutriDudu.store.resetarParaExemplo();
        await vincularProfissional('prof_1');
      }, 'Carregando os dados de exemplo…');
    } else if (alvo.matches('[data-importar]')) {
      // A janela de importação funciona por cima da tela de login.
      NutriDudu.backup.abrirImportacao({ aoConcluir: () => depoisDoLogin().catch((erro) => telaErro(erro.message)) });
    }
  }

  async function executar(fn, texto) {
    const perfil = NutriDudu.nuvem.perfilAtual();
    telaCarregando(texto);
    try {
      await fn();
      await depoisDoLogin();
    } catch (erro) {
      telaPrimeiroUso(perfil);
      conteudo().insertAdjacentHTML('afterbegin', `<p class="alerta alerta-perigo" role="alert">${esc(erro.message || 'Não foi possível concluir.')}</p>`);
    }
  }

  /** Configurações, serviços e a ficha da nutricionista, sem pacientes. */
  async function comecarDoZero({ nome, registro }) {
    const exemplo = NutriDudu.seed.criar();
    const prof = { ...exemplo.profissionais[0], nome, registro: registro || '' };
    await NutriDudu.store.importarTudo({
      configuracoes: exemplo.configuracoes,
      profissionais: [prof],
      horarios: exemplo.horarios,
      servicos: exemplo.servicos,
    }, { limparFotos: true });
    await vincularProfissional(prof.id);
  }

  async function vincularProfissional(profissionalId) {
    const perfil = NutriDudu.nuvem.perfilAtual();
    if (perfil && !perfil.profissionalId) {
      await NutriDudu.nuvem.atualizarPerfil(perfil.userId, { profissional_id: profissionalId });
    }
  }

  async function sair() {
    await NutriDudu.nuvem.sair();
    NutriDudu.store.desconectarNuvem();
    NutriDudu.fotosStore.esquecer?.();
    // Recarrega a página para não sobrar nada na memória.
    location.hash = '';
    location.reload();
  }

  function trocarSenha() {
    const { modal, form: f, ui } = NutriDudu;
    modal.formulario({
      titulo: 'Trocar senha',
      corpo: `
        ${f.texto('senha', 'Nova senha', '', { tipo: 'password', obrigatorio: true, atributos: 'autocomplete="new-password" minlength="8"', ajuda: 'Pelo menos 8 caracteres. Evite datas de nascimento e o nome da clínica.' })}
        ${f.texto('confirmacao', 'Repita a nova senha', '', { tipo: 'password', obrigatorio: true, atributos: 'autocomplete="new-password"' })}`,
      textoSalvar: 'Trocar senha',
      ler: (form) => ({ senha: form.querySelector('[name="senha"]').value, confirmacao: form.querySelector('[name="confirmacao"]').value }),
      validar: (d) => {
        if (d.senha.length < 8) return { senha: 'Use pelo menos 8 caracteres.' };
        if (d.senha !== d.confirmacao) return { confirmacao: 'As senhas não são iguais.' };
        return {};
      },
      salvar: async (d) => {
        await NutriDudu.nuvem.trocarSenha(d.senha);
        ui.toast('Senha trocada.');
      },
    });
  }

  return { iniciar, sair, trocarSenha, NOMES_PAPEL, PAPEIS_EQUIPE };
})();
