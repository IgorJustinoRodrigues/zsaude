# Toasts

Feedback visual curto depois de ações (salvar, excluir, falhar).

## Uso rápido

```tsx
import { toast } from '../../store/toastStore'

toast.success('Usuário salvo')
toast.error('Falha ao excluir', 'Usuário está vinculado a sessões ativas.')
toast.warning('Campo em branco', 'CPF é obrigatório.')
toast.info('Novo lote disponível')
```

Duração padrão: **4000ms** (erros: 6000ms). Passe `duration` em ms no `push` completo se quiser customizar.

## Store

`src/store/toastStore.ts`:

```ts
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => { /* gera id, empurra, auto-dismiss */ },
  dismiss: (id) => ...,
  clear: () => ...,
}))
```

O helper `toast` chama `useToastStore.getState().push(...)` para você poder disparar fora de componentes (services, catch blocks, etc.).

## Toaster component

O `<Toaster />` é montado uma vez nos shells (`AppShell` e `SysShell`). Ele lê `useToastStore(s => s.toasts)` e renderiza a pilha no canto da tela, com animação.

Não monte `<Toaster />` em páginas individuais — daria toasts duplicados.

## Padrão de uso em actions

```tsx
async function save() {
  try {
    await userApi.update(id, patch)
    toast.success('Perfil atualizado')
    nav('/shared/users')
  } catch (e) {
    if (e instanceof HttpError) {
      toast.error('Falha ao salvar', e.message)
    } else {
      toast.error('Erro inesperado')
    }
  }
}
```

## O que não fazer

- ❌ Usar `alert()` ou `window.confirm()` — quebra o visual.
- ❌ Toast para erros de validação inline (mostre abaixo do campo).
- ❌ Toast com mensagem longa — use modal se precisar explicar.
- ❌ Empilhar 5 toasts numa ação — agregue num só.

## Controle fino

```ts
const id = useToastStore.getState().push({
  type: 'info',
  title: 'Processando...',
  duration: 0,            // não auto-dismiss
})
// ... quando terminar:
useToastStore.getState().dismiss(id)
```

Útil para operações longas onde você quer confirmar conclusão.
