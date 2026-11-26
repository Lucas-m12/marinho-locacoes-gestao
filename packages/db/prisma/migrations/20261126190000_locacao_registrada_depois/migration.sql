-- Locação registrada depois que aconteceu (rentals.recordCompleted): entra
-- devolvida ou encerrada, sem vistoria nem caução. As que já existem ficam
-- com false.
ALTER TABLE "rental" ADD COLUMN     "registered_after" BOOLEAN NOT NULL DEFAULT false;
