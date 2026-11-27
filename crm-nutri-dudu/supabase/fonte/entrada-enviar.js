// ---- Entrada da função whatsapp-enviar (Deno, Supabase Edge Functions) ----
const variavel = (nome, padrao = undefined) => Deno.env.get(nome) ?? padrao;

const supabase = createClient(variavel('SUPABASE_URL'), variavel('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repo = NutriDuduServidor.repoSupabase(supabase);
const whatsapp = NutriDuduServidor.whatsappCloud({
  token: variavel('WHATSAPP_TOKEN'),
  phoneNumberId: variavel('WHATSAPP_PHONE_NUMBER_ID'),
  versao: variavel('WHATSAPP_GRAPH_VERSION', 'v23.0'),
});
const relogio = NutriDuduServidor.criarRelogio({ offsetClinicaMin: Number(variavel('CLINICA_FUSO_MINUTOS', '-180')) });

/** Quem está pedindo o envio: confere o login e o perfil no banco. */
async function quemEsta(cabecalho) {
  const token = cabecalho.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: perfil } = await supabase.from('perfis').select('*').eq('user_id', data.user.id).maybeSingle();
  if (!perfil) return null;
  return { id: data.user.id, nome: perfil.nome || data.user.email, papel: perfil.papel };
}

/** Baixa um laudo do depósito privado "exames" e devolve { base64, tipo }. */
async function baixarExame(chave) {
  const { data, error } = await supabase.storage.from('exames').download(String(chave));
  if (error || !data) throw new Error('Não encontrei o arquivo do exame.');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 20 MB).');
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binario), tipo: data.type || '' };
}

const envio = NutriDuduServidor.criarEnvioEquipe({
  repo, whatsapp, relogio, quemEsta,
  anthropic: variavel('ANTHROPIC_API_KEY') ? new Anthropic({ apiKey: variavel('ANTHROPIC_API_KEY') }) : null,
  baixarExame,
  modeloExames: variavel('MODELO_EXAMES', 'claude-opus-5-5'),
  automacoes: NutriDuduAutomacoes.criar({ repo, whatsapp, relogio, linkPadrao: variavel('SITE_URL', ''), email: NutriDuduServidor.emailResend({ apiKey: variavel('RESEND_API_KEY') }) }),
});

Deno.serve((req) => envio.atender(req));
