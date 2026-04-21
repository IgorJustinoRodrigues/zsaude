"""Módulo Recepção (rec).

Conceitualmente abraça três funções habilitáveis por município/unidade:

1. **Totem (autoatendimento)** — paciente chega, identifica-se e retira
   uma senha pro atendimento na recepção.
2. **Balcão (recepcionista)** — chama a próxima senha, atende e encaminha.
3. **Painel de chamadas (TV)** — tela pública com senha atual + histórico
   e alerta sonoro.

Este módulo está em **fase esqueleto** — por ora só registra o código
``rec`` e uma permissão-base. Funções reais (queue, tickets, counters,
eventos em tempo real) entram em ondas posteriores.
"""
