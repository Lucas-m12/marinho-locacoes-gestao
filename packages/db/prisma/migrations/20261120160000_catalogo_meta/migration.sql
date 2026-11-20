-- Catálogo público (feed da Meta): foto do catálogo por unidade e texto
-- público para unidades e lotes. Os textos de MAR-001 a MAR-017 vêm do
-- catálogo do WhatsApp (20/10/2026) e só preenchem o que estiver vazio.
ALTER TYPE "unit_photo_slot" ADD VALUE 'CATALOG';

ALTER TABLE "unit" ADD COLUMN "catalog_description" TEXT;

ALTER TABLE "lot" ADD COLUMN "catalog_description" TEXT,
ADD COLUMN "catalog_photo_key" TEXT;

UPDATE "unit" SET "catalog_description" = 'Fura concreto, laje e alvenaria e também quebra no modo rompedor: para passar tubulação, chumbar e tirar revestimento. Encaixe SDS-plus. Vai na maleta, com empunhadura lateral.' WHERE "code" = 'MAR-001' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Para quebrar piso, contrapiso, parede e concreto sem se acabar no braço. Vai na maleta.' WHERE "code" = 'MAR-002' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Fura madeira, metal, tijolo e concreto (no modo impacto, com broca de vídea). Mandril com chave.' WHERE "code" = 'MAR-003' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Fura madeira, metal, tijolo e concreto (no modo impacto, com broca de vídea). Mandril com chave e empunhadura lateral para mais firmeza.' WHERE "code" = 'MAR-004' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Aparafusa e fura sem fio: montagem de móveis, drywall, forro, madeira e metal. Torque ajustável. Bateria de 21 V e 2.000 mAh.' WHERE "code" = 'MAR-005' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corta e desbasta metal, cerâmica e pedra, de acordo com o disco. Disco de 115 mm (4½"), com empunhadura lateral. 220 V.' WHERE "code" = 'MAR-006' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corta e desbasta metal, cerâmica e pedra, de acordo com o disco. Com empunhadura lateral.' WHERE "code" = 'MAR-007' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corta porcelanato, cerâmica, granito, mármore e concreto. Disco de 110 mm, 1.300 W. 220 V.' WHERE "code" = 'MAR-008' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corte reto em madeira, compensado, MDF e caibro. Disco de 185 mm (7¼"), com ajuste de profundidade e de ângulo.' WHERE "code" = 'MAR-009' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corte reto em madeira, compensado, MDF e caibro. 1.100 W. 220 V.' WHERE "code" = 'MAR-010' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Corte reto ou em curva em madeira, MDF, compensado e chapa fina, com a lâmina certa para cada material.' WHERE "code" = 'MAR-011' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Desbasta e acerta madeira: porta que está pegando, batente, caibro e tábua. Lâmina de 82 mm. 220 V.' WHERE "code" = 'MAR-012' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Acabamento de bordas, frisos e rebaixos em madeira e MDF. Pinça de ¼" (6,35 mm), 800 W. 220 V.' WHERE "code" = 'MAR-013' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Lixa madeira, massa e pintura com acabamento liso. Com saco coletor de pó.' WHERE "code" = 'MAR-014' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Pinta portão, grade, muro, madeira e móveis sem compressor e sem fio. Com bateria.' WHERE "code" = 'MAR-015' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Inversora para solda com eletrodo (MMA) e TIG Lift. Vai com máscara de solda Tork. Bivolt automático.' WHERE "code" = 'MAR-016' AND "catalog_description" IS NULL;
UPDATE "unit" SET "catalog_description" = 'Aspira pó, sujeira fina de obra e água. Tanque inox, mangueira e rodinhas.' WHERE "code" = 'MAR-017' AND "catalog_description" IS NULL;
