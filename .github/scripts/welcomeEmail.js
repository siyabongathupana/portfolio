// .github/scripts/welcomeEmail.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;
const SENDER_NAME = 'Siya From Your Portfolio';

const NOTIFIED_FILE = path.join(__dirname, '..', '..', 'data', 'notified_users.json');
const USERS_DIR = path.join(__dirname, '..', '..', 'data', 'users');

const LOGO_URL = 'https://siyabongathupana.github.io/portfolio/logo.png';

// Safe read of notified users
function getNotifiedUsers() {
  if (!fs.existsSync(NOTIFIED_FILE)) return [];
  try {
    const content = fs.readFileSync(NOTIFIED_FILE, 'utf8').trim();
    if (!content) return [];
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    console.warn('Invalid notified_users.json, resetting to empty array.');
    return [];
  }
}

function saveNotifiedUsers(users) {
  fs.writeFileSync(NOTIFIED_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function sendWelcomeEmail(toEmail, username) {
  const appName = 'Your Portfolio';
  const loginUrl = 'https://siyabongathupana.github.io/portfolio/login.html';
  const guideUrl = 'https://siyabongathupana.github.io/portfolio/guide.html';
  const currentYear = new Date().getFullYear();

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${appName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { margin:0; padding:20px; background:#eef3fc; font-family:'Inter',sans-serif; }
    .container { max-width:600px; margin:0 auto; background:#fff; border-radius:24px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.05); }
    .header { background:#0b2b3b; padding:30px 20px; text-align:center; }
    .logo { max-width:80px; margin-bottom:15px; }
    .header h1 { color:#2fc7ff; font-size:28px; margin:0; font-weight:700; }
    .content { padding:40px 30px; color:#1e2a3e; line-height:1.6; }
    .content h2 { font-size:24px; font-weight:600; margin-top:0; color:#0b2b3b; }
    .button { display:inline-block; background:#2fc7ff; color:#0a2b33 !important; text-decoration:none; padding:12px 28px; border-radius:40px; font-weight:600; margin:20px 0; }
    .button:hover { background:#1d9fcf; color:white !important; }
    .feature-list { list-style:none; padding:0; margin:20px 0; }
    .feature-list li { margin-bottom:12px; padding-left:28px; position:relative; }
    .feature-list li:before { content:"✓"; color:#2fc7ff; font-weight:bold; position:absolute; left:0; }
    .footer { background:#f8fafc; padding:20px; text-align:center; font-size:12px; color:#5a7d9a; border-top:1px solid #e2e8f0; }
    .footer a { color:#2fc7ff; text-decoration:none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="${appName}" class="logo">
      <h1>${appName}</h1>
    </div>
    <div class="content">
      <h2>Welcome, ${username}!</h2>
      <p>Thank you for creating an account. You now have access to a powerful platform to manage your engineering portfolio, track time, and generate professional reports.</p>
      <div style="background:#f1f9fe; border-radius:16px; padding:20px; margin:25px 0;">
        <strong style="font-size:1.1rem;">✨ What you can do:</strong>
        <ul class="feature-list">
          <li>Add and manage your projects with images</li>
          <li>Upload certificates and credentials</li>
          <li>Log work hours with our advanced timesheet</li>
          <li>Generate beautiful PDF reports</li>
          <li>Export data to Excel</li>
        </ul>
      </div>
      <div style="text-align:center;">
        <a href="${loginUrl}" class="button">Go to Dashboard →</a>
      </div>
      <p style="margin-top:25px;">Need help? Check out the <a href="${guideUrl}" style="color:#2fc7ff;">User Guide</a> for detailed instructions.</p>
    </div>
    <div class="footer">
      <p>© ${currentYear} ${appName} — All data stored securely on GitHub.</p>
      <p>Contact: <a href="mailto:siyabongatshem@gmail.com">siyabongatshem@gmail.com</a></p>
    </div>
  </div>
</body>
</html>`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Welcome to ${appName}`,
    html: htmlContent
  });
}

async function main() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.error('SMTP credentials missing. Set SMTP_USER and SMTP_PASS secrets.');
    process.exit(1);
  }

  const notified = getNotifiedUsers();
  let userDirs = [];
  if (fs.existsSync(USERS_DIR)) {
    userDirs = fs.readdirSync(USERS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name.replace(/%40/g, '@'));
  }

  const newUsers = userDirs.filter(email => !notified.includes(email));

  if (newUsers.length === 0) {
    console.log('No new users to notify.');
    return;
  }

  console.log(`Sending welcome emails to: ${newUsers.join(', ')}`);

  for (const email of newUsers) {
    try {
      await sendWelcomeEmail(email, email);
      console.log(`Email sent to ${email}`);
      notified.push(email);
    } catch (err) {
      console.error(`Failed to send email to ${email}:`, err.message);
    }
  }

  saveNotifiedUsers(notified);
  console.log('Notified users list updated.');
}

main().catch(console.error);
