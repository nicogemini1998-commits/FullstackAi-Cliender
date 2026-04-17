from __future__ import annotations
import json
import re
import uuid
from ..database import db_conn
from .fullstackai_client import trigger_enrichment


def _to_str(v) -> str | None:
    """Convierte cualquier tipo a string para columnas TEXT."""
    if v is None:
        return None
    if isinstance(v, list):
        return "\n".join(f"• {item}" if not str(item).startswith("•") else str(item) for item in v)
    return str(v)


def _extract_json(text: str) -> list:
    """
    Extrae empresas del texto aunque el JSON esté truncado.
    Estrategia: intentar array completo primero; si falla,
    extraer objetos {} individuales uno a uno.
    """
    # 1. Array completo
    start = text.find("[")
    end   = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except Exception:
            pass

    # 2. Parse directo
    try:
        return json.loads(text.strip())
    except Exception:
        pass

    # 3. Extraer objetos {} completos (cuando el array está truncado)
    companies = []
    pos = text.find("{")
    while pos != -1:
        depth = 0
        i = pos
        while i < len(text):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[pos:i+1])
                        if isinstance(obj, dict) and obj.get("name"):
                            companies.append(obj)
                    except Exception:
                        pass
                    break
            i += 1
        pos = text.find("{", i + 1)

    return companies


async def run_enrichment(sector: str, city: str, qty: int) -> dict:
    """
    Dispara el flujo en FullStackAI y guarda los resultados en la DB de LeadUp.
    Devuelve stats del resultado.
    """
    result = await trigger_enrichment(sector, city, qty)

    if "error" in result:
        return {"ok": False, "error": result["error"]}

    raw_output = result.get("output", "")
    companies = _extract_json(raw_output)
    if not companies:
        return {"ok": False, "error": "Output del flujo no es JSON válido", "raw": raw_output[:500]}

    if not isinstance(companies, list):
        companies = [companies]

    saved = 0
    errors = 0
    for company in companies:
        try:
            await _save_company(company)
            saved += 1
        except Exception as e:
            errors += 1
            print(f"⚠️  Error guardando {company.get('name')}: {e}")

    return {"ok": True, "saved": saved, "errors": errors, "total": len(companies)}


async def _save_company(data: dict):
    async with db_conn() as conn:
        async with conn.transaction():
            # Upsert empresa por nombre + ciudad
            company = await conn.fetchrow(
                """
                INSERT INTO lu_companies
                    (name, website, sector, city, employee_count,
                     digital_score, gmb_rating, gmb_reviews,
                     has_crm, social_facebook, social_linkedin, social_instagram,
                     has_facebook_pixel, has_google_ads, seo_score,
                     opportunity_level, opportunity_sales, opportunity_tech, opportunity_av,
                     summary, redes_sociales, captacion_leads, email_marketing,
                     video_contenido, seo_info, oportunidad_hbd, raw_data)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                data.get("name"),
                data.get("website"),
                data.get("sector"),
                data.get("city"),
                data.get("employee_count"),
                data.get("digital_score"),
                data.get("gmb_rating"),
                data.get("gmb_reviews"),
                data.get("has_crm"),
                data.get("social_facebook"),
                data.get("social_linkedin"),
                data.get("social_instagram"),
                bool(data.get("has_facebook_pixel")),
                bool(data.get("has_google_ads")),
                data.get("seo_score", 0),
                data.get("opportunity_level"),
                _to_str(data.get("opportunity_sales")),
                _to_str(data.get("opportunity_tech")),
                _to_str(data.get("opportunity_av")),
                _to_str(data.get("summary")),
                _to_str(data.get("redes_sociales")),
                _to_str(data.get("captacion_leads")),
                _to_str(data.get("email_marketing")),
                _to_str(data.get("video_contenido")),
                _to_str(data.get("seo_info")),
                _to_str(data.get("oportunidad_hbd")),
                json.dumps(data),
            )
            if not company:
                return  # Ya existía

            company_id = company["id"]
            for contact in data.get("contacts", []):
                await conn.execute(
                    """
                    INSERT INTO lu_contacts
                        (company_id, name, role, email, phone, phone_source, linkedin_url, is_primary)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    """,
                    company_id,
                    contact.get("name"),
                    contact.get("role"),
                    contact.get("email"),
                    contact.get("phone"),
                    contact.get("phone_source", "apollo"),
                    contact.get("linkedin_url"),
                    bool(contact.get("is_primary", False)),
                )
