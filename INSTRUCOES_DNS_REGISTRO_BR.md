# Guia: Configuração de DNS no Registro.br para Resend

Este guia ajudará você a configurar os registros DNS do seu domínio `trombonecidadao.com.br` diretamente no **Registro.br**.

## Passo 1: Verificar onde o DNS é gerenciado

Antes de começar, verifique se o seu domínio no Registro.br está usando os **Servidores de Nome (DNS)** do próprio Registro.br ou da Hostinger.

1. Acesse o [Registro.br](https://registro.br).
2. Clique no seu domínio `trombonecidadao.com.br`.
3. Desça até a seção **DNS**.
4. Se estiver escrito **"DNS gerenciado pelo Registro.br"**, siga as instruções abaixo.
5. Se aparecerem servidores como `ns1.dns-parking.com` ou algo da Hostinger, você deve seguir o [guia da Hostinger](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/INSTRUCOES_DNS_HOSTINGER.md).

## Passo 2: Configurar no Registro.br

Se o DNS for gerenciado no Registro.br:

1. Na seção **DNS**, clique em **EDITAR ZONA**.
2. Clique em **NOVA ENTRADA**.

### Adicionando os Registros do Resend

Para cada registro que o Resend forneceu, adicione uma nova entrada:

#### 1. Registros TXT (DKIM e SPF)
- No primeiro campo (Nome/Host), coloque o prefixo antes do seu domínio. 
    - Ex: Se o Resend deu `resend._domainkey.trombonecidadao.com.br`, coloque apenas `resend._domainkey`.
- No menu de seleção, escolha **TXT**.
- No campo maior, cole o valor longo fornecido pelo Resend.
- Clique em **ADICIONAR**.

#### 2. Registro MX
- Se o Resend pedir um registro MX:
- No primeiro campo, deixe **vazio** (ou coloque `@` se o sistema exigir).
- No menu de seleção, escolha **MX**.
- No campo de valor, cole o servidor (ex: `feedback-smtp.us-east-1.amazonses.com`).
- No campo de prioridade, coloque o número indicado (geralmente `10`).
- Clique em **ADICIONAR**.

## Passo 3: Salvar Alterações

1. Após adicionar todos os registros, clique em **SALVAR ALTERAÇÕES**.
2. **Importante**: O Registro.br processa essas mudanças em janelas de tempo. Pode levar de 30 minutos a algumas horas.

## Passo 4: Validar no Resend e Supabase

1. Volte ao Resend e clique em **Verify**.
2. Assim que estiver "Verified", vá ao painel do Supabase e atualize a variável `RESEND_FROM_EMAIL` com o seu e-mail oficial (ex: `Trombone Cidadão <contato@trombonecidadao.com.br>`).

---
*Dica: O Registro.br é bem rigoroso. Certifique-se de não deixar espaços em branco antes ou depois dos valores colados.*
