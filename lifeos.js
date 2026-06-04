// lifeos.js – Smart Life OS (Self‑Contained Encryption, No shared.js helpers needed)
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = "login.html?redirect=lifeos";
    return;
  }

  // ======================== SELF-CONTAINED ENCRYPTION HELPERS ========================
  async function encryptDataBlob(obj, passphrase) {
    const json = JSON.stringify(obj);
    const encrypted = await window.CryptoUtil.encrypt(json, passphrase);
    return encrypted; // { salt, iv, ciphertext }
  }

  async function decryptDataBlob(encryptedBlob, passphrase) {
    const decrypted = await window.CryptoUtil.decrypt(encryptedBlob, passphrase);
    return JSON.parse(decrypted);
  }

  async function getUserEncryptionKey() {
    if (!window._userPassphrase) {
      const stored = sessionStorage.getItem('portfolioPassphrase');
      if (stored) {
        try {
          window._userPassphrase = atob(stored);
          console.log("✅ Passphrase restored from sessionStorage");
          return window._userPassphrase;
        } catch(e) {}
      }
      const pwd = prompt("🔐 Enter your passphrase to access Smart Life OS data:", "");
      if (!pwd) throw new Error('Passphrase required');
      window._userPassphrase = pwd;
      sessionStorage.setItem('portfolioPassphrase', btoa(pwd));
    }
    return window._userPassphrase;
  }

  function getUserDataPath(username, filename) {
    const { dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    return `${dataPath}/users/${encUser}/${filename}`;
  }

  // ======================== DATA STORAGE ========================
  let tasks = [];
  let goals = [];
  let currentDate = new Date();
  let weeklyChart = null;
  let isLoading = false;

  function getUserFirstName() {
    if (!user) return "Guest";
    const email = user.username;
    const namePart = email.split('@')[0];
    const firstPart = namePart.split('.')[0];
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  }

  async function loadFromGitHub() {
    isLoading = true;
    window.showLoading("Loading your Smart Life OS data...");
    try {
      const { owner, repo, branch } = window.REPO_CONFIG;
      const path = getUserDataPath(user.username, 'lifeos.json');
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      let data = { tasks: [], goals: [] };
      if (file && file.content) {
        if (typeof file.content === 'object' && file.content.salt && file.content.iv && file.content.ciphertext) {
          const passphrase = await getUserEncryptionKey();
          data = await decryptDataBlob(file.content, passphrase);
        } else {
          data = JSON.parse(file.content);
        }
      }
      tasks = data.tasks || [];
      goals = data.goals || [];
      tasks.forEach(t => { if (!t.id) t.id = Date.now() + Math.random(); });
      goals.forEach(g => { if (!g.id) g.id = Date.now() + Math.random(); });
      localStorage.setItem('lifeos_tasks', JSON.stringify(tasks));
      localStorage.setItem('lifeos_goals', JSON.stringify(goals));
      console.log("✅ LifeOS data loaded from GitHub", { tasksCount: tasks.length, goalsCount: goals.length });
    } catch (err) {
      console.error("Failed to load lifeos data from GitHub:", err);
      const storedTasks = localStorage.getItem('lifeos_tasks');
      const storedGoals = localStorage.getItem('lifeos_goals');
      tasks = storedTasks ? JSON.parse(storedTasks) : [];
      goals = storedGoals ? JSON.parse(storedGoals) : [];
    } finally {
      isLoading = false;
      window.hideLoading();
    }
  }

  async function saveToGitHub() {
    if (isLoading) return;
    isLoading = true;
    try {
      const passphrase = await getUserEncryptionKey();
      const dataToSave = { tasks, goals };
      const encryptedBlob = await encryptDataBlob(dataToSave, passphrase);
      const { owner, repo, branch } = window.REPO_CONFIG;
      const path = getUserDataPath(user.username, 'lifeos.json');
      let sha = null;
      try {
        const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
        if (existing && existing.sha) sha = existing.sha;
      } catch(e) {}
      await GitHubAPI.updateFile(owner, repo, path, encryptedBlob, "Update LifeOS data", branch, user.pat, sha);
      localStorage.setItem('lifeos_tasks', JSON.stringify(tasks));
      localStorage.setItem('lifeos_goals', JSON.stringify(goals));
      console.log("✅ LifeOS data saved to GitHub");
    } catch (err) {
      console.error("Failed to save lifeos data to GitHub:", err);
      showToast("Auto-save failed: " + err.message, "error");
    } finally {
      isLoading = false;
    }
  }

  async function syncAndRender() {
    renderTasks();
    renderGoals();
    updateWeeklyReflection();
    renderCalendar();
    updateDailyDashboard();
    await saveToGitHub();
  }

  // ======================== DAILY DASHBOARD ========================
  function updateDailyDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.dueDate === today && !t.done);
    const highPriorityPending = tasks.filter(t => !t.done && t.priority === 'High' && t.dueDate !== today);
    const displayTasks = [...todayTasks, ...highPriorityPending].slice(0, 5);
    const totalToday = todayTasks.length;
    const completedToday = tasks.filter(t => t.dueDate === today && t.done).length;
    const percent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
    const progressBar = document.getElementById('todayProgressBar');
    if (progressBar) {
      progressBar.style.width = percent + '%';
      progressBar.innerText = percent + '%';
    }
    document.getElementById('todayCompletedTasks').innerText = completedToday;
    document.getElementById('todayTotalTasks').innerText = totalToday;
    const container = document.getElementById('todayTasksList');
    if (displayTasks.length === 0) {
      container.innerHTML = '<div class="text-muted">✨ No tasks for today. Enjoy your free time!</div>';
    } else {
      container.innerHTML = '';
      displayTasks.forEach(task => {
        const iconMap = { Work: '💼', Personal: '🏠', Learning: '📚', Health: '🏃', Social: '👥' };
        const icon = iconMap[task.category] || '📌';
        const taskDiv = document.createElement('div');
        taskDiv.className = 'today-task-item';
        taskDiv.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <span class="mr-2">${icon}</span>
              <strong>${escapeHtml(task.title)}</strong>
              <span class="badge ${task.priority === 'High' ? 'badge-danger' : (task.priority === 'Medium' ? 'badge-warning' : 'badge-success')} ml-2">${task.priority}</span>
              <span class="badge badge-secondary ml-1">${task.category}</span>
            </div>
            <small class="text-muted">${task.dueDate === today ? 'Due today' : 'High priority'}</small>
          </div>
        `;
        container.appendChild(taskDiv);
      });
    }
    const hour = new Date().getHours();
    let energyTip = '';
    if (hour < 12) energyTip = '🌅 Good morning! Your energy is naturally high. Tackle your most important task now.';
    else if (hour < 17) energyTip = '☀️ Afternoon energy is stable. Focus on medium-priority tasks.';
    else energyTip = '🌙 Evening energy is lower. Do light tasks or plan for tomorrow.';
    const energySpan = document.getElementById('energySuggestionText');
    if (energySpan) energySpan.innerHTML = `<i class="fa fa-hourglass-half"></i> ${energyTip}`;
  }

  // ======================== RENDER TASKS (with scrollable list) ========================
  function renderTasks() {
    const container = document.getElementById('taskList');
    if (!container) return;
    if (tasks.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-3">No tasks yet. Add one above ☝️</div>';
      document.getElementById('bestTaskSuggestion').innerText = 'No tasks available';
      return;
    }
    const priorityOrder = { High: 0, Medium: 1, Low: 2 };
    const sorted = [...tasks].sort((a,b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    container.innerHTML = '';
    sorted.forEach(task => {
      const priorityClass = task.priority === 'High' ? 'priority-high' : (task.priority === 'Medium' ? 'priority-medium' : 'priority-low');
      const doneClass = task.done ? 'task-done' : '';
      const dueHtml = task.dueDate ? `<small class="text-muted ml-2"><i class="fa fa-calendar"></i> ${task.dueDate}</small>` : '';
      const notesHtml = task.notes ? `<small class="text-muted ml-2"><i class="fa fa-comment"></i> ${escapeHtml(task.notes.substring(0,30))}</small>` : '';
      const html = `
        <div class="task-item ${priorityClass} ${doneClass}" data-id="${task.id}">
          <div style="flex:1">
            <div class="d-flex align-items-center flex-wrap">
              <input type="checkbox" class="task-checkbox" data-id="${task.id}" ${task.done ? 'checked' : ''}>
              <strong class="mr-2">${escapeHtml(task.title)}</strong>
              ${dueHtml} ${notesHtml}
              <div>
                <span class="badge badge-secondary badge-category">${task.category}</span>
                <span class="badge ${task.priority === 'High' ? 'badge-danger' : (task.priority === 'Medium' ? 'badge-warning' : 'badge-success')} badge-category">${task.priority}</span>
                <span class="badge badge-info badge-category">⚡ ${task.energy}</span>
              </div>
            </div>
          </div>
          <div><button class="btn btn-sm btn-outline-danger delete-task" data-id="${task.id}"><i class="fa fa-trash"></i></button></div>
        </div>
      `;
      container.innerHTML += html;
    });
    const nextTask = tasks.find(t => !t.done && t.priority === 'High') ||
                     tasks.find(t => !t.done && t.priority === 'Medium') ||
                     tasks.find(t => !t.done);
    document.getElementById('bestTaskSuggestion').innerHTML = nextTask ? 
      `<i class="fa fa-arrow-right"></i> ${escapeHtml(nextTask.title)} (${nextTask.priority} priority, ${nextTask.energy} energy)` : 
      'All tasks completed! 🎉';
    attachTaskEvents();
  }

  function attachTaskEvents() {
    document.querySelectorAll('.task-checkbox').forEach(cb => {
      cb.removeEventListener('change', handleTaskToggle);
      cb.addEventListener('change', handleTaskToggle);
    });
    document.querySelectorAll('.delete-task').forEach(btn => {
      btn.removeEventListener('click', handleTaskDelete);
      btn.addEventListener('click', handleTaskDelete);
    });
  }

  async function handleTaskToggle(e) {
    const id = e.target.dataset.id;
    const task = tasks.find(t => t.id == id);
    if (task) {
      task.done = e.target.checked;
      task.completedAt = e.target.checked ? new Date().toISOString() : null;
      await syncAndRender();
    }
  }

  async function handleTaskDelete(e) {
    const id = e.target.closest('.delete-task')?.dataset.id;
    if (id) {
      tasks = tasks.filter(t => t.id != id);
      await syncAndRender();
    }
  }

  // ======================== GOALS ========================
  function renderGoals() {
    const container = document.getElementById('goalList');
    if (!container) return;
    if (goals.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-3">No goals yet. Add one above.</div>';
      return;
    }
    container.innerHTML = '';
    goals.forEach(goal => {
      const percent = goal.target > 0 ? (goal.progress / goal.target) * 100 : 0;
      const html = `
        <div class="goal-item" data-id="${goal.id}">
          <div style="flex:1">
            <div class="d-flex justify-content-between"><strong>${escapeHtml(goal.name)}</strong><span>${goal.progress}/${goal.target}</span></div>
            <div class="progress mt-1"><div class="progress-bar bg-success" role="progressbar" style="width: ${percent}%"></div></div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-primary increment-goal" data-id="${goal.id}"><i class="fa fa-plus"></i></button>
            <button class="btn btn-sm btn-outline-danger delete-goal" data-id="${goal.id}"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      `;
      container.innerHTML += html;
    });
    attachGoalEvents();
  }

  function attachGoalEvents() {
    document.querySelectorAll('.increment-goal').forEach(btn => {
      btn.removeEventListener('click', handleGoalIncrement);
      btn.addEventListener('click', handleGoalIncrement);
    });
    document.querySelectorAll('.delete-goal').forEach(btn => {
      btn.removeEventListener('click', handleGoalDelete);
      btn.addEventListener('click', handleGoalDelete);
    });
  }

  async function handleGoalIncrement(e) {
    const id = e.target.closest('.increment-goal')?.dataset.id;
    const goal = goals.find(g => g.id == id);
    if (goal && goal.progress < goal.target) {
      goal.progress++;
      await syncAndRender();
    }
  }

  async function handleGoalDelete(e) {
    const id = e.target.closest('.delete-goal')?.dataset.id;
    if (id) {
      goals = goals.filter(g => g.id != id);
      await syncAndRender();
    }
  }

  // ======================== WEEKLY REFLECTION ========================
  function updateWeeklyReflection() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23,59,59,999);
    const weeklyTasks = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= startOfWeek && new Date(t.completedAt) <= endOfWeek);
    const completed = weeklyTasks.length;
    const pending = tasks.filter(t => !t.done).length;
    document.getElementById('weeklyCompleted').innerText = completed;
    document.getElementById('weeklyPending').innerText = pending;
    const dayCount = { Monday:0, Tuesday:0, Wednesday:0, Thursday:0, Friday:0, Saturday:0, Sunday:0 };
    weeklyTasks.forEach(t => {
      const day = new Date(t.completedAt).toLocaleDateString('en-US', { weekday: 'long' });
      if (dayCount[day] !== undefined) dayCount[day]++;
    });
    let mostDay = '-', maxCount = 0;
    for (let [day, count] of Object.entries(dayCount)) if (count > maxCount) { maxCount = count; mostDay = day; }
    document.getElementById('mostActiveDay').innerText = mostDay !== '-' ? mostDay : 'No data';
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dailyCount = daysOfWeek.map(day => dayCount[day] || 0);
    if (weeklyChart) weeklyChart.destroy();
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    weeklyChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: daysOfWeek, datasets: [{ label: 'Tasks completed', data: dailyCount, backgroundColor: '#2fc7ff', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, stepSize: 1 } } }
    });
  }

  // ======================== ENERGY SUGGESTION ========================
  function suggestTaskByEnergy(energy) {
    let filtered = tasks.filter(t => !t.done);
    if (energy === 'High') {
      let high = filtered.filter(t => t.priority === 'High' || t.energy === 'High');
      if (high.length) return high[0];
    } else if (energy === 'Medium') {
      let med = filtered.filter(t => t.priority === 'Medium' || t.energy === 'Medium');
      if (med.length) return med[0];
    } else {
      let low = filtered.filter(t => t.priority === 'Low' || t.energy === 'Low');
      if (low.length) return low[0];
    }
    return filtered[0] || null;
  }

  // ======================== CALENDAR ========================
  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    let startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const calendarDays = [];
    for (let i = 0; i < startOffset; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(year, month, i));
    const remaining = 42 - calendarDays.length;
    for (let i = 0; i < remaining; i++) calendarDays.push(null);
    const today = new Date(); today.setHours(0,0,0,0);
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    calendarDays.forEach(day => {
      const dayDiv = document.createElement('div');
      dayDiv.className = 'calendar-day';
      if (day) {
        const dayNum = day.getDate();
        dayDiv.innerHTML = `<div><strong>${dayNum}</strong></div>`;
        if (day.toDateString() === today.toDateString()) dayDiv.classList.add('today');
        const dateStr = formatDateYMD(day);
        const tasksDue = tasks.filter(t => t.dueDate === dateStr && !t.done);
        if (tasksDue.length > 0) {
          dayDiv.classList.add('has-tasks');
          const tooltip = document.createElement('span');
          tooltip.className = 'task-tooltip';
          tooltip.innerText = tasksDue.map(t => t.title).join(', ');
          dayDiv.appendChild(tooltip);
        }
        dayDiv.addEventListener('click', () => showDayTasks(day));
      } else {
        dayDiv.innerHTML = '&nbsp;';
        dayDiv.style.background = '#f1f5f9';
        dayDiv.style.opacity = '0.5';
      }
      grid.appendChild(dayDiv);
    });
    document.getElementById('currentMonthYear').innerText = firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function showDayTasks(day) {
    const dateStr = formatDateYMD(day);
    const tasksDue = tasks.filter(t => t.dueDate === dateStr);
    if (tasksDue.length === 0) { alert(`No tasks due on ${dateStr}`); return; }
    let message = `📅 Tasks for ${dateStr}:\n`;
    tasksDue.forEach(t => { message += `\n- ${t.title} (${t.priority} priority, ${t.category})`; });
    alert(message);
  }

  function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
  }

  function formatDateYMD(date) { return date ? date.toISOString().split('T')[0] : null; }

  // ======================== AI ASSISTANT ========================
  async function generateAIPlan() {
    const pendingTasks = tasks.filter(t => !t.done);
    if (pendingTasks.length === 0) { document.getElementById('aiResponse').innerHTML = '🎉 No pending tasks! Enjoy your free time.'; return; }
    const apiKey = localStorage.getItem('openai_api_key');
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const prompt = `You are a productivity coach. Based on these tasks (title, priority, category, energy), create a daily plan. Use bullet points.\n\nTasks:\n${pendingTasks.map(t => `- ${t.title} (${t.priority} priority, ${t.category}, needs ${t.energy} energy)${t.dueDate ? ` due ${t.dueDate}` : ''}`).join('\n')}`;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 600 })
        });
        if (response.ok) {
          const data = await response.json();
          const plan = data.choices[0].message.content;
          document.getElementById('aiResponse').innerHTML = `<strong>🤖 AI Plan:</strong><br>${plan.replace(/\n/g, '<br>')}`;
          return;
        }
      } catch(e) { console.warn(e); }
    }
    const prioritized = [...pendingTasks].sort((a,b) => ({ High:0, Medium:1, Low:2 }[a.priority] - ({ High:0, Medium:1, Low:2 }[b.priority])));
    let plan = `📋 Smart Daily Plan (${pendingTasks.length} tasks):\n\n`;
    if (prioritized.filter(t => t.priority === 'High').length) plan += `🔴 High priority (morning):\n${prioritized.filter(t => t.priority === 'High').map(t => `  • ${t.title}`).join('\n')}\n\n`;
    if (prioritized.filter(t => t.priority === 'Medium').length) plan += `🟡 Medium priority (afternoon):\n${prioritized.filter(t => t.priority === 'Medium').map(t => `  • ${t.title}`).join('\n')}\n\n`;
    if (prioritized.filter(t => t.priority === 'Low').length) plan += `🟢 Low priority (evening):\n${prioritized.filter(t => t.priority === 'Low').map(t => `  • ${t.title}`).join('\n')}\n\n`;
    plan += `💡 Tip: ${prioritized[0]?.energy === 'High' ? 'Do the hardest task first thing in the morning!' : 'Save easy tasks for low-energy moments.'}`;
    document.getElementById('aiResponse').innerHTML = plan.replace(/\n/g, '<br>');
  }

  // ======================== EXCEL EXPORT ========================
  async function exportToExcel() {
    window.showLoading("Generating Excel report...");
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Tasks", { pageSetup: { orientation: 'landscape', fitToPage: true } });
      const goalsSheet = workbook.addWorksheet("Goals", { pageSetup: { orientation: 'landscape', fitToPage: true } });
      const chartSheet = workbook.addWorksheet("Chart", { pageSetup: { orientation: 'landscape', fitToPage: true } });

      worksheet.mergeCells('A1:I1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `SMART LIFE OS - TASKS (${user.username})`;
      titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 32;

      worksheet.mergeCells('A2:I2');
      const periodCell = worksheet.getCell('A2');
      periodCell.value = `Generated: ${new Date().toLocaleString()}  |  Total tasks: ${tasks.length}  |  Completed: ${tasks.filter(t => t.done).length}  |  Pending: ${tasks.filter(t => !t.done).length}`;
      periodCell.font = { size: 11, italic: true };
      periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
      periodCell.alignment = { horizontal: 'center' };
      worksheet.getRow(2).height = 22;

      const headers = ['Title', 'Priority', 'Category', 'Energy', 'Due Date', 'Notes', 'Status', 'Created At', 'Completed At'];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      worksheet.getRow(4).height = 22;

      tasks.forEach(task => {
        const row = worksheet.addRow([
          task.title, task.priority, task.category, task.energy,
          task.dueDate || '', task.notes || '',
          task.done ? 'Completed' : 'Pending',
          task.createdAt ? new Date(task.createdAt).toLocaleString() : '',
          task.completedAt ? new Date(task.completedAt).toLocaleString() : ''
        ]);
        row.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle' };
        });
        const priorityCell = row.getCell(2);
        if (task.priority === 'High') priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        else if (task.priority === 'Medium') priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
        else priorityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        const statusCell = row.getCell(7);
        if (task.done) {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          statusCell.font = { color: { argb: 'FF006400' }, bold: true };
        } else {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          statusCell.font = { color: { argb: 'FF8B0000' }, bold: true };
        }
      });
      worksheet.columns = [{ width: 30 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 30 }, { width: 12 }, { width: 20 }, { width: 20 }];
      worksheet.views = [{ state: 'frozen', ySplit: 4 }];

      goalsSheet.mergeCells('A1:E1');
      const goalTitle = goalsSheet.getCell('A1');
      goalTitle.value = `SMART LIFE OS - GOALS (${user.username})`;
      goalTitle.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
      goalTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      goalTitle.alignment = { horizontal: 'center' };
      goalsSheet.getRow(1).height = 32;

      const goalHeaders = ['Goal Name', 'Target Steps', 'Progress', 'Percentage', 'Status'];
      const goalHeaderRow = goalsSheet.addRow(goalHeaders);
      goalHeaderRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
      });

      goals.forEach(goal => {
        const percent = goal.target > 0 ? (goal.progress / goal.target) * 100 : 0;
        const status = percent >= 100 ? 'Completed' : 'In Progress';
        const row = goalsSheet.addRow([goal.name, goal.target, goal.progress, `${percent.toFixed(1)}%`, status]);
        row.eachCell(cell => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
        const percentCell = row.getCell(4);
        if (percent >= 100) percentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        else if (percent >= 50) percentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
        else percentCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      });
      goalsSheet.columns = [{ width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];

      const priorityCount = { High: 0, Medium: 0, Low: 0 };
      tasks.forEach(t => { priorityCount[t.priority]++; });
      const chartData = [['Priority', 'Count'], ['High', priorityCount.High], ['Medium', priorityCount.Medium], ['Low', priorityCount.Low]];
      chartSheet.addRows(chartData);
      chartSheet.getCell('A1').value = 'Tasks by Priority';
      chartSheet.getCell('A1').font = { bold: true, size: 14 };
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
          type: 'bar',
          data: { labels: ['High', 'Medium', 'Low'], datasets: [{ label: 'Number of Tasks', data: [priorityCount.High, priorityCount.Medium, priorityCount.Low], backgroundColor: ['#dc3545', '#ffc107', '#28a745'] }] },
          options: { responsive: false }
        });
        await new Promise(r => setTimeout(r, 600));
        const chartBase64 = canvas.toDataURL('image/png');
        chart.destroy();
        const imageId = workbook.addImage({ base64: chartBase64, extension: 'png' });
        chartSheet.addImage(imageId, { tl: { col: 0, row: 5 }, br: { col: 8, row: 25 }, editAs: 'oneCell' });
      } catch(e) { console.warn("Chart image failed", e); }

      worksheet.protect('Siya', { selectLockedCells: false, selectUnlockedCells: false, formatCells: false, formatColumns: false, formatRows: false, insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false, sort: false, autoFilter: false });
      goalsSheet.protect('Siya', { selectLockedCells: false, selectUnlockedCells: false, formatCells: false, formatColumns: false, formatRows: false, insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `SmartLifeOS_${user.username}_${new Date().toISOString().slice(0,19)}.xlsx`);
      showToast("Excel exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Export failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
  }

  async function resetDemo() {
    if (!confirm('⚠️ Delete ALL your tasks and goals? This cannot be undone.')) return;
    tasks = [];
    goals = [];
    await syncAndRender();
    showToast('All data cleared', 'success');
  }

  function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m); }
  function showToast(msg, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.zIndex = '1050';
      document.body.appendChild(container);
    }
    const toastId = 'toast-' + Date.now();
    const bgClass = type === 'success' ? 'bg-success' : (type === 'error' ? 'bg-danger' : 'bg-info');
    const html = `<div id="${toastId}" class="toast ${bgClass} text-white" role="alert" data-autohide="true" data-delay="3000"><div class="toast-body">${msg}</div></div>`;
    container.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(toastId);
    $(toastEl).toast('show');
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  }

  // ======================== INITIALIZATION ========================
  document.addEventListener('DOMContentLoaded', async () => {
    await loadFromGitHub();
    const nameSpan = document.getElementById('userFirstName');
    if (nameSpan) nameSpan.innerText = getUserFirstName();
    renderTasks();
    renderGoals();
    updateWeeklyReflection();
    renderCalendar();
    updateDailyDashboard();

    // Make task list scrollable
    const taskListDiv = document.getElementById('taskList');
    if (taskListDiv) {
      taskListDiv.style.maxHeight = '400px';
      taskListDiv.style.overflowY = 'auto';
    }

    document.getElementById('addTaskBtn').addEventListener('click', async () => {
      const title = document.getElementById('taskTitle').value.trim();
      if (!title) { alert('Please enter a task title'); return; }
      const priority = document.getElementById('taskPriority').value;
      const category = document.getElementById('taskCategory').value;
      const energy = document.getElementById('taskEnergy').value;
      const dueDate = document.getElementById('taskDueDate').value;
      const notes = document.getElementById('taskNotes').value.trim();
      tasks.push({ id: Date.now(), title, priority, category, energy, dueDate: dueDate || null, notes: notes || null, done: false, completedAt: null, createdAt: new Date().toISOString() });
      await syncAndRender();
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDueDate').value = '';
      document.getElementById('taskNotes').value = '';
      showToast('Task added', 'success');
    });

    document.getElementById('addGoalBtn').addEventListener('click', async () => {
      const name = document.getElementById('goalName').value.trim();
      const target = parseInt(document.getElementById('goalTarget').value);
      if (!name || isNaN(target) || target <= 0) { alert('Enter valid goal name and target steps'); return; }
      goals.push({ id: Date.now(), name, target, progress: 0 });
      await syncAndRender();
      document.getElementById('goalName').value = '';
      document.getElementById('goalTarget').value = '';
      showToast('Goal added', 'success');
    });

    document.querySelectorAll('.energy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const energy = btn.dataset.energy;
        const suggested = suggestTaskByEnergy(energy);
        document.getElementById('energyTaskSuggestion').innerHTML = suggested ? `<i class="fa fa-check-circle"></i> ${escapeHtml(suggested.title)} (${suggested.priority} priority, ${suggested.category})` : 'No pending tasks. Add some tasks first!';
      });
    });

    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));
    document.getElementById('aiPlanBtn').addEventListener('click', generateAIPlan);
    document.getElementById('saveOpenAIKeyBtn').addEventListener('click', () => {
      const key = document.getElementById('openaiKey').value.trim();
      if (key) localStorage.setItem('openai_api_key', key);
      else localStorage.removeItem('openai_api_key');
      showToast('API key saved (optional)', 'success');
    });
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    const resetBtn = document.getElementById('resetDataBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetDemo);
    else {
      const hero = document.querySelector('.life-hero');
      if (hero) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-light btn-sm mt-3';
        btn.innerHTML = '<i class="fa fa-trash"></i> Reset All Data';
        btn.addEventListener('click', resetDemo);
        hero.appendChild(btn);
      }
    }

    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) document.getElementById('openaiKey').value = savedKey;

    window.updateUserFooter();
  });
})();
