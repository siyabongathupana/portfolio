// config.js – GitHub configuration, app constants, and EmailJS settings

window.REPO_CONFIG = {
  owner: "siyabongathupana",
  repo: "portfolio",
  branch: "main",
  dataPath: "data",
  remoteBase: "https://raw.githubusercontent.com/siyabongathupana/portfolio/main/data/"
};

window.APP_CONFIG = {
  appName: "DeltaV Engineering Portfolio",
  defaultThumb: "https://picsum.photos/id/100/300/200",
  maxFeatured: 6,
  adminUsers: ["Siyabonga"],   // users who can see the Admin tab

  // EmailJS configuration
  // Sign up at https://www.emailjs.com, create a service and two email templates:
  //   - one for admin notifications
  //   - one for user confirmation emails
  emailjs: {
    publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
    serviceID: "YOUR_SERVICE_ID",
    // Template for admin notifications (new user, new contact message, etc.)
    adminTemplateID: "YOUR_ADMIN_TEMPLATE_ID",
    // Template for user-facing emails (account confirmation, etc.)
    userTemplateID: "YOUR_USER_TEMPLATE_ID",
    adminEmail: "siyabongatshem@gmail.com"
  }
};
