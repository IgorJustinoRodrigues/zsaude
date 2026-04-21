"""Painéis de chamada lógicos (entidades nomeadas).

Um painel descreve **o que** uma TV da recepção vai exibir (modo, áudio,
setores). O dispositivo físico (``Device`` com ``type='painel'``) é
**vinculado** a um painel lógico no momento do pareamento — assim, um
mesmo device pode rodar um painel diferente trocando o vínculo, sem
re-parear.

Escopo:
- ``municipality``: templates oferecidos a todas as unidades.
- ``facility``: próprios da unidade (criados do zero ou clonando um
  template).
"""
