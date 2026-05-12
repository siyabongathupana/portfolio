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
  adminUsers: ["siyabongatshem@gmail.com"],       // users with admin rights
  publicProfileEmail: "siyabongatshem@gmail.com", // whose projects visitors see

  // EmailJS – create an account at emailjs.com and fill these in
  emailjs: {
    publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
    serviceID: "YOUR_SERVICE_ID",
    adminTemplateID: "YOUR_ADMIN_TEMPLATE_ID",
    userTemplateID: "YOUR_USER_TEMPLATE_ID",
    adminEmail: "siyabongatshem@gmail.com"
  }
};
