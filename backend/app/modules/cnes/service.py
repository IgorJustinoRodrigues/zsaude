"""Orquestração da importação CNES.

Recebe bytes de um ZIP, extrai em memória, valida cabeçalho/IBGE contra o
contexto do usuário e aplica uma transação única sobre o schema do município.

Estratégia por arquivo (mesmo espírito do PHP legado):
- INSERT/UPDATE (`_upsert_*`): lfces004, lfces018, lfces021.
- DELETE-por-unidade + INSERT: lfces002, lfces032, lfces037, lfces038, lfces045.

Qualquer erro → rollback total; `cnes_imports` registra `failed` com mensagem.
"""

from __future__ import annotations

import io
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.modules.cnes.facility_mapping import map_tipo_unidade
from app.modules.cnes.parsers import (
    lfces002, lfces004, lfces018, lfces021,
    lfces032, lfces037, lfces038, lfces045,
)
from app.modules.tenants.models import Facility, Municipality
from app.tenant_models.cnes import (
    CnesImport,
    CnesImportFile,
    CnesImportStatus,
    CnesProfessional,
    CnesProfessionalUnit,
    CnesTeam,
    CnesTeamProfessional,
    CnesUnit,
    CnesUnitBed,
    CnesUnitQualification,
    CnesUnitService,
)

log = get_logger(__name__)

# Ordem importa: unidades primeiro (FK lógica em outras tabelas).
_PROCESSING_ORDER: list[str] = [
    "lfces004.txt",
    "lfces018.txt",
    "lfces021.txt",
    "lfces002.txt",
    "lfces032.txt",
    "lfces037.txt",
    "lfces038.txt",
    "lfces045.txt",
]

_MAX_WARNINGS_PER_FILE = 50
_NAME_SIMILARITY_WARN_THRESHOLD = 0.60


@dataclass
class _FileResult:
    filename: str
    rows_total: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    rows_skipped: int = 0
    warnings: list[str] = None  # type: ignore[assignment]
    error_message: str = ""

    def __post_init__(self) -> None:
        if self.warnings is None:
            self.warnings = []

    def warn(self, msg: str) -> None:
        if len(self.warnings) < _MAX_WARNINGS_PER_FILE:
            self.warnings.append(msg)


class CnesImportError(AppError):
    """Exceção visível ao usuário durante importação."""

    code = "cnes_import_error"
    status = 400


class CnesImportService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        expected_ibge: str,
        user_id: uuid.UUID,
        user_name: str,
    ) -> None:
        self.db = db
        self.expected_ibge = expected_ibge  # 7 dígitos (do contexto)
        self.user_id = user_id
        self.user_name = user_name
        # Contadores do espelhamento CNES → app.facilities. Populado em
        # `_handle_004` e materializado como entrada sintética no histórico.
        self._facility_sync: dict[str, int] | None = None

    # ─────────────────────────────────────────────────────────────────────
    # Entry point

    async def import_zip(self, zip_bytes: bytes, filename: str) -> CnesImport:
        # 1. Extrai o ZIP em memória.
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as exc:
            raise CnesImportError("O arquivo enviado não é um ZIP válido.") from exc

        # Mapa filename → conteúdo (decodificado latin-1, linhas). Nomes
        # normalizados para minúsculo.
        files: dict[str, list[str]] = {}
        for info in zf.infolist():
            name = info.filename.rsplit("/", 1)[-1].lower()
            if name in _PROCESSING_ORDER:
                raw = zf.read(info)
                try:
                    text = raw.decode("latin-1")
                except UnicodeDecodeError:
                    text = raw.decode("utf-8", errors="replace")
                files[name] = text.splitlines()

        missing = set(_PROCESSING_ORDER) - set(files.keys())
        if "lfces004.txt" not in files:
            raise CnesImportError(
                "O ZIP não contém o arquivo `lfces004.txt` (unidades de saúde) — obrigatório."
            )

        # 2. Extrai competência do header de lfces004 e IBGE da linha 1.
        lfces004_lines = files["lfces004.txt"]
        if len(lfces004_lines) < 2:
            raise CnesImportError("lfces004.txt vazio ou sem dados.")

        header = lfces004_lines[0]
        competencia = header[0:6]
        if not competencia.isdigit() or len(competencia) != 6:
            raise CnesImportError(f"Competência inválida no cabeçalho: {competencia!r}.")

        ibge_file = lfces004_lines[1][202:208].strip()
        if not ibge_file.isdigit() or len(ibge_file) != 6:
            raise CnesImportError(f"IBGE inválido na primeira linha: {ibge_file!r}.")

        # 3. Valida que o IBGE do arquivo bate com o do contexto.
        # O contexto usa 7 dígitos (IBGE completo); o arquivo traz 6. Comparamos
        # os 6 primeiros dígitos de cada.
        if ibge_file != self.expected_ibge[:6]:
            raise CnesImportError(
                f"IBGE do arquivo ({ibge_file}) difere do município do contexto "
                f"({self.expected_ibge}). Troque para o município correto antes de importar."
            )

        # 4. Cria registro de importação com status=running.
        import_row = CnesImport(
            competencia=competencia,
            uploaded_by_user_id=self.user_id,
            uploaded_by_user_name=self.user_name,
            zip_filename=filename[:200],
            zip_size_bytes=len(zip_bytes),
            status=CnesImportStatus.RUNNING,
            started_at=datetime.now(UTC),
        )
        self.db.add(import_row)
        await self.db.flush()

        file_results: list[_FileResult] = []

        # 5. Processa cada arquivo na ordem canônica.
        try:
            for fname in _PROCESSING_ORDER:
                lines = files.get(fname)
                if not lines:
                    if fname != "lfces004.txt":
                        # arquivos opcionais — registra skip com 0 linhas.
                        file_results.append(_FileResult(
                            filename=fname,
                            rows_skipped=0,
                            warnings=[f"Arquivo ausente no ZIP."],
                        ))
                    continue

                result = await self._process_file(fname, lines, competencia)
                file_results.append(result)

            # Card sintético com o resumo do espelhamento em app.facilities.
            if self._facility_sync is not None:
                sync = self._facility_sync
                facsync = _FileResult(filename="facilities_sync")
                facsync.rows_inserted = sync["created"]
                facsync.rows_updated = sync["updated"]
                facsync.rows_total = sync["created"] + sync["updated"]
                file_results.append(facsync)
        except Exception as exc:  # noqa: BLE001
            import_row.status = CnesImportStatus.FAILED
            import_row.error_message = str(exc)[:2000]
            import_row.finished_at = datetime.now(UTC)
            await self._persist_file_results(import_row, file_results)
            await self.db.flush()
            raise

        # 6. Finaliza.
        any_warnings = any(r.warnings or r.error_message for r in file_results)
        import_row.status = CnesImportStatus.PARTIAL if any_warnings else CnesImportStatus.SUCCESS
        import_row.total_rows_processed = sum(r.rows_total for r in file_results)
        import_row.finished_at = datetime.now(UTC)
        await self._persist_file_results(import_row, file_results)
        await self.db.flush()

        log.info(
            "cnes_import_done",
            import_id=str(import_row.id),
            competencia=competencia,
            status=import_row.status.value,
            rows=import_row.total_rows_processed,
        )
        if missing:
            log.info("cnes_import_missing_files", missing=sorted(missing))
        return import_row

    # ─────────────────────────────────────────────────────────────────────
    # Persistência do histórico

    async def _persist_file_results(
        self, import_row: CnesImport, results: list[_FileResult]
    ) -> None:
        for r in results:
            self.db.add(CnesImportFile(
                import_id=import_row.id,
                filename=r.filename,
                rows_total=r.rows_total,
                rows_inserted=r.rows_inserted,
                rows_updated=r.rows_updated,
                rows_skipped=r.rows_skipped,
                warnings=list(r.warnings),
                error_message=r.error_message[:2000],
            ))

    # ─────────────────────────────────────────────────────────────────────
    # Dispatcher

    async def _process_file(
        self, fname: str, lines: list[str], competencia: str
    ) -> _FileResult:
        result = _FileResult(filename=fname)
        # Pula header (linha 0). Dados começam na linha 1.
        data_lines = lines[1:]
        result.rows_total = len(data_lines)

        handler = {
            "lfces004.txt": self._handle_004,
            "lfces018.txt": self._handle_018,
            "lfces021.txt": self._handle_021,
            "lfces002.txt": self._handle_002,
            "lfces032.txt": self._handle_032,
            "lfces037.txt": self._handle_037,
            "lfces038.txt": self._handle_038,
            "lfces045.txt": self._handle_045,
        }[fname]

        await handler(data_lines, competencia, result)
        return result

    # ─────────────────────────────────────────────────────────────────────
    # lfces004 — unidades

    async def _handle_004(
        self, lines: list[str], competencia: str, result: _FileResult
    ) -> None:
        # Coleta existentes para distinguir insert vs update.
        existing_cnes = {
            row[0]
            for row in (await self.db.execute(select(CnesUnit.cnes))).all()
        }

        # Dedupe por CNES: o mesmo CNES pode aparecer em mais de uma linha
        # (mantenedoras diferentes, retificações). Mantemos a última ocorrência
        # — caso contrário o ON CONFLICT DO UPDATE estoura `CardinalityViolation`.
        by_cnes: dict[str, dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=2):  # +2 porque pulou header e é 1-based
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = lfces004.parse(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            if not row.cnes:
                result.warn(f"Linha {i}: CNES vazio — ignorada.")
                result.rows_skipped += 1
                continue
            if row.cnes in by_cnes:
                result.warn(
                    f"Linha {i}: CNES {row.cnes} duplicado no arquivo — "
                    "mantendo a última ocorrência."
                )
            by_cnes[row.cnes] = {
                "id_unidade": row.id_unidade,
                "cnes": row.cnes,
                "cnpj_mantenedora": row.cnpj_mantenedora,
                "razao_social": row.razao_social,
                "nome_fantasia": row.nome_fantasia,
                "cpf": row.cpf,
                "cnpj": row.cnpj,
                "tipo_unidade": row.tipo_unidade,
                "estado": row.estado,
                "codigo_ibge": self.expected_ibge,  # grava sempre com 7 dígitos
                "competencia_ultima_importacao": competencia,
                "active": True,
            }

        rows_to_upsert = list(by_cnes.values())
        for r in rows_to_upsert:
            if r["cnes"] in existing_cnes:
                result.rows_updated += 1
            else:
                result.rows_inserted += 1

        if rows_to_upsert:
            await self._bulk_upsert_units(rows_to_upsert)
            await self._sync_facilities_from_units(rows_to_upsert, result)

    async def _sync_facilities_from_units(
        self, units: list[dict[str, Any]], result: _FileResult
    ) -> None:
        """Espelha as unidades importadas em `app.facilities`.

        Match por ``(municipality_id, cnes)``. Cadastro manual prévio com o
        mesmo CNES tem nome/tipo atualizados a partir do dado oficial; nada
        é arquivado ou removido — apenas upsert.
        """
        mun = await self.db.scalar(
            select(Municipality).where(Municipality.ibge == self.expected_ibge)
        )
        if mun is None:
            result.warn(
                f"Município IBGE {self.expected_ibge} não encontrado — "
                "unidades não foram cadastradas em `facilities`."
            )
            return

        cnes_set = {u["cnes"] for u in units if u["cnes"]}
        if not cnes_set:
            return

        existing = (await self.db.execute(
            select(Facility).where(
                Facility.municipality_id == mun.id,
                Facility.cnes.in_(cnes_set),
            )
        )).scalars().all()
        by_cnes = {f.cnes: f for f in existing}

        created = 0
        updated = 0
        for u in units:
            cnes = u["cnes"]
            if not cnes:
                continue
            name = (u["nome_fantasia"] or u["razao_social"] or "").strip()[:200]
            if not name:
                name = f"Unidade CNES {cnes}"
            short_name = name[:80]
            ftype = map_tipo_unidade(u["tipo_unidade"])

            fac = by_cnes.get(cnes)
            if fac is None:
                self.db.add(Facility(
                    municipality_id=mun.id,
                    name=name,
                    short_name=short_name,
                    type=ftype,
                    cnes=cnes,
                ))
                created += 1
            else:
                changed = False
                if fac.name != name:
                    fac.name = name
                    changed = True
                if fac.short_name != short_name:
                    fac.short_name = short_name
                    changed = True
                if fac.type != ftype:
                    fac.type = ftype
                    changed = True
                if changed:
                    updated += 1

        await self.db.flush()
        self._facility_sync = {"created": created, "updated": updated}

    async def _bulk_upsert_units(self, rows: list[dict[str, Any]]) -> None:
        adapter = get_adapter(self.db.bind.dialect.name)
        await adapter.execute_upsert(
            self.db, CnesUnit, rows,
            index_elements=["cnes"],
            update_columns=[
                "id_unidade", "cnpj_mantenedora", "razao_social", "nome_fantasia",
                "cpf", "cnpj", "tipo_unidade", "estado", "codigo_ibge",
                "competencia_ultima_importacao",
            ],
            extra_set={"active": True},
        )

    # ─────────────────────────────────────────────────────────────────────
    # lfces018 — profissionais

    async def _handle_018(
        self, lines: list[str], competencia: str, result: _FileResult
    ) -> None:
        # Carrega nomes existentes por CNS para checagem de similaridade.
        existing = {
            row[0]: (row[1], row[2])  # cns -> (nome, id_profissional)
            for row in (await self.db.execute(
                select(CnesProfessional.cns, CnesProfessional.nome, CnesProfessional.id_profissional)
            )).all()
            if row[0]
        }
        existing_ids = {
            row[0]
            for row in (await self.db.execute(select(CnesProfessional.id_profissional))).all()
        }

        # Dedupe por id_profissional na mesma passada (arquivos CNES às vezes
        # trazem o mesmo profissional em múltiplas linhas). Sem dedupe o
        # ON CONFLICT DO UPDATE dá CardinalityViolation.
        by_id: dict[str, dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=2):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = lfces018.parse(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            if not row.id_profissional:
                result.rows_skipped += 1
                continue

            # Proteção: se mesmo CNS mas nome muito diferente, emite warning
            # (não aborta — apenas registra; decisão do produto é continuar).
            if row.cns and row.cns in existing:
                prev_name, _prev_id = existing[row.cns]
                similarity = SequenceMatcher(None, prev_name.upper(), row.nome.upper()).ratio()
                if similarity < _NAME_SIMILARITY_WARN_THRESHOLD:
                    result.warn(
                        f"Linha {i}: CNS {row.cns} — nome divergente "
                        f"({int(similarity * 100)}%): {prev_name!r} → {row.nome!r}"
                    )

            by_id[row.id_profissional] = {
                "id_profissional": row.id_profissional,
                "cpf": row.cpf,
                "cns": row.cns,
                "nome": row.nome,
                "status": "Ativo",
                "competencia_ultima_importacao": competencia,
            }

        rows_to_upsert = list(by_id.values())
        for r in rows_to_upsert:
            if r["id_profissional"] in existing_ids:
                result.rows_updated += 1
            else:
                result.rows_inserted += 1

        if rows_to_upsert:
            adapter = get_adapter(self.db.bind.dialect.name)
            await adapter.execute_upsert(
                self.db, CnesProfessional, rows_to_upsert,
                index_elements=["id_profissional"],
                update_columns=["cpf", "cns", "nome", "competencia_ultima_importacao"],
                extra_set={"status": "Ativo"},
            )

    # ─────────────────────────────────────────────────────────────────────
    # lfces021 — vínculo profissional × unidade

    async def _handle_021(
        self, lines: list[str], competencia: str, result: _FileResult
    ) -> None:
        # 1. Coleta unidades presentes nesse arquivo.
        parsed: list[tuple[int, lfces021.Lfces021Row]] = []
        for i, raw in enumerate(lines, start=2):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                parsed.append((i, lfces021.parse(raw)))
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1

        unidades = {p[1].id_unidade for p in parsed if p[1].id_unidade}

        # 2. Bloqueia todos os vínculos existentes dessas unidades
        #    (são revertidos para Ativo conforme aparecerem no arquivo).
        if unidades:
            await self.db.execute(
                CnesProfessionalUnit.__table__.update()
                .where(CnesProfessionalUnit.id_unidade.in_(unidades))
                .values(status="Bloqueado")
            )

        # 3. Dedupe por (prof, unit, cbo) — mesma combinação pode vir mais de
        #    uma vez no arquivo com status diferentes; mantemos a última.
        dedup: dict[tuple[str, str, str], lfces021.Lfces021Row] = {}
        for _i, row in parsed:
            if not (row.id_profissional and row.id_unidade and row.id_cbo):
                result.rows_skipped += 1
                continue
            dedup[(row.id_profissional, row.id_unidade, row.id_cbo)] = row

        if not dedup:
            return

        # 4. Existentes → distingue insert × update.
        keys = list(dedup.keys())
        existing_q = await self.db.execute(
            select(
                CnesProfessionalUnit.id_profissional,
                CnesProfessionalUnit.id_unidade,
                CnesProfessionalUnit.id_cbo,
            )
        )
        existing_keys = {tuple(row) for row in existing_q.all()}

        rows_to_upsert: list[dict[str, Any]] = []
        for (prof, unit, cbo), row in dedup.items():
            status = "Ativo" if lfces021.is_active(row.status_code) else "Bloqueado"
            rows_to_upsert.append({
                "id_profissional": prof,
                "id_unidade": unit,
                "id_cbo": cbo,
                "carga_horaria_ambulatorial": row.carga_horaria_ambulatorial,
                "carga_horaria_hospitalar": row.carga_horaria_hospitalar,
                "id_conselho": row.id_conselho,
                "num_conselho": row.num_conselho,
                "status": status,
                "competencia_ultima_importacao": competencia,
            })
            if (prof, unit, cbo) in existing_keys:
                result.rows_updated += 1
            else:
                result.rows_inserted += 1

        adapter = get_adapter(self.db.bind.dialect.name)
        await adapter.execute_upsert(
            self.db, CnesProfessionalUnit, rows_to_upsert,
            index_elements=["id_profissional", "id_unidade", "id_cbo"],
            update_columns=[
                "carga_horaria_ambulatorial", "carga_horaria_hospitalar",
                "id_conselho", "num_conselho", "status",
                "competencia_ultima_importacao",
            ],
        )

    # ─────────────────────────────────────────────────────────────────────
    # Handlers que fazem DELETE-por-unidade + INSERT

    async def _handle_002(self, lines, competencia, result):
        await self._replace_by_unidade(
            lines, competencia, result,
            parse_fn=lfces002.parse,
            unidade_attr="id_unidade",
            model=CnesUnitBed,
            row_to_dict=lambda r, comp: {
                "id_unidade": r.id_unidade,
                "id_leito": r.id_leito,
                "id_tipo_leito": r.id_tipo_leito,
                "quantidade_existente": r.quantidade_existente,
                "quantidade_sus": r.quantidade_sus,
                "competencia_ultima_importacao": comp,
            },
        )

    async def _handle_032(self, lines, competencia, result):
        await self._replace_by_unidade(
            lines, competencia, result,
            parse_fn=lfces032.parse,
            unidade_attr="id_unidade",
            model=CnesUnitService,
            row_to_dict=lambda r, comp: {
                "id_unidade": r.id_unidade,
                "id_servico": r.id_servico,
                "id_classificacao": r.id_classificacao,
                "competencia_ultima_importacao": comp,
            },
        )

    async def _handle_037(self, lines, competencia, result):
        await self._replace_by_unidade(
            lines, competencia, result,
            parse_fn=lfces037.parse,
            unidade_attr="id_unidade",
            model=CnesTeam,
            row_to_dict=lambda r, comp: {
                "codigo_ibge": r.codigo_ibge,
                "codigo_area": r.codigo_area,
                "sequencial_equipe": r.sequencial_equipe,
                "id_unidade": r.id_unidade,
                "tipo_equipe": r.tipo_equipe,
                "nome_equipe": r.nome_equipe,
                "competencia_ultima_importacao": comp,
            },
        )

    async def _handle_038(self, lines, competencia, result):
        await self._replace_by_unidade(
            lines, competencia, result,
            parse_fn=lfces038.parse,
            unidade_attr="id_unidade",
            model=CnesTeamProfessional,
            row_to_dict=lambda r, comp: {
                "codigo_ibge": r.codigo_ibge,
                "codigo_area": r.codigo_area,
                "sequencial_equipe": r.sequencial_equipe,
                "id_profissional": r.id_profissional,
                "id_unidade": r.id_unidade,
                "codigo_cbo": r.codigo_cbo,
                "competencia_ultima_importacao": comp,
            },
        )

    async def _handle_045(self, lines, competencia, result):
        await self._replace_by_unidade(
            lines, competencia, result,
            parse_fn=lfces045.parse,
            unidade_attr="id_unidade",
            model=CnesUnitQualification,
            row_to_dict=lambda r, comp: {
                "id_unidade": r.id_unidade,
                "codigo_habilitacao": r.codigo_habilitacao,
                "competencia_ultima_importacao": comp,
            },
        )

    # ─────────────────────────────────────────────────────────────────────
    # Helper genérico: parsea, deduplica, apaga por unidade, insere.

    async def _replace_by_unidade(
        self,
        lines: list[str],
        competencia: str,
        result: _FileResult,
        *,
        parse_fn,
        unidade_attr: str,
        model,
        row_to_dict,
    ) -> None:
        parsed_rows = []
        for i, raw in enumerate(lines, start=2):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = parse_fn(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            if not getattr(row, unidade_attr):
                result.rows_skipped += 1
                continue
            parsed_rows.append(row)

        if not parsed_rows:
            return

        unidades = {getattr(r, unidade_attr) for r in parsed_rows}

        # Apaga tudo do conjunto de unidades que vai ser reescrito.
        await self.db.execute(
            delete(model).where(getattr(model, unidade_attr).in_(unidades))
        )

        # Insert em lote (dedupe por segurança).
        values = [row_to_dict(r, competencia) for r in parsed_rows]
        # Remove duplicatas de chave unique — INSERT ignora dedupe via on conflict.
        adapter = get_adapter(self.db.bind.dialect.name)
        await adapter.execute_upsert_do_nothing(self.db, model, values)
        result.rows_inserted += len(values)
