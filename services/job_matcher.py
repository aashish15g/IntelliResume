"""
services/job_matcher.py

Searches Adzuna for job listings matching a given job title, and ranks
them against a resume's skills using keyword extraction/matching —
no embeddings, no API calls, fully explainable results (shows exactly
which skills matched and which are missing per job).
"""

import os
import re
import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import numpy as np

from services.skill_keywords import TECH_KEYWORDS, normalize_skill

load_dotenv()

ADZUNA_APP_ID = os.environ.get("ADZUNA_APP_ID")
ADZUNA_API_KEY = os.environ.get("ADZUNA_API_KEY")
ADZUNA_COUNTRY = "us"
ADZUNA_BASE_URL = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/1"

# Pre-normalize the keyword list once, at import time, rather than
# re-normalizing it on every single job comparison.
_NORMALIZED_KEYWORDS = {normalize_skill(kw): kw for kw in TECH_KEYWORDS}


def search_jobs(job_title: str, location: str = "", results_count: int = 5) -> list:
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_API_KEY,
        "what": job_title,
        "where": location,
        "results_per_page": results_count,
        "content-type": "application/json",
    }

    try:
        response = requests.get(ADZUNA_BASE_URL, params=params, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Adzuna request failed: {e}")
        return []

    data = response.json()

    jobs = []
    for job in data.get("results", []):
        jobs.append({
            "title": job.get("title"),
            "company": job.get("company", {}).get("display_name"),
            "location": job.get("location", {}).get("display_name"),
            "description": job.get("description"),
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "url": job.get("redirect_url"),
        })

    return jobs


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

    for normalized_kw, canonical_kw in _NORMALIZED_KEYWORDS.items():
        # (?<![a-z0-9]) / (?![a-z0-9]) — the keyword must not be
        # immediately preceded or followed by a letter/digit. This
        # still allows symbol-containing keywords like "C++" or ".NET"
        # to match correctly, since symbols aren't alphanumeric.
        pattern = r"(?<![a-z0-9])" + re.escape(normalized_kw) + r"(?![a-z0-9])"
        if re.search(pattern, text_lower):
            found.add(canonical_kw)

    return found


# Loads once, locally — no API calls, no rate limits. Only the
# keyword-matching side is used by default; the embedding side is an
# additional signal in rank_jobs_hybrid() below.
_embedding_model = SentenceTransformer("all-MiniLM-L6-v2")


def _cosine_similarity(a, b) -> float:
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
    embeddings = _embedding_model.encode([resume_text, job_description])
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
    resume_set = {normalize_skill(s) for s in resume_skills}

    for job in jobs:
        description = job.get("description", "")
        job_skills = extract_skills_from_text(description)
        job_skills_normalized = {normalize_skill(s) for s in job_skills}

        matched = job_skills_normalized & resume_set
        missing = job_skills_normalized - resume_set
        keyword_score = (
            len(matched) / len(job_skills_normalized) * 100
            if job_skills_normalized else 0
        )

        semantic_score = _semantic_score(resume_skills, description)

        final_score = (keyword_score * keyword_weight) + (
            semantic_score * (1 - keyword_weight)
        )

        job["match_score"] = round(final_score)
        job["keyword_score"] = round(keyword_score)
        job["semantic_score"] = round(semantic_score)
        job["matched_skills"] = sorted(matched)
        job["missing_skills"] = sorted(missing)

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
        job["matched_skills"] = sorted(matched)
        job["missing_skills"] = sorted(missing)

    return sorted(jobs, key=lambda j: j["match_score"], reverse=True)


if __name__ == "__main__":
    import json
    fake_skills = ["C++", "Linux", "Embedded Systems", "C", "System Design"]
    results = search_jobs("Software Engineer", location="Virginia")
    ranked = rank_jobs_hybrid(fake_skills, results)
    print(json.dumps(ranked, indent=2))