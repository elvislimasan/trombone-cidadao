/**
 * Adaptador do `toast({ title, description, variant })` sobre o sonner.
 *
 * A assinatura é a mesma que os ~720 call sites do app já usam — nenhum deles
 * precisa mudar. O que mudou é o motor por baixo: o toast antigo (Radix +
 * store manual) montava um viewport `fixed top-0 w-full` que capturava o toque
 * de toda a faixa superior enquanto estivesse visível, engolindo os botões do
 * MobileHeader, e só oferecia como saída um swipe para a direita — com o X de
 * fechar preso em `group-hover`, invisível no celular.
 *
 * O sonner resolve isso de fábrica: o cartão é o único elemento clicável,
 * o swipe funciona em mais de uma direção e o botão de fechar é visível no
 * toque. A configuração de posição fica em `<Toaster />` no App.jsx.
 */
import { toast as sonnerToast } from 'sonner';

/**
 * Erro pede mais tempo de leitura que confirmação: quem acabou de tocar em
 * "salvar" já sabe o que fez e só precisa da confirmação de relance.
 */
const DURACAO = {
	default: 3000,
	destructive: 5000,
};

export const toast = ({ title, description, variant, duration, ...resto }) => {
	const emitir = variant === 'destructive' ? sonnerToast.error : sonnerToast;

	// Sem título, a descrição vira a mensagem principal — o sonner não renderiza
	// um cartão só com `description`.
	const mensagem = title ?? description;
	const detalhe = title ? description : undefined;

	const id = emitir(mensagem, {
		description: detalhe,
		duration: duration ?? DURACAO[variant] ?? DURACAO.default,
		...resto,
	});

	return {
		id,
		dismiss: () => sonnerToast.dismiss(id),
		update: ({ title: novoTitulo, description: novaDescricao, ...novoResto }) =>
			emitir(novoTitulo ?? novaDescricao, {
				id,
				description: novoTitulo ? novaDescricao : undefined,
				...novoResto,
			}),
	};
};

export function useToast() {
	return { toast };
}
