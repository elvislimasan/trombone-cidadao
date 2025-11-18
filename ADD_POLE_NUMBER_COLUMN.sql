-- Script para adicionar coluna pole_number na tabela reports
-- Execute este SQL no Supabase SQL Editor

-- Adicionar coluna pole_number (texto, opcional)
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS pole_number TEXT;

-- Adicionar comentário na coluna para documentação
COMMENT ON COLUMN reports.pole_number IS 'Número identificador do poste de iluminação pública (obrigatório apenas para broncas de iluminação)';

-- Criar índice para facilitar buscas por número do poste (opcional, mas recomendado)
CREATE INDEX IF NOT EXISTS idx_reports_pole_number ON reports(pole_number) WHERE pole_number IS NOT NULL;

