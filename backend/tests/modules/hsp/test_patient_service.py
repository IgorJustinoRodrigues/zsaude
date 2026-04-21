"""Testes do PatientService — validação, diff, histórico e foto."""

from __future__ import annotations

import hashlib

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.modules.hsp.schemas import PatientCreate, PatientUpdate
from app.modules.hsp.service import PatientService, _serialize, _validate_cpf
from app.tenant_models.patients import (
    PatientFieldChangeType,
    PatientFieldHistory,
    PatientPhoto,
)

from .conftest import make_work_context


# ─── CPF — função pura ─────────────────────────────────────────────────────

class TestValidateCpf:
    def test_valid_cpf_with_punctuation(self) -> None:
        assert _validate_cpf("390.533.447-05") == "39053344705"

    def test_valid_cpf_without_punctuation(self) -> None:
        assert _validate_cpf("39053344705") == "39053344705"

    def test_empty_cpf_raises(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _validate_cpf("")
        assert exc.value.status_code == 400

    def test_repeated_digits_rejected(self) -> None:
        with pytest.raises(HTTPException):
            _validate_cpf("11111111111")

    def test_wrong_check_digit(self) -> None:
        with pytest.raises(HTTPException):
            _validate_cpf("39053344700")

    def test_short_cpf(self) -> None:
        with pytest.raises(HTTPException):
            _validate_cpf("123")


# ─── Serialização pro histórico ────────────────────────────────────────────

class TestSerialize:
    def test_none(self) -> None:
        assert _serialize(None) is None

    def test_bool(self) -> None:
        assert _serialize(True) == "true"
        assert _serialize(False) == "false"

    def test_date(self) -> None:
        from datetime import date
        assert _serialize(date(2020, 5, 1)) == "2020-05-01"

    def test_list(self) -> None:
        assert _serialize(["a", "b", "c"]) == "a,b,c"


# ─── Testes com DB (tenant_session) ────────────────────────────────────────
# pytest-asyncio auto mode já marca funções async — sem marker global.


async def _make_service(session):
    return PatientService(session, make_work_context(), user_name="Tester")


async def test_create_patient_assigns_prontuario_and_logs_history(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    payload = PatientCreate(name="Maria Silva", cpf="39053344705")
    p = await svc.create_patient(payload)
    await tenant_session.commit()

    assert p.prontuario == "000001"
    assert p.cpf == "39053344705"

    logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(PatientFieldHistory.patient_id == p.id)
    )).all()
    assert len(logs) == 1
    assert logs[0].change_type == PatientFieldChangeType.CREATE


async def test_create_duplicate_cpf_raises_409(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    await svc.create_patient(PatientCreate(name="Primeiro", cpf="39053344705"))
    await tenant_session.commit()

    with pytest.raises(HTTPException) as exc:
        await svc.create_patient(PatientCreate(name="Segundo", cpf="39053344705"))
    assert exc.value.status_code == 409


async def test_update_records_diff_per_field(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="João", cpf="39053344705"))
    await tenant_session.commit()

    # Altera dois campos + mantém um igual — só dois logs esperados.
    await svc.update_patient(p.id, PatientUpdate(
        name="João da Silva",
        phone="62999990000",
        email="",
        reason="correção de nome",
    ))
    await tenant_session.commit()

    update_logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(
            PatientFieldHistory.patient_id == p.id,
            PatientFieldHistory.change_type == PatientFieldChangeType.UPDATE,
        )
    )).all()

    assert len(update_logs) == 2
    fields = {log.field_name for log in update_logs}
    assert fields == {"name", "phone"}

    name_log = next(log for log in update_logs if log.field_name == "name")
    assert name_log.old_value == "João"
    assert name_log.new_value == "João da Silva"
    assert name_log.reason == "correção de nome"


async def test_update_noop_when_nothing_changed(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="João", cpf="39053344705"))
    await tenant_session.commit()

    await svc.update_patient(p.id, PatientUpdate(name="João"))
    await tenant_session.commit()

    update_logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(
            PatientFieldHistory.patient_id == p.id,
            PatientFieldHistory.change_type == PatientFieldChangeType.UPDATE,
        )
    )).all()
    assert len(update_logs) == 0


async def test_soft_delete_flips_active_and_logs(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="Ana", cpf="39053344705"))
    await tenant_session.commit()

    await svc.deactivate_patient(p.id, "óbito")
    await tenant_session.commit()

    assert p.active is False
    delete_logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(
            PatientFieldHistory.patient_id == p.id,
            PatientFieldHistory.change_type == PatientFieldChangeType.DELETE,
        )
    )).all()
    assert len(delete_logs) == 1
    assert delete_logs[0].reason == "óbito"


async def test_upload_photo_sets_current_and_checksum(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="Foto", cpf="39053344705"))
    await tenant_session.commit()

    content = b"\xff\xd8\xff\xe0fake-jpeg-bytes"
    photo = await svc.set_photo(p.id, content=content, mime_type="image/jpeg")
    await tenant_session.commit()

    assert photo.checksum_sha256 == hashlib.sha256(content).hexdigest()
    assert photo.file_size == len(content)

    # current_photo_id foi apontado
    assert p.current_photo_id == photo.id

    # Histórico gravou PHOTO_UPLOAD
    logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(
            PatientFieldHistory.patient_id == p.id,
            PatientFieldHistory.change_type == PatientFieldChangeType.PHOTO_UPLOAD,
        )
    )).all()
    assert len(logs) == 1
    assert logs[0].new_value == str(photo.id)


async def test_remove_photo_clears_current_and_logs(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="Fulano", cpf="39053344705"))
    await svc.set_photo(p.id, content=b"abc", mime_type="image/png")
    await tenant_session.commit()

    assert p.current_photo_id is not None
    photo_id_before = p.current_photo_id

    await svc.remove_photo(p.id)
    await tenant_session.commit()

    assert p.current_photo_id is None
    # foto antiga continua no banco (para histórico)
    remaining = (await tenant_session.scalars(
        select(PatientPhoto).where(PatientPhoto.id == photo_id_before)
    )).all()
    assert len(remaining) == 1

    remove_logs = (await tenant_session.scalars(
        select(PatientFieldHistory).where(
            PatientFieldHistory.patient_id == p.id,
            PatientFieldHistory.change_type == PatientFieldChangeType.PHOTO_REMOVE,
        )
    )).all()
    assert len(remove_logs) == 1


async def test_list_history_filters_by_field(tenant_session) -> None:
    svc = await _make_service(tenant_session)
    p = await svc.create_patient(PatientCreate(name="Xavier", cpf="39053344705"))
    await svc.update_patient(p.id, PatientUpdate(name="Yago", phone="111"))
    await svc.update_patient(p.id, PatientUpdate(name="Zeca"))
    await tenant_session.commit()

    rows, total = await svc.list_history(p.id, field="name", page=1, page_size=50)
    assert total == 2
    assert all(r.field_name == "name" for r in rows)
    # Ordenado por changed_at desc: a mudança mais recente (Yago→Zeca) vem primeiro.
    assert rows[0].old_value == "Yago"
    assert rows[0].new_value == "Zeca"
