# CRM Nutri Dudu

CRM da clínica de nutrição **Nutri Dudu**. O planejamento completo está em [`PLANEJAMENTO.md`](PLANEJAMENTO.md).

## Situação atual

### Fase 1 — Base

- Layout com menu lateral (no celular, menu inferior), busca de clientes e botão **+ Novo**.
- Navegação entre todas as páginas: Dashboard, Agenda, Kanban (comercial e acompanhamento), Clientes, ficha do cliente, Conversas, Serviços e Configurações.
- Camada de dados (`js/store.js`) que salva no navegador e já funciona do jeito que o Supabase vai exigir na fase 9.
- Dados de exemplo **fictícios**: uma nutricionista, horários, serviços e pacotes (inclusive o plano anual), leads, clientes, consultas, anamneses, avaliações e conversas.
- Seletor **"Ver como"** para simular os perfis Administrador, Profissional e Recepção. Exemplo: a faixa vermelha de alergia na ficha do Diego Carvalho some quando o perfil é Recepção.

### Fase 2 — Serviços e profissionais

- **Serviços:** cadastrar, editar, desativar/reativar e excluir (só se nunca foi usado). Pacotes com consultas incluídas, frequência e validade — a validade é sugerida e checada (ex.: 4 consultas mensais precisam de pelo menos 91 dias) e o valor por consulta aparece na hora. Cada cartão mostra quantas vezes foi realizado/contratado e quanto já foi recebido.
- **Profissionais** (em Configurações): cadastrar, editar, cor na agenda, perfil de acesso, desativar. A clínica nunca fica sem um administrador ativo.
- **Horários de atendimento:** vários períodos por dia, com modalidade (presencial/online); o sistema impede períodos sobrepostos ou invertidos.
- **Bloqueios** (férias, feriados, cursos): dia inteiro ou por horário, para um profissional ou para a clínica toda, com aviso se já houver consultas marcadas no intervalo.
- **Regras gerais:** prazos de alerta de retorno e de cliente sumido, intervalo entre consultas e chave Pix.
- **Permissões:** só o administrador mexe em serviços, preços, profissionais e regras; o profissional edita os próprios horários e bloqueios; a recepção cria bloqueios.

### Fase 3 — Clientes

- **Lista de clientes** com status, origem, pacote (barra de uso, "acabando"), última consulta (há quantos dias, aviso **⚠ sem retorno**), próximo agendamento e valores em aberto/atrasados. A coluna de profissional aparece quando houver mais de uma nutricionista.
- **Busca** por nome, telefone, e-mail ou etiqueta, sem perder o que já foi digitado.
- **Filtros:** status (clientes, ativos, inativos, leads, todos), situação (sem retorno marcado, pagamento em aberto ou atrasado, pacote acabando, sem próximo agendamento), origem, objetivo, etiqueta e — só para nutricionista/administrador — alergia, medicamento ou condição.
- **Ordenação** clicando no título das colunas; **Exportar CSV** (administrador), pronto para abrir no Excel.
- **Cadastro de lead ou cliente** (também pelo **+ Novo**): telefone e CPF com máscara e conferência, aviso de telefone/CPF já cadastrado (dizendo de quem), "indicado por" obrigatório quando a origem é indicação, etiquetas, retorno personalizado e consentimentos da LGPD. O cadastro e a indicação ficam registrados no histórico.
- **Ficha do cliente:** botão **Editar cadastro**, atalho para o WhatsApp, dados do cadastro, consentimentos e aviso de "sem retorno marcado".
- Cálculos compartilhados em `js/calculos.js` (saldo de pacote, valores atrasados, sem retorno), usados pela lista, pela ficha e pelas próximas fases.

### Fase 4 — Agenda

- **Visões:** dia (uma coluna por profissional), semana, mês e lista; navegação ‹ Hoje ›; filtro por profissional (quando houver mais de uma). No celular abre na lista.
- **Grade:** horários fora do expediente hachurados, bloqueios destacados, linha vermelha do "agora", cor de cada profissional, ícones (✓ confirmada, 🤖 agendada pelo agente, ⤵ encaixe, ⚠ faltou) e ocupação de cada profissional no período.
- **Agendar** clicando num horário livre (já vem com dia e hora), pelo botão **+ Agendar**, pelo **+ Novo › Consulta** ou pela ficha do cliente. O formulário sugere os **horários livres** do dia (inclusive logo depois de cada consulta), mostra o término, sugere o tipo (primeira consulta, retorno, avaliação, online), escolhe sozinho o **pacote** com saldo e avisa ao vivo sobre conflito, fora do horário, bloqueio ou horário que já passou. Dá para cadastrar um paciente novo sem sair do agendamento.
- **Regras:** respeita os horários de atendimento, a modalidade do período, os bloqueios e o intervalo entre consultas. Só o administrador pode forçar um **encaixe** (fica marcado).
- **Detalhes da consulta:** confirmar, remarcar, marcar falta (com opção de não descontar do pacote), cancelar com motivo, WhatsApp e ficha. Tudo fica no histórico do cliente.
- **Arrastar para remarcar** (com o mouse): pede confirmação; se o novo horário tiver problema, avisa e não muda nada.
- **Lead que agenda** avança sozinho para "Consulta agendada" no funil comercial.
- **Perfis:** o profissional abre na própria agenda e vê a agenda dos colegas só como "Ocupado".
- Regras em `js/agenda.js` (períodos, conflitos, horários livres, ocupação); telas em `js/pages/agenda.js` e `js/components/agendamento.js`.

### Fase 5 — Prontuário, pacotes e financeiro

- **Ficha do cliente em abas** (`#/clientes/<id>/<aba>`): Visão geral, Anamnese, Consultas, Avaliação física, Fotos, Pacotes, Financeiro e Histórico. Alergias graves e contraindicações aparecem em destaque no topo.
- **Registrar atendimento** (na ficha, na agenda ou nos detalhes da consulta) em 6 etapas: anamnese → avaliação física → fotos → evolução e condutas → próximo retorno → fechamento. Ao concluir, a consulta vira "realizada", o pacote desconta, a cobrança é lançada (ou a já existente é recebida), o lead vira cliente e a agenda abre para marcar o retorno.
- **Anamnese com versões:** cada revisão cria uma nova versão e mostra o que mudou; a **pré-anamnese** enviada pelo paciente aparece para revisão.
- **Avaliação física:** peso, altura, circunferências, bioimpedância/manual ou **dobras cutâneas** com fórmula escolhida (Jackson & Pollock 7 ou 3, Durnin & Womersley; densidade → Siri). IMC, cintura/quadril, % de gordura, massa gorda e magra calculados na hora; gráficos de evolução e tabela comparativa.
- **Fotos antes/depois** por ângulo, com comparador por data (só com consentimento do cliente). Ficam guardadas no próprio navegador (IndexedDB).
- **Pacotes:** contratar (validade sugerida pelo serviço, parcelas mensais), renovar (o botão aparece quando o pacote está acabando), prorrogar e cancelar (cancela as parcelas em aberto); barra de uso e aviso de consultas atrasadas no ritmo previsto.
- **Financeiro:** total pago, a receber e atrasado; nova cobrança, receber (baixa) e cancelar. Também em **+ Novo › Pagamento / Pacote**.
- **Histórico:** tudo o que acontece gera registro automático; filtro por tipo e notas manuais.
- **Perfis:** recepção não vê as abas clínicas nem registra atendimento; quem dá baixa em pagamento é administrador ou recepção.
- Cálculos em `js/avaliacao.js` e `js/calculos.js`; telas em `js/pages/cliente.js` e `js/components/` (`anamnese.js`, `atendimento.js`, `financeiro.js`).

### Fase 6 — Kanban

- **Dois funis** (Comercial e Acompanhamento), com contador e soma por coluna (valor em negociação no comercial; valor em aberto no acompanhamento).
- **Arrastar e soltar** com o mouse ou, no celular, segurando o card antes de arrastar (deslizar o dedo continua rolando o quadro). Também dá para mover pelo resumo do card ("Mover para") e pelo teclado.
- **Ao mover:** para "Fechado" → janela "Fechar venda" (serviço vendido e profissional); o lead vira cliente ativo, passa para o acompanhamento e, em seguida, abre o registro do pacote ou da cobrança. Para "Perdido" → pede o motivo. Para "Encerrado" → o cliente fica inativo. Arrastar de volta reabre o lead ou reativa o cliente. Tudo vai para o histórico.
- **Movimentos automáticos no acompanhamento:** primeira consulta feita → "Em tratamento"; sem retorno marcado → "Retorno a agendar" (e volta sozinho quando o retorno é agendado); pacote acabando, vencido ou concluído → "Renovação"; pacote novo → "Renovado". Um movimento feito à mão continua valendo até a situação do cliente mudar.
- **Cards:** tempo na etapa (verde, amarelo, vermelho), objetivo, origem e quem indicou, serviço de interesse, próxima consulta, uso do pacote, última consulta, valor em aberto e atalho para o WhatsApp. Quem fechou fica visível em "Fechado" por 30 dias, esmaecido.
- **Filtros:** nome/telefone, origem, objetivo, serviço e profissional (no celular ficam no botão "Filtros").
- Regras em `js/funil.js`; tela em `js/pages/kanban.js`.

### Fase 7 — Retornos e Dashboard

- **Alertas de retorno e recorrência** (`js/alertas.js`): sem retorno marcado, retorno vencido, pacote atrasado no ritmo, faltou e não remarcou, cliente sumido (sugere marcar como inativo). Aparecem na ficha do cliente (com **Dispensar** por um período e motivo, que vai para o histórico), na lista de Clientes (etiqueta e filtro "Com alerta de retorno") e no Dashboard. Os prazos ficam em **Configurações › Regras gerais**.
- **Dashboard** com filtro de período (e de profissional, quando houver mais de uma):
  - **No período:** clientes novos, atendimentos, faturamento estimado, conversão de leads, ticket médio, taxa de faltas, ocupação da agenda e taxa de retorno.
  - **Hoje:** clientes ativos, a receber (e atrasado), pacotes ativos e taxa de renovação, agendamentos do dia.
  - **Precisa de atenção:** retornos pendentes, consultas a confirmar (hoje e amanhã), pagamentos atrasados, pacotes para renovar, leads parados e aniversariantes da semana — cada item com o botão da ação (Agendar, Confirmar, Receber, Renovar, Dispensar, WhatsApp).
  - **Gráficos:** faturamento mês a mês (12 meses), leads por etapa, serviços mais realizados, origem dos leads com conversão, clientes que mais indicaram e dias mais movimentados.
- Cálculos em `js/indicadores.js`; tela em `js/pages/dashboard.js`.

### Fase 8 — Acabamento

- **Modo escuro:** botão de lua/sol na barra superior e opção em **Configurações › Aparência** (Automático, Claro, Escuro). O automático segue o sistema do aparelho. A escolha fica no navegador e é aplicada antes de a página aparecer.
- **Backup:** em **Configurações › Dados e backup** (só administrador): **Exportar backup** baixa um arquivo `.json` com todos os dados e fotos; **Importar backup** confere o arquivo, mostra um resumo e, antes de substituir tudo, baixa uma cópia dos dados atuais. O arquivo contém dados de saúde: guarde em local seguro.
- **Permissões revisadas** (seção 2 do planejamento): o profissional vê só os seus números no Dashboard e só visualiza o financeiro (sem lançar cobrança, receber, cancelar ou marcar parcela como paga); recepção sem acesso clínico; as ações também conferem o perfil por dentro, não só escondendo botões.
- **Validações:** medidas da avaliação física com faixas (circunferências, dobras), retorno com mais de um ano, valores absurdos. Ao fechar um formulário com algo digitado, o sistema pergunta antes de descartar.
- **Responsividade:** todas as páginas conferidas em 360, 390, 768, 1024 e 1366 px, nos dois temas, sem rolagem lateral.
- Arquivos novos: `js/tema.js` e `js/backup.js`.

A página de Conversas (fase 10) ainda mostra os dados só para leitura.

## Como abrir

Não precisa instalar nada: abra o arquivo `index.html` no navegador (dois cliques).

Os dados ficam salvos só naquele navegador. Para voltar ao começo, use **Restaurar dados de exemplo** no rodapé do menu (perfil Administrador).

> Use apenas dados fictícios no protótipo. Dados reais de pacientes só depois da fase 9 (login e banco de dados seguro).

## Estrutura

```
crm-nutri-dudu/
├── index.html            # casca: menu, barra superior e área das páginas
├── css/style.css         # visual (cores em variáveis no topo do arquivo)
└── js/
    ├── config.js         # listas fixas: perfis, funis, origens, status…
    ├── utils.js          # formatação de datas, R$, idade, IMC…
    ├── permissoes.js     # o que cada perfil pode ver e fazer
    ├── tema.js           # modo claro / escuro / automático
    ├── backup.js         # exportar e importar backup (com fotos)
    ├── indicadores.js    # cálculos do Dashboard
    ├── calculos.js       # regras: saldo de pacote, atrasos, sem retorno
    ├── funil.js          # regras do Kanban: movimentos automáticos, fechar, perder, encerrar
    ├── alertas.js        # alertas de retorno e recorrência
    ├── agenda.js         # regras da agenda: horários livres, conflitos, ocupação
    ├── avaliacao.js      # avaliação física: IMC, dobras, % de gordura
    ├── fotos-store.js    # fotos guardadas no navegador (IndexedDB)
    ├── seed.js           # dados de exemplo fictícios
    ├── store.js          # camada de dados
    ├── app.js            # navegação, busca, "+ Novo", seletor de perfil
    ├── components/       # ui.js (peças de tela), form.js (campos), modal.js (janelas),
    │                     # cadastro-pessoa.js (cadastro de lead/cliente), agendamento.js,
    │                     # anamnese.js, atendimento.js, financeiro.js
    └── pages/            # uma página por arquivo
```
