const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const { execSync } = require('child_process');

const VERIFIED_FILE = 'data/verified_users.json';
const SENT_WELCOME_FILE = 'data/welcome_sent.json';

function loadSentWelcome() {
  try {
    if (fs.existsSync(SENT_WELCOME_FILE)) {
      return JSON.parse(fs.readFileSync(SENT_WELCOME_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sent: [] };
}

function saveSentWelcome(data) {
  fs.writeFileSync(SENT_WELCOME_FILE, JSON.stringify(data, null, 2));
  console.log(`Saved sent welcome list: ${data.sent.length} users`);
}

function getNewVerifiedUsers() {
  try {
    const prevContent = execSync('git show HEAD~1:data/verified_users.json 2>/dev/null || echo "{}"', { encoding: 'utf8' });
    const prevData = JSON.parse(prevContent);
    const currentData = JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf8'));
    
    const prevVerified = prevData.verified || [];
    const currentVerified = currentData.verified || [];
    
    return currentVerified.filter(email => !prevVerified.includes(email));
  } catch (e) {
    const currentData = JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf8'));
    return currentData.verified || [];
  }
}

function getSiteUrl() {
  const repoName = process.env.GITHUB_REPOSITORY_NAME || 'portfolio';
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'siyabongathupana';
  return process.env.SITE_URL || `https://${repoOwner}.github.io/${repoName}`;
}

async function sendWelcomeEmail(email) {
  const siteUrl = getSiteUrl();
  const dashboardUrl = `${siteUrl}/admin.html`;
  const guideUrl = `${siteUrl}/guide.html`;
  const projectsUrl = `${siteUrl}/projects.html`;
  const timesheetUrl = `${siteUrl}/timesheet.html`;
  const certificatesUrl = `${siteUrl}/certificates.html`;
  
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'siyabongathupana';
  const repoName = process.env.GITHUB_REPOSITORY_NAME || 'portfolio';
  const logoUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/logo.png`;
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const currentYear = new Date().getFullYear();
  const userName = email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);

  const mailOptions = {
    from: `"Your Portfolio" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Welcome to Your Portfolio – Account Verified',
    headers: {
      'X-Mailer': 'Your Portfolio System',
      'X-Account-Type': 'Professional'
    },
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Your Portfolio</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1a2a3a;
            background-color: #f0f4f8;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 580px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
          }
          .header {
            background: linear-gradient(135deg, #e8f4f8 0%, #d4eaf2 100%);
            padding: 40px 32px 32px;
            text-align: center;
            border-bottom: 1px solid #c5dfea;
          }
          .logo {
            max-width: 70px;
            height: auto;
            margin-bottom: 20px;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          }
          .header h1 {
            color: #1a5c6e;
            font-size: 28px;
            font-weight: 600;
            margin: 0 0 8px;
            letter-spacing: -0.3px;
          }
          .header .tagline {
            color: #4a7c8c;
            font-size: 15px;
            margin: 0;
          }
          .verification-badge {
            display: inline-block;
            background-color: #2fc7ff;
            color: #ffffff;
            padding: 6px 16px;
            border-radius: 30px;
            font-size: 12px;
            font-weight: 500;
            margin-top: 20px;
          }
          .content {
            padding: 36px 32px;
            background-color: #ffffff;
          }
          .greeting {
            font-size: 18px;
            color: #1a5c6e;
            margin-bottom: 20px;
            font-weight: 500;
          }
          .message {
            color: #3a5a6e;
            font-size: 15px;
            line-height: 1.7;
            margin-bottom: 16px;
          }
          .highlight {
            color: #2fc7ff;
            font-weight: 500;
          }
          .feature-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 32px 0;
          }
          .feature-card {
            background: #f8fcff;
            padding: 20px 16px;
            border-radius: 12px;
            text-align: center;
            border: 1px solid #e0f0f8;
            transition: all 0.2s ease;
          }
          .feature-icon {
            font-size: 28px;
            margin-bottom: 12px;
          }
          .feature-title {
            font-weight: 600;
            color: #1a5c6e;
            font-size: 14px;
            margin-bottom: 6px;
          }
          .feature-desc {
            font-size: 12px;
            color: #6a8ea0;
            line-height: 1.5;
          }
          .cta-wrapper {
            background: #f0f8fc;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            margin: 28px 0 20px;
          }
          .btn-primary {
            display: inline-block;
            background: #2fc7ff;
            color: #ffffff;
            padding: 12px 28px;
            border-radius: 40px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            margin: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(47, 199, 255, 0.25);
          }
          .btn-primary:hover {
            background: #1a9fcf;
          }
          .btn-secondary {
            display: inline-block;
            background: transparent;
            color: #2fc7ff;
            padding: 11px 27px;
            border-radius: 40px;
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
            border: 1px solid #2fc7ff;
            margin: 0 8px 8px 0;
          }
          .btn-secondary:hover {
            background: #e8f4fc;
          }
          .guide-section {
            background: #f8fcff;
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
            border: 1px solid #e0f0f8;
          }
          .guide-section h4 {
            color: #1a5c6e;
            font-size: 15px;
            font-weight: 600;
            margin: 0 0 12px;
          }
          .guide-links {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 12px;
          }
          .guide-link {
            color: #2fc7ff;
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
          }
          .guide-link:hover {
            text-decoration: underline;
          }
          .quick-links {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 20px;
            margin: 24px 0 16px;
          }
          .quick-link {
            color: #5a8ea0;
            text-decoration: none;
            font-size: 13px;
          }
          .quick-link:hover {
            color: #2fc7ff;
          }
          .footer {
            background-color: #f8fcff;
            padding: 28px 32px;
            text-align: center;
            border-top: 1px solid #e0f0f8;
          }
          .footer-links {
            margin-bottom: 16px;
          }
          .footer-links a {
            color: #5a8ea0;
            text-decoration: none;
            font-size: 12px;
            margin: 0 12px;
          }
          .footer-links a:hover {
            color: #2fc7ff;
          }
          .footer-text {
            font-size: 11px;
            color: #8aacbc;
            line-height: 1.5;
          }
          hr {
            border: none;
            border-top: 1px solid #e0f0f8;
            margin: 24px 0 16px;
          }
          @media (max-width: 500px) {
            body {
              padding: 10px;
            }
            .content {
              padding: 24px 20px;
            }
            .header {
              padding: 32px 24px;
            }
            .feature-grid {
              grid-template-columns: 1fr;
              gap: 12px;
            }
            .btn-primary, .btn-secondary {
              display: block;
              margin: 8px 0;
              text-align: center;
            }
            .quick-links {
              gap: 12px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="Your Portfolio Logo" class="logo" onerror="this.style.display='none'">
            <h1>Your Portfolio</h1>
            <div class="tagline">Professional Engineering Portfolio Platform</div>
            <div class="verification-badge">✓ Account Verified</div>
          </div>
          
          <div class="content">
            <div class="greeting">
              Welcome, ${userName}!
            </div>
            
            <div class="message">
              Thank you for verifying your email address. Your account is now <span class="highlight">fully activated</span> and you're ready to start building your professional portfolio.
            </div>
            
            <div class="message">
              Your Portfolio provides everything you need to showcase your engineering work, track your time, and manage your professional credentials.
            </div>
            
            <div class="feature-grid">
              <div class="feature-card">
                <div class="feature-icon">📁</div>
                <div class="feature-title">Projects</div>
                <div class="feature-desc">Create and manage engineering projects with images and specs</div>
              </div>
              <div class="feature-card">
                <div class="feature-icon">📜</div>
                <div class="feature-title">Certificates</div>
                <div class="feature-desc">Upload and showcase your professional certifications</div>
              </div>
              <div class="feature-card">
                <div class="feature-icon">⏱️</div>
                <div class="feature-title">Timesheet</div>
                <div class="feature-desc">Track working hours with detailed reporting</div>
              </div>
              <div class="feature-card">
                <div class="feature-icon">📊</div>
                <div class="feature-title">Reports</div>
                <div class="feature-desc">Generate professional PDF reports of your work</div>
              </div>
            </div>
            
            <div class="cta-wrapper">
              <a href="${dashboardUrl}" class="btn-primary">Go to Dashboard</a>
              <a href="${guideUrl}" class="btn-secondary">Read User Guide</a>
            </div>
            
            <div class="guide-section">
              <h4>Getting Started</h4>
              <p style="font-size: 13px; color: #5a7c8e; margin: 0 0 12px;">Here are a few things you can do right away:</p>
              <div class="quick-links">
                <a href="${projectsUrl}" class="quick-link">Add your first project</a>
                <a href="${certificatesUrl}" class="quick-link">Upload a certificate</a>
                <a href="${timesheetUrl}" class="quick-link">Log your first time entry</a>
              </div>
              <hr>
              <div class="guide-links">
                <a href="${guideUrl}" class="guide-link">Full User Guide</a>
                <a href="${dashboardUrl}" class="guide-link">Dashboard Overview</a>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${dashboardUrl}">Dashboard</a>
              <a href="${guideUrl}">Help Guide</a>
              <a href="${projectsUrl}">Projects</a>
              <a href="${timesheetUrl}">Timesheet</a>
            </div>
            <div class="footer-text">
              <p>© ${currentYear} Your Portfolio. All rights reserved.</p>
              <p>This email was sent to ${email} after account verification.</p>
              <p>If you received this in error, please contact support at ${process.env.FROM_EMAIL}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    console.log(`Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('WELCOME EMAIL SERVICE STARTED');
  console.log('='.repeat(50));
  
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP configuration missing. Cannot send emails.');
    process.exit(0);
  }
  
  if (!process.env.FROM_EMAIL) {
    console.error('FROM_EMAIL not set.');
    process.exit(0);
  }
  
  const sentWelcome = loadSentWelcome();
  const newUsers = getNewVerifiedUsers();
  
  console.log(`Newly verified users: ${newUsers.length}`);
  
  if (newUsers.length === 0) {
    console.log('No new verified users to send welcome emails');
    return;
  }
  
  console.log(`Users to notify: ${newUsers.join(', ')}`);
  
  let successCount = 0;
  for (const email of newUsers) {
    if (!sentWelcome.sent.includes(email)) {
      console.log(`Sending welcome email to ${email}...`);
      const success = await sendWelcomeEmail(email);
      if (success) {
        sentWelcome.sent.push(email);
        successCount++;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  saveSentWelcome(sentWelcome);
  
  console.log('='.repeat(50));
  console.log(`Completed: Sent ${successCount} welcome emails`);
  console.log(`Total users notified: ${sentWelcome.sent.length}`);
  console.log('='.repeat(50));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
