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

const envio = NutriDuduServidor.criarEnvioEquipe({
  repo, whatsapp, relogio, quemEsta,
  automacoes: NutriDuduAutomacoes.criar({ repo, whatsapp, relogio, linkPadrao: variavel('SITE_URL', '') }),
});

Deno.serve((req) => envio.atender(req));
