-- SQL próprio no fim deste arquivo, além do que o Prisma gera:
--
-- btree_gist: permite misturar igualdade (unit_id) e sobreposição de
--   intervalos (tstzrange) no mesmo índice GiST da EXCLUDE constraint.
--
-- rental_item_unit_no_overlap: a mesma unidade não pode ter dois itens que
--   seguram a agenda com períodos que se cruzam. O período vai da saída até
--   blocked_until (devolução + folga do tipo), então a folga também é
--   protegida. Vale só para itens com unidade e com holds_calendar = true
--   (aguardando sinal, confirmada, separada, na obra). É a garantia final
--   contra duas reservas simultâneas, mesmo que dois pedidos passem juntos
--   pela checagem do service. A violação (23P01) vira o erro CONFLICT.
--
-- rental_item_unit_xor_lot: cada item é uma unidade com código ou um lote
--   (andaime, carrocinha), nunca os dois e nunca nenhum.
--
-- rental_item_period_valid: tstzrange exige início antes do fim; a constraint
--   devolve um erro claro em vez de falhar dentro do índice.
--
-- rental_item_quantity_positive: lote sem peça não reserva nada.
--
-- ledger_entry_amount_positive: o sentido do dinheiro está em direction;
--   o valor é sempre positivo, e o estorno é um lançamento inverso.
--
-- ledger_entry_immutable: lançamentos nunca são editados nem apagados
--   (ADR 0004). Erro se corrige com estorno.
--
-- settings_single_row: configurações têm uma linha só.

-- CreateEnum
CREATE TYPE "role" AS ENUM ('MANAGER', 'ATTENDANT', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "unit_status" AS ENUM ('AVAILABLE', 'SEPARATED', 'RENTED', 'IN_INSPECTION', 'IN_MAINTENANCE', 'DAMAGED', 'NOT_RETURNED', 'BLOCKED', 'RETIRED');

-- CreateEnum
CREATE TYPE "rental_status" AS ENUM ('QUOTE', 'AWAITING_DEPOSIT', 'CONFIRMED', 'SEPARATED', 'ON_SITE', 'RETURNED', 'CLOSED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "customer_kind" AS ENUM ('INDIVIDUAL', 'PROFESSIONAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "customer_origin" AS ENUM ('INSTAGRAM', 'GOOGLE', 'REFERRAL', 'PARTNER_STORE');

-- CreateEnum
CREATE TYPE "document_kind" AS ENUM ('PHOTO_ID', 'TAX_ID', 'PROOF_OF_ADDRESS', 'OTHER');

-- CreateEnum
CREATE TYPE "delivery_mode" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'CASH');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('SIGNAL', 'BALANCE', 'DELIVERY_FEE', 'CONSUMABLE', 'EXTRA_DAILY');

-- CreateEnum
CREATE TYPE "inspection_kind" AS ENUM ('CHECKOUT', 'RETURN');

-- CreateEnum
CREATE TYPE "checklist_answer" AS ENUM ('OK', 'NOT_OK', 'NA');

-- CreateEnum
CREATE TYPE "checklist_media_slot" AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT', 'PLATE_SERIAL', 'TEST_VIDEO');

-- CreateEnum
CREATE TYPE "occurrence_kind" AS ENUM ('DAMAGE', 'MISSING_PART', 'DIRT', 'LATE');

-- CreateEnum
CREATE TYPE "occurrence_decision" AS ENUM ('CHARGE', 'WAIVE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "ledger_account" AS ENUM ('CASH', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "ledger_direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ledger_category" AS ENUM ('RENTAL', 'DELIVERY', 'CONSUMABLE_SOLD', 'EXTRA_FEES', 'DEPOSIT_RETAINED', 'OTHER_IN', 'EQUIPMENT_PURCHASE', 'MAINTENANCE', 'FUEL', 'ADVERTISING', 'CONSUMABLE_BOUGHT', 'OTHER_OUT', 'DEPOSIT_RECEIVED', 'DEPOSIT_REFUNDED', 'DEPOSIT_TO_CASH');

-- CreateEnum
CREATE TYPE "maintenance_status" AS ENUM ('IN_REPAIR', 'AWAITING_INSPECTION', 'DONE');

-- CreateEnum
CREATE TYPE "maintenance_location" AS ENUM ('WORKSHOP', 'BASE');

-- CreateEnum
CREATE TYPE "upload_purpose" AS ENUM ('UNIT_PHOTO', 'DAMAGE_PHOTO', 'CHECKLIST_PHOTO', 'CHECKLIST_VIDEO', 'CUSTOMER_DOCUMENT', 'RECEIPT');

-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "unit_photo_slot" AS ENUM ('MAIN', 'FRONT', 'BACK', 'PLATE', 'SERIAL');

-- CreateEnum
CREATE TYPE "lot_pricing" AS ENUM ('PER_PIECE', 'PER_LOT');

-- CreateEnum
CREATE TYPE "signal_mode" AS ENUM ('FIXED', 'PERCENT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" "customer_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "responsible" TEXT,
    "authorized_receivers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsapp" TEXT,
    "alternate_phone" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "occupation" TEXT,
    "origin" "customer_origin",
    "referred_by" TEXT,
    "accepts_promotions" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "blocked_at" TIMESTAMPTZ(3),
    "blocked_reason" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_document" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "kind" "document_kind" NOT NULL,
    "file_key" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "nicknames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "description" TEXT,
    "daily_price_cents" INTEGER,
    "deposit_cents" INTEGER,
    "turnaround_hours" INTEGER NOT NULL,
    "accessories" TEXT,
    "recommended_ppe" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "equipment_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type_id" UUID,
    "lot_id" UUID,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "occurrence_kind" "occurrence_kind" NOT NULL,

    CONSTRAINT "checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "voltage" TEXT,
    "owner" TEXT,
    "accessories" TEXT,
    "label_applied" BOOLEAN NOT NULL DEFAULT true,
    "status" "unit_status" NOT NULL DEFAULT 'AVAILABLE',
    "status_reason" TEXT,
    "location" TEXT,
    "purchased_at" TIMESTAMPTZ(3),
    "acquired_at" TIMESTAMPTZ(3),
    "purchase_cents" INTEGER,
    "replacement_cents" INTEGER,
    "notes" TEXT,
    "returned_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_photo" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "unit_id" UUID NOT NULL,
    "slot" "unit_photo_slot" NOT NULL,
    "file_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_damage" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "unit_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "file_key" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_by_name" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "known_damage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nicknames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricing" "lot_pricing" NOT NULL,
    "total" INTEGER NOT NULL,
    "in_maintenance" INTEGER NOT NULL DEFAULT 0,
    "retired" INTEGER NOT NULL DEFAULT 0,
    "daily_price_cents" INTEGER,
    "deposit_cents" INTEGER,
    "kit_composition" TEXT,
    "asset_code" TEXT,
    "turnaround_hours" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "counter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" TEXT,
    "actor_name" TEXT NOT NULL,
    "actor_role" "role",
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "file_key" TEXT NOT NULL,
    "purpose" "upload_purpose" NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "upload_status" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rental_item_id" UUID NOT NULL,
    "kind" "inspection_kind" NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_answer" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "inspection_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "occurrence_kind" "occurrence_kind" NOT NULL,
    "answer" "checklist_answer",
    "observation" TEXT,
    "preexisting" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "inspection_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_media" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "inspection_id" UUID NOT NULL,
    "slot" "checklist_media_slot" NOT NULL,
    "file_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rental_id" UUID NOT NULL,
    "rental_item_id" UUID NOT NULL,
    "kind" "occurrence_kind" NOT NULL,
    "description" TEXT NOT NULL,
    "suggested_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "decision" "occurrence_decision" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account" "ledger_account" NOT NULL,
    "direction" "ledger_direction" NOT NULL,
    "category" "ledger_category" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "method" "payment_method" NOT NULL,
    "description" TEXT NOT NULL,
    "rental_id" UUID,
    "unit_id" UUID,
    "maintenance_order_id" UUID,
    "payment_kind" "payment_kind",
    "receipt_file_key" TEXT,
    "pair_id" UUID,
    "reversal_of_id" UUID,
    "reason" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_order" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "unit_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "location" "maintenance_location" NOT NULL,
    "location_name" TEXT,
    "estimated_cost_cents" INTEGER,
    "final_cost_cents" INTEGER,
    "expected_back_at" TIMESTAMPTZ(3),
    "status" "maintenance_status" NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "maintenance_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "rental_status" NOT NULL DEFAULT 'QUOTE',
    "delivery_mode" "delivery_mode" NOT NULL,
    "site_address" TEXT,
    "site_city" TEXT,
    "site_pin_url" TEXT,
    "receiver_name" TEXT,
    "term_signed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "deposit_deadline_at" TIMESTAMPTZ(3),
    "delivery_fee_cents" INTEGER,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "price_frozen_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "late_notice_given" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "separated_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rental_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "unit_id" UUID,
    "lot_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "daily_price_cents" INTEGER,
    "deposit_cents" INTEGER,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3) NOT NULL,
    "holds_calendar" BOOLEAN NOT NULL DEFAULT false,
    "checkout_done_at" TIMESTAMPTZ(3),
    "return_done_at" TIMESTAMPTZ(3),

    CONSTRAINT "rental_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_demand" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "item" TEXT NOT NULL,
    "type_id" UUID,
    "reason" TEXT NOT NULL,
    "city" TEXT,
    "requested_on" DATE NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lost_demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "signal_mode" "signal_mode",
    "signal_value_cents" INTEGER,
    "signal_percent" DOUBLE PRECISION,
    "signal_deadline_hours" INTEGER NOT NULL,
    "default_turnaround_hours" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_fee" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "city" TEXT NOT NULL,
    "fee_cents" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "delivery_fee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "customer_document_customer_id_idx" ON "customer_document"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_item_type_id_key_key" ON "checklist_item"("type_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_item_lot_id_key_key" ON "checklist_item"("lot_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "unit_code_key" ON "unit"("code");

-- CreateIndex
CREATE INDEX "unit_type_id_idx" ON "unit"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_photo_unit_id_slot_key" ON "unit_photo"("unit_id", "slot");

-- CreateIndex
CREATE INDEX "known_damage_unit_id_idx" ON "known_damage"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_code_key" ON "lot"("code");

-- CreateIndex
CREATE INDEX "event_entity_entity_id_created_at_idx" ON "event"("entity", "entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "upload_file_key_key" ON "upload"("file_key");

-- CreateIndex
CREATE INDEX "upload_status_created_at_idx" ON "upload"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_user_id_procedure_key_key" ON "idempotency_key"("user_id", "procedure", "key");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_rental_item_id_kind_key" ON "inspection"("rental_item_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_answer_inspection_id_key_key" ON "inspection_answer"("inspection_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_media_inspection_id_slot_key" ON "inspection_media"("inspection_id", "slot");

-- CreateIndex
CREATE INDEX "occurrence_rental_id_idx" ON "occurrence"("rental_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_reversal_of_id_key" ON "ledger_entry"("reversal_of_id");

-- CreateIndex
CREATE INDEX "ledger_entry_account_occurred_at_idx" ON "ledger_entry"("account", "occurred_at");

-- CreateIndex
CREATE INDEX "ledger_entry_rental_id_idx" ON "ledger_entry"("rental_id");

-- CreateIndex
CREATE INDEX "ledger_entry_pair_id_idx" ON "ledger_entry"("pair_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_order_code_key" ON "maintenance_order"("code");

-- CreateIndex
CREATE INDEX "maintenance_order_unit_id_status_idx" ON "maintenance_order"("unit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rental_code_key" ON "rental"("code");

-- CreateIndex
CREATE INDEX "rental_status_idx" ON "rental"("status");

-- CreateIndex
CREATE INDEX "rental_customer_id_idx" ON "rental"("customer_id");

-- CreateIndex
CREATE INDEX "rental_item_rental_id_idx" ON "rental_item"("rental_id");

-- CreateIndex
CREATE INDEX "rental_item_lot_id_holds_calendar_idx" ON "rental_item"("lot_id", "holds_calendar");

-- CreateIndex
CREATE INDEX "lost_demand_requested_on_idx" ON "lost_demand"("requested_on");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_fee_city_key" ON "delivery_fee"("city");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_document" ADD CONSTRAINT "customer_document_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "equipment_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "equipment_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_photo" ADD CONSTRAINT "unit_photo_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "known_damage" ADD CONSTRAINT "known_damage_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_rental_item_id_fkey" FOREIGN KEY ("rental_item_id") REFERENCES "rental_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_answer" ADD CONSTRAINT "inspection_answer_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_rental_item_id_fkey" FOREIGN KEY ("rental_item_id") REFERENCES "rental_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_maintenance_order_id_fkey" FOREIGN KEY ("maintenance_order_id") REFERENCES "maintenance_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "ledger_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_order" ADD CONSTRAINT "maintenance_order_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental" ADD CONSTRAINT "rental_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_demand" ADD CONSTRAINT "lost_demand_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "equipment_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints próprias (veja o topo do arquivo)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_unit_no_overlap"
  EXCLUDE USING gist ("unit_id" WITH =, tstzrange("starts_at", "blocked_until", '[)') WITH &&)
  WHERE ("unit_id" IS NOT NULL AND "holds_calendar");

ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_unit_xor_lot"
  CHECK (("unit_id" IS NULL) <> ("lot_id" IS NULL));

ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_period_valid"
  CHECK ("starts_at" < "blocked_until");

ALTER TABLE "rental_item" ADD CONSTRAINT "rental_item_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_amount_positive"
  CHECK ("amount_cents" > 0);

CREATE FUNCTION ledger_entry_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entry é imutável: use um estorno';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entry_immutable"
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_reject_change();

ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);
