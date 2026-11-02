import { can } from "@marinho-gestao/domain";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Boxes, type LucideIcon, Users, Wallet, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { F2Badge } from "@/components/f2-badge";
import { PageHeader } from "@/components/page";
import { authGateway } from "@/data/auth";
import { orpc } from "@/data/client";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useBreakpoint } from "@/hooks/use-breakpoint";

const ROW =
	"flex min-h-[60px] items-center gap-3.5 border-t text-base font-semibold first:border-t-0";

function MoreLink({
	to,
	icon: Icon,
	label,
	trailing,
}: {
	to: "/estoque" | "/clientes" | "/dinheiro" | "/manutencao";
	icon: LucideIcon;
	label: string;
	trailing?: ReactNode;
}) {
	return (
		<Link to={to} className={ROW}>
			<Icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
			<span className="grow">{label}</span>
			{trailing && (
				<span className="text-muted-foreground text-sm font-normal">
					{trailing}
				</span>
			)}
		</Link>
	);
}

export function MoreScreen() {
	const user = useCurrentUser();
	const navigate = useNavigate();
	const breakpoint = useBreakpoint();
	const seesCustomers = can(user.role, "customers:read");
	const units = useQuery(orpc.equipment.listUnits.queryOptions({ input: {} }));
	const customers = useQuery(
		orpc.customers.list.queryOptions({
			input: {},
			enabled: seesCustomers,
		}),
	);

	if (breakpoint !== "phone") return <Navigate to="/painel" replace />;

	const signOut = async () => {
		await authGateway.signOut();
		await navigate({ to: "/entrar", search: {} });
	};

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Mais" />
			<nav
				aria-label="Outras telas"
				className="bg-card flex flex-col rounded-2xl px-4 py-1"
			>
				<MoreLink
					to="/estoque"
					icon={Boxes}
					label="Estoque"
					trailing={units.data ? `${units.data.total} + andaime` : undefined}
				/>
				{seesCustomers && (
					<MoreLink
						to="/clientes"
						icon={Users}
						label="Clientes"
						trailing={customers.data?.counts.ALL}
					/>
				)}
				{can(user.role, "money:read") && (
					<MoreLink to="/dinheiro" icon={Wallet} label="Dinheiro" />
				)}
				{can(user.role, "maintenance:read") && (
					<MoreLink
						to="/manutencao"
						icon={Wrench}
						label="Manutenção"
						trailing={<F2Badge />}
					/>
				)}
			</nav>
			<nav
				aria-label="Conta"
				className="bg-card flex flex-col rounded-2xl px-4 py-1"
			>
				{can(user.role, "settings:manage") && (
					<>
						<Link
							to="/configuracoes"
							search={{ aba: "precos" }}
							className="flex min-h-14 items-center text-base font-semibold"
						>
							Preços e cauções
						</Link>
						<Link
							to="/configuracoes"
							search={{ aba: "pessoas" }}
							className="flex min-h-14 items-center border-t text-base font-semibold"
						>
							Pessoas e acessos
						</Link>
					</>
				)}
				<button
					type="button"
					onClick={signOut}
					className="text-alert-foreground flex min-h-14 items-center border-t text-base font-semibold first:border-t-0"
				>
					Sair
				</button>
			</nav>
		</div>
	);
}
