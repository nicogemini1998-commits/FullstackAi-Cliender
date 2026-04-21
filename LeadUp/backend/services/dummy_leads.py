"""Generador de leads dummy para testing/demo."""
import random
import uuid
from datetime import date

COMPANIES = [
    {"name": "TechVision SL", "website": "techvision.es", "sector": "Tecnología", "city": "Madrid", "employees": 45},
    {"name": "DigitalPro Agency", "website": "digitalpro.es", "sector": "Marketing Digital", "city": "Barcelona", "employees": 28},
    {"name": "CloudServe", "website": "cloudserve.es", "sector": "Cloud Services", "city": "Valencia", "employees": 32},
    {"name": "DataAnalytics Inc", "website": "dataanalytics.es", "sector": "Big Data", "city": "Madrid", "employees": 52},
    {"name": "WebDesign Studio", "website": "webdesign-studio.es", "sector": "Diseño Web", "city": "Sevilla", "employees": 15},
    {"name": "SEO Masters", "website": "seomasters.es", "sector": "SEO/SEM", "city": "Madrid", "employees": 22},
    {"name": "E-Commerce Solutions", "website": "ecommercelabs.es", "sector": "E-commerce", "city": "Barcelona", "employees": 38},
    {"name": "Mobile Dev Team", "website": "mobiledev.es", "sector": "Desarrollo Móvil", "city": "Bilbao", "employees": 18},
    {"name": "AI Consulting", "website": "aiconsulting.es", "sector": "IA/ML", "city": "Madrid", "employees": 41},
    {"name": "Digital Marketing Pro", "website": "dmktg-pro.es", "sector": "Marketing Digital", "city": "Valencia", "employees": 25},
    {"name": "Software House", "website": "softwarehouse.es", "sector": "Desarrollo Software", "city": "Zaragoza", "employees": 55},
    {"name": "Business Intelligence", "website": "bi-solutions.es", "sector": "Business Intelligence", "city": "Madrid", "employees": 33},
]

CONTACT_NAMES = ["Juan García", "María López", "Pedro Martínez", "Ana Rodríguez", "Carlos Fernández"]
CONTACT_ROLES = ["CEO", "Director General", "Fundador", "Manager Marketing", "Responsable Digital"]
PHONE_PATTERNS = ["+34 6", "+34 9"]

def generate_dummy_lead():
    """Genera un lead dummy realista."""
    company = random.choice(COMPANIES)
    contact = {
        "name": random.choice(CONTACT_NAMES),
        "role": random.choice(CONTACT_ROLES),
        "email": f"{random.randint(1000,9999)}@{company['website']}",
        "phone": f"{random.choice(PHONE_PATTERNS)}{random.randint(10000000,99999999)}",
        "is_primary": True,
    }

    return {
        "id": str(uuid.uuid4()),
        "name": company["name"],
        "website": f"https://{company['website']}",
        "sector": company["sector"],
        "city": company["city"],
        "employee_count": company["employees"],
        "digital_score": random.randint(35, 95),
        "opportunity_level": random.choice(["ALTA", "MEDIA", "BAJA"]),
        "summary": f"Empresa {company['sector'].lower()} en {company['city']}. {company['employees']} empleados. Potencial cliente.",
        "contacts": [contact],
        "call_status": "pending",
        "attempt_count": 0,
        "has_crm": "Salesforce" if random.random() > 0.7 else None,
        "seo_score": random.randint(20, 80),
        "gmb_rating": round(random.uniform(3.5, 5.0), 1) if random.random() > 0.4 else None,
    }

async def generate_leads_for_user(count: int = 5) -> list:
    """Genera N leads dummy."""
    return [generate_dummy_lead() for _ in range(count)]
