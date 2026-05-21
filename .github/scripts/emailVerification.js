const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const USERS_DIR = 'data/users';
const PENDING_FILE = 'data/pending_verification.json';
const VERIFIED_FILE = 'data/verified_users.json';

// Load pending verification data
function loadPendingVerification() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
  } catch (e) {}
  return { pending: [] };
}

// Save pending verification
function savePendingVerification(data) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

// Load verified users
function loadVerifiedUsers() {
  try {
    if (fs.existsSync(VERIFIED_FILE)) {
      return JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf8'));
    }
  } catch (e) {}
  return { verified: [] };
}

// Save verified users
function saveVerifiedUsers(data) {
  fs.writeFileSync(VERIFIED_FILE, JSON.stringify(data, null, 2));
}

// Get all user emails from account.json files
function getAllUserEmails() {
  const emails = [];
  if (!fs.existsSync(USERS_DIR)) return emails;
  
  const userDirs = fs.readdirSync(USERS_DIR);
  for (const userDir of userDirs) {
    const accountFile = path.join(USERS_DIR, userDir, 'account.json');
    if (fs.existsSync(accountFile)) {
      const email = decodeURIComponent(userDir);
      emails.push(email);
    }
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
  
  // Check SMTP configuration
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP configuration missing. Cannot send verification emails.');
    process.exit(0);
  }

  const pendingData = loadPendingVerification();
  const verifiedData = loadVerifiedUsers();
  const allUsers = getAllUserEmails();
  const siteUrl = process.env.SITE_URL || 'https://siyabongathupana.github.io/portfolio';
  
  console.log(`Found ${allUsers.length} total users`);
  console.log(`Verified users: ${verifiedData.verified.length}`);
  console.log(`Pending verification: ${pendingData.pending.length}`);
  
  // Find new users who haven't been verified or pending
  const existingPending = pendingData.pending.map(p => p.email);
  const newUsers = allUsers.filter(email => 
    !verifiedData.verified.includes(email) && 
    !existingPending.includes(email)
  );
  
  if (newUsers.length === 0) {
    console.log('No new users need verification');
    return;
  }
  
  console.log(`Found ${newUsers.length} new users to verify:`, newUsers);
  
  // Send verification emails
  for (const email of newUsers) {
    const token = generateToken(email);
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    
    pendingData.pending.push({
      email: email,
      token: token,
      expiresAt: expiresAt,
      createdAt: Date.now()
    });
    
    const success = await sendVerificationEmail(email, token, siteUrl);
    if (!success) {
      console.error(`Failed to send verification to ${email}, removing from pending`);
      pendingData.pending = pendingData.pending.filter(p => p.email !== email);
    } else {
      console.log(`📧 Verification sent to ${email}`);
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Clean up expired tokens
  const now = Date.now();
  const originalCount = pendingData.pending.length;
  pendingData.pending = pendingData.pending.filter(p => p.expiresAt > now);
  if (originalCount !== pendingData.pending.length) {
    console.log(`Cleaned up ${originalCount - pendingData.pending.length} expired tokens`);
  }
  
  savePendingVerification(pendingData);
  console.log(`✅ Verification emails processed. Pending: ${pendingData.pending.length}`);
}

main().catch(console.error);
