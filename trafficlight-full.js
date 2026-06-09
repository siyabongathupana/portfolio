// trafficlight-full.js – Weekends ABSOLUTELY excluded
(function() {
    // ---------- UTILITIES ----------
    function formatYMD(d) {
        return d.toISOString().split('T')[0];
    }
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        d.setDate(d.getDate() - diff);
        d.setHours(0,0,0,0);
        return d;
    }
    // ---------- South African Public Holidays (2026) ----------
    function isSouthAfricanPublicHoliday(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        const fixedHolidays = [
            `${year}-01-01`, `${year}-03-21`, `${year}-04-27`, `${year}-05-01`,
            `${year}-06-16`, `${year}-08-09`, `${year}-09-24`, `${year}-12-16`,
            `${year}-12-25`, `${year}-12-26`
        ];
        // Good Friday & Easter Monday
        const easter = getEasterDate(year);
        const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
        const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
        const movable = [formatYMD(goodFriday), formatYMD(easterMonday)];
        
        return fixedHolidays.includes(key) || movable.includes(key);
    }
    function getEasterDate(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }
    // ---------- Get working days (Mon-Fri, no public holidays) up to maxDate (exclusive) ----------
    function getWorkingDaysUpTo(start, end, maxDate) {
        const working = [];
        let current = new Date(start);
        // Normalise to UTC midnight to avoid timezone issues
        current.setUTCHours(0,0,0,0);
        const limit = new Date(maxDate < end ? maxDate : end);
        limit.setUTCHours(0,0,0,0);
        
        while (current <= limit) {
            const utcDay = current.getUTCDay(); // 0=Sun, 6=Sat
            const isWeekend = (utcDay === 0 || utcDay === 6);
            const isHoliday = isSouthAfricanPublicHoliday(current);
            if (!isWeekend && !isHoliday) {
                working.push(new Date(current));
            }
            current.setUTCDate(current.getUTCDate() + 1);
        }
        return working;
    }
    // ---------- Other helpers ----------
    function checkTrainingThisMonth(entries, today) {
        const year = today.getFullYear();
        const month = today.getMonth();
        return entries.some(e => {
            const d = new Date(e.date);
            return e.category === 'Training' && d.getFullYear() === year && d.getMonth() === month;
        });
    }
    function checkWeekendWork(entries, start, end) {
        return entries.some(e => {
            const d = new Date(e.date);
            const day = d.getUTCDay();
            return (day === 0 || day === 6) && d >= start && d <= end;
        });
    }
    function findConsecutiveMissing(workingDays, dayMap) {
        let max = 0, cur = 0;
        for (let day of workingDays) {
            const hrs = dayMap.get(formatYMD(day))?.hours || 0;
            if (hrs === 0) {
                cur++;
                max = Math.max(max, cur);
            } else {
                cur = 0;
            }
        }
        return max;
    }
    function getEarliestEntryDate(entries) {
        if (!entries.length) return null;
        let earliest = new Date(entries[0].date);
        for (let e of entries) {
            const d = new Date(e.date);
            if (d < earliest) earliest = d;
        }
        return earliest;
    }
    // ---------- Main analysis (only past working days) ----------
    function analyzeTimesheetHealth(entries, filterType, today = new Date()) {
        const todayStart = new Date(today);
        todayStart.setUTCHours(0,0,0,0);
        
        let startDate, endDate;
        if (filterType === 'day') {
            startDate = new Date(todayStart);
            endDate = new Date(todayStart);
            endDate.setUTCHours(23,59,59,999);
        } else if (filterType === 'week') {
            const monday = getMonday(todayStart);
            startDate = monday;
            endDate = new Date(monday);
            endDate.setUTCDate(monday.getUTCDate() + 6);
        } else if (filterType === 'month') {
            startDate = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), 1));
            endDate = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth() + 1, 0));
        } else { // 'all'
            const first = getEarliestEntryDate(entries);
            if (!first) return null;
            startDate = first;
            endDate = todayStart;
        }
        
        // Only days BEFORE today (past working days)
        const yesterday = new Date(todayStart);
        yesterday.setUTCDate(todayStart.getUTCDate() - 1);
        const workingDays = getWorkingDaysUpTo(startDate, endDate, yesterday);
        
        const dayMap = new Map();
        workingDays.forEach(day => {
            dayMap.set(formatYMD(day), { hours: 0, projects: new Set(), hasNotes: false });
        });
        
        let todayHours = 0;
        let totalHours = 0, adminHours = 0;
        let duplicateEntries = [], negativeHours = false;
        let invalidProjects = new Set();
        const seen = new Set();
        
        entries.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate < startDate || entryDate > endDate) return;
            const ds = formatYMD(entryDate);
            const hrs = entry.hours;
            totalHours += hrs;
            if (entry.category === 'Admin') adminHours += hrs;
            if (hrs < 0 || hrs > 24) negativeHours = true;
            
            const key = `${entry.date}|${entry.start}|${entry.end}|${entry.project}`;
            if (seen.has(key)) duplicateEntries.push(entry);
            else seen.add(key);
            
            if (entryDate < todayStart) {
                if (dayMap.has(ds)) {
                    const d = dayMap.get(ds);
                    d.hours += hrs;
                    if (entry.project) d.projects.add(entry.project);
                    if (entry.notes?.trim()) d.hasNotes = true;
                }
            } else if (entryDate.toDateString() === todayStart.toDateString()) {
                todayHours += hrs;
            }
        });
        
        if (window.__timesheetProjectOptions && window.__timesheetProjectOptions.length) {
            entries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate < startDate || entryDate > endDate) return;
                if (entry.project && !window.__timesheetProjectOptions.includes(entry.project))
                    invalidProjects.add(entry.project);
            });
        }
        
        let missingDays = 0, missingDates = [];
        let daysBelowTarget = 0, daysOutside759 = 0, daysAbove10 = 0, daysAbove12 = 0;
        let daysManyProjects = 0, overtimeDays = 0, notesMissing = 0, zeroHourDays = 0;
        
        for (let [dateStr, data] of dayMap) {
            const hrs = data.hours;
            const projCount = data.projects.size;
            const hasNotes = data.hasNotes;
            if (hrs === 0) {
                missingDays++;
                missingDates.push(dateStr);
            }
            if (hrs > 0 && hrs < 7.5) daysBelowTarget++;
            if (hrs > 0 && (hrs < 7.5 || hrs > 9)) daysOutside759++;
            if (hrs > 10) daysAbove10++;
            if (hrs > 12) daysAbove12++;
            if (projCount > 4) daysManyProjects++;
            if (hrs > 8) overtimeDays++;
            if (hrs > 0 && !hasNotes) notesMissing++;
            if (hrs === 0) zeroHourDays++;
        }
        
        const totalProjectsWorked = new Set(Array.from(dayMap.values()).flatMap(d => Array.from(d.projects))).size;
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        const consecutiveMissing = findConsecutiveMissing(workingDays, dayMap);
        const trainingThisMonth = checkTrainingThisMonth(entries, todayStart);
        const hasWeekendWork = checkWeekendWork(entries, startDate, endDate);
        const unallocated = entries.filter(e => {
            const d = new Date(e.date);
            return d >= startDate && d <= endDate && (!e.project || e.project.trim() === "");
        }).length;
        const weeklyTargetReached = totalHours >= 40;
        const weeklySignificantlyBelow = totalHours < 30;
        
        let redFlags = [], amberFlags = [];
        
        if (filterType === 'week' || filterType === 'day') {
            if (missingDays >= 2) redFlags.push(`${missingDays} missing working days`);
            else if (missingDays === 1) amberFlags.push("One missing working day");
        } else {
            if (missingDays > 15) redFlags.push(`Many missing working days (${missingDays})`);
        }
        
        if (weeklySignificantlyBelow && filterType === 'week') redFlags.push("Weekly hours <30h");
        if (negativeHours) redFlags.push("Negative/Impossible hours");
        if (duplicateEntries.length) redFlags.push(`${duplicateEntries.length} duplicate entries`);
        if (daysAbove12) redFlags.push(`${daysAbove12} day(s) >12h`);
        if (zeroHourDays > 3) redFlags.push("Multiple zero-hour days");
        if (consecutiveMissing >= 3) redFlags.push("3+ consecutive missing days");
        if (invalidProjects.size) redFlags.push(`Invalid projects: ${[...invalidProjects].join(',')}`);
        if (unallocated) redFlags.push(`${unallocated} unallocated entries`);
        
        if (daysBelowTarget) amberFlags.push(`${daysBelowTarget} day(s) below 7.5h`);
        if (daysAbove10) amberFlags.push(`${daysAbove10} day(s) above 10h`);
        if (filterType === 'week' && !weeklyTargetReached) amberFlags.push("Weekly target <40h");
        if (adminRatio > 15) amberFlags.push(`Admin ${adminRatio.toFixed(1)}% >15%`);
        if (notesMissing) amberFlags.push(`${notesMissing} missing notes`);
        if (daysManyProjects) amberFlags.push(`${daysManyProjects} day(s) >4 projects`);
        if (!trainingThisMonth) amberFlags.push("No training this month");
        if (overtimeDays > 2) amberFlags.push(`${overtimeDays} overtime days (>8h)`);
        
        let specialBadge = null, specialMsg = null;
        if (overtimeDays >= 5 || hasWeekendWork || totalHours >= 50) {
            specialBadge = "burnout";
            specialMsg = "⚠️ Burnout risk: unsustainable workload.";
            redFlags.push("Burnout risk");
        }
        const allGreen = (missingDays === 0 && daysOutside759 === 0 && weeklyTargetReached &&
                          unallocated === 0 && invalidProjects.size === 0 && adminRatio <= 15 &&
                          duplicateEntries.length === 0 && notesMissing === 0 && overtimeDays === 0 &&
                          totalProjectsWorked >= 1 && !negativeHours);
        const rockstar = (allGreen && trainingThisMonth && duplicateEntries.length === 0 && notesMissing === 0);
        if (rockstar && !specialBadge) {
            specialBadge = "rockstar";
            specialMsg = "🌟 Rockstar Week!";
        }
        const efficiency = (totalHours >= 40 && overtimeDays === 0 && missingDays === 0 && adminRatio < 10);
        if (efficiency && !specialBadge && !rockstar) {
            specialBadge = "efficiency";
            specialMsg = "⚡ Efficiency mode";
        }
        const perfectWeek = (allGreen && duplicateEntries.length === 0 && notesMissing === 0 && missingDays === 0);
        if (perfectWeek && !specialBadge && !rockstar) {
            specialBadge = "perfect";
            specialMsg = "🏆 Perfect week!";
        }
        
        let status = "green";
        let reasons = [];
        if (specialBadge === "burnout") status = "red", reasons = redFlags;
        else if (redFlags.length) status = "red", reasons = redFlags;
        else if (amberFlags.length) status = "amber", reasons = amberFlags;
        else if (allGreen) reasons = ["All good for past working days."];
        else reasons = ["Check details"];
        
        let score = 100;
        const weights = {
            missingDay: 25, weeklyBelow30: 30, duplicate: 5, invalidProject: 10, unallocated: 8,
            daysAbove12: 15, zeroHourDays: 8, consecutiveMissing: 12, notesMissing: 2, adminHigh: 5,
            trainingMissing: 2, overtimeDay: 3, daysAbove10: 3, daysBelowTarget: 3, manyProjects: 2,
            weeklyTargetNotReached: 5
        };
        if ((filterType === 'week' || filterType === 'day') && missingDays) score -= Math.min(missingDays * weights.missingDay, 50);
        if (weeklySignificantlyBelow) score -= weights.weeklyBelow30;
        if (duplicateEntries.length) score -= Math.min(duplicateEntries.length * weights.duplicate, 15);
        if (invalidProjects.size) score -= Math.min(invalidProjects.size * weights.invalidProject, 20);
        if (unallocated) score -= Math.min(unallocated * weights.unallocated, 15);
        if (daysAbove12) score -= daysAbove12 * weights.daysAbove12;
        if (zeroHourDays > 3) score -= weights.zeroHourDays;
        if (consecutiveMissing >= 3) score -= weights.consecutiveMissing;
        if (notesMissing) score -= Math.min(notesMissing * weights.notesMissing, 10);
        if (adminRatio > 15) score -= weights.adminHigh;
        if (!trainingThisMonth) score -= weights.trainingMissing;
        if (overtimeDays > 2) score -= (overtimeDays - 2) * weights.overtimeDay;
        if (daysAbove10) score -= daysAbove10 * weights.daysAbove10;
        if (daysBelowTarget) score -= daysBelowTarget * weights.daysBelowTarget;
        if (daysManyProjects) score -= daysManyProjects * weights.manyProjects;
        if (filterType === 'week' && !weeklyTargetReached && totalHours < 40) score -= weights.weeklyTargetNotReached;
        score = Math.max(0, Math.min(100, score));
        if (specialBadge === "rockstar" || specialBadge === "perfect") score = 100;
        if (specialBadge === "efficiency") score = 95;
        
        const todayIsWeekday = todayStart.getUTCDay() !== 0 && todayStart.getUTCDay() !== 6;
        const todayIsHoliday = isSouthAfricanPublicHoliday(todayStart);
        let todayMsg = "";
        if (filterType === 'day') {
            if (todayHours === 0) todayMsg = "No hours logged yet today.";
            else if (todayHours < 7.5) todayMsg = `${todayHours.toFixed(1)}h today (below target).`;
            else if (todayHours > 9) todayMsg = `${todayHours.toFixed(1)}h today (above target).`;
            else todayMsg = `${todayHours.toFixed(1)}h today – good range.`;
        } else {
            if (todayIsWeekday && !todayIsHoliday) {
                if (todayHours === 0) todayMsg = "No hours logged yet today (not penalised).";
                else todayMsg = `Today: ${todayHours.toFixed(1)}h so far.`;
            } else if (todayIsHoliday) {
                todayMsg = "Today is a public holiday – no expectation.";
            } else {
                todayMsg = "Weekend – no expectation.";
            }
        }
        
        return {
            status, reasons, score, specialMsg, todayMsg, missingDates,
            metrics: {
                totalHours: totalHours.toFixed(1),
                missingDays,
                adminRatio: adminRatio.toFixed(1),
                overtimeDays,
                duplicateCount: duplicateEntries.length,
                notesMissing
            }
        };
    }
    
    function updateTrafficLight() {
        const container = document.getElementById("standaloneTrafficLight");
        if (!container) return;
        if (!window.__timesheetEntries || !window.__timesheetEntries.length) {
            container.innerHTML = `<div class="traffic-light-standalone" title="No data"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>`;
            return;
        }
        const range = document.getElementById("filterRange")?.value || "week";
        const health = analyzeTimesheetHealth(window.__timesheetEntries, range, new Date());
        if (!health) {
            container.innerHTML = `<div class="traffic-light-standalone" title="Error"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>`;
            return;
        }
        const redLit = health.status === "red" ? "lit" : "";
        const amberLit = health.status === "amber" ? "lit" : "";
        const greenLit = health.status === "green" ? "lit" : "";
        
        let tooltip = `${health.status.toUpperCase()} – Score: ${health.score}/100\n`;
        tooltip += `📅 Past missing working days: ${health.metrics.missingDays}`;
        if (health.missingDates.length) {
            const dates = health.missingDates.slice(0, 3).join(", ");
            tooltip += ` [${dates}]${health.missingDates.length > 3 ? "..." : ""}`;
        }
        tooltip += `\n📊 Total hours (period): ${health.metrics.totalHours}\n`;
        tooltip += `⚙️ Admin: ${health.metrics.adminRatio}% | O/T days: ${health.metrics.overtimeDays}\n`;
        if (health.reasons.length) tooltip += `⚠️ Issues: ${health.reasons.slice(0,2).join(", ")}${health.reasons.length>2?"...":""}\n`;
        tooltip += `📌 ${health.todayMsg}\n`;
        if (health.specialMsg) tooltip += `🏅 ${health.specialMsg}`;
        
        const html = `
            <div class="traffic-light-standalone" title="${tooltip.replace(/"/g, '&quot;')}">
                <div class="light red ${redLit}"></div>
                <div class="light amber ${amberLit}"></div>
                <div class="light green ${greenLit}"></div>
            </div>
        `;
        container.innerHTML = html;
    }
    
    document.addEventListener("timesheetUpdated", updateTrafficLight);
    $(document).ready(function() {
        $("#filterRange, #filterProject, #filterCategory").on("change", updateTrafficLight);
        setTimeout(updateTrafficLight, 500);
    });
    window.refreshStandaloneLight = updateTrafficLight;
})();
