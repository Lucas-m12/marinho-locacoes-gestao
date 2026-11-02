import type { SessionUser } from "@marinho-gestao/contract";
import { buttonVariants } from "@marinho-gestao/ui/components/button";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo, BrandSymbol } from "@/components/brand";
import { F2Badge } from "@/components/f2-badge";
import { authGateway } from "@/data/auth";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import {
	allowedEntries,
	bottomNav,
	MAIN_NAV,
	MORE_SECTION_PATHS,
	type NavEntry,
	NEW_RENTAL,
} from "./nav-items";

function useIsActive() {
	const { pathname } = useLocation();
	return (to: string) => {
		if (to === "/locacoes/nova") return false;
		return pathname === to || pathname.startsWith(`${to}/`);
	};
}

function useSignOut() {
	const navigate = useNavigate();
	return async () => {
		await authGateway.signOut();
		await navigate({ to: "/entrar", search: {} });
	};
}

function UserAvatar({
	user,
	className,
}: {
	user: SessionUser;
	className?: string;
}) {
	return (
		<span
			role="img"
			aria-label={user.name}
			className={cn(
				"bg-navy-soft text-on-navy flex size-10 flex-none items-center justify-center rounded-full font-bold",
				className,
			)}
		>
			{initials(user.name).charAt(0)}
		</span>
	);
}

function Sidebar({ user }: { user: SessionUser }) {
	const isActive = useIsActive();
	const signOut = useSignOut();
	const canSell = allowedEntries([NEW_RENTAL], user.role).length > 0;

	return (
		<nav
			aria-label="Menu principal"
			className="on-navy bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-[248px] flex-none flex-col gap-7 overflow-y-auto px-4 pt-7 pb-5 xl:flex"
		>
			<Link to="/painel" className="px-2">
				<BrandLogo negative className="w-[196px]" />
			</Link>
			{canSell && (
				<Link
					to="/locacoes/nova"
					className={buttonVariants({ variant: "highlight", size: "default" })}
				>
					<NEW_RENTAL.icon aria-hidden />
					Nova locação
				</Link>
			)}
			<ul className="flex flex-col gap-1">
				{allowedEntries(MAIN_NAV, user.role).map((entry) => (
					<li key={entry.to}>
						<Link
							to={entry.to}
							aria-current={isActive(entry.to) ? "page" : undefined}
							className={cn(
								"text-on-navy-nav hover:bg-navy-soft flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors",
								isActive(entry.to) &&
									"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
							)}
						>
							<entry.icon
								aria-hidden
								className="size-[22px]"
								strokeWidth={1.8}
							/>
							<span className="grow">{entry.label}</span>
							{entry.phaseTwo && <F2Badge onNavy={!isActive(entry.to)} />}
						</Link>
					</li>
				))}
			</ul>
			<div className="border-sidebar-border mt-auto flex items-center gap-3 border-t px-2 pt-4">
				<UserAvatar user={user} />
				<span className="flex min-w-0 grow flex-col">
					<span className="truncate text-[15px] font-bold">{user.name}</span>
					{user.name !== ROLE_LABELS[user.role] && (
						<span className="text-on-navy-muted text-[13px]">
							{ROLE_LABELS[user.role]}
						</span>
					)}
				</span>
				<button
					type="button"
					onClick={signOut}
					className="text-on-navy-muted min-h-11 px-1 text-[13px] underline underline-offset-2"
				>
					Sair
				</button>
			</div>
		</nav>
	);
}

function Rail({ user }: { user: SessionUser }) {
	const isActive = useIsActive();
	const canSell = allowedEntries([NEW_RENTAL], user.role).length > 0;

	return (
		<nav
			aria-label="Menu principal"
			className="on-navy bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-[88px] flex-none flex-col items-center gap-5 overflow-y-auto px-2 py-6 md:flex xl:hidden"
		>
			<Link to="/painel" aria-label="Marinho Locações, ir para o painel">
				<BrandSymbol negative className="size-11" />
			</Link>
			{canSell && (
				<Link
					to="/locacoes/nova"
					aria-label="Nova locação"
					className="bg-highlight text-highlight-foreground flex size-[52px] flex-none items-center justify-center rounded-2xl"
				>
					<NEW_RENTAL.icon aria-hidden className="size-6" />
				</Link>
			)}
			<ul className="flex w-full flex-col gap-1">
				{allowedEntries(MAIN_NAV, user.role).map((entry) => (
					<li key={entry.to}>
						<Link
							to={entry.to}
							aria-current={isActive(entry.to) ? "page" : undefined}
							className={cn(
								"text-on-navy-nav hover:bg-navy-soft flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg text-center text-[11px] font-semibold transition-colors",
								isActive(entry.to) &&
									"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
							)}
						>
							<entry.icon
								aria-hidden
								className="size-[22px]"
								strokeWidth={1.8}
							/>
							{entry.short}
						</Link>
					</li>
				))}
			</ul>
			<UserAvatar user={user} className="mt-auto" />
		</nav>
	);
}

function PhoneTopBar({ user }: { user: SessionUser }) {
	return (
		<header className="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
			<Link to="/painel" className="flex min-h-11 items-center gap-2.5">
				<BrandSymbol className="size-8" />
				<span className="type-brand text-base">MARINHO</span>
			</Link>
			<UserAvatar user={user} className="bg-primary size-9 text-[15px]" />
		</header>
	);
}

function PhoneBottomBar({ user }: { user: SessionUser }) {
	const { pathname } = useLocation();
	const isActive = useIsActive();
	const inMore = MORE_SECTION_PATHS.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);
	const selected = (entry: NavEntry) =>
		entry.to === "/mais" ? inMore : isActive(entry.to);

	return (
		<nav
			aria-label="Menu principal"
			className="on-navy bg-sidebar sticky bottom-0 z-40 flex items-stretch gap-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
		>
			{bottomNav(user.role).map((entry) => (
				<Link
					key={entry.to}
					to={entry.to}
					aria-current={selected(entry) ? "page" : undefined}
					className={cn(
						"text-on-navy-nav flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold",
						selected(entry) &&
							"bg-sidebar-accent text-sidebar-accent-foreground",
						entry.accent && "bg-highlight text-highlight-foreground",
					)}
				>
					<entry.icon aria-hidden className="size-[22px]" strokeWidth={1.9} />
					{entry.short}
				</Link>
			))}
		</nav>
	);
}

export function AppShell({
	user,
	children,
}: {
	user: SessionUser;
	children: ReactNode;
}) {
	return (
		<div className="bg-background flex min-h-svh flex-col md:flex-row">
			<Sidebar user={user} />
			<Rail user={user} />
			<div className="flex min-w-0 grow flex-col">
				<PhoneTopBar user={user} />
				<main className="flex min-w-0 grow flex-col gap-6 px-4 pt-4 pb-7 md:px-7 md:pt-7 md:pb-10 xl:px-10 xl:pt-8 xl:pb-12">
					{children}
				</main>
				<PhoneBottomBar user={user} />
			</div>
		</div>
	);
}
