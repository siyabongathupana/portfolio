#!/usr/bin/env python3
"""
Generate professional README.md from portfolio data with advanced features
Includes: contribution graph, activity feed, project progress, weekly trends
"""

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any

from jinja2 import Environment, FileSystemLoader
from dateutil import parser
import requests

# Configuration
REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data" / "users"
LOGS_DIR = REPO_ROOT / "data" / "users"
TEMPLATE_DIR = REPO_ROOT / "templates"
OUTPUT_FILE = REPO_ROOT / "README.md"

# Public profile email (the main portfolio owner)
PUBLIC_EMAIL = "siyabongatshem@gmail.com"
REPO_NAME = "siyabongathupana/portfolio"
GITHUB_USERNAME = "siyabongathupana"

def load_json_file(filepath):
    """Safely load JSON file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            if '"salt"' in content and '"iv"' in content and '"ciphertext"' in content:
                return None
            return json.loads(content)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

def load_user_data(email):
    """Load all data for a specific user"""
    user_dir = DATA_DIR / email
    if not user_dir.exists():
        return None
    
    projects = load_json_file(user_dir / "projects.json") or {}
    certificates = load_json_file(user_dir / "certificates.json") or []
    timesheet = load_json_file(user_dir / "timesheet.json") or []
    
    # Load latest logs (last 10 entries)
    logs = []
    logs_file = user_dir / "logs" / "activity.ndjson"
    if logs_file.exists():
        try:
            with open(logs_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()[:10]
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

def calculate_timesheet_stats(timesheet_entries):
    """Calculate comprehensive timesheet statistics"""
    if not timesheet_entries:
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
            "project_breakdown": {},
            "daily_average_by_day": {},
            "productivity_score": 0
        }
    
    total_hours = sum(e.get('hours', 0) for e in timesheet_entries)
    billable_hours = sum(e.get('hours', 0) for e in timesheet_entries if e.get('billable') == 'yes')
    non_billable_hours = total_hours - billable_hours
    
    unique_days = len(set(e.get('date', '') for e in timesheet_entries))
    avg_daily_hours = total_hours / unique_days if unique_days > 0 else 0
    
    # Calculate overtime (>8h/day)
    daily_hours = defaultdict(float)
    for e in timesheet_entries:
        daily_hours[e.get('date', '')] += e.get('hours', 0)
    overtime_hours = sum(max(0, h - 8) for h in daily_hours.values())
    
    # Find top category and project
    category_hours = defaultdict(float)
    project_hours = defaultdict(float)
    for e in timesheet_entries:
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
            e for e in timesheet_entries 
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
    
    # Category breakdown
    category_breakdown = dict(category_hours)
    
    # Project breakdown (top 5)
    project_breakdown = dict(sorted(project_hours.items(), key=lambda x: x[1], reverse=True)[:5])
    
    # Daily average by day of week
    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    daily_by_day = defaultdict(float)
    day_counts = defaultdict(int)
    for e in timesheet_entries:
        date = datetime.strptime(e.get('date', ''), '%Y-%m-%d')
        day_idx = date.weekday()
        daily_by_day[day_idx] += e.get('hours', 0)
        day_counts[day_idx] += 1
    
    daily_average_by_day = {
        day_names[i]: round(daily_by_day[i] / max(day_counts[i], 1), 1) 
        for i in range(7)
    }
    
    # Productivity score (billable percentage with bonus for consistency)
    base_score = (billable_hours / max(total_hours, 1)) * 100
    consistency_bonus = min(10, (unique_days / max(len(timesheet_entries), 1)) * 20)
    productivity_score = min(100, round(base_score + consistency_bonus))
    
    return {
        "total_hours": round(total_hours, 1),
        "billable_hours": round(billable_hours, 1),
        "non_billable_hours": round(non_billable_hours, 1),
        "unique_days": unique_days,
        "avg_daily_hours": round(avg_daily_hours, 1),
        "overtime_hours": round(overtime_hours, 1),
        "top_category": top_category,
        "top_project": top_project,
        "weekly_trends": weekly_trends,
        "category_breakdown": category_breakdown,
        "project_breakdown": project_breakdown,
        "daily_average_by_day": daily_average_by_day,
        "productivity_score": productivity_score
    }

def get_github_stats():
    """Get comprehensive GitHub repository statistics"""
    stats = {
        "stars": 0, "forks": 0, "watchers": 0, "open_issues": 0, 
        "size": 0, "language": "JavaScript", "license": "MIT",
        "created_at": "", "updated_at": "", "contributors": 0,
        "total_commits": 0, "active_branches": 0, "releases": 0
    }
    
    headers = {}
    if os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = f"token {os.environ['GITHUB_TOKEN']}"
    
    try:
        # Repository info
        api_url = f"https://api.github.com/repos/{REPO_NAME}"
        response = requests.get(api_url, headers=headers)
        if response.ok:
            data = response.json()
            stats.update({
                "stars": data.get('stargazers_count', 0),
                "forks": data.get('forks_count', 0),
                "watchers": data.get('watchers_count', 0),
                "open_issues": data.get('open_issues_count', 0),
                "size": data.get('size', 0),
                "language": data.get('language', 'JavaScript'),
                "license": data.get('license', {}).get('name', 'MIT'),
                "created_at": data.get('created_at', ''),
                "updated_at": data.get('updated_at', '')
            })
        
        # Contributors
        contributors_url = f"https://api.github.com/repos/{REPO_NAME}/contributors?per_page=1"
        resp = requests.get(contributors_url, headers=headers)
        if resp.ok and 'link' in resp.headers:
            import re
            match = re.search(r'page=(\d+)>; rel="last"', resp.headers['link'])
            if match:
                stats["contributors"] = int(match.group(1))
        
        # Commits (approximate)
        commits_url = f"https://api.github.com/repos/{REPO_NAME}/commits?per_page=1"
        resp = requests.get(commits_url, headers=headers)
        if resp.ok and 'link' in resp.headers:
            match = re.search(r'page=(\d+)>; rel="last"', resp.headers['link'])
            if match:
                stats["total_commits"] = int(match.group(1))
        
        # Releases
        releases_url = f"https://api.github.com/repos/{REPO_NAME}/releases"
        resp = requests.get(releases_url, headers=headers)
        if resp.ok:
            stats["releases"] = len(resp.json())
            
    except Exception as e:
        print(f"Could not fetch GitHub stats: {e}")
    
    return stats

def get_contribution_graph():
    """Generate a text-based contribution graph"""
    try:
        # Try to get actual contribution data from GitHub
        api_url = f"https://api.github.com/users/{GITHUB_USERNAME}/events"
        headers = {}
        if os.environ.get('GITHUB_TOKEN'):
            headers['Authorization'] = f"token {os.environ['GITHUB_TOKEN']}"
        
        response = requests.get(api_url, headers=headers)
        if response.ok:
            events = response.json()
            # Count contributions per day (last 52 weeks)
            from collections import Counter
            daily_contributions = Counter()
            for event in events:
                date = event.get('created_at', '')[:10]
                daily_contributions[date] += 1
            
            # Generate graph (last 7 days)
            graph = []
            for i in range(6, -1, -1):
                date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
                count = daily_contributions.get(date, 0)
                if count == 0:
                    graph.append("⬜")
                elif count < 3:
                    graph.append("🟩")
                elif count < 6:
                    graph.append("🟨")
                else:
                    graph.append("🟧")
            return " ".join(graph)
    except:
        pass
    
    # Return placeholder if API fails
    return "⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜"

def format_duration(seconds):
    """Format seconds into human readable duration"""
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m"
    else:
        return f"{seconds // 3600}h {(seconds % 3600) // 60}m"

def get_latest_activity(logs, limit=5):
    """Format latest activity for display"""
    activities = []
    for log in logs[:limit]:
        timestamp = log.get('timestamp', '')
        action = log.get('action', '')
        details = log.get('details', '')
        activities.append(f"- `{timestamp}` 🚀 **{action}**: {details[:80]}{'...' if len(details) > 80 else ''}")
    return activities

def calculate_project_progress(project):
    """Calculate project completion progress based on available data"""
    progress = 0
    if project.get('status') == 'Completed':
        progress = 100
    elif project.get('status') == 'Ongoing':
        progress = 60
    elif project.get('status') == 'Paused':
        progress = 30
    else:
        progress = 10
    
    # Add bonus for detailed description
    if project.get('description') and len(project.get('description', '')) > 100:
        progress = min(100, progress + 10)
    if project.get('shortDesc'):
        progress = min(100, progress + 5)
    if project.get('io') and any(project['io'].values()):
        progress = min(100, progress + 10)
    
    return progress

def get_project_status_emoji(status):
    """Get emoji for project status"""
    status_map = {
        'Completed': '✅',
        'Ongoing': '🔄',
        'Paused': '⏸️',
        'Planned': '📋'
    }
    return status_map.get(status, '📌')

def main():
    print("📊 Generating professional README from portfolio data...")
    
    # Load main user data
    user_data = load_user_data(PUBLIC_EMAIL)
    if not user_data:
        user_data = {
            "email": PUBLIC_EMAIL,
            "projects": {},
            "projects_list": [],
            "certificates": [],
            "timesheet": [],
            "logs": [],
            "project_count": 0,
            "certificate_count": 0
        }
    
    # Calculate all stats
    timesheet_stats = calculate_timesheet_stats(user_data.get('timesheet', []))
    github_stats = get_github_stats()
    contribution_graph = get_contribution_graph()
    latest_activity = get_latest_activity(user_data.get('logs', []), 5)
    
    # Prepare projects with progress
    projects_with_progress = []
    for proj in user_data.get('projects_list', []):
        projects_with_progress.append({
            "name": proj.get('title', 'Untitled'),
            "status": proj.get('status', 'Planned'),
            "status_emoji": get_project_status_emoji(proj.get('status', 'Planned')),
            "progress": calculate_project_progress(proj),
            "client": proj.get('client', 'Confidential'),
            "duration": proj.get('duration', 'N/A'),
            "description": (proj.get('shortDesc') or proj.get('description', ''))[:120],
            "controller": proj.get('controllerType', ''),
            "project_type": proj.get('projectType', '')
        })
    
    # Sort projects by progress
    projects_with_progress.sort(key=lambda x: x['progress'], reverse=True)
    
    # Count total users
    all_users = []
    if DATA_DIR.exists():
        all_users = [d.name for d in DATA_DIR.iterdir() if d.is_dir() and d.name != PUBLIC_EMAIL]
    
    # Get skill tags from projects
    all_skills = set()
    for proj in user_data.get('projects_list', []):
        if proj.get('controllerType'):
            all_skills.add(f"DeltaV {proj['controllerType']}")
        if proj.get('deltaVVersion'):
            all_skills.add(f"DeltaV {proj['deltaVVersion']}")
        if proj.get('projectType'):
            all_skills.add(proj['projectType'])
        if proj.get('technical'):
            tech = proj['technical'].get('technologies', '')
            for t in tech.split(','):
                if t.strip():
                    all_skills.add(t.strip())
    
    # Prepare template context
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
            "total_projects": user_data['project_count'],
            "total_certificates": user_data['certificate_count'],
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
            "category_breakdown": timesheet_stats['category_breakdown'],
            "project_breakdown": timesheet_stats['project_breakdown'],
            "daily_average_by_day": timesheet_stats['daily_average_by_day']
        },
        "projects_with_progress": projects_with_progress[:5],  # Top 5 by progress
        "featured_projects": user_data.get('projects_list', [])[:3],
        "recent_certificates": user_data.get('certificates', [])[:4],
        "github_stats": github_stats,
        "contribution_graph": contribution_graph,
        "latest_activity": latest_activity,
        "skills": sorted(list(all_skills))[:15],
        "has_data": user_data['project_count'] > 0,
        "version": "2.0.0"
    }
    
    # Load and render template
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    template = env.get_template("readme_template.md")
    readme_content = template.render(context)
    
    # Write the README file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(readme_content)
    
    print(f"✅ README generated successfully at {OUTPUT_FILE}")
    print(f"   📁 {context['stats']['total_projects']} projects")
    print(f"   🎓 {context['stats']['total_certificates']} certificates")
    print(f"   ⏱️ {context['stats']['total_hours']} hours logged")
    print(f"   👥 {context['stats']['total_users']} platform users")
    print(f"   🏆 {context['stats']['productivity_score']}% productivity score")

if __name__ == "__main__":
    main()
