-- Dados de exemplo e consultas de conferência (rodar DEPOIS de schema.sql,
-- só em ambiente de teste). Os resultados esperados batem com o protótipo.

BEGIN;

INSERT INTO atletas (nome, posicao, peso_kg) VALUES
  ('Bruno',  'ATA', 75.0),
  ('Carlos', 'VOL', 80.0);

INSERT INTO jogos (data, adversario, competicao, mando) VALUES
  ('2026-11-21', 'Adversário A', 'Estadual', 'casa'),
  ('2026-11-25', 'Adversário B', 'Estadual', 'fora');

INSERT INTO hidratacao_registros
  (atleta_id, data, descricao_sessao, peso_pre_kg, peso_pos_kg, liquido_ingerido_l, urina_l, duracao_min, cor_urina, usg)
VALUES
  ((SELECT id FROM atletas WHERE nome = 'Carlos'), '2026-11-18', 'Treino', 80.0, 78.8, 0.8, 0.1, 90, 5, NULL),
  ((SELECT id FROM atletas WHERE nome = 'Bruno'),  '2026-11-18', 'Treino', 75.0, 73.0, 1.0, NULL, 60, 2, 1.015);

INSERT INTO cargas_dia (atleta_id, data, pse, minutos) VALUES
  ((SELECT id FROM atletas WHERE nome = 'Bruno'), '2026-11-20', 8, 90);

COMMIT;

-- Hidratação. Esperado: Carlos 1,50% amarelo, 1,27 L/h, repor 1,80 L, chegou desidratado (cor 5);
--                       Bruno 2,67% vermelho, 3,00 L/h, repor 3,00 L, hidratado.
SELECT atleta, data, perda_pct, semaforo, taxa_sudorese_lh, reposicao_sugerida_l, chegou_desidratado
FROM v_hidratacao ORDER BY atleta;

SELECT * FROM v_ranking_sudorese ORDER BY posicao_ranking;

-- Classificação da semana. Esperado: 17 MD-4, 18 MD-3, 19 MD-2, 20 MD-1, 21 MD,
-- 22 MD+1, 23 MD+2, 24 MD-1, 25 MD, 26 MD+1, 27 MD+2, 28 OFF.
SELECT d::date AS data, classificar_dia(d::date) AS tipo
FROM generate_series('2026-11-16'::date, '2026-11-28', '1 day') d;

-- Cartão de 20/11 (MD-1). Esperado: Bruno 600 g CHO (carga PSE máxima);
-- Carlos 80 kg (peso pré da Hidratação) → 560 g CHO (meio da faixa), 152 g PTN em 5 refeições.
SELECT atleta, tipo_dia, peso_kg, fator_carga, cho_gkg, cho_g, ptn_g, refeicoes, ptn_por_refeicao_g
FROM metas_do_dia('2026-11-20');
