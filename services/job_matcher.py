"""
services/job_matcher.py

Searches Adzuna and ranks jobs using skill overlap and local embeddings.
Falls back to keyword ranking when the embedding model is unavailable.
"""

import os
import re
import requests
import logging
from dotenv import load_dotenv
from threading import Lock

from services.skill_keywords import TECH_KEYWORDS, SKILL_ALIASES, normalize_skill

load_dotenv()

ADZUNA_APP_ID = os.environ.get("ADZUNA_APP_ID")
ADZUNA_API_KEY = os.environ.get("ADZUNA_API_KEY")
ADZUNA_COUNTRY = "us"
ADZUNA_BASE_URL = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search"

# Search full names and aliases, returning one canonical name per skill.
_CANONICAL_NAMES = {kw.lower(): kw for kw in TECH_KEYWORDS}
_SKILL_VARIANTS = {
    kw.lower(): _CANONICAL_NAMES[normalize_skill(kw)] for kw in TECH_KEYWORDS
}
_SKILL_VARIANTS.update({
    alias: _CANONICAL_NAMES[target]
    for alias, target in SKILL_ALIASES.items() if target in _CANONICAL_NAMES
})

logger = logging.getLogger(__name__)


class JobSearchError(Exception):
    """The job provider could not return a usable search result."""


def search_jobs(job_title: str, location: str = "", results_count: int = 5, page: int = 1) -> dict:
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_API_KEY,
        "what": job_title,
        "where": location,
        "results_per_page": results_count,
        "content-type": "application/json",
    }

    try:
        response = requests.get(f"{ADZUNA_BASE_URL}/{page}", params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Adzuna search failed (%s)', type(exc).__name__)
        raise JobSearchError('Job search is temporarily unavailable. Please try again later.') from exc

    if not isinstance(data, dict) or not isinstance(data.get('results'), list):
        raise JobSearchError('Job search is temporarily unavailable. Please try again later.')

    jobs = []
    for job in data["results"]:
        jobs.append({
            "title": job.get("title"),
            "company": job.get("company", {}).get("display_name"),
            "location": job.get("location", {}).get("display_name"),
            "description": job.get("description"),
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "url": job.get("redirect_url"),
        })

    total = data.get('count')
    has_more = page * results_count < total if isinstance(total, int) and total >= 0 else len(jobs) == results_count
    return {'jobs': jobs, 'has_more': has_more}


def extract_skills_from_text(text: str) -> set:
    """
    Scans free text and returns the set of canonical skill names
    (from TECH_KEYWORDS) found within it, matching through the alias
    map so variants like "JS" or "Postgres" are recognized too.

    Uses word-boundary matching (not plain substring search) so short
    keywords like "C" or "R" only match as standalone words — not as
    fragments inside unrelated words like "excellence" or "leverage",
    which plain `in` matching would incorrectly flag.
    """
    if not text:
        return set()

    text_lower = text.lower()
    found = set()

    for variant, canonical_kw in _SKILL_VARIANTS.items():
        # C must not match the start of C++ or C#.
        pattern = r"(?<![a-z0-9])" + re.escape(variant) + r"(?![a-z0-9+#])"
        if re.search(pattern, text_lower):
            found.add(canonical_kw)

    return found


_embedding_model = None
_embedding_load_attempted = False
_embedding_lock = Lock()


def _get_embedding_model():
    """Load on demand; a failed load uses keywords until app restart."""
    global _embedding_model, _embedding_load_attempted
    with _embedding_lock:
        if not _embedding_load_attempted:
            _embedding_load_attempted = True
            try:
                from sentence_transformers import SentenceTransformer
                _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            except Exception:
                logger.warning('Embedding model unavailable; using keyword ranking.', exc_info=True)
    return _embedding_model


def _cosine_similarity(a, b) -> float:
    import numpy as np
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def _semantic_score(resume_skills: list, job_description: str) -> float:
    """
    Local-embedding cosine similarity between the resume's skills and
    a job description, calibrated onto a 0-100 scale. FLOOR/CEILING
    are estimates for this model/comparison type — adjust after
    seeing more real data, same as the earlier calibration pass.
    """
    if not job_description:
        return 0.0

    resume_text = ", ".join(resume_skills)
    model = _get_embedding_model()
    if model is None:
        raise RuntimeError('Embedding model unavailable')
    embeddings = model.encode([resume_text, job_description])
    raw = _cosine_similarity(embeddings[0], embeddings[1])

    FLOOR, CEILING = 0.05, 0.55
    scaled = (raw - FLOOR) / (CEILING - FLOOR)
    return max(0.0, min(scaled, 1.0)) * 100


def rank_jobs_hybrid(resume_skills: list, jobs: list, keyword_weight: float = 0.6) -> list:
    """
    Combines two independent signals per job:
    - keyword_score: exact skill overlap (explainable — gives
      matched_skills / missing_skills lists)
    - semantic_score: local embedding similarity (catches related
      skills the static keyword list doesn't know about)

    keyword_weight controls the blend (0.6 = 60% keyword, 40% semantic).
    """
    rank_jobs_by_keywords(resume_skills, jobs)
    if not jobs or not resume_skills or _get_embedding_model() is None:
        return sorted(jobs, key=lambda j: j['match_score'], reverse=True)

    try:
        # Apply semantic scores only after the entire batch succeeds.
        semantic_scores = [_semantic_score(resume_skills, job.get('description') or '') for job in jobs]
    except Exception:
        logger.warning('Semantic scoring failed; using keyword ranking.', exc_info=True)
        return sorted(jobs, key=lambda j: j['match_score'], reverse=True)

    for job, semantic_score in zip(jobs, semantic_scores):
        # Keep unrounded overlap for the original hybrid formula.
        total = len(job['matched_skills']) + len(job['missing_skills'])
        keyword_score = len(job['matched_skills']) / total * 100 if total else 0
        job['match_score'] = round(keyword_score * keyword_weight + semantic_score * (1 - keyword_weight))
        job['semantic_score'] = round(semantic_score)
        job['ranking_method'] = 'hybrid'

    return sorted(jobs, key=lambda j: j["match_score"], reverse=True)


def rank_jobs_by_keywords(resume_skills: list, jobs: list) -> list:
    """
    Scores each job by how many of ITS required skills the resume
    already has. Adds match_score (0-100), matched_skills, and
    missing_skills to each job dict, then returns jobs sorted by
    match_score, highest first.
    """
    resume_set = {normalize_skill(s) for s in resume_skills}

    for job in jobs:
        job_skills = extract_skills_from_text(job.get("description", ""))
        job_skills_normalized = {normalize_skill(s) for s in job_skills}

        matched = job_skills_normalized & resume_set
        missing = job_skills_normalized - resume_set

        job["match_score"] = (
            round(len(matched) / len(job_skills_normalized) * 100)
            if job_skills_normalized else 0
        )
        job['keyword_score'] = job['match_score']
        job['semantic_score'] = None
        job['ranking_method'] = 'keyword'
        job["matched_skills"] = sorted(matched)
        job["missing_skills"] = sorted(missing)

    return sorted(jobs, key=lambda j: j["match_score"], reverse=True)


if __name__ == "__main__":
    import json
    fake_skills = ["C++", "Linux", "Embedded Systems", "C", "System Design"]
    results = search_jobs("Software Engineer", location="Virginia")
    ranked = rank_jobs_hybrid(fake_skills, results['jobs'])
    print(json.dumps(ranked, indent=2))
