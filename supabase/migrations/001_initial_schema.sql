-- =============================================================================
-- MIGRATION: 001_initial_schema.sql
-- Loan Manager — Schema inicial + RLS Policies
-- =============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- para busca full-text por nome

-- =============================================================================
-- TABELAS
-- =============================================================================

-- CLIENTES
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  nickname    TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ  -- soft delete

  -- Evita duplicata de telefone por usuário
  -- UNIQUE(user_id, phone) -- ativar se quiser strict mode
);

CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_name_trgm ON clients USING GIN (name gin_trgm_ops);
CREATE INDEX idx_clients_phone ON clients(user_id, phone);

-- DOCUMENTOS DO CLIENTE
CREATE TABLE client_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT 'Documento',  -- "RG", "CPF", "Comprovante", etc.
  storage_path TEXT NOT NULL,                       -- path no Supabase Storage bucket
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_documents_client_id ON client_documents(client_id);

-- CONTRATOS
CREATE TABLE contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id),
  contract_date       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Valor principal
  principal_amount    NUMERIC(15,2) NOT NULL CHECK (principal_amount > 0),

  -- Tipo de juros: 'percent' = % sobre o principal | 'fixed' = valor fixo por parcela
  interest_type       TEXT NOT NULL CHECK (interest_type IN ('percent', 'fixed')),
  interest_value      NUMERIC(10,4) NOT NULL CHECK (interest_value >= 0),

  -- Mora (juros de atraso diário)
  late_fee_enabled    BOOLEAN NOT NULL DEFAULT false,
  late_fee_daily      NUMERIC(10,4) CHECK (
                        (late_fee_enabled = false) OR
                        (late_fee_enabled = true AND late_fee_daily IS NOT NULL AND late_fee_daily > 0)
                      ),

  -- Condição de pagamento
  payment_type        TEXT NOT NULL CHECK (payment_type IN ('lump_sum', 'installments')),
  installments_count  INT CHECK (
                        (payment_type = 'lump_sum' AND installments_count IS NULL) OR
                        (payment_type = 'installments' AND installments_count >= 2)
                      ),
  first_due_date      DATE NOT NULL,

  -- Total calculado (desnormalizado para queries rápidas no dashboard)
  total_amount        NUMERIC(15,2),
  total_interest      NUMERIC(15,2),

  -- Status do contrato
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'settled', 'overdue', 'cancelled')),

  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ  -- soft delete
);

CREATE INDEX idx_contracts_user_id ON contracts(user_id);
CREATE INDEX idx_contracts_client_id ON contracts(client_id);
CREATE INDEX idx_contracts_status ON contracts(user_id, status);
CREATE INDEX idx_contracts_first_due_date ON contracts(user_id, first_due_date);

-- PARCELAS (geradas atomicamente junto com o contrato)
CREATE TABLE installments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  installment_no   INT NOT NULL CHECK (installment_no > 0),

  due_date         DATE NOT NULL,
  principal        NUMERIC(15,2) NOT NULL CHECK (principal > 0),
  interest         NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (interest >= 0),

  -- Coluna gerada: sempre consistente com principal + interest
  total_amount     NUMERIC(15,2) GENERATED ALWAYS AS (principal + interest) STORED,

  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),

  paid_at          TIMESTAMPTZ,
  paid_amount      NUMERIC(15,2) CHECK (paid_amount IS NULL OR paid_amount > 0),
  late_fee_applied NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (late_fee_applied >= 0),

  UNIQUE(contract_id, installment_no)
);

CREATE INDEX idx_installments_contract_id ON installments(contract_id);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(contract_id, status);

-- PAGAMENTOS (histórico imutável de transações)
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES installments(id),
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount         NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  late_fee       NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_installment_id ON payments(installment_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

-- =============================================================================
-- TRIGGERS: updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TRIGGER: Atualizar status do contrato quando todas as parcelas forem pagas
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_contract_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total     INT;
  v_paid      INT;
  v_overdue   INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid'),
    COUNT(*) FILTER (WHERE status = 'overdue')
  INTO v_total, v_paid, v_overdue
  FROM installments
  WHERE contract_id = NEW.contract_id;

  IF v_paid = v_total THEN
    UPDATE contracts SET status = 'settled' WHERE id = NEW.contract_id;
  ELSIF v_overdue > 0 THEN
    UPDATE contracts SET status = 'overdue' WHERE id = NEW.contract_id;
  ELSE
    UPDATE contracts SET status = 'active' WHERE id = NEW.contract_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_contract_status
  AFTER INSERT OR UPDATE OF status ON installments
  FOR EACH ROW EXECUTE FUNCTION sync_contract_status();

-- =============================================================================
-- TRIGGER: Bloquear edição de contrato com pagamentos registrados
-- =============================================================================

CREATE OR REPLACE FUNCTION guard_contract_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_has_payments BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM payments p
    JOIN installments i ON i.id = p.installment_id
    WHERE i.contract_id = OLD.id
  ) INTO v_has_payments;

  IF v_has_payments AND (
    OLD.principal_amount <> NEW.principal_amount OR
    OLD.interest_type    <> NEW.interest_type    OR
    OLD.interest_value   <> NEW.interest_value   OR
    OLD.installments_count IS DISTINCT FROM NEW.installments_count
  ) THEN
    RAISE EXCEPTION
      'contract_immutable: Não é possível editar parâmetros financeiros de um contrato com pagamentos registrados.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_contract_immutability
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION guard_contract_immutability();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Cada usuário vê apenas seus próprios dados.
-- =============================================================================

ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;

-- ─── CLIENTS ────────────────────────────────────────────────────────────────

CREATE POLICY "clients: select own"
  ON clients FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "clients: insert own"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients: update own"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Soft delete: nunca DELETE físico
CREATE POLICY "clients: soft delete own"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── CLIENT DOCUMENTS ────────────────────────────────────────────────────────

CREATE POLICY "client_documents: select own"
  ON client_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "client_documents: insert own"
  ON client_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "client_documents: delete own"
  ON client_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_id AND c.user_id = auth.uid()
    )
  );

-- ─── CONTRACTS ───────────────────────────────────────────────────────────────

CREATE POLICY "contracts: select own"
  ON contracts FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "contracts: insert own"
  ON contracts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contracts: update own"
  ON contracts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── INSTALLMENTS ────────────────────────────────────────────────────────────
-- Acesso via join com contracts (user_id não está diretamente na tabela)

CREATE POLICY "installments: select via contract"
  ON installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "installments: insert via contract"
  ON installments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "installments: update via contract"
  ON installments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = contract_id AND c.user_id = auth.uid()
    )
  );

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
-- Acesso via join: payments → installments → contracts

CREATE POLICY "payments: select via contract"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      WHERE i.id = installment_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "payments: insert via contract"
  ON payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM installments i
      JOIN contracts c ON c.id = i.contract_id
      WHERE i.id = installment_id AND c.user_id = auth.uid()
    )
  );

-- Pagamentos são imutáveis: sem UPDATE ou DELETE
-- Para estorno, inserir payment com amount negativo e nota "Estorno"

-- =============================================================================
-- VIEW: Dashboard consolidado (sem RLS — usa SECURITY DEFINER com filtro)
-- =============================================================================

CREATE OR REPLACE VIEW dashboard_contracts AS
SELECT
  c.id,
  c.user_id,
  c.contract_date,
  c.status,
  c.principal_amount,
  c.total_amount,
  c.total_interest,
  c.first_due_date,
  c.payment_type,
  c.installments_count,

  cl.name    AS client_name,
  cl.nickname AS client_nickname,
  cl.phone   AS client_phone,

  -- Métricas de progresso
  COUNT(i.id)                                        AS total_installments,
  COUNT(i.id) FILTER (WHERE i.status = 'paid')       AS paid_installments,
  COUNT(i.id) FILTER (WHERE i.status = 'overdue')    AS overdue_installments,

  -- Saldo devedor
  COALESCE(SUM(i.total_amount) FILTER (WHERE i.status != 'paid'), 0) AS outstanding_balance,

  -- Próximo vencimento
  MIN(i.due_date) FILTER (WHERE i.status = 'pending') AS next_due_date

FROM contracts c
JOIN clients cl  ON cl.id = c.client_id
LEFT JOIN installments i ON i.contract_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id, cl.id;
