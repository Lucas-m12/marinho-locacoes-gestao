import { randomUUID } from "node:crypto";
import { internalEmail } from "@marinho-gestao/domain";
import {
	buildLots,
	buildTypes,
	CATALOG_SETTINGS,
	CATALOG_UNITS,
	CATALOG_USERS,
	DELIVERY_CITIES,
} from "@marinho-gestao/read-model/seed";
import { hashPassword } from "better-auth/crypto";
import { ENV } from "../src/env";
import { createPrismaClient } from "../src/index";

const PASSWORD_VARIABLES: Record<string, string | undefined> = {
	lucas: ENV.SEED_PASSWORD_LUCAS,
	atendimento: ENV.SEED_PASSWORD_ATENDIMENTO,
	equipamentos: ENV.SEED_PASSWORD_EQUIPAMENTOS,
};

const MIN_PASSWORD_LENGTH = 8;

const db = createPrismaClient(ENV);

async function seedSettings() {
	await db.settings.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1, ...CATALOG_SETTINGS },
	});
	for (const [position, city] of DELIVERY_CITIES.entries()) {
		await db.deliveryFee.upsert({
			where: { city },
			update: {},
			create: { city, feeCents: null, position },
		});
	}
}

async function seedTypes(): Promise<Map<string, string>> {
	const ids = new Map<string, string>();
	for (const type of buildTypes()) {
		const existing = await db.equipmentType.findFirst({
			where: { name: type.name },
		});
		const saved =
			existing ??
			(await db.equipmentType.create({
				data: {
					name: type.name,
					nicknames: type.nicknames,
					description: type.description,
					dailyPriceCents: type.dailyPriceCents,
					depositCents: type.depositCents,
					turnaroundHours: type.turnaroundHours,
					accessories: type.accessories,
					checklist: {
						create: type.checklist.map((item, position) => ({
							key: item.id,
							position,
							label: item.label,
							note: item.note,
							occurrenceKind: item.occurrenceKind,
						})),
					},
				},
			}));
		ids.set(type.id, saved.id);
	}
	return ids;
}

async function seedUnits(typeIds: Map<string, string>) {
	for (const unit of CATALOG_UNITS) {
		const typeId = typeIds.get(unit.typeId);
		if (!typeId) throw new Error(`Tipo ${unit.typeId} não encontrado`);
		await db.unit.upsert({
			where: { code: unit.code },
			update: {},
			create: {
				code: unit.code,
				typeId,
				name: unit.name,
				shortName: unit.shortName,
				labelApplied: unit.labelApplied,
			},
		});
	}
}

async function seedLots() {
	for (const lot of buildLots()) {
		const existing = await db.lot.findUnique({ where: { code: lot.code } });
		if (existing) continue;
		await db.lot.create({
			data: {
				code: lot.code,
				name: lot.name,
				nicknames: lot.nicknames,
				pricing: lot.pricing,
				total: lot.total,
				dailyPriceCents: lot.dailyPriceCents,
				depositCents: lot.depositCents,
				turnaroundHours: lot.turnaroundHours,
				checklist: {
					create: lot.checklist.map((item, position) => ({
						key: item.id,
						position,
						label: item.label,
						note: item.note,
						occurrenceKind: item.occurrenceKind,
					})),
				},
			},
		});
	}
}

async function seedCounters() {
	await db.$executeRaw`
		insert into counter (name, value) values ('LOC', 0), ('OS', 0)
		on conflict (name) do nothing
	`;
	await db.$executeRaw`
		insert into counter (name, value)
		select 'MAR', coalesce(max(substring(code from '^MAR-([0-9]+)$')::int), 0)
		from unit
		on conflict (name) do update set value = greatest(counter.value, excluded.value)
	`;
}

async function seedUsers() {
	for (const user of CATALOG_USERS) {
		const existing = await db.user.findUnique({
			where: { username: user.username },
		});
		if (existing) continue;
		const password = PASSWORD_VARIABLES[user.username];
		if (!password || password.length < MIN_PASSWORD_LENGTH) {
			throw new Error(
				`Defina SEED_PASSWORD_${user.username.toUpperCase()} com pelo menos ${MIN_PASSWORD_LENGTH} caracteres para criar o usuário ${user.username}.`,
			);
		}
		const id = randomUUID();
		await db.user.create({
			data: {
				id,
				name: user.name,
				email: internalEmail(user.username),
				emailVerified: true,
				username: user.username,
				displayUsername: user.username,
				role: user.role,
				accounts: {
					create: {
						id: randomUUID(),
						accountId: id,
						providerId: "credential",
						password: await hashPassword(password),
					},
				},
			},
		});
		console.log(`Usuário ${user.username} criado.`);
	}
}

try {
	await seedSettings();
	const typeIds = await seedTypes();
	await seedUnits(typeIds);
	await seedLots();
	await seedCounters();
	await seedUsers();
	console.log("Catálogo, configurações e usuários conferidos.");
} finally {
	await db.$disconnect();
}
