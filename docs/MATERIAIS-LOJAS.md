# Materiais para publicação (App Store e Play Store) — Trombone Cidadão

Este documento reúne textos prontos e checklists do que normalmente é exigido para publicar e manter o app nas lojas. Ajuste os campos entre colchetes.

---

## 1) Identidade do app

- **Nome do app (Store Listing)**: Trombone Cidadão
- **Nome curto (se necessário)**: Trombone
- **Bundle ID / App ID**: com.trombonecidadao.app
- **Categoria principal (sugestão)**: Utilidades ou Social (dependendo do posicionamento)
- **Categoria secundária (sugestão)**: Notícias (se você prioriza obras/notícias), ou Utilidades

---

## 2) Texto para App Store (copiar/colar)

### 2.1 Subtítulo (até 30 caracteres)
Sugestões:
- Fiscalize e acompanhe obras
- Denuncie problemas na cidade
- Broncas, obras e mobilização

### 2.2 Texto promocional (opcional)
Sugestão:
Ajude a melhorar sua cidade: registre broncas com foto/vídeo, acompanhe obras públicas e receba atualizações.

### 2.3 Descrição (até ~4.000 caracteres)
Sugestão (PT-BR):
O Trombone Cidadão é um app para quem quer melhorar a cidade com informação, participação e transparência.

Com ele você consegue:
- Cadastrar uma bronca com localização no mapa e anexar foto/vídeo
- Acompanhar o andamento (status) e as atualizações da sua bronca
- Acompanhar obras públicas por fases/contratos e ver evolução, prazos, mídia e informações relevantes
- Favoritar itens para acessar rapidamente
- Receber notificações importantes (quando habilitadas)

Privacidade e controle:
- Você escolhe quando permitir acesso à localização e às notificações
- O app usa esses recursos para facilitar o cadastro e o acompanhamento, com foco em utilidade pública

Suporte:
Se tiver dúvidas ou quiser reportar um problema, fale com a equipe pelo e-mail: [EMAIL_SUPORTE].

### 2.4 Palavras‑chave (até 100 caracteres, separadas por vírgula)
Sugestão:
cidadania,denúncia,obra pública,transparência,iluminação,buracos,serviços,município,mapa

### 2.5 URL de suporte
- [URL_SUPORTE] (ex.: https://trombonecidadao.com.br/contato)

### 2.6 URL de marketing (opcional)
- [URL_MARKETING] (ex.: https://trombonecidadao.com.br)

### 2.7 Notas para revisão (App Review)
Sugestão:
- Login: o app permite navegação pública; algumas ações exigem autenticação.
- Recursos: câmera/galeria e localização são usados somente para cadastrar broncas com evidências e posição no mapa.
- Pagamentos: se houver doações/apoios via Stripe, são para finalidade no “mundo real” (doação), sem desbloquear conteúdo digital no app.

### 2.8 “O que há de novo” (a cada versão)
Modelo:
- Melhorias de performance e estabilidade.
- Ajustes no cadastro e acompanhamento de broncas.
- Correções em notificações e experiência no mapa.

---

## 3) Texto para Play Store (copiar/colar)

### 3.1 Título (até 50)
Trombone Cidadão

### 3.2 Descrição curta (até 80)
Registre broncas com foto e localização, acompanhe obras e receba atualizações.

### 3.3 Descrição completa
Você pode reaproveitar a descrição da App Store (seção 2.3) e adaptar:
- incluir tópicos curtos no início
- manter linguagem direta e orientada a benefícios

---

## 4) Privacidade (resumo do que você vai precisar declarar)

### 4.1 URLs exigidas
- **Política de Privacidade (URL pública)**: [URL_PRIVACIDADE]
- **Termos de Uso (URL pública)**: [URL_TERMOS]

### 4.2 Dados e permissões (baseado nas funcionalidades do app)
Use esta lista como base para preencher “App Privacy” (Apple) e “Data safety” (Google). Ajuste ao que você realmente coleta/usa.

- **Localização (aproximada/exata)**: para marcar o local da bronca e facilitar mapas
- **Fotos/Vídeos/Arquivos**: conteúdo enviado pelo usuário (evidências, contribuições)
- **Identificadores**: identificador do usuário (auth) e device token (push) quando push está ativo
- **Dados de uso/diagnóstico**: logs/erros, se habilitado por ferramentas de monitoramento (se não usa, remova)

Regras práticas:
- Se algo é apenas “processado no dispositivo” e não vai para o servidor, declare como “não coletado”.
- Se algo vai para o servidor e fica ligado ao usuário (ex.: favoritos, preferências), isso é “coletado” e “vinculado”.

---

## 5) Checklist de assets (lojas)

### 5.1 Ícone
- App Store: 1024×1024 PNG (sem transparência, sem cantos arredondados)
- Play Store: 512×512 (ícone), 1024×500 (feature graphic), etc.

### 5.2 Screenshots
Sugestão de roteiro (mínimo):
1) Feed/Mapa de broncas
2) Cadastro de bronca (localização + mídia)
3) Detalhe da bronca (status e evidências)
4) Obras públicas (lista)
5) Detalhe da obra (fase atual / histórico)
6) Notificações / favoritos

### 5.3 Vídeo de prévia (opcional)
- 15–30s com foco em “cadastro → acompanhamento → obras/notificações”.

---

## 6) Informações operacionais (para você não esquecer)

- **E-mail de suporte**: [EMAIL_SUPORTE]
- **Contato comercial (opcional)**: [EMAIL_COMERCIAL]
- **Classificação indicativa**: normalmente “Livre” (confirmar pelos questionários das lojas)
- **Regiões / idiomas**: pt-BR (e opcional en-US)
- **Deep links / domínio** (se usar): [DOMINIO_APP]

