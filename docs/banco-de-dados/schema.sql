-- =====================================================================
-- Gestão de Saúde & Performance — Rio Branco SAF
-- Banco de dados dos módulos HIDRATAÇÃO e PERIODIZAÇÃO NUTRICIONAL
-- PostgreSQL 13+
--
-- Ordem: parâmetros → cadastros → registros → funções → views → valores padrão.
-- O script pode ser executado mais de uma vez (idempotente).
--
-- PONTOS DE INTEGRAÇÃO COM O SISTEMA EXISTENTE (ajustar antes de rodar):
--   1. Tabela `atletas`: o sistema já tem "Gestão dos Atletas". Se a tabela
--      existente tiver outro nome/colunas, troque as referências a
--      atletas(id) e as colunas nome/posicao/peso_kg nas views.
--   2. `hidratacao_registros.sessao_pse_id`: deve apontar para a tabela de
--      sessões do módulo Cargas & PSE (FK comentada abaixo).
--   3. `cargas_dia`: se PSE e GPS já estão no sistema, troque esta tabela
--      por uma VIEW com as mesmas colunas lendo desses módulos.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Cadastro de atletas (só é criado se ainda não existir)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atletas (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       varchar(120) NOT NULL,
  posicao    varchar(3)   CHECK (posicao IN ('GOL','ZAG','LAT','VOL','MEI','ATA')),
  peso_kg    numeric(5,2) CHECK (peso_kg BETWEEN 40 AND 150),
  categoria  varchar(30),
  ativo      boolean NOT NULL DEFAULT true
);

-- =====================================================================
-- MÓDULO HIDRATAÇÃO
-- =====================================================================

-- Parâmetros (linha única). Alterar aqui muda alertas e cálculos.
CREATE TABLE IF NOT EXISTS hidratacao_parametros (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  perda_amarelo_pct     numeric(4,2) NOT NULL DEFAULT 1.00,  -- a partir deste valor: amarelo
  perda_vermelho_pct    numeric(4,2) NOT NULL DEFAULT 2.00,  -- acima deste valor: vermelho
  usg_desidratado       numeric(4,3) NOT NULL DEFAULT 1.020, -- USG acima: chegou desidratado
  cor_urina_desidratado smallint     NOT NULL DEFAULT 4,     -- cor ≥: chegou desidratado
  fator_reposicao       numeric(3,2) NOT NULL DEFAULT 1.50,  -- reposição = perda (kg) × fator
  CHECK (perda_amarelo_pct < perda_vermelho_pct)
);

-- Um registro por atleta por sessão de treino/jogo.
CREATE TABLE IF NOT EXISTS hidratacao_registros (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  atleta_id          bigint NOT NULL REFERENCES atletas(id),
  sessao_pse_id      bigint,           -- REFERENCES <tabela_sessoes_pse>(id)
  data               date NOT NULL,
  descricao_sessao   varchar(120),
  peso_pre_kg        numeric(5,2) NOT NULL CHECK (peso_pre_kg BETWEEN 30 AND 200),
  peso_pos_kg        numeric(5,2) NOT NULL CHECK (peso_pos_kg BETWEEN 30 AND 200),
  liquido_ingerido_l numeric(4,2) NOT NULL DEFAULT 0 CHECK (liquido_ingerido_l >= 0),
  urina_l            numeric(4,2) CHECK (urina_l >= 0),                -- opcional
  duracao_min        integer NOT NULL CHECK (duracao_min > 0),          -- vem da PSE
  cor_urina          smallint CHECK (cor_urina BETWEEN 1 AND 8),        -- pré-sessão
  usg                numeric(4,3) CHECK (usg BETWEEN 1.000 AND 1.050),  -- pré-sessão
  criado_em          timestamptz NOT NULL DEFAULT now(),
  criado_por         varchar(120),
  CONSTRAINT hidratacao_cor_ou_usg CHECK (cor_urina IS NOT NULL OR usg IS NOT NULL),
  CONSTRAINT hidratacao_variacao_plausivel CHECK (abs(peso_pre_kg - peso_pos_kg) <= peso_pre_kg * 0.10)
);
CREATE INDEX IF NOT EXISTS hidratacao_registros_atleta_data ON hidratacao_registros (atleta_id, data DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hidratacao_registros_atleta_sessao
  ON hidratacao_registros (atleta_id, sessao_pse_id) WHERE sessao_pse_id IS NOT NULL;

-- =====================================================================
-- MÓDULO PERIODIZAÇÃO NUTRICIONAL
-- =====================================================================

-- Tipos de dia e metas em g/kg (configuráveis).
CREATE TABLE IF NOT EXISTS periodizacao_metas (
  tipo_dia     varchar(4) PRIMARY KEY
               CHECK (tipo_dia IN ('MD-4','MD-3','MD-2','MD-1','MD','MD+1','MD+2','OFF')),
  ordem        smallint NOT NULL,
  perfil       varchar(40) NOT NULL,
  cho_min_gkg  numeric(3,1) NOT NULL CHECK (cho_min_gkg >= 0),
  cho_max_gkg  numeric(3,1) NOT NULL,
  ptn_min_gkg  numeric(3,1) NOT NULL CHECK (ptn_min_gkg >= 0),
  ptn_max_gkg  numeric(3,1) NOT NULL,
  CHECK (cho_min_gkg <= cho_max_gkg),
  CHECK (ptn_min_gkg <= ptn_max_gkg)
);

-- Faixas para normalizar a carga do dia (valor ≤ baixa → 0; ≥ alta → 1).
CREATE TABLE IF NOT EXISTS periodizacao_referencias_carga (
  fonte       varchar(20) PRIMARY KEY CHECK (fonte IN ('carga_interna','distancia','alta_intensidade')),
  descricao   varchar(80) NOT NULL,
  ref_baixa   numeric(8,1) NOT NULL,
  ref_alta    numeric(8,1) NOT NULL,
  CHECK (ref_baixa < ref_alta)
);

-- Distribuição da proteína nas refeições (linha única).
CREATE TABLE IF NOT EXISTS periodizacao_parametros (
  id                         boolean PRIMARY KEY DEFAULT true CHECK (id),
  ptn_por_refeicao_min_gkg   numeric(3,2) NOT NULL DEFAULT 0.30,
  ptn_por_refeicao_max_gkg   numeric(3,2) NOT NULL DEFAULT 0.40,
  refeicoes_min              smallint NOT NULL DEFAULT 4,
  refeicoes_max              smallint NOT NULL DEFAULT 5
);

-- Calendário de jogos.
CREATE TABLE IF NOT EXISTS jogos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data        date NOT NULL UNIQUE,
  adversario  varchar(120),
  competicao  varchar(80),
  mando       varchar(10) CHECK (mando IN ('casa','fora','neutro'))
);

-- Correção manual da classificação de um dia (ex.: folga extra).
CREATE TABLE IF NOT EXISTS periodizacao_ajustes_dia (
  data          date PRIMARY KEY,
  tipo_dia      varchar(4) NOT NULL REFERENCES periodizacao_metas(tipo_dia),
  motivo        varchar(200),
  ajustado_por  varchar(120),
  ajustado_em   timestamptz NOT NULL DEFAULT now()
);

-- Carga do dia por atleta (substituir por VIEW sobre PSE/GPS se já existirem).
CREATE TABLE IF NOT EXISTS cargas_dia (
  atleta_id           bigint NOT NULL REFERENCES atletas(id),
  data                date NOT NULL,
  pse                 numeric(3,1) CHECK (pse BETWEEN 0 AND 10),
  minutos             integer      CHECK (minutos >= 0),
  distancia_m         integer      CHECK (distancia_m >= 0),
  alta_intensidade_m  integer      CHECK (alta_intensidade_m >= 0),
  PRIMARY KEY (atleta_id, data)
);

-- =====================================================================
-- FUNÇÕES
-- =====================================================================

-- Classificação automática do dia pelo calendário de jogos.
-- Em calendário congestionado: MD > MD+1 > MD-1 > MD+2 > MD-2..MD-4 > OFF.
CREATE OR REPLACE FUNCTION classificar_dia_automatico(p_data date)
RETURNS varchar LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM jogos WHERE data = p_data) THEN 'MD'
           WHEN desde = 1 THEN 'MD+1'
           WHEN ate   = 1 THEN 'MD-1'
           WHEN desde = 2 THEN 'MD+2'
           WHEN ate BETWEEN 2 AND 4 THEN 'MD-' || ate
           ELSE 'OFF'
         END
  FROM (SELECT p_data - (SELECT max(data) FROM jogos WHERE data < p_data) AS desde,
               (SELECT min(data) FROM jogos WHERE data > p_data) - p_data AS ate) d;
$$;

-- Classificação final (ajuste manual tem prioridade).
CREATE OR REPLACE FUNCTION classificar_dia(p_data date)
RETURNS varchar LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT tipo_dia FROM periodizacao_ajustes_dia WHERE data = p_data),
                  classificar_dia_automatico(p_data));
$$;

-- Fator de carga 0–1: média das fontes disponíveis normalizadas.
-- Retorna NULL quando não há nenhum dado de carga.
CREATE OR REPLACE FUNCTION fator_carga(p_pse numeric, p_minutos integer,
                                       p_distancia_m integer, p_alta_intensidade_m integer)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT avg(LEAST(GREATEST((v.valor - r.ref_baixa) / (r.ref_alta - r.ref_baixa), 0), 1))
  FROM (VALUES
          ('carga_interna',    CASE WHEN p_pse > 0 AND p_minutos > 0 THEN p_pse * p_minutos END),
          ('distancia',        CASE WHEN p_distancia_m > 0 THEN p_distancia_m::numeric END),
          ('alta_intensidade', CASE WHEN p_alta_intensidade_m > 0 THEN p_alta_intensidade_m::numeric END)
       ) AS v(fonte, valor)
  JOIN periodizacao_referencias_carga r USING (fonte)
  WHERE v.valor IS NOT NULL;
$$;

-- Peso de referência do atleta numa data: peso pré-sessão mais recente
-- registrado na Hidratação até essa data; senão, o peso do cadastro.
CREATE OR REPLACE FUNCTION peso_referencia(p_atleta_id bigint, p_data date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT peso_pre_kg FROM hidratacao_registros
      WHERE atleta_id = p_atleta_id AND data <= p_data
      ORDER BY data DESC, id DESC LIMIT 1),
    (SELECT peso_kg FROM atletas WHERE id = p_atleta_id));
$$;

-- Cartão diário: metas em gramas de cada atleta ativo numa data.
CREATE OR REPLACE FUNCTION metas_do_dia(p_data date)
RETURNS TABLE (
  data date, tipo_dia varchar, ajuste_manual boolean, perfil varchar,
  atleta_id bigint, atleta varchar, posicao varchar, peso_kg numeric,
  fator_carga numeric, carga_informada boolean,
  cho_gkg numeric, cho_g integer, cho_faixa_min_g integer, cho_faixa_max_g integer,
  ptn_gkg numeric, ptn_g integer, refeicoes smallint, ptn_por_refeicao_g integer, ptn_por_refeicao_gkg numeric
) LANGUAGE sql STABLE AS $$
  WITH dia AS (
    SELECT classificar_dia(p_data) AS tipo,
           EXISTS (SELECT 1 FROM periodizacao_ajustes_dia WHERE periodizacao_ajustes_dia.data = p_data) AS manual
  ), base AS (
    SELECT a.id, a.nome, a.posicao, peso_referencia(a.id, p_data) AS peso,
           fator_carga(c.pse, c.minutos, c.distancia_m, c.alta_intensidade_m) AS fator,
           m.*, dia.tipo, dia.manual
    FROM atletas a
    CROSS JOIN dia
    JOIN periodizacao_metas m ON m.tipo_dia = dia.tipo
    LEFT JOIN cargas_dia c ON c.atleta_id = a.id AND c.data = p_data
    WHERE a.ativo
  ), calc AS (
    SELECT b.*,
           b.cho_min_gkg + COALESCE(b.fator, 0.5) * (b.cho_max_gkg - b.cho_min_gkg) AS cho_gkg_calc,
           (b.ptn_min_gkg + b.ptn_max_gkg) / 2 AS ptn_gkg_calc
    FROM base b
  ), prot AS (
    SELECT c.*,
           CASE WHEN c.ptn_gkg_calc * c.peso / p.refeicoes_min <= p.ptn_por_refeicao_max_gkg * c.peso
                THEN p.refeicoes_min ELSE p.refeicoes_max END AS n_refeicoes
    FROM calc c CROSS JOIN periodizacao_parametros p
  )
  SELECT p_data, tipo, manual, perfil,
         id, nome, posicao, peso,
         round(COALESCE(fator, 0.5), 2), fator IS NOT NULL,
         round(cho_gkg_calc, 1), round(cho_gkg_calc * peso)::int,
         round(cho_min_gkg * peso)::int, round(cho_max_gkg * peso)::int,
         round(ptn_gkg_calc, 1), round(ptn_gkg_calc * peso)::int,
         n_refeicoes, round(ptn_gkg_calc * peso / n_refeicoes)::int,
         round(ptn_gkg_calc / n_refeicoes, 2)
  FROM prot
  WHERE peso IS NOT NULL
  ORDER BY nome;
$$;

-- =====================================================================
-- VIEWS
-- =====================================================================

-- Registros de hidratação com todos os cálculos e alertas.
CREATE OR REPLACE VIEW v_hidratacao AS
SELECT r.id, r.data, r.atleta_id, a.nome AS atleta, a.posicao, r.sessao_pse_id, r.descricao_sessao,
       r.peso_pre_kg, r.peso_pos_kg, r.liquido_ingerido_l, r.urina_l, r.duracao_min, r.cor_urina, r.usg,
       round(c.perda_pct, 2)                                AS perda_pct,
       round(c.taxa_sudorese_lh, 2)                         AS taxa_sudorese_lh,
       round(GREATEST(c.perda_kg, 0) * p.fator_reposicao, 2) AS reposicao_sugerida_l,
       CASE WHEN c.perda_pct >  p.perda_vermelho_pct THEN 'vermelho'
            WHEN c.perda_pct >= p.perda_amarelo_pct  THEN 'amarelo'
            ELSE 'verde' END                                AS semaforo,
       (COALESCE(r.usg > p.usg_desidratado, false)
        OR COALESCE(r.cor_urina >= p.cor_urina_desidratado, false)) AS chegou_desidratado
FROM hidratacao_registros r
JOIN atletas a ON a.id = r.atleta_id
CROSS JOIN hidratacao_parametros p
CROSS JOIN LATERAL (
  SELECT r.peso_pre_kg - r.peso_pos_kg AS perda_kg,
         (r.peso_pre_kg - r.peso_pos_kg) / r.peso_pre_kg * 100 AS perda_pct,
         (r.peso_pre_kg - r.peso_pos_kg + r.liquido_ingerido_l - COALESCE(r.urina_l, 0))
           / (r.duracao_min / 60.0) AS taxa_sudorese_lh
) c;

-- Ranking de taxa de sudorese do elenco.
CREATE OR REPLACE VIEW v_ranking_sudorese AS
SELECT atleta_id, atleta, posicao,
       round(avg(taxa_sudorese_lh), 2) AS media_lh,
       max(taxa_sudorese_lh)           AS maxima_lh,
       count(*)                        AS sessoes,
       max(data)                       AS ultima_sessao,
       rank() OVER (ORDER BY avg(taxa_sudorese_lh) DESC) AS posicao_ranking
FROM v_hidratacao
GROUP BY atleta_id, atleta, posicao;

-- =====================================================================
-- VALORES PADRÃO
-- Referência: UEFA Expert Group Statement on Nutrition in Elite Football
-- (Collins et al., BJSM 2021). ON CONFLICT preserva valores já editados.
-- =====================================================================

INSERT INTO hidratacao_parametros (id) VALUES (true) ON CONFLICT DO NOTHING;
INSERT INTO periodizacao_parametros (id) VALUES (true) ON CONFLICT DO NOTHING;

INSERT INTO periodizacao_metas (tipo_dia, ordem, perfil, cho_min_gkg, cho_max_gkg, ptn_min_gkg, ptn_max_gkg) VALUES
  ('MD-4', 1, 'Treino moderado', 4, 6, 1.6, 2.2),
  ('MD-3', 2, 'Treino moderado', 4, 6, 1.6, 2.2),
  ('MD-2', 3, 'Treino moderado', 4, 6, 1.6, 2.2),
  ('MD-1', 4, 'Véspera de jogo', 6, 8, 1.6, 2.2),
  ('MD',   5, 'Dia de jogo',     6, 8, 1.6, 2.2),
  ('MD+1', 6, 'Recuperação',     6, 8, 1.6, 2.2),
  ('MD+2', 7, 'Treino leve',     3, 4, 1.6, 2.2),
  ('OFF',  8, 'Folga / leve',    3, 4, 1.6, 2.2)
ON CONFLICT (tipo_dia) DO NOTHING;

INSERT INTO periodizacao_referencias_carga (fonte, descricao, ref_baixa, ref_alta) VALUES
  ('carga_interna',    'PSE × minutos (UA)',               150,  600),
  ('distancia',        'Distância total GPS (m)',          3000, 7500),
  ('alta_intensidade', 'Distância em alta intensidade (m)', 150,  700)
ON CONFLICT (fonte) DO NOTHING;

COMMIT;
