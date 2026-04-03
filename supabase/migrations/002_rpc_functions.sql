-- =============================================================================
-- MIGRATION: 002_rpc_functions.sql
-- Funções SQL chamadas pelas Edge Functions (transações atômicas)
-- =============================================================================

-- =============================================================================
-- RPC: create_contract_with_installments
-- Chamada por: generate-installments Edge Function
-- Cria contrato + todas as parcelas em uma única transação.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_contract_with_installments(
  p_user_id          UUID,
  p_client_id        UUID,
  p_contract_date    DATE,
  p_principal_amount NUMERIC,
  p_interest_type    TEXT,
  p_interest_value   NUMERIC,
  p_late_fee_enabled BOOLEAN,
  p_late_fee_daily   NUMERIC,
  p_payment_type     TEXT,
  p_installments_count INT,
  p_first_due_date   DATE,
  p_total_amount     NUMERIC,
  p_total_interest   NUMERIC,
  p_notes            TEXT,
  p_installments     JSONB    -- array de { installment_no, due_date, principal, interest, total_amount }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER  -- executa com permissões do owner, bypassando RLS para writes internos
AS $$
DECLARE
  v_contract_id UUID;
  v_item        JSONB;
BEGIN
  -- Valida que o cliente pertence ao usuário
  IF NOT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id AND user_id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client_not_found: Cliente não encontrado ou sem permissão';
  END IF;

  -- Insere o contrato
  INSERT INTO contracts (
    user_id, client_id, contract_date,
    principal_amount, interest_type, interest_value,
    late_fee_enabled, late_fee_daily,
    payment_type, installments_count, first_due_date,
    total_amount, total_interest, notes
  ) VALUES (
    p_user_id, p_client_id, p_contract_date,
    p_principal_amount, p_interest_type, p_interest_value,
    p_late_fee_enabled, p_late_fee_daily,
    p_payment_type, p_installments_count, p_first_due_date,
    p_total_amount, p_total_interest, p_notes
  )
  RETURNING id INTO v_contract_id;

  -- Insere as parcelas em bulk
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_installments)
  LOOP
    INSERT INTO installments (
      contract_id, installment_no, due_date, principal, interest
    ) VALUES (
      v_contract_id,
      (v_item->>'installment_no')::INT,
      (v_item->>'due_date')::DATE,
      (v_item->>'principal')::NUMERIC,
      (v_item->>'interest')::NUMERIC
    );
  END LOOP;

  RETURN v_contract_id;
END;
$$;

-- =============================================================================
-- RPC: register_installment_payment
-- Chamada por: calculate-late-fee Edge Function
-- Registra pagamento e atualiza status da parcela atomicamente.
-- =============================================================================

CREATE OR REPLACE FUNCTION register_installment_payment(
  p_installment_id UUID,
  p_paid_amount    NUMERIC,
  p_late_fee       NUMERIC,
  p_payment_date   TIMESTAMPTZ,
  p_is_fully_paid  BOOLEAN,
  p_notes          TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_paid NUMERIC;
BEGIN
  -- Busca valor já pago (para pagamentos parciais acumulados)
  SELECT COALESCE(paid_amount, 0)
  INTO v_current_paid
  FROM installments
  WHERE id = p_installment_id
  FOR UPDATE; -- lock para evitar race condition em pagamentos simultâneos

  -- Registra o pagamento no histórico imutável
  INSERT INTO payments (installment_id, paid_at, amount, late_fee, notes)
  VALUES (p_installment_id, p_payment_date, p_paid_amount, p_late_fee, p_notes);

  -- Atualiza a parcela
  UPDATE installments
  SET
    status           = CASE WHEN p_is_fully_paid THEN 'paid' ELSE 'partial' END,
    paid_at          = CASE WHEN p_is_fully_paid THEN p_payment_date ELSE NULL END,
    paid_amount      = v_current_paid + p_paid_amount,
    late_fee_applied = late_fee_applied + p_late_fee
  WHERE id = p_installment_id;
END;
$$;

-- =============================================================================
-- RPC: mark_overdue_installments
-- Chamada por: CRON job diário (pg_cron ou Supabase Scheduler)
-- Marca como overdue parcelas vencidas e não pagas.
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_overdue_installments()
RETURNS INT  -- retorna qtd de parcelas marcadas
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE installments
  SET status = 'overdue'
  WHERE
    status = 'pending'
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Agendar via pg_cron (se disponível no plano Supabase):
-- SELECT cron.schedule('mark-overdue-daily', '0 1 * * *', 'SELECT mark_overdue_installments()');
