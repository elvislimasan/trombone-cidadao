# Transformação da Página de Bronca em Abaixo-Assinado (Estilo Change.org)

Este documento descreve as alterações realizadas para transformar a página de detalhes da bronca em uma interface de petição/abaixo-assinado, focada em engajamento e compartilhamento.

## Alterações Realizadas

### 1. Novos Componentes de Interface (`src/components/PetitionComponents.jsx`)

Foram criados componentes modulares para facilitar a manutenção e reutilização:

*   **`PetitionProgress`**:
    *   Exibe uma barra de progresso visual (Impacto).
    *   Mostra o número atual de "assinaturas" (baseado nos upvotes/apoios) e a próxima meta.
    *   Lista os apoiadores recentes (atualmente com dados de exemplo, pronto para integração com backend).
*   **`PetitionActions`**:
    *   Botão de destaque (Amarelo) para contribuição financeira.
    *   Botão secundário para compartilhamento.
    *   Ícones de métodos de pagamento (visual).
*   **`DonationModal`**:
    *   Modal interativo para doação.
    *   Opções de valores pré-definidos (R$ 15, R$ 30, R$ 40).
    *   **Integração Pix**: Exibe um QR Code e código "Copia e Cola" (simulado) para facilitar o pagamento.
    *   Incentiva o usuário mostrando quantas visualizações a doação irá gerar.
*   **`ShareModal`**:
    *   Modal focado em conversão via compartilhamento.
    *   Mensagem persuasiva ("O compartilhamento leva a muito mais assinaturas").
    *   Botões para WhatsApp, Facebook, Twitter e Email.
    *   Botão para copiar o link direto.

### 2. Integração na Página de Detalhes (`src/components/ReportDetails.jsx`)

*   Os novos componentes foram inseridos logo após o cabeçalho da bronca, garantindo máxima visibilidade.
*   O sistema de "assinaturas" foi ligado aos `upvotes` existentes da bronca.
*   Os botões de ação abrem os respectivos modais de Doação e Compartilhamento.

## Sequência de Prompts para Evolução (Sugestão)

Caso deseje expandir a funcionalidade no futuro, você pode utilizar a seguinte sequência de prompts com seu assistente de IA:

### Fase 1: Backend e Persistência de Assinaturas
> "Crie uma tabela 'signatures' no Supabase vinculada à tabela 'reports'. Ela deve armazenar o user_id (opcional para anônimos) e data da assinatura. Atualize a tela para ler a contagem real dessa tabela ao invés de usar os upvotes."

### Fase 2: Integração Real de Pagamentos
> "Integre a API do Mercado Pago ou Asaas no backend (Supabase Edge Functions) para gerar QR Codes Pix reais quando o usuário clicar em 'Contribuir'. O status do pagamento deve atualizar a lista de 'Apoiadores' na tela em tempo real."

### Fase 3: Gamificação e Metas
> "Implemente uma lógica de metas dinâmicas. Quando a meta de 100 assinaturas for atingida, a barra de progresso deve mudar de cor e uma nova meta (ex: 500) deve ser definida automaticamente, enviando uma notificação para todos os apoiadores."

### Fase 4: Compartilhamento com Imagens Dinâmicas (OG Image)
> "Melhore o compartilhamento nas redes sociais gerando uma imagem dinâmica (Open Graph) que mostre o título da bronca e a barra de progresso atualizada com o número de assinaturas, para criar senso de urgência no feed do Facebook/WhatsApp."

## Como Testar

1. Abra qualquer bronca no aplicativo.
2. Você verá a seção "Impacto" com a barra de progresso.
3. Clique em "Sim, vou contribuir..." para ver o modal de doação com Pix.
4. Clique em "Não, prefiro compartilhar" para ver as opções de redes sociais.
