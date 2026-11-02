import { can, type Permission } from "@marinho-gestao/domain";
import { buttonVariants } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { useCurrentUser } from "./use-current-user";

export function RoleGate({
	permission,
	children,
}: {
	permission: Permission;
	children: ReactNode;
}) {
	const user = useCurrentUser();
	if (can(user.role, permission)) return children;

	return (
		<Card className="items-center gap-3 px-5 py-12 text-center">
			<ShieldOff aria-hidden className="text-muted-foreground size-8" />
			<h1 className="type-title text-2xl">Sem acesso</h1>
			<p className="text-muted-foreground max-w-sm">
				Seu login não usa esta parte do sistema. Se precisar dela, fale com o
				Lucas.
			</p>
			<Link to="/painel" className={buttonVariants({ variant: "outline" })}>
				Voltar para o painel
			</Link>
		</Card>
	);
}
