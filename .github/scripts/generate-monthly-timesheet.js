const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

// ======================== CONFIGURATION ========================
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const BRANCH = 'main';  // change if needed

// ======================== HELPER: FETCH FILE FROM GITHUB ========================
async function fetchGitHubFile(filePath) {
  const url = `${API_BASE}/${filePath}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

// ======================== HELPER: GET ALL USER DIRECTORIES ========================
async function listUsers() {
  const usersDir = `data/users`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${usersDir}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (!res.ok) return [];
  const items = await res.json();
  return items.filter(i => i.type === 'dir').map(i => decodeURIComponent(i.name));
}

// ======================== HELPER: READ PREFERENCES (NOTIFICATIONS) ========================
async function getNotificationPreference(username) {
  const prefPath = `data/users/${encodeURIComponent(username)}/preferences.json`;
  try {
    const prefs = await fetchGitHubFile(prefPath);
    return prefs?.notifications === true;
  } catch {
    return false;
  }
}

// ======================== HELPER: READ TIMESHEET ENTRIES ========================
async function getTimesheetEntries(username, year, month) {
  const timesheetPath = `data/users/${encodeURIComponent(username)}/timesheet.json`;
  try {
    const entries = await fetchGitHubFile(timesheetPath);
    if (!Array.isArray(entries)) return [];
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return entries.filter(entry => {
      const d = new Date(entry.date);
      return d >= startDate && d <= endDate;
    });
  } catch {
    return [];
  }
}

// ======================== HELPER: GENERATE EXCEL WITH LOGO ========================
async function generateExcel(entries, username, year, month, logoPath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Timesheet');

  // Load logo image from repository root
  const logoBuffer = fs.readFileSync(logoPath);
  const logoId = workbook.addImage({
    buffer: logoBuffer,
    extension: 'png'
  });

  // Merge top row for header area
  worksheet.mergeCells('A1:H1');
  worksheet.getRow(1).height = 60;

  // Insert logo (left side)
  worksheet.addImage(logoId, {
    tl: { col: 0, row: 0 },
    br: { col: 2, row: 1 },
    editAs: 'oneCell'
  });

  // Title text (beside logo)
  const titleCell = worksheet.getCell('C1');
  titleCell.value = `MONTHLY TIMESHEET – ${username}`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Period row
  worksheet.mergeCells('A2:H2');
  const periodCell = worksheet.getCell('A2');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  periodCell.value = `Period: ${monthNames[month-1]} ${year}`;
  periodCell.font = { italic: true, size: 10 };
  periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
  periodCell.alignment = { horizontal: 'center' };

  // Headers
  const headers = ['Date','Start','End','Hours','Project','Category','Billable','Notes'];
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Data rows
  let totalHours = 0;
  for (const entry of entries) {
    const hours = parseFloat(entry.hours) || 0;
    totalHours += hours;
    const row = worksheet.addRow([
      entry.date,
      entry.start,
      entry.end,
      hours.toFixed(2),
      entry.project,
      entry.category,
      entry.billable === 'yes' ? 'Billable' : 'Non-billable',
      entry.notes || ''
    ]);
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  }

  // Total row
  const totalRow = worksheet.addRow(['','','', totalHours.toFixed(2),'','','','']);
  totalRow.getCell(4).font = { bold: true };
  totalRow.eachCell(cell => {
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  });

  // Column widths
  worksheet.columns = [
    { width: 12 }, { width: 8 }, { width: 8 }, { width: 8 },
    { width: 25 }, { width: 18 }, { width: 12 }, { width: 35 }
  ];

  // Freeze header rows (first 3 rows: logo+title, period, headers)
  worksheet.views = [{ state: 'frozen', ySplit: 3 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// ======================== HELPER: SEND EMAIL ========================
async function sendEmail(toEmail, subject, text, attachmentBuffer, filename) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject: subject,
    text: text,
    attachments: [
      {
        filename: filename,
        content: attachmentBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ]
  });
}

// ======================== MAIN ========================
(async () => {
  try {
    // Get previous month (because we run on the 1st of current month)
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-based (0=January)
    if (month === 0) {
      month = 12;
      year--;
    }
    const monthStr = String(month).padStart(2,'0');
    const monthName = new Date(year, month-1, 1).toLocaleString('default', { month: 'long' });

    console.log(`Generating timesheets for ${monthName} ${year}`);

    const users = await listUsers();
    console.log(`Found ${users.length} users`);

    let sentCount = 0;
    for (const username of users) {
      const notifEnabled = await getNotificationPreference(username);
      if (!notifEnabled) {
        console.log(`Skipping ${username} – notifications disabled`);
        continue;
      }

      const entries = await getTimesheetEntries(username, year, month);
      if (entries.length === 0) {
        console.log(`No entries for ${username} in ${monthName} ${year} – skipping`);
        continue;
      }

      // The logo.png is expected at the repository root
      const logoPath = path.join(process.cwd(), 'logo.png');
      if (!fs.existsSync(logoPath)) {
        throw new Error('logo.png not found in repository root');
      }

      const excelBuffer = await generateExcel(entries, username, year, month, logoPath);
      const filename = `timesheet_${username}_${year}-${monthStr}.xlsx`;

      const totalHours = entries.reduce((s,e) => s + (parseFloat(e.hours) || 0), 0).toFixed(2);
      const subject = `Your Monthly Timesheet – ${monthName} ${year}`;
      const text = `Dear ${username},\n\nAttached is your timesheet for ${monthName} ${year}.\n\nTotal hours: ${totalHours}\n\nThis report is automatically generated by Your Portfolio System.\n\nRegards,\nPortfolio Admin`;

      await sendEmail(username, subject, text, excelBuffer, filename);
      console.log(`Sent to ${username}`);
      sentCount++;
    }

    console.log(`Done. Sent ${sentCount} timesheets.`);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
