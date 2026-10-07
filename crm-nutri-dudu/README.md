# CRM Nutri Dudu

CRM da clínica de nutrição **Nutri Dudu**. O planejamento completo está em [`PLANEJAMENTO.md`](PLANEJAMENTO.md).

## Situação atual: fase 1 (Base) do protótipo

- Layout com menu lateral (no celular, menu inferior), busca de clientes e botão **+ Novo**.
- Navegação entre todas as páginas: Dashboard, Agenda, Kanban (comercial e acompanhamento), Clientes, ficha do cliente, Conversas, Serviços e Configurações.
- Camada de dados (`js/store.js`) que salva no navegador e já funciona do jeito que o Supabase vai exigir na fase 9.
- Dados de exemplo **fictícios**: uma nutricionista, horários, serviços e pacotes (inclusive o plano anual), leads, clientes, consultas, anamneses, avaliações e conversas.
- Seletor **"Ver como"** para simular os perfis Administrador, Profissional e Recepção. Exemplo: a faixa vermelha de alergia na ficha do Diego Carvalho some quando o perfil é Recepção.

**Dashboard** (adiantado): filtro de período (hoje, 7 dias, 30 dias, este mês, mês passado, personalizado), clientes novos, atendimentos, faturamento estimado, conversão de leads, agendamentos do dia, leads por etapa do Kanban, serviços/planos mais realizados, origem dos leads e dias mais movimentados. Os cálculos ficam em `js/indicadores.js`.

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
    ├── components/ui.js  # peças de interface reutilizadas
    └── pages/            # uma página por arquivo
```
