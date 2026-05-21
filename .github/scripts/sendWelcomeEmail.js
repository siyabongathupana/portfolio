const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const { execSync } = require('child_process');

const VERIFIED_FILE = 'data/verified_users.json';
const SENT_WELCOME_FILE = 'data/welcome_sent.json';

// Load sent welcome emails
function loadSentWelcome() {
  try {
    if (fs.existsSync(SENT_WELCOME_FILE)) {
      return JSON.parse(fs.readFileSync(SENT_WELCOME_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sent: [] };
}

// Save sent welcome emails
function saveSentWelcome(data) {
  fs.writeFileSync(SENT_WELCOME_FILE, JSON.stringify(data, null, 2));
  console.log(`Saved sent welcome list: ${data.sent.length} users`);
}

// Get new verified users from git diff
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

// Get the site URL from environment or construct it
function getSiteUrl() {
  const repoName = process.env.GITHUB_REPOSITORY_NAME || 'portfolio';
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'siyabongathupana';
  return process.env.SITE_URL || `https://${repoOwner}.github.io/${repoName}`;
}

// Send beautiful welcome email
async function sendWelcomeEmail(email) {
  const siteUrl = getSiteUrl();
  const dashboardUrl = `${siteUrl}/admin.html`;
  const guideUrl = `${siteUrl}/guide.html`;
  const projectsUrl = `${siteUrl}/projects.html`;
  const timesheetUrl = `${siteUrl}/timesheet.html`;
  
  // Logo URL - using raw GitHub URL for the logo
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
    subject: '🎉 Welcome to Your Portfolio! Your Engineering Journey Starts Here',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Your Portfolio</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #eef3fc 0%, #dce8f0 100%);
            margin: 0;
            padding: 20px;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          
          /* Header Section */
          .email-header {
            background: linear-gradient(135deg, #0b2b3b 0%, #1a4d5f 100%);
            padding: 40px 30px;
            text-align: center;
            position: relative;
          }
          
          .logo-container {
            margin-bottom: 20px;
          }
          
          .logo {
            max-width: 80px;
            height: auto;
            border-radius: 16px;
          }
          
          .email-header h1 {
            color: #ffffff;
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 10px;
            letter-spacing: -0.5px;
          }
          
          .email-header .tagline {
            color: rgba(255, 255, 255, 0.9);
            font-size: 16px;
            font-weight: 500;
          }
          
          .welcome-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            padding: 8px 20px;
            border-radius: 50px;
            margin-top: 20px;
            font-size: 14px;
            color: #ffffff;
          }
          
          /* Content Section */
          .email-content {
            padding: 40px 30px;
            background: #ffffff;
          }
          
          .greeting {
            font-size: 18px;
            color: #1e2a3e;
            margin-bottom: 25px;
          }
          
          .greeting strong {
            color: #2fc7ff;
          }
          
          .intro-text {
            color: #4a627a;
            margin-bottom: 30px;
            font-size: 16px;
            line-height: 1.7;
          }
          
          /* Features Grid */
          .features-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 30px 0;
          }
          
          .feature-card {
            background: #f8fafc;
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            border: 1px solid #e2e8f0;
          }
          
          .feature-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
          }
          
          .feature-icon {
            font-size: 32px;
            margin-bottom: 12px;
            display: inline-block;
          }
          
          .feature-card h3 {
            font-size: 16px;
            font-weight: 600;
            color: #1e2a3e;
            margin-bottom: 8px;
          }
          
          .feature-card p {
            font-size: 13px;
            color: #5a7d9a;
            line-height: 1.5;
          }
          
          /* Quick Stats */
          .stats-section {
            background: linear-gradient(135deg, #0b2b3b 0%, #1a4d5f 100%);
            border-radius: 20px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
          }
          
          .stats-section h3 {
            color: #ffffff;
            font-size: 18px;
            margin-bottom: 20px;
          }
          
          .stats-grid {
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
            gap: 15px;
          }
          
          .stat-item {
            text-align: center;
          }
          
          .stat-number {
            font-size: 28px;
            font-weight: 700;
            color: #2fc7ff;
            display: block;
          }
          
          .stat-label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.8);
          }
          
          /* CTA Buttons */
          .cta-section {
            text-align: center;
            margin: 30px 0;
          }
          
          .btn-primary {
            display: inline-block;
            background: #2fc7ff;
            color: #0a2b33;
            padding: 14px 32px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            margin: 5px;
            box-shadow: 0 4px 15px rgba(47, 199, 255, 0.3);
          }
          
          .btn-primary:hover {
            background: #1d9fcf;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(47, 199, 255, 0.4);
            color: #ffffff;
          }
          
          .btn-secondary {
            display: inline-block;
            background: transparent;
            color: #2fc7ff;
            padding: 12px 28px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.3s ease;
            margin: 5px;
            border: 2px solid #2fc7ff;
          }
          
          .btn-secondary:hover {
            background: #2fc7ff;
            color: #0a2b33;
            transform: translateY(-2px);
          }
          
          /* Guide Preview */
          .guide-preview {
            background: #f8fafc;
            border-radius: 20px;
            padding: 25px;
            margin: 30px 0;
            border: 1px solid #e2e8f0;
          }
          
          .guide-preview h3 {
            color: #1e2a3e;
            font-size: 18px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .guide-preview ul {
            margin: 15px 0;
            padding-left: 20px;
            color: #4a627a;
          }
          
          .guide-preview li {
            margin: 8px 0;
          }
          
          /* Footer */
          .email-footer {
            background: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          
          .social-links {
            margin-bottom: 20px;
          }
          
          .social-link {
            display: inline-block;
            margin: 0 10px;
            color: #5a7d9a;
            text-decoration: none;
            font-size: 14px;
          }
          
          .social-link:hover {
            color: #2fc7ff;
          }
          
          .footer-text {
            font-size: 12px;
            color: #5a7d9a;
            line-height: 1.5;
          }
          
          .footer-text a {
            color: #2fc7ff;
            text-decoration: none;
          }
          
          .footer-text a:hover {
            text-decoration: underline;
          }
          
          /* Responsive */
          @media (max-width: 500px) {
            .email-container {
              border-radius: 16px;
            }
            
            .email-header {
              padding: 30px 20px;
            }
            
            .email-header h1 {
              font-size: 24px;
            }
            
            .email-content {
              padding: 25px 20px;
            }
            
            .features-grid {
              grid-template-columns: 1fr;
              gap: 15px;
            }
            
            .btn-primary, .btn-secondary {
              display: block;
              margin: 10px 0;
            }
            
            .stats-grid {
              flex-direction: column;
              gap: 10px;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header with Logo -->
          <div class="email-header">
            <div class="logo-container">
              <img src="${logoUrl}" alt="Your Portfolio Logo" class="logo" onerror="this.style.display='none'">
            </div>
            <h1>Welcome to Your Portfolio</h1>
            <div class="tagline">Your Professional Engineering Portfolio Platform</div>
            <div class="welcome-badge">
              ✨ Account Successfully Verified ✨
            </div>
          </div>
          
          <!-- Main Content -->
          <div class="email-content">
            <div class="greeting">
              Hello <strong>${userName}</strong>! 👋
            </div>
            
            <div class="intro-text">
              Thank you for joining <strong>Your Portfolio</strong> – the complete platform for engineering professionals 
              to showcase projects, track time, and manage certifications. Your account is now fully activated and ready to use!
            </div>
            
            <!-- Features Grid -->
            <div class="features-grid">
              <div class="feature-card">
                <div class="feature-icon">📁</div>
                <h3>Project Management</h3>
                <p>Add, edit, and organize your engineering projects with images and detailed specs</p>
              </div>
              <div class="feature-card">
                <div class="feature-icon">📜</div>
                <h3>Certificates</h3>
                <p>Upload and showcase your professional certifications and credentials</p>
              </div>
              <div class="feature-card">
                <div class="feature-icon">⏱️</div>
                <h3>Timesheet</h3>
                <p>Track your time efficiently with our integrated timesheet system</p>
              </div>
              <div class="feature-card">
                <div class="feature-icon">📊</div>
                <h3>PDF Reports</h3>
                <p>Generate professional PDF reports of your projects and time entries</p>
              </div>
              <div class="feature-card">
                <div class="feature-icon">🖼️</div>
                <h3>Image Gallery</h3>
                <p>Upload project photos with automatic compression and GitHub storage</p>
              </div>
              <div class="feature-card">
                <div class="feature-icon">🔒</div>
                <h3>Secure Storage</h3>
                <p>All your data is encrypted and stored securely on GitHub</p>
              </div>
            </div>
            
            <!-- Quick Stats -->
            <div class="stats-section">
              <h3>🌟 What's Inside Your Portfolio</h3>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-number">∞</span>
                  <span class="stat-label">Unlimited Projects</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">📊</span>
                  <span class="stat-label">Analytics & Charts</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">🔐</span>
                  <span class="stat-label">End-to-End Encryption</span>
                </div>
              </div>
            </div>
            
            <!-- CTA Buttons -->
            <div class="cta-section">
              <a href="${dashboardUrl}" class="btn-primary">🚀 Go to Dashboard</a>
              <a href="${guideUrl}" class="btn-secondary">📖 Read User Guide</a>
            </div>
            
            <!-- Guide Preview -->
            <div class="guide-preview">
              <h3>
                <span>📚</span> New to the Platform?
              </h3>
              <p>Check out our comprehensive <strong>User Guide</strong> to learn everything you need to know:</p>
              <ul>
                <li>🎯 Step-by-step project setup guide</li>
                <li>⏱️ Timesheet best practices</li>
                <li>📜 How to add and manage certificates</li>
                <li>🖼️ Image upload and gallery management</li>
                <li>🔒 Security and privacy information</li>
              </ul>
              <div style="text-align: center; margin-top: 15px;">
                <a href="${guideUrl}" style="color: #2fc7ff; text-decoration: none; font-weight: 600;">Read the Full Guide →</a>
              </div>
            </div>
            
            <div class="intro-text" style="margin-top: 20px; font-style: italic;">
              💡 <strong>Pro Tip:</strong> Start by adding your first project. The dashboard guides you through every step of the way!
            </div>
          </div>
          
          <!-- Footer -->
          <div class="email-footer">
            <div class="social-links">
              <a href="https://github.com/siyabongathupana" class="social-link">🐙 GitHub</a>
              <a href="#" class="social-link">💼 LinkedIn</a>
              <a href="${guideUrl}" class="social-link">📖 Help Center</a>
            </div>
            <div class="footer-text">
              <p>© ${currentYear} Your Portfolio. All rights reserved.</p>
              <p>This email was sent to <strong>${email}</strong> because your account was successfully verified.</p>
              <p>Built with ❤️ for engineering professionals</p>
              <p style="margin-top: 15px; font-size: 11px;">
                If you didn't create this account, please ignore this email or 
                <a href="mailto:${process.env.FROM_EMAIL}">contact support</a>.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
    console.log(`   Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${email}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('🎉 WELCOME EMAIL SERVICE STARTED');
  console.log('='.repeat(60));
  
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP configuration missing. Cannot send emails.');
    console.error('Please set SMTP_HOST, SMTP_USER, SMTP_PASS secrets.');
    process.exit(0);
  }
  
  if (!process.env.FROM_EMAIL) {
    console.error('❌ FROM_EMAIL not set. Please add FROM_EMAIL secret.');
    process.exit(0);
  }
  
  const sentWelcome = loadSentWelcome();
  const newUsers = getNewVerifiedUsers();
  
  console.log(`📧 Newly verified users: ${newUsers.length}`);
  
  if (newUsers.length === 0) {
    console.log('No new verified users to send welcome emails');
    return;
  }
  
  console.log(`Users to notify: ${newUsers.join(', ')}`);
  
  let successCount = 0;
  for (const email of newUsers) {
    if (!sentWelcome.sent.includes(email)) {
      console.log(`📨 Sending welcome email to ${email}...`);
      const success = await sendWelcomeEmail(email);
      if (success) {
        sentWelcome.sent.push(email);
        successCount++;
      }
      // Delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  saveSentWelcome(sentWelcome);
  
  console.log('='.repeat(60));
  console.log(`✅ COMPLETED: Sent ${successCount} welcome emails`);
  console.log(`📊 Total users notified: ${sentWelcome.sent.length}`);
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
