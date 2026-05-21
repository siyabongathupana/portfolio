const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Configuration
const USERS_DIR = 'data/users';
const PENDING_FILE = 'data/pending_verification.json';
const VERIFIED_FILE = 'data/verified_users.json';

// GitHub configuration from environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const [OWNER, REPO] = GITHUB_REPOSITORY ? GITHUB_REPOSITORY.split('/') : ['siyabongathupana', 'portfolio'];
const BRANCH = 'main';

// Helper: Update a JSON file on GitHub via API
async function updateGitHubFile(filePath, content, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`;
  
  let sha = null;
  try {
    const getResp = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (getResp.ok) {
      const data = await getResp.json();
      sha = data.sha;
    }
  } catch (e) {}
  
  const body = {
    message: message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!resp.ok) {
    const error = await resp.json();
    throw new Error(`GitHub API error updating ${filePath}: ${error.message}`);
  }
  
  console.log(`✅ Updated ${filePath}`);
  return resp.json();
}

// Helper: Read a JSON file from GitHub
async function readGitHubFile(filePath) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (e) {}
  return null;
}

// Load pending verification data
async function loadPendingVerification() {
  const data = await readGitHubFile(PENDING_FILE);
  return data || { pending: [] };
}

// Load verified users
async function loadVerifiedUsers() {
  const data = await readGitHubFile(VERIFIED_FILE);
  return data || { verified: [] };
}

// Get all user emails from account.json files
async function getAllUserEmails() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${USERS_DIR}?ref=${BRANCH}`;
  const emails = [];
  
  try {
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (resp.ok) {
      const items = await resp.json();
      for (const item of items) {
        if (item.type === 'dir') {
          const email = decodeURIComponent(item.name);
          const accountUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${USERS_DIR}/${item.name}/account.json`;
          const accountResp = await fetch(accountUrl);
          if (accountResp.ok) {
            emails.push(email);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error fetching users:', e);
  }
  
  return emails;
}

// Generate verification token
function generateToken(email) {
  return crypto.createHash('sha256')
    .update(email + Date.now() + crypto.randomBytes(32).toString('hex'))
    .digest('hex')
    .substring(0, 32);
}

// Send verification email
async function sendVerificationEmail(email, token, siteUrl) {
  const verificationLink = `${siteUrl}/verify.html?token=${token}&email=${encodeURIComponent(email)}`;
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Verify Your Email - Portfolio Account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0b2b3b; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #2fc7ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .warning { color: #dc3545; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Verify Your Email Address</h2>
          </div>
          <div class="content">
            <p>Thank you for registering for Your Portfolio!</p>
            <p>Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationLink}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p><code>${verificationLink}</code></p>
            <p>This link will expire in 24 hours.</p>
            <div class="warning">
              <strong>⚠️ Important:</strong> If you did not create this account, please ignore this email.
              Your account will remain locked until verified.
            </div>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Your Portfolio System</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send verification to ${email}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Email verification process started...');
  console.log(`Repository: ${OWNER}/${REPO}`);
  
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP configuration missing. Cannot send verification emails.');
    process.exit(0);
  }
  
  const pendingData = await loadPendingVerification();
  const verifiedData = await loadVerifiedUsers();
  const allUsers = await getAllUserEmails();
  const siteUrl = process.env.SITE_URL || 'https://siyabongathupana.github.io/portfolio';
  
  console.log(`Found ${allUsers.length} total users`);
  console.log(`Verified users: ${verifiedData.verified.length}`);
  console.log(`Pending verification: ${pendingData.pending.length}`);
  
  const existingPendingEmails = pendingData.pending.map(p => p.email);
  const newUsers = allUsers.filter(email => 
    !verifiedData.verified.includes(email) && 
    !existingPendingEmails.includes(email)
  );
  
  if (newUsers.length === 0) {
    console.log('No new users need verification');
    return;
  }
  
  console.log(`Found ${newUsers.length} new users to verify:`, newUsers);
  
  let updatedPending = [...pendingData.pending];
  let emailsSent = 0;
  
  for (const email of newUsers) {
    const token = generateToken(email);
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    
    updatedPending.push({
      email: email,
      token: token,
      expiresAt: expiresAt,
      createdAt: Date.now()
    });
    
    const success = await sendVerificationEmail(email, token, siteUrl);
    if (success) {
      emailsSent++;
      console.log(`📧 Verification sent to ${email}`);
    } else {
      updatedPending = updatedPending.filter(p => p.email !== email);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const now = Date.now();
  const beforeCleanup = updatedPending.length;
  updatedPending = updatedPending.filter(p => p.expiresAt > now);
  const expiredCount = beforeCleanup - updatedPending.length;
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired tokens`);
  }
  
  if (JSON.stringify(pendingData.pending) !== JSON.stringify(updatedPending)) {
    const newPendingData = { pending: updatedPending };
    await updateGitHubFile(PENDING_FILE, newPendingData, 'Update pending verification list');
    console.log(`✅ Updated pending verification file`);
  }
  
  console.log(`✅ Process completed. Sent ${emailsSent} verification emails.`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
