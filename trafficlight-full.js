// trafficlight-full.js – COMPLETE with Weekly Hours Fix, Logo & QR in PDF
(function() {
    // ---------- GET TODAY'S DATE IN UTC ----------
    function getTodayUTC() {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d.toISOString().split('T')[0];
    }
    
    function formatYMD(d) {
        return d.toISOString().split('T')[0];
    }
    
    function getMonday(date) {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        const day = d.getUTCDay();
        const diff = (day === 0 ? 6 : day - 1);
        d.setUTCDate(d.getUTCDate() - diff);
        return d;
    }
    
    // ---------- SOUTH AFRICAN PUBLIC HOLIDAYS ----------
    function isSouthAfricanPublicHoliday(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const fixedHolidays = [
            `${year}-01-01`, `${year}-03-21`, `${year}-04-27`, `${year}-05-01`,
            `${year}-06-16`, `${year}-08-09`, `${year}-09-24`, `${year}-12-16`,
            `${year}-12-25`, `${year}-12-26`
        ];
        
        const easter = getEasterDate(year);
        const goodFriday = new Date(easter);
        goodFriday.setDate(easter.getDate() - 2);
        const easterMonday = new Date(easter);
        easterMonday.setDate(easter.getDate() + 1);
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
    
    function getWorkingDaysUpTo(start, end, maxDate) {
        const working = [];
        let current = new Date(start);
        current.setUTCHours(0, 0, 0, 0);
        const limit = new Date(maxDate < end ? maxDate : end);
        limit.setUTCHours(0, 0, 0, 0);
        
        while (current <= limit) {
            const utcDay = current.getUTCDay();
            const isWeekend = (utcDay === 0 || utcDay === 6);
            const isHoliday = isSouthAfricanPublicHoliday(current);
            if (!isWeekend && !isHoliday) {
                working.push(new Date(current));
            }
            current.setUTCDate(current.getUTCDate() + 1);
        }
        return working;
    }
    
    function checkTrainingThisMonth(entries, todayYMD) {
        const year = parseInt(todayYMD.substring(0, 4));
        const month = parseInt(todayYMD.substring(5, 7)) - 1;
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
    
    // ---------- MAIN ANALYSIS ----------
    function analyzeTimesheetHealth(entries, filterType, todayYMD) {
        const todayDate = new Date(todayYMD + "T00:00:00Z");
        // Determine if we are late in the week (Friday or later) – used for weekly hour rules
        const todayDayOfWeek = todayDate.getUTCDay(); // Monday=1, Friday=5, Sunday=0
        const isLateWeek = (todayDayOfWeek >= 5); // Friday, Saturday, or Sunday
        
        let startDate, endDate;
        if (filterType === 'day') {
            startDate = todayDate;
            endDate = todayDate;
        } else if (filterType === 'week') {
            const monday = getMonday(todayDate);
            startDate = monday;
            endDate = new Date(monday);
            endDate.setUTCDate(monday.getUTCDate() + 6);
        } else if (filterType === 'month') {
            startDate = new Date(Date.UTC(parseInt(todayYMD.substring(0,4)), parseInt(todayYMD.substring(5,7))-1, 1));
            endDate = new Date(Date.UTC(parseInt(todayYMD.substring(0,4)), parseInt(todayYMD.substring(5,7)), 0));
        } else {
            const first = getEarliestEntryDate(entries);
            if (!first) return null;
            startDate = first;
            endDate = todayDate;
        }
        
        const yesterday = new Date(todayDate);
        yesterday.setUTCDate(todayDate.getUTCDate() - 1);
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
            const entryDate = new Date(entry.date + "T00:00:00Z");
            const entryYMD = formatYMD(entryDate);
            
            if (entryDate < startDate || entryDate > endDate) return;
            
            const hrs = entry.hours;
            totalHours += hrs;
            if (entry.category === 'Admin') adminHours += hrs;
            if (hrs < 0 || hrs > 24) negativeHours = true;
            
            const key = `${entry.date}|${entry.start}|${entry.end}|${entry.project}`;
            if (seen.has(key)) duplicateEntries.push(entry);
            else seen.add(key);
            
            if (entryDate < todayDate) {
                if (dayMap.has(entryYMD)) {
                    const d = dayMap.get(entryYMD);
                    d.hours += hrs;
                    if (entry.project) d.projects.add(entry.project);
                    if (entry.notes && entry.notes.trim()) d.hasNotes = true;
                }
            } else if (entryYMD === todayYMD) {
                todayHours += hrs;
            }
        });
        
        if (window.__timesheetProjectOptions && window.__timesheetProjectOptions.length) {
            entries.forEach(entry => {
                const entryDate = new Date(entry.date + "T00:00:00Z");
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
            } else {
                if (hrs < 7.5) daysBelowTarget++;
                if (hrs < 7.5 || hrs > 9) daysOutside759++;
                if (hrs > 10) daysAbove10++;
                if (hrs > 12) daysAbove12++;
                if (projCount > 4) daysManyProjects++;
                if (hrs > 8) overtimeDays++;
                if (!hasNotes) notesMissing++;
            }
            if (hrs === 0) zeroHourDays++;
        }
        
        const totalProjectsWorked = new Set(Array.from(dayMap.values()).flatMap(d => Array.from(d.projects))).size;
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        const consecutiveMissing = findConsecutiveMissing(workingDays, dayMap);
        const trainingThisMonth = checkTrainingThisMonth(entries, todayYMD);
        const hasWeekendWork = checkWeekendWork(entries, startDate, endDate);
        const unallocated = entries.filter(e => {
            const d = new Date(e.date + "T00:00:00Z");
            return d >= startDate && d <= endDate && (!e.project || e.project.trim() === "");
        }).length;
        const weeklyTargetReached = totalHours >= 40;
        const weeklySignificantlyBelow = totalHours < 30;
        
        let redFlags = [], amberFlags = [];
        
        if (filterType === 'week' || filterType === 'day') {
            if (missingDays >= 2) redFlags.push(missingDays + " missing working days");
            else if (missingDays === 1) amberFlags.push("One missing working day");
        } else {
            if (missingDays > 15) redFlags.push("Many missing working days (" + missingDays + ")");
        }
        
        // *** FIX: Only apply weekly hour rules on Friday or later ***
        if (weeklySignificantlyBelow && filterType === 'week' && isLateWeek) redFlags.push("Weekly hours <30h");
        if (negativeHours) redFlags.push("Negative/Impossible hours");
        if (duplicateEntries.length) redFlags.push(duplicateEntries.length + " duplicate entries");
        if (daysAbove12) redFlags.push(daysAbove12 + " day(s) >12h");
        if (zeroHourDays > 3) redFlags.push("Multiple zero-hour days");
        if (consecutiveMissing >= 3) redFlags.push("3+ consecutive missing days");
        if (invalidProjects.size) redFlags.push("Invalid projects: " + [...invalidProjects].join(','));
        if (unallocated) redFlags.push(unallocated + " unallocated entries");
        
        if (daysBelowTarget) amberFlags.push(daysBelowTarget + " day(s) below 7.5h");
        if (daysAbove10) amberFlags.push(daysAbove10 + " day(s) above 10h");
        if (filterType === 'week' && !weeklyTargetReached && isLateWeek) amberFlags.push("Weekly target <40h");
        if (adminRatio > 15) amberFlags.push("Admin " + adminRatio.toFixed(1) + "% >15%");
        if (notesMissing) amberFlags.push(notesMissing + " missing notes");
        if (daysManyProjects) amberFlags.push(daysManyProjects + " day(s) >4 projects");
        if (!trainingThisMonth) amberFlags.push("No training this month");
        if (overtimeDays > 2) amberFlags.push(overtimeDays + " overtime days (>8h)");
        
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
        if (filterType === 'week' && !weeklyTargetReached && totalHours < 40 && isLateWeek) score -= weights.weeklyTargetNotReached;
        score = Math.max(0, Math.min(100, score));
        if (specialBadge === "rockstar" || specialBadge === "perfect") score = 100;
        if (specialBadge === "efficiency") score = 95;
        
        const todayIsWeekday = todayDate.getUTCDay() !== 0 && todayDate.getUTCDay() !== 6;
        const todayIsHoliday = isSouthAfricanPublicHoliday(todayDate);
        let todayMsg = "";
        if (filterType === 'day') {
            if (todayHours === 0) todayMsg = "No hours logged yet today.";
            else if (todayHours < 7.5) todayMsg = todayHours.toFixed(1) + "h today (below target).";
            else if (todayHours > 9) todayMsg = todayHours.toFixed(1) + "h today (above target).";
            else todayMsg = todayHours.toFixed(1) + "h today – good range.";
        } else {
            if (todayIsWeekday && !todayIsHoliday) {
                if (todayHours === 0) todayMsg = "No hours logged yet today (not penalised).";
                else todayMsg = "Today: " + todayHours.toFixed(1) + "h so far.";
            } else if (todayIsHoliday) {
                todayMsg = "Today is a public holiday – no expectation.";
            } else {
                todayMsg = "Weekend – no expectation.";
            }
        }
        
        return {
            status: status,
            reasons: reasons,
            score: score,
            specialMsg: specialMsg,
            todayMsg: todayMsg,
            missingDates: missingDates,
            metrics: {
                totalHours: totalHours.toFixed(1),
                missingDays: missingDays,
                adminRatio: adminRatio.toFixed(1),
                overtimeDays: overtimeDays,
                duplicateCount: duplicateEntries.length,
                notesMissing: notesMissing
            }
        };
    }
    
    // ---------- PDF DOWNLOAD WITH LOGO AND QR CODE ----------
    async function downloadRulesPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let y = 20;
        
        // ---- Add Logo (small) ----
        try {
            const logoResponse = await fetch('logo.png');
            if (logoResponse.ok) {
                const logoBlob = await logoResponse.blob();
                const logoDataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(logoBlob);
                });
                // Place logo at top right, 15x15 mm
                doc.addImage(logoDataUrl, 'PNG', pageWidth - 30, 10, 15, 15);
            }
        } catch(e) { console.warn("Logo not loaded", e); }
        
        // Title
        doc.setFontSize(24);
        doc.setTextColor(11, 43, 59);
        doc.setFont("helvetica", "bold");
        doc.text("Timesheet Traffic Light – Rules", pageWidth / 2, y, { align: 'center' });
        y += 15;
        doc.setDrawColor(47, 199, 255);
        doc.setLineWidth(1);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.setFont("helvetica", "normal");
        doc.text("This document explains the rules behind the traffic light on your timesheet page.", margin, y);
        y += 8;
        doc.text("The light evaluates your timesheet based on past working days only (Mon–Fri, excluding South African public holidays).", margin, y);
        y += 12;
        
        // GREEN
        doc.setFillColor(40, 167, 69);
        doc.rect(margin, y, 5, 5, 'F');
        doc.setFontSize(12);
        doc.setTextColor(40, 167, 69);
        doc.setFont("helvetica", "bold");
        doc.text(" GREEN – Healthy Timesheet", margin + 8, y + 4);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        var greenRules = [
            "• No missing working days (past)",
            "• Each logged day: 7.5 – 9 hours",
            "• Weekly total hours >= 40 (checked only on Friday or later)",
            "• Admin hours <= 15% of total",
            "• No overtime days (>8h)",
            "• No duplicate entries",
            "• All entries have notes",
            "• No invalid project codes",
            "• No unallocated hours",
            "• At least one project worked",
            "• No negative or impossible hours"
        ];
        for (var i = 0; i < greenRules.length; i++) {
            doc.text(greenRules[i], margin + 4, y);
            y += 5;
        }
        y += 5;
        
        // AMBER
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFillColor(255, 193, 7);
        doc.rect(margin, y, 5, 5, 'F');
        doc.setFontSize(12);
        doc.setTextColor(255, 193, 7);
        doc.setFont("helvetica", "bold");
        doc.text(" AMBER – Attention Required", margin + 8, y + 4);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        var amberRules = [
            "• One missing working day (past)",
            "• Daily hours below 7.5h or above 10h (but <=12h)",
            "• Weekly total <40h (only checked on Friday or later)",
            "• Admin hours >15% (but <=25%)",
            "• Missing notes on some entries",
            "• More than 4 projects in one day",
            "• No training logged in current month",
            "• Overtime worked more than twice in the week"
        ];
        for (var i = 0; i < amberRules.length; i++) {
            doc.text(amberRules[i], margin + 4, y);
            y += 5;
        }
        y += 5;
        
        // RED
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFillColor(220, 53, 69);
        doc.rect(margin, y, 5, 5, 'F');
        doc.setFontSize(12);
        doc.setTextColor(220, 53, 69);
        doc.setFont("helvetica", "bold");
        doc.text(" RED – Action Required", margin + 8, y + 4);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        var redRules = [
            "• Two or more missing working days (past)",
            "• Weekly hours <30h (only checked on Friday or later)",
            "• Any negative or impossible hours",
            "• Duplicate entries detected",
            "• More than 12 hours worked in one day",
            "• Multiple zero-hour days (>3)",
            "• 3+ consecutive missing days",
            "• Invalid project codes",
            "• Unallocated hour entries",
            "• Burnout risk (>=5 overtime days, weekend work, or >=50h week)"
        ];
        for (var i = 0; i < redRules.length; i++) {
            doc.text(redRules[i], margin + 4, y);
            y += 5;
        }
        y += 5;
        
        // Special Badges
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setTextColor(108, 117, 125);
        doc.setFont("helvetica", "bold");
        doc.text("✨ Special Badges", margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        var badges = [
            "• Perfect Week: All GREEN criteria met, no corrections, submitted early.",
            "• Efficiency Mode: 40h week, no overtime, no missing days, admin <10%.",
            "• Rockstar Week: Perfect week + training logged + zero corrections.",
            "• Burnout Risk: Forces RED status – unsustainable workload."
        ];
        for (var i = 0; i < badges.length; i++) {
            doc.text(badges[i], margin + 4, y);
            y += 5;
        }
        y += 5;
        
        // Health Score Weights
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setTextColor(108, 117, 125);
        doc.setFont("helvetica", "bold");
        doc.text("📊 Health Score Calculation (0–100)", margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.setFont("helvetica", "normal");
        doc.text("The score starts at 100 and is reduced by weighted penalties:", margin, y);
        y += 5;
        var weightsList = [
            "• Missing working day: -25 each (max -50)",
            "• Weekly hours <30h: -30",
            "• Duplicate entry: -5 each (max -15)",
            "• Invalid project code: -10 each (max -20)",
            "• Unallocated entry: -8 each (max -15)",
            "• Day >12h: -15 each",
            "• >3 zero-hour days: -8",
            "• 3+ consecutive missing days: -12",
            "• Missing description: -2 each (max -10)",
            "• Admin >15%: -5",
            "• No training this month: -2",
            "• Overtime day (over 2): -3 each extra day",
            "• Day above 10h: -3 each",
            "• Day below 7.5h: -3 each",
            "• >4 projects in a day: -2 each",
            "• Weekly target not reached (<40h): -5"
        ];
        for (var i = 0; i < weightsList.length; i++) {
            doc.text(weightsList[i], margin + 4, y);
            y += 5;
        }
        y += 5;
        
        // ---- Footer with QR Code ----
        const repoUrl = "https://github.com/siyabongathupana/portfolio";
        try {
            // Generate QR code using the QRCode.js library (already loaded on page)
            if (typeof QRCode !== 'undefined') {
                const qrContainer = document.createElement('div');
                new QRCode(qrContainer, { text: repoUrl, width: 40, height: 40, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
                await new Promise(r => setTimeout(r, 200));
                const qrCanvas = qrContainer.querySelector('canvas');
                if (qrCanvas) {
                    const qrDataUrl = qrCanvas.toDataURL('image/png');
                    doc.addImage(qrDataUrl, 'PNG', pageWidth - 25, y + 5, 12, 12);
                }
            }
        } catch(e) { console.warn("QR generation failed", e); }
        
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Generated: " + new Date().toLocaleString() + " | Your Portfolio Timesheet System", margin, y + 10);
        doc.text("The traffic light evaluates only past working days (Mon–Fri, excluding SA public holidays).", margin, y + 15);
        doc.text("Today's progress is shown in the tooltip but never penalises the colour.", margin, y + 20);
        doc.text("Repo: " + repoUrl, margin, y + 25);
        
        doc.save("Timesheet_TrafficLight_Rules.pdf");
    }
    
    // ---------- UI UPDATE ----------
    function updateTrafficLight() {
        var container = document.getElementById("standaloneTrafficLight");
        if (!container) return;
        if (!window.__timesheetEntries || !window.__timesheetEntries.length) {
            container.innerHTML = '<div class="traffic-light-standalone" title="No data"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>';
            return;
        }
        
        var range = document.getElementById("filterRange") ? document.getElementById("filterRange").value : "week";
        var todayYMD = getTodayUTC();
        var health = analyzeTimesheetHealth(window.__timesheetEntries, range, todayYMD);
        
        if (!health) {
            container.innerHTML = '<div class="traffic-light-standalone" title="Error"><div class="light red"></div><div class="light amber"></div><div class="light green"></div></div>';
            return;
        }
        
        var redLit = health.status === "red" ? "lit" : "";
        var amberLit = health.status === "amber" ? "lit" : "";
        var greenLit = health.status === "green" ? "lit" : "";
        
        var tooltip = health.status.toUpperCase() + " – Score: " + health.score + "/100\n";
        tooltip += "📅 Past missing working days: " + health.metrics.missingDays;
        if (health.missingDates.length) {
            tooltip += " [" + health.missingDates.slice(0, 3).join(", ") + (health.missingDates.length > 3 ? "..." : "") + "]";
        }
        tooltip += "\n📊 Total hours (period): " + health.metrics.totalHours + "\n";
        tooltip += "⚙️ Admin: " + health.metrics.adminRatio + "% | O/T days: " + health.metrics.overtimeDays + "\n";
        if (health.reasons.length) tooltip += "⚠️ Issues: " + health.reasons.slice(0, 2).join(", ") + (health.reasons.length > 2 ? "..." : "") + "\n";
        tooltip += "📌 " + health.todayMsg + "\n";
        if (health.specialMsg) tooltip += "🏅 " + health.specialMsg;
        
        var html = '<div class="traffic-light-standalone" title="' + tooltip.replace(/"/g, '&quot;') + '">' +
            '<div class="light red ' + redLit + '"></div>' +
            '<div class="light amber ' + amberLit + '"></div>' +
            '<div class="light green ' + greenLit + '"></div>' +
            '</div>';
        container.innerHTML = html;
    }
    
    // ---------- EVENT LISTENERS ----------
    document.addEventListener("timesheetUpdated", updateTrafficLight);
    $(document).ready(function() {
        $("#filterRange, #filterProject, #filterCategory").on("change", updateTrafficLight);
        $("#downloadRulesBtn").on("click", function(e) {
            e.preventDefault();
            downloadRulesPDF();
        });
        setTimeout(updateTrafficLight, 500);
    });
    window.refreshStandaloneLight = updateTrafficLight;
})();
