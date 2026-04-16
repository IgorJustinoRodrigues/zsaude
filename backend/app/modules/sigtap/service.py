"""Orquestração da importação SIGTAP (catálogo nacional).

Recebe bytes de um ZIP do pacote DATASUS, extrai em memória, valida a
competência única de todos os arquivos e aplica uma transação única no
schema ``app``.

Estratégias por arquivo (seguindo o PHP legado):
- **UPSERT** (mestras): tb_procedimento, tb_ocupacao, tb_cid,
  tb_modalidade, tb_registro, tb_descricao.
- **DELETE total + INSERT** (mestras substituíveis + relações):
  tb_servico, tb_servico_classificacao, tb_forma_organizacao,
  tb_habilitacao, tb_grupo_habilitacao, rl_*.
- **DELETE condicional + INSERT** em rl_procedimento_cid (preserva 3
  pares Z039 legados).

Revogação: antes de processar tb_procedimento, ``UPDATE sigtap_procedures
SET revogado=true``. Procedimentos que aparecem no arquivo voltam para
``revogado=false`` via ON CONFLICT DO UPDATE. Ausentes ficam revogados.

Qualquer erro → rollback total; ``sigtap_imports`` registra ``failed``.
"""

from __future__ import annotations

import io
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

from sqlalchemy import delete, not_, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.modules.sigtap import parsers as P
from app.modules.sigtap.models import (
    SigtapCbo,
    SigtapCid,
    SigtapFormaOrganizacao,
    SigtapGrupoHabilitacao,
    SigtapHabilitacao,
    SigtapImport,
    SigtapImportFile,
    SigtapImportStatus,
    SigtapModalidade,
    SigtapProcedure,
    SigtapProcedureCbo,
    SigtapProcedureCid,
    SigtapProcedureCompatibilidade,
    SigtapProcedureDescription,
    SigtapProcedureDetalhe,
    SigtapProcedureHabilitacao,
    SigtapProcedureLeito,
    SigtapProcedureModalidade,
    SigtapProcedureRegistro,
    SigtapProcedureRegraCond,
    SigtapProcedureServico,
    SigtapRegistro,
    SigtapService,
    SigtapServiceClassification,
)

log = get_logger(__name__)


# Ordem canônica: mestras antes, relações depois.
_PROCESSING_ORDER: list[str] = [
    "tb_procedimento.txt",
    "tb_ocupacao.txt",
    "tb_cid.txt",
    "tb_modalidade.txt",
    "tb_registro.txt",
    "tb_servico.txt",
    "tb_servico_classificacao.txt",
    "tb_descricao.txt",
    "tb_forma_organizacao.txt",
    "tb_habilitacao.txt",
    "tb_grupo_habilitacao.txt",
    "rl_procedimento_cid.txt",
    "rl_procedimento_ocupacao.txt",
    "rl_procedimento_modalidade.txt",
    "rl_procedimento_registro.txt",
    "rl_procedimento_compativel.txt",
    "rl_procedimento_detalhe.txt",
    "rl_procedimento_servico.txt",
    "rl_procedimento_leito.txt",
    "rl_procedimento_regra_cond.txt",
    "rl_procedimento_habilitacao.txt",
]

_MAX_WARNINGS_PER_FILE = 50
# asyncpg limita a 32.767 params por query. Com tabelas de até 16 colunas,
# 1.500 linhas/batch é seguro (1500 * 16 = 24.000 < 32.767).
_BATCH_SIZE = 1500

# Pares CID preservados no DELETE condicional de rl_procedimento_cid (Z039),
# conforme o importador PHP legado.
_PRESERVED_PROC_CID_PAIRS: set[tuple[str, str]] = {
    ("0301060010", "Z039"),
    ("0301060070", "Z039"),
    ("0303170018", "Z039"),
}


@dataclass
class _FileResult:
    filename: str
    rows_total: int = 0
    rows_inserted: int = 0
    rows_updated: int = 0
    rows_skipped: int = 0
    warnings: list[str] = field(default_factory=list)
    error_message: str = ""

    def warn(self, msg: str) -> None:
        if len(self.warnings) < _MAX_WARNINGS_PER_FILE:
            self.warnings.append(msg)


class SigtapImportError(AppError):
    """Exceção visível ao usuário durante importação SIGTAP."""

    code = "sigtap_import_error"
    status = 400


class SigtapImportService:
    """Serviço de importação SIGTAP (global, MASTER only)."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        user_name: str,
    ) -> None:
        self.db = db
        self.user_id = user_id
        self.user_name = user_name
        # Competência deste pacote — capturada na primeira linha com DT_COMPETENCIA
        # e validada em todas as linhas subsequentes.
        self._competencia: str = ""

    # ─────────────────────────────────────────────────────────────────────
    # Entry point

    async def import_zip(self, zip_bytes: bytes, filename: str) -> SigtapImport:
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as exc:
            raise SigtapImportError("O arquivo enviado não é um ZIP válido.") from exc

        # Mapa: nome normalizado → lista de linhas decodificadas.
        files: dict[str, list[str]] = {}
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.rsplit("/", 1)[-1].lower()
            if name in _PROCESSING_ORDER:
                raw = zf.read(info)
                try:
                    text = raw.decode("latin-1")
                except UnicodeDecodeError:
                    text = raw.decode("utf-8", errors="replace")
                files[name] = text.splitlines()

        if "tb_procedimento.txt" not in files:
            raise SigtapImportError(
                "O ZIP não contém `tb_procedimento.txt` — pacote SIGTAP inválido."
            )

        # Extrai a competência da primeira linha válida de tb_procedimento
        # (posições 330..336). Será validada contra todas as demais linhas
        # que tiverem DT_COMPETENCIA via ``_set_competencia``.
        first_line = next(
            (ln for ln in files["tb_procedimento.txt"] if ln.strip()),
            "",
        )
        if not first_line:
            raise SigtapImportError("tb_procedimento.txt vazio.")
        competencia_header = first_line[330:336].strip()
        if not competencia_header.isdigit() or len(competencia_header) != 6:
            raise SigtapImportError(
                f"Competência inválida em tb_procedimento.txt: {competencia_header!r}."
            )
        self._competencia = competencia_header

        # Cria registro com status=RUNNING.
        import_row = SigtapImport(
            competencia=competencia_header,
            uploaded_by_user_id=self.user_id,
            uploaded_by_user_name=self.user_name,
            zip_filename=filename[:200],
            zip_size_bytes=len(zip_bytes),
            status=SigtapImportStatus.RUNNING,
            started_at=datetime.now(UTC),
        )
        self.db.add(import_row)
        await self.db.flush()

        file_results: list[_FileResult] = []

        try:
            # PASSO 1: marca todos os procedimentos como revogados.
            await self.db.execute(
                update(SigtapProcedure).values(revogado=True)
            )

            # PASSO 2: processa cada arquivo em ordem.
            for fname in _PROCESSING_ORDER:
                lines = files.get(fname)
                if lines is None:
                    file_results.append(_FileResult(
                        filename=fname,
                        warnings=[f"Arquivo ausente no ZIP."],
                    ))
                    continue

                result = await self._process_file(fname, lines)
                file_results.append(result)

        except Exception as exc:  # noqa: BLE001
            import_row.status = SigtapImportStatus.FAILED
            import_row.error_message = str(exc)[:2000]
            import_row.finished_at = datetime.now(UTC)
            await self._persist_file_results(import_row, file_results)
            await self.db.flush()
            raise

        any_warnings = any(r.warnings or r.error_message for r in file_results)
        import_row.status = (
            SigtapImportStatus.PARTIAL if any_warnings else SigtapImportStatus.SUCCESS
        )
        import_row.total_rows_processed = sum(r.rows_total for r in file_results)
        import_row.finished_at = datetime.now(UTC)
        await self._persist_file_results(import_row, file_results)
        await self.db.flush()

        log.info(
            "sigtap_import_done",
            import_id=str(import_row.id),
            competencia=competencia_header,
            status=import_row.status.value,
            rows=import_row.total_rows_processed,
        )
        return import_row

    # ─────────────────────────────────────────────────────────────────────
    # Histórico

    async def _persist_file_results(
        self, import_row: SigtapImport, results: list[_FileResult]
    ) -> None:
        for r in results:
            self.db.add(SigtapImportFile(
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
    # Competência: captura na 1ª linha e valida nas demais.

    def _check_competencia(self, row_competencia: str, result: _FileResult, linha: int) -> bool:
        """Retorna True se OK, False (e marca skip) se houver divergência."""
        if not row_competencia:
            return True  # alguns arquivos não têm DT_COMPETENCIA
        if row_competencia != self._competencia:
            raise SigtapImportError(
                f"Competência divergente em {result.filename} linha {linha}: "
                f"{row_competencia!r} ≠ {self._competencia!r}. "
                "Há mais de uma competência para ser sincronizada."
            )
        return True

    # ─────────────────────────────────────────────────────────────────────
    # Dispatcher

    async def _process_file(self, fname: str, lines: list[str]) -> _FileResult:
        result = _FileResult(filename=fname)
        # Diferente do CNES, os arquivos SIGTAP não têm linha de cabeçalho —
        # começam direto no dado.
        result.rows_total = sum(1 for ln in lines if ln.strip())

        handler: Callable[[list[str], _FileResult], Any] = {
            "tb_procedimento.txt": self._handle_procedimento,
            "tb_ocupacao.txt": self._handle_ocupacao,
            "tb_cid.txt": self._handle_cid,
            "tb_modalidade.txt": self._handle_modalidade,
            "tb_registro.txt": self._handle_registro,
            "tb_servico.txt": self._handle_servico,
            "tb_servico_classificacao.txt": self._handle_servico_classificacao,
            "tb_descricao.txt": self._handle_descricao,
            "tb_forma_organizacao.txt": self._handle_forma_organizacao,
            "tb_habilitacao.txt": self._handle_habilitacao,
            "tb_grupo_habilitacao.txt": self._handle_grupo_habilitacao,
            "rl_procedimento_cid.txt": self._handle_procedimento_cid,
            "rl_procedimento_ocupacao.txt": self._handle_procedimento_ocupacao,
            "rl_procedimento_modalidade.txt": self._handle_procedimento_modalidade,
            "rl_procedimento_registro.txt": self._handle_procedimento_registro,
            "rl_procedimento_compativel.txt": self._handle_procedimento_compativel,
            "rl_procedimento_detalhe.txt": self._handle_procedimento_detalhe,
            "rl_procedimento_servico.txt": self._handle_procedimento_servico,
            "rl_procedimento_leito.txt": self._handle_procedimento_leito,
            "rl_procedimento_regra_cond.txt": self._handle_procedimento_regra_cond,
            "rl_procedimento_habilitacao.txt": self._handle_procedimento_habilitacao,
        }[fname]

        await handler(lines, result)
        return result

    # ─────────────────────────────────────────────────────────────────────
    # Helper genérico: parseia com dedupe, aplica upsert.

    async def _execute_batched(
        self, model: Any, values: list[dict[str, Any]], *, conflict_cols: list[str],
        update_cols: list[str] | None = None, do_nothing: bool = False,
    ) -> None:
        """Executa INSERT em lotes de _BATCH_SIZE para não ultrapassar o limite de 32.767 params do asyncpg."""
        for i in range(0, len(values), _BATCH_SIZE):
            batch = values[i : i + _BATCH_SIZE]
            stmt = pg_insert(model).values(batch)
            if do_nothing:
                stmt = stmt.on_conflict_do_nothing()
            elif update_cols:
                stmt = stmt.on_conflict_do_update(
                    index_elements=conflict_cols,
                    set_={c: getattr(stmt.excluded, c) for c in update_cols},
                )
            await self.db.execute(stmt)

    async def _upsert_bulk(
        self,
        lines: list[str],
        result: _FileResult,
        *,
        parse_fn: Callable[[str], Any],
        model: Any,
        key_fn: Callable[[Any], Any],
        row_to_dict: Callable[[Any], dict[str, Any]],
        conflict_cols: list[str],
        update_cols: list[str],
        has_competencia: bool = True,
    ) -> None:
        existing_keys = {
            tuple(row) if len(conflict_cols) > 1 else row[0]
            for row in (
                await self.db.execute(
                    select(*(getattr(model, c) for c in conflict_cols))
                )
            ).all()
        }

        dedup: dict[Any, dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=1):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = parse_fn(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            if has_competencia:
                self._check_competencia(getattr(row, "competencia", ""), result, i)
            key = key_fn(row)
            if not key or (isinstance(key, tuple) and not all(key)) or (isinstance(key, str) and not key.strip()):
                result.rows_skipped += 1
                continue
            dedup[key] = row_to_dict(row)

        if not dedup:
            return

        values = list(dedup.values())
        for k in dedup:
            if k in existing_keys:
                result.rows_updated += 1
            else:
                result.rows_inserted += 1

        await self._execute_batched(
            model, values, conflict_cols=conflict_cols, update_cols=update_cols,
        )

    async def _replace_all(
        self,
        lines: list[str],
        result: _FileResult,
        *,
        parse_fn: Callable[[str], Any],
        model: Any,
        unique_key_fn: Callable[[Any], tuple],
        row_to_dict: Callable[[Any], dict[str, Any]],
        has_competencia: bool = True,
        skip_if: Callable[[Any], bool] | None = None,
    ) -> None:
        dedup: dict[tuple, dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=1):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = parse_fn(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            if has_competencia:
                self._check_competencia(getattr(row, "competencia", ""), result, i)
            if skip_if and skip_if(row):
                result.rows_skipped += 1
                continue
            key = unique_key_fn(row)
            if not all(k for k in key):
                result.rows_skipped += 1
                continue
            dedup[key] = row_to_dict(row)

        # DELETE total da tabela (replace completo).
        await self.db.execute(delete(model))

        if not dedup:
            return

        values = list(dedup.values())
        await self._execute_batched(model, values, conflict_cols=[], do_nothing=True)
        result.rows_inserted += len(values)

    # ─────────────────────────────────────────────────────────────────────
    # Handlers — mestras

    async def _handle_procedimento(self, lines: list[str], result: _FileResult) -> None:
        # Upsert especial: reativa o procedimento (revogado=False).
        existing = {
            row[0]
            for row in (await self.db.execute(select(SigtapProcedure.codigo))).all()
        }
        dedup: dict[str, dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=1):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = P.parse_procedimento(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            self._check_competencia(row.competencia, result, i)
            if not row.codigo:
                result.rows_skipped += 1
                continue
            dedup[row.codigo] = {
                "codigo": row.codigo,
                "nome": row.nome,
                "complexidade": row.complexidade,
                "sexo": row.sexo,
                "qt_maxima": row.qt_maxima,
                "qt_dias": row.qt_dias,
                "qt_pontos": row.qt_pontos,
                "idade_minima": row.idade_minima,
                "idade_maxima": row.idade_maxima,
                "valor_sh": row.valor_sh,
                "valor_sa": row.valor_sa,
                "valor_sp": row.valor_sp,
                "id_financiamento": row.id_financiamento,
                "competencia": row.competencia,
                "revogado": False,
            }

        if not dedup:
            return

        for codigo in dedup:
            if codigo in existing:
                result.rows_updated += 1
            else:
                result.rows_inserted += 1

        await self._execute_batched(
            SigtapProcedure,
            list(dedup.values()),
            conflict_cols=["codigo"],
            update_cols=[
                "nome", "complexidade", "sexo", "qt_maxima", "qt_dias",
                "qt_pontos", "idade_minima", "idade_maxima", "valor_sh",
                "valor_sa", "valor_sp", "id_financiamento", "competencia",
                "revogado",
            ],
        )

    async def _handle_ocupacao(self, lines: list[str], result: _FileResult) -> None:
        await self._upsert_bulk(
            lines, result,
            parse_fn=P.parse_ocupacao,
            model=SigtapCbo,
            key_fn=lambda r: r.codigo,
            row_to_dict=lambda r: {"codigo": r.codigo, "descricao": r.descricao},
            conflict_cols=["codigo"],
            update_cols=["descricao"],
            has_competencia=False,
        )

    async def _handle_cid(self, lines: list[str], result: _FileResult) -> None:
        await self._upsert_bulk(
            lines, result,
            parse_fn=P.parse_cid,
            model=SigtapCid,
            key_fn=lambda r: r.codigo,
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "descricao": r.descricao,
                "agravo": r.agravo,
                "sexo": r.sexo,
            },
            conflict_cols=["codigo"],
            update_cols=["descricao", "agravo", "sexo"],
            has_competencia=False,
        )

    async def _handle_modalidade(self, lines: list[str], result: _FileResult) -> None:
        await self._upsert_bulk(
            lines, result,
            parse_fn=P.parse_modalidade,
            model=SigtapModalidade,
            key_fn=lambda r: r.codigo,
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
            conflict_cols=["codigo"],
            update_cols=["descricao", "competencia"],
        )

    async def _handle_registro(self, lines: list[str], result: _FileResult) -> None:
        await self._upsert_bulk(
            lines, result,
            parse_fn=P.parse_registro,
            model=SigtapRegistro,
            key_fn=lambda r: r.codigo,
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
            conflict_cols=["codigo"],
            update_cols=["descricao", "competencia"],
        )

    async def _handle_servico(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_servico,
            model=SigtapService,
            unique_key_fn=lambda r: (r.codigo,),
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
        )

    async def _handle_servico_classificacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_servico_classificacao,
            model=SigtapServiceClassification,
            unique_key_fn=lambda r: (r.codigo_servico, r.codigo_classificacao),
            row_to_dict=lambda r: {
                "codigo_servico": r.codigo_servico,
                "codigo_classificacao": r.codigo_classificacao,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
        )

    async def _handle_descricao(self, lines: list[str], result: _FileResult) -> None:
        await self._upsert_bulk(
            lines, result,
            parse_fn=P.parse_descricao,
            model=SigtapProcedureDescription,
            key_fn=lambda r: r.codigo_procedimento,
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
            conflict_cols=["codigo_procedimento"],
            update_cols=["descricao", "competencia"],
        )

    async def _handle_forma_organizacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_forma_organizacao,
            model=SigtapFormaOrganizacao,
            unique_key_fn=lambda r: (r.codigo_grupo, r.codigo_subgrupo, r.codigo_forma),
            row_to_dict=lambda r: {
                "codigo_grupo": r.codigo_grupo,
                "codigo_subgrupo": r.codigo_subgrupo,
                "codigo_forma": r.codigo_forma,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
        )

    async def _handle_habilitacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_habilitacao,
            model=SigtapHabilitacao,
            unique_key_fn=lambda r: (r.codigo,),
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "descricao": r.descricao,
                "competencia": r.competencia,
            },
        )

    async def _handle_grupo_habilitacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_grupo_habilitacao,
            model=SigtapGrupoHabilitacao,
            unique_key_fn=lambda r: (r.codigo,),
            row_to_dict=lambda r: {
                "codigo": r.codigo,
                "nome_grupo": r.nome_grupo,
                "descricao": r.descricao,
            },
            has_competencia=False,
        )

    # ─────────────────────────────────────────────────────────────────────
    # Handlers — relações

    async def _handle_procedimento_cid(self, lines: list[str], result: _FileResult) -> None:
        # DELETE condicional: preserva os pares especiais Z039.
        preserved_filter = or_(*[
            (SigtapProcedureCid.codigo_procedimento == p)
            & (SigtapProcedureCid.codigo_cid == c)
            for p, c in _PRESERVED_PROC_CID_PAIRS
        ])
        await self.db.execute(delete(SigtapProcedureCid).where(not_(preserved_filter)))

        dedup: dict[tuple[str, str], dict[str, Any]] = {}
        for i, raw in enumerate(lines, start=1):
            if not raw.strip():
                result.rows_skipped += 1
                continue
            try:
                row = P.parse_procedimento_cid(raw)
            except Exception as exc:  # noqa: BLE001
                result.warn(f"Linha {i}: erro ao parsear — {exc}")
                result.rows_skipped += 1
                continue
            self._check_competencia(row.competencia, result, i)
            if not (row.codigo_procedimento and row.codigo_cid):
                result.rows_skipped += 1
                continue
            dedup[(row.codigo_procedimento, row.codigo_cid)] = {
                "codigo_procedimento": row.codigo_procedimento,
                "codigo_cid": row.codigo_cid,
                "principal": row.principal,
                "competencia": row.competencia,
            }

        if not dedup:
            return

        values = list(dedup.values())
        await self._execute_batched(SigtapProcedureCid, values, conflict_cols=[], do_nothing=True)
        result.rows_inserted += len(values)

    async def _handle_procedimento_ocupacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_ocupacao,
            model=SigtapProcedureCbo,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_cbo),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_cbo": r.codigo_cbo,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_modalidade(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_modalidade,
            model=SigtapProcedureModalidade,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_modalidade),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_modalidade": r.codigo_modalidade,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_registro(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_registro,
            model=SigtapProcedureRegistro,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_registro),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_registro": r.codigo_registro,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_compativel(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_compatibilidade,
            model=SigtapProcedureCompatibilidade,
            unique_key_fn=lambda r: (
                r.codigo_procedimento,
                r.registro_principal,
                r.codigo_procedimento_secundario,
                r.registro_secundario,
            ),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "registro_principal": r.registro_principal,
                "codigo_procedimento_secundario": r.codigo_procedimento_secundario,
                "registro_secundario": r.registro_secundario,
                "tipo_compatibilidade": r.tipo_compatibilidade,
                "quantidade_permitida": r.quantidade_permitida,
                "competencia": r.competencia,
            },
            skip_if=lambda r: not (r.codigo_procedimento and r.codigo_procedimento_secundario),
        )

    async def _handle_procedimento_detalhe(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_detalhe,
            model=SigtapProcedureDetalhe,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_lista_validacao),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_lista_validacao": r.codigo_lista_validacao,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_servico(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_servico,
            model=SigtapProcedureServico,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_servico, r.codigo_classificacao),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_servico": r.codigo_servico,
                "codigo_classificacao": r.codigo_classificacao,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_leito(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_leito,
            model=SigtapProcedureLeito,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.codigo_tipo_leito),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_tipo_leito": r.codigo_tipo_leito,
                "competencia": r.competencia,
            },
        )

    async def _handle_procedimento_regra_cond(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_regra_cond,
            model=SigtapProcedureRegraCond,
            unique_key_fn=lambda r: (r.codigo_procedimento, r.regra_condicionada),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "regra_condicionada": r.regra_condicionada,
            },
            has_competencia=False,
        )

    async def _handle_procedimento_habilitacao(self, lines: list[str], result: _FileResult) -> None:
        await self._replace_all(
            lines, result,
            parse_fn=P.parse_procedimento_habilitacao,
            model=SigtapProcedureHabilitacao,
            unique_key_fn=lambda r: (
                r.codigo_procedimento, r.codigo_habilitacao, r.codigo_grupo_habilitacao,
            ),
            row_to_dict=lambda r: {
                "codigo_procedimento": r.codigo_procedimento,
                "codigo_habilitacao": r.codigo_habilitacao,
                "codigo_grupo_habilitacao": r.codigo_grupo_habilitacao,
                "competencia": r.competencia,
            },
        )
