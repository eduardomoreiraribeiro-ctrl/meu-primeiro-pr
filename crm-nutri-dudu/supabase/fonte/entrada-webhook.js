// ---- Entrada da função whatsapp-webhook (Deno, Supabase Edge Functions) ----
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

const webhook = NutriDuduServidor.criarWebhook({
  repo, whatsapp, relogio,
  anthropic: new Anthropic({ apiKey: variavel('ANTHROPIC_API_KEY') }),
  verifyToken: variavel('WHATSAPP_VERIFY_TOKEN'),
  appSecret: variavel('WHATSAPP_APP_SECRET'),
  modelo: variavel('AGENTE_MODELO', 'claude-opus-5-5'),
  automacoes: NutriDuduAutomacoes.criar({ repo, whatsapp, relogio, linkPadrao: variavel('SITE_URL', '') }),
  // Responde 200 para a Meta na hora e termina o atendimento em segundo plano.
  emSegundoPlano: (promessa) => globalThis.EdgeRuntime?.waitUntil ? EdgeRuntime.waitUntil(promessa) : promessa,
});

Deno.serve((req) => webhook.atender(req));
