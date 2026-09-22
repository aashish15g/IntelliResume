"""
services/job_matcher.py

Searches Adzuna for job listings matching a given job title.
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

ADZUNA_APP_ID = os.environ.get("ADZUNA_APP_ID")
ADZUNA_API_KEY = os.environ.get("ADZUNA_API_KEY")
ADZUNA_COUNTRY = "us"  # adzuna splits its API by country — "us", "gb", etc.
ADZUNA_BASE_URL = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/1"


def search_jobs(job_title: str, results_count: int = 5) -> list:
    """
    Returns a list of job listing dicts, or an empty list on failure —
    matching the same "don't raise, return something the route can
    check" pattern as gemini_service.py's get_resume_feedback().
    """
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_API_KEY,
        "what": job_title,
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
            "salary_min": job.get("salary_min"),
            "salary_max": job.get("salary_max"),
            "url": job.get("redirect_url"),
        })

    return jobs


if __name__ == "__main__":
    # Quick manual test — run this file directly to check the pipeline
    # without needing Flask running at all.
    import json
    results = search_jobs("Software Engineer")
    print(json.dumps(results, indent=2))
  
   
   