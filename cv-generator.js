// cv-generator.js – Professional CV generator using jsPDF + autoTable
// Depends on: shared.js, config.js, jspdf, jspdf-autotable

window.CVGenerator = (function() {
  // Helper to format date
  function formatDate(dateStr) {
    if (!dateStr) return 'Present';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  // Extract unique skills from projects
  function extractSkillsFromProjects(projects) {
    const skillsSet = new Set();
    for (const proj of Object.values(projects)) {
      if (proj.controllerType) {
        skillsSet.add(`DeltaV ${proj.controllerType} Controller`);
        if (proj.deltaVVersion) skillsSet.add(`DeltaV ${proj.deltaVVersion}`);
        if (proj.projectType) skillsSet.add(proj.projectType);
      }
      if (proj.technical && proj.technical.technologies) {
        proj.technical.technologies.split(',').forEach(t => skillsSet.add(t.trim()));
      }
      if (proj.technical && proj.technical.languages) {
        proj.technical.languages.split(',').forEach(l => skillsSet.add(l.trim()));
      }
      if (proj.technical && proj.technical.protocols) {
        proj.technical.protocols.split(',').forEach(p => skillsSet.add(p.trim()));
      }
      if (proj.industry) skillsSet.add(proj.industry);
    }
    return Array.from(skillsSet).sort();
  }

  // Get featured projects (top 5 by updatedAt or I/O count)
  function getFeaturedProjects(projects, limit = 5) {
    const projList = Object.values(projects);
    projList.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return projList.slice(0, limit);
  }

  // Calculate timesheet summary for a user
  async function getTimesheetSummary(user, pat) {
    try {
      const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
      const encUser = encodeURIComponent(user);
      const path = `${dataPath}/users/${encUser}/timesheet.json`;
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, pat);
      if (file && file.content) {
        const entries = JSON.parse(file.content);
        const totalHours = entries.reduce((s,e) => s + (e.hours || 0), 0);
        const billable = entries.filter(e => e.billable === 'yes').reduce((s,e) => s + (e.hours || 0), 0);
        const billablePct = totalHours ? ((billable / totalHours) * 100).toFixed(0) : 0;
        const uniqueDays = new Set(entries.map(e => e.date)).size;
        const avgDaily = uniqueDays ? (totalHours / uniqueDays).toFixed(1) : 0;
        return { totalHours: totalHours.toFixed(0), billablePct, avgDaily };
      }
    } catch(e) {}
    return { totalHours: 'N/A', billablePct: 'N/A', avgDaily: 'N/A' };
  }

  // Main public method: generate CV PDF
  async function generateCV(username = null) {
    // Check if jsPDF is available
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      console.error('jsPDF library not loaded');
      showToast('PDF library not loaded. Please refresh the page and try again.', 'error');
      window.hideLoading();
      return;
    }

    window.showLoading('Generating your professional CV...');
    try {
      let targetUser = username;
      let pat = null;
      if (!targetUser) {
        const current = window.SessionManager.getCurrentUser();
        if (current) {
          targetUser = current.username;
          pat = current.pat;
        } else {
          targetUser = window.APP_CONFIG.publicProfileEmail;
        }
      } else {
        pat = null;
      }

      // Fetch projects
      let projects = {};
      if (pat) {
        projects = await window.portfolioData.loadProjects();
      } else {
        const data = await window.portfolioData.loadProjectsForView();
        projects = data;
      }
      const projectsList = Object.values(projects);
      if (projectsList.length === 0) {
        showToast('No projects found to build CV.', 'error');
        window.hideLoading();
        return;
      }

      // Fetch certificates
      let certificates = [];
      if (pat) {
        certificates = await window.portfolioData.loadCertificates();
      } else {
        certificates = await window.portfolioData.loadCertificatesForView();
      }

      // Timesheet stats (only for logged-in user themselves)
      let timesheetStats = { totalHours: 'N/A', billablePct: 'N/A', avgDaily: 'N/A' };
      if (pat && targetUser === window.SessionManager.getCurrentUser()?.username) {
        timesheetStats = await getTimesheetSummary(targetUser, pat);
      }

      const skills = extractSkillsFromProjects(projects);
      const featuredProjects = getFeaturedProjects(projects, 5);
      const userName = targetUser.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const userTitle = 'Automation & Control Engineer';
      const summary = `Experienced automation engineer with ${projectsList.length}+ projects in DeltaV DCS, SIS, and industrial control systems. Skilled in system integration, PLC programming, and cybersecurity. Passionate about delivering high-quality automation solutions.`;

      // PDF generation
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Colors
      const primaryColor = [11, 43, 59];   // dark blue
      const accentColor = [47, 199, 255];  // light blue
      const lightGray = [245, 247, 250];
      const grayText = [100, 100, 100];

      // ========== HEADER ==========
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 48, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(26);
      doc.setFont(undefined, 'bold');
      doc.text(userName, pageWidth / 2, 22, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(userTitle, pageWidth / 2, 34, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(200, 200, 200);
      doc.text(targetUser, pageWidth / 2, 43, { align: 'center' });

      // Accent bar
      doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.rect(0, 48, pageWidth, 4, 'F');

      // ========== METRICS DASHBOARD ==========
      let y = 62;
      const metrics = [
        { label: 'Projects', value: projectsList.length, icon: '📁' },
        { label: 'Certifications', value: certificates.length, icon: '🎓' },
        { label: 'Total Hours', value: timesheetStats.totalHours !== 'N/A' ? timesheetStats.totalHours : 'N/A', icon: '⏱️' },
        { label: 'Billable %', value: timesheetStats.billablePct !== 'N/A' ? timesheetStats.billablePct + '%' : 'N/A', icon: '💰' }
      ];
      const metricWidth = (pageWidth - 40) / 4;
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const x = 20 + i * metricWidth;
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.roundedRect(x, y, metricWidth - 4, 18, 3, 3, 'F');
        doc.setFontSize(9);
        doc.setTextColor(grayText[0], grayText[1], grayText[2]);
        doc.text(m.icon + ' ' + m.label, x + 2, y + 6);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(m.value.toString(), x + 2, y + 14);
      }
      y += 22;

      // ========== PROFESSIONAL SUMMARY ==========
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('Professional Summary', 20, y);
      y += 4;
      doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.line(20, y, 70, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(50, 50, 50);
      const summaryLines = doc.splitTextToSize(summary, pageWidth - 40);
      doc.text(summaryLines, 20, y);
      y += summaryLines.length * 5 + 8;

      // ========== SKILLS (two columns using autoTable) ==========
      if (skills.length) {
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Core Competencies', 20, y);
        y += 4;
        doc.line(20, y, 70, y);
        y += 6;

        // Split skills into two columns
        const mid = Math.ceil(skills.length / 2);
        const leftSkills = skills.slice(0, mid);
        const rightSkills = skills.slice(mid);
        const skillRows = [];
        const maxRows = Math.max(leftSkills.length, rightSkills.length);
        for (let i = 0; i < maxRows; i++) {
          skillRows.push([leftSkills[i] || '', rightSkills[i] || '']);
        }
        doc.autoTable({
          startY: y,
          body: skillRows,
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 3, textColor: [50,50,50] },
          columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } },
          margin: { left: 20 },
          tableWidth: 160,
        });
        y = doc.lastAutoTable.finalY + 5;
      }

      // ========== FEATURED PROJECTS ==========
      if (featuredProjects.length) {
        if (y > pageHeight - 80) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Featured Projects', 20, y);
        y += 4;
        doc.line(20, y, 70, y);
        y += 6;

        for (let i = 0; i < featuredProjects.length; i++) {
          const p = featuredProjects[i];
          if (y > pageHeight - 55) {
            doc.addPage();
            y = 20;
          }
          // Project card background
          doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
          doc.roundedRect(18, y - 3, pageWidth - 36, 22, 4, 4, 'F');
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.text(`${i+1}. ${p.title}`, 22, y + 2);
          doc.setFontSize(8);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(grayText[0], grayText[1], grayText[2]);
          const role = p.userRole || (p.controllerType ? `DeltaV Engineer` : 'Project Lead');
          doc.text(`${role} | ${p.client || 'Confidential'} | ${p.duration || 'N/A'}`, 22, y + 7);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(50, 50, 50);
          const desc = (p.shortDesc || p.description || 'No description').substring(0, 100);
          const descLines = doc.splitTextToSize(desc, pageWidth - 50);
          doc.text(descLines, 22, y + 12);
          y += 24;
        }
      }

      // ========== CERTIFICATIONS ==========
      if (certificates.length) {
        if (y > pageHeight - 50) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Certifications', 20, y);
        y += 4;
        doc.line(20, y, 65, y);
        y += 6;

        const certRows = certificates.slice(0, 4).map(c => [c.title, c.issuer, c.date]);
        doc.autoTable({
          startY: y,
          head: [['Title', 'Issuer', 'Date']],
          body: certRows,
          theme: 'striped',
          headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9, halign: 'center' },
          bodyStyles: { fontSize: 9, textColor: [50,50,50] },
          margin: { left: 20 },
          tableWidth: pageWidth - 40,
        });
        y = doc.lastAutoTable.finalY + 8;
      }

      // ========== FOOTER ==========
      // QR Code linking to portfolio
      const qrDataURL = await generateQRCodeDataURL(window.location.origin, 25);
      if (qrDataURL) {
        doc.addImage(qrDataURL, 'PNG', pageWidth - 25, pageHeight - 18, 12, 12);
      }
      doc.setFontSize(7);
      doc.setTextColor(grayText[0], grayText[1], grayText[2]);
      doc.text(`Generated on ${new Date().toLocaleDateString()} from live portfolio data`, 20, pageHeight - 12);
      doc.text(`Portfolio: ${window.location.origin}`, 20, pageHeight - 6);
      doc.text('Your Portfolio System', pageWidth / 2, pageHeight - 6, { align: 'center' });

      // ========== WATERMARK ==========
      doc.setFontSize(50);
      doc.setTextColor(220, 220, 220);
      doc.setGState(new doc.GState({ opacity: 0.1 }));
      doc.text('CONFIDENTIAL', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
      doc.setGState(new doc.GState({ opacity: 1 }));

      // Save
      const fileName = `${userName.replace(/\s/g, '_')}_CV.pdf`;
      doc.save(fileName);
      showToast('CV generated successfully!', 'success');
    } catch (err) {
      console.error('CV generation error:', err);
      showToast('Failed to generate CV: ' + err.message, 'error');
    } finally {
      window.hideLoading();
    }
  }

  return { generateCV };
})();
