// trafficlight-full.js – Simple & correct (only past days matter)
(function() {
    // Helper: YYYY-MM-DD
    function formatYMD(d) {
        return d.toISOString().split('T')[0];
    }
    // Get Monday of a given date
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day === 0 ? 6 : day - 1);
        d.setDate(d.getDate() - diff);
        d.setHours(0,0,0,0);
        return d;
    }
    // Get all weekdays between start and end, but only up to a max date (exclusive)
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

    // ---------- MAIN ANALYSIS (PAST DAYS ONLY) ----------
    function analyze(entries, filterType, today = new Date()) {
        const todayStart = new Date(today);
        todayStart.setHours(0,0,0,0);

        // Determine effective date range
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
            const firstEntry = entries.reduce((earliest, e) => {
                const d = new Date(e.date);
                return d < earliest ? d : earliest;
            }, new Date(entries[0].date));
            startDate = firstEntry;
            endDate = todayStart; // up to today (but we'll exclude today for missing)
        }

        // For missing days & daily rules, we only consider days BEFORE today
        const cutoff = new Date(todayStart);
        cutoff.setDate(todayStart.getDate()); // same day, but we want days < today
        const pastDays = getWeekdaysUpTo(startDate, endDate, new Date(cutoff.getTime() - 86400000));
        const todayIsWeekday = todayStart.getDay() !== 0 && todayStart.getDay() !== 6;

        // Build map for past days
        const dayMap = new Map();
        pastDays.forEach(day => dayMap.set(formatYMD(day), { hours: 0, projects: new Set(), hasNotes: false }));

        // Also collect today's entries separately
        let todayHours = 0;
        let todayProjects = new Set();
        let todayHasNotes = false;
        let totalHours = 0;
        let adminHours = 0;
        let invalidProjects = new Set();
        let duplicateEntries = [];
        let negativeHours = false;

        // Process all entries (but only add to metrics for past days & today)
        entries.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate < startDate || entryDate > endDate) return;
            const ds = formatYMD(entryDate);
            const hours = entry.hours;
            if (hours < 0 || hours > 24) negativeHours = true;

            if (entryDate < todayStart) {
                // Past day
                if (dayMap.has(ds)) {
                    const d = dayMap.get(ds);
                    d.hours += hours;
                    if (entry.project) d.projects.add(entry.project);
                    if (entry.notes?.trim()) d.hasNotes = true;
                }
            } else if (entryDate.toDateString() === todayStart.toDateString()) {
                // Today
                todayHours += hours;
                if (entry.project) todayProjects.add(entry.project);
                if (entry.notes?.trim()) todayHasNotes = true;
            }
            totalHours += hours;
            if (entry.category === 'Admin') adminHours += hours;

            // Duplicate detection (across whole range)
            const key = `${entry.date}|${entry.start}|${entry.end}|${entry.project}`;
            if (seen.has(key)) duplicateEntries.push(entry);
            else seen.add(key);
        });

        // Also track for past days: missing, below target, etc.
        let missingPast = 0;
        let daysBelowTarget = 0;
        let daysAbove10 = 0;
        let daysAbove12 = 0;
        let daysManyProjects = 0;
        let overtimePast = 0;
        let notesMissingPast = 0;

        for (let [_, data] of dayMap) {
            const hrs = data.hours;
            const projCount = data.projects.size;
            const hasNotes = data.hasNotes;
            if (hrs === 0) missingPast++;
            if (hrs > 0 && hrs < 7.5) daysBelowTarget++;
            if (hrs > 10) daysAbove10++;
            if (hrs > 12) daysAbove12++;
            if (projCount > 4) daysManyProjects++;
            if (hrs > 8) overtimePast++;
            if (hrs > 0 && !hasNotes) notesMissingPast++;
        }

        // Compute admin ratio (over total hours, could be from past + today)
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;

        // Today's status (informational only, doesn't affect colour)
        let todayMsg = "";
        if (todayIsWeekday) {
            if (todayHours === 0) todayMsg = "No hours logged yet today.";
            else if (todayHours < 7.5) todayMsg = `${todayHours.toFixed(1)}h today (target 7.5–9h).`;
            else if (todayHours > 9) todayMsg = `${todayHours.toFixed(1)}h today (above 9h).`;
            else todayMsg = `${todayHours.toFixed(1)}h today – good range.`;
        } else {
            todayMsg = "Weekend – no expectation.";
        }

        // Determine colour based on PAST DAYS only
        let redFlags = [], amberFlags = [];

        if (missingPast >= 2) redFlags.push(`${missingPast} missing past working days`);
        else if (missingPast === 1) amberFlags.push("One missing past working day");

        if (daysAbove12 > 0) redFlags.push(`${daysAbove12} day(s) >12h`);
        if (overtimePast > 2 && filterType === 'week') amberFlags.push(`${overtimePast} overtime days (>8h)`);
        if (adminRatio > 15) amberFlags.push(`Admin hours ${adminRatio.toFixed(1)}% >15%`);
        if (daysBelowTarget > 0) amberFlags.push(`${daysBelowTarget} day(s) below 7.5h`);
        if (daysAbove10 > 0) amberFlags.push(`${daysAbove10} day(s) above 10h`);
        if (notesMissingPast > 0) amberFlags.push(`${notesMissingPast} missing notes`);
        if (daysManyProjects > 0) amberFlags.push(`${daysManyProjects} day(s) with >4 projects`);
        if (duplicateEntries.length > 0) redFlags.push(`${duplicateEntries.length} duplicate entries`);
        if (invalidProjects.size > 0) redFlags.push(`Invalid projects: ${[...invalidProjects].join(',')}`);
        if (negativeHours) redFlags.push("Negative hours");

        let status = "green";
        if (redFlags.length > 0) status = "red";
        else if (amberFlags.length > 0) status = "amber";

        // Special badges (keep simple)
        let specialMsg = "";
        if (totalHours >= 50) specialMsg = "⚠️ Burnout risk: 50+ hours.";
        else if (totalHours >= 40 && missingPast === 0 && adminRatio < 10) specialMsg = "⚡ Efficiency mode!";
        else if (totalHours >= 40 && missingPast === 0 && daysBelowTarget === 0 && daysAbove10 === 0) specialMsg = "🏆 Perfect week!";

        // Calculate a simple score
        let score = 100;
        if (status === "red") score = Math.max(0, 100 - redFlags.length * 15);
        if (status === "amber") score = Math.max(0, 100 - amberFlags.length * 5);
        if (specialMsg.includes("Perfect")) score = 100;
        if (specialMsg.includes("Efficiency")) score = 95;

        const reasons = status === "red" ? redFlags : (status === "amber" ? amberFlags : ["All good for past days."]);

        return {
            status,
            reasons,
            score,
            specialMsg,
            todayMsg,
            metrics: {
                totalHours: totalHours.toFixed(1),
                missingPast,
                adminRatio: adminRatio.toFixed(1),
                overtimeDays: overtimePast,
                duplicateCount: duplicateEntries.length,
                notesMissing: notesMissingPast
            }
        };
    }

    // ---------- UI update ----------
    function updateTrafficLight() {
        const container = document.getElementById("standaloneTrafficLight");
        if (!container) return;
        if (!window.__timesheetEntries || window.__timesheetEntries.length === 0) {
            container.innerHTML = `<div class="traffic-light-standalone" title="No data"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>`;
            return;
        }

        const range = document.getElementById("filterRange")?.value || "week";
        const now = new Date();
        const health = analyze(window.__timesheetEntries, range, now);

        const redLit = health.status === "red" ? "lit" : "";
        const amberLit = health.status === "amber" ? "lit" : "";
        const greenLit = health.status === "green" ? "lit" : "";

        let tooltip = `${health.status.toUpperCase()} – Score: ${health.score}/100\n`;
        tooltip += `📅 Past missing days: ${health.metrics.missingPast}\n`;
        tooltip += `📊 Total hours (period): ${health.metrics.totalHours}\n`;
        tooltip += `⚙️ Admin: ${health.metrics.adminRatio}% | O/T: ${health.metrics.overtimeDays}\n`;
        if (health.reasons.length) tooltip += `⚠️ Issues: ${health.reasons.slice(0,2).join(", ")}${health.reasons.length>2?"...":""}\n`;
        tooltip += `📌 Today: ${health.todayMsg}\n`;
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
