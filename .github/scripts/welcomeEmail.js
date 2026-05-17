// .github/scripts/welcomeEmail.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

const NOTIFIED_FILE = path.join(__dirname, '..', '..', 'data', 'notified_users.json');
const USERS_DIR = path.join(__dirname, '..', '..', 'data', 'users');

function getNotifiedUsers() {
  if (fs.existsSync(NOTIFIED_FILE)) {
    return JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf8'));
  }
  return [];
}

function saveNotifiedUsers(users) {
  fs.writeFileSync(NOTIFIED_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function sendWelcomeEmail(toEmail, username) {
  const appName = 'Your Portfolio';
  const loginUrl = 'https://siyabongathupana.github.io/portfolio/login.html';
  const guideUrl = 'https://siyabongathupana.github.io/portfolio/guide.html';
  const currentYear = new Date().getFullYear();

  const htmlContent = `
    <h2>Welcome to ${appName}, ${username}!</h2>
    <p>Thank you for creating an account. You can now:</p>
    <ul>
      <li>Add and manage your projects</li>
      <li>Track your time with the timesheet</li>
      <li>Upload certificates and images</li>
      <li>Generate professional PDF reports</li>
    </ul>
    <p><a href="${loginUrl}">Click here to log in</a></p>
    <p>Need help? Check out the <a href="${guideUrl}">user guide</a>.</p>
    <p>Best regards,<br>The ${appName} Team</p>
    <p>© ${currentYear} ${appName}</p>
  `;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: FROM_EMAIL,
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
