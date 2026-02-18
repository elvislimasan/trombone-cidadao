-- Script para adicionar coluna is_from_water_utility na tabela reports
-- Execute este SQL no Supabase SQL Editor

-- Adicionar coluna is_from_water_utility (boolean, opcional)
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS is_from_water_utility BOOLEAN;

-- Adicionar comentário na coluna para documentação
COMMENT ON COLUMN reports.is_from_water_utility IS 'Indica se o buraco foi aberto pela companhia de abastecimento de água/esgoto (apenas categoria buracos).';

-- Criar índice parcial para facilitar filtros por buracos da COMPESA
CREATE INDEX IF NOT EXISTS idx_reports_is_from_water_utility_buracos
ON reports(is_from_water_utility)
WHERE category_id = 'buracos' AND is_from_water_utility IS TRUE;
