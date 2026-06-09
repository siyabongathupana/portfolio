// trafficlight-full.js – Compact Traffic Light with Complete Rule Engine
(function() {
    // ---------- Helper Functions (copied from full version) ----------
    function formatYMD(date) {
        return date.toISOString().split('T')[0];
    }
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        d.setDate(d.getDate() - diff);
        d.setHours(0,0,0,0);
        return d;
    }
    function getWeekdaysInRange(start, end) {
        const weekdays = [];
        let current = new Date(start);
        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) weekdays.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return weekdays;
    }
    function checkTrainingThisMonth(entries) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        return entries.some(e => {
            const d = new Date(e.date);
            return e.category === 'Training' &&
                   d.getFullYear() === currentYear &&
                   d.getMonth() === currentMonth;
        });
    }
    function checkWeekendWork(entries, weekStart, weekEnd) {
        return entries.some(e => {
            const d = new Date(e.date);
            const day = d.getDay();
            return (day === 0 || day === 6) && d >= weekStart && d <= weekEnd;
        });
    }
    function findConsecutiveMissing(weekdays, daysMap) {
        let maxConsecutive = 0, current = 0;
        for (let day of weekdays) {
            const ds = formatYMD(day);
            const totalHours = daysMap.get(ds)?.totalHours || 0;
            if (totalHours === 0) {
                current++;
                maxConsecutive = Math.max(maxConsecutive, current);
            } else {
                current = 0;
            }
        }
        return maxConsecutive;
    }

    // ---------- Full Rule Analysis (your complete spec) ----------
    function analyzeTimesheetHealth(entries, startDate, endDate, allProjectOptions = []) {
        const weekdays = getWeekdaysInRange(startDate, endDate);
        const daysMap = new Map();
        weekdays.forEach(day => {
            const ds = formatYMD(day);
            daysMap.set(ds, { totalHours: 0, projectsSet: new Set(), hasNotes: false, entries: [] });
        });

        let totalHours = 0, adminHours = 0;
        let duplicateEntries = [], negativeHoursFound = false;
        let invalidProjects = new Set();

        entries.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate < startDate || entryDate > endDate) return;
            const ds = formatYMD(entryDate);
            if (!daysMap.has(ds)) {
                daysMap.set(ds, { totalHours: 0, projectsSet: new Set(), hasNotes: false, entries: [] });
            }
            const dayData = daysMap.get(ds);
            dayData.totalHours += entry.hours;
            if (entry.project) dayData.projectsSet.add(entry.project);
            if (entry.notes?.trim()) dayData.hasNotes = true;
            dayData.entries.push(entry);
            totalHours += entry.hours;
            if (entry.category === 'Admin') adminHours += entry.hours;
            if (entry.hours < 0 || entry.hours > 24) negativeHoursFound = true;
        });

        // Duplicate detection
        const seen = new Set();
        entries.forEach(entry => {
            if (entry.date < formatYMD(startDate) || entry.date > formatYMD(endDate)) return;
            const key = `${entry.date}|${entry.start}|${entry.end}|${entry.project}`;
            if (seen.has(key)) duplicateEntries.push(entry);
            else seen.add(key);
        });

        // Invalid projects
        if (allProjectOptions.length) {
            entries.forEach(entry => {
                if (entry.date < formatYMD(startDate) || entry.date > formatYMD(endDate)) return;
                if (entry.project && !allProjectOptions.includes(entry.project))
                    invalidProjects.add(entry.project);
            });
        }

        // Metrics
        let missingDays = 0, daysBelowTarget = 0, daysOutside759 = 0, daysAbove10 = 0, daysAbove12 = 0;
        let daysWithManyProjects = 0, overtimeDays = 0, notesMissing = 0, zeroHourDays = 0;

        for (let day of weekdays) {
            const ds = formatYMD(day);
            const d = daysMap.get(ds);
            const hrs = d ? d.totalHours : 0;
            const projCount = d ? d.projectsSet.size : 0;
            const hasNotes = d ? d.hasNotes : false;

            if (hrs === 0) missingDays++;
            if (hrs > 0 && hrs < 7.5) daysBelowTarget++;
            if (hrs > 0 && (hrs < 7.5 || hrs > 9)) daysOutside759++;
            if (hrs > 10) daysAbove10++;
            if (hrs > 12) daysAbove12++;
            if (projCount > 4) daysWithManyProjects++;
            if (hrs > 8) overtimeDays++;
            if (hrs > 0 && !hasNotes) notesMissing++;
            if (hrs === 0) zeroHourDays++;
        }

        const totalProjectsWorked = new Set(entries.filter(e => {
            const d = new Date(e.date);
            return d >= startDate && d <= endDate && e.project;
        }).map(e => e.project)).size;

        const weeklyTargetReached = totalHours >= 40;
        const weeklySignificantlyBelow = totalHours < 30;
        const entireWeekMissing = weekdays.every(day => (daysMap.get(formatYMD(day))?.totalHours || 0) === 0);
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        const consecutiveMissing = findConsecutiveMissing(weekdays, daysMap);
        const trainingThisMonth = checkTrainingThisMonth(entries);
        const hasWeekendWork = checkWeekendWork(entries, startDate, endDate);
        const unallocated = entries.filter(e => {
            const d = new Date(e.date);
            return d >= startDate && d <= endDate && (!e.project || e.project.trim() === "");
        }).length;

        // ---- Determine status (RED/AMBER/GREEN) using your exact rules ----
        let redFlags = [], amberFlags = [];

        // RED conditions
        if (missingDays >= 2) redFlags.push("Two or more missing working days");
        if (entireWeekMissing) redFlags.push("Entire week not submitted");
        if (weeklySignificantlyBelow) redFlags.push("Weekly hours significantly below target (<30h)");
        if (negativeHoursFound) redFlags.push("Negative or impossible hour values");
        if (duplicateEntries.length > 0) redFlags.push(`Duplicate entries detected (${duplicateEntries.length})`);
        if (daysAbove12 > 0) redFlags.push(`More than 12 hours worked on ${daysAbove12} day(s)`);
        if (zeroHourDays > 3) redFlags.push("Multiple days with zero hours");
        if (consecutiveMissing >= 3) redFlags.push("More than 3 consecutive missing entries");
        if (invalidProjects.size > 0) redFlags.push(`Invalid project codes: ${[...invalidProjects].join(', ')}`);
        if (unallocated > 0) redFlags.push(`${unallocated} unallocated hour entries`);

        // AMBER conditions
        if (missingDays === 1) amberFlags.push("One missing working day");
        if (daysBelowTarget > 0) amberFlags.push(`Daily hours below target on ${daysBelowTarget} day(s)`);
        if (daysAbove10 > 0) amberFlags.push(`Daily hours above 10 on ${daysAbove10} day(s)`);
        if (!weeklyTargetReached) amberFlags.push("Weekly target not yet reached (<40h)");
        if (adminRatio > 15) amberFlags.push(`Admin hours above 15% (${adminRatio.toFixed(1)}%)`);
        if (notesMissing > 0) amberFlags.push(`Missing descriptions on ${notesMissing} day(s)`);
        if (daysWithManyProjects > 0) amberFlags.push(`More than 4 projects worked on ${daysWithManyProjects} day(s)`);
        if (!trainingThisMonth) amberFlags.push("Training not logged this month");
        if (overtimeDays > 2) amberFlags.push(`Overtime worked more than twice this week (${overtimeDays} days)`);

        // Special badge detection (for tooltip)
        let specialBadge = null;
        let specialMessage = null;
        if (overtimeDays >= 5 || hasWeekendWork || totalHours >= 50) {
            specialBadge = "burnout";
            specialMessage = "⚠️ Burnout Risk: Workload may be unsustainable.";
            redFlags.push("Burnout risk detected");
        }
        const allGreen = (missingDays === 0 && daysOutside759 === 0 && weeklyTargetReached &&
                          unallocated === 0 && invalidProjects.size === 0 && adminRatio <= 15 &&
                          duplicateEntries.length === 0 && notesMissing === 0 && overtimeDays === 0 &&
                          totalProjectsWorked >= 1 && !negativeHoursFound);
        const rockstar = (allGreen && trainingThisMonth && duplicateEntries.length === 0 && notesMissing === 0);
        if (rockstar && !specialBadge) {
            specialBadge = "rockstar";
            specialMessage = "🌟 Rockstar Week: Outstanding performance!";
        }
        const efficiency = (totalHours >= 40 && overtimeDays === 0 && missingDays === 0 && adminRatio < 10);
        if (efficiency && !specialBadge && !rockstar) {
            specialBadge = "efficiency";
            specialMessage = "⚡ Efficiency Mode: Optimal productivity achieved.";
        }
        const perfectWeek = (allGreen && duplicateEntries.length === 0 && notesMissing === 0 && missingDays === 0);
        if (perfectWeek && !specialBadge && !rockstar) {
            specialBadge = "perfect";
            specialMessage = "🏆 Perfect Week – 100% Timesheet Health";
        }

        let status = "green";
        let reasons = [];
        if (specialBadge === "burnout") {
            status = "red";
            reasons = redFlags;
        } else if (redFlags.length > 0) {
            status = "red";
            reasons = redFlags;
        } else if (amberFlags.length > 0) {
            status = "amber";
            reasons = amberFlags;
        } else if (allGreen) {
            status = "green";
            reasons = ["All criteria met. Keep going!"];
        } else {
            status = "amber";
            reasons = ["Some entries need attention (see details)"];
        }

        // Health score (weighted)
        let score = 100;
        const weights = { missingDay: 25, weeklyBelow30: 30, duplicate: 5, invalidProject: 10, unallocated: 8,
                          daysAbove12: 15, zeroHourDays: 8, consecutiveMissing: 12, notesMissing: 2, adminHigh: 5,
                          trainingMissing: 2, overtimeDay: 3, daysAbove10: 3, daysBelowTarget: 3, manyProjects: 2,
                          weeklyTargetNotReached: 5 };
        if (missingDays > 0) score -= Math.min(missingDays * weights.missingDay, 50);
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
        if (daysWithManyProjects) score -= daysWithManyProjects * weights.manyProjects;
        if (!weeklyTargetReached && totalHours < 40) score -= weights.weeklyTargetNotReached;
        score = Math.max(0, Math.min(100, score));
        if (specialBadge === "rockstar" || specialBadge === "perfect") score = 100;
        if (specialBadge === "efficiency") score = 95;

        return { status, reasons, score, specialMessage, metrics: { totalHours, missingDays, adminRatio: adminRatio.toFixed(1), overtimeDays, duplicateCount: duplicateEntries.length, notesMissing } };
    }

    // ---------- UI: Three‑Light Traffic Light (compact) ----------
    function updateTrafficLight() {
        const container = document.getElementById("standaloneTrafficLight");
        if (!container) return;
        if (!window.__timesheetEntries) {
            container.innerHTML = `<div class="traffic-light-standalone" title="No data"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>`;
            return;
        }

        // Determine date range from filter
        const range = document.getElementById("filterRange")?.value || "week";
        let startDate, endDate;
        const now = new Date();
        if (range === "day") {
            startDate = new Date(now); startDate.setHours(0,0,0,0);
            endDate = new Date(now); endDate.setHours(23,59,59,999);
        } else if (range === "week") {
            const monday = getMonday(now);
            startDate = monday;
            endDate = new Date(monday); endDate.setDate(monday.getDate()+6);
        } else if (range === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth()+1, 0);
        } else { // 'all'
            startDate = new Date(0);
            endDate = new Date(8640000000000000);
        }

        const projectOptions = window.__timesheetProjectOptions || [];
        const health = analyzeTimesheetHealth(window.__timesheetEntries, startDate, endDate, projectOptions);

        const redLit = health.status === "red" ? "lit" : "";
        const amberLit = health.status === "amber" ? "lit" : "";
        const greenLit = health.status === "green" ? "lit" : "";

        // Build tooltip text (status + top 3 reasons + score)
        let tooltip = `${health.status.toUpperCase()} – Health Score: ${health.score}/100`;
        if (health.reasons.length) {
            tooltip += `\nReasons: ${health.reasons.slice(0,3).join(", ")}${health.reasons.length>3 ? "..." : ""}`;
        }
        if (health.specialMessage) tooltip += `\n${health.specialMessage}`;
        tooltip += `\nTotal hrs: ${health.metrics.totalHours.toFixed(1)} | Missing: ${health.metrics.missingDays} | Admin: ${health.metrics.adminRatio}% | Overtime: ${health.metrics.overtimeDays}`;

        const html = `
            <div class="traffic-light-standalone" title="${tooltip.replace(/"/g, '&quot;')}">
                <div class="light red ${redLit}"></div>
                <div class="light amber ${amberLit}"></div>
                <div class="light green ${greenLit}"></div>
            </div>
        `;
        container.innerHTML = html;
    }

    // Auto‑refresh on data changes or filter changes
    document.addEventListener("timesheetUpdated", updateTrafficLight);
    $(document).ready(function() {
        $("#filterRange, #filterProject, #filterCategory").on("change", updateTrafficLight);
        setTimeout(updateTrafficLight, 500);
    });
    window.refreshStandaloneLight = updateTrafficLight;
})();
