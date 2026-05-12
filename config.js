// config.js – Repository & app settings
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
  adminUsers: ["siyabongatshem@gmail.com"],   // users with admin privileges
  publicProfileEmail: "siyabongatshem@gmail.com", // whose projects are shown to visitors

  // EmailJS keys (create an account at emailjs.com)
  emailjs: {
    publicKey: "YOUR_PUBLIC_KEY",
    serviceID: "YOUR_SERVICE_ID",
    adminTemplateID: "YOUR_ADMIN_TEMPLATE_ID",
    userTemplateID: "YOUR_USER_TEMPLATE_ID",
    adminEmail: "siyabongatshem@gmail.com"
  }
};
