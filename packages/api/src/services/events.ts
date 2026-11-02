import type { SessionUser } from "@marinho-gestao/contract";
import type { DbClient, Prisma } from "@marinho-gestao/db";

export type EventInput = {
	actor: SessionUser | null;
	action: string;
	entity: string;
	entityId: string;
	at: Date;
	message?: string | null;
	payload?: Prisma.InputJsonValue;
};

export async function recordEvent(
	db: DbClient,
	event: EventInput,
): Promise<void> {
	await db.event.create({
		data: {
			actorId: event.actor?.id ?? null,
			actorName: event.actor?.name ?? "Sistema",
			actorRole: event.actor?.role ?? null,
			action: event.action,
			entity: event.entity,
			entityId: event.entityId,
			message: event.message ?? null,
			payload: event.payload ?? {},
			createdAt: event.at,
		},
	});
}
