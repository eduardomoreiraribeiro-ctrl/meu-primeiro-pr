# CRM Nutri Dudu — Planejamento

Documento de planejamento do CRM da clínica de nutrição **Nutri Dudu**. Nada aqui foi implementado ainda: a ideia é revisar e ajustar este plano antes de começar a construir.

**Versão 2** — inclui as decisões já tomadas (seção 14): protótipo primeiro, dois funis no Kanban, avaliação física completa, perfis de nutricionista e recepção e controle de saldo de pacotes.

---

## 1. Objetivo

Ter um sistema simples, moderno e fácil de usar para:

- acompanhar a operação da clínica em um só lugar (Dashboard);
- conduzir leads até virarem clientes (funil comercial);
- acompanhar os clientes em tratamento, retornos e renovações (funil de acompanhamento);
- manter o cadastro e o histórico completo de cada cliente (consultas, avaliações físicas, pacotes, financeiro, interações);
- manter o catálogo de serviços e preços da clínica.

---

## 2. Usuários e permissões

Dois perfis de acesso:

| Área | Nutricionista | Recepção |
|---|:---:|:---:|
| Dashboard — indicadores comerciais, agenda e financeiro | ✅ | ✅ |
| Kanban — funil comercial | ✅ | ✅ |
| Kanban — funil de acompanhamento | ✅ | ✅ (só os cards, sem dados clínicos) |
| Clientes — cadastro (nome, contato, origem, tags) | ✅ | ✅ |
| Agendar, remarcar e cancelar consultas | ✅ | ✅ |
| **Dados de saúde, anotações clínicas, plano alimentar** | ✅ | ❌ |
| **Avaliação física e gráficos de evolução** | ✅ | ❌ |
| Registrar consulta realizada (medidas, condutas) | ✅ | ❌ |
| Financeiro — lançar cobranças e dar baixa em pagamentos | ✅ | ✅ |
| Pacotes — contratar e ver saldo | ✅ | ✅ |
| Serviços — cadastrar, editar e definir preços | ✅ | ❌ (só visualiza) |
| Restaurar ou apagar dados | ✅ | ❌ |

- **No protótipo** (dados só no navegador) não existe login de verdade: um seletor "Ver como: Nutricionista / Recepção" no topo simula o perfil, só para validar as telas.
- **Na versão na nuvem** (fase 8) o login é obrigatório e as permissões são aplicadas também no banco de dados (regras de segurança do Supabase), não só escondendo botões na tela.

---

## 3. Mapa de páginas e navegação

```
┌──────────────┬─────────────────────────────────────────────┐
│  NUTRI DUDU  │  Busca global · + Novo · Perfil (Nutri/Rec) │
│              ├─────────────────────────────────────────────┤
│ ▸ Dashboard  │                                             │
│ ▸ Kanban     │            Conteúdo da página               │
│ ▸ Clientes   │                                             │
│ ▸ Serviços   │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

| Página | Rota | Função |
|---|---|---|
| Dashboard | `/` | Visão geral e indicadores |
| Kanban | `/kanban/comercial` e `/kanban/acompanhamento` | Os dois funis, com cards arrastáveis |
| Clientes | `/clientes` | Lista de todos os clientes |
| Cliente (individual) | `/clientes/:id` | Ficha completa de um cliente |
| Serviços | `/servicos` | Cadastro de serviços e valores |

- Menu lateral fixo no desktop; no celular vira um menu inferior.
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
| data de nascimento | data | idade calculada (necessária para as fórmulas de % de gordura) |
| sexo | opção | necessário para as fórmulas de % de gordura |
| CPF | texto | opcional, útil para recibos |
| endereço / cidade | texto | |
| origem | opção | Instagram, indicação, Google, site, outro |
| objetivo | opção | emagrecimento, hipertrofia, saúde, esportiva, gestante, outro |
| **funil** | opção | `comercial` ou `acompanhamento` |
| **etapa** | opção | etapa dentro do funil (seção 6) |
| etapa desde | data-hora | para calcular "dias na etapa" |
| motivo da perda | opção + texto | quando vai para "Perdido" |
| status | opção | lead, cliente ativo, cliente inativo |
| serviço de interesse | referência → Serviço | |
| observações gerais | texto longo | visível para os dois perfis |
| informações de saúde 🔒 | texto longo | alergias, restrições, patologias, medicamentos — **só nutricionista** |
| tags | lista | ex.: "VIP", "gestante" |
| criado em / atualizado em | data-hora | automático |

### 4.2 Consulta

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| data e hora | data-hora | |
| tipo | opção | primeira consulta, retorno, avaliação, online |
| serviço | referência → Serviço | define o valor sugerido |
| **pacote contratado** | referência (opcional) | se preenchido, a consulta desconta do saldo do pacote |
| status | opção | agendada, realizada, faltou, cancelada |
| avaliação física 🔒 | referência → Avaliação | preenchida quando a consulta é realizada |
| anotações / evolução 🔒 | texto longo | |
| plano alimentar / condutas 🔒 | texto longo | |
| próximo retorno | data | gera lembrete no Dashboard e move o card no funil de acompanhamento |

### 4.3 Avaliação física 🔒 (nova)

Fica separada da consulta para facilitar os gráficos de evolução e para permitir uma avaliação avulsa (ex.: só bioimpedância).

| Grupo | Campos |
|---|---|
| Básico | peso (kg), altura (cm), **IMC** (calculado) |
| Composição corporal | % de gordura, **método** (bioimpedância / dobras cutâneas / outro), massa gorda (kg) e massa magra (kg) calculadas |
| Circunferências (cm) | braço relaxado, braço contraído, tórax, cintura, abdome, quadril, coxa, panturrilha; **relação cintura-quadril** (calculada) |
| Dobras cutâneas (mm) | tricipital, bicipital, subescapular, peitoral, axilar média, suprailíaca, abdominal, coxa, panturrilha; **soma das dobras** (calculada) |

- Todos os campos são opcionais: a nutricionista preenche só o que mediu.
- Quando o método é **dobras cutâneas**, o sistema calcula o % de gordura pela fórmula escolhida (decisão em aberto, seção 14), usando idade e sexo do cliente. Também é possível digitar o valor manualmente.

### 4.4 Pacote contratado (nova)

Liga um cliente a um serviço do tipo pacote e controla o saldo.

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| serviço | referência → Serviço (categoria pacote) | |
| data de início | data | |
| validade | data | ex.: 3 meses para o trimestral (decisão em aberto) |
| consultas incluídas | número | copiado do serviço na contratação |
| consultas usadas | número | **calculado**: consultas *realizadas* ligadas ao pacote |
| saldo | número | **calculado**: incluídas − usadas |
| valor negociado | moeda | pode ter desconto em relação ao preço do serviço |
| status | opção | ativo, concluído (saldo 0), vencido, cancelado |

**Regras de saldo**
- Só desconta quando a consulta fica **realizada**. Uma consulta agendada aparece como "reservada" (ex.: "3 de 6 usadas · 1 agendada").
- Falta: por padrão **desconta** do saldo, mas a nutricionista pode marcar "não descontar" (decisão em aberto).
- Ao agendar uma consulta para quem tem pacote ativo, o pacote já vem selecionado.
- Avisos: saldo de 1 consulta, pacote vencendo em 15 dias e pacote concluído. Esses avisos alimentam a etapa "Renovação" do funil de acompanhamento.

### 4.5 Lançamento financeiro

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| consulta | referência (opcional) | consulta avulsa |
| **pacote contratado** | referência (opcional) | parcelas de um pacote |
| serviço | referência | |
| descrição | texto | ex.: "Pacote trimestral — parcela 1/2" |
| valor / desconto | moeda (R$) | |
| vencimento | data | |
| data do pagamento | data | vazio = em aberto |
| forma de pagamento | opção | Pix, crédito, débito, dinheiro, transferência |
| status | opção | pago, pendente, cancelado; **atrasado** é calculado (pendente com vencimento passado) |

### 4.6 Serviço

| Campo | Tipo | Observação |
|---|---|---|
| id | texto | |
| nome | texto | ex.: "Consulta inicial", "Pacote trimestral" |
| descrição | texto longo | |
| valor | moeda (R$) | |
| duração (min) | número | |
| categoria | opção | consulta, retorno, pacote, avaliação, outro |
| consultas incluídas | número | só para pacotes |
| validade (dias) | número | só para pacotes; sugere a validade na contratação |
| ativo | sim/não | inativos somem dos formulários, mas o histórico continua |

### 4.7 Interação (histórico de relacionamento)

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| data-hora | data-hora | |
| tipo | opção | ligação, WhatsApp, e-mail, nota, mudança de etapa, consulta, pagamento, pacote |
| descrição | texto | |
| automático | sim/não | eventos gerados pelo sistema |
| autor | perfil | nutricionista ou recepção |

> Mudanças de etapa, consultas, pagamentos e contratação ou conclusão de pacotes geram **interações automáticas**. A linha do tempo do cliente se monta sozinha.

### Relacionamentos

```
                    ┌──── N Interação
                    │
Pessoa 1 ───────────┼──── N Pacote contratado N ──── 1 Serviço
                    │            │ 1
                    │            ├──── N Consulta 1 ──── 0..1 Avaliação física
                    ├──── N Consulta (avulsa)
                    └──── N Lançamento financeiro (ligado à consulta ou ao pacote)
```

---

## 5. Página: Dashboard

**Filtro de período** no topo: Hoje · 7 dias · Este mês · Mês passado · Personalizado.

**Indicadores (KPIs)**

| Indicador | Cálculo |
|---|---|
| Faturamento do período | soma dos lançamentos pagos |
| A receber | lançamentos pendentes + atrasados |
| Consultas realizadas | consultas "realizada" no período |
| Novos leads | pessoas que entraram no funil comercial no período |
| Taxa de conversão | leads que chegaram a "Fechado" ÷ leads do período |
| Clientes ativos | status = cliente ativo |
| Ticket médio | faturamento ÷ nº de pagamentos |
| Taxa de faltas | consultas "faltou" ÷ consultas agendadas |
| **Pacotes ativos** | pacotes com status ativo |
| **Taxa de renovação** | pacotes concluídos que foram renovados ÷ pacotes concluídos |

**Gráficos**
- Faturamento por mês (últimos 6–12 meses).
- Funil comercial: quantidade por etapa.
- Origem dos leads.
- Serviços e pacotes mais vendidos.

**Listas de ação**
- Consultas de hoje e dos próximos dias.
- Retornos atrasados ou próximos.
- Pagamentos atrasados.
- **Pacotes acabando** (saldo de 1 consulta) ou vencendo.
- Leads parados há mais de X dias na mesma etapa.

---

## 6. Página: Kanban (dois funis)

No topo da página, uma alternância **Comercial | Acompanhamento**. Cada funil tem suas próprias colunas, filtros e contadores.

### 6.1 Funil comercial (leads)

1. **Novo lead** — o contato chegou
2. **Contato feito** — primeira conversa realizada
3. **Consulta agendada**
4. **Proposta / negociação** — plano ou pacote apresentado
5. **Fechado** — virou cliente ✅
6. **Perdido** — com motivo (preço, sem resposta, desistiu…)

Ao mover para **Fechado**:
1. o sistema pergunta qual serviço ou pacote foi vendido e oferece criar o **pacote contratado** e a **cobrança** (com parcelas, se houver);
2. o status muda para "cliente ativo";
3. o card **sai do funil comercial e entra no funil de acompanhamento**, na etapa "Início do tratamento". O histórico registra a passagem.

O card de "Fechado" continua visível no funil comercial por 30 dias, esmaecido, para não "sumir" de quem acompanha as vendas do mês.

### 6.2 Funil de acompanhamento (clientes)

1. **Início do tratamento** — fechou, primeira consulta a fazer
2. **Em tratamento** — consultas em dia, retorno agendado
3. **Retorno a agendar** — o "próximo retorno" passou e ainda não há consulta marcada
4. **Renovação** — pacote acabando, vencido ou concluído
5. **Renovado** — renovou o pacote (volta para "Em tratamento" após a próxima consulta)
6. **Encerrado / inativo** — não renovou; status muda para "cliente inativo"

**Movimentos automáticos** (o card também pode ser arrastado à mão):
- primeira consulta realizada → "Em tratamento";
- data de retorno passou sem consulta agendada → "Retorno a agendar";
- saldo do pacote chega a 1 consulta ou faltam 15 dias para vencer → "Renovação";
- novo pacote contratado → "Renovado".

Um cliente **inativo que volta** pode ser reaberto no funil de acompanhamento ou recomeçar no comercial, como um novo lead.

### 6.3 Cards

```
Comercial                              Acompanhamento
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ Maria Souza           ● 3 dias │      │ Maria Souza                    │
│ Emagrecimento · Instagram      │      │ Pacote trimestral · 2 de 3 ███░│
│ Pacote trimestral · R$ 600     │      │ Próx. retorno: 15/10           │
│ 📞 (11) 9xxxx-xxxx  [WhatsApp]  │      │ 💲 R$ 300 em aberto  [WhatsApp]│
└───────────────────────────────┘      └───────────────────────────────┘
```

**Funcionalidades comuns:** arrastar e soltar (mouse e toque), contador e soma de valores por coluna, painel lateral de resumo com link para a ficha, filtros (nome, origem, objetivo, serviço) e registro de cada movimentação no histórico.

---

## 7. Página: Clientes (listagem)

- Tabela com nome, telefone, objetivo, status, **pacote e saldo**, última consulta, próximo retorno e saldo financeiro em aberto.
- Busca por nome, telefone ou e-mail.
- Filtros: status, objetivo, origem, tag, "com pagamento pendente" e "pacote acabando".
- Ordenação por qualquer coluna.
- Botão **"+ Novo cliente"** (formulário em janela).
- Clique na linha abre a ficha individual.
- No celular a tabela vira lista de cartões.
- (Futuro) exportar CSV.

---

## 8. Página: Cliente individual

```
┌────────────────────────────────────────────────────────────┐
│ ( MS )  Maria Souza · 34 anos · Cliente ativo              │
│ (11) 9xxxx · maria@email · Objetivo: emagrecimento         │
│ [WhatsApp] [Editar] [+ Consulta] [+ Pagamento] [+ Nota]    │
├────────────────────────────────────────────────────────────┤
│ Pacote trimestral: 2 de 3 usadas · vence 20/11 · Peso      │
│ -4,2 kg · Total pago R$ 690 · Em aberto R$ 150             │
├────────────────────────────────────────────────────────────┤
│ Abas: Visão geral | Consultas | Avaliação física 🔒 |       │
│       Pacotes | Financeiro | Histórico                     │
└────────────────────────────────────────────────────────────┘
```

| Aba | Conteúdo |
|---|---|
| **Visão geral** | dados cadastrais, observações e tags; informações de saúde 🔒 |
| **Consultas** | lista em ordem cronológica; **"+ Nova consulta"** para agendar (os dois perfis) e **"Registrar atendimento"** 🔒 para preencher anotações, condutas, avaliação física e próximo retorno. Se houver pacote ativo, ele já vem selecionado |
| **Avaliação física** 🔒 | tabela com todas as avaliações lado a lado (diferença entre a primeira e a última), gráficos de peso, IMC, % de gordura, massa magra, circunferências e soma de dobras |
| **Pacotes** | pacotes contratados (ativo e anteriores), barra de saldo, validade, consultas ligadas, botão **"Renovar pacote"** |
| **Financeiro** | lançamentos com status; totais pago e em aberto; botão "marcar como pago" |
| **Histórico** | linha do tempo com todas as interações (manuais e automáticas), com filtro por tipo e autor |

Para a recepção, as abas e campos marcados com 🔒 não aparecem.

---

## 9. Página: Serviços

- Lista em cartões ou tabela: nome, categoria, valor, duração, ativo.
- **+ Novo serviço** e **Editar** no mesmo formulário: nome, descrição, valor, duração, categoria e, para pacotes, consultas incluídas e validade.
- Desativar em vez de excluir quando o serviço já tem consultas, pacotes ou pagamentos (preserva o histórico).
- Mostrar quantas vezes cada serviço foi vendido e o faturamento gerado.
- A recepção só visualiza.

---

## 10. Design / interface

- **Visual:** limpo, bastante espaço em branco, cantos arredondados, sombras suaves.
- **Paleta sugerida:** verde (saúde/nutrição) como cor principal, neutros claros e cores de status (verde = pago, amarelo = pendente, vermelho = atrasado). Modo escuro opcional. Será ajustada se a clínica tiver identidade visual.
- **Tipografia:** uma fonte sem serifa moderna (ex.: Inter).
- **Responsivo:** funciona bem no computador e no celular (a recepção provavelmente usa mais o celular para WhatsApp).
- **Facilidade:** formulários curtos, máscaras de telefone, CPF e moeda, valores em R$, datas em dd/mm/aaaa e mensagens de confirmação ("Consulta salva ✓").
- **Formulário de avaliação física:** campos agrupados em seções recolhíveis (Básico, Composição, Circunferências, Dobras), mostrando o valor da avaliação anterior ao lado de cada campo para comparação.

---

## 11. Tecnologia

**Decidido:** caminho em duas fases.

1. **Protótipo** em HTML, CSS e JavaScript puro (como o projeto `nutricao-esportiva` deste repositório), com os dados salvos no navegador e dados de exemplo fictícios. Serve para validar telas e fluxos.
2. **Nuvem** com Supabase (banco de dados, login, backup e regras de permissão por perfil).

Para a troca ser simples, todas as páginas falam com uma única **camada de dados** (`store.js`), já escrita de forma assíncrona como o Supabase exige.

Bibliotecas: **Chart.js** (gráficos) e **SortableJS** (arrastar e soltar no Kanban, com suporte a toque).

### Estrutura de pastas prevista

```
crm-nutri-dudu/
├── index.html            # casca: menu + área de conteúdo
├── css/
│   └── style.css
├── js/
│   ├── config.js         # listas fixas: etapas dos funis, origens, perfis…
│   ├── utils.js          # formatação (R$, datas), IMC, idade…
│   ├── calculos.js       # % de gordura, saldo de pacote, status atrasado
│   ├── permissoes.js     # o que cada perfil pode ver e fazer
│   ├── store.js          # camada de dados (localStorage → Supabase depois)
│   ├── seed.js           # dados de exemplo fictícios
│   ├── app.js            # navegação entre páginas
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── kanban.js
│   │   ├── clientes.js
│   │   ├── cliente.js
│   │   └── servicos.js
│   └── components/       # janela (modal), formulários, cards, gráficos, avisos
└── PLANEJAMENTO.md
```

---

## 12. Segurança e LGPD

Dados de saúde são **dados pessoais sensíveis** pela LGPD. Para uso real com pacientes:

- login obrigatório e permissões por perfil aplicadas no banco (fase 8). **Sem isso, o sistema não deve receber dados reais**;
- a recepção não acessa dados clínicos (seção 2);
- dados armazenados em serviço com backup e criptografia;
- registrar o consentimento do paciente para armazenar os dados;
- registrar quem fez cada alteração (campo "autor" do histórico);
- no protótipo, usar **apenas dados fictícios**.

---

## 13. Roadmap de construção

| Fase | Entregas |
|---|---|
| **1. Base** | estrutura de pastas, layout (menu + topo), navegação, camada de dados, dados de exemplo, seletor de perfil simulado |
| **2. Serviços** | cadastro completo de serviços, incluindo pacotes (consultas incluídas e validade) |
| **3. Clientes** | listagem com busca, filtros e cadastro |
| **4. Ficha do cliente** | abas, agendar e registrar consulta, **avaliação física com cálculos**, **pacotes e saldo**, financeiro, histórico automático |
| **5. Kanban** | **dois funis**, arrastar e soltar, passagem do comercial para o acompanhamento, movimentos automáticos |
| **6. Dashboard** | indicadores, gráficos e listas de ação (incluindo pacotes acabando) |
| **7. Acabamento** | responsividade, modo escuro, validações, exportar e importar backup (JSON), revisão das permissões por perfil |
| **8. Nuvem** | Supabase: banco, **login com perfis**, regras de permissão, migração dos dados |

Cada fase vira uma branch e um Pull Request, para revisar aos poucos. A fase 4 é a maior e pode ser dividida em 4a (consultas e avaliação física) e 4b (pacotes, financeiro e histórico).

---

## 14. Decisões

### Já decididas

| # | Tema | Decisão |
|---|---|---|
| 1 | Tecnologia | Protótipo em HTML/CSS/JS primeiro; Supabase depois |
| 2 | Kanban | Dois funis separados: comercial (leads) e acompanhamento (clientes) |
| 3 | Medidas | Peso e altura (IMC), % de gordura, circunferências e dobras cutâneas |
| 4 | Usuários | Nutricionista + recepção, com permissões diferentes |
| 5 | Pacotes | Controlar saldo de consultas |

### Em aberto

1. **Fórmula do % de gordura por dobras cutâneas:** Jackson & Pollock 7 dobras, Jackson & Pollock 3 dobras, Durnin & Womersley (4 dobras) ou deixar a nutricionista escolher em cada avaliação?
2. **Falta em consulta de pacote:** desconta do saldo sempre, nunca, ou a nutricionista decide caso a caso (sugestão: desconta por padrão, com opção de não descontar)?
3. **Validade dos pacotes:** o trimestral vale 3 meses e o semestral 6? O que acontece com o saldo que sobra quando o pacote vence?
4. **Etapas do funil de acompanhamento:** as 6 etapas propostas (seção 6.2) fazem sentido?
5. **Identidade visual:** a Nutri Dudu já tem logo e cores definidas?
