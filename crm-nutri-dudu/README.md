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

### Adiantado da fase 7

**Dashboard**: filtro de período (hoje, 7 dias, 30 dias, este mês, mês passado, personalizado), clientes novos, atendimentos, faturamento estimado, conversão de leads, agendamentos do dia, leads por etapa do Kanban, serviços/planos mais realizados, origem dos leads e dias mais movimentados. Os cálculos ficam em `js/indicadores.js`.

As demais páginas mostram os dados só para leitura. O que cada uma ganha nas próximas fases aparece no aviso "Esta página ainda está em construção".

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
    ├── indicadores.js    # cálculos do Dashboard
    ├── seed.js           # dados de exemplo fictícios
    ├── store.js          # camada de dados
    ├── app.js            # navegação, busca, "+ Novo", seletor de perfil
    ├── components/       # ui.js (peças de tela), form.js (campos), modal.js (janelas)
    └── pages/            # uma página por arquivo
```
