from __future__ import annotations
import re
from typing import Optional
from urllib.parse import urlparse


# Patrones de detección en scripts/contenido de la página
_CRM_PATTERNS = {
    "hubspot":    [r"hubspot\.com", r"hs-scripts\.com", r"hsforms\.com"],
    "salesforce": [r"salesforce\.com", r"force\.com", r"pardot\.com"],
    "zoho":       [r"zoho\.com", r"zohopublic\.com"],
    "pipedrive":  [r"pipedrive\.com"],
    "freshsales": [r"freshsales\.io", r"freshworks\.com"],
    "active_campaign": [r"activecampaign\.com"],
}

_PIXEL_PATTERNS = {
    "facebook":    [r"connect\.facebook\.net", r"fbq\s*\(", r"facebook\.com/tr"],
    "google_ads":  [r"googleadservices\.com", r"gtag\s*\(", r"google-analytics\.com/collect"],
    "tiktok":      [r"analytics\.tiktok\.com"],
    "linkedin":    [r"snap\.licdn\.com"],
}

_SOCIAL_PATTERNS = {
    "facebook":  r"facebook\.com/(?!sharer|share|dialog|plugins|tr|photo|pg|help|groups|events|pages|notes|video|media|stories|reels|reel|hashtag|search|profile|home|messages|notifications|settings|saved|marketplace|gaming|watch|bookmarks|fundraisers|jobs|news|offers|recent|birthday|moments|memories|campus|live|ads|business|policies|community|login|recover|reg)[^/\s<>\"\']{2,40}",
    "instagram": r"instagram\.com/(?!p/|tv/|reel/|explore/|accounts/|stories/|direct/|legal/|about/|press/|api/|static/)[^/\s<>\"\']{2,40}",
    "linkedin":  r"linkedin\.com/(?:company|in|school)/[^/\s<>\"\']{2,80}",
    "twitter":   r"(?:twitter|x)\.com/(?!share|intent|search|hashtag|i/|home|login|signup|settings|help|about|privacy|tos|legal|status/)[^/\s<>\"\']{2,40}",
    "youtube":   r"youtube\.com/(?:channel|c|user|@)[^/\s<>\"\']{2,60}",
}


def _extract_html(url: str) -> Optional[str]:
    """Fetch HTML con Scrapling. Fallback a httpx si falla."""
    try:
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(url, timeout=15, stealthy_headers=True)
        return str(page.html) if page else None
    except Exception:
        pass

    try:
        import httpx
        r = httpx.get(url, timeout=10, follow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (compatible; LeadUpBot/1.0)"
        })
        return r.text
    except Exception:
        return None


def _detect_crm(html: str) -> Optional[str]:
    for crm, patterns in _CRM_PATTERNS.items():
        for p in patterns:
            if re.search(p, html, re.IGNORECASE):
                return crm
    return None


def _detect_pixels(html: str) -> dict[str, bool]:
    return {
        name: any(re.search(p, html, re.IGNORECASE) for p in patterns)
        for name, patterns in _PIXEL_PATTERNS.items()
    }


def _extract_socials(html: str) -> dict[str, Optional[str]]:
    result: dict[str, Optional[str]] = {}
    for network, pattern in _SOCIAL_PATTERNS.items():
        match = re.search(pattern, html, re.IGNORECASE)
        result[network] = f"https://{'twitter.com' if network == 'twitter' else ''}{match.group(0)}" if match else None
    return result


def _estimate_seo_score(html: str) -> int:
    """Score 0-100 basado en señales SEO básicas detectables en HTML."""
    score = 0
    checks = [
        (r"<title>[^<]{10,}", 15),                          # title tag con contenido
        (r'<meta\s+name=["\']description["\']', 15),        # meta description
        (r'<h1[\s>]', 15),                                  # h1 presente
        (r'<meta\s+name=["\']viewport["\']', 10),           # mobile viewport
        (r'(?:og:title|og:description)', 10),               # Open Graph
        (r'(?:application/ld\+json|itemtype)', 10),         # Structured data
        (r'<link[^>]+rel=["\']canonical["\']', 10),         # Canonical
        (r'<img[^>]+alt=["\'][^"\']{3,}["\']', 15),        # Alt texts
    ]
    for pattern, points in checks:
        if re.search(pattern, html, re.IGNORECASE):
            score += points
    return min(score, 100)


def analyze_website(url: str) -> dict:
    """
    Analiza una URL con Scrapling y devuelve señales de presencia digital.
    Nunca lanza excepción — devuelve campos con None en caso de fallo.
    """
    if not url:
        return _empty_result()

    # Normalizar URL
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    html = _extract_html(url)
    if not html:
        return _empty_result(error="No se pudo acceder al sitio")

    pixels = _detect_pixels(html)
    socials = _extract_socials(html)

    return {
        "url_analyzed": url,
        "reachable": True,
        "has_crm": _detect_crm(html),
        "has_facebook_pixel": pixels.get("facebook", False),
        "has_google_ads": pixels.get("google_ads", False),
        "has_tiktok_pixel": pixels.get("tiktok", False),
        "has_linkedin_insight": pixels.get("linkedin", False),
        "social_facebook": socials.get("facebook"),
        "social_instagram": socials.get("instagram"),
        "social_linkedin": socials.get("linkedin"),
        "social_twitter": socials.get("twitter"),
        "social_youtube": socials.get("youtube"),
        "seo_score": _estimate_seo_score(html),
        "error": None,
    }


def _empty_result(error: Optional[str] = None) -> dict:
    return {
        "url_analyzed": None,
        "reachable": False,
        "has_crm": None,
        "has_facebook_pixel": False,
        "has_google_ads": False,
        "has_tiktok_pixel": False,
        "has_linkedin_insight": False,
        "social_facebook": None,
        "social_instagram": None,
        "social_linkedin": None,
        "social_twitter": None,
        "social_youtube": None,
        "seo_score": 0,
        "error": error,
    }
