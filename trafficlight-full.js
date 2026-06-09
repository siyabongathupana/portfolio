// trafficlight-full.js – Final: Ignores future days, weekends, and missing days in month/all
(function() {
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
    // Get weekdays (Mon-Fri) only up to maxDate (today)
    function getWeekdaysUpTo(startDate, endDate, maxDate, maxDays = 400) {
        const weekdays = [];
        let current = new Date(startDate);
        let iterations = 0;
        const effectiveEnd = maxDate && maxDate < endDate ? maxDate : endDate;
        while (current <= effectiveEnd && iterations < maxDays) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) weekdays.push(new Date(current));
            current.setDate(current.getDate() + 1);
            iterations++;
        }
        return weekdays;
    }

    function getEarliestEntryDate(entries) {
        if (!entries.length) return null;
        let earliest = new Date(entries[0].date);
        for (let i = 1; i < entries.length; i++) {
            const d = new Date(entries[i].date);
            if (d < earliest) earliest = d;
        }
        return earliest;
    }

    function analyzeTimesheetHealth(entries, startDate, endDate, allProjectOptions = [], filterType = 'week', today = new Date()) {
        const todayStart = new Date(today);
        todayStart.setHours(0,0,0,0);

        let effectiveStart = startDate;
        let effectiveEnd = endDate;

        // For "all time", start from first entry, end today
        if (filterType === 'all') {
            const first = getEarliestEntryDate(entries);
            if (!first) return { status: "red", reasons: ["No data"], score: 0, metrics: {} };
            effectiveStart = first;
            effectiveEnd = todayStart;
        }

        // For month, keep original end (last day of month) but cap weekdays by today
        // For week, end is Sunday but cap by today
        const weekdays = getWeekdaysUpTo(effectiveStart, effectiveEnd, todayStart, 400);
        const daysMap = new Map();
        weekdays.forEach(day => {
            const ds = formatYMD(day);
            daysMap.set(ds, { totalHours: 0, projectsSet: new Set(), hasNotes: false });
        });

        let totalHours = 0, adminHours = 0;
        let duplicateEntries = [], negativeHoursFound = false;
        let invalidProjects = new Set();

        entries.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate < effectiveStart || entryDate > effectiveEnd) return;
            const ds = formatYMD(entryDate);
            if (!daysMap.has(ds)) {
                // Weekend entries – still count but not in missing days
                daysMap.set(ds, { totalHours: 0, projectsSet: new Set(), hasNotes: false });
            }
            const dayData = daysMap.get(ds);
            dayData.totalHours += entry.hours;
            if (entry.project) dayData.projectsSet.add(entry.project);
            if (entry.notes?.trim()) dayData.hasNotes = true;
            totalHours += entry.hours;
            if (entry.category === 'Admin') adminHours += entry.hours;
            if (entry.hours < 0 || entry.hours > 24) negativeHoursFound = true;
        });

        // Duplicate detection (only within evaluated range)
        const seen = new Set();
        entries.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate < effectiveStart || entryDate > effectiveEnd) return;
            const key = `${entry.date}|${entry.start}|${entry.end}|${entry.project}`;
            if (seen.has(key)) duplicateEntries.push(entry);
            else seen.add(key);
        });

        if (allProjectOptions.length) {
            entries.forEach(entry => {
                const entryDate = new Date(entry.date);
                if (entryDate < effectiveStart || entryDate > effectiveEnd) return;
                if (entry.project && !allProjectOptions.includes(entry.project))
                    invalidProjects.add(entry.project);
            });
        }

        // Metrics for weekdays only (past days)
        let missingDays = 0, daysBelowTarget = 0, daysAbove10 = 0, daysAbove12 = 0;
        let daysWithManyProjects = 0, overtimeDays = 0, notesMissing = 0, zeroHourDays = 0;

        for (let day of weekdays) {
            const ds = formatYMD(day);
            const d = daysMap.get(ds);
            const hrs = d ? d.totalHours : 0;
            const projCount = d ? d.projectsSet.size : 0;
            const hasNotes = d ? d.hasNotes : false;

            if (hrs === 0) missingDays++;
            if (hrs > 0 && hrs < 7.5) daysBelowTarget++;
            if (hrs > 10) daysAbove10++;
            if (hrs > 12) daysAbove12++;
            if (projCount > 4) daysWithManyProjects++;
            if (hrs > 8) overtimeDays++;
            if (hrs > 0 && !hasNotes) notesMissing++;
            if (hrs === 0) zeroHourDays++;
        }

        const totalProjectsWorked = new Set(entries.filter(e => {
            const d = new Date(e.date);
            return d >= effectiveStart && d <= effectiveEnd && e.project;
        }).map(e => e.project)).size;

        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        const trainingThisMonth = (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            return entries.some(e => {
                const d = new Date(e.date);
                return e.category === 'Training' && d.getFullYear() === year && d.getMonth() === month;
            });
        })();

        const hasWeekendWork = entries.some(e => {
            const d = new Date(e.date);
            const day = d.getDay();
            return (day === 0 || day === 6) && d >= effectiveStart && d <= effectiveEnd;
        });

        const unallocated = entries.filter(e => {
            const d = new Date(e.date);
            return d >= effectiveStart && d <= effectiveEnd && (!e.project || e.project.trim() === "");
        }).length;

        // Determine flags (only for relevant filter types)
        let redFlags = [], amberFlags = [];

        // Missing days: only for week filter, and only past days
        if (filterType === 'week') {
            if (missingDays >= 2) redFlags.push(`Two or more missing working days (past: ${missingDays})`);
            else if (missingDays === 1) amberFlags.push("One missing working day");
        } else {
            // For month/all, only flag if more than 15 missing (very incomplete)
            if (missingDays > 15) redFlags.push(`Many missing working days (${missingDays})`);
        }

        if (negativeHoursFound) redFlags.push("Negative or impossible hour values");
        if (duplicateEntries.length > 0) redFlags.push(`Duplicate entries detected (${duplicateEntries.length})`);
        if (daysAbove12 > 0) redFlags.push(`More than 12 hours worked on ${daysAbove12} day(s)`);
        if (zeroHourDays > 3) redFlags.push("Multiple days with zero hours");
        if (invalidProjects.size > 0) redFlags.push(`Invalid project codes: ${[...invalidProjects].join(', ')}`);
        if (unallocated > 0) redFlags.push(`${unallocated} unallocated hour entries`);

        // Amber conditions
        if (daysBelowTarget > 0) amberFlags.push(`Daily hours below target (7.5h) on ${daysBelowTarget} day(s)`);
        if (daysAbove10 > 0) amberFlags.push(`Daily hours above 10 on ${daysAbove10} day(s)`);
        if (adminRatio > 15) amberFlags.push(`Admin hours above 15% (${adminRatio.toFixed(1)}%)`);
        if (notesMissing > 0) amberFlags.push(`Missing descriptions on ${notesMissing} day(s)`);
        if (daysWithManyProjects > 0) amberFlags.push(`More than 4 projects worked on ${daysWithManyProjects} day(s)`);
        if (!trainingThisMonth) amberFlags.push("Training not logged this month");
        if (overtimeDays > 2) amberFlags.push(`Overtime worked more than twice this week (${overtimeDays} days)`);

        // Special badges
        let specialBadge = null, specialMessage = null;
        if (overtimeDays >= 5 || hasWeekendWork || totalHours >= 50) {
            specialBadge = "burnout";
            specialMessage = "⚠️ Burnout Risk: Workload may be unsustainable.";
            redFlags.push("Burnout risk detected");
        }
        const allGreen = (missingDays === 0 && daysBelowTarget === 0 && daysAbove10 === 0 &&
                          unallocated === 0 && invalidProjects.size === 0 && adminRatio <= 15 &&
                          duplicateEntries.length === 0 && notesMissing === 0 && overtimeDays === 0 &&
                          totalProjectsWorked >= 1 && !negativeHoursFound);
        if (allGreen && trainingThisMonth && duplicateEntries.length === 0 && notesMissing === 0 && !specialBadge) {
            specialBadge = "rockstar";
            specialMessage = "🌟 Rockstar Week: Outstanding performance!";
        } else if (totalHours >= 40 && overtimeDays === 0 && missingDays === 0 && adminRatio < 10 && !specialBadge) {
            specialBadge = "efficiency";
            specialMessage = "⚡ Efficiency Mode: Optimal productivity achieved.";
        } else if (allGreen && !specialBadge) {
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
        } else {
            status = "green";
            reasons = ["All criteria met. Keep going!"];
        }

        // Simple health score (0-100)
        let score = 100;
        if (status === "red") score = Math.max(0, 100 - redFlags.length * 15);
        else if (status === "amber") score = Math.max(0, 100 - amberFlags.length * 5);
        if (specialBadge === "rockstar" || specialBadge === "perfect") score = 100;
        if (specialBadge === "efficiency") score = 95;

        return {
            status, reasons, score, specialMessage,
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
        if (!window.__timesheetEntries || window.__timesheetEntries.length === 0) {
            container.innerHTML = `<div class="traffic-light-standalone" title="No data"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>`;
            return;
        }

        const range = document.getElementById("filterRange")?.value || "week";
        const now = new Date();
        let startDate, endDate;
        if (range === "day") {
            startDate = new Date(now); startDate.setHours(0,0,0,0);
            endDate = new Date(now); endDate.setHours(23,59,59,999);
        } else if (range === "week") {
            const monday = getMonday(now);
            startDate = monday;
            endDate = new Date(monday); endDate.setDate(monday.getDate() + 6);
        } else if (range === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else {
            startDate = new Date(0);
            endDate = new Date();
        }

        const projectOptions = window.__timesheetProjectOptions || [];
        const health = analyzeTimesheetHealth(window.__timesheetEntries, startDate, endDate, projectOptions, range, now);

        const redLit = health.status === "red" ? "lit" : "";
        const amberLit = health.status === "amber" ? "lit" : "";
        const greenLit = health.status === "green" ? "lit" : "";

        let tooltip = `${health.status.toUpperCase()} – Score: ${health.score}/100`;
        if (health.reasons.length) {
            tooltip += `\nReasons: ${health.reasons.slice(0, 3).join(", ")}${health.reasons.length > 3 ? "..." : ""}`;
        }
        if (health.specialMessage) tooltip += `\n${health.specialMessage}`;
        tooltip += `\nTotal: ${health.metrics.totalHours}h | Missing: ${health.metrics.missingDays} | Admin: ${health.metrics.adminRatio}% | O/T: ${health.metrics.overtimeDays}`;

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
