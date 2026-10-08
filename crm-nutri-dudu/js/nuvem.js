// Conexão com o Supabase (fase 9): login, perfis da equipe, leitura e
// gravação dos dados, fotos no depósito privado e atualizações em tempo real.
// O store.js e o fotos-store.js usam este arquivo quando a nuvem está ativa;
// as telas continuam falando só com o store.
window.NutriDudu = window.NutriDudu || {};

NutriDudu.nuvem = (function () {
  const cfg = NutriDudu.NUVEM || {};
  const TABELAS = [
    'configuracoes', 'profissionais', 'horarios', 'bloqueios', 'servicos',
    'pessoas', 'consultas', 'anamneses', 'avaliacoes', 'fotos',
    'pacotes', 'lancamentos', 'interacoes', 'conversas', 'mensagens',
  ];
  // Campos clínicos guardados à parte (a recepção nem recebe esses dados).
  const CLINICOS = { consultas: { tabela: 'consultas_clinico', campos: ['anotacoes', 'conduta'] } };
  const PAGINA = 1000;
  const BUCKET = 'fotos';

  let cliente = null;
  let perfil = null;

  // ---------------- Modo ----------------

  const configurada = () => Boolean(cfg.url && cfg.chaveAnon);

  /** Modo demonstração: abre o protótipo local (dados fictícios no navegador). */
  function emDemonstracao() {
    return new URLSearchParams(location.search).get('modo') === 'demo';
  }

  /** A nuvem vale quando está configurada e não estamos no modo demonstração. */
  const ativa = () => configurada() && !emDemonstracao();

  /** Confere se a URL e a chave são do mesmo projeto (erro comum ao copiar). */
  function problemaNaConfiguracao() {
    if (!configurada()) return null;
    try {
      const ref = JSON.parse(atob(cfg.chaveAnon.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).ref;
      const host = new URL(cfg.url).hostname.split('.')[0];
      if (ref && host && ref !== host) return `A URL (${host}) e a chave (${ref}) são de projetos diferentes no Supabase. Confira em js/nuvem-config.js.`;
    } catch (erro) {
      return 'A chave do Supabase em js/nuvem-config.js não parece válida.';
    }
    return null;
  }

  function obterCliente() {
    if (cliente) return cliente;
    // Os testes automáticos podem trocar o Supabase por uma imitação.
    const fabrica = window.NutriDuduSupabaseTeste || window.supabase;
    if (!fabrica?.createClient) throw new Error('A biblioteca do Supabase não carregou.');
    cliente = fabrica.createClient(cfg.url, cfg.chaveAnon, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nutridudu-sessao' },
    });
    return cliente;
  }

  // ---------------- Erros em português ----------------

  function traduzir(erro, padrao = 'Não foi possível falar com o servidor. Tente de novo.') {
    const msg = String(erro?.message || erro || '');
    if (/row-level security|permission denied|not authorized|JWT/i.test(msg)) return 'Seu perfil não tem permissão para isso.';
    if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado no Supabase.';
    if (/Invalid API key|apikey/i.test(msg)) return 'A chave do Supabase não é válida. Confira js/nuvem-config.js.';
    if (/Failed to fetch|NetworkError|network|fetch/i.test(msg)) return 'Sem conexão com a internet (ou com o Supabase). Confira a conexão e tente de novo.';
    if (/administrador/i.test(msg)) return msg;
    if (/Password should be|password/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
    return padrao;
  }

  function falhar(erro, padrao) {
    const e = new Error(traduzir(erro, padrao));
    e.original = erro;
    throw e;
  }

  // ---------------- Login e perfil ----------------

  async function sessaoAtual() {
    const { data } = await obterCliente().auth.getSession();
    return data?.session || null;
  }

  async function entrar(email, senha) {
    const { data, error } = await obterCliente().auth.signInWithPassword({ email, password: senha });
    if (error) falhar(error, 'Não foi possível entrar.');
    return data.session;
  }

  async function sair() {
    perfil = null;
    try {
      await obterCliente().auth.signOut();
    } catch (erro) {
      // Sem internet: a sessão local é apagada mesmo assim.
    }
  }

  async function trocarSenha(nova) {
    const { error } = await obterCliente().auth.updateUser({ password: nova });
    if (error) falhar(error, 'Não foi possível trocar a senha.');
  }

  /** Perfil de quem está logado: { userId, email, nome, papel, profissionalId }. */
  async function carregarPerfil() {
    const sessao = await sessaoAtual();
    if (!sessao) { perfil = null; return null; }
    const { data, error } = await obterCliente().from('perfis').select('*').eq('user_id', sessao.user.id).maybeSingle();
    if (error) falhar(error, 'Não foi possível carregar o seu perfil.');
    perfil = data
      ? { userId: data.user_id, email: data.email || sessao.user.email, nome: data.nome || sessao.user.email, papel: data.papel, profissionalId: data.profissional_id || null }
      : { userId: sessao.user.id, email: sessao.user.email, nome: sessao.user.email, papel: 'pendente', profissionalId: null };
    return perfil;
  }

  const perfilAtual = () => perfil;
  const veClinico = () => ['admin', 'profissional'].includes(perfil?.papel);

  // Equipe (administrador)
  async function listarPerfis() {
    const { data, error } = await obterCliente().from('perfis').select('*').order('criado_em');
    if (error) falhar(error);
    return data || [];
  }

  async function atualizarPerfil(userId, mudancas) {
    const { data, error } = await obterCliente().from('perfis').update(mudancas).eq('user_id', userId).select('user_id');
    if (error) falhar(error);
    if (!data?.length) throw new Error('Seu perfil não tem permissão para alterar a equipe.');
  }

  /** Registra que o prontuário de um cliente foi aberto (LGPD). Falhas não atrapalham a tela. */
  async function registrarAcesso(pessoaId, detalhe) {
    try {
      await obterCliente().from('auditoria').insert({ acao: 'abriu', tabela: 'prontuario', pessoa_id: pessoaId, detalhe });
    } catch (erro) {
      // Sem conexão: não impede de ver a ficha.
    }
  }

  // ---------------- Dados ----------------

  async function lerTabela(tabela) {
    const linhas = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await obterCliente().from(tabela).select('id, dados').order('id').range(de, de + PAGINA - 1);
      if (error) falhar(error, `Não foi possível carregar "${tabela}".`);
      linhas.push(...(data || []));
      if (!data || data.length < PAGINA) break;
    }
    return linhas;
  }

  const paraItem = (linha) => ({ ...(linha.dados || {}), id: linha.id });

  /** Todas as coleções que o perfil pode ver, já no formato do store. */
  async function carregarTudo() {
    const resultado = {};
    await Promise.all(TABELAS.map(async (t) => { resultado[t] = (await lerTabela(t)).map(paraItem); }));
    // Junta os campos clínicos às consultas (só chegam para admin e profissional).
    for (const [colecao, { tabela, campos }] of Object.entries(CLINICOS)) {
      const extras = veClinico() ? await lerTabela(tabela) : [];
      const porId = new Map(extras.map((l) => [l.id, l.dados || {}]));
      resultado[colecao] = resultado[colecao].map((item) => {
        const extra = porId.get(item.id);
        if (!extra) return item;
        const junto = { ...item };
        campos.forEach((c) => { if (extra[c] !== undefined) junto[c] = extra[c]; });
        return junto;
      });
    }
    return resultado;
  }

  /** Separa o registro em linha principal e linha clínica (quando houver). */
  function separar(colecao, item) {
    const regra = CLINICOS[colecao];
    if (!regra) return { principal: { id: item.id, dados: item }, clinico: null };
    const dados = { ...item };
    const clinicos = { pessoaId: item.pessoaId };
    let temClinico = false;
    regra.campos.forEach((c) => {
      if (c in dados) { clinicos[c] = dados[c]; temClinico = true; }
      delete dados[c];
    });
    return { principal: { id: item.id, dados }, clinico: temClinico ? { tabela: regra.tabela, linha: { id: item.id, dados: clinicos } } : null };
  }

  async function verificar(resposta, padrao) {
    const { data, error } = await resposta;
    if (error) falhar(error, padrao);
    return data;
  }

  async function criar(colecao, item) {
    const { principal, clinico } = separar(colecao, item);
    await verificar(obterCliente().from(colecao).insert(principal), 'Não foi possível salvar.');
    if (clinico && veClinico()) await verificar(obterCliente().from(clinico.tabela).upsert(clinico.linha), 'Não foi possível salvar os dados clínicos.');
  }

  async function alterar(colecao, item) {
    const { principal, clinico } = separar(colecao, item);
    const data = await verificar(obterCliente().from(colecao).update({ dados: principal.dados }).eq('id', item.id).select('id'), 'Não foi possível salvar.');
    if (!data?.length) throw new Error('Seu perfil não tem permissão para alterar este registro (ou ele foi apagado por outra pessoa).');
    if (clinico && veClinico()) await verificar(obterCliente().from(clinico.tabela).upsert(clinico.linha), 'Não foi possível salvar os dados clínicos.');
  }

  async function apagar(colecao, ids) {
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      await verificar(obterCliente().from(colecao).delete().in('id', lote), 'Não foi possível apagar.');
      const regra = CLINICOS[colecao];
      if (regra && veClinico()) await verificar(obterCliente().from(regra.tabela).delete().in('id', lote), 'Não foi possível apagar os dados clínicos.');
    }
  }

  /** Grava muitos registros de uma vez (importação de backup, dados de exemplo). */
  async function gravarLote(colecao, itens) {
    const principais = [];
    const clinicos = {};
    itens.forEach((item) => {
      const { principal, clinico } = separar(colecao, item);
      principais.push(principal);
      if (clinico) (clinicos[clinico.tabela] = clinicos[clinico.tabela] || []).push(clinico.linha);
    });
    for (let i = 0; i < principais.length; i += 500) {
      await verificar(obterCliente().from(colecao).upsert(principais.slice(i, i + 500)), `Não foi possível gravar "${colecao}".`);
    }
    for (const [tabela, linhas] of Object.entries(clinicos)) {
      for (let i = 0; i < linhas.length; i += 500) {
        await verificar(obterCliente().from(tabela).upsert(linhas.slice(i, i + 500)), `Não foi possível gravar "${tabela}".`);
      }
    }
  }

  /** Troca todos os dados pelos informados (só administrador). */
  async function substituirTudo(colecoes) {
    for (const t of TABELAS) {
      const novos = Array.isArray(colecoes[t]) ? colecoes[t] : [];
      const novosIds = new Set(novos.map((x) => x.id));
      const atuais = (await lerTabela(t)).map((l) => l.id);
      await apagar(t, atuais.filter((id) => !novosIds.has(id)));
      if (novos.length) await gravarLote(t, novos);
    }
  }

  // ---------------- Tempo real ----------------

  let canal = null;
  /** Avisa quando outra pessoa grava algo: fn({ colecao, tipo, item, id }). */
  function ouvir(fn) {
    parar();
    const tabelas = new Set([...TABELAS, ...Object.values(CLINICOS).map((r) => r.tabela)]);
    canal = obterCliente()
      .channel('nutridudu-dados')
      .on('postgres_changes', { event: '*', schema: 'public' }, (p) => {
        if (!tabelas.has(p.table)) return;
        const clinicoDe = Object.entries(CLINICOS).find(([, r]) => r.tabela === p.table);
        const colecao = clinicoDe ? clinicoDe[0] : p.table;
        if (p.eventType === 'DELETE') fn({ colecao, tipo: 'apagar', id: p.old?.id, clinico: Boolean(clinicoDe) });
        else fn({ colecao, tipo: 'gravar', item: paraItem(p.new), clinico: Boolean(clinicoDe), campos: clinicoDe?.[1].campos });
      })
      .subscribe();
  }

  function parar() {
    if (canal) obterCliente().removeChannel(canal);
    canal = null;
  }

  // ---------------- Fotos (Storage privado) ----------------

  const caminhoFoto = (chave) => `${chave}.jpg`;

  async function dataUrlParaBlob(dataUrl) {
    return (await fetch(dataUrl)).blob();
  }

  function blobParaDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(blob);
    });
  }

  async function fotoSalvar(chave, dataUrl) {
    const blob = await dataUrlParaBlob(dataUrl);
    const { error } = await obterCliente().storage.from(BUCKET).upload(caminhoFoto(chave), blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) falhar(error, 'Não foi possível enviar a foto.');
  }

  async function fotoLer(chave) {
    const { data, error } = await obterCliente().storage.from(BUCKET).download(caminhoFoto(chave));
    if (error || !data) return null;
    return blobParaDataUrl(data);
  }

  async function fotoRemover(chave) {
    const { error } = await obterCliente().storage.from(BUCKET).remove([caminhoFoto(chave)]);
    if (error) falhar(error, 'Não foi possível apagar a foto.');
  }

  async function fotosLimpar() {
    const { data, error } = await obterCliente().storage.from(BUCKET).list('', { limit: 1000 });
    if (error) falhar(error, 'Não foi possível limpar as fotos.');
    const nomes = (data || []).map((f) => f.name);
    for (let i = 0; i < nomes.length; i += 100) {
      await obterCliente().storage.from(BUCKET).remove(nomes.slice(i, i + 100));
    }
  }

  return {
    TABELAS, configurada, ativa, emDemonstracao, problemaNaConfiguracao, traduzir,
    sessaoAtual, entrar, sair, trocarSenha, carregarPerfil, perfilAtual, veClinico, listarPerfis, atualizarPerfil, registrarAcesso,
    carregarTudo, criar, alterar, apagar, gravarLote, substituirTudo, ouvir, parar,
    fotoSalvar, fotoLer, fotoRemover, fotosLimpar,
  };
})();
