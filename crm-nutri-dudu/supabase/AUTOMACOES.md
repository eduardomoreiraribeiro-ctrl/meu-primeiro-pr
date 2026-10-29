# Como ligar as mensagens automáticas e a pré-anamnese (fase 10c)

Faça isto depois que o WhatsApp e o Assistente estiverem funcionando ([`WHATSAPP.md`](WHATSAPP.md)). Leva de 1 a 2 horas, com calma.

## O que vai funcionar

| Mensagem | Quando |
|---|---|
| **Lembrete de consulta** | Até 40 horas antes. Vem com os botões **Confirmar** e **Remarcar**: "Confirmar" já confirma a consulta na agenda, e "Remarcar" passa para o assistente (ou para a equipe). |
| **Pré-anamnese** | Ao agendar a primeira consulta. Se não for preenchida, sai um lembrete 2 dias antes. |
| **Pagamento em atraso** | 1 dia depois do vencimento; no máximo 1 aviso por semana. |
| **Retorno pendente** | Cliente sem retorno marcado depois do prazo; no máximo 1 a cada 30 dias. |
| **Pacote acabando ou vencendo** | 1 aviso para cada situação. |
| **Reativação** | Cliente sumido; no máximo 1 a cada 90 dias. |
| **Agradecimento de indicação** | Quando uma pessoa indicada vira cliente. |
| **Link da consulta online** | Entre 3 horas e 15 minutos antes de cada consulta online, com o link da sala de vídeo do profissional (Configurações › Profissionais › Editar dados). O assistente também envia o link ao agendar online, e a confirmação pelo botão já vai com ele. |
| **Aviso para a equipe** | Quando uma conversa passa a aguardar a equipe, vai um aviso para os **celulares da equipe** cadastrados em Mensagens automáticas (não para o paciente). Fora do horário de envio, sai no começo do próximo. Só o nome do paciente e o motivo — nada de saúde. |

Regras:
- Só recebe quem deu **consentimento de WhatsApp** e não pediu para **PARAR**.
- As mensagens saem de **segunda a sábado, das 8h às 20h**. Esse horário pode ser mudado.
- Se a pessoa escreveu nas **últimas 24 horas**, a mensagem vai como **mensagem normal, sem custo**. Se não, vai com o **modelo aprovado pela Meta**, que é cobrado por mensagem.
- Cada mensagem pode ser ligada ou desligada separadamente. **Comece só com o lembrete e a pré-anamnese.**

## 1. Atualizar o banco de dados

1. No Supabase, abra **SQL Editor** › **New query**.
2. Cole **todo** o `supabase/schema.sql` atual e clique em **Run**. Deve aparecer "Success".
   - Isso cria a tabela dos links da pré-anamnese.

## 2. Atualizar as funções e criar a nova

São **três** funções. Use os links "crus" (raw) para copiar: toque e segure no texto › **Selecionar tudo** › **Copiar**.

| Função | Link do código | Verify JWT |
|---|---|---|
| `whatsapp-webhook` | https://raw.githubusercontent.com/eduardomoreiraribeiro-ctrl/meu-primeiro-pr/claude/zen-brown-jt56am/crm-nutri-dudu/supabase/functions/whatsapp-webhook/index.ts | **desligado** |
| `whatsapp-enviar` | https://raw.githubusercontent.com/eduardomoreiraribeiro-ctrl/meu-primeiro-pr/claude/zen-brown-jt56am/crm-nutri-dudu/supabase/functions/whatsapp-enviar/index.ts | ligado |
| `whatsapp-automacoes` (**nova**) | https://raw.githubusercontent.com/eduardomoreiraribeiro-ctrl/meu-primeiro-pr/claude/zen-brown-jt56am/crm-nutri-dudu/supabase/functions/whatsapp-automacoes/index.ts | **desligado** |

**Como atualizar uma função que já existe:**
1. No iPad, o mais fácil é apagar e criar de novo com o mesmo nome. Os segredos e o endereço continuam valendo.
2. Para apagar: abra **Edge Functions** › a função › **Settings** › **Delete function**.
3. Para criar: **Deploy a new function** › **Via Editor** › apague o exemplo › cole o código › dê o nome exato › **Deploy function**.
4. Depois de publicar, confira a coluna **Verify JWT** da tabela em **Settings**.
   - A função recriada volta com o Verify JWT **ligado**.
   - Desligue na `whatsapp-webhook` e na `whatsapp-automacoes`.

**Para conferir se o código é o certo:** a última parte do código diz `// ---- Entrada da função` seguido do nome da função.

## 3. Um segredo novo

1. Abra **Edge Functions › Secrets**.
2. Adicione:

| Nome | Valor |
|---|---|
| `AUTOMACOES_CHAVE` | uma senha comprida que você inventa, só com letras e números (ex.: `nutridudu2026automacoesXyz789`) |

Anote essa senha: você vai usar de novo no passo 4.

## 4. Agendar a verificação (a cada 30 minutos)

O Supabase chama a função `whatsapp-automacoes` sozinho, de meia em meia hora. A função vê o que precisa ser enviado e envia.

1. No Supabase, abra **Integrations** › **Cron**.
   - Se pedir, toque em **Enable pg_cron**.
2. Toque em **Create job** e preencha:
   - **Name:** `nutri-automacoes`
   - **Schedule:** `*/30 * * * *` (a cada 30 minutos)
   - **Type:** **Supabase Edge Function**
   - **Method:** POST, função `whatsapp-automacoes`
   - **Headers:** adicione `x-chave-automacoes` com a senha do passo 3
   - **Body:** `{"acao":"rodar"}`
3. Salve.

**Se essa tela for diferente,** faça pelo SQL Editor:
1. Em **Database › Extensions**, ligue `pg_cron` e `pg_net`.
2. Rode o código abaixo, trocando `SUA-SENHA` pela senha do passo 3:

```sql
select cron.schedule('nutri-automacoes', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://guhukcsadxbebtqdvuzm.supabase.co/functions/v1/whatsapp-automacoes',
    headers := '{"Content-Type": "application/json", "x-chave-automacoes": "SUA-SENHA"}'::jsonb,
    body := '{"acao": "rodar"}'::jsonb
  );
$$);
```

> Esse código com a sua senha fica só no Supabase. Não salve ele no GitHub.

## 5. Cadastrar os modelos na Meta

Fora das 24 horas, o WhatsApp só deixa a clínica escrever usando **modelos aprovados**. Cadastre um modelo para cada mensagem que for ligar.

1. No sistema, abra **Configurações › Mensagens automáticas** e toque em **Texto para a Meta** na mensagem que quer cadastrar. Ali estão o nome, a categoria, o texto e os exemplos, com botões de **Copiar**.
2. Na Meta, abra o **Gerenciador do WhatsApp** (business.facebook.com › Configurações › Contas do WhatsApp › a conta › **Gerenciador do WhatsApp**) › **Modelos de mensagem** › **Criar modelo**.
   - Use a **mesma conta do número que envia as mensagens**. Enquanto for o número de teste, é a **Test Messaging Account**.
3. Preencha exatamente como no sistema:
   - **Categoria:** a indicada (Utilidade ou Marketing).
   - **Nome:** o nome indicado (ex.: `nutridudu_lembrete_consulta`).
   - **Idioma:** Português (BR).
   - **Corpo:** cole o texto. A Meta mostra as variáveis `{{1}}`, `{{2}}`…; preencha os **exemplos** que o sistema mostra.
   - **Botões** (só no lembrete): **Resposta rápida** › `Confirmar` e `Remarcar`, nessa ordem.
4. Envie para análise. Costuma ser aprovado em minutos, às vezes em algumas horas.
5. A Meta pode trocar a categoria (por exemplo, de Utilidade para Marketing). Tudo bem: o sistema funciona igual, só muda o preço.

## 6. Ligar no sistema

1. Abra **Configurações › Mensagens automáticas › Editar**.
2. Em **Endereço do sistema**, confira se está o endereço em que você abre o sistema (ex.: `https://eduardomoreiraribeiro-ctrl.github.io/meu-primeiro-pr/crm-nutri-dudu`).
   - O link da pré-anamnese usa esse endereço.
3. Ligue **só** as mensagens cujo modelo já foi **aprovado**. O nome do modelo precisa ser igual ao da Meta.
4. Salve.

## 7. Testar

1. Na **Agenda**, marque uma **primeira consulta** para amanhã para um cliente com o **seu celular** (com consentimento de WhatsApp).
2. Em **Configurações › Mensagens automáticas**, toque em **Verificar e enviar agora**.
   - Aparece a lista do que foi enviado, do que não foi e o motivo.
3. No celular, devem chegar:
   - **o lembrete**, com os botões. Toque em **Confirmar**: a consulta fica "Confirmada" na agenda;
   - **o link da pré-anamnese**. Abra, preencha e envie.
4. Na ficha do cliente, aba **Anamnese**, aparece **"Pré-anamnese enviada pelo paciente — a revisar"**. A agenda mostra "Pré-anamnese: Preenchida".

Depois disso, o Supabase verifica sozinho a cada 30 minutos.

## Bom saber

- **A pré-anamnese quando o assistente agenda:** o link vai na hora, logo depois da confirmação do agendamento, como mensagem normal (sem custo).
- **Onde ver o que foi enviado:**
  - em **Conversas**, as mensagens automáticas aparecem com ⏰;
  - no **histórico** do cliente;
  - na **agenda**, nos detalhes da consulta.
- **Erros:** aparecem em **Configurações › Mensagens automáticas** (por exemplo, "modelo não existe"). O sistema tenta de novo 6 horas depois.
- **Segurança da pré-anamnese:**
  - o link é pessoal e vale até o fim do dia da consulta;
  - só pode ser usado uma vez;
  - as respostas vão direto para o banco e só a nutricionista vê;
  - o assistente nunca lê as respostas.
- **Alterar os textos:** se mudar um texto no código (`js/mensagens-automaticas.js`), cadastre o modelo de novo na Meta com o texto novo.
