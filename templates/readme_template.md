<!-- AUTO-GENERATED - DO NOT EDIT -->

<div align="center">

# ⚡ {{ user.name }}

### *{{ user.title }}*

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github)](https://github.com/{{ user.username }})
[![Portfolio](https://img.shields.io/badge/Portfolio-2fc7ff?style=for-the-badge&logo=google-chrome)](https://{{ user.username }}.github.io/portfolio/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail)](mailto:{{ user.email }})

</div>

---

<div align="center">

*{{ user.bio }}*

</div>

---

## 📊 Portfolio Dashboard

| Projects | Certifications | Users | Hours | Billable | Daily Avg |
|:--------:|:--------------:|:-----:|:-----:|:--------:|:---------:|
| {{ stats.total_projects }} | {{ stats.total_certificates }} | {{ stats.total_users }} | {{ stats.total_hours }} | {{ stats.billable_hours }} | {{ stats.avg_daily_hours }}h |

---

## 🎯 Top Stats

| Category | Value |
|----------|-------|
| Top Category | {{ stats.top_category }} |
| Top Project | {{ stats.top_project }} |
| Active Days | {{ stats.unique_days }} |

---

## 🏗️ Featured Projects

{% for project in projects_with_progress %}
- **{{ project.emoji }} {{ project.name }}** - {{ project.client }} ({{ project.duration }})
  - Status: {{ project.status }} | Progress: {{ project.progress }}%
  - {{ project.desc }}
{% endfor %}

---

## 🎓 Recent Certifications

{% for cert in recent_certificates %}
- **{{ cert.title }}** - {{ cert.issuer }} ({{ cert.date }})
{% endfor %}

---

## 📦 GitHub Stats

| Stars | Forks | Watchers | Issues | Contributors | Size |
|:-----:|:-----:|:--------:|:------:|:------------:|:----:|
| {{ github_stats.stars }} | {{ github_stats.forks }} | {{ github_stats.watchers }} | {{ github_stats.open_issues }} | {{ github_stats.contributors }} | {{ (github_stats.size / 1024)|round(1) }} MB |

**Language:** {{ github_stats.language }}

---

## 🛠️ Skills

{% for skill in skills %}
`{{ skill }}`
{% endfor %}

---

## 🚀 Quick Links

[![View Projects](https://img.shields.io/badge/View_Projects-2fc7ff?style=for-the-badge)](https://github.com/{{ user.username }}/portfolio)
[![Download CV](https://img.shields.io/badge/Download_CV-28a745?style=for-the-badge)](https://{{ user.username }}.github.io/portfolio/generated/Siyabonga_Thupana_CV.pdf)
[![Live Portfolio](https://img.shields.io/badge/Live_Portfolio-0b2b3b?style=for-the-badge)](https://{{ user.username }}.github.io/portfolio/)

---

<div align="center">

*Last updated: {{ generated_date }}*

</div>
