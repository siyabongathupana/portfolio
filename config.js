// config.js – Repository & app settings (Supabase edition)

window.APP_CONFIG = {
  appName: "Your Portfolio",
  defaultThumb: "https://picsum.photos/id/100/300/200",
  maxFeatured: 6,
  adminUsers: ["siyabongatshem@gmail.com"],
  publicProfileEmail: "siyabongatshem@gmail.com",

  // ── Supabase ──
  supabaseUrl:  "https://nisecbxtspozeqlpqtbd.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pc2VjYnh0c3BvemVxbHBxdGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTExODUsImV4cCI6MjEwNjg2NzE4NX0.TOogQFKCtp-b_XKhMkXg03mB0LCFvjlvspmosPjigeg",

  // ── Excel report access control ──
  // false → only admins can generate/download Excel reports.
  // true  → everyone (public visitors) can also download.
  excelReportEnabled: false,

  emailjs: {
    publicKey: "ZhEE6fQ9A0icSOSYh",
    serviceID: "service_yp6od5r",
    adminTemplateID: "template_y7kifmr",
    userTemplateID: "",
    adminEmail: "siyabongatshem@gmail.com"
  }
};

// ⚠️ REPO_CONFIG is retained ONLY because a few un-migrated pages still read
// the raw GitHub JSON for display. Once every page is migrated, delete this.
window.REPO_CONFIG = {
  owner: "siyabongathupana",
  repo: "portfolio",
  branch: "main",
  dataPath: "data"
};
