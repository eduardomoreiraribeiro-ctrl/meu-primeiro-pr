// Monta cada Edge Function num arquivo único (supabase/functions/<nome>/index.ts),
// pronto para colar no editor do painel do Supabase. Rode com:
//   node supabase/montar-funcoes.mjs
// As regras da agenda e dos cálculos são as mesmas do sistema (js/*.js).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (caminho) => readFileSync(join(raiz, caminho), 'utf8');

const IMPORTS = {
  anthropic: "import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';",
  supabase: "import { createClient } from 'npm:@supabase/supabase-js@2.117.2';",
};
const COMPARTILHADO = ['js/config.js', 'js/utils.js', 'js/calculos.js', 'js/agenda.js', 'js/alertas.js', 'js/mensagens-automaticas.js', 'js/espera.js', 'js/resumo-dia.js', 'supabase/fonte/nucleo.js', 'supabase/fonte/automacoes.js'];

const FUNCOES = {
  'whatsapp-webhook': { imports: ['anthropic', 'supabase'], entrada: 'supabase/fonte/entrada-webhook.js' },
  'whatsapp-enviar': { imports: ['supabase'], entrada: 'supabase/fonte/entrada-enviar.js' },
  'whatsapp-automacoes': { imports: ['supabase'], entrada: 'supabase/fonte/entrada-automacoes.js' },
};

for (const [nome, f] of Object.entries(FUNCOES)) {
  const partes = [
    `// Edge Function "${nome}" do CRM Nutri Dudu — ARQUIVO GERADO, não edite à mão.`,
    '// Gerado por supabase/montar-funcoes.mjs a partir de js/*.js e supabase/fonte/*.js.',
    '// Para publicar: Supabase › Edge Functions › (nova função ou a existente) › cole este arquivo inteiro › Deploy.',
    '',
    ...f.imports.map((i) => IMPORTS[i]),
    '',
    '// Os arquivos do sistema foram escritos para o navegador ("window"); no servidor, window = globalThis.',
    'const window = globalThis;',
    '',
    ...COMPARTILHADO.map((arq) => `// ===== ${arq} =====\n${ler(arq)}`),
    ler(f.entrada),
  ];
  const destino = join(raiz, 'supabase/functions', nome, 'index.ts');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, partes.join('\n'));
  console.log(`ok: supabase/functions/${nome}/index.ts`);
}
