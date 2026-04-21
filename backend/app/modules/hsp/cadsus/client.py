"""Cliente PDQ Supplier (SOAP 1.2 + HL7 v3).

Monta o envelope SOAP com UsernameToken, envia via HTTP POST e parse
da resposta XML HL7 PRPA_IN201306UV02 → dados normalizados.
"""

from __future__ import annotations

import logging
import re
from xml.etree import ElementTree as ET

import httpx

from app.core.config import settings
from app.modules.hsp.cadsus.schemas import CadsusAddress, CadsusPatientResult

log = logging.getLogger(__name__)

# Namespaces oficiais HL7 v3.
NS = {
    "s":   "http://www.w3.org/2003/05/soap-envelope",
    "hl7": "urn:hl7-org:v3",
}

# OIDs DATASUS.
OID_CNS = "2.16.840.1.113883.13.236"
OID_CPF = "2.16.840.1.113883.13.237"
OID_RG  = "2.16.840.1.113883.13.243"

# Template do envelope SOAP — ver docs/backend/cadsus.md pra explicação.
_ENVELOPE = """<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>{user}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">{password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <PRPA_IN201305UV02 ITSVersion="XML_1.0" xmlns="urn:hl7-org:v3">
      <id root="2.16.840.1.113883.4.714" extension="zsaude"/>
      <creationTime value="20260101000000"/>
      <interactionId root="2.16.840.1.113883.1.6" extension="PRPA_IN201305UV02"/>
      <processingCode code="T"/>
      <processingModeCode code="T"/>
      <acceptAckCode code="AL"/>
      <receiver typeCode="RCV">
        <device classCode="DEV" determinerCode="INSTANCE">
          <id root="2.16.840.1.113883.3.72.6.5.100.85"/>
        </device>
      </receiver>
      <sender typeCode="SND">
        <device classCode="DEV" determinerCode="INSTANCE">
          <id root="2.16.840.1.113883.3.72.6.2"/>
          <name>CADSUS</name>
        </device>
      </sender>
      <controlActProcess classCode="CACT" moodCode="EVN">
        <code code="PRPA_TE201305UV02" codeSystem="2.16.840.1.113883.1.6"/>
        <queryByParameter>
          <queryId root="1.2.840.114350.1.13.28.1.18.5.999" extension="zsaude"/>
          <statusCode code="new"/>
          <responseModalityCode code="R"/>
          <responsePriorityCode code="I"/>
          <parameterList>
{query_args}
          </parameterList>
        </queryByParameter>
      </controlActProcess>
    </PRPA_IN201305UV02>
  </soap:Body>
</soap:Envelope>"""


def _escape(v: str) -> str:
    """Escapa caracteres XML básicos pra injetar em atributos/nós."""
    return (v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


def _only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _build_query_args(
    *,
    cpf: str | None,
    cns: str | None,
    nome: str | None,
    data_nascimento: str | None,
    nome_mae: str | None,
    sexo: str | None,
) -> str:
    """Monta os fragmentos XML dentro de <parameterList>.

    Regra de exclusividade (ver §4.7 do manual DATASUS): quando CNS ou
    CPF é informado, os demais critérios são descartados.
    """
    parts: list[str] = []

    cns_c = _only_digits(cns or "")
    cpf_c = _only_digits(cpf or "")

    if len(cns_c) == 15:
        parts.append(
            f'<livingSubjectId>'
            f'<value root="{OID_CNS}" extension="{cns_c}"/>'
            f'<semanticsText>LivingSubject.id</semanticsText>'
            f'</livingSubjectId>'
        )
        return "\n".join(parts)

    if len(cpf_c) == 11:
        parts.append(
            f'<livingSubjectId>'
            f'<value root="{OID_CPF}" extension="{cpf_c}"/>'
            f'<semanticsText>LivingSubject.id</semanticsText>'
            f'</livingSubjectId>'
        )
        return "\n".join(parts)

    if nome:
        parts.append(
            f'<livingSubjectName>'
            f'<value use="L"><given>{_escape(nome.strip())}</given></value>'
            f'<semanticsText>LivingSubject.Given</semanticsText>'
            f'</livingSubjectName>'
        )
    if data_nascimento:
        # Espera "AAAA-MM-DD"; converte pra "AAAAMMDD".
        if re.match(r"^\d{4}-\d{2}-\d{2}$", data_nascimento):
            valor = data_nascimento.replace("-", "")
            parts.append(
                f'<livingSubjectBirthTime>'
                f'<value value="{valor}"/>'
                f'<semanticsText>LivingSubject.birthTime</semanticsText>'
                f'</livingSubjectBirthTime>'
            )
    if sexo in ("M", "F"):
        parts.append(
            f'<livingSubjectAdministrativeGender>'
            f'<value code="{sexo}" codeSystem="2.16.840.1.113883.5.1"/>'
            f'<semanticsText>LivingSubject.administrativeGender</semanticsText>'
            f'</livingSubjectAdministrativeGender>'
        )
    if nome_mae:
        parts.append(
            f'<mothersMaidenName>'
            f'<value use="L">{_escape(nome_mae.strip())}</value>'
            f'<semanticsText>mothersMaidenName</semanticsText>'
            f'</mothersMaidenName>'
        )
    return "\n".join(parts)


# ─── Parser ────────────────────────────────────────────────────────────────

def _text(node: ET.Element | None, default: str = "") -> str:
    if node is None or node.text is None:
        return default
    return node.text.strip()


def _attr(node: ET.Element | None, name: str, default: str = "") -> str:
    if node is None:
        return default
    return node.get(name, default).strip()


def _select_cns(patient_person: ET.Element) -> str:
    """Escolhe o CNS principal por hierarquia:
    Definitivo (D) > 7 > 1 > 2 > 9 > 8. (ver §5.6 do manual)"""
    found: list[tuple[str, str]] = []  # (cns, situacao)
    for ids in patient_person.findall("hl7:asOtherIDs", NS):
        id_nodes = ids.findall("hl7:id", NS)
        # Par de <id>: primeiro é o CNS, segundo é a situação.
        for i in range(0, len(id_nodes), 2):
            root = id_nodes[i].get("root", "")
            if root != OID_CNS:
                continue
            cns = id_nodes[i].get("extension", "")
            situacao = id_nodes[i + 1].get("extension", "") if i + 1 < len(id_nodes) else ""
            if cns:
                found.append((cns, situacao))

    priority_map = {"D": 0, "7": 1, "1": 2, "2": 3, "9": 4, "8": 5}
    best: tuple[int, str] = (999, "")
    for cns, situacao in found:
        key = "D" if situacao == "D" else cns[:1]
        p = priority_map.get(key, 99)
        if p < best[0]:
            best = (p, cns)
    return best[1]


def _extract_documento(patient_person: ET.Element) -> tuple[str, str]:
    """Retorna (cpf, rg) se presentes."""
    cpf, rg = "", ""
    for ids in patient_person.findall("hl7:asOtherIDs", NS):
        for idn in ids.findall("hl7:id", NS):
            root = idn.get("root", "")
            val = idn.get("extension", "")
            if not val:
                continue
            if root == OID_CPF:
                cpf = val
            elif root == OID_RG:
                rg = val
    return cpf, rg


def _extract_filiation(patient_person: ET.Element) -> tuple[str, str]:
    """Retorna (nome_mae, nome_pai)."""
    nome_mae, nome_pai = "", ""
    for rel in patient_person.findall("hl7:personalRelationship", NS):
        code = rel.find("hl7:code", NS)
        code_val = code.get("code", "") if code is not None else ""
        holder = rel.find("hl7:relationshipHolder1/hl7:name/hl7:given", NS)
        nome = _text(holder)
        if code_val == "PRN":
            nome_mae = nome
        elif code_val == "NPRN":
            nome_pai = nome
    return nome_mae, nome_pai


def _format_phone(raw: str) -> str:
    # CADSUS retorna "+55-DD-NUMERO" — extrai DD+número.
    parts = (raw or "").split("-")
    if len(parts) >= 3:
        return parts[1] + parts[2]
    return raw


def _parse_patient_person(pp: ET.Element) -> CadsusPatientResult:
    birth = _attr(pp.find("hl7:birthTime", NS), "value")
    iso = f"{birth[0:4]}-{birth[4:6]}-{birth[6:8]}" if len(birth) == 8 else ""

    cpf, rg = _extract_documento(pp)
    nome_mae, nome_pai = _extract_filiation(pp)

    addr = pp.find("hl7:addr", NS)
    birthplace_addr = pp.find("hl7:birthPlace/hl7:addr", NS)

    ibge_resid = _text(addr.find("hl7:city", NS)) if addr is not None else ""
    ibge_nat = _text(birthplace_addr.find("hl7:city", NS)) if birthplace_addr is not None else ""

    endereco = CadsusAddress(
        cep=_text(addr.find("hl7:postalCode", NS)) if addr is not None else "",
        logradouro=_text(addr.find("hl7:streetName", NS)) if addr is not None else "",
        tipo=_text(addr.find("hl7:streetNameType", NS)) if addr is not None else "",
        numero=_text(addr.find("hl7:houseNumber", NS)) if addr is not None else "",
        complemento=_text(addr.find("hl7:unitID", NS)) if addr is not None else "",
        bairro=_text(addr.find("hl7:additionalLocator", NS)) if addr is not None else "",
        ibge=ibge_resid,                  # será expandido 6→7 se necessário no router
        ibge_original=ibge_resid,
        pais=_text(addr.find("hl7:country", NS)) if addr is not None else "",
    )

    telecom = pp.find("hl7:telecom", NS)
    telefone = _format_phone(_attr(telecom, "value"))

    return CadsusPatientResult(
        cns=_select_cns(pp),
        nome=_text(pp.find("hl7:name/hl7:given", NS)),
        data_nascimento=iso,
        sexo=_attr(pp.find("hl7:administrativeGenderCode", NS), "code"),
        raca_cor=_attr(pp.find("hl7:raceCode", NS), "code"),
        nome_mae=nome_mae,
        nome_pai=nome_pai,
        telefone=telefone,
        cpf=cpf,
        rg=rg,
        naturalidade_ibge=ibge_nat,
        endereco=endereco,
    )


def parse_response(xml_text: str) -> list[CadsusPatientResult]:
    """Converte a resposta SOAP em lista de pacientes normalizados."""
    root = ET.fromstring(xml_text)
    patients: list[CadsusPatientResult] = []

    # XPath relativo ao namespace s/hl7: SBody/PRPA_IN201306UV02/controlActProcess/subject/...
    body = root.find("s:Body/hl7:PRPA_IN201306UV02/hl7:controlActProcess", NS)
    if body is None:
        return patients

    for subj in body.findall("hl7:subject", NS):
        pp = subj.find(
            "hl7:registrationEvent/hl7:subject1/hl7:patient/hl7:patientPerson",
            NS,
        )
        if pp is not None:
            patients.append(_parse_patient_person(pp))

    return patients


# ─── Client público ────────────────────────────────────────────────────────

class CadsusError(Exception):
    pass


async def search_cadsus(
    *,
    cpf: str | None = None,
    cns: str | None = None,
    nome: str | None = None,
    data_nascimento: str | None = None,
    nome_mae: str | None = None,
    sexo: str | None = None,
    user: str | None = None,
    password: str | None = None,
) -> list[CadsusPatientResult]:
    """Executa consulta no PDQ Supplier. Lança CadsusError em caso de erro.

    ``user``/``password`` sobrepõem as credenciais globais (settings).
    Usados pra injetar as credenciais do município ativo.
    """
    effective_user = user or settings.cadsus_user
    effective_pass = password or settings.cadsus_password
    if not effective_user or not effective_pass:
        raise CadsusError("Credenciais CadSUS não configuradas.")

    args = _build_query_args(
        cpf=cpf, cns=cns, nome=nome,
        data_nascimento=data_nascimento,
        nome_mae=nome_mae, sexo=sexo,
    )
    if not args.strip():
        raise CadsusError("Informe ao menos um critério de busca.")

    envelope = _ENVELOPE.format(
        user=_escape(effective_user),
        password=_escape(effective_pass),
        query_args=args,
    )

    try:
        async with httpx.AsyncClient(timeout=settings.cadsus_timeout_seconds) as client:
            resp = await client.post(
                settings.cadsus_url,
                content=envelope.encode("utf-8"),
                headers={
                    "Content-Type": "application/soap+xml; charset=utf-8",
                    "SOAPAction": "urn:hl7-org:v3:PRPA_IN201305UV02",
                },
            )
            resp.raise_for_status()
    except httpx.HTTPError as e:
        raise CadsusError(f"Falha ao consultar CadSUS: {e}") from e

    try:
        return parse_response(resp.text)
    except ET.ParseError as e:
        log.warning("cadsus_parse_error", extra={"detail": str(e)})
        raise CadsusError("Resposta do CadSUS em formato inesperado.") from e
