// config.js – Repository & app settings (PRIVATE data repo)
window.REPO_CONFIG = {
  owner: "siyabongathupana",
  repo: "portfolio-data",      // <-- private repo name
  branch: "main",
  dataPath: "",                // data files are at the root of the private repo
  remoteBase: "https://raw.githubusercontent.com/siyabongathupana/portfolio-data/main/"  // raw URL (only works with token for private repos)
};

window.APP_CONFIG = {
  appName: "Your Portfolio",
  defaultThumb: "https://picsum.photos/id/100/300/200",
  maxFeatured: 6,
  adminUsers: ["siyabongatshem@gmail.com"],
  publicProfileEmail: "siyabongatshem@gmail.com",

  emailjs: {
    publicKey: "ZhEE6fQ9A0icSOSYh",
    serviceID: "service_yp6od5r",
    adminTemplateID: "template_y7kifmr",
    userTemplateID: "",
    adminEmail: "siyabongatshem@gmail.com"
  },

  // Internal secret – looks like a dog's name (used for message encryption)
  dogsname: "xK9#mP2$vL5&qR8!tW3@zC7^yB4*jF6%gH1"
};
