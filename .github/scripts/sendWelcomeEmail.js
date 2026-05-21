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
  const userName = email.split('@')[0];

  const mailOptions = {
    from: `"Your Portfolio" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Welcome to Your Portfolio - Account Activated',
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
            color: #333333;
            background-color: #f5f7fa;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          }
          .header {
            background-color: #0b2b3b;
            padding: 32px 24px;
            text-align: center;
          }
          .logo {
            max-width: 60px;
            height: auto;
            margin-bottom: 16px;
            border-radius: 12px;
          }
          .header h1 {
            color: #ffffff;
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 4px;
          }
          .header p {
            color: #a0c4d4;
            font-size: 14px;
            margin: 0;
          }
          .content {
            padding: 32px 28px;
            background-color: #ffffff;
          }
          .greeting {
            font-size: 16px;
            color: #1e2a3e;
            margin-bottom: 20px;
            font-weight: 500;
          }
          .message {
            color: #4a5568;
            font-size: 15px;
            line-height: 1.7;
            margin-bottom: 24px;
          }
          .divider {
            height: 1px;
            background-color: #e2e8f0;
            margin: 24px 0;
          }
          .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #1e2a3e;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #2fc7ff;
            display: inline-block;
          }
          .feature-grid {
            display: table;
            width: 100%;
            margin: 20px 0;
            border-collapse: collapse;
          }
          .feature-row {
            display: table-row;
          }
          .feature-cell {
            display: table-cell;
            padding: 12px 8px 12px 0;
            border-bottom: 1px solid #f0f2f5;
            vertical-align: top;
          }
          .feature-icon {
            width: 40px;
            font-size: 20px;
            color: #2fc7ff;
          }
          .feature-title {
            font-weight: 600;
            color: #1e2a3e;
            margin-bottom: 4px;
          }
          .feature-desc {
            font-size: 13px;
            color: #718096;
          }
          .cta-section {
            background-color: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 24px 0;
            border: 1px solid #e2e8f0;
          }
          .btn-primary {
            display: inline-block;
            background-color: #2fc7ff;
            color: #0a2b33;
            padding: 12px 28px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            margin: 0 8px 8px 0;
            border: none;
          }
          .btn-primary:hover {
            background-color: #1d9fcf;
            color: #ffffff;
          }
          .btn-secondary {
            display: inline-block;
            background-color: transparent;
            color: #2fc7ff;
            padding: 11px 27px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
            border: 1px solid #2fc7ff;
            margin: 0 8px 8px 0;
          }
          .btn-secondary:hover {
            background-color: #2fc7ff;
            color: #0a2b33;
          }
          .guide-box {
            background-color: #f8fafc;
            border-left: 3px solid #2fc7ff;
            padding: 16px 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
          }
          .guide-box p {
            margin: 0 0 8px;
            font-size: 14px;
            color: #4a5568;
          }
          .guide-box ul {
            margin: 8px 0 0;
            padding-left: 20px;
          }
          .guide-box li {
            font-size: 13px;
            color: #718096;
            margin: 4px 0;
          }
          .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          .footer-links {
            margin-bottom: 16px;
          }
          .footer-links a {
            color: #2fc7ff;
            text-decoration: none;
            font-size: 12px;
            margin: 0 12px;
          }
          .footer-links a:hover {
            text-decoration: underline;
          }
          .footer-text {
            font-size: 11px;
            color: #a0aec0;
            line-height: 1.5;
          }
          @media (max-width: 500px) {
            .content {
              padding: 24px 20px;
            }
            .feature-cell {
              display: block;
              width: 100%;
            }
            .feature-row {
              display: block;
              margin-bottom: 16px;
            }
            .feature-icon {
              width: auto;
              margin-bottom: 4px;
            }
            .btn-primary, .btn-secondary {
              display: block;
              margin: 8px 0;
              text-align: center;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="Logo" class="logo" onerror="this.style.display='none'">
            <h1>Your Portfolio</h1>
            <p>Professional Engineering Portfolio Platform</p>
          </div>
          
          <div class="content">
            <div class="greeting">
              Dear ${userName},
            </div>
            
            <div class="message">
              Thank you for verifying your email address. Your account has been successfully activated and you now have full access to all features of Your Portfolio.
            </div>
            
            <div class="message">
              Your Portfolio is a comprehensive platform designed for engineering professionals to manage projects, track time, and showcase certifications.
            </div>
            
            <div class="divider"></div>
            
            <div class="section-title">Available Features</div>
            
            <div class="feature-grid">
              <div class="feature-row">
                <div class="feature-cell feature-icon">📁</div>
                <div class="feature-cell">
                  <div class="feature-title">Project Management</div>
                  <div class="feature-desc">Create and manage engineering projects with detailed specifications and images</div>
                </div>
              </div>
              <div class="feature-row">
                <div class="feature-cell feature-icon">📜</div>
                <div class="feature-cell">
                  <div class="feature-title">Certificates</div>
                  <div class="feature-desc">Upload and organize professional certifications and credentials</div>
                </div>
              </div>
              <div class="feature-row">
                <div class="feature-cell feature-icon">⏱️</div>
                <div class="feature-cell">
                  <div class="feature-title">Timesheet</div>
                  <div class="feature-desc">Track working hours with integrated timesheet system</div>
                </div>
              </div>
              <div class="feature-row">
                <div class="feature-cell feature-icon">📊</div>
                <div class="feature-cell">
                  <div class="feature-title">PDF Reports</div>
                  <div class="feature-desc">Generate professional PDF reports for projects and time entries</div>
                </div>
              </div>
              <div class="feature-row">
                <div class="feature-cell feature-icon">🖼️</div>
                <div class="feature-cell">
                  <div class="feature-title">Image Gallery</div>
                  <div class="feature-desc">Upload project images with automatic compression</div>
                </div>
              </div>
              <div class="feature-row">
                <div class="feature-cell feature-icon">🔒</div>
                <div class="feature-cell">
                  <div class="feature-title">Secure Storage</div>
                  <div class="feature-desc">End-to-end encrypted data storage on GitHub</div>
                </div>
              </div>
            </div>
            
            <div class="cta-section">
              <a href="${dashboardUrl}" class="btn-primary">Access Dashboard</a>
              <a href="${guideUrl}" class="btn-secondary">Read User Guide</a>
            </div>
            
            <div class="guide-box">
              <p><strong>New to the platform?</strong></p>
              <p>The User Guide provides comprehensive information about:</p>
              <ul>
                <li>Setting up your first project</li>
                <li>Managing timesheet entries</li>
                <li>Uploading certificates and images</li>
                <li>Generating PDF reports</li>
                <li>Account security best practices</li>
              </ul>
            </div>
            
            <div class="message" style="font-size: 13px; color: #718096; font-style: italic; margin-top: 20px;">
              Tip: Start by adding your first project from the dashboard. The interface will guide you through the process.
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${dashboardUrl}">Dashboard</a>
              <a href="${guideUrl}">User Guide</a>
              <a href="${projectsUrl}">Projects</a>
              <a href="${timesheetUrl}">Timesheet</a>
            </div>
            <div class="footer-text">
              <p>© ${currentYear} Your Portfolio. All rights reserved.</p>
              <p>This email was sent to ${email} following account verification.</p>
              <p>If you did not create this account, please contact support at ${process.env.FROM_EMAIL}</p>
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
