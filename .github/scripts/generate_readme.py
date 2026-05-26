#!/usr/bin/env python3
import json
import os
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import requests

try:
    from jinja2 import Environment, FileSystemLoader
    JINJA_AVAILABLE = True
except ImportError:
    JINJA_AVAILABLE = False
    print("Warning: jinja2 not installed, using fallback")

# IMPORTANT: Script is at .github/scripts/generate_readme.py
# So parent.parent gives us the repository root
REPO_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "users"
TEMPLATE_DIR = REPO_ROOT / "templates"
OUTPUT_FILE = REPO_ROOT / "README.md"

PUBLIC_EMAIL = "siyabongatshem@gmail.com"
REPO_NAME = "siyabongathupana/portfolio"
GITHUB_USERNAME = "siyabongathupana"

def load_json_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            if '"salt"' in content and '"iv"' in content:
                return None
            return json.loads(content)
    except Exception as e:
        return None

def load_user_data(email):
    user_dir = DATA_DIR / email
    if not user_dir.exists():
        print(f"User directory not found: {user_dir}")
        return None
    
    projects = load_json_file(user_dir / "projects.json") or {}
    certificates = load_json_file(user_dir / "certificates.json") or []
    timesheet = load_json_file(user_dir / "timesheet.json") or []
    
    return {
        "email": email,
        "projects": projects,
        "projects_list": list(projects.values()),
        "certificates": certificates,
        "timesheet": timesheet,
        "project_count": len(projects),
        "certificate_count": len(certificates)
    }

def calculate_stats(entries):
    if not entries:
        return {
            "total_hours": 0,
            "billable_hours": 0,
            "unique_days": 0,
            "avg_daily_hours": 0,
            "top_category": "N/A",
            "top_project": "N/A"
        }
    
    total = sum(e.get('hours', 0) for e in entries)
    billable = sum(e.get('hours', 0) for e in entries if e.get('billable') == 'yes')
    days = len(set(e.get('date', '') for e in entries))
    avg = round(total / days, 1) if days > 0 else 0
    
    cat = {}
    proj = {}
    for e in entries:
        category = e.get('category', 'Other')
        cat[category] = cat.get(category, 0) + e.get('hours', 0)
        project = e.get('project', 'Other')
        proj[project] = proj.get(project, 0) + e.get('hours', 0)
    
    top_cat = max(cat.items(), key=lambda x: x[1])[0] if cat else "N/A"
    top_proj = max(proj.items(), key=lambda x: x[1])[0] if proj else "N/A"
    
    return {
        "total_hours": round(total, 1),
        "billable_hours": round(billable, 1),
        "unique_days": days,
        "avg_daily_hours": avg,
        "top_category": top_cat,
        "top_project": top_proj
    }

def get_github_stats():
    stats = {
        "stars": 0,
        "forks": 0,
        "watchers": 0,
        "open_issues": 0,
        "size": 0,
        "language": "N/A",
        "contributors": 0
    }
    
    headers = {}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = f'token {token}'
    
    try:
        resp = requests.get(f'https://api.github.com/repos/{REPO_NAME}', headers=headers, timeout=10)
        if resp.ok:
            d = resp.json()
            stats = {
                "stars": d.get('stargazers_count', 0),
                "forks": d.get('forks_count', 0),
                "watchers": d.get('watchers_count', 0),
                "open_issues": d.get('open_issues_count', 0),
                "size": d.get('size', 0),
                "language": d.get('language', 'N/A'),
                "contributors": 0
            }
    except Exception as e:
        print(f"Error fetching GitHub stats: {e}")
    
    return stats

def get_progress(project):
    status = project.get('status', 'Planned')
    if status == 'Completed':
        return 100
    elif status == 'Ongoing':
        return 60
    elif status == 'Paused':
        return 30
    return 10

def get_emoji(status):
    m = {'Completed': '✅', 'Ongoing': '🔄', 'Paused': '⏸️', 'Planned': '📋'}
    return m.get(status, '📌')

def generate_readme_fallback(context):
    content = f"""<!-- AUTO-GENERATED - DO NOT EDIT -->

<div align="center">

# ⚡ {context['user']['name']}

### *{context['user']['title']}*

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github)](https://github.com/{context['user']['username']})
[![Portfolio](https://img.shields.io/badge/Portfolio-2fc7ff?style=for-the-badge&logo=google-chrome)](https://{context['user']['username']}.github.io/portfolio/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail)](mailto:{context['user']['email']})

</div>

---

<div align="center">

*{context['user']['bio']}*

</div>

---

## 📊 Portfolio Dashboard

| Projects | Certifications | Users | Hours | Billable | Daily Avg |
|:--------:|:--------------:|:-----:|:-----:|:--------:|:---------:|
| {context['stats']['total_projects']} | {context['stats']['total_certificates']} | {context['stats']['total_users']} | {context['stats']['total_hours']} | {context['stats']['billable_hours']} | {context['stats']['avg_daily_hours']}h |

---

## 🎯 Top Stats

| Category | Value |
|----------|-------|
| Top Category | {context['stats']['top_category']} |
| Top Project | {context['stats']['top_project']} |
| Active Days | {context['stats']['unique_days']} |

---

## 🏗️ Featured Projects

"""
    for project in context['projects_with_progress']:
        content += f"- **{project['emoji']} {project['name']}** - {project['client']} ({project['duration']})\n"
        content += f"  - Status: {project['status']} | Progress: {project['progress']}%\n"
        content += f"  - {project['desc']}\n\n"
    
    content += "---\n\n## 🎓 Recent Certifications\n\n"
    for cert in context['recent_certificates']:
        content += f"- **{cert['title']}** - {cert['issuer']} ({cert['date']})\n"
    
    content += f"""
---

## 📦 GitHub Stats

| Stars | Forks | Watchers | Issues | Contributors | Size |
|:-----:|:-----:|:--------:|:------:|:------------:|:----:|
| {context['github_stats']['stars']} | {context['github_stats']['forks']} | {context['github_stats']['watchers']} | {context['github_stats']['open_issues']} | {context['github_stats']['contributors']} | {(context['github_stats']['size'] / 1024)|round(1)} MB |

**Language:** {context['github_stats']['language']}

---

## 🛠️ Skills

"""
    for skill in context['skills']:
        content += f"`{skill}` "
    
    content += f"""

---

## 🚀 Quick Links

[![View Projects](https://img.shields.io/badge/View_Projects-2fc7ff?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)
[![Download CV](https://img.shields.io/badge/Download_CV-28a745?style=for-the-badge)](https://{context['user']['username']}.github.io/portfolio/generated/Siyabonga_Thupana_CV.pdf)
[![Live Portfolio](https://img.shields.io/badge/Live_Portfolio-0b2b3b?style=for-the-badge)](https://{context['user']['username']}.github.io/portfolio/)

---

<div align="center">

*Last updated: {context['generated_date']}*

</div>
"""
    return content

def main():
    print("Generating README...")
    print(f"Current directory: {Path.cwd()}")
    print(f"Script location: {Path(__file__)}")
    print(f"Repository root: {REPO_ROOT}")
    print(f"Templates directory: {TEMPLATE_DIR}")
    print(f"Does templates dir exist? {TEMPLATE_DIR.exists()}")
    
    data = load_user_data(PUBLIC_EMAIL)
    if not data:
        print(f"No data found for {PUBLIC_EMAIL}, using defaults")
        data = {
            "project_count": 0,
            "certificate_count": 0,
            "projects_list": [],
            "certificates": [],
            "timesheet": []
        }
    
    stats = calculate_stats(data.get('timesheet', []))
    github = get_github_stats()
    
    projects = []
    for p in data.get('projects_list', [])[:5]:
        projects.append({
            "name": p.get('title', 'Untitled'),
            "status": p.get('status', 'Planned'),
            "emoji": get_emoji(p.get('status', 'Planned')),
            "progress": get_progress(p),
            "client": p.get('client', 'Confidential'),
            "duration": p.get('duration', 'N/A'),
            "desc": (p.get('shortDesc') or p.get('description', ''))[:100]
        })
    
    all_users = []
    if DATA_DIR.exists():
        all_users = [d.name for d in DATA_DIR.iterdir() if d.is_dir() and d.name != PUBLIC_EMAIL]
    
    skills = set()
    for p in data.get('projects_list', []):
        if p.get('controllerType'):
            skills.add(f"DeltaV {p['controllerType']}")
        if p.get('projectType'):
            skills.add(p['projectType'])
        if p.get('technical') and p.get('technical').get('technologies'):
            for tech in p['technical']['technologies'].split(','):
                if tech.strip():
                    skills.add(tech.strip())
    
    context = {
        "generated_date": datetime.now().strftime("%B %d, %Y at %H:%M:%S"),
        "user": {
            "name": "Siyabonga Thupana",
            "email": PUBLIC_EMAIL,
            "username": GITHUB_USERNAME,
            "title": "Automation & Control Engineer",
            "bio": "DeltaV DCS engineer with expertise in SIS, industrial automation, and cybersecurity."
        },
        "stats": {
            "total_projects": data['project_count'],
            "total_certificates": data['certificate_count'],
            "total_users": len(all_users) + 1,
            "total_hours": stats['total_hours'],
            "billable_hours": stats['billable_hours'],
            "unique_days": stats['unique_days'],
            "avg_daily_hours": stats['avg_daily_hours'],
            "top_category": stats['top_category'],
            "top_project": stats['top_project']
        },
        "github_stats": github,
        "projects_with_progress": projects,
        "recent_certificates": data.get('certificates', [])[:3],
        "skills": sorted(list(skills))[:10]
    }
    
    if JINJA_AVAILABLE and TEMPLATE_DIR.exists():
        try:
            env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
            template = env.get_template("readme_template.md")
            readme_content = template.render(context)
            print("Using Jinja2 template")
        except Exception as e:
            print(f"Jinja2 template error: {e}, using fallback")
            readme_content = generate_readme_fallback(context)
    else:
        print("Using fallback markdown generation")
        readme_content = generate_readme_fallback(context)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(readme_content)
    
    print(f"README generated successfully at {OUTPUT_FILE}")
    print(f"  Projects: {context['stats']['total_projects']}")
    print(f"  Certificates: {context['stats']['total_certificates']}")
    print(f"  Total Hours: {context['stats']['total_hours']}")

if __name__ == "__main__":
    main()
