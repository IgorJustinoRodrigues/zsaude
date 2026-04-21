"""Catálogo de setores (Cardiologia, Clínica Médica, RX, …).

Usado por:
- **Painéis de chamada** (filtrar o que a TV exibe).
- **Encaminhamentos internos** após a recepção (triagem → X).

Escopo em cascata:

- Defaults do sistema → aplicados ao criar um município.
- Município (``scope_type='municipality'``) → editável pelo município.
- Unidade (``scope_type='facility'``) → opcional. Flag
  ``Facility.custom_sectors`` controla: ``false`` = herda do município;
  ``true`` = tem lista própria (criada clonando do município no momento
  em que o usuário marca "personalizar").

Setores são mutáveis — renomear não quebra nada, porque movimentações
guardam **snapshot do nome**, não FK.
"""
