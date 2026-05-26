#!/usr/bin/env python3
"""
Professional README Generator for Portfolio
Generates a beautiful, data-rich README.md from live portfolio data
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import requests

try:
    from jinja2 import Environment, FileSystemLoader
    JINJA_AVAILABLE = True
except ImportError:
    JINJA_AVAILABLE = False
    print("Warning: jinja2 not installed, using fallback")

# Path configuration
REPO_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "users"
TEMPLATE_DIR = REPO_ROOT / "templates"
OUTPUT_FILE = REPO_ROOT / "README.md"

# Configuration
PUBLIC_EMAIL = "siyabongatshem@gmail.com"
REPO_NAME = "siyabongathupana/portfolio"
GITHUB_USERNAME = "siyabongathupana"

# Color codes for console output
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RED = '\033[91m'
RESET = '\033[0m'

def log_info(msg):
    print(f"{BLUE}ℹ️ {msg}{RESET}")

def log_success(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def log_warning(msg):
    print(f"{YELLOW}⚠️ {msg}{RESET}")

def log_error(msg):
    print(f"{RED}❌ {msg}{RESET}")

def load_json_file(filepath):
    """Safely load JSON file, ignoring encrypted files"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Skip encrypted files (contain salt, iv, ciphertext)
            if '"salt"' in content and '"iv"' in content and '"ciphertext"' in content:
                return None
            return json.loads(content)
    except Exception as e:
        return None

def load_user_data(email):
    """Load all data for a specific user"""
    user_dir = DATA_DIR / email
    if not user_dir.exists():
        log_warning(f"User directory not found: {user_dir}")
        return None
    
    log_info(f"Loading data for {email}")
    projects = load_json_file(user_dir / "projects.json") or {}
    certificates = load_json_file(user_dir / "certificates.json") or []
    timesheet = load_json_file(user_dir / "timesheet.json") or []
    
    # Load recent activity logs (last 5 entries)
    logs = []
    logs_file = user_dir / "logs" / "activity.ndjson"
    if logs_file.exists():
        try:
            with open(logs_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()[:5]
                for line in lines:
                    try:
                        logs.append(json.loads(line.strip()))
                    except:
                        pass
        except:
            pass
    
    return {
        "email": email,
        "projects": projects,
        "projects_list": list(projects.values()),
        "certificates": certificates,
        "timesheet": timesheet,
        "logs": logs,
        "project_count": len(projects),
        "certificate_count": len(certificates)
    }

def calculate_timesheet_stats(entries):
    """Calculate comprehensive timesheet statistics"""
    if not entries:
        return {
            "total_hours": 0,
            "billable_hours": 0,
            "non_billable_hours": 0,
            "unique_days": 0,
            "avg_daily_hours": 0,
            "overtime_hours": 0,
            "top_category": "N/A",
            "top_project": "N/A",
            "weekly_trends": [],
            "category_breakdown": {},
            "productivity_score": 0
        }
    
    total_hours = sum(e.get('hours', 0) for e in entries)
    billable_hours = sum(e.get('hours', 0) for e in entries if e.get('billable') == 'yes')
    non_billable_hours = total_hours - billable_hours
    unique_days = len(set(e.get('date', '') for e in entries))
    avg_daily_hours = round(total_hours / unique_days, 1) if unique_days > 0 else 0
    
    # Calculate overtime (>8 hours/day)
    daily_hours = defaultdict(float)
    for e in entries:
        daily_hours[e.get('date', '')] += e.get('hours', 0)
    overtime_hours = sum(max(0, h - 8) for h in daily_hours.values())
    
    # Category breakdown
    category_hours = defaultdict(float)
    project_hours = defaultdict(float)
    for e in entries:
        category_hours[e.get('category', 'Other')] += e.get('hours', 0)
        project_hours[e.get('project', 'Other')] += e.get('hours', 0)
    
    top_category = max(category_hours.items(), key=lambda x: x[1])[0] if category_hours else "N/A"
    top_project = max(project_hours.items(), key=lambda x: x[1])[0] if project_hours else "N/A"
    
    # Weekly trends (last 4 weeks)
    weekly_trends = []
    now = datetime.now()
    for w in range(4):
        week_start = now - timedelta(days=now.weekday() + (w * 7))
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=6)
        
        week_entries = [
            e for e in entries 
            if week_start <= datetime.strptime(e.get('date', ''), '%Y-%m-%d') <= week_end
        ]
        week_total = sum(e.get('hours', 0) for e in week_entries)
        week_billable = sum(e.get('hours', 0) for e in week_entries if e.get('billable') == 'yes')
        
        weekly_trends.append({
            "week": f"Week {w+1}",
            "start_date": week_start.strftime('%b %d'),
            "end_date": week_end.strftime('%b %d'),
            "total": round(week_total, 1),
            "billable": round(week_billable, 1),
            "target": 40
        })
    weekly_trends.reverse()
    
    # Productivity score (0-100)
    base_score = (billable_hours / max(total_hours, 1)) * 100
    consistency_bonus = min(10, (unique_days / max(len(entries), 1)) * 20)
    productivity_score = min(100, round(base_score + consistency_bonus))
    
    return {
        "total_hours": round(total_hours, 1),
        "billable_hours": round(billable_hours, 1),
        "non_billable_hours": round(non_billable_hours, 1),
        "unique_days": unique_days,
        "avg_daily_hours": avg_daily_hours,
        "overtime_hours": round(overtime_hours, 1),
        "top_category": top_category,
        "top_project": top_project,
        "weekly_trends": weekly_trends,
        "category_breakdown": dict(category_hours),
        "productivity_score": productivity_score
    }

def get_github_stats():
    """Fetch comprehensive GitHub repository statistics"""
    stats = {
        "stars": 0,
        "forks": 0,
        "watchers": 0,
        "open_issues": 0,
        "size": 0,
        "language": "N/A",
        "license": "MIT",
        "created_at": "",
        "updated_at": "",
        "contributors": 0,
        "releases": 0
    }
    
    headers = {}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = f'token {token}'
    
    try:
        # Repository info
        resp = requests.get(f'https://api.github.com/repos/{REPO_NAME}', headers=headers, timeout=10)
        if resp.ok:
            d = resp.json()
            stats.update({
                "stars": d.get('stargazers_count', 0),
                "forks": d.get('forks_count', 0),
                "watchers": d.get('watchers_count', 0),
                "open_issues": d.get('open_issues_count', 0),
                "size": d.get('size', 0),
                "language": d.get('language', 'N/A'),
                "license": d.get('license', {}).get('name', 'MIT'),
                "created_at": d.get('created_at', '')[:10],
                "updated_at": d.get('updated_at', '')[:10]
            })
        
        # Contributors count
        resp = requests.get(f'https://api.github.com/repos/{REPO_NAME}/contributors?per_page=1', headers=headers, timeout=10)
        if resp.ok and 'link' in resp.headers:
            import re
            match = re.search(r'page=(\d+)>; rel="last"', resp.headers['link'])
            if match:
                stats["contributors"] = int(match.group(1))
        
        # Releases count
        resp = requests.get(f'https://api.github.com/repos/{REPO_NAME}/releases', headers=headers, timeout=10)
        if resp.ok:
            stats["releases"] = len(resp.json())
            
    except Exception as e:
        log_warning(f"Could not fetch GitHub stats: {e}")
    
    return stats

def get_contribution_graph():
    """Generate a text-based contribution graph (last 7 days)"""
    try:
        headers = {}
        token = os.environ.get('GITHUB_TOKEN')
        if token:
            headers['Authorization'] = f'token {token}'
        
        resp = requests.get(f'https://api.github.com/users/{GITHUB_USERNAME}/events', headers=headers, timeout=10)
        if resp.ok:
            events = resp.json()
            from collections import Counter
            daily = Counter()
            for event in events:
                date = event.get('created_at', '')[:10]
                daily[date] += 1
            
            graph = []
            day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            for i in range(6, -1, -1):
                date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
                count = daily.get(date, 0)
                if count == 0:
                    graph.append("⬜")
                elif count < 3:
                    graph.append("🟩")
                elif count < 6:
                    graph.append("🟨")
                elif count < 10:
                    graph.append("🟧")
                else:
                    graph.append("🟥")
            return " ".join(graph)
    except:
        pass
    
    return "⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜"

def format_latest_activity(logs, limit=5):
    """Format latest activity for display"""
    activities = []
    for log in logs[:limit]:
        timestamp = log.get('timestamp', '')[:16]
        action = log.get('action', '').replace('_', ' ').title()
        details = log.get('details', '')[:60]
        if details:
            activities.append(f"- `{timestamp}` 🚀 **{action}**: {details}")
        else:
            activities.append(f"- `{timestamp}` 🚀 **{action}**")
    return activities

def calculate_project_progress(project):
    """Calculate project completion progress"""
    status = project.get('status', 'Planned')
    if status == 'Completed':
        base = 100
    elif status == 'Ongoing':
        base = 60
    elif status == 'Paused':
        base = 30
    else:
        base = 10
    
    # Add bonus for detailed information
    if project.get('description') and len(project.get('description', '')) > 100:
        base = min(100, base + 10)
    if project.get('shortDesc'):
        base = min(100, base + 5)
    if project.get('io') and any(project['io'].values()):
        base = min(100, base + 10)
    if project.get('selectedImages') and len(project.get('selectedImages', [])) > 0:
        base = min(100, base + 5)
    
    return base

def get_project_status_emoji(status):
    """Get emoji for project status"""
    emojis = {
        'Completed': '✅',
        'Ongoing': '🔄',
        'Paused': '⏸️',
        'Planned': '📋'
    }
    return emojis.get(status, '📌')

def get_project_type_badge(project):
    """Get badge for project type"""
    if project.get('controllerType') or project.get('projectCategory') == 'deltaV':
        return "DeltaV"
    return "General"

def extract_skills_from_projects(projects_list):
    """Extract unique skills from all projects"""
    skills = set()
    for proj in projects_list:
        if proj.get('controllerType'):
            skills.add(f"DeltaV {proj['controllerType']}")
        if proj.get('deltaVVersion'):
            skills.add(f"DeltaV {proj['deltaVVersion']}")
        if proj.get('projectType'):
            skills.add(proj['projectType'])
        if proj.get('technical'):
            tech = proj['technical'].get('technologies', '')
            for t in tech.split(','):
                if t.strip():
                    skills.add(t.strip())
            lang = proj['technical'].get('languages', '')
            for l in lang.split(','):
                if l.strip():
                    skills.add(l.strip())
        if proj.get('industry'):
            skills.add(proj['industry'])
    return sorted(list(skills))[:15]

def get_project_completion_stats(projects_list):
    """Get project completion statistics"""
    completed = sum(1 for p in projects_list if p.get('status') == 'Completed')
    ongoing = sum(1 for p in projects_list if p.get('status') == 'Ongoing')
    paused = sum(1 for p in projects_list if p.get('status') == 'Paused')
    planned = sum(1 for p in projects_list if p.get('status') == 'Planned')
    return {"completed": completed, "ongoing": ongoing, "paused": paused, "planned": planned}

def generate_progress_bar(percentage, width=10):
    """Generate a text-based progress bar"""
    filled = int(width * percentage / 100)
    empty = width - filled
    return f"{'█' * filled}{'░' * empty}"

def main():
    log_info("Starting README generation...")
    log_info(f"Repository root: {REPO_ROOT}")
    log_info(f"Data directory: {DATA_DIR}")
    log_info(f"Templates directory: {TEMPLATE_DIR}")
    
    # Load user data
    data = load_user_data(PUBLIC_EMAIL)
    if not data:
        log_warning(f"No data found for {PUBLIC_EMAIL}, using defaults")
        data = {
            "project_count": 0,
            "certificate_count": 0,
            "projects_list": [],
            "certificates": [],
            "timesheet": [],
            "logs": []
        }
    
    log_success(f"Loaded {data['project_count']} projects, {data['certificate_count']} certificates")
    
    # Calculate statistics
    timesheet_stats = calculate_timesheet_stats(data.get('timesheet', []))
    github_stats = get_github_stats()
    contribution_graph = get_contribution_graph()
    latest_activity = format_latest_activity(data.get('logs', []), 5)
    skills = extract_skills_from_projects(data.get('projects_list', []))
    completion_stats = get_project_completion_stats(data.get('projects_list', []))
    
    # Prepare projects for display
    projects_with_progress = []
    for proj in data.get('projects_list', [])[:6]:
        projects_with_progress.append({
            "name": proj.get('title', 'Untitled'),
            "status": proj.get('status', 'Planned'),
            "status_emoji": get_project_status_emoji(proj.get('status', 'Planned')),
            "type_badge": get_project_type_badge(proj),
            "progress": calculate_project_progress(proj),
            "progress_bar": generate_progress_bar(calculate_project_progress(proj)),
            "client": proj.get('client', 'Confidential'),
            "duration": proj.get('duration', 'N/A'),
            "description": (proj.get('shortDesc') or proj.get('description', ''))[:120],
            "controller": proj.get('controllerType', ''),
            "project_type": proj.get('projectType', ''),
            "has_images": len(proj.get('selectedImages', [])) > 0
        })
    
    # Count total users (excluding public profile)
    all_users = []
    if DATA_DIR.exists():
        all_users = [d.name for d in DATA_DIR.iterdir() if d.is_dir() and d.name != PUBLIC_EMAIL]
    
    # Prepare context for template
    context = {
        "generated_date": datetime.now().strftime("%B %d, %Y at %H:%M:%S UTC"),
        "current_year": datetime.now().year,
        "user": {
            "name": "Siyabonga Thupana",
            "email": PUBLIC_EMAIL,
            "username": GITHUB_USERNAME,
            "title": "Automation & Control Engineer",
            "bio": "Experienced DeltaV DCS engineer with expertise in SIS, industrial automation, and cybersecurity. Passionate about building intelligent automation solutions and bridging the gap between complex engineering and seamless user experiences."
        },
        "stats": {
            "total_projects": data['project_count'],
            "total_certificates": data['certificate_count'],
            "total_users": len(all_users) + 1,
            "total_hours": timesheet_stats['total_hours'],
            "billable_hours": timesheet_stats['billable_hours'],
            "non_billable_hours": timesheet_stats['non_billable_hours'],
            "productivity_rate": round((timesheet_stats['billable_hours'] / max(timesheet_stats['total_hours'], 1)) * 100, 1),
            "productivity_score": timesheet_stats['productivity_score'],
            "avg_daily_hours": timesheet_stats['avg_daily_hours'],
            "overtime_hours": timesheet_stats['overtime_hours'],
            "top_category": timesheet_stats['top_category'],
            "top_project": timesheet_stats['top_project'],
            "unique_days": timesheet_stats['unique_days'],
            "weekly_trends": timesheet_stats['weekly_trends'],
            "category_breakdown": timesheet_stats['category_breakdown']
        },
        "completion_stats": completion_stats,
        "projects_with_progress": projects_with_progress,
        "recent_certificates": data.get('certificates', [])[:4],
        "github_stats": github_stats,
        "contribution_graph": contribution_graph,
        "latest_activity": latest_activity,
        "skills": skills,
        "total_skills": len(skills),
        "has_data": data['project_count'] > 0,
        "version": "2.0.0"
    }
    
    # Generate README using template
    if JINJA_AVAILABLE and TEMPLATE_DIR.exists():
        try:
            env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
            template = env.get_template("readme_template.md")
            readme_content = template.render(context)
            log_success("README generated using Jinja2 template")
        except Exception as e:
            log_error(f"Jinja2 template error: {e}")
            log_info("Using fallback generation...")
            readme_content = generate_fallback_readme(context)
    else:
        log_info("Jinja2 not available, using fallback generation")
        readme_content = generate_fallback_readme(context)
    
    # Write README file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(readme_content)
    
    log_success(f"README generated successfully at {OUTPUT_FILE}")
    log_info(f"📁 Projects: {context['stats']['total_projects']}")
    log_info(f"🎓 Certificates: {context['stats']['total_certificates']}")
    log_info(f"⏱️ Total Hours: {context['stats']['total_hours']}")
    log_info(f"👥 Platform Users: {context['stats']['total_users']}")
    log_info(f"🏆 Productivity Score: {context['stats']['productivity_score']}%")
    log_info(f"🛠️ Skills Extracted: {context['total_skills']}")

def generate_fallback_readme(context):
    """Fallback markdown generation if Jinja2 is not available"""
    # Build projects section
    projects_section = ""
    for p in context['projects_with_progress']:
        projects_section += f"""<details>
<summary><strong>{p['status_emoji']} {p['name']}</strong> – {p['client']} ({p['duration']})</summary>

- **Status:** {p['status']}
- **Progress:** {p['progress']}% `{p['progress_bar']}`
- **Type:** {p['type_badge']}
- **Description:** {p['description']}

</details>

"""
    
    # Build weekly trends table
    weekly_table = ""
    for w in context['stats']['weekly_trends']:
        weekly_table += f"| {w['week']} | {w['start_date']}-{w['end_date']} | {w['total']}h | {w['billable']}h | {w['target']}h |\n"
    
    # Build skills section
    skills_section = " ".join([f"`{s}`" for s in context['skills']])
    
    content = f"""<!-- AUTO-GENERATED - DO NOT EDIT -->
<!-- Generated: {context['generated_date']} -->

<div align="center">

# ⚡ {context['user']['name']}

### *{context['user']['title']}*

[![GitHub followers](https://img.shields.io/github/followers/{context['user']['username']}?style=for-the-badge&logo=github&color=2fc7ff)](https://github.com/{context['user']['username']})
[![Portfolio](https://img.shields.io/badge/🌐_PORTFOLIO-2fc7ff?style=for-the-badge&logo=google-chrome)](https://{context['user']['username']}.github.io/portfolio/)
[![Email](https://img.shields.io/badge/📧_EMAIL-{context['user']['email']}-red?style=for-the-badge&logo=gmail)](mailto:{context['user']['email']})

</div>

---

<div align="center">

*{context['user']['bio']}*

</div>

---

## 📊 Live Portfolio Dashboard

<div align="center">

| 🗂️ Projects | 🎓 Certifications | 👥 Users | ⏱️ Hours | 💰 Billable | 📊 Daily Avg |
|:-----------:|:----------------:|:--------:|:--------:|:-----------:|:------------:|
| **{context['stats']['total_projects']}** | **{context['stats']['total_certificates']}** | **{context['stats']['total_users']}** | **{context['stats']['total_hours']}** | **{context['stats']['billable_hours']}** | **{context['stats']['avg_daily_hours']}h** |

</div>

---

## 📈 Performance Metrics

<div align="center">

[![Productivity Score](https://img.shields.io/badge/🏆_PRODUCTIVITY_SCORE-{context['stats']['productivity_score']}%25-2fc7ff?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)
[![Overtime Hours](https://img.shields.io/badge/⚡_OVERTIME-{context['stats']['overtime_hours']}h-orange?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)
[![Active Days](https://img.shields.io/badge/📅_ACTIVE_DAYS-{context['stats']['unique_days']}-green?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)
[![Billable Rate](https://img.shields.io/badge/💰_BILLABLE_RATE-{context['stats']['productivity_rate']}%25-blue?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)

</div>

---

## 🔥 Top Stats

<table align="center">
<tr>
<td align="center" width="33%">
<h3>🎯 Top Category</h3>
<h2><code>{context['stats']['top_category']}</code></h2>
</td>
<td align="center" width="33%">
<h3>⭐ Top Project</h3>
<h2><code>{context['stats']['top_project']}</code></h2>
</td>
<td align="center" width="33%">
<h3>📊 Daily Average</h3>
<h2><code>{context['stats']['avg_daily_hours']} hours</code></h2>
</td>
</tr>
</table>

---

## 📅 Weekly Work Trends

<div align="center">

| Week | Period | Total Hours | Billable | Target |
|------|--------|-------------|----------|--------|
{weekly_table}

</div>

---

## 🏗️ Featured Projects

{projects_section if projects_section else '*No projects available yet.*'}

---

## 🎓 Recent Certifications

<div align="center">

| Certificate | Issuer | Date |
|-------------|--------|------|
"""
    for cert in context['recent_certificates']:
        content += f"| {cert['title']} | {cert['issuer']} | {cert['date']} |\n"
    
    content += f"""
</div>

---

## 📦 GitHub Repository Stats

<div align="center">

| ⭐ Stars | 🍴 Forks | 👁️ Watchers | 🐛 Issues | 👥 Contributors | 📦 Size |
|:--------:|:--------:|:-----------:|:---------:|:---------------:|:-------:|
| {context['github_stats']['stars']} | {context['github_stats']['forks']} | {context['github_stats']['watchers']} | {context['github_stats']['open_issues']} | {context['github_stats']['contributors']} | {(context['github_stats']['size'] / 1024)|round(1)} MB |

</div>

<div align="center">

**Primary Language:** `{context['github_stats']['language']}` | **License:** `{context['github_stats']['license']}` | **Releases:** `{context['github_stats']['releases']}`

</div>

---

## 📊 Recent Contribution Activity

<div align="center">

{context['contribution_graph']}

</div>

---

## 📝 Latest Activity

"""
    for activity in context['latest_activity']:
        content += f"{activity}\n"
    
    content += f"""

---

## 🛠️ Core Competencies

<div align="center">

{skills_section}

</div>

---

## 🎯 Project Completion Overview

<div align="center">

<table>
<tr>
<td align="center" width="25%">
<h3>✅ Completed</h3>
<h1>{context['completion_stats']['completed']}</h1>
</td>
<td align="center" width="25%">
<h3>🔄 Ongoing</h3>
<h1>{context['completion_stats']['ongoing']}</h1>
</td>
<td align="center" width="25%">
<h3>⏸️ Paused</h3>
<h1>{context['completion_stats']['paused']}</h1>
</td>
<td align="center" width="25%">
<h3>📋 Planned</h3>
<h1>{context['completion_stats']['planned']}</h1>
</td>
</tr>
</table>

</div>

---

## 🚀 Quick Actions

<div align="center">

[![View Projects](https://img.shields.io/badge/📁_VIEW_ALL_PROJECTS-2fc7ff?style=for-the-badge)](https://github.com/{context['user']['username']}/portfolio)
[![Download CV](https://img.shields.io/badge/📄_DOWNLOAD_CV-28a745?style=for-the-badge)](https://{context['user']['username']}.github.io/portfolio/generated/Siyabonga_Thupana_CV.pdf)
[![Visit Portfolio](https://img.shields.io/badge/🌐_LIVE_PORTFOLIO-0b2b3b?style=for-the-badge)](https://{context['user']['username']}.github.io/portfolio/)

</div>

---

## 📬 Connect & Collaborate

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github)](https://github.com/{context['user']['username']})
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail)](mailto:{context['user']['email']})
[![Portfolio](https://img.shields.io/badge/Portfolio-2fc7ff?style=for-the-badge&logo=google-chrome)](https://{context['user']['username']}.github.io/portfolio/)

</div>

---

<div align="center">

---

*This README is automatically generated from live portfolio data.*  
*Last updated: {context['generated_date']}*

</div>
"""
    return content

if __name__ == "__main__":
    main()
