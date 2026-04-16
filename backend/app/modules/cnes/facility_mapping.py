"""Mapeamento `tipo_unidade` (CNES) → `FacilityType` (enum do sistema).

Códigos oficiais do CNES (tabela TP_UNID, 2 caracteres). Códigos não mapeados
caem em `FacilityType.OUTRO` — é melhor cadastrar como "Outro" e o usuário
reclassificar depois do que recusar a importação.
"""

from __future__ import annotations

from app.modules.tenants.models import FacilityType

CNES_TYPE_MAP: dict[str, FacilityType] = {
    "01": FacilityType.UBS,          # Posto de Saúde
    "02": FacilityType.UBS,          # Centro de Saúde/Unidade Básica
    "04": FacilityType.POLICLINICA,  # Policlínica
    "05": FacilityType.HOSPITAL,     # Hospital Geral
    "07": FacilityType.HOSPITAL,     # Hospital Especializado
    "09": FacilityType.UPA,          # Pronto Atendimento
    "15": FacilityType.UBS,          # Unidade Mista
    "20": FacilityType.UPA,          # Pronto Socorro Geral
    "21": FacilityType.UPA,          # Pronto Socorro Especializado
    "36": FacilityType.POLICLINICA,  # Clínica/Centro de Especialidade
    "39": FacilityType.LAB,          # Unidade SADT (Apoio Diagnose/Terapia)
    "42": FacilityType.TRANSPORTES,  # Unidade Móvel Pré-Hospitalar
    "45": FacilityType.UBS,          # Unidade de Saúde da Família
    "50": FacilityType.VISA,         # Unidade de Vigilância em Saúde
    "61": FacilityType.HOSPITAL,     # Centro de Parto Normal
    "62": FacilityType.HOSPITAL,     # Hospital/Dia - Isolado
    "67": FacilityType.LAB,          # Laboratório
    "68": FacilityType.SMS,          # Central de Gestão em Saúde
    "69": FacilityType.LAB,          # Hemoterapia / Hematologia
    "70": FacilityType.CAPS,         # CAPS
    "71": FacilityType.UBS,          # Apoio à Saúde da Família (NASF)
    "73": FacilityType.UPA,          # Pronto-socorro
    "76": FacilityType.SMS,          # Central de Regulação do Acesso
    "80": FacilityType.LAB,          # LACEN
    "81": FacilityType.SMS,          # Central de Regulação Médica das Urgências
    "82": FacilityType.SMS,          # Central de Regulação de Serviços de Saúde
    "84": FacilityType.SMS,          # Central de Transplantes
}


def map_tipo_unidade(code: str | None) -> FacilityType:
    if not code:
        return FacilityType.OUTRO
    return CNES_TYPE_MAP.get(code.strip(), FacilityType.OUTRO)
