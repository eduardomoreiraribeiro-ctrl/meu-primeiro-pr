# Como ligar o Nutri Dudu à nuvem (Supabase)

Guia para fazer uma vez só. Leva uns 15 minutos.

## 1. Criar o banco de dados

1. Entre no painel do Supabase e abra o projeto **nutri-dudu**.
2. No menu da esquerda, clique em **SQL Editor** e depois em **New query**.
3. Abra o arquivo `supabase/schema.sql` (desta pasta), copie **todo** o conteúdo e cole na tela do Supabase.
4. Clique em **Run** (ou Ctrl+Enter). Deve aparecer **"Success. No rows returned"**.

> Pode rodar de novo sem medo: o script não apaga dados.

## 2. Fechar o cadastro livre (segurança)

Para ninguém de fora conseguir criar uma conta sozinho:

1. Menu **Authentication** › **Sign In / Providers**.
2. Desligue **Allow new users to sign up** e salve.

As contas da equipe são criadas por você, no passo 3.

## 3. Criar o seu acesso (administrador)

1. Menu **Authentication** › **Users** › **Add user** › **Create new user**.
2. Informe o seu e-mail e uma senha forte.
3. Marque **Auto Confirm User** e clique em **Create user**.

O **primeiro** usuário criado vira **administrador** automaticamente.

## 4. Abrir o sistema

1. Abra o `index.html` (dois cliques). Aparece a tela **Entrar**.
2. Entre com o e-mail e a senha do passo 3.
3. Na primeira vez, escolha **Começar a clínica do zero**, informe o seu nome e o CRN e pronto.
   - Para treinar antes, use **Carregar dados de exemplo**. Depois, apague tudo em
     **Configurações › Dados e backup › Começar do zero…**.

## 5. Cadastrar a equipe

Para cada pessoa:

1. No Supabase: **Authentication › Users › Add user** (e-mail, senha provisória, **Auto Confirm User**).
2. No sistema: **Configurações › Equipe e acessos**. A pessoa aparece como "Aguardando liberação".
   - Escolha o perfil: **Profissional** (escolha também a ficha de profissional dela) ou **Recepção**.
   - Clique em **Salvar**.
3. Passe o e-mail e a senha provisória para a pessoa. No primeiro acesso, ela troca a senha
   no menu com o nome dela (canto superior direito) › **Trocar senha**.

Para tirar o acesso de alguém: mude o perfil para **Desativado**. O histórico continua guardado.

## Bom saber

- **Esqueceu a senha?** O administrador redefine no Supabase: **Authentication › Users** › clique na pessoa ›
  envie a recuperação de senha ou crie uma nova senha.
- **Backup:** faça um backup por semana em **Configurações › Dados e backup › Exportar backup** e guarde o
  arquivo em local seguro (ele tem dados de saúde).
- **Projeto gratuito pausa:** no plano gratuito, o Supabase pausa o projeto depois de alguns dias sem uso.
  Se o sistema não conectar, entre no painel do Supabase e clique em **Restore project**.
- **Demonstração:** a tela de login tem o link **Abrir a demonstração**, com dados fictícios salvos só no
  navegador, para treinar sem mexer nos dados reais.
- **Chaves:** o arquivo `js/nuvem-config.js` tem o endereço do projeto e a chave **anon public**. Ela pode
  ficar ali. A chave **service_role** **nunca** deve ser colocada no sistema nem enviada a ninguém.

## O que fica protegido, e onde

| Quem | Vê | Não vê |
|---|---|---|
| Administrador | tudo, inclusive a auditoria | — |
| Profissional | agenda, clientes, prontuário, fotos | baixa de pagamentos, a equipe |
| Recepção | agenda, clientes, Kanban, financeiro | anamnese, avaliação, fotos, anotações e condutas (o servidor nem envia) |
| Aguardando liberação / desativado | nada | tudo |

As regras valem **no banco de dados**, não só nas telas: mesmo alguém que tente burlar o sistema não recebe o
que o perfil dele não pode ver. Abrir, criar ou alterar um prontuário fica registrado na tabela `auditoria`
(quem, quando, qual paciente).
