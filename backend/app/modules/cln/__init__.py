"""Módulo Clínico (CLN).

Atua como consumidor de atendimentos encaminhados pela recepção. Cada
instalação configura qual setor representa a fila de triagem e qual
representa a fila de atendimento propriamente dito (ou só atendimento
se a unidade não usa triagem).

- ``cln_config`` (JSONB em Municipality/Facility) define os setores.
- ``ClnService`` expõe filas + ações (chamar, atender, liberar, finalizar).
"""
