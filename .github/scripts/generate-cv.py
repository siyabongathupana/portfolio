import json
import os
from datetime import datetime
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "users", "siyabongatshem@gmail.com")
PROJECTS_FILE = os.path.join(DATA_DIR, "projects.json")
CERTIFICATES_FILE = os.path.join(DATA_DIR, "certificates.json")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
OUTPUT_DIR = os.path.join(BASE_DIR, "generated")
OUTPUT_PDF = os.path.join(OUTPUT_DIR, "Siyabonga_Thupana_CV.pdf")
OUTPUT_HTML = os.path.join(OUTPUT_DIR, "cv.html")

# Load data
with open(PROJECTS_FILE, "r") as f:
    projects = json.load(f)
projects_list = list(projects.values())

with open(CERTIFICATES_FILE, "r") as f:
    certificates = json.load(f)

# Prepare template context
context = {
    "name": "Siyabonga Thupana",
    "title": "Automation & Control Engineer",
    "summary": "Experienced DeltaV DCS engineer with expertise in SIS, industrial automation, and cybersecurity.",
    "email": "siyabongatshem@gmail.com",
    "github": "https://github.com/siyabongathupana",
    "portfolio": "https://siyabongathupana.github.io/portfolio/",
    "projects": projects_list[:6],  # top 6 projects
    "certificates": certificates[:4],
    "skills": extract_skills(projects_list),
    "generated_date": datetime.now().strftime("%B %d, %Y")
}

def extract_skills(proj_list):
    skills = set()
    for proj in proj_list:
        if proj.get("controllerType"):
            skills.add(f"DeltaV {proj['controllerType']}")
        if proj.get("deltaVVersion"):
            skills.add(f"DeltaV {proj['deltaVVersion']}")
        if proj.get("projectType"):
            skills.add(proj["projectType"])
        if proj.get("technical"):
            tech = proj["technical"].get("technologies", "")
            for t in tech.split(","):
                skills.add(t.strip())
    return sorted(skills)[:12]

# Render template
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
template = env.get_template("cv_template.html")
html_output = template.render(context)

# Save HTML (optional, for debugging)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_output)

# Generate PDF
HTML(string=html_output).write_pdf(OUTPUT_PDF)

print(f"✅ CV generated at {OUTPUT_PDF}")
