# CRM Nutri Dudu — Planejamento

Documento de planejamento do CRM da clínica de nutrição **Nutri Dudu**. **Andamento:** fases 1 a 8 (Base, Serviços e profissionais, Clientes, Agenda, Prontuário + Pacotes e financeiro, Kanban, Retornos e Dashboard, Acabamento) concluídas — o protótipo está completo — ver [`README.md`](README.md). Próxima: fase 9 (Nuvem: Supabase com login e permissões no banco).

**Versão 7** — inclui agenda por profissional, origens de leads, anamnese (com **pré-anamnese enviada pelo WhatsApp**), fotos de antes e depois, pacotes longos e controle de retorno. Todas as decisões estão na seção 17; nenhuma em aberto.

---

## 1. Objetivo

Ter um sistema simples, moderno e fácil de usar para:

- acompanhar a operação da clínica em um só lugar (Dashboard);
- controlar a **agenda de cada profissional** (horários, bloqueios, consultas);
- conduzir leads até virarem clientes (funil comercial), sabendo de onde cada um veio;
- acompanhar os clientes em tratamento e garantir que **ninguém fique sem retorno marcado**;
- manter o **prontuário** de cada cliente: anamnese, consultas, avaliações físicas, fotos de evolução, pacotes, financeiro e histórico de relacionamento;
- manter o catálogo de serviços e preços da clínica;
- atender leads e clientes pelo WhatsApp com um **agente de IA** integrado ao CRM.

---

## 2. Usuários e permissões

Quatro perfis:

| Perfil | Quem é |
|---|---|
| **Administrador** | dono(a) da clínica; também pode ser profissional. Configura tudo |
| **Profissional** | nutricionista que atende. Vê todas as agendas e o prontuário de todos os clientes |
| **Recepção** | agenda, cadastro, Kanban, financeiro e WhatsApp; **sem acesso a dados clínicos** |
| **Agente de IA** | Assistente Nutri Dudu no WhatsApp; só vê dados da pessoa que está conversando, sem nada clínico (seção 12.6) |

| Área | Admin | Profissional | Recepção |
|---|:---:|:---:|:---:|
| Dashboard — comercial, agenda e financeiro | ✅ todos | ✅ só os seus números | ✅ todos |
| Agenda | ✅ todos | ✅ a sua (vê as dos colegas como ocupado/livre) | ✅ todos |
| Agendar, remarcar, cancelar, confirmar consultas | ✅ | ✅ na sua agenda | ✅ |
| Kanban — funil comercial e de acompanhamento | ✅ | ✅ | ✅ (sem dados clínicos) |
| Clientes — cadastro (nome, contato, origem, tags) | ✅ | ✅ | ✅ |
| **Anamnese, anotações clínicas, plano alimentar** 🔒 | ✅ | ✅ de todos os clientes | ❌ |
| **Avaliação física e fotos** 🔒 | ✅ | ✅ de todos os clientes | ❌ |
| Registrar atendimento (consulta realizada) | ✅ | ✅ | ❌ |
| Financeiro — cobranças e baixa de pagamentos | ✅ | 👁️ só visualiza os seus | ✅ |
| Pacotes — contratar e ver saldo | ✅ | ✅ | ✅ |
| Serviços e preços | ✅ | 👁️ | 👁️ |
| Profissionais, horários de atendimento | ✅ | ✅ só os seus horários e bloqueios | ✅ bloqueios |
| Conversas do WhatsApp | ✅ | ✅ | ✅ |
| Configurar agente de IA e automações | ✅ | ❌ | ❌ |
| Restaurar, exportar ou apagar dados | ✅ | ❌ | ❌ |

**Situação atual:** a clínica começa com **uma nutricionista**, que também é a administradora. O sistema já nasce preparado para mais nutricionistas (agenda por profissional, cor, horários), sem precisar mudar nada quando alguém entrar. Todos os profissionais são nutricionistas e todos veem o prontuário de todos os clientes.

- **No protótipo** (dados só no navegador) não existe login de verdade: um seletor "Ver como: Admin / Profissional / Recepção" no topo simula o perfil, só para validar as telas.
- **Na versão na nuvem** (fase 9) o login é obrigatório e as permissões são aplicadas também no banco de dados (regras de segurança do Supabase), não só escondendo botões na tela.

---

## 3. Mapa de páginas e navegação

```
┌───────────────┬─────────────────────────────────────────────┐
│  NUTRI DUDU   │  Busca global · + Novo · Perfil             │
│               ├─────────────────────────────────────────────┤
│ ▸ Dashboard   │                                             │
│ ▸ Agenda      │            Conteúdo da página               │
│ ▸ Kanban      │                                             │
│ ▸ Clientes    │                                             │
│ ▸ Conversas   │                                             │
│ ▸ Serviços    │                                             │
│ ▸ Config.     │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

| Página | Rota | Função |
|---|---|---|
| Dashboard | `/` | Visão geral, indicadores e listas de ação |
| Agenda | `/agenda` | Agenda por profissional (dia, semana, mês) |
| Kanban | `/kanban/comercial` e `/kanban/acompanhamento` | Os dois funis, com cards arrastáveis |
| Clientes | `/clientes` | Lista de todos os clientes |
| Cliente (individual) | `/clientes/:id` | Prontuário e ficha completa |
| Conversas | `/conversas` | Caixa de entrada do WhatsApp (agente + equipe) |
| Serviços | `/servicos` | Cadastro de serviços, pacotes e valores |
| Configurações | `/configuracoes` | Profissionais, horários, regras de retorno, agente de IA e automações |

- Menu lateral fixo no desktop; no celular vira um menu inferior com os itens principais.
- Botão **"+ Novo"** sempre visível: lead, cliente, consulta, pagamento ou pacote.
- Itens que o perfil não pode ver simplesmente não aparecem.

---

## 4. Modelo de dados

O mesmo cadastro (**Pessoa**) serve para lead e cliente. O que muda é **em qual funil** e **em qual etapa** ela está. Quando um lead fecha, ele passa para o funil de acompanhamento sem precisar de novo cadastro.

### 4.1 Pessoa (lead / cliente)

| Campo | Tipo | Observação |
|---|---|---|
| id | texto | gerado automaticamente |
| nome | texto | obrigatório |
| telefone / WhatsApp | texto | obrigatório |
| e-mail | texto | |
| data de nascimento | data | idade calculada (usada nas fórmulas de % de gordura) |
| sexo | opção | usado nas fórmulas de % de gordura |
| CPF | texto | opcional, útil para recibos |
| endereço / cidade | texto | |
| **origem** | opção | **Instagram, WhatsApp direto, Indicação de cliente, Presencial**, Outro |
| **indicado por** | referência → Pessoa | obrigatório quando a origem é "Indicação de cliente" |
| objetivo | opção | emagrecimento, hipertrofia, saúde, esportiva, gestante, outro |
| **profissional responsável** | referência → Profissional | agenda preferida e quem acompanha o cliente (hoje, sempre a nutricionista da clínica) |
| funil / etapa | opção | funil `comercial` ou `acompanhamento` e a etapa (seção 8) |
| etapa desde | data-hora | para calcular "dias na etapa" |
| motivo da perda | opção + texto | quando vai para "Perdido" |
| **cliente desde** | data | quando fechou (virou cliente); base de "clientes novos" e da conversão |
| status | opção | lead, cliente ativo, cliente inativo |
| serviço de interesse | referência → Serviço | |
| **retorno a cada (dias)** | número | periodicidade esperada; padrão vem das Configurações (60 dias), pode ser ajustada por cliente (seção 6) |
| observações gerais | texto longo | visível para todos os perfis (nada clínico aqui) |
| tags | lista | ex.: "VIP", "gestante" |
| consentimentos | sim/não + data | uso de dados de saúde, mensagens no WhatsApp, fotos clínicas, uso de imagem em divulgação |
| agente pausado | sim/não | quando a equipe assume a conversa, o agente para de responder essa pessoa |
| criado em / atualizado em | data-hora | automático |

**Origens dos leads — como cada uma chega:**

| Origem | Como entra no CRM |
|---|---|
| Instagram | cadastro pela recepção (direct/comentário) ou pelo agente, quando a pessoa diz que veio do Instagram |
| WhatsApp direto | **automático**: número novo que manda mensagem vira lead (seção 12) |
| Indicação de cliente | cadastro com o campo **"indicado por"**; o cliente que indicou ganha a contagem de indicações na ficha dele |
| Presencial | cadastro rápido pela recepção no balcão |

### 4.2 Profissional (nova)

| Campo | Observação |
|---|---|
| nome, foto | |
| registro | Nutricionista — CRN (todos os profissionais são nutricionistas) |
| cor na agenda | cada profissional tem uma cor |
| serviços que realiza | referência → Serviços |
| usuário de acesso e perfil | profissional ou admin |
| ativo | profissionais desligados somem da agenda, mas o histórico continua |

### 4.3 Agenda: horários, bloqueios e consultas (nova)

**Horários de atendimento** — por profissional:

| Campo | Observação |
|---|---|
| profissional | |
| dia da semana, início, fim | ex.: segunda, 08:00–12:00 e 14:00–18:00 (vários períodos por dia) |
| modalidade | presencial, online ou ambos |
| intervalo entre consultas | ex.: 10 min |

**Bloqueios** — férias, feriados, cursos, almoço estendido: profissional (ou "clínica toda"), início, fim e motivo.

**Consulta** (é o agendamento):

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| **profissional** | referência → Profissional | obrigatório |
| data e hora de início / fim | data-hora | o fim é sugerido pela duração do serviço |
| tipo | opção | primeira consulta, retorno, avaliação, online |
| serviço | referência → Serviço | define duração e valor sugerido |
| pacote contratado | referência (opcional) | se preenchido, a consulta desconta do saldo do pacote |
| status | opção | agendada, **confirmada**, realizada, faltou, cancelada |
| agendada por | opção | recepção, profissional, agente de IA |
| anamnese (revisão) 🔒 | referência → Anamnese | quando a anamnese é atualizada na consulta |
| avaliação física 🔒 | referência → Avaliação | |
| fotos 🔒 | lista → Foto | fotos de evolução anexadas à consulta |
| anotações / evolução 🔒 | texto longo | |
| plano alimentar / condutas 🔒 | texto longo | |
| próximo retorno | data | sugerido pela periodicidade do cliente (seção 6) |

Regras: não permite dois agendamentos no mesmo horário para o mesmo profissional, nem fora do horário de atendimento ou em bloqueio (o admin pode forçar um **encaixe**, que fica marcado).

### 4.4 Anamnese / ficha de avaliação 🔒 (nova)

Preenchida na primeira consulta e **revisada** nas seguintes. Cada revisão gera uma nova versão; a ficha mostra a versão atual e permite ver as anteriores ("o que mudou").

| Seção | Campos |
|---|---|
| Queixa e objetivo | queixa principal, objetivo, expectativas, tentativas anteriores |
| **Histórico de saúde** | doenças diagnosticadas (diabetes, hipertensão, tireoide, SOP etc.), cirurgias, internações, histórico familiar, gestação/lactação, ciclo menstrual |
| **Alergias e intolerâncias** | lista: substância/alimento, tipo (alergia ou intolerância), gravidade |
| **Contraindicações** | lista: restrições clínicas, alimentares ou de atividade física, com observação |
| **Medicamentos e suplementos** | lista: nome, dose, frequência, desde quando |
| Hábitos de vida | sono, atividade física (tipo, frequência), água, álcool, tabagismo, funcionamento intestinal, estresse |
| Hábitos alimentares | rotina de refeições, recordatório 24 h, preferências, aversões, quem cozinha, refeições fora de casa |
| Exames | exames laboratoriais com data e valores principais (anexo em PDF/foto opcional) |

- **Alertas visíveis:** alergias graves e contraindicações aparecem como **faixa vermelha no topo da ficha** e no formulário de atendimento, para o profissional nunca deixar passar.
- Campos em lista (alergias, medicamentos) são estruturados, não texto livre, para poder filtrar ("clientes que usam metformina") e alertar.

**Pré-anamnese (preenchida pelo paciente):**
- Ao agendar a **primeira consulta**, o agente envia pelo WhatsApp um **link para um formulário** com parte da anamnese: objetivo, histórico de saúde, alergias, medicamentos, hábitos de vida e alimentares.
- O link é **único, pessoal e expira** (ex.: até a data da consulta). O formulário é uma página segura do próprio sistema, simples de preencher no celular, e começa pedindo o consentimento para dados de saúde.
- As respostas entram na ficha como **"pré-anamnese — a revisar"**, visíveis só para a nutricionista. Na consulta, ela confere, completa e confirma, gerando a primeira versão da anamnese.
- O **agente não lê as respostas**: ele só envia o link e pode lembrar o paciente de preencher (1 lembrete, 2 dias antes da consulta).
- A agenda e a ficha mostram se a pré-anamnese foi **enviada, preenchida ou pendente**.

### 4.5 Avaliação física 🔒

Separada da consulta para facilitar os gráficos de evolução e permitir avaliação avulsa (ex.: só bioimpedância).

| Grupo | Campos |
|---|---|
| Básico | peso (kg), altura (cm), **IMC** (calculado) |
| Composição corporal | % de gordura, **método** (bioimpedância / dobras cutâneas / outro), massa gorda (kg) e massa magra (kg) calculadas |
| Circunferências (cm) | braço relaxado, braço contraído, tórax, cintura, abdome, quadril, coxa, panturrilha; **relação cintura-quadril** (calculada) |
| Dobras cutâneas (mm) | tricipital, bicipital, subescapular, peitoral, axilar média, suprailíaca, abdominal, coxa, panturrilha; **soma das dobras** (calculada) |

- Todos os campos são opcionais: o profissional preenche só o que mediu.
- Com o método **dobras cutâneas**, o sistema calcula o % de gordura usando idade e sexo do cliente. A fórmula é escolhida em cada avaliação:
  - **Jackson & Pollock 7 dobras** (padrão): peitoral, axilar média, tricipital, subescapular, abdominal, suprailíaca e coxa;
  - **Jackson & Pollock 3 dobras**: homens: peitoral, abdominal e coxa; mulheres: tricipital, suprailíaca e coxa;
  - **Durnin & Womersley**: bicipital, tricipital, subescapular e suprailíaca.

  As três estimam a densidade corporal, convertida em % de gordura pela equação de Siri. A fórmula usada fica salva com a avaliação.
- Também é possível digitar o % de gordura manualmente (ex.: resultado da bioimpedância).
- Comparar avaliações com métodos diferentes distorce a evolução: o gráfico marca os pontos em que o método mudou.

### 4.6 Fotos de evolução 🔒 (nova)

| Campo | Observação |
|---|---|
| pessoa, consulta | toda foto fica anexada a uma consulta (e, portanto, a uma data) |
| ângulo | frente, perfil direito, perfil esquerdo, costas, outro |
| arquivo | imagem (JPG/PNG), reduzida automaticamente para economizar espaço |
| observação | opcional |

- Na consulta: botão **"Adicionar fotos"** (tirar com a câmera do celular/tablet ou escolher arquivos), já marcando o ângulo.
- Na ficha: aba **Fotos** com a galeria por data e o **comparador antes × depois**: escolhe duas datas e o sistema mostra as fotos do mesmo ângulo lado a lado, com peso e % de gordura de cada data.
- Só profissional e admin veem. Exige o **consentimento de fotos clínicas** do cliente; uso em divulgação (Instagram, site) é **outro consentimento**, separado.

### 4.7 Pacote contratado

Liga um cliente a um serviço do tipo pacote e controla o saldo.

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| serviço | referência → Serviço (categoria pacote) | |
| data de início | data | |
| validade | data | sugerida pelo serviço; pode ser **prorrogada** |
| consultas incluídas | número | copiado do serviço na contratação (ex.: 3, 6, **12**) |
| **frequência prevista** | opção | semanal, quinzenal, **mensal**, livre; ex.: plano anual = 12 consultas, 1 por mês |
| consultas usadas | número | **calculado**: consultas *realizadas* ligadas ao pacote |
| saldo | número | **calculado**: incluídas − usadas |
| valor negociado / parcelamento | moeda / nº de parcelas | ex.: 12× no cartão ou mensalidade |
| status | opção | ativo, concluído (saldo 0), vencido, cancelado |

**Exemplos de pacotes:** trimestral (3 consultas, 3 meses), semestral (6 consultas, 6 meses), **anual (12 consultas, 12 meses, 1 por mês)**.

**Regras de saldo**
- Só desconta quando a consulta fica **realizada**. Agendadas aparecem como "reservadas" (ex.: "5 de 12 usadas · 1 agendada").
- Falta: por padrão **desconta**, mas o profissional pode marcar "não descontar" (ex.: falta avisada). Fica registrado no histórico.
- Vencimento: consultas que sobram quando a validade termina **expiram**; aviso 15 dias antes; o admin pode prorrogar.
- **Ritmo do pacote:** com frequência prevista, o sistema compara o uso com o esperado ("mês 6 de 12, usou 4 → 2 consultas atrasadas") e avisa quando o cliente está ficando para trás. Isso alimenta o controle de retorno (seção 6).
- Ao agendar para quem tem pacote ativo, o pacote já vem selecionado.
- Avisos: saldo de 1 consulta, vencendo em 15 dias, concluído, consultas atrasadas. Alimentam a etapa "Renovação" ou "Retorno a agendar" do funil de acompanhamento.

### 4.8 Lançamento financeiro

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| consulta ou pacote contratado | referência (opcional) | consulta avulsa ou parcela de pacote |
| serviço, profissional | referência | permite faturamento por profissional |
| descrição | texto | ex.: "Plano anual — parcela 3/12" |
| valor / desconto | moeda (R$) | |
| vencimento | data | |
| data do pagamento | data | vazio = em aberto |
| forma de pagamento | opção | Pix, crédito, débito, dinheiro, transferência |
| status | opção | pago, pendente, cancelado; **atrasado** é calculado (pendente com vencimento passado) |

### 4.9 Serviço

| Campo | Tipo | Observação |
|---|---|---|
| nome, descrição | texto | ex.: "Consulta inicial", "Plano anual" |
| valor | moeda (R$) | |
| duração (min) | número | usada na agenda |
| categoria | opção | consulta, retorno, pacote, avaliação, outro |
| profissionais que realizam | referência → Profissionais | |
| modalidade | presencial, online, ambos | |
| consultas incluídas, validade, frequência prevista | número / dias / opção | só para pacotes |
| ativo | sim/não | inativos somem dos formulários, mas o histórico continua |

### 4.10 Interação (histórico de relacionamento)

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| data-hora | data-hora | |
| tipo | opção | ligação, WhatsApp, e-mail, nota, mudança de etapa, consulta, pagamento, pacote, indicação, ação do agente |
| descrição | texto | |
| automático | sim/não | eventos gerados pelo sistema |
| autor | usuário | admin, profissional, recepção ou agente de IA |

> Mudanças de etapa, agendamentos, consultas, pagamentos, pacotes e indicações geram **interações automáticas**. A linha do tempo do cliente se monta sozinha.

### 4.11 Conversa e mensagem

| Entidade | Campos principais |
|---|---|
| **Conversa** | pessoa, número do WhatsApp, status (agente atendendo / aguardando equipe / equipe atendendo / encerrada), responsável, última mensagem, início da janela de 24 h |
| **Mensagem** | conversa, direção (recebida / enviada), autor (contato / agente / usuário), texto, tipo (texto, áudio, imagem, modelo aprovado), data-hora, status de entrega |

### Relacionamentos

```
Profissional 1 ──┬── N Horário de atendimento / Bloqueio
                 └── N Consulta
                         │
Pessoa 1 ──┬── N Consulta 1 ──┬── 0..1 Avaliação física
           │       │          ├── 0..1 Revisão da Anamnese
           │       │          └── N Foto
           │       └── N..1 Pacote contratado N──1 Serviço
           ├── N Anamnese (versões)
           ├── N Lançamento financeiro (consulta ou pacote)
           ├── N Interação
           ├── N Conversa ── N Mensagem
           └── N Pessoa (indicações: "indicado por")
```

---

## 5. Página: Agenda (nova)

```
┌───────────────────────────────────────────────────────────────┐
│ ◀ Hoje ▶  Qua, 07/10   [Dia|Semana|Mês|Lista]  Prof.: [Todos ▾]│
├──────┬──────────────────┬──────────────────┬──────────────────┤
│      │ Dra. Ana 🟢      │ Dr. Bruno 🔵     │ Dra. Carla 🟣    │
│ 08:00│ Maria S. ✓       │                  │ ░ bloqueio ░     │
│ 09:00│ (livre)          │ João L. · retorno│ ░ curso    ░     │
│ 10:00│ Pedro A. · 1ª 🤖  │ (livre)          │ Lia M. ✓         │
│ 11:00│ Rita C. · online │ Ana P. ⚠ faltou  │ (livre)          │
└──────┴──────────────────┴──────────────────┴──────────────────┘
 ✓ confirmada   🤖 agendada pelo agente   ⚠ faltou   ░ bloqueio
```

- **Visões:** dia (uma coluna por profissional), semana, mês e lista. Filtro por profissional; o profissional abre direto em "minha agenda".
- **Cores** por profissional e ícones de status (agendada, confirmada, realizada, faltou, cancelada; agendada pelo agente).
- **Agendar:** clicar num horário livre abre a janela de agendamento: buscar cliente (ou cadastrar lead rápido), serviço, pacote (se houver), modalidade. A duração vem do serviço.
- **Remarcar:** arrastar o agendamento para outro horário ou profissional; o sistema checa conflito e, se o cliente tiver WhatsApp, oferece avisar.
- **Bloqueios:** criar férias, feriados e compromissos direto na agenda.
- **Atalhos no agendamento:** abrir ficha, iniciar atendimento (🔒), marcar falta, confirmar, WhatsApp.
- **Indicadores:** taxa de ocupação por profissional (horas agendadas ÷ horas disponíveis) no topo da semana.
- **Celular:** visão de lista do dia, com botão de agendar.

---

## 6. Retorno e recorrência (nova)

Objetivo: **nenhum cliente ativo fica sem próximo passo**. Exemplo do alerta:

> ⚠ **Fernanda Lima** fez a última consulta há **2 meses** (07/08) e **não tem retorno marcado**. [Agendar] [WhatsApp] [Dispensar por 30 dias]

**Regras (configuráveis em Configurações):**

| Situação | Quando dispara |
|---|---|
| **Sem retorno marcado** | cliente ativo, última consulta realizada há mais de **N dias** (padrão 60, ou a periodicidade do cliente) e **nenhuma consulta futura** agendada |
| Retorno vencido | a data de "próximo retorno" definida na consulta passou e não há agendamento |
| Pacote atrasado | pacote com frequência prevista e menos consultas que o esperado até hoje |
| Falta sem remarcação | cliente faltou e não remarcou em 7 dias |
| Cliente sumido | sem consulta há mais de 120 dias → sugere mudar para "inativo" e entrar na reativação |

**Onde o alerta aparece:**
- **Dashboard:** lista "Retornos pendentes", ordenada por dias sem consulta, com botões Agendar e WhatsApp.
- **Clientes:** coluna "dias desde a última consulta" e filtro "sem retorno marcado".
- **Ficha do cliente:** faixa de aviso no topo.
- **Kanban de acompanhamento:** o card vai sozinho para "Retorno a agendar".
- **Agente de IA (fase 10):** envia o convite de retorno pelo WhatsApp, com horários livres do profissional responsável.

**Indicadores de recorrência** (Dashboard): taxa de retorno (clientes que voltaram dentro do prazo), média de consultas por cliente, tempo médio entre consultas e clientes sem retorno por profissional.

"Dispensar" esconde o alerta por um período (ex.: cliente viajando) e registra o motivo no histórico.

---

## 7. Página: Dashboard

### 7.1 Já implementado (pedido da clínica, adiantado da fase 7)

Filtro de período: **Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Mês passado · Personalizado** (datas de/até). O período escolhido fica lembrado no navegador.

| Indicador | Como é calculado |
|---|---|
| **Clientes novos** | pessoas cuja data "cliente desde" (quando fecharam) está no período |
| **Total de atendimentos** | consultas **realizadas** no período; as agendadas/confirmadas do período aparecem à parte ("+ N agendados") |
| **Faturamento estimado** | soma de todos os lançamentos (pagos e a receber, sem cancelados) com vencimento no período, já com desconto; mostra também quanto já foi recebido |
| **Taxa de conversão** | dos leads que chegaram no período, quantos já viraram clientes ("4 de 11 leads") |
| **Agendamentos do dia** | consultas de hoje (sempre hoje, independente do filtro), com horário, cliente, serviço, status e se foi o agente que agendou |
| **Leads por etapa do Kanban** | quantidade em cada etapa do funil comercial, **situação atual** (não depende do período); "Perdido" em cinza |
| **Serviços e planos mais realizados** | atendimentos realizados no período agrupados por serviço/plano, do mais para o menos realizado |
| **Origem dos leads** | leads que chegaram no período por origem (Instagram, WhatsApp direto, Indicação, Presencial) |
| **Dias mais movimentados** | atendimentos realizados e agendados no período por dia da semana; o dia mais cheio fica destacado |

Os gráficos usam uma só cor (o verde da clínica) e sempre mostram o número escrito ao lado da barra; passando o mouse aparece o valor e o percentual.

### 7.2 Concluído na fase 7

**Filtros** no topo: período (Hoje · 7 dias · Este mês · Mês passado · Personalizado) e **profissional**.

**Indicadores (KPIs)**

| Indicador | Cálculo |
|---|---|
| Faturamento do período | soma dos lançamentos pagos (total e por profissional) |
| A receber | lançamentos pendentes + atrasados |
| Consultas realizadas | consultas "realizada" no período |
| **Ocupação da agenda** | horas agendadas ÷ horas disponíveis, por profissional |
| Novos leads | por origem: Instagram, WhatsApp, Indicação, Presencial |
| Taxa de conversão | leads que chegaram a "Fechado" ÷ leads do período (total e por origem) |
| Clientes ativos | status = cliente ativo |
| Ticket médio | faturamento ÷ nº de pagamentos |
| Taxa de faltas | consultas "faltou" ÷ consultas agendadas |
| Pacotes ativos / taxa de renovação | pacotes ativos; concluídos que renovaram ÷ concluídos |
| **Taxa de retorno** | clientes que voltaram dentro do prazo ÷ clientes que deveriam voltar |

**Gráficos**
- Faturamento por mês (últimos 12 meses), por profissional.
- Funil comercial por etapa.
- **Leads por origem** e conversão de cada origem.
- **Clientes que mais indicaram.**
- Serviços e pacotes mais vendidos.

**Listas de ação**
- Agenda de hoje (por profissional) e consultas a confirmar.
- **Retornos pendentes** (seção 6).
- Pagamentos atrasados.
- Pacotes acabando, vencendo ou atrasados.
- Aniversariantes da semana.
- Leads parados há mais de X dias na mesma etapa.
- Conversas do WhatsApp aguardando a equipe (fase 10).

---

## 8. Página: Kanban (dois funis)

No topo da página, uma alternância **Comercial | Acompanhamento**. Cada funil tem suas próprias colunas, filtros e contadores.

### 8.1 Funil comercial (leads)

1. **Novo lead** — o contato chegou
2. **Contato feito** — primeira conversa realizada
3. **Consulta agendada**
4. **Proposta / negociação** — plano ou pacote apresentado
5. **Fechado** — virou cliente ✅
6. **Perdido** — com motivo (preço, sem resposta, desistiu…)

Ao mover para **Fechado**:
1. o sistema pergunta qual serviço ou pacote foi vendido e oferece criar o **pacote contratado** e a **cobrança** (com parcelas);
2. pede o **profissional responsável**;
3. o status muda para "cliente ativo" e o card **passa para o funil de acompanhamento**, na etapa "Início do tratamento". O histórico registra a passagem.

O card de "Fechado" continua visível no funil comercial por 30 dias, esmaecido.

### 8.2 Funil de acompanhamento (clientes)

1. **Início do tratamento** — fechou, primeira consulta a fazer
2. **Em tratamento** — consultas em dia, retorno agendado
3. **Retorno a agendar** — disparado pelas regras da seção 6
4. **Renovação** — pacote acabando, vencido ou concluído
5. **Renovado** — renovou (volta para "Em tratamento" após a próxima consulta)
6. **Encerrado / inativo** — não renovou; status muda para "cliente inativo"

**Movimentos automáticos** (o card também pode ser arrastado à mão):
- primeira consulta realizada → "Em tratamento";
- alerta de retorno (seção 6) → "Retorno a agendar"; retorno agendado → volta para "Em tratamento";
- saldo do pacote chega a 1 consulta ou faltam 15 dias para vencer → "Renovação";
- novo pacote contratado → "Renovado".

### 8.3 Cards

```
Comercial                              Acompanhamento
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ Maria Souza           ● 3 dias │      │ Maria Souza        🟢 Dra. Ana │
│ Emagrecimento · Indicação      │      │ Plano anual · 5 de 12 ██░░░░░ │
│  (indicada por Ana P.)         │      │ Última consulta: há 62 dias ⚠  │
│ Plano anual · R$ 1.800         │      │ 💲 R$ 150 em aberto  [WhatsApp]│
└───────────────────────────────┘      └───────────────────────────────┘
```

**Funcionalidades comuns:** arrastar e soltar (mouse e toque), contador e soma de valores por coluna, painel lateral de resumo com link para a ficha, filtros (nome, origem, objetivo, serviço, **profissional**) e registro de cada movimentação no histórico.

---

## 9. Página: Clientes (listagem)

- Tabela com nome, telefone, profissional responsável, status, origem, pacote e saldo, última consulta, **dias desde a última consulta**, próximo agendamento e saldo financeiro em aberto.
- Busca por nome, telefone ou e-mail.
- Filtros: status, profissional, objetivo, origem, tag, **"sem retorno marcado"**, "com pagamento pendente", "pacote acabando" e (só profissional/admin) "com alergia a…" / "usa medicamento…".
- Ordenação por qualquer coluna.
- Botão **"+ Novo cliente"** com cadastro rápido (nome, telefone, origem, indicado por).
- No celular a tabela vira lista de cartões.
- Exportar CSV (só admin).

---

## 10. Página: Cliente individual (prontuário)

```
┌────────────────────────────────────────────────────────────┐
│ ( MS )  Maria Souza · 34 anos · Cliente ativo · 🟢 Dra. Ana │
│ (11) 9xxxx · Origem: Indicação (Ana P.) · Indicou 2 pessoas│
│ [WhatsApp] [Agendar] [Iniciar atendimento🔒] [+ Pagamento]  │
├────────────────────────────────────────────────────────────┤
│ 🔴 ALERGIA: amendoim (grave) · Contraindicação: whey   🔒  │
│ ⚠ Última consulta há 62 dias, sem retorno marcado          │
├────────────────────────────────────────────────────────────┤
│ Plano anual: 5 de 12 · vence 20/03 · Peso -4,2 kg ·        │
│ Total pago R$ 900 · Em aberto R$ 150                       │
├────────────────────────────────────────────────────────────┤
│ Visão geral | Anamnese🔒 | Consultas | Avaliação🔒 | Fotos🔒 │
│ Pacotes | Financeiro | Histórico                           │
└────────────────────────────────────────────────────────────┘
```

| Aba | Conteúdo |
|---|---|
| **Visão geral** | dados cadastrais, origem e indicações (quem indicou e quem ele indicou), consentimentos, observações, tags |
| **Anamnese** 🔒 | ficha atual por seções (seção 4.4), alergias e medicamentos em lista, pré-anamnese a revisar (se houver), botão **"Revisar anamnese"**, histórico de versões |
| **Consultas** | linha do tempo de consultas (passadas e futuras) com profissional e status; **"Agendar"** (todos os perfis) e **"Registrar atendimento"** 🔒 |
| **Avaliação física** 🔒 | avaliações lado a lado (primeira × última), gráficos de peso, IMC, % de gordura, massa magra, circunferências e soma de dobras |
| **Fotos** 🔒 | galeria por data e ângulo; **comparador antes × depois** |
| **Pacotes** | pacotes contratados, barra de saldo, ritmo ("2 consultas atrasadas"), validade, consultas ligadas, **"Renovar"** |
| **Financeiro** | lançamentos com status; totais pago e em aberto; "marcar como pago" |
| **Histórico** | linha do tempo com todas as interações (manuais e automáticas), com filtro por tipo e autor |

**Registrar atendimento** 🔒 (fluxo único, em etapas, para o profissional não pular nada):
1. **Anamnese** — mostra a atual com os alertas (ou a pré-anamnese enviada pelo paciente, para conferir); "sem alterações" ou revisar.
2. **Avaliação física** — medidas, com o valor anterior ao lado de cada campo.
3. **Fotos** — câmera ou arquivo, marcando o ângulo.
4. **Evolução e condutas** — anotações e plano alimentar.
5. **Próximo retorno** — sugerido pela periodicidade/pacote; já abre a agenda do profissional para **marcar o retorno na hora**.
6. **Fechamento** — marca a consulta como realizada, desconta do pacote e gera a cobrança se for avulsa.

Para a recepção, as abas, faixas e botões marcados com 🔒 não aparecem.

---

## 11. Página: Serviços

- Lista em cartões ou tabela: nome, categoria, valor, duração, profissionais, ativo.
- **+ Novo serviço** e **Editar** no mesmo formulário: nome, descrição, valor, duração, categoria, modalidade, profissionais e, para pacotes, consultas incluídas, validade e frequência prevista.
- Desativar em vez de excluir quando o serviço já tem consultas, pacotes ou pagamentos.
- Mostrar quantas vezes cada serviço foi vendido e o faturamento gerado.
- Só o admin edita.

---

## 12. Agente de IA no WhatsApp

O **Assistente Nutri Dudu** é um assistente virtual que conversa com leads e clientes pelo WhatsApp, 24 horas por dia, usando os dados do CRM. Ele **não substitui os profissionais**: cuida do atendimento comercial e operacional e passa para a equipe tudo que for clínico ou fora do roteiro.

**Persona:** "Assistente Nutri Dudu", masculino, simpático e educado. Fala em português, de forma acolhedora e objetiva, com mensagens curtas, sem jargão, e emoji com moderação. Concorda no masculino ("Obrigado!", "Fico feliz em ajudar"). Sempre se apresenta como assistente virtual.

Exemplo de primeira mensagem:
> Olá! Eu sou o Assistente Nutri Dudu, o assistente virtual da clínica Nutri Dudu 😊 Posso tirar suas dúvidas, mostrar nossos serviços e agendar sua consulta. Se preferir falar com alguém da equipe, é só pedir. Como posso te ajudar?

### 12.1 O que o agente faz

| Situação | O que o agente faz | Efeito no CRM |
|---|---|---|
| Lead novo manda mensagem | se apresenta, entende o objetivo, pergunta nome e **como conheceu a clínica** (Instagram, indicação — de quem?) | cria a Pessoa no funil comercial com origem "WhatsApp direto" ou a informada; liga ao cliente que indicou, se houver |
| Dúvidas sobre a clínica | responde sobre serviços, valores, pacotes, profissionais, endereço, formas de pagamento e consulta online | — |
| Quer agendar | pergunta se tem preferência de profissional, oferece horários livres na **agenda do profissional**, confirma serviço, profissional, data e hora e **agenda direto** | cria a consulta "agendada" (agendada por: agente); lead vai para "Consulta agendada" |
| Remarcar, cancelar ou confirmar | mostra as consultas futuras da pessoa e confirma a mudança | atualiza a consulta e registra no histórico |
| Cliente pergunta do pacote | informa saldo ("5 de 12 usadas") e validade | — |
| Cliente pergunta de pagamento | informa valores em aberto e envia a chave Pix | — (a baixa é feita pela equipe) |
| Cobrança em atraso | envia lembrete educado com a chave Pix (seção 12.2) | registra no histórico e no financeiro |
| Assunto clínico, reclamação, pedido de falar com alguém, ou não sabe responder | avisa que vai chamar a equipe | conversa fica "aguardando equipe", em destaque em Conversas e no Dashboard |

Toda ação do agente vira uma **interação automática** com autor "agente de IA".

### 12.2 Mensagens automáticas

| Automação | Quando | Exemplo |
|---|---|---|
| **Pré-anamnese** | ao agendar a primeira consulta; lembrete 2 dias antes se não preenchida | "Para aproveitarmos melhor sua consulta, preencha este formulário rápido (5 min): [link]. Suas respostas só serão vistas pela nutricionista." |
| Lembrete de consulta | 24 h antes | "Olá, Maria! Lembrando da sua consulta amanhã às 14h com a Dra. Ana. Responda 1 para confirmar ou 2 para remarcar." |
| Confirmação | a resposta atualiza a consulta | "confirmada" aparece na agenda; "remarcar" abre o fluxo de remarcação |
| **Retorno pendente** | regras da seção 6 (ex.: 60 dias sem consulta e sem retorno marcado) | "Oi, Fernanda! Já faz 2 meses da sua última consulta com a Dra. Ana. Que tal marcar seu retorno? Tenho quinta 10h ou sexta 15h." |
| Pacote acabando, vencendo ou atrasado | regras da seção 4.7 | aviso de saldo/ritmo e oferta de agendar ou renovar |
| Pagamento em atraso | 1 dia após o vencimento (no máximo 1 por semana) | aviso educado com a chave Pix |
| Reativação | cliente sumido há 120 dias | convite para voltar |
| Agradecimento de indicação | quando um indicado vira cliente | agradece a quem indicou |

- Cada automação pode ser ligada ou desligada e ter o texto editado em **Configurações**.
- Só é enviada para quem deu **consentimento** e não pediu para parar. "PARAR" desliga as automações para aquela pessoa.

### 12.3 Passagem para a equipe

- A página **Conversas** mostra todas as conversas, com filtro "aguardando equipe" no topo.
- Qualquer pessoa da equipe pode **assumir** uma conversa: o agente para de responder aquela pessoa até alguém clicar em **"devolver ao agente"**.
- Ao assumir, a equipe vê um **resumo da conversa** gerado pelo agente.
- O agente atende **24 horas**. Quando chama a equipe fora do horário, avisa: "Nossa equipe responde a partir das 8h do próximo dia útil".

### 12.4 Página: Conversas

```
┌──────────────────────┬─────────────────────────────────────┐
│ 🔍 Buscar            │ Maria Souza · Lead · Instagram       │
│ ● Aguardando equipe 2│ [Assumir] [Ver ficha] [Encerrar]     │
│──────────────────────│─────────────────────────────────────│
│ Maria Souza    14:02 │  Maria: Quero agendar uma consulta   │
│ 🤖 Agente atendendo  │  🤖: Tenho quinta 10h com a Dra. Ana │
│ João Lima      13:40 │      ou sexta 15h com o Dr. Bruno…   │
│ ⚠ Aguardando equipe  │  Maria: Quinta 10h                   │
│ …                    │  🤖: Agendado! Quinta, 10h ✓         │
│                      │ [ Digite uma mensagem…     ] [Enviar]│
└──────────────────────┴─────────────────────────────────────┘
```

- Cada mensagem mostra quem escreveu (contato, agente ou membro da equipe).
- O card no Kanban, a agenda e a ficha do cliente têm atalho para a conversa.

### 12.5 Como funciona por dentro

```
WhatsApp do paciente
        │  mensagem
        ▼
WhatsApp Business Platform (API oficial da Meta)
        │  webhook
        ▼
Servidor do CRM (Supabase Edge Function)
        │  1. identifica a pessoa pelo número
        │  2. se a equipe assumiu → só salva a mensagem
        │  3. senão → chama o agente com o histórico da conversa
        ▼
Agente de IA (API do Claude, com ferramentas)
        │  usa ferramentas → leem/gravam no banco do CRM
        ▼
Resposta enviada pela API do WhatsApp + salva em Conversas
```

**WhatsApp:** **API oficial da Meta (WhatsApp Business Platform / Cloud API)**, diretamente ou por um provedor parceiro oficial. APIs não oficiais violam os termos do WhatsApp e podem ter o **número banido**.

- Respostas livres só dentro de **24 h** após a última mensagem do paciente.
- Fora dessa janela (lembretes, retorno, cobranças, reativação), só **modelos de mensagem pré-aprovados pela Meta**. Os textos da seção 12.2 precisam ser cadastrados e aprovados antes.
- A Meta cobra por mensagem de modelo enviada, conforme a categoria. Conferir a tabela atual no momento da implantação.
- Conta Meta Business verificada e **número novo** dedicado à API. O número atual da clínica continua como está.

**IA:** **Claude Opus 5.5** (`claude-opus-5-5`) via API da Anthropic, usando **ferramentas** (*tool use*): o agente não acessa o banco diretamente; ele pede ações bem definidas e o servidor decide se pode executá-las.

| Ferramenta | O que faz |
|---|---|
| `listar_servicos` | serviços ativos, valores, duração, profissionais |
| `listar_profissionais` | profissionais ativos e os serviços que realizam |
| `consultar_horarios_livres` | horários livres de um profissional (ou de qualquer um) para um serviço num intervalo de datas, respeitando horários e bloqueios |
| `agendar_consulta` / `remarcar_consulta` / `cancelar_consulta` / `confirmar_consulta` | só para a pessoa da conversa e só depois da confirmação dela |
| `minhas_consultas` | consultas futuras da pessoa |
| `saldo_do_pacote` | saldo, validade e ritmo do pacote ativo |
| `pagamentos_em_aberto` | valores pendentes e chave Pix |
| `atualizar_cadastro_lead` | nome, e-mail, objetivo, origem, quem indicou |
| `enviar_pre_anamnese` | gera o link pessoal do formulário e envia; o agente não tem acesso às respostas |
| `chamar_equipe` | marca a conversa como "aguardando equipe", com motivo e resumo |

Boas práticas técnicas previstas:
- **Instruções fixas + cache:** instruções, informações da clínica e lista de ferramentas iguais em todas as conversas, enviadas com *prompt caching* (menor custo e resposta mais rápida).
- **Esforço baixo** (`effort: low`) para conversa comum; medir com conversas reais e só aumentar se a qualidade pedir.
- **Recusas e falhas:** tratar recusas e erros da API; nesses casos, "Vou chamar alguém da equipe" + `chamar_equipe`. Nunca deixar o paciente sem resposta.
- **Limites:** máximo de mensagens do agente por conversa/dia e limite de gasto mensal configurável, com alerta.
- **Testes antes de ligar:** conjunto de conversas de exemplo (agendar, escolher profissional, dúvida de preço, pergunta clínica, pedido de humano, tentativa de obter dados de outra pessoa) rodado a cada mudança nas instruções.

### 12.6 Segurança e limites do agente

- **Sem orientação clínica:** não dá dieta, diagnóstico, nem opina sobre exames ou medicamentos. Pergunta clínica → `chamar_equipe`.
- **Sem dados clínicos:** as ferramentas **não acessam** anamnese (nem as respostas da pré-anamnese), avaliações, fotos, anotações ou plano alimentar. A restrição está no servidor, não só nas instruções.
- **Só os dados de quem está conversando:** toda ferramenta filtra pelo número de WhatsApp da conversa, no servidor.
- **Mensagens de pacientes são dados, não ordens:** o agente não muda de comportamento por instruções escritas na conversa. Descontos e exceções de preço vão para a equipe.
- **Ações confirmadas:** agendar, remarcar e cancelar só depois de a pessoa confirmar profissional, data, hora e serviço.
- **Transparência:** a primeira mensagem informa que é um assistente virtual e como falar com uma pessoa.
- **LGPD:** aviso de privacidade na primeira conversa, registro do consentimento e opção "PARAR". Conversas guardadas **por tempo indeterminado**, com exclusão ou anonimização a pedido do paciente.

### 12.7 Custo estimado

Estimativa inicial, a confirmar medindo conversas reais na fase de testes:

| Item | Estimativa |
|---|---|
| IA (Claude Opus 5.5, esforço baixo, com cache) | cerca de **US$ 0,01–0,03 por mensagem respondida**, ou **US$ 0,10–0,30 por conversa** de ~10 trocas |
| Exemplo: 300 conversas/mês | **US$ 30–90/mês** de IA |
| WhatsApp | respostas dentro de 24 h; lembretes e cobranças pagos por mensagem de modelo (tabela atual da Meta) |
| Servidor, banco e fotos (Supabase) | plano gratuito no início; plano pago quando o volume (principalmente de fotos) crescer |

Base do cálculo de IA: US$ 4 por milhão de tokens de entrada, US$ 20 por milhão de saída e US$ 0,20 por milhão de tokens lidos do cache, com ~5 mil tokens de contexto por mensagem (a maior parte em cache) e ~500 tokens de resposta.

---

## 13. Design / interface

- **Visual:** limpo, bastante espaço em branco, cantos arredondados, sombras suaves.
- **Paleta:** verde (saúde/nutrição) como cor principal, neutros claros e cores de status (verde = pago/confirmada, amarelo = pendente, vermelho = atrasado/alerta). Cada profissional tem sua cor na agenda. Logo provisório "ND" até a clínica definir sua identidade. Cores concentradas em variáveis, fáceis de trocar.
- **Tipografia:** fonte sem serifa moderna (ex.: Inter).
- **Responsivo:** computador, tablet (atendimento e fotos no consultório) e celular (recepção e WhatsApp).
- **Facilidade:** formulários curtos, máscaras de telefone, CPF e moeda, valores em R$, datas em dd/mm/aaaa, mensagens de confirmação ("Consulta salva ✓").
- **Formulários clínicos:** anamnese e avaliação em seções recolhíveis; listas (alergias, medicamentos) com "+ adicionar"; valor anterior ao lado de cada medida; alertas em vermelho sempre visíveis.

---

## 14. Tecnologia

**Decidido:** caminho em duas fases.

1. **Protótipo** em HTML, CSS e JavaScript puro, com dados salvos no navegador e dados de exemplo fictícios. Serve para validar telas e fluxos.
2. **Nuvem** com Supabase (banco de dados, login, armazenamento de fotos, backup e regras de permissão por perfil).

Todas as páginas falam com uma única **camada de dados** (`store.js`), já assíncrona como o Supabase exige, para a troca ser simples.

**Bibliotecas:**
- **Chart.js** — gráficos.
- ~~SortableJS~~ — o arrastar e soltar do Kanban foi feito sem biblioteca (mouse e toque).
- **Agenda** — feita sem biblioteca externa (decidido na fase 4): grade própria de dia (uma coluna por profissional), semana, mês e lista, com arrastar para remarcar. Assim funciona sem internet, sem custo e com as regras da clínica (horários, bloqueios, intervalo, encaixe). As regras ficam em `js/agenda.js`, que o agente do WhatsApp também vai usar.

**Fotos:** no protótipo, ficam no armazenamento do navegador (IndexedDB), reduzidas, apenas com imagens de exemplo. Na nuvem, num **armazenamento privado** (Supabase Storage), acessível só por links temporários para usuários autorizados.

### Estrutura de pastas prevista

```
crm-nutri-dudu/
├── index.html            # casca: menu + área de conteúdo
├── css/
│   └── style.css
├── js/
│   ├── config.js         # listas fixas: etapas, origens, perfis, ângulos de foto…
│   ├── utils.js          # formatação (R$, datas), IMC, idade…
│   ├── calculos.js       # % de gordura, saldo e ritmo de pacote, atrasos
│   ├── agenda.js         # horários livres, conflitos, bloqueios
│   ├── retornos.js       # regras de retorno e recorrência
│   ├── permissoes.js     # o que cada perfil pode ver e fazer
│   ├── store.js          # camada de dados (localStorage/IndexedDB → Supabase)
│   ├── seed.js           # dados de exemplo fictícios
│   ├── app.js            # navegação entre páginas
│   ├── pages/            # dashboard, agenda, kanban, clientes, cliente,
│   │                     # conversas, servicos, configuracoes
│   └── components/       # janela (modal), formulários, cards, gráficos, avisos
├── supabase/functions/   # (fase 10) servidor: webhook do WhatsApp, agente, automações
└── PLANEJAMENTO.md
```

O agente e as automações **precisam de um servidor** (receber mensagens a qualquer hora, rodar lembretes agendados e guardar as chaves de API com segurança). Por isso entram depois da fase 9 (nuvem). No protótipo, a página Conversas pode existir com conversas de exemplo.

---

## 15. Segurança e LGPD

Dados de saúde e fotos do corpo são **dados pessoais sensíveis** pela LGPD. Para uso real com pacientes:

- login obrigatório e permissões por perfil aplicadas no banco (fase 9). **Sem isso, o sistema não deve receber dados reais**;
- prontuário (anamnese, avaliações, fotos, anotações) visível só para os nutricionistas e o admin; recepção e agente não acessam;
- formulário de pré-anamnese em página segura do sistema, com link pessoal que expira; respostas nunca trafegam pelo texto do WhatsApp;
- fotos em armazenamento privado, sem links públicos;
- consentimentos separados e registrados: dados de saúde, WhatsApp, fotos clínicas e uso de imagem em divulgação;
- registro de quem criou, alterou **e acessou** o prontuário;
- dados com backup e criptografia;
- exclusão ou anonimização a pedido do paciente, respeitando os prazos de guarda de prontuário exigidos para nutricionistas (confirmar com o CRN e com um consultor de LGPD);
- chaves da API do WhatsApp e da IA só no servidor, nunca no navegador;
- no protótipo, **apenas dados e fotos fictícios**.

---

## 16. Roadmap de construção

| Fase | Entregas |
|---|---|
| **1. Base** | estrutura de pastas, layout, navegação, camada de dados, dados de exemplo, seletor de perfil simulado |
| **2. Serviços e profissionais** | cadastro de serviços (incluindo pacotes longos e frequência), profissionais, horários de atendimento e bloqueios |
| **3. Clientes** | listagem, busca, filtros, cadastro rápido, origens e indicação |
| **4. Agenda** | visões dia/semana/mês/lista, por profissional, agendar, remarcar arrastando, confirmar, falta, bloqueios, conflitos |
| **5a. Prontuário** | ficha do cliente, anamnese com versões e alertas, registrar atendimento, avaliação física com cálculos, fotos e comparador |
| **5b. Pacotes e financeiro** | pacotes com saldo e ritmo, cobranças e parcelas, histórico automático |
| **6. Kanban** | dois funis, arrastar e soltar, passagem do comercial para o acompanhamento, movimentos automáticos |
| **7. Retornos e Dashboard** | regras de retorno e recorrência, alertas, indicadores, gráficos e listas de ação |
| **8. Acabamento** | responsividade, modo escuro, validações, exportar/importar backup, revisão das permissões |
| **9. Nuvem** | Supabase: banco, **login com perfis**, regras de permissão, armazenamento privado de fotos, migração dos dados |
| **10a. WhatsApp na caixa de entrada** | API oficial, página Conversas, equipe responde, lead criado automaticamente |
| **10b. Agente de IA** | agente com ferramentas (dúvidas, cadastro, agendamento por profissional), passagem para a equipe, resumo, testes, limite de gasto |
| **10c. Automações** | modelos aprovados pela Meta, **pré-anamnese**, lembrete e confirmação de consulta, retorno pendente, pacote, cobrança, reativação, agradecimento de indicação |

O agente começa em modo **piloto**: algumas semanas com revisão diária das conversas antes de atender sem acompanhamento.

Cada fase vira uma branch e um Pull Request, para revisar aos poucos.

---

## 17. Decisões

### Já decididas

| # | Tema | Decisão |
|---|---|---|
| 1 | Tecnologia | Protótipo em HTML/CSS/JS primeiro; Supabase depois |
| 2 | Kanban | Dois funis separados: comercial (leads) e acompanhamento (clientes) |
| 3 | Medidas | Peso e altura (IMC), % de gordura, circunferências e dobras cutâneas |
| 4 | Usuários | Admin, profissionais e recepção, com permissões diferentes (atualizado: antes era só uma nutricionista + recepção) |
| 5 | Pacotes | Controlar saldo de consultas, inclusive pacotes longos (ex.: 12 consultas em 12 meses) com frequência prevista |
| 6 | Fórmula do % de gordura | Escolhida em cada avaliação; padrão Jackson & Pollock 7 dobras; opções J&P 3 dobras e Durnin & Womersley (equação de Siri) |
| 7 | Falta em pacote | Desconta por padrão, com opção de não descontar caso a caso |
| 8 | Validade dos pacotes | Definida pelo serviço; saldo que sobra expira no vencimento; aviso 15 dias antes; admin pode prorrogar |
| 9 | Funil de acompanhamento | 6 etapas da seção 8.2 |
| 10 | Identidade visual | Paleta verde e logo provisório "ND" até a clínica definir a sua |
| 11 | Número do WhatsApp | Número novo, dedicado à API oficial |
| 12 | Horário do agente | Atende 24 horas |
| 13 | Agendamento pelo agente | Agenda direto, após confirmar com o paciente |
| 14 | Persona | "Assistente Nutri Dudu", masculino, simpático e educado |
| 15 | Cobranças | O agente envia lembretes de cobrança com a chave Pix (no máximo 1 por semana por pagamento) |
| 16 | Guarda das conversas | Tempo indeterminado, com exclusão ou anonimização a pedido do paciente |
| 17 | Agenda | Agenda completa por profissional, com horários, bloqueios e conflitos |
| 18 | Origens de leads | Instagram, WhatsApp direto, Indicação de cliente (com "indicado por") e Presencial |
| 19 | Anamnese | Ficha estruturada com histórico de saúde, alergias, contraindicações e medicamentos, versionada e com alertas |
| 20 | Fotos | Antes e depois anexadas à consulta, com comparador por ângulo |
| 21 | Retorno e recorrência | Alerta quando o cliente passa de N dias (padrão 60) sem consulta e sem retorno marcado, entre outras regras da seção 6 |

| 22 | Acesso ao prontuário | Todos os nutricionistas veem o prontuário de todos os clientes; recepção e agente não |
| 23 | Profissionais | Só nutricionistas; hoje **uma nutricionista**, sistema preparado para mais |
| 24 | Repasse/comissão | Não necessário por enquanto (uma única profissional); fica para o futuro |
| 25 | Pré-anamnese | O agente envia, ao agendar a primeira consulta, um link pessoal para o paciente preencher parte da anamnese; a nutricionista revisa |

Nenhuma decisão em aberto. Próximo passo: **fase 1 (Base)**.
