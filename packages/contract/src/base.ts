import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	ConflictErrorData,
	InvalidTransitionData,
	PreconditionFailedData,
} from "./common";

export const base = oc.errors({
	UNAUTHORIZED: { status: 401, message: "Sua sessão terminou. Entre de novo." },
	FORBIDDEN: { status: 403, message: "Seu acesso não permite esta ação." },
	NOT_FOUND: {
		status: 404,
		message: "Registro não encontrado.",
		data: z.object({ resource: z.string(), id: z.string() }),
	},
	CONFLICT: {
		status: 409,
		message: "O período escolhido está ocupado.",
		data: ConflictErrorData,
	},
	INVALID_TRANSITION: {
		status: 422,
		message: "Essa mudança de status não é permitida.",
		data: InvalidTransitionData,
	},
	PRECONDITION_FAILED: {
		status: 412,
		message: "Falta algo para concluir esta ação.",
		data: PreconditionFailedData,
	},
});
