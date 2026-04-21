#!/usr/bin/env python3
"""Setup LeadUp database y usuario por defecto."""
import asyncio
import asyncpg
import bcrypt
from datetime import datetime
import os

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "leadup")
DB_USER = os.getenv("DB_USER", "fai_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "fai_db_2024_secure")

ADMIN_EMAIL = "admin@cliender.com"
ADMIN_PASSWORD = "Master123"

async def setup():
    try:
        # Connect
        conn = await asyncpg.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD, timeout=5
        )

        # Schema
        schema_sql = """
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";

        CREATE TABLE IF NOT EXISTS lu_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'commercial',
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lu_companies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            website VARCHAR(255),
            sector VARCHAR(100),
            city VARCHAR(100),
            employee_count INTEGER,
            digital_score INTEGER,
            gmb_rating FLOAT,
            gmb_reviews INTEGER,
            has_crm VARCHAR(50),
            social_facebook VARCHAR(255),
            social_linkedin VARCHAR(255),
            social_instagram VARCHAR(255),
            has_facebook_pixel BOOLEAN DEFAULT FALSE,
            has_google_ads BOOLEAN DEFAULT FALSE,
            seo_score INTEGER DEFAULT 0,
            opportunity_level VARCHAR(10),
            opportunity_sales TEXT,
            opportunity_tech TEXT,
            opportunity_av TEXT,
            summary TEXT,
            redes_sociales TEXT,
            captacion_leads TEXT,
            email_marketing TEXT,
            video_contenido TEXT,
            seo_info TEXT,
            oportunidad_hbd TEXT,
            opening_line TEXT,
            hook_captacion TEXT,
            hook_crm TEXT,
            hook_visibilidad TEXT,
            presencia_web TEXT,
            raw_data JSONB,
            enriched_at TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS lu_contacts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID REFERENCES lu_companies(id) ON DELETE CASCADE,
            name VARCHAR(255),
            role VARCHAR(100),
            email VARCHAR(255),
            phone VARCHAR(50),
            phone_source VARCHAR(50),
            linkedin_url VARCHAR(255),
            is_primary BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS lu_call_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID REFERENCES lu_companies(id) ON DELETE CASCADE,
            contact_id UUID REFERENCES lu_contacts(id),
            commercial_id UUID REFERENCES lu_users(id),
            status VARCHAR(20),
            notes TEXT,
            called_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS lu_daily_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES lu_users(id) ON DELETE CASCADE,
            company_id UUID REFERENCES lu_companies(id) ON DELETE CASCADE,
            assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
            called BOOLEAN DEFAULT FALSE,
            status VARCHAR(20) DEFAULT 'pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, company_id, assigned_date)
        );

        CREATE INDEX IF NOT EXISTS idx_assignments_user_date ON lu_daily_assignments(user_id, assigned_date);
        CREATE INDEX IF NOT EXISTS idx_companies_enriched ON lu_companies(enriched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contacts_company ON lu_contacts(company_id);
        CREATE INDEX IF NOT EXISTS idx_logs_company ON lu_call_logs(company_id);
        """

        await conn.execute(schema_sql)
        print("✅ Schema creado")

        # Insert admin user
        pwd_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()

        try:
            await conn.execute(
                "INSERT INTO lu_users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)",
                "Admin LeadUp", ADMIN_EMAIL, pwd_hash, "admin"
            )
            print(f"✅ Usuario admin creado: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        except Exception as e:
            if "unique constraint" in str(e):
                print(f"⚠️  Usuario {ADMIN_EMAIL} ya existe")
            else:
                raise

        await conn.close()
        print("✅ Setup completado")

    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)

if __name__ == "__main__":
    asyncio.run(setup())
