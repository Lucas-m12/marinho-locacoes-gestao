import { McpServer } from "@modelcontextprotocol/server";
import { registerTools, type ToolDeps } from "./tools";

export const SERVER_NAME = "marinho-gestao";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Ferramentas do sistema de gestão da Marinho Locações (locação de equipamentos para obra em Cajueiro, AL), ligadas à API de produção com um usuário próprio do Claude.

Como ler os dados:
- Dinheiro sempre em centavos inteiros (8000 = R$ 80,00). Valor null = ainda não definido pelo negócio ("a definir"); nunca invente valor.
- Datas em ISO 8601. O fuso do negócio é America/Maceio (-03:00): mande datas com esse fuso.
- Códigos: unidades MAR-001…, lotes ANDAIME e CARROCINHA, locações LOC-0001…, manutenção OS-001….
- Status da locação: QUOTE (rascunho), AWAITING_DEPOSIT (enviado, esperando sinal), CONFIRMED, SEPARATED, ON_SITE (na obra), RETURNED, CLOSED, CANCELED, EXPIRED (sinal venceu). OVERDUE aparece quando passou da devolução.
- Diárias e totais vêm calculados pelo sistema: use os números que as ferramentas devolvem.

Como agir:
- Antes de criar orçamento ou prorrogar, confira a disponibilidade e mostre ao Lucas o que vai lançar (cliente, itens, período, valores).
- Só registre pagamento, lançamento no caixa, cancelamento ou encerramento quando o Lucas pedir, com valor e forma de pagamento ditos por ele.
- Erros CONFLICT, INVALID_TRANSITION e PRECONDITION_FAILED são regras do sistema: explique o motivo (vem em detalhes) em vez de tentar de novo.
- Documentos, fotos, vistorias, caução, estornos, usuários e configurações ficam na tela do sistema (sistema.marinholocacoes.com).`;

export function createMarinhoMcpServer(deps: ToolDeps): {
	server: McpServer;
	tools: string[];
} {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ instructions: INSTRUCTIONS },
	);
	const tools = registerTools(server, deps);
	return { server, tools };
}
