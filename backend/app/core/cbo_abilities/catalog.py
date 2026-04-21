"""Catálogo declarativo de abilities clínicas.

Importar popula o registry. ``sync_abilities()`` não é necessário porque
a tabela ``cbo_abilities`` só associa CBO → ability por código — o
catálogo vive todo em código.

Abilities cobrem ações que exigem **competência profissional**
(regulada por lei/conselho), distintas das permissões do sistema.
"""

from __future__ import annotations

from app.core.cbo_abilities.registry import register as A

# ── Ações clínicas diretas ────────────────────────────────────────────────
A("clinical.prescribe",
  "Prescrever medicamento — privativo médico, dentista e enfermeiro "
  "conforme protocolo.")
A("clinical.prescribe_controlled",
  "Prescrever medicamento controlado (psicotrópico/B1/A1) — restrito a "
  "médicos e dentistas.")
A("clinical.execute_prescription",
  "Executar prescrição (administrar medicamento, aplicar curativo).")
A("clinical.screening",
  "Realizar triagem / classificação de risco.")
A("clinical.release_lab_report",
  "Assinar e liberar laudo laboratorial.")
A("clinical.release_imaging_report",
  "Assinar e liberar laudo de imagem.")
A("clinical.perform_procedure",
  "Executar procedimento clínico/cirúrgico.")
A("clinical.discharge",
  "Emitir alta hospitalar.")
A("clinical.declare_death",
  "Declarar óbito e emitir atestado.")

# ── Farmácia ──────────────────────────────────────────────────────────────
A("pharmacy.dispense",
  "Dispensar medicamento.")
A("pharmacy.dispense_controlled",
  "Dispensar medicamento controlado.")

# ── Multidisciplinar ──────────────────────────────────────────────────────
A("clinical.social_note",
  "Registrar evolução de serviço social.")
A("clinical.psych_note",
  "Registrar evolução psicológica / aplicar testagem.")
A("clinical.nutrition_prescribe",
  "Prescrever dieta / terapia nutricional.")
A("clinical.physio_prescribe",
  "Prescrever fisioterapia / executar evolução fisioterápica.")

# ── Regulação e transporte ────────────────────────────────────────────────
A("regulation.dispatch",
  "Despachar viatura / regular chamado de urgência.")
A("regulation.bed_allocate",
  "Regular/alocar leito hospitalar.")
