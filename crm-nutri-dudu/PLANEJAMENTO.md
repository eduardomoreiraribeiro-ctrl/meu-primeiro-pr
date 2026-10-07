# CRM Nutri Dudu — Planejamento

Documento de planejamento do CRM da clínica de nutrição **Nutri Dudu**. Nada aqui foi implementado ainda: a ideia é revisar e ajustar este plano antes de começar a construir.

---

## 1. Objetivo

Ter um sistema simples, moderno e fácil de usar para:

- acompanhar a operação da clínica em um só lugar (Dashboard);
- conduzir leads até virarem clientes (Kanban comercial);
- manter o cadastro e o histórico completo de cada cliente (consultas, financeiro, interações);
- manter o catálogo de serviços e preços da clínica.

**Usuários previstos:** a nutricionista e, eventualmente, uma recepcionista/secretária.

---

## 2. Mapa de páginas e navegação

```
┌──────────────┬─────────────────────────────────────────────┐
│  NUTRI DUDU  │  Barra superior: busca global · + Novo      │
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
| Kanban | `/kanban` | Funil comercial com cards arrastáveis |
| Clientes | `/clientes` | Lista de todos os clientes |
| Cliente (individual) | `/clientes/:id` | Ficha completa de um cliente |
| Serviços | `/servicos` | Cadastro de serviços e valores |

- Menu lateral fixo no desktop; no celular vira um menu inferior ou "hambúrguer".
- Botão **"+ Novo"** sempre visível para criar rapidamente: lead, cliente, consulta ou pagamento.

---

## 3. Modelo de dados

O mesmo cadastro (**Pessoa**) serve para lead e cliente — o que muda é a etapa no funil. Assim, quando um lead fecha, ele simplesmente "vira" cliente sem recadastro.

### 3.1 Pessoa (lead / cliente)

| Campo | Tipo | Observação |
|---|---|---|
| id | texto | gerado automaticamente |
| nome | texto | obrigatório |
| telefone / WhatsApp | texto | obrigatório |
| e-mail | texto | |
| data de nascimento | data | idade calculada |
| sexo | opção | |
| CPF | texto | opcional, útil para recibos |
| endereço / cidade | texto | |
| origem | opção | Instagram, indicação, Google, site, outro |
| objetivo | opção | emagrecimento, hipertrofia, saúde, esportiva, gestante, outro |
| etapa do funil | opção | ver seção 5 |
| status | opção | lead, cliente ativo, cliente inativo |
| serviço de interesse | referência → Serviço | |
| observações gerais | texto longo | |
| informações de saúde | texto longo | alergias, restrições, patologias, medicamentos |
| tags | lista | ex.: "VIP", "plano trimestral" |
| criado em / atualizado em | data-hora | automático |

### 3.2 Consulta

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| data e hora | data-hora | |
| tipo | opção | primeira consulta, retorno, avaliação, online |
| serviço | referência → Serviço | define o valor sugerido |
| status | opção | agendada, realizada, faltou, cancelada |
| peso (kg), altura (cm) | número | IMC calculado automaticamente |
| % gordura, circunferências | número | cintura, quadril, braço (opcionais) |
| anotações / evolução | texto longo | |
| plano alimentar / condutas | texto longo | |
| próximo retorno | data | gera lembrete no Dashboard |

### 3.3 Lançamento financeiro

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| consulta | referência (opcional) | liga o pagamento à consulta |
| serviço | referência | |
| descrição | texto | |
| valor | moeda (R$) | |
| desconto | moeda | opcional |
| vencimento | data | |
| data do pagamento | data | vazio = em aberto |
| forma de pagamento | opção | Pix, cartão crédito, débito, dinheiro, transferência |
| status | opção | pago, pendente, atrasado (calculado), cancelado |

### 3.4 Serviço

| Campo | Tipo | Observação |
|---|---|---|
| id | texto | |
| nome | texto | ex.: "Consulta inicial", "Pacote trimestral" |
| descrição | texto longo | |
| valor | moeda (R$) | |
| duração (min) | número | |
| categoria | opção | consulta, retorno, pacote, avaliação, outro |
| quantidade de consultas | número | para pacotes |
| ativo | sim/não | serviços inativos somem dos formulários, mas o histórico fica |

### 3.5 Interação (histórico de relacionamento)

| Campo | Tipo | Observação |
|---|---|---|
| id, pessoa | referência | |
| data-hora | data-hora | |
| tipo | opção | ligação, WhatsApp, e-mail, nota, mudança de etapa, consulta, pagamento |
| descrição | texto | |
| automático | sim/não | eventos gerados pelo sistema |

> Mudanças de etapa no Kanban, novas consultas e pagamentos geram **interações automáticas**, montando a linha do tempo do cliente sem trabalho manual.

### Relacionamentos

```
Serviço 1 ──── N Consulta N ──── 1 Pessoa 1 ──── N Interação
   │                 │                │
   └──── N Lançamento financeiro N ───┘
```

---

## 4. Página: Dashboard

**Filtro de período** no topo: Hoje · 7 dias · Este mês · Mês passado · Personalizado.

**Cartões de indicadores (KPIs)**

| Indicador | Cálculo |
|---|---|
| Faturamento do período | soma dos lançamentos pagos |
| A receber | lançamentos pendentes + atrasados |
| Consultas realizadas | consultas "realizada" no período |
| Novos leads | pessoas criadas no período |
| Taxa de conversão | leads que chegaram a "Fechado" ÷ leads do período |
| Clientes ativos | status = cliente ativo |
| Ticket médio | faturamento ÷ nº de pagamentos |
| Taxa de faltas | consultas "faltou" ÷ consultas agendadas |

**Gráficos**
- Faturamento por mês (últimos 6–12 meses) — colunas.
- Funil comercial — quantidade por etapa do Kanban.
- Origem dos leads — barras horizontais.
- Serviços mais vendidos — barras.

**Listas de ação**
- Consultas de hoje e próximos dias.
- Retornos vencidos / próximos (a partir do campo "próximo retorno").
- Pagamentos atrasados.
- Leads parados há mais de X dias na mesma etapa.

---

## 5. Página: Kanban comercial

**Etapas sugeridas** (editáveis no futuro):

1. **Novo lead** — chegou o contato
2. **Contato feito** — primeira conversa realizada
3. **Consulta agendada**
4. **Proposta / negociação** — apresentado plano ou pacote
5. **Fechado (cliente)** — virou cliente; status muda para "cliente ativo"
6. **Em acompanhamento** — clientes em tratamento/retornos
7. **Perdido** — com motivo (preço, sem resposta, desistiu…)

**Card**
```
┌──────────────────────────────┐
│ Maria Souza          ● 3 dias │  ← dias na etapa
│ Emagrecimento · Instagram     │
│ Pacote trimestral · R$ 750    │
│ 📞 (11) 9xxxx-xxxx    [WhatsApp]│
└──────────────────────────────┘
```

**Funcionalidades**
- Arrastar e soltar cards entre colunas (mouse e toque no celular).
- Contador de cards e soma de valores por coluna.
- Ao mover para **Perdido**: pede o motivo.
- Ao mover para **Fechado**: oferece criar o lançamento financeiro do serviço.
- Clique no card abre um painel lateral de resumo, com link para a ficha completa.
- Botão "+ lead" no topo da primeira coluna.
- Filtros: busca por nome, origem, objetivo, serviço.
- Cada movimentação gera uma interação no histórico.

---

## 6. Página: Clientes (listagem)

- Tabela com: nome, telefone, objetivo, status, última consulta, próximo retorno, saldo em aberto.
- Busca por nome/telefone/e-mail.
- Filtros: status, objetivo, origem, tag, "com pagamento pendente".
- Ordenação por qualquer coluna.
- Botão **"+ Novo cliente"** (formulário em modal).
- Clique na linha abre a ficha individual.
- No celular a tabela vira lista de cartões.
- (Futuro) exportar CSV.

---

## 7. Página: Cliente individual

```
┌────────────────────────────────────────────────────────────┐
│ ( MS )  Maria Souza · 34 anos · Cliente ativo              │
│ (11) 9xxxx · maria@email · Objetivo: emagrecimento         │
│ [WhatsApp] [Editar] [+ Consulta] [+ Pagamento] [+ Nota]    │
├────────────────────────────────────────────────────────────┤
│ Mini-indicadores: Consultas 6 · Peso -4,2 kg · Total pago  │
│ R$ 1.350 · Em aberto R$ 150 · Próximo retorno 15/10        │
├────────────────────────────────────────────────────────────┤
│ Abas: Visão geral | Consultas | Evolução | Financeiro |    │
│       Histórico                                            │
└────────────────────────────────────────────────────────────┘
```

| Aba | Conteúdo |
|---|---|
| **Visão geral** | dados cadastrais, informações de saúde, observações, tags |
| **Consultas** | lista em ordem cronológica; botão **"+ Nova consulta"** abre formulário (data, tipo, serviço, medidas, anotações, próximo retorno). Ao salvar, pode gerar automaticamente o lançamento financeiro do serviço |
| **Evolução** | gráfico de peso / IMC / % gordura ao longo das consultas |
| **Financeiro** | lançamentos com status; totais pago / em aberto; botão "marcar como pago" |
| **Histórico** | linha do tempo com todas as interações (manuais e automáticas), com filtro por tipo |

---

## 8. Página: Serviços

- Lista em cartões ou tabela: nome, categoria, valor, duração, ativo.
- **+ Novo serviço** e **Editar** no mesmo formulário (modal): nome, descrição, valor, duração, categoria, nº de consultas (pacotes), ativo.
- Desativar em vez de excluir quando o serviço já tem consultas/pagamentos (preserva o histórico).
- Mostrar quantas vezes cada serviço foi vendido e o faturamento gerado.

---

## 9. Design / interface

- **Visual:** limpo, bastante espaço em branco, cantos arredondados, sombras suaves.
- **Paleta sugerida:** verde (saúde/nutrição) como cor principal, neutros claros e cores de status (verde = pago, amarelo = pendente, vermelho = atrasado). Modo escuro opcional.
- **Tipografia:** uma fonte sem serifa moderna (ex.: Inter).
- **Responsivo:** funciona bem no computador e no celular.
- **Facilidade:** formulários curtos, máscaras de telefone/CPF/moeda, valores em R$, datas em dd/mm/aaaa, mensagens de confirmação ("Consulta salva ✓").

---

## 10. Tecnologia — opções

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. HTML/CSS/JS puro + dados no navegador (localStorage)** | igual ao projeto `nutricao-esportiva` deste repositório | simples, sem servidor, ótimo para aprender e validar telas | dados ficam só naquele navegador/computador; sem login; risco de perda |
| **B. React (Vite) + Supabase** (recomendado para uso real) | interface em React; banco de dados, login e backup na nuvem pelo Supabase (plano gratuito) | dados seguros na nuvem, acesso de qualquer dispositivo, login, vários usuários | um pouco mais de configuração |
| **C. Caminho em duas fases** | começar como A, mas com a camada de dados isolada para trocar por Supabase depois | começa rápido e evolui sem reescrever as telas | exige disciplina na organização do código |

**Recomendação:** opção **C** — protótipo funcional em HTML/CSS/JS para validar as telas com dados de exemplo e, assim que aprovado, migrar os dados para o Supabase com login.

Bibliotecas úteis: **Chart.js** (gráficos), **SortableJS** (arrastar e soltar do Kanban, com suporte a toque).

### Estrutura de pastas prevista (opção C)

```
crm-nutri-dudu/
├── index.html            # casca: menu + área de conteúdo
├── css/
│   └── style.css
├── js/
│   ├── app.js            # roteamento entre páginas
│   ├── store.js          # camada de dados (localStorage → Supabase depois)
│   ├── seed.js           # dados de exemplo
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── kanban.js
│   │   ├── clientes.js
│   │   ├── cliente.js
│   │   └── servicos.js
│   └── components/       # modal, formulários, cards, gráficos
└── PLANEJAMENTO.md
```

---

## 11. Segurança e LGPD

Dados de saúde são **dados pessoais sensíveis** pela LGPD. Para uso real com pacientes:

- login obrigatório (opção B/C fase 2);
- dados armazenados em serviço com backup e criptografia;
- registrar o consentimento do paciente para armazenamento dos dados;
- não usar dados reais de pacientes na fase de protótipo com localStorage.

---

## 12. Roadmap de construção

| Fase | Entregas |
|---|---|
| **1. Base** | estrutura de pastas, layout (menu + topo), navegação entre páginas, camada de dados, dados de exemplo |
| **2. Serviços** | CRUD completo de serviços (é a base para consultas e financeiro) |
| **3. Clientes** | listagem com busca/filtros + formulário de cadastro |
| **4. Ficha do cliente** | abas, nova consulta, financeiro, histórico automático, gráfico de evolução |
| **5. Kanban** | colunas, cards, arrastar e soltar, regras de Fechado/Perdido |
| **6. Dashboard** | KPIs, gráficos e listas de ação |
| **7. Acabamento** | responsividade, modo escuro, validações, exportar/importar backup (JSON) |
| **8. Nuvem (fase 2)** | Supabase: banco, login, migração dos dados |

Cada fase vira uma branch e um Pull Request próprio, facilitando revisar aos poucos.

---

## 13. Ideias para o futuro (fora do escopo inicial)

- Agenda/calendário visual de consultas e integração com Google Agenda.
- Lembretes automáticos de consulta por WhatsApp.
- Geração de recibos em PDF.
- Anexos (exames, fotos de evolução).
- Etapas do Kanban configuráveis pelo usuário.
- Portal do paciente.

---

## 14. Decisões em aberto

1. **Tecnologia:** seguir a recomendação (C: protótipo em HTML/JS → Supabase) ou ir direto para a nuvem (B)?
2. **Etapas do Kanban:** as 7 etapas propostas fazem sentido para o processo da clínica?
3. **Campos da consulta:** quais medidas antropométricas a clínica realmente registra?
4. **Usuários:** só a nutricionista ou também recepção (com permissões diferentes)?
5. **Pacotes:** controlar saldo de consultas de pacotes (ex.: "3 de 6 usadas")?
6. **Identidade visual:** a Nutri Dudu já tem logo e cores definidas?
