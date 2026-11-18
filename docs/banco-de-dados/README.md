# Banco de dados — Hidratação e Periodização Nutricional

Modelo de dados para levar ao sistema **Gestão de Saúde & Performance — Rio Branco SAF** os dois módulos prototipados em `hidratacao/` e `periodizacao/`.

| Arquivo | Conteúdo |
|---|---|
| `schema.sql` | Tabelas, restrições, funções de cálculo, views e valores padrão (PostgreSQL 13+). Pode ser executado mais de uma vez. |
| `exemplos.sql` | Dados de teste e consultas com o resultado esperado de cada cálculo. Só para ambiente de teste. |

Testado em PostgreSQL 16: o schema roda duas vezes sem erro, e os resultados de `exemplos.sql` batem com os dos protótipos.

## Antes de rodar: integração com o que já existe

1. **`atletas`**: o script só cria a tabela se ela não existir. Se o cadastro da Gestão dos Atletas usar outro nome ou outras colunas, ajuste as referências a `atletas(id)` e as colunas `nome`, `posicao`, `peso_kg`, `ativo` nas funções e views.
2. **Cargas & PSE**: `hidratacao_registros.sessao_pse_id` deve virar uma FK para a tabela de sessões da PSE (a linha está comentada). A duração da sessão (`duracao_min`) deve ser preenchida a partir dela.
3. **PSE e GPS para a periodização**: `cargas_dia` existe para o sistema funcionar sozinho. Se PSE e GPS já estão no banco, troque a tabela por uma **view** com as mesmas colunas (`atleta_id, data, pse, minutos, distancia_m, alta_intensidade_m`), somando as sessões do dia.
4. **Categorias**: o calendário (`jogos`) é único. Se cada categoria tiver o próprio calendário, adicione `categoria` em `jogos` e filtre por ela em `classificar_dia_automatico`.

## Módulo Hidratação

### `hidratacao_registros` — um registro por atleta por sessão

| Coluna | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `atleta_id` | bigint | sim | FK `atletas` |
| `sessao_pse_id` | bigint | não | FK sessão de Cargas & PSE; único por atleta |
| `data` | date | sim | |
| `descricao_sessao` | texto | não | ex.: "Treino técnico-tático" |
| `peso_pre_kg`, `peso_pos_kg` | numeric(5,2) | sim | 30–200 kg; diferença ≤ 10% do peso pré |
| `liquido_ingerido_l` | numeric(4,2) | sim | ≥ 0 (padrão 0) |
| `urina_l` | numeric(4,2) | não | ≥ 0 |
| `duracao_min` | integer | sim | > 0; vem da PSE |
| `cor_urina` | smallint | um dos dois | escala 1–8, antes da sessão |
| `usg` | numeric(4,3) | um dos dois | 1,000–1,050, antes da sessão |

### Cálculos (view `v_hidratacao`)

| Campo | Fórmula |
|---|---|
| `perda_pct` | (peso_pré − peso_pós) / peso_pré × 100 |
| `taxa_sudorese_lh` | (peso_pré − peso_pós + líquido − urina) / (duração_min / 60) |
| `reposicao_sugerida_l` | max(peso_pré − peso_pós, 0) × 1,5 |
| `semaforo` | verde < 1% · amarelo 1–2% · vermelho > 2% |
| `chegou_desidratado` | USG > 1,020 **ou** cor ≥ 4 |

Os limites ficam em `hidratacao_parametros` (linha única) e podem ser alterados sem mexer no código.

`v_ranking_sudorese` traz, por atleta: média, máxima, número de sessões, última sessão e posição no ranking.

## Módulo Periodização Nutricional

### Tabelas

| Tabela | Para que serve |
|---|---|
| `jogos` | Calendário: data (única), adversário, competição, mando |
| `periodizacao_ajustes_dia` | Correção manual da classificação de um dia, com motivo e autor |
| `periodizacao_metas` | Faixas de CHO e PTN (g/kg) por tipo de dia — editáveis |
| `periodizacao_referencias_carga` | Valores de carga "baixa" e "alta" usados para posicionar a meta na faixa |
| `periodizacao_parametros` | Proteína por refeição (0,3–0,4 g/kg) e nº de refeições (4–5) |
| `cargas_dia` | PSE, minutos, distância e alta intensidade do atleta no dia |

### Classificação do dia — `classificar_dia(data)`

1. Se houver ajuste manual para a data, ele vale.
2. Senão, pela distância até o jogo anterior e o próximo, nesta prioridade: **MD** → **MD+1** → **MD-1** → **MD+2** → **MD-2 a MD-4** → **OFF**.

Exemplo com jogos em 21/11 e 25/11: 17 MD-4 · 18 MD-3 · 19 MD-2 · 20 MD-1 · 21 MD · 22 MD+1 · 23 MD+2 · 24 MD-1 · 25 MD · 26 MD+1 · 27 MD+2 · 28 OFF.

### Metas padrão (g/kg) — UEFA Expert Group, Collins et al., BJSM 2021

| Dia | Perfil | CHO | PTN |
|---|---|---|---|
| MD-4, MD-3, MD-2 | Treino moderado | 4–6 | 1,6–2,2 |
| MD-1 | Véspera de jogo | 6–8 | 1,6–2,2 |
| MD | Dia de jogo | 6–8 | 1,6–2,2 |
| MD+1 | Recuperação | 6–8 | 1,6–2,2 |
| MD+2 | Treino leve | 3–4 | 1,6–2,2 |
| OFF | Folga / leve | 3–4 | 1,6–2,2 |

A especificação não define MD-4, MD-3, MD-2 e MD+2; esses enquadramentos são uma escolha inicial, editável na tabela.

### Cartão diário — `metas_do_dia(data)`

Retorna uma linha por atleta ativo:

- **Peso de referência**: último peso pré-sessão da Hidratação até a data; se não houver, o peso do cadastro.
- **Fator de carga (0–1)**: média das fontes informadas, cada uma normalizada pela faixa de referência:
  - PSE × minutos: 150 UA → 0, 600 UA → 1
  - Distância total: 3.000 m → 0, 7.500 m → 1
  - Alta intensidade: 150 m → 0, 700 m → 1
  - Sem nenhum dado de carga: 0,5 (meio da faixa).
- **Carboidrato** (g/kg) = CHO mín + fator × (CHO máx − CHO mín); em gramas, × peso.
- **Proteína** (g/kg) = meio da faixa; em gramas, × peso.
- **Refeições**: 4 se cada uma ficar ≤ 0,4 g/kg; senão 5.

Exemplo (MD-1, 75 kg): sem carga → 525 g CHO; com PSE 8 × 90 min → 600 g CHO; proteína 143 g em 5 refeições de 29 g.

O resultado de `metas_do_dia` é o que vai para o cartão impresso e para a exportação da cozinha (colunas: data, dia, atleta, posição, peso, CHO g/kg, CHO g, PTN g/kg, PTN g, refeições, PTN por refeição).

## Consultas mais usadas

```sql
-- Histórico de hidratação de um atleta
SELECT * FROM v_hidratacao WHERE atleta_id = :id ORDER BY data DESC;

-- Ranking de sudorese do elenco
SELECT * FROM v_ranking_sudorese ORDER BY posicao_ranking;

-- Classificação de um período
SELECT d::date, classificar_dia(d::date) FROM generate_series(:inicio::date, :fim::date, '1 day') d;

-- Cartão do dia
SELECT * FROM metas_do_dia(:data);
```
