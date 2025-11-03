# Ícones de Notificações - Guia Rápido

## ❓ Preciso adicionar ícones para cada tipo de notificação?

**NÃO é obrigatório**, mas **recomendado** para melhor experiência do usuário.

---

## ✅ **Opção 1: Usar um único ícone (mais simples)**

Se você **NÃO** adicionar ícones personalizados:
- ✅ Todas as notificações usarão o ícone padrão: `/icons/icon-192x192.png`
- ✅ Funciona perfeitamente
- ✅ Não precisa fazer nada

**O código já está configurado para usar o ícone padrão automaticamente.**

---

## 🎨 **Opção 2: Ícones personalizados por tipo (recomendado)**

Se você **QUISER** personalizar, adicione ícones específicos para cada tipo:

### Tipos de notificação que podem ter ícones personalizados:

1. `moderation_update` → `/icons/status-icon.png`
2. `status_update` → `/icons/update-icon.png`
3. `moderation_required` → `/icons/moderation-icon.png`
4. `resolution_submission` → `/icons/resolution-icon.png`
5. `work_update` → `/icons/work-icon.png`
6. `reports` → `/icons/report-icon.png`
7. `comments` → `/icons/comment-icon.png`
8. `system` → `/icons/icon-192x192.png` (padrão)

---

## 📁 **Como adicionar os ícones**

### Passo 1: Criar pasta de ícones

Crie a pasta `public/icons/` (se não existir):

```bash
mkdir public/icons
```

### Passo 2: Adicionar os ícones

Adicione os arquivos de ícone na pasta `public/icons/`:

```
public/
  icons/
    icon-192x192.png          # Ícone padrão (já existe)
    status-icon.png           # Opcional
    update-icon.png           # Opcional
    moderation-icon.png       # Opcional
    resolution-icon.png       # Opcional
    work-icon.png             # Opcional
    report-icon.png           # Opcional
    comment-icon.png          # Opcional
```

### Passo 3: Especificações dos ícones

**Recomendações:**
- **Formato**: PNG (melhor compatibilidade)
- **Tamanho**: 192x192px (ou múltiplos: 96x96, 192x192, 512x512)
- **Formato**: Quadrado (1:1)
- **Fundo**: Transparente ou sólido (depende do design)
- **Qualidade**: Boa resolução (não pixelizado)

### Passo 4: O código já está pronto!

O código na Edge Function já está configurado para usar os ícones personalizados. Se você adicionar os arquivos, eles serão usados automaticamente.

---

## 🎨 **Onde encontrar ícones**

### Opções gratuitas:

1. **Flaticon**: https://www.flaticon.com/
2. **Icons8**: https://icons8.com/
3. **Feather Icons**: https://feathericons.com/
4. **Heroicons**: https://heroicons.com/
5. **Material Icons**: https://fonts.google.com/icons

### Dicas para escolher ícones:

- Use estilo consistente (todos do mesmo pack)
- Mantenha cores similares
- Ícones simples funcionam melhor em pequenos tamanhos
- Teste em diferentes tamanhos antes de usar

---

## 🔧 **Se quiser usar o mesmo ícone para tudo**

Se você **NÃO** quiser personalizar por tipo, pode simplesmente:

1. **Não adicionar os ícones personalizados**
2. O código usará automaticamente: `/icons/icon-192x192.png`
3. Todas as notificações terão o mesmo ícone

**Isso funciona perfeitamente e é totalmente válido!**

---

## ✅ **Resumo**

| Situação | O que fazer | Resultado |
|----------|-------------|-----------|
| **Não quer personalizar** | Nada | Usa ícone padrão (`/icons/icon-192x192.png`) |
| **Quer personalizar** | Adicionar ícones em `public/icons/` | Cada tipo usa seu ícone específico |

---

## 💡 **Recomendação**

**Para começar:**
- Use o ícone padrão (`/icons/icon-192x192.png`) para todas as notificações
- Funciona perfeitamente!

**Depois (opcional):**
- Se quiser melhorar a UX, adicione ícones personalizados por tipo
- Isso ajuda os usuários a identificar rapidamente o tipo de notificação

---

## 🎯 **Checklist**

- [ ] Decidir: personalizar ou usar padrão?
- [ ] Se personalizar: criar pasta `public/icons/`
- [ ] Se personalizar: adicionar ícones (192x192px PNG)
- [ ] Testar notificações com os novos ícones

---

## 📝 **Nota Importante**

**O código já está configurado!** Você só precisa:
- **Opção 1**: Não fazer nada (usa ícone padrão) ✅
- **Opção 2**: Adicionar os arquivos de ícone na pasta `public/icons/` ✅

O sistema detecta automaticamente os ícones e os usa se existirem, caso contrário usa o padrão.

