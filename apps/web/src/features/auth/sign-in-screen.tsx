import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
import { Button } from "@marinho-gestao/ui/components/button";
import { Checkbox } from "@marinho-gestao/ui/components/checkbox";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@marinho-gestao/ui/components/field";
import { Input } from "@marinho-gestao/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BrandLogo } from "@/components/brand";
import { authGateway, InvalidCredentialsError } from "@/data/auth";
import { isMockSource } from "@/data/source";

const SignInSchema = z.object({
	username: z.string().trim().min(1, "Informe o usuário"),
	password: z.string().min(1, "Informe a senha"),
	rememberMe: z.boolean(),
});

const MOCK_ACCESSES = [
	["Gestão", "lucas"],
	["Atendimento", "atendimento"],
	["Equipamentos", "equipamentos"],
] as const;

export function SignInScreen({ redirectTo }: { redirectTo?: string }) {
	const navigate = useNavigate();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);

	const form = useForm({
		defaultValues: { username: "", password: "", rememberMe: true },
		validators: { onSubmit: SignInSchema },
		onSubmit: async ({ value }) => {
			setSubmitError(null);
			try {
				await authGateway.signIn(value);
				await navigate({ to: redirectTo ?? "/painel" });
			} catch (error) {
				setSubmitError(
					error instanceof InvalidCredentialsError
						? error.message
						: "Não foi possível entrar agora. Tente de novo.",
				);
			}
		},
	});

	return (
		<div className="bg-background grid min-h-svh xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
			<div className="bg-primary text-on-navy hidden flex-col justify-between gap-10 p-16 xl:flex">
				<BrandLogo negative className="w-[300px]" />
				<div className="flex max-w-[520px] flex-col gap-4">
					<p className="type-title text-[56px]/[1.02]">
						Alugue o que sua obra precisa.
					</p>
					<p className="text-on-navy-muted text-lg/[27px]">
						Sistema de gestão da locadora: agenda, estoque, locações e dinheiro
						num lugar só.
					</p>
				</div>
				<div aria-hidden className="flex h-2 max-w-[320px]">
					<span className="bg-on-navy grow-3" />
					<span className="bg-highlight grow" />
				</div>
			</div>

			<div className="flex items-center justify-center px-5 py-8 md:px-12 md:py-16 xl:p-16">
				<div className="flex w-full max-w-[420px] flex-col gap-7">
					<BrandLogo className="w-[250px] xl:hidden" />
					<div className="flex flex-col gap-1.5">
						<h1 className="type-title text-4xl/[1.1]">Entrar</h1>
						<p className="text-muted-foreground text-base/6">
							Use o usuário e a senha que o Lucas criou para você.
						</p>
					</div>

					<form
						aria-label="Entrar no sistema"
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-[18px]">
							{submitError && (
								<Alert variant="destructive">
									<AlertDescription>{submitError}</AlertDescription>
								</Alert>
							)}
							<form.Field name="username">
								{(field) => {
									const invalid = field.state.meta.errors.length > 0;
									return (
										<Field data-invalid={invalid}>
											<FieldLabel htmlFor={field.name}>Usuário</FieldLabel>
											<Input
												id={field.name}
												autoComplete="username"
												autoCapitalize="none"
												autoCorrect="off"
												spellCheck={false}
												className="h-[52px] px-4"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												aria-invalid={invalid}
												aria-describedby={
													invalid ? `${field.name}-error` : undefined
												}
											/>
											<FieldError
												id={`${field.name}-error`}
												errors={field.state.meta.errors}
											/>
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="password">
								{(field) => {
									const invalid = field.state.meta.errors.length > 0;
									return (
										<Field data-invalid={invalid}>
											<FieldLabel htmlFor={field.name}>Senha</FieldLabel>
											<div className="relative">
												<Input
													id={field.name}
													type={showPassword ? "text" : "password"}
													autoComplete="current-password"
													className="h-[52px] pr-24 pl-4"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(event) =>
														field.handleChange(event.target.value)
													}
													aria-invalid={invalid}
													aria-describedby={
														invalid ? `${field.name}-error` : undefined
													}
												/>
												<Button
													type="button"
													variant="ghost"
													size="xs"
													className="absolute top-1 right-1"
													aria-pressed={showPassword}
													onClick={() => setShowPassword((shown) => !shown)}
												>
													{showPassword ? "Esconder" : "Mostrar"}
												</Button>
											</div>
											<FieldError
												id={`${field.name}-error`}
												errors={field.state.meta.errors}
											/>
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="rememberMe">
								{(field) => (
									<Field orientation="horizontal" className="min-h-11">
										<Checkbox
											id={field.name}
											checked={field.state.value}
											onCheckedChange={(checked) => field.handleChange(checked)}
										/>
										<FieldLabel
											htmlFor={field.name}
											className="text-[15px] font-normal"
										>
											Continuar conectado neste aparelho
										</FieldLabel>
									</Field>
								)}
							</form.Field>

							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button type="submit" size="lg" disabled={isSubmitting}>
										{isSubmitting ? "Entrando…" : "Entrar"}
									</Button>
								)}
							</form.Subscribe>
							<Button
								type="button"
								variant="ghost"
								className="self-center underline underline-offset-2"
								onClick={() =>
									toast.info("Peça ao Lucas para redefinir sua senha.")
								}
							>
								Esqueci a senha
							</Button>
						</FieldGroup>
					</form>

					{isMockSource && (
						<div className="bg-card flex flex-col gap-1 rounded-lg p-3.5 text-sm/5">
							<b>Acessos de demonstração (senha marinho123)</b>
							{MOCK_ACCESSES.map(([role, username]) => (
								<span key={username} className="text-muted-foreground">
									{role}: {username}
								</span>
							))}
						</div>
					)}

					<p className="border-line-strong text-muted-foreground border-t pt-4 text-[13px]/[19px]">
						Acesso só para a família. Cada pessoa tem o próprio login.
					</p>
				</div>
			</div>
		</div>
	);
}
