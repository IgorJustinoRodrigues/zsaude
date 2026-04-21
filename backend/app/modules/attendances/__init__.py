"""Módulo de **atendimentos** — jornada do paciente na rede pública.

Um ``Attendance`` começa na recepção (senha via totem) e acompanha o
paciente por todas as fases até a alta: triagem, consulta, retorno, etc.
Hoje só as fases de recepção estão implementadas; as demais entram em
marcos futuros sem mudar a entidade.

Vive em schema per-município (``mun_<ibge>.attendances``). A
personalização da emissão (prefixos, reset da numeração) mora no totem
lógico correspondente, no schema ``app``.
"""
