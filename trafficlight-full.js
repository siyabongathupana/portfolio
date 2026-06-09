// trafficlight-full.js – FULL FEATURES + correct past‑days‑only logic
(function() {
    function formatYMD(d) {
        return d.toISOString(). split('T')[0];
    }
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        d.setDate(d.getDate() - diff);
        d.setHours(0,0,0,0);
        return d;
    }
    // Get weekdays up to maxDate (exclusive of maxDate itself)
    function getWeekdaysUpTo(start, end, maxDate) {
        const weekdays = [];
        let current = new Date(start);
        const limit = maxDate < end ? maxDate : end;
        while (current <= limit) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) weekdays.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return weekdays;
    }
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
            const day = d.getDay();
            return (day === 0 || day === 6) && d >= start && d <= end;
        });
    }
    function findConsecutiveMissing(weekdays, dayMap) {
        let max = 0, cur = 0;
        for (let day of weekdays) {
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

    function analyzeTimesheetHealth(entries, filterType, today = new Date()) {
        const todayStart = new Date(today);
        todayStart.setHours(0,0,0,0);

        // Define date range for this filter
        let startDate, endDate;
        if (filterType === 'day') {
            startDate = new Date(todayStart);
            endDate = new Date(todayStart);
            endDate.setHours(23,59,59,999);
        } else if (filterType === 'week') {
            const monday = getMonday(todayStart);
            startDate = monday;
            endDate = new Date(monday);
            endDate.setDate(monday.getDate() + 6);
        } else if (filterType === 'month') {
            startDate = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
            endDate = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0);
        } else { // 'all'
            const first = getEarliestEntryDate(entries);
            if (!first) return null;
            startDate = first;
            endDate = todayStart;
        }

        // Only past days (strictly before today) are evaluated for missing, daily targets, overtime, etc.
        const cutoff = new Date(todayStart);
        const pastDays = getWeekdaysUpTo(startDate, endDate, new Date(cutoff.getTime() - 86400000));
        const dayMap = new Map();
        pastDays.forEach(day => dayMap.set(formatYMD(day), { hours: 0, projects: new Set(), hasNotes: false }));

        // Today's data (for info only)
        let todayHours = 0, todayProjects = new Set(), todayHasNotes = false;

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

            // Duplicate detection
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
                if (entry.project) todayProjects.add(entry.project);
                if (entry.notes?.trim()) todayHasNotes = true;
            }
        });

        // Validate project codes against options
        if (window.__timesheetProjectOptions && window.__timesheetProjectOptions.length) {
            entries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate < startDate || entryDate > endDate) return;
                if (entry.project && !window.__timesheetProjectOptions.includes(entry.project))
                    invalidProjects.add(entry.project);
            });
        }

        // Metrics from past days only
        let missingDays = 0, daysBelowTarget = 0, daysOutside759 = 0, daysAbove10 = 0, daysAbove12 = 0;
        let daysManyProjects = 0, overtimeDays = 0, notesMissing = 0, zeroHourDays = 0;

        for (let [_, data] of dayMap) {
            const hrs = data.hours;
            const projCount = data.projects.size;
            const hasNotes = data.hasNotes;
            if (hrs === 0) missingDays++;
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
        const consecutiveMissing = findConsecutiveMissing(pastDays, dayMap);
        const trainingThisMonth = checkTrainingThisMonth(entries, todayStart);
        const hasWeekendWork = checkWeekendWork(entries, startDate, endDate);
        const unallocated = entries.filter(e => {
            const d = new Date(e.date);
            return d >= startDate && d <= endDate && (!e.project || e.project.trim() === "");
        }).length;

        const weeklyTargetReached = totalHours >= 40;
        const weeklySignificantlyBelow = totalHours < 30;

        // ----- FLAGS (only for past days, and filter-specific) -----
        let redFlags = [], amberFlags = [];

        if (filterType === 'week' || filterType === 'day') {
            if (missingDays >= 2) redFlags.push(`${missingDays} missing past working days`);
            else if (missingDays === 1) amberFlags.push("One missing past working day");
        } else {
            if (missingDays > 15) redFlags.push(`Many missing days (${missingDays})`);
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

        // Special badges
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
        else if (allGreen) reasons = ["All good for past days."];
        else reasons = ["Check details"];

        // Weighted score
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

        // Today info
        const todayIsWeekday = todayStart.getDay() !== 0 && todayStart.getDay() !== 6;
        let todayMsg = "";
        if (filterType === 'day') {
            if (todayHours === 0) todayMsg = "No hours logged yet today.";
            else if (todayHours < 7.5) todayMsg = `${todayHours.toFixed(1)}h today (below target).`;
            else if (todayHours > 9) todayMsg = `${todayHours.toFixed(1)}h today (above target).`;
            else todayMsg = `${todayHours.toFixed(1)}h today – good range.`;
        } else {
            if (todayIsWeekday) {
                if (todayHours === 0) todayMsg = "No hours logged yet today (not penalised).";
                else todayMsg = `Today: ${todayHours.toFixed(1)}h so far.`;
            } else todayMsg = "Weekend – no expectation.";
        }

        return {
            status, reasons, score, specialMsg, todayMsg,
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
        tooltip += `📅 Past missing days: ${health.metrics.missingDays}\n`;
        tooltip += `📊 Total hours (period): ${health.metrics.totalHours}\n`;
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
