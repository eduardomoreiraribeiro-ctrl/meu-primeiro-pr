# Como ligar o WhatsApp e o Assistente Nutri Dudu

Guia para fazer uma vez só. Leva de 1 a 2 horas, com calma. Faça na ordem.

Vamos começar pelo **número de teste gratuito da Meta**. Só depois que tudo funcionar você passa para o número definitivo da clínica (passo 9).

> Você vai juntar 5 "segredos" pelo caminho. Anote num bloco de notas, num lugar seguro, e **não envie para ninguém**:
> `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`.

## 1. Atualizar o banco de dados

1. No Supabase, abra o projeto › **SQL Editor** › **New query**.
2. Cole **todo** o conteúdo atual de `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success".

> É seguro rodar de novo: nada é apagado. Isso cria a tabela que guarda o uso e o custo do assistente.

## 2. Chave do Claude (o "cérebro" do assistente)

1. Entre em **console.anthropic.com** e crie uma conta.
2. Em **Billing**, coloque créditos. Comece com pouco, por exemplo US$ 10.
3. Em **API Keys** › **Create Key**, dê o nome `nutri-dudu` e copie a chave, que começa com `sk-ant-`.
   - Essa é a `ANTHROPIC_API_KEY`.

> **Custo:** cada resposta custa alguns centavos de dólar. No sistema você define um limite por mês (padrão: US$ 50). Ao atingir o limite, o assistente para e passa as conversas para a equipe.

## 3. App na Meta (WhatsApp Business)

1. Entre em **developers.facebook.com** com o seu Facebook › **Meus apps** › **Criar app**.
2. Escolha o caso de uso **Conectar-se com clientes pelo WhatsApp** e ligue o app a um **portfólio empresarial**. Se você não tiver um, a própria tela cria.
3. No menu do app, abra **WhatsApp › Configuração da API** (API Setup). Ali estão:
   - um **número de teste** da Meta;
   - o **Identificador do número de telefone** (Phone number ID), que é o `WHATSAPP_PHONE_NUMBER_ID`;
   - em **Para**, a opção de adicionar o **seu celular** como destinatário de teste. Faça isso: você recebe um código pelo WhatsApp.
4. Em **Configurações do app › Básico**, clique em **Mostrar**, ao lado de **Chave secreta do app** (App secret).
   - Essa é a `WHATSAPP_APP_SECRET`.
5. Invente uma senha qualquer, só com letras e números, por exemplo `nutridudu2026webhook`.
   - Essa é a `WHATSAPP_VERIFY_TOKEN`.

### Token permanente (não expira)

O token que aparece na Configuração da API dura só 24 horas. Para ter um permanente:

1. Abra **business.facebook.com** › **Configurações** › **Usuários › Usuários do sistema** › **Adicionar**.
   - Nome: `nutri-dudu`. Função: **Administrador**.
2. Clique no usuário criado › **Atribuir ativos** › escolha o seu **app** e marque **Controle total**.
3. Clique em **Gerar token**:
   - escolha o app;
   - validade: **Nunca**;
   - marque as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Copie o token. Essa é a `WHATSAPP_TOKEN`.

## 4. Publicar as duas funções no Supabase

As funções são o "servidor" que recebe as mensagens e chama o assistente. São dois arquivos prontos, que você vai colar no Supabase.

**Função 1: `whatsapp-webhook`**

1. No GitHub, abra o arquivo `crm-nutri-dudu/supabase/functions/whatsapp-webhook/index.ts`.
2. Clique no botão **Copy raw file**: é o ícone de duas folhinhas, no canto direito, acima do código.
3. No Supabase, abra **Edge Functions** › **Deploy a new function** › **Via Editor**.
4. Apague o exemplo, cole o código e dê o nome exato `whatsapp-webhook`.
5. Clique em **Deploy function**.
6. Abra a função › **Details** (ou Settings) e **desligue** a opção **Verify JWT** (Enforce JWT verification). Depois, salve.
   - Isso é necessário porque quem chama esta função é a Meta, que não tem login no seu sistema. A segurança aqui vem da assinatura da Meta, conferida com a `WHATSAPP_APP_SECRET`.

**Função 2: `whatsapp-enviar`**

1. Repita os passos acima com o arquivo `crm-nutri-dudu/supabase/functions/whatsapp-enviar/index.ts`.
2. Use o nome exato `whatsapp-enviar`.
3. Nesta função, deixe a opção **Verify JWT ligada**.
   - Se depois, ao responder pelo sistema, aparecer erro de "JWT", pode desligar: a função confere sozinha quem está logado.

## 5. Guardar os segredos no Supabase

1. No Supabase, abra **Edge Functions › Secrets** (Manage secrets).
2. Adicione um por um, com o nome **exatamente** assim:

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | a chave do passo 2 |
| `WHATSAPP_TOKEN` | o token permanente do passo 3 |
| `WHATSAPP_PHONE_NUMBER_ID` | o identificador do número |
| `WHATSAPP_APP_SECRET` | a chave secreta do app |
| `WHATSAPP_VERIFY_TOKEN` | a senha que você inventou |

> O endereço do projeto e a chave `service_role` **já ficam disponíveis automaticamente** para as funções. Você não precisa copiá-las nem colocá-las em lugar nenhum.

## 6. Ligar o webhook na Meta

1. Na Meta, abra **WhatsApp › Configuração** (Configuration) › **Webhook** › **Editar**.
2. **URL de callback:** `https://guhukcsadxbebtqdvuzm.supabase.co/functions/v1/whatsapp-webhook`
3. **Token de verificação:** a sua `WHATSAPP_VERIFY_TOKEN`.
4. Clique em **Verificar e salvar**. Se der erro, confira:
   - se o token está igual nos dois lugares;
   - se a função `whatsapp-webhook` está com o **Verify JWT desligado**.
5. Em **Campos do webhook**, clique em **Gerenciar** e assine (**Subscribe**) o campo **messages**.

## 7. Primeiro teste (assistente desligado)

1. Do seu celular (o que você cadastrou como destinatário de teste), mande "Oi" para o **número de teste** da Meta.
2. No sistema, abra **Conversas**. Em alguns segundos, aparece uma conversa nova, "Aguardando equipe", e o número vira um lead no Kanban.
3. Responda pelo sistema. A mensagem deve chegar no seu celular.

Se nada aparecer, abra no Supabase **Edge Functions › whatsapp-webhook › Logs** para ver o erro.

## 8. Ligar o assistente (modo piloto)

1. No sistema, abra **Configurações › Assistente do WhatsApp › Editar**.
2. Escreva as **informações da clínica**: endereço, estacionamento, formas de pagamento, regras de cancelamento, como funciona a consulta online.
   - Preços, serviços e horários ele já lê do sistema.
3. Confira o **horário da equipe** e os **limites**.
4. Marque **Assistente ligado** e salve.
5. Teste do seu celular, fingindo ser um paciente:
   - pergunte o preço da consulta;
   - peça horários;
   - agende;
   - pergunte algo de saúde: ele deve chamar a equipe, e não responder.
6. Teste também **PARAR**: a pessoa deixa de receber mensagens automáticas.

Use alguns dias assim, só com pessoas de confiança, antes de divulgar o número.

**Para assumir uma conversa:** clique em **Assumir conversa**, ou simplesmente responda. Enquanto a equipe atende, o assistente fica quieto. Para ele voltar, clique em **Devolver ao assistente**.

## 9. Número definitivo da clínica

1. Use um **número novo**: um chip que **não** esteja instalado no aplicativo do WhatsApp, nem no WhatsApp Business do celular.
2. Na Meta, abra **WhatsApp › Configuração da API** › **Adicionar número de telefone**.
   - Preencha o nome que aparece para os pacientes (passa por aprovação da Meta) e confirme o número com o código recebido por SMS ou ligação.
3. Cadastre um **cartão de pagamento** no WhatsApp Manager.
   - Responder dentro de 24 horas depois que o paciente escreve não tem custo de conversa. As mensagens que a clínica inicia (fase 10c) são cobradas pela Meta.
4. Troque o segredo `WHATSAPP_PHONE_NUMBER_ID` no Supabase pelo identificador do número novo.
5. Na Meta, deixe o app no modo **Publicado** (Live): botão no topo da página do app.
6. Se a Meta pedir, faça a **verificação da empresa** (CNPJ e documentos). Ela libera limites maiores de mensagens.

## Bom saber

- **Janela de 24 horas:** pelo WhatsApp oficial, a clínica só escreve livremente até 24 horas depois da última mensagem do paciente. Depois disso, o sistema avisa e bloqueia o campo de mensagem. As mensagens fora da janela (lembretes, cobranças) usam modelos aprovados pela Meta e chegam na **fase 10c**.
- **Áudios, fotos e documentos:** o assistente avisa que ainda não consegue abrir e pede para a pessoa escrever. A equipe vê que chegou um áudio ou uma foto e pode responder.
- **O que o assistente nunca faz:**
  - dar orientação de saúde, dieta ou suplementos;
  - ler o prontuário;
  - falar de outro paciente;
  - prometer desconto;
  - agendar em horário ocupado (o servidor confere tudo).
- **Erro ou limite atingido:** o paciente recebe "nossa equipe vai responder em breve" e a conversa aparece em **Aguardando equipe**, também no Dashboard.
- **Alterar o servidor:** o código fica em `supabase/fonte/`. Depois de mudar, rode `node supabase/montar-funcoes.mjs` e publique de novo, colando os `index.ts`.
- **Fuso horário:** o assistente usa o horário de Brasília. Para outro fuso, crie o segredo `CLINICA_FUSO_MINUTOS`. Por exemplo, `-240` para Manaus.
