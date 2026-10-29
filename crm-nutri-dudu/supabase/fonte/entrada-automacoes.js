// ---- Entrada da função whatsapp-automacoes (Deno, Supabase Edge Functions) ----
// Recebe o agendamento (Cron do Supabase) e o formulário de pré-anamnese (página pública).
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

const servidor = NutriDuduAutomacoes.criarServidor({
  automacoes: NutriDuduAutomacoes.criar({ repo, whatsapp, relogio, linkPadrao: variavel('SITE_URL', '') }),
  preAnamnese: NutriDuduAutomacoes.criarPreAnamnese({ repo, relogio }),
  chave: variavel('AUTOMACOES_CHAVE'),
});

Deno.serve((req) => servidor(req));
