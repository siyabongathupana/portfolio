<!-- AUTO-GENERATED FILE - DO NOT EDIT MANUALLY -->
<!-- Generated: {{ generated_date }} -->

<div align="center">

# ⚡ {{ user.name }}

### *{{ user.title }}*

[![GitHub followers](https://img.shields.io/github/followers/{{ user.username }}?style=for-the-badge&logo=github&color=2fc7ff)](https://github.com/{{ user.username }})
[![Portfolio](https://img.shields.io/badge/🌐_PORTFOLIO-2fc7ff?style=for-the-badge&logo=google-chrome&logoColor=white)](https://{{ user.username }}.github.io/portfolio/)
[![Email](https://img.shields.io/badge/📧_EMAIL-{{ user.email }}-red?style=for-the-badge&logo=gmail)](mailto:{{ user.email }})
[![LinkedIn](https://img.shields.io/badge/LINKEDIN-0077b5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/siyabonga-thupana-b94646217/)

</div>

---

<div align="center">

*{{ user.bio }}*

</div>

---

## 📊 **Live Portfolio Dashboard**

<div align="center">

| 🗂️ Projects | 🎓 Certifications | 👥 Users | ⏱️ Hours | 💰 Billable | 📊 Daily Avg |
|:-----------:|:----------------:|:--------:|:--------:|:-----------:|:------------:|
| **{{ stats.total_projects }}** | **{{ stats.total_certificates }}** | **{{ stats.total_users }}** | **{{ stats.total_hours }}** | **{{ stats.billable_hours }}** | **{{ stats.avg_daily_hours }}h** |

</div>

---

## 📈 **Performance Metrics**

<div align="center">

[![Productivity Score](https://img.shields.io/badge/🏆_PRODUCTIVITY_SCORE-{{ stats.productivity_score }}%25-2fc7ff?style=for-the-badge)](https://github.com/{{ user.username }}/portfolio)
[![Overtime Hours](https://img.shields.io/badge/⚡_OVERTIME-{{ stats.overtime_hours }}h-orange?style=for-the-badge)](https://github.com/{{ user.username }}/portfolio)
[![Active Days](https://img.shields.io/badge/📅_ACTIVE_DAYS-{{ stats.unique_days }}-green?style=for-the-badge)](https://github.com/{{ user.username }}/portfolio)
[![Billable Rate](https://img.shields.io/badge/💰_BILLABLE_RATE-{{ stats.productivity_rate }}%25-blue?style=for-the-badge)](https://github.com/{{ user.username }}/portfolio)

</div>

---

## 🔥 **Top Stats**

<table align="center">
<tr>
<td align="center" width="33%">
<h3>🎯 Top Category</h3>
<h2><code>{{ stats.top_category }}</code></h2>
</td>
<td align="center" width="33%">
<h3>⭐ Top Project</h3>
<h2><code>{{ stats.top_project }}</code></h2>
</td>
<td align="center" width="33%">
<h3>📊 Daily Average</h3>
<h2><code>{{ stats.avg_daily_hours }} hours</code></h2>
</td>
</tr>
</table>

---

## 📅 **Weekly Work Trends**

<div align="center">

| Week | Period | Total Hours | Billable | Target |
|------|--------|-------------|----------|--------|
{% for week in stats.weekly_trends %}
| {{ week.week }} | {{ week.start_date }} - {{ week.end_date }} | {{ week.total }}h | {{ week.billable }}h | {{ week.target }}h |
{% endfor %}

</div>

---

## 🕒 **Daily Average by Day**

<div align="center">

| Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday |
|:------:|:-------:|:---------:|:--------:|:------:|:--------:|:------:|
| {{ stats.daily_average_by_day.Monday }}h | {{ stats.daily_average_by_day.Tuesday }}h | {{ stats.daily_average_by_day.Wednesday }}h | {{ stats.daily_average_by_day.Thursday }}h | {{ stats.daily_average_by_day.Friday }}h | {{ stats.daily_average_by_day.Saturday }}h | {{ stats.daily_average_by_day.Sunday }}h |

</div>

---

## 🏗️ **Top Projects by Progress**

{% if projects_with_progress %}
{% for project in projects_with_progress %}
<details>
<summary><strong>{{ project.status_emoji }} {{ project.name }}</strong> – {{ project.client }} ({{ project.duration }})</summary>

```yaml
Status: {{ project.status }}
Progress: {{ project.progress }}% {{ '█' * (project.progress // 10) }}{{ '░' * (10 - (project.progress // 10)) }}
{% if project.controller %}Controller: {{ project.controller }}{% endif %}
{% if project.project_type %}Type: {{ project.project_type }}{% endif %}
Description: {{ project.description }}
