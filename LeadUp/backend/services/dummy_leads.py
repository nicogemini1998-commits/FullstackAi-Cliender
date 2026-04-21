"""Generador de leads dummy para testing/demo — sectores CLIENDER reales."""
import random
import uuid

COMPANIES = [
    # Abogados / Despachos
    {"name": "Martínez & Asociados Abogados", "website": "martinezabogados.es", "sector": "Abogados", "city": "Madrid", "employees": 18},
    {"name": "Despacho Vilches & Ruiz", "website": "vilchesruiz.es", "sector": "Abogados", "city": "Sevilla", "employees": 12},
    {"name": "López Peña Abogados", "website": "lopezpena.es", "sector": "Abogados", "city": "Barcelona", "employees": 22},
    {"name": "Fernández Legal SLP", "website": "fernandezlegal.es", "sector": "Abogados", "city": "Valencia", "employees": 9},
    # Reformas / Construcción
    {"name": "Reformas García Madrid", "website": "reformasgarcia.es", "sector": "Reformas", "city": "Madrid", "employees": 35},
    {"name": "Construye&Reforma SL", "website": "construyereforma.es", "sector": "Reformas", "city": "Barcelona", "employees": 28},
    {"name": "Obras y Rehabilitaciones Norte", "website": "obrasyrehabilitaciones.es", "sector": "Reformas", "city": "Bilbao", "employees": 20},
    # Inmobiliarias
    {"name": "Inmobiliaria Horizonte", "website": "inmobiliariahorizonte.es", "sector": "Inmobiliaria", "city": "Madrid", "employees": 15},
    {"name": "Costa Mediterráneo Propiedades", "website": "costameditpropiedades.es", "sector": "Inmobiliaria", "city": "Alicante", "employees": 10},
    {"name": "Grupo Viviendas Valencia", "website": "grupoviviendasvlc.es", "sector": "Inmobiliaria", "city": "Valencia", "employees": 24},
    # Clínicas / Salud
    {"name": "Clínica Dental Dr. Sanz", "website": "clinicadentalsanz.es", "sector": "Salud", "city": "Madrid", "employees": 14},
    {"name": "Centro Médico Bienestar", "website": "centromedicobienestar.es", "sector": "Salud", "city": "Barcelona", "employees": 30},
    {"name": "Fisioterapia Avanzada SL", "website": "fisioterapiaavanzada.es", "sector": "Salud", "city": "Zaragoza", "employees": 8},
    # Academias / Formación
    {"name": "Academia Idiomas Global", "website": "academiaidiomasglobal.es", "sector": "Educación", "city": "Madrid", "employees": 22},
    {"name": "Centro Formación Profesional Nexo", "website": "cfpnexo.es", "sector": "Educación", "city": "Sevilla", "employees": 16},
    # Restaurantes / Hostelería
    {"name": "Grupo Restauración Sabor", "website": "gruposabor.es", "sector": "Hostelería", "city": "Madrid", "employees": 45},
    {"name": "Catering & Eventos Montserrat", "website": "cateringevmontserrat.es", "sector": "Hostelería", "city": "Barcelona", "employees": 20},
    # Fontanería / Electricidad / Servicios
    {"name": "Fontanería y Climatización Torres", "website": "fontaneriatores.es", "sector": "Servicios del Hogar", "city": "Madrid", "employees": 12},
    {"name": "Instalaciones Eléctricas Rubio", "website": "instalacionesrubio.es", "sector": "Servicios del Hogar", "city": "Valencia", "employees": 9},
    # Ópticas / Estética
    {"name": "Óptica Visión Plena", "website": "opticavisionplena.es", "sector": "Óptica", "city": "Málaga", "employees": 7},
    {"name": "Centro Estética Lumière", "website": "centrolumiere.es", "sector": "Estética", "city": "Madrid", "employees": 11},
]

_OPP_TEMPLATES = [
    {
        "opportunity_sales":  "• Sin sistema CRM — gestionan clientes por WhatsApp y agenda papel\n• HBD: CRM + automatización seguimiento\n• Impacto estimado: +35% conversión leads",
        "opportunity_tech":   "• Procesos internos manuales, sin IA\n• HBD: Automatización presupuestos + IA atención\n• Impacto estimado: -40% tiempo admin",
        "opportunity_av":     "• Sin vídeo corporativo ni contenido en redes\n• HBD: Vídeo marca + reels para captación\n• Diferenciación: autoridad en sector local",
        "opening_line":       "Hola, llamo de Cliender. Vi que tenéis una web pero sin sistema de captación automatizado — con lo que manejáis podéis doblar citas sin esfuerzo extra.",
        "hook_captacion":     "Sin formulario de captación ni seguimiento automatizado de presupuestos",
        "hook_crm":           "Sin CRM — pierden seguimiento de clientes potenciales",
        "hook_visibilidad":   "Redes sociales sin actividad en los últimos 90 días",
    },
    {
        "opportunity_sales":  "• Llevan leads a mano en Excel sin seguimiento\n• HBD: CRM con pipeline visual + alertas\n• Impacto estimado: +28% cierre de ventas",
        "opportunity_tech":   "• Web sin chatbot ni respuesta automática\n• HBD: IA para preguntas frecuentes + citas\n• Impacto estimado: -60% tiempo en atención",
        "opportunity_av":     "• Fotos de baja calidad en Google Maps\n• HBD: Sesión profesional + vídeo instalaciones\n• Diferenciación: +4.5 estrellas objetivo",
        "opening_line":       "Buenos días, soy de Cliender. Revisé vuestra presencia digital y tenéis margen enorme para captar más clientes con muy poca inversión.",
        "hook_captacion":     "Google Ads activo pero sin landing page optimizada — dinero perdido",
        "hook_crm":           "Responden consultas por email con demoras de +48h",
        "hook_visibilidad":   "Sin presencia en Instagram ni LinkedIn de empresa",
    },
    {
        "opportunity_sales":  "• No tienen sistema de reseñas automatizado\n• HBD: Gestión reputación online + Google Maps\n• Impacto estimado: +22% clientes nuevos por búsqueda",
        "opportunity_tech":   "• Sin automatización de recordatorios de citas\n• HBD: WhatsApp Business API + recordatorios\n• Impacto estimado: -35% no-shows",
        "opportunity_av":     "• Sin testimonios en vídeo de clientes\n• HBD: Producción testimoniales + difusión\n• Diferenciación: confianza y prueba social",
        "opening_line":       "Hola, llamo de Cliender. Vuestro negocio tiene muy buenas reseñas pero sin un sistema para captarlas sistemáticamente — con eso podéis adelantar a la competencia local.",
        "hook_captacion":     "Score SEO bajo — no aparecen en búsquedas locales relevantes",
        "hook_crm":           "Sin sistema de fidelización ni seguimiento post-servicio",
        "hook_visibilidad":   "Facebook Pixel no instalado — no pueden hacer retargeting",
    },
]

CONTACT_NAMES = [
    ("Carlos Martínez", "Director General"), ("Laura Sánchez", "CEO / Fundadora"),
    ("Miguel Fernández", "Gerente"), ("Patricia Gómez", "Directora Comercial"),
    ("Antonio López", "Propietario"), ("Elena Ruiz", "Socia Directora"),
    ("Javier Torres", "CEO"), ("Carmen Díaz", "Directora de Operaciones"),
]

SECONDARY_ROLES = [
    ("Director Financiero", "CFO"), ("Responsable Comercial", None),
    ("Director de Marketing", None), ("Socio Director", None),
]


def generate_dummy_lead():
    """Genera un lead dummy de sector CLIENDER con todos los campos."""
    company  = random.choice(COMPANIES)
    opp      = random.choice(_OPP_TEMPLATES)
    p_name, p_role = random.choice(CONTACT_NAMES)

    primary = {
        "name":         p_name,
        "role":         p_role,
        "email":        f"contacto@{company['website']}",
        "phone":        f"+34 6{random.randint(10000000,99999999)}",
        "linkedin_url": f"https://www.linkedin.com/in/{p_name.lower().replace(' ', '-')}-{random.randint(100,999)}",
        "is_primary":   True,
    }

    secondaries = []
    if random.random() > 0.4:
        s_role, _ = random.choice(SECONDARY_ROLES)
        s_name, _ = random.choice([c for c in CONTACT_NAMES if c[0] != p_name])
        secondaries.append({
            "name":         s_name,
            "role":         s_role,
            "email":        f"{s_name.split()[0].lower()}@{company['website']}",
            "phone":        None,
            "linkedin_url": f"https://www.linkedin.com/in/{s_name.lower().replace(' ', '-')}-{random.randint(100,999)}",
            "is_primary":   False,
        })
    if random.random() > 0.6 and len(secondaries) < 2:
        s_role2, _ = random.choice(SECONDARY_ROLES)
        s_name2, _ = random.choice([c for c in CONTACT_NAMES if c[0] != p_name])
        secondaries.append({
            "name":         s_name2,
            "role":         s_role2,
            "email":        None,
            "phone":        None,
            "linkedin_url": None,
            "is_primary":   False,
        })

    score = random.randint(38, 82)
    return {
        "id":               str(uuid.uuid4()),
        "name":             company["name"],
        "website":          f"https://{company['website']}",
        "sector":           company["sector"],
        "city":             company["city"],
        "employee_count":   company["employees"],
        "digital_score":    score,
        "opportunity_level":"ALTA" if score >= 65 else "MEDIA" if score >= 45 else "BAJA",
        "summary":          f"Empresa {company['sector'].lower()} en {company['city']} con {company['employees']} profesionales. Alta oportunidad de digitalización.",
        "contacts":         [primary] + secondaries,
        "call_status":      "pending",
        "attempt_count":    0,
        "has_crm":          random.choice([None, None, None, "HubSpot", "Salesforce"]),
        "seo_score":        score - random.randint(5, 20),
        "gmb_rating":       round(random.uniform(3.8, 4.9), 1) if random.random() > 0.3 else None,
        "gmb_reviews":      random.randint(12, 280) if random.random() > 0.3 else None,
        "has_facebook_pixel": random.random() > 0.6,
        "has_google_ads":     random.random() > 0.7,
        "social_linkedin":    f"https://www.linkedin.com/company/{company['website'].replace('.es','')}",
        **opp,
    }


async def generate_leads_for_user(count: int = 5) -> list:
    """Genera N leads dummy de sectores CLIENDER."""
    return [generate_dummy_lead() for _ in range(count)]
