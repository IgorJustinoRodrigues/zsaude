"""Integração CadSUS (DATASUS PDQ Supplier).

Consulta paciente por CPF, CNS, nome + data de nascimento. Usado no pré-
cadastro pra puxar dados oficiais e evitar cadastro manual.

O fluxo técnico (SOAP 1.2 + HL7 v3 PRPA_IN201305UV02) está documentado
em ``docs/backend/cadsus.md``.
"""
