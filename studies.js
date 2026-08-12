// studies.js – Study Manager with robust auth, error handling, and full content
(function() {
  'use strict';

  // ---- AUTH CHECK ----
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = "login.html?redirect=studies";
    return;
  }

  // Only allow the owner
  const ALLOWED_EMAIL = 'siyabongatshem@gmail.com';
  if (user.username !== ALLOWED_EMAIL) {
    const contentArea = document.getElementById('contentArea');
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="access-denied" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;text-align:center;padding:20px;color:#e17055;">
          <div class="icon" style="font-size:4rem;margin-bottom:20px;"><i class="fa fa-lock"></i></div>
          <h2 style="font-weight:700;">Access Restricted</h2>
          <p style="color:var(--text-secondary);max-width:500px;">This page is only available to the owner of this portfolio.</p>
          <button class="btn btn-primary-glow mt-3" onclick="window.location.href='index.html'" style="background:linear-gradient(135deg,#2fc7ff,#0984e3);color:#0a0e17;border:none;padding:10px 30px;border-radius:40px;font-weight:600;">Go Home</button>
        </div>
      `;
    }
    // Hide the spinner if it exists
    const loader = document.getElementById('initialLoading');
    if (loader) loader.style.display = 'none';
    return;
  }

  // ---- FULL DEFAULT DATA FROM PDFs ----
  function getDefaultData() {
    function topic(name, subtopics) {
      return { name, subtopics: subtopics || [], completed: false, subCompleted: [] };
    }

    const bia109 = {
      code: 'BIA109', name: 'Chemical and Process Engineering', color: '#fdcb6e',
      weeks: [
        { number: 1, topics: [topic('Chemical reaction, equilibrium', ['Evidence for a chemical reaction','Chemical equations','Reactions in which a solid forms','Reactions in aqueous solutions','Reactions of metals with non-metals','Chemical equilibrium'])], assignments: [] },
        { number: 2, topics: [topic('Phase behaviour and equation of state', ['Single-Phase systems (solid and liquid densities, ideal gases, equations of state)','Water and its phase changes','Intermolecular forces, pressure','Evaporation','Vapour pressure','Gas laws','Principles of multiphase systems'])], assignments: [] },
        { number: 3, topics: [topic('Acids, bases, solutions', ['Acids and bases','The pH scale','Buffered solutions','Solubility, mass percent','Molarity','Dilution','Fundamentals of Stoichiometry'])], assignments: [] },
        { number: 4, topics: [topic('Thermodynamics', ['Thermodynamic states','Thermodynamic equilibrium','Laws of thermodynamics','Thermodynamic properties (entropy, enthalpy and chemical reactions)'])], assignments: [] },
        { number: 5, topics: [topic('Process engineering', ['Process engineering activities','Front End Loading','Realization of a plant','Batch and continuous processes','Equipment used in process engineering'])], assignments: [] },
        { number: 6, topics: [topic('Process documentation, diagrams, and safety', ['Process and instrumentation diagrams','Process plant layout','Documentation','Site location and equipment spacing','Process safety (HAZOP procedure and documentation)'])], assignments: [] },
        { number: 7, topics: [topic('Processes and operations', ['Process units: Divider, Mixer, Dryer, Filter, Distillation column, Evaporator, Dehumidification, Humidifier, Leaching and Extraction, Absorber, Condenser, Crystallizer, Reactors, Batch reactor, CSTR and fluidized bed reactor','Process Flow Diagram','Labelling a PFD'])], assignments: [] },
        { number: 8, topics: [topic('Material balances', ['Material balance fundamentals','Mass balance on steady-state processes','Material balance on reactive systems','Stoichiometry equation, coefficients, ratio','Combustion reactions','Multiple-unit process flowcharts'])], assignments: [] },
        { number: 9, topics: [topic('Energy balances', ['Energy balance for closed and open systems','Steam turbine','Heaters and coolers','Compressors','Energy balance with reaction','Heat of reaction','Heats of formation and heat of combustion','Energy balance for reactive processes','Simultaneous material and energy balances'])], assignments: [] },
        { number: 10, topics: [topic('Sustainable process technology', ['Sustainable development','Chemicals from biomass','Biofuels','Process design issues','Environmental and economic challenges'])], assignments: [] },
        { number: 11, topics: [topic('Process simulation in chemical engineering', ['Chemical process simulators (Aspen Plus, Simulink)','Computer-Aided Design','Process optimization','Examples of simulation models (chemical reaction, heat exchange, distillation, absorption...)'])], assignments: [] },
        { number: 12, topics: [topic('Unit Review', [])], assignments: [] }
      ]
    };
    bia109.weeks[4].assignments.push({ name: 'Test 1 (Topics 1-5)', due: '2026-08-20', status: 'pending', marks: '', weight: 25 });
    bia109.weeks[7].assignments.push({ name: 'Project', due: '2026-09-10', status: 'pending', marks: '', weight: 25 });
    bia109.weeks[11].assignments.push({ name: 'Final Exam (All topics)', due: '2026-09-30', status: 'pending', marks: '', weight: 50 });

    const bsc107 = {
      code: 'BSC107', name: 'Engineering Programming', color: '#55efc4',
      weeks: [
        { number: 1, topics: [topic('Overview of Engineering Programming', ['Computers: Hardware and Software','Computer Organization (CU, ALU, registers, memory and clock/execution)','Personal, Distributed and Client/Server Computing','Machine Languages, Assembly Languages and High-Level Languages','Some common terms and definitions (software as a service, infrastructure as a service, cloud computing, AWS, relational database, data warehouse, machine learning, internet of things (IOT), Big data, etc.)','The Software Development Method','Specifying the problem requirements.','Analyzing the problem.','Designing the algorithm to solve the problem.','Implementing the algorithm.','Testing and verifying the completed program.','Maintaining and updating the program.','Professional Ethics for Computer Programmers'])], assignments: [] },
        { number: 2, topics: [topic('Overview of C Language', ['C Language Elements','Variable Declarations and Data Types','Executable Statements','General Form of a C Program','Arithmetic Expressions','Formatting Numbers in Program Output','Interactive Mode, Batch Mode, and Data Files'])], assignments: [] },
        { number: 3, topics: [topic('Top-Down Design with Functions', ['Building Programs from Existing Information','Library Functions','Math Library Functions','Function Definitions','Function prototypes','Function call stack and activation records','Headers','Random number generation','Top-Down Design and Structure Charts','Functions without Arguments','Functions with Input Arguments'])], assignments: [] },
        { number: 4, topics: [topic('Selection Structures: if and switch Statements', ['Control structures: sequence, selection, and repetition','Conditions','Relational and Equality Operators','Logical Operators','Operator Precedence','Writing Conditions in C','Comparing Characters','Logical Assignment','Complementing a Condition','The if Statement','If Statements with Compound Statements','Decision Steps in Algorithms','Nested if Statements and Multiple-Alternative Decisions','The switch Statement'])], assignments: [] },
        { number: 5, topics: [topic('Repetition, Loop Statements and Recursion', ['Repetition in Programs','Counting Loops and the while Statement','Computing a Sum or a Product in a Loop','The for Statement','Conditional Loops','Loop Design','Nested Loops','The do-while Statement and Flag-Controlled Loops','Iterative Approximations','Recursion','The Nature of Recursion','Tracing a Recursive Function','Recursive Mathematical Functions','Example Using Recursion: Fibonacci Series'])], assignments: [] },
        { number: 6, topics: [topic('Arrays', ['Declaring and Referencing Arrays','Array Subscripts','Using for Loops for Sequential Access','Using Array Elements as Function Arguments','Array Arguments','Searching and Sorting an Array','Parallel Arrays and Enumerated Types','Multidimensional Arrays','Graphics Programs with Arrays'])], assignments: [] },
        { number: 7, topics: [topic('Pointer, Modular Programming, Debugging and Testing, Dynamic Data Structures', ['Pointers and the Indirection Operator','Functions with Output Parameters','Multiple Calls to a Function with Input/Output Parameters','Scope of Names','Formal Output Parameters as Actual Arguments','Debugging and Testing a Program System','Dynamic Data Structures','Pointers to structures','Dynamic Memory Allocation'])], assignments: [] },
        { number: 8, topics: [topic('Strings', ['String Basics','String Library Functions: Assignment and Substrings','Longer Strings: Concatenation and Whole-Line Input','String Comparison','Arrays of Pointers','Character Operations','String-to-Number and Number-to-String Conversions'])], assignments: [] },
        { number: 9, topics: [topic('Structures and File Processing', ['User-Defined Structure Types','Structure Type Data as Input and Output Parameters','Functions Whose Result Values Are Structured','Input/Output Files','Binary Files','Procedural Abstraction','Data Abstraction','Personal Libraries: header files, implementation files','Storage classes','Conditional compilation','Arguments to Function main'])], assignments: [] },
        { number: 10, topics: [topic('Introduction to MATLAB', ['The MATLAB Environment','The MATLAB Desktop','The Edit/Debug Window','Docking and Undocking Window','The MATLAB Workspace','The Workspace Browser','Variables and Arrays','Initializing Variables in MATLAB','Vectors, Matrices and Arrays','Multidimensional Arrays','Subarrays','Displaying Output Data','Data Files','Hierarchy of Operations','Built-in MATLAB Functions','Common MATLAB Functions','Introduction to Plotting'])], assignments: [] },
        { number: 11, topics: [topic('Numerical Analysis using MATLAB and Excel', ['Roots of Polynomials','Polynomial Construction from Known Roots','Evaluation of a Polynomial at Specified Values','Rational Polynomials','Root Approximation','Matrices and Determinants','Functions and cell operations in Excel','Mathematical problem solving and plotting using Excel','Numerical integration and differentiation using excel','Macros'])], assignments: [] },
        { number: 12, topics: [topic('Introduction to Python', ['Introduction to Python','Using the Python Interpreter','Control Flow Tools in Python','Data Structures','Modules','Input and Output','Classes','Using Python Standard Library','Unit Review'])], assignments: [] }
      ]
    };
    bsc107.weeks[4].assignments.push({ name: 'Test 1 (Topics 1-5)', due: '2026-08-20', status: 'pending', marks: '', weight: 25 });
    bsc107.weeks[8].assignments.push({ name: 'Project (Topics 1-8)', due: '2026-09-10', status: 'pending', marks: '', weight: 25 });
    bsc107.weeks[11].assignments.push({ name: 'Final Exam (All topics)', due: '2026-09-30', status: 'pending', marks: '', weight: 40 });
    for (let i = 2; i <= 11; i++) {
      bsc107.weeks[i-1].assignments.push({ name: `Weekly Quiz Topic ${i}`, due: `2026-08-${String(10+i).padStart(2,'0')}`, status: 'pending', marks: '', weight: 1 });
    }

    const bsc104 = {
      code: 'BSC104', name: 'Engineering Drawing and CAD', color: '#a29bfe',
      weeks: [
        { number: 1, topics: [topic('Introductory and standard information', ['Understanding the role of technical drawings','Standard abbreviations','Types of Lines','Lettering','Scales','Sizes of drawing sheet','Layout of drawing sheets','Dimensioning','Engineering drawing standards'])], assignments: [] },
        { number: 2, topics: [topic('Sketching', ['Sketching Tools and Materials','Sketching Straight Lines','Sketching Circular Lines','Sketching Circles, Arcs, and ellipses','Measurement Lines and Proportions','Introduction to the Block Technique','Creating Multiview Sketches','Creating Isometric Sketches'])], assignments: [] },
        { number: 3, topics: [topic('Orthogonal projection: First and third angle', ['Introduction','Principles of projection','Third-angle projection','First-angle projection','Production of engineering drawings','Introduction to CAD software: Basic 2D entities'])], assignments: [] },
        { number: 4, topics: [topic('Isometric projection', ['Isometric projection','Making an isometric drawing','Representation of details common to pictorial drawings','Introduction to CAD software: Basic 3D models'])], assignments: [] },
        { number: 5, topics: [topic('Sections and revolutions', ['Introduction to Sectional Views Cutting-Plane Lines and Sectional View Identification','Section Lines','Full Sections','Half Sections','Offset Sections','Aligned Sections','Un-sectioned Features','Intersections in Section','Broken-Out Sections','Auxiliary Sections','Conventional Revolutions','Introduction to CAD software: Drawings and section views'])], assignments: [] },
        { number: 6, topics: [topic('Working Drawings', ['Introduction to Working Drawings','Detail Drawings','Assembly Drawings','Types of Assembly Drawings','Identification Numbers','Parts Lists','Purchase Parts','Engineering Changes','Drawing from a Prototype','Analysis of a Set of Working Drawings'])], assignments: [] },
        { number: 7, topics: [topic('CAD software Demonstration and practice (Creating simple parts)', [])], assignments: [] },
        { number: 8, topics: [topic('CAD software Demonstration and practice (Creating simple assemblies)', [])], assignments: [] },
        { number: 9, topics: [topic('CAD software Demonstration and practice (Creating drawings)', [])], assignments: [] },
        { number: 10, topics: [topic('Other Engineering Drawings', ['Creating a simple circuit','Creating a simple building plan'])], assignments: [] },
        { number: 11, topics: [topic('Interpreting Drawings', ['Sample Drawings analysis'])], assignments: [] },
        { number: 12, topics: [topic('Product Development and Design', ['Planning and design as problem-solving processes','Methodology for solving open-ended problems','Engineering planning','The design process','Problem formulation phase','Feasibility study and concept design','Preliminary planning and design','Detailed planning and design','Implementation','The Solution-first strategy'])], assignments: [] }
      ]
    };
    bsc104.weeks[0].assignments.push({ name: 'Weekly Portfolio (Topic 1)', due: '2026-08-07', status: 'pending', marks: '', weight: 1 });
    bsc104.weeks[4].assignments.push({ name: 'Test (Topics 1-5)', due: '2026-08-20', status: 'pending', marks: '', weight: 25 });
    bsc104.weeks[8].assignments.push({ name: 'Practical Project (Topics 1-9)', due: '2026-09-10', status: 'pending', marks: '', weight: 25 });
    bsc104.weeks[11].assignments.push({ name: 'Final Exam (All topics)', due: '2026-09-30', status: 'pending', marks: '', weight: 40 });
    for (let i = 2; i <= 12; i++) {
      bsc104.weeks[i-1].assignments.push({ name: `Weekly Portfolio Topic ${i}`, due: `2026-08-${String(10+i).padStart(2,'0')}`, status: 'pending', marks: '', weight: 1 });
    }

    const bsc106 = {
      code: 'BSC106', name: 'Engineering Mathematics 2', color: '#2fc7ff',
      weeks: [
        { number: 1, topics: [topic('Multivariable calculus', ['Functions of several variables','Partial derivatives and Total differential','Chain Rules for Differentiation','Partial Derivatives of Higher Orders','Differentiation of Implicit Functions'])], assignments: [] },
        { number: 2, topics: [topic('Integral Calculus', ['Integration calculus','Double and Triple integrals','Areas and Volumes by integration','Numerical Integration'])], assignments: [] },
        { number: 3, topics: [topic('Differential Equations (Definitions, First-Order)', ['Definitions','First-Order Differential Equations - Separable, linear and nonlinear, Applications'])], assignments: [] },
        { number: 4, topics: [topic('Differential Equations (Second-Order, Systems, PDE)', ['Second-Order Differential Equations - Homogeneous equations with constant coefficients, Mech vibrations and Electric circuits','Systems of first-order ODEs','Introduction to PDE'])], assignments: [] },
        { number: 5, topics: [topic('Numerical Methods (Error, Nonlinear Equations, Interpolation, Differentiation)', ['Definitions (Sources of errors, error propagation and stability)','Solution of Nonlinear Equations','Interpolation and curve fitting','Numerical differentiation'])], assignments: [] },
        { number: 6, topics: [topic('Linear Algebra (Systems, Matrix Methods)', ['Systems of linear equations and matrices','Matrix methods for systems of linear equations: Matrix factorisation, Gaussian elimination, LU decomposition'])], assignments: [] },
        { number: 7, topics: [topic('Linear Algebra (Iterative Methods, Eigenvalues)', ['Iterative methods for the solution of systems of linear equations: Gauss-Seidel and Jacobi.','Eigenvalues and Eigenvectors','Geometrical Interpretation of Eigenvectors','Applications of Eigenvalue Problems in Engineering','Special matrices'])], assignments: [] },
        { number: 8, topics: [topic('Analytical Geometry', ['Basics of Coordinates and Distance','Equations of lines, circles, slopes, line intersections, etc.','Polar and cylindrical coordinates','Transformation of coordinates (Jacobian)'])], assignments: [] },
        { number: 9, topics: [topic('Vector Calculus (Vector spaces, differential, theorems)', ['Vector spaces','Vector differential calculus','Basic theorems of vector calculus'])], assignments: [] },
        { number: 10, topics: [topic('Fourier and Taylor series (Fourier Series)', ['Fourier Series','Harmonic Analysis'])], assignments: [] },
        { number: 11, topics: [topic('Fourier and Taylor series (Taylor series)', ['Taylor series expansion'])], assignments: [] },
        { number: 12, topics: [topic('Unit Review', [])], assignments: [] }
      ]
    };
    bsc106.weeks[4].assignments.push({ name: 'Test (Topics 1-5)', due: '2026-08-20', status: 'pending', marks: '', weight: 25 });
    bsc106.weeks[11].assignments.push({ name: 'Final Exam (All topics)', due: '2026-09-30', status: 'pending', marks: '', weight: 40 });
    for (let i = 2; i <= 11; i++) {
      bsc106.weeks[i-1].assignments.push({ name: `Weekly Quiz Topic ${i}`, due: `2026-08-${String(10+i).padStart(2,'0')}`, status: 'pending', marks: '', weight: 1 });
    }

    return {
      years: [{
        name: '2026',
        semesters: [{
          name: 'Semester 2',
          units: [bsc106, bsc104, bsc107, bia109]
        }]
      }]
    };
  }

  // ---- STATE ----
  let studyData = { years: [] };
  let expanded = {};
  let saveDebounceTimer = null;
  const DEBOUNCE_DELAY = 300;
  let analyticsChart = null;

  // ---- CACHE & SAVE QUEUE ----
  const SAVE_QUEUE_KEY = 'studies_save_queue';
  let isProcessing = false;
  let saveRetryTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  const BASE_RETRY_DELAY = 2000;

  function loadSaveQueue() {
    try { return JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]'); } catch { return []; }
  }
  function persistSaveQueue(queue) {
    localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(queue));
  }
  function enqueueSave() {
    const queue = loadSaveQueue();
    queue.push({ data: JSON.parse(JSON.stringify(studyData)), timestamp: Date.now() });
    if (queue.length > 10) queue.shift();
    persistSaveQueue(queue);
    if (!isProcessing) processQueue();
  }
  function scheduleSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      enqueueSave();
    }, DEBOUNCE_DELAY);
  }
  function forceSave() {
    if (saveDebounceTimer) { clearTimeout(saveDebounceTimer); saveDebounceTimer = null; }
    enqueueSave();
  }

  async function processQueue() {
    if (isProcessing) return;
    const queue = loadSaveQueue();
    if (queue.length === 0) return;
    isProcessing = true;
    const latest = queue[queue.length - 1];
    try {
      await saveToGitHub(latest.data);
      persistSaveQueue([]);
      retryCount = 0;
      showToast('✅ Study data saved to GitHub', 'success');
    } catch (err) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount - 1);
        if (saveRetryTimer) clearTimeout(saveRetryTimer);
        saveRetryTimer = setTimeout(() => {
          saveRetryTimer = null;
          isProcessing = false;
          processQueue();
        }, delay);
        showToast(`⚠️ Save failed – retry ${retryCount}/${MAX_RETRIES}`, 'error');
      } else {
        showToast('❌ Save failed after multiple retries. Data is cached locally.', 'error');
        persistSaveQueue(queue);
        isProcessing = false;
        retryCount = 0;
      }
    } finally {
      if (saveRetryTimer === null && retryCount === 0) {
        isProcessing = false;
      }
    }
  }

  async function saveToGitHub(data) {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getStudyPath();
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing && existing.sha) sha = existing.sha;
    } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, data, 'Update study data', branch, user.pat, sha);
    saveToCache(data);
  }

  function getStudyPath() {
    const { dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    return `${dataPath}/users/${encUser}/studies.json`;
  }

  function saveToCache(data) {
    try {
      localStorage.setItem('studies_data_cache', JSON.stringify({ data, timestamp: Date.now() }));
    } catch(e) {}
  }
  function loadFromCache() {
    try {
      const raw = localStorage.getItem('studies_data_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && parsed.data.years) return parsed.data;
      }
    } catch(e) {}
    return null;
  }

  // ---- LOAD DATA ----
  async function loadData() {
    const loader = document.getElementById('initialLoading');
    try {
      let data = loadFromCache();
      if (data) {
        studyData = data;
        render();
        if (loader) loader.style.display = 'none';
      }
      try {
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getStudyPath();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const resp = await fetch(url, { headers: { Authorization: `token ${user.pat}` } });
        if (resp.ok) {
          const file = await resp.json();
          const content = atob(file.content.replace(/\n/g, ''));
          const parsed = JSON.parse(content);
          if (parsed && parsed.years) {
            studyData = parsed;
            saveToCache(studyData);
            render();
          }
        } else if (resp.status === 404) {
          if (!studyData.years || studyData.years.length === 0) {
            studyData = getDefaultData();
            saveToCache(studyData);
            enqueueSave();
            render();
          }
        }
      } catch (e) {
        console.warn('GitHub load failed:', e);
        if (!studyData.years || studyData.years.length === 0) {
          studyData = getDefaultData();
          saveToCache(studyData);
          enqueueSave();
          render();
        }
      }
    } catch (err) {
      console.error('Fatal error in loadData:', err);
      showToast('Error loading data: ' + err.message, 'error');
      const container = document.getElementById('treeContainer');
      if (container) {
        container.innerHTML = `<div class="error-display" style="padding:40px;text-align:center;color:#e17055;background:rgba(225,112,85,0.08);border-radius:16px;border:1px solid #e17055;margin:40px 0;">
          <div class="icon" style="font-size:3rem;margin-bottom:16px;"><i class="fa fa-exclamation-circle"></i></div>
          <h3 style="color:#e17055;">Failed to load data</h3>
          <pre style="background:rgba(0,0,0,0.3);padding:16px;border-radius:8px;text-align:left;max-height:200px;overflow:auto;font-size:0.8rem;color:#e0e8ee;">${err.message}</pre>
        </div>`;
      }
    } finally {
      if (loader) loader.style.display = 'none';
    }
  }

  // ---- HELPERS ----
  function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m); }
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-item ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; setTimeout(() => el.remove(), 400); }, 3000);
  }
  function getTopic(yi, si, ui, wi, ti) {
    try { return studyData.years[yi].semesters[si].units[ui].weeks[wi].topics[ti]; } catch { return null; }
  }
  function recalcTopicCompletion(topic) {
    if (!topic.subtopics || !topic.subCompleted) { topic.completed = false; return; }
    while (topic.subCompleted.length < topic.subtopics.length) topic.subCompleted.push(false);
    while (topic.subCompleted.length > topic.subtopics.length) topic.subCompleted.pop();
    topic.completed = topic.subCompleted.every(Boolean);
  }

  // ---- RENDER FUNCTIONS (all wrapped in try-catch) ----
  function safeRender(fn) {
    try { fn(); } catch (e) { console.error('Render error:', e); showToast('Render error: ' + e.message, 'error'); }
  }

  function renderStats() {
    let totalUnits = 0, totalWeeks = 0, totalTopics = 0, doneTopics = 0, totalAssign = 0, pendingAssign = 0;
    studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => {
      totalUnits++;
      u.weeks.forEach(w => {
        totalWeeks++;
        w.topics.forEach(t => {
          totalTopics++;
          if (t.completed) doneTopics++;
        });
        w.assignments.forEach(a => {
          totalAssign++;
          if (a.status === 'pending' || a.status === 'in-progress') pendingAssign++;
        });
      });
    })));
    const el = (id) => document.getElementById(id);
    if (el('statYears')) el('statYears').textContent = studyData.years.length;
    if (el('statUnits')) el('statUnits').textContent = totalUnits;
    if (el('statWeeks')) el('statWeeks').textContent = totalWeeks;
    if (el('statTopicsDone')) el('statTopicsDone').textContent = doneTopics + '/' + totalTopics;
    if (el('statAssignments')) el('statAssignments').textContent = totalAssign;
    if (el('statPending')) el('statPending').textContent = pendingAssign;
  }

  function renderDeadlines() {
    const container = document.getElementById('deadlinesContainer');
    if (!container) return;
    const all = [];
    studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => u.weeks.forEach(w => w.assignments.forEach(a => {
      if (a.due) all.push({ ...a, week: w.number, unit: u.code });
    })))));
    all.sort((a,b) => new Date(a.due) - new Date(b.due));
    const upcoming = all.slice(0, 5);
    let html = `<div class="deadlines-widget"><h4>⏰ Upcoming Deadlines</h4>`;
    if (!upcoming.length) html += `<p class="text-muted-light">No upcoming deadlines. 🎉</p>`;
    else {
      const today = new Date();
      upcoming.forEach(a => {
        const days = Math.ceil((new Date(a.due) - today) / (1000*60*60*24));
        let cls = '', label = '';
        if (days < 0) { cls = 'overdue'; label = ' (Overdue)'; }
        else if (days <= 3) { cls = 'due-soon'; label = ' (Soon)'; }
        html += `<div class="deadline-item"><span>${escapeHtml(a.name)} <span class="text-muted-light">(${a.unit} W${a.week})</span></span><span class="${cls}">${a.due}${label}</span></div>`;
      });
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderAnalytics() {
    const container = document.getElementById('analyticsContainer');
    if (!container) return;
    const unitData = [];
    studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => {
      let totalSub = 0, doneSub = 0;
      u.weeks.forEach(w => w.topics.forEach(t => {
        totalSub += t.subtopics.length;
        doneSub += t.subCompleted.filter(Boolean).length;
      }));
      const pct = totalSub > 0 ? Math.round((doneSub/totalSub)*100) : 0;
      unitData.push({ code: u.code, pct });
    })));
    let html = `<div class="analytics-dashboard"><div class="analytics-card"><h4>📊 Unit Progress</h4>`;
    unitData.forEach(u => {
      html += `<div class="stat-row"><span class="label">${escapeHtml(u.code)}</span><span class="value">${u.pct}%</span></div>
               <div class="mini-progress"><div class="fill" style="width:${u.pct}%"></div></div>`;
    });
    html += `</div>`;
    let totalTopics = 0, doneTopics = 0, totalAssign = 0, pendingAssign = 0;
    studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => u.weeks.forEach(w => {
      w.topics.forEach(t => { totalTopics++; if (t.completed) doneTopics++; });
      w.assignments.forEach(a => { totalAssign++; if (a.status === 'pending' || a.status === 'in-progress') pendingAssign++; });
    }))));
    const overall = totalTopics > 0 ? Math.round((doneTopics/totalTopics)*100) : 0;
    html += `<div class="analytics-card"><h4>📈 Overall Progress</h4>
      <div class="stat-row"><span class="label">Topics completed</span><span class="value">${doneTopics}/${totalTopics}</span></div>
      <div class="mini-progress"><div class="fill" style="width:${overall}%"></div></div>
      <div class="stat-row" style="margin-top:8px;"><span class="label">Assignments</span><span class="value">${totalAssign}</span></div>
      <div class="stat-row"><span class="label">Pending</span><span class="value">${pendingAssign}</span></div>
    </div>`;
    html += `<div class="analytics-card"><h4>📅 Weekly Activity</h4><div class="chart-container"><canvas id="weeklyAnalyticsChart"></canvas></div></div>`;
    html += `</div>`;
    container.innerHTML = html;
    setTimeout(() => {
      const canvas = document.getElementById('weeklyAnalyticsChart');
      if (!canvas) return;
      const weekly = {};
      studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => u.weeks.forEach(w => {
        const key = y.name + ' W' + w.number;
        let total = 0, done = 0;
        w.topics.forEach(t => {
          total += t.subtopics.length;
          done += t.subCompleted.filter(Boolean).length;
        });
        if (!weekly[key]) weekly[key] = { total: 0, done: 0 };
        weekly[key].total += total;
        weekly[key].done += done;
      }))));
      const labels = Object.keys(weekly).sort();
      const doneData = labels.map(k => weekly[k].done);
      const totalData = labels.map(k => weekly[k].total);
      if (analyticsChart) analyticsChart.destroy();
      analyticsChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: 'Completed', data: doneData, backgroundColor: 'rgba(0,184,148,0.6)' },
            { label: 'Total', data: totalData, backgroundColor: 'rgba(47,199,255,0.2)' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#e0e8ee', font: { size: 9 } } }
          },
          scales: {
            x: { ticks: { color: '#8a9fb0', font: { size: 8 } } },
            y: { ticks: { color: '#8a9fb0', font: { size: 8 } } }
          }
        }
      });
    }, 200);
  }

  function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!studyData.years.length) {
      container.innerHTML = `<div class="text-center text-muted-light py-5"><i class="fa fa-graduation-cap" style="font-size:3rem;display:block;margin-bottom:12px;opacity:0.3;"></i><h4>No study data yet</h4></div>`;
      return;
    }
    studyData.years.forEach((year, yi) => {
      const yearKey = `year_${yi}`;
      const isOpen = expanded[yearKey] || false;
      const sec = document.createElement('div');
      sec.className = 'level-section';
      sec.innerHTML = `
        <div class="level-header" onclick="window.toggleExpand('${yearKey}')">
          <div><div class="name">📅 ${escapeHtml(year.name)}</div><div class="meta">${year.semesters.length} semesters</div></div>
          <div class="actions">
            <button class="btn btn-add" onclick="event.stopPropagation();window.addSemester(${yi})"><i class="fa fa-plus"></i> Semester</button>
            <button class="btn btn-edit" onclick="event.stopPropagation();window.editYear(${yi})"><i class="fa fa-pencil"></i></button>
            <button class="btn btn-del" onclick="event.stopPropagation();window.deleteYear(${yi})"><i class="fa fa-trash"></i></button>
            <i class="fa fa-chevron-${isOpen ? 'up' : 'down'}"></i>
          </div>
        </div>
        <div class="level-body ${isOpen ? 'open' : ''}">`;
      year.semesters.forEach((semester, si) => {
        const semKey = `semester_${yi}_${si}`;
        const semOpen = expanded[semKey] || false;
        const semDiv = document.createElement('div');
        semDiv.className = 'level-section';
        semDiv.style.marginBottom = '12px';
        semDiv.innerHTML = `
          <div class="level-header" onclick="window.toggleExpand('${semKey}')">
            <div><div class="name">📘 ${escapeHtml(semester.name)}</div><div class="meta">${semester.units.length} units</div></div>
            <div class="actions">
              <button class="btn btn-add" onclick="event.stopPropagation();window.addUnit(${yi}, ${si})"><i class="fa fa-plus"></i> Unit</button>
              <button class="btn btn-edit" onclick="event.stopPropagation();window.editSemester(${yi}, ${si})"><i class="fa fa-pencil"></i></button>
              <button class="btn btn-del" onclick="event.stopPropagation();window.deleteSemester(${yi}, ${si})"><i class="fa fa-trash"></i></button>
              <i class="fa fa-chevron-${semOpen ? 'up' : 'down'}"></i>
            </div>
          </div>
          <div class="level-body ${semOpen ? 'open' : ''}">`;
        semester.units.forEach((unit, ui) => {
          const unitKey = `unit_${yi}_${si}_${ui}`;
          const unitOpen = expanded[unitKey] || false;
          const weeks = unit.weeks || [];
          let totalSub = 0, doneSub = 0;
          weeks.forEach(w => w.topics.forEach(t => { totalSub += t.subtopics.length; doneSub += t.subCompleted.filter(Boolean).length; }));
          const pct = totalSub > 0 ? Math.round((doneSub/totalSub)*100) : 0;
          const doneWeeks = weeks.filter(w => w.topics.every(t => t.completed)).length;
          const unitCard = document.createElement('div');
          unitCard.className = 'level-section';
          unitCard.style.marginBottom = '12px';
          unitCard.style.borderLeft = unit.color ? `4px solid ${unit.color}` : '';
          unitCard.innerHTML = `
            <div class="level-header" onclick="window.toggleExpand('${unitKey}')">
              <div><div class="name">${escapeHtml(unit.code)} – ${escapeHtml(unit.name)}</div><div class="meta">${doneWeeks}/${weeks.length} weeks · ${pct}%</div></div>
              <div class="actions">
                <button class="btn btn-add" onclick="event.stopPropagation();window.addWeek(${yi}, ${si}, ${ui})"><i class="fa fa-plus"></i> Week</button>
                <button class="btn btn-grade" onclick="event.stopPropagation();window.openGradeModal(${yi}, ${si}, ${ui})"><i class="fa fa-calculator"></i> Grade</button>
                <button class="btn btn-edit" onclick="event.stopPropagation();window.editUnit(${yi}, ${si}, ${ui})"><i class="fa fa-pencil"></i></button>
                <button class="btn btn-del" onclick="event.stopPropagation();window.deleteUnit(${yi}, ${si}, ${ui})"><i class="fa fa-trash"></i></button>
                <i class="fa fa-chevron-${unitOpen ? 'up' : 'down'}"></i>
              </div>
            </div>
            <div class="level-body ${unitOpen ? 'open' : ''}">`;
          weeks.forEach((week, wi) => {
            const weekKey = `week_${yi}_${si}_${ui}_${wi}`;
            const weekOpen = expanded[weekKey] || false;
            let totalSubW = 0, doneSubW = 0;
            week.topics.forEach(t => { totalSubW += t.subtopics.length; doneSubW += t.subCompleted.filter(Boolean).length; });
            const pctW = totalSubW > 0 ? Math.round((doneSubW/totalSubW)*100) : 0;
            const weekDiv = document.createElement('div');
            weekDiv.className = 'level-section';
            weekDiv.style.marginBottom = '8px';
            weekDiv.innerHTML = `
              <div class="level-header" onclick="window.toggleExpand('${weekKey}')" style="padding:8px 14px;">
                <div><div class="name">📌 Week ${week.number}</div><div class="meta">${doneSubW}/${totalSubW} · ${pctW}%</div></div>
                <div class="actions">
                  <button class="btn btn-add" onclick="event.stopPropagation();window.addTopic(${yi}, ${si}, ${ui}, ${wi})"><i class="fa fa-plus"></i> Topic</button>
                  <button class="btn btn-add" onclick="event.stopPropagation();window.addAssignment(${yi}, ${si}, ${ui}, ${wi})"><i class="fa fa-plus"></i> Assignment</button>
                  <button class="btn btn-edit" onclick="event.stopPropagation();window.editWeek(${yi}, ${si}, ${ui}, ${wi})"><i class="fa fa-pencil"></i></button>
                  <button class="btn btn-del" onclick="event.stopPropagation();window.deleteWeek(${yi}, ${si}, ${ui}, ${wi})"><i class="fa fa-trash"></i></button>
                  <button class="btn btn-bulk" onclick="event.stopPropagation();window.bulkToggleWeek(${yi},${si},${ui},${wi},true)">✅ All</button>
                  <button class="btn btn-bulk" onclick="event.stopPropagation();window.bulkToggleWeek(${yi},${si},${ui},${wi},false)">↩️ None</button>
                </div>
              </div>
              <div class="level-body ${weekOpen ? 'open' : ''}">`;
            week.topics.forEach((topic, ti) => {
              recalcTopicCompletion(topic);
              const subTopics = topic.subtopics || [];
              const subDone = topic.subCompleted.filter(Boolean).length;
              const checked = topic.completed || false;
              const topicKey = `topic_${yi}_${si}_${ui}_${wi}_${ti}`;
              const topicExpanded = expanded[topicKey] || false;
              const tDiv = document.createElement('div');
              tDiv.className = 'topic-item';
              tDiv.innerHTML = `
                <div class="topic-header" onclick="window.toggleExpand('${topicKey}')">
                  <div class="check ${checked ? 'checked' : ''}" data-yi="${yi}" data-si="${si}" data-ui="${ui}" data-wi="${wi}" data-ti="${ti}" onclick="event.stopPropagation();window.toggleTopicComplete(this, ${yi}, ${si}, ${ui}, ${wi}, ${ti})">
                    <i class="fa fa-check"></i>
                  </div>
                  <div class="name">${escapeHtml(topic.name)}</div>
                  <div class="meta">${subDone}/${subTopics.length}</div>
                  <div class="actions">
                    <button class="btn" onclick="event.stopPropagation();window.addSubtopic(${yi}, ${si}, ${ui}, ${wi}, ${ti})"><i class="fa fa-plus"></i></button>
                    <button class="btn" onclick="event.stopPropagation();window.editTopic(${yi}, ${si}, ${ui}, ${wi}, ${ti})"><i class="fa fa-pencil"></i></button>
                    <button class="btn btn-del" onclick="event.stopPropagation();window.deleteTopic(${yi}, ${si}, ${ui}, ${wi}, ${ti})"><i class="fa fa-trash"></i></button>
                  </div>
                  <span class="expand-icon"><i class="fa fa-chevron-${topicExpanded ? 'up' : 'down'}"></i></span>
                </div>
                <div class="subtopic-list ${topicExpanded ? 'open' : ''}">
                  ${subTopics.map((sub, si2) => {
                    const subChecked = (topic.subCompleted && topic.subCompleted[si2]) || false;
                    return `<div class="subtopic-item">
                      <div class="sub-check ${subChecked ? 'checked' : ''}" data-yi="${yi}" data-si="${si}" data-ui="${ui}" data-wi="${wi}" data-ti="${ti}" data-si2="${si2}" onclick="window.toggleSubtopic(this, ${yi}, ${si}, ${ui}, ${wi}, ${ti}, ${si2})">
                        <i class="fa fa-check"></i>
                      </div>
                      <div class="sub-label ${subChecked ? 'done' : ''}">${escapeHtml(sub)}</div>
                      <div class="sub-actions"><button class="btn" onclick="window.deleteSubtopic(${yi}, ${si}, ${ui}, ${wi}, ${ti}, ${si2})"><i class="fa fa-times"></i></button></div>
                    </div>`;
                  }).join('')}
                  <div class="subtopic-add-row"><button class="btn" onclick="window.addSubtopic(${yi}, ${si}, ${ui}, ${wi}, ${ti})"><i class="fa fa-plus"></i> Add subtopic</button></div>
                </div>
              `;
              weekDiv.querySelector('.level-body').appendChild(tDiv);
            });
            const assignments = week.assignments || [];
            if (assignments.length) {
              const assSection = document.createElement('div');
              assSection.className = 'assignments-section';
              let assHtml = `<div class="section-title"><i class="fa fa-tasks"></i> Assignments <button class="btn btn-add-ass" onclick="window.addAssignment(${yi}, ${si}, ${ui}, ${wi})"><i class="fa fa-plus"></i> Add</button></div>`;
              assignments.forEach((a, ai) => {
                const statusClass = a.status === 'pending' ? 'pending' : a.status === 'in-progress' ? 'in-progress' : 'submitted';
                const statusLabel = a.status === 'pending' ? 'Pending' : a.status === 'in-progress' ? 'In Progress' : '✅ Submitted';
                assHtml += `<div class="assignment-item">
                  <div class="ass-name">${escapeHtml(a.name)}</div>
                  <div class="ass-due">${a.due || 'No due date'}</div>
                  <div class="ass-status ${statusClass}">${statusLabel}</div>
                  <div class="ass-marks">${a.marks || '—'}</div>
                  <div class="ass-actions">
                    <button class="btn btn-edit-ass" onclick="window.editAssignment(${yi}, ${si}, ${ui}, ${wi}, ${ai})"><i class="fa fa-pencil"></i></button>
                    <button class="btn btn-del-ass" onclick="window.deleteAssignment(${yi}, ${si}, ${ui}, ${wi}, ${ai})"><i class="fa fa-trash"></i></button>
                  </div>
                </div>`;
              });
              assSection.innerHTML = assHtml;
              weekDiv.querySelector('.level-body').appendChild(assSection);
            }
            weekDiv.querySelector('.level-body').innerHTML += `</div>`;
            weekDiv.innerHTML += `</div>`;
            unitCard.querySelector('.level-body').appendChild(weekDiv);
          });
          unitCard.querySelector('.level-body').innerHTML += `</div>`;
          unitCard.innerHTML += `</div>`;
          semDiv.querySelector('.level-body').appendChild(unitCard);
        });
        semDiv.querySelector('.level-body').innerHTML += `</div>`;
        semDiv.innerHTML += `</div>`;
        sec.querySelector('.level-body').appendChild(semDiv);
      });
      sec.querySelector('.level-body').innerHTML += `</div>`;
      sec.innerHTML += `</div>`;
      container.appendChild(sec);
    });
  }

  function render() {
    safeRender(renderStats);
    safeRender(renderDeadlines);
    safeRender(renderAnalytics);
    safeRender(renderTree);
  }

  // ---- TOGGLE FUNCTIONS ----
  window.toggleExpand = function(key) {
    expanded[key] = !expanded[key];
    render();
  };
  window.toggleTopicComplete = function(el, yi, si, ui, wi, ti) {
    const topic = getTopic(yi, si, ui, wi, ti);
    if (!topic) return;
    topic.completed = !topic.completed;
    if (topic.subtopics.length) {
      topic.subCompleted = topic.subtopics.map(() => topic.completed);
    } else {
      topic.subCompleted = [];
    }
    el.classList.toggle('checked', topic.completed);
    const topicItem = el.closest('.topic-item');
    if (topicItem) {
      topicItem.querySelectorAll('.sub-check').forEach(sub => sub.classList.toggle('checked', topic.completed));
      topicItem.querySelectorAll('.sub-label').forEach(label => label.classList.toggle('done', topic.completed));
    }
    renderStats();
    renderAnalytics();
    renderDeadlines();
    scheduleSave();
  };
  window.toggleSubtopic = function(el, yi, si, ui, wi, ti, si2) {
    const topic = getTopic(yi, si, ui, wi, ti);
    if (!topic) return;
    if (!topic.subCompleted) topic.subCompleted = topic.subtopics.map(() => false);
    topic.subCompleted[si2] = !topic.subCompleted[si2];
    recalcTopicCompletion(topic);
    el.classList.toggle('checked', topic.subCompleted[si2]);
    const label = el.parentElement.querySelector('.sub-label');
    if (label) label.classList.toggle('done', topic.subCompleted[si2]);
    const topicItem = el.closest('.topic-item');
    if (topicItem) {
      const parentCheck = topicItem.querySelector('.topic-header .check');
      if (parentCheck) parentCheck.classList.toggle('checked', topic.completed);
    }
    renderStats();
    renderAnalytics();
    renderDeadlines();
    scheduleSave();
  };
  window.bulkToggleWeek = function(yi, si, ui, wi, complete) {
    const week = studyData.years[yi]?.semesters[si]?.units[ui]?.weeks[wi];
    if (!week) return;
    week.topics.forEach(topic => {
      topic.completed = complete;
      topic.subCompleted = topic.subtopics.map(() => complete);
    });
    render();
    scheduleSave();
  };

  // ---- CRUD OPERATIONS ----
  function openModal(title, bodyHTML, onSave) {
    const modal = document.getElementById('genericModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    modal.classList.add('open');
    modal._onSave = onSave;
  }
  document.getElementById('modalCancel').addEventListener('click', function() {
    document.getElementById('genericModal').classList.remove('open');
  });
  document.getElementById('modalSave').addEventListener('click', function() {
    const modal = document.getElementById('genericModal');
    const onSave = modal._onSave;
    if (typeof onSave === 'function') {
      const result = onSave();
      if (result !== false) {
        modal.classList.remove('open');
        render();
        scheduleSave();
        showToast('✅ Saved', 'success');
      }
    }
  });

  window.addYear = function() {
    openModal('Add Year', `<div class="form-group"><label>Year Name</label><input type="text" id="yearName" placeholder="2026" /></div>`,
      () => { const name = document.getElementById('yearName').value.trim(); if (!name) { showToast('Please enter a year name.', 'error'); return false; } studyData.years.push({ name, semesters: [] }); return true; });
  };
  window.editYear = function(yi) {
    const year = studyData.years[yi];
    openModal('Edit Year', `<div class="form-group"><label>Year Name</label><input type="text" id="yearName" value="${escapeHtml(year.name)}" /></div>`,
      () => { const name = document.getElementById('yearName').value.trim(); if (!name) { showToast('Please enter a year name.', 'error'); return false; } year.name = name; return true; });
  };
  window.deleteYear = function(yi) {
    if (!confirm('Delete this year and all its content?')) return;
    studyData.years.splice(yi, 1);
    render();
    scheduleSave();
  };

  window.addSemester = function(yi) {
    openModal('Add Semester', `<div class="form-group"><label>Semester Name</label><input type="text" id="semesterName" placeholder="Semester 2" /></div>`,
      () => { const name = document.getElementById('semesterName').value.trim(); if (!name) { showToast('Please enter a semester name.', 'error'); return false; } studyData.years[yi].semesters.push({ name, units: [] }); return true; });
  };
  window.editSemester = function(yi, si) {
    const sem = studyData.years[yi].semesters[si];
    openModal('Edit Semester', `<div class="form-group"><label>Semester Name</label><input type="text" id="semesterName" value="${escapeHtml(sem.name)}" /></div>`,
      () => { const name = document.getElementById('semesterName').value.trim(); if (!name) { showToast('Please enter a semester name.', 'error'); return false; } sem.name = name; return true; });
  };
  window.deleteSemester = function(yi, si) {
    if (!confirm('Delete this semester and all its units?')) return;
    studyData.years[yi].semesters.splice(si, 1);
    render();
    scheduleSave();
  };

  window.addUnit = function(yi, si) {
    openModal('Add Unit', `<div class="form-group"><label>Unit Code</label><input type="text" id="unitCode" placeholder="BSC106" /></div><div class="form-group"><label>Unit Name</label><input type="text" id="unitName" placeholder="Engineering Mathematics 2" /></div><div class="form-group"><label>Color</label><input type="text" id="unitColor" value="#2fc7ff" /></div>`,
      () => { const code = document.getElementById('unitCode').value.trim(); const name = document.getElementById('unitName').value.trim(); const color = document.getElementById('unitColor').value.trim() || '#2fc7ff'; if (!name) { showToast('Please enter a unit name.', 'error'); return false; } studyData.years[yi].semesters[si].units.push({ code, name, color, weeks: [] }); return true; });
  };
  window.editUnit = function(yi, si, ui) {
    const unit = studyData.years[yi].semesters[si].units[ui];
    openModal('Edit Unit', `<div class="form-group"><label>Unit Code</label><input type="text" id="unitCode" value="${escapeHtml(unit.code)}" /></div><div class="form-group"><label>Unit Name</label><input type="text" id="unitName" value="${escapeHtml(unit.name)}" /></div><div class="form-group"><label>Color</label><input type="text" id="unitColor" value="${escapeHtml(unit.color)}" /></div>`,
      () => { const code = document.getElementById('unitCode').value.trim(); const name = document.getElementById('unitName').value.trim(); const color = document.getElementById('unitColor').value.trim() || '#2fc7ff'; if (!name) { showToast('Please enter a unit name.', 'error'); return false; } unit.code = code; unit.name = name; unit.color = color; return true; });
  };
  window.deleteUnit = function(yi, si, ui) {
    if (!confirm('Delete this unit and all its weeks, topics, and assignments?')) return;
    studyData.years[yi].semesters[si].units.splice(ui, 1);
    render();
    scheduleSave();
  };

  window.addWeek = function(yi, si, ui) {
    openModal('Add Week', `<div class="form-group"><label>Week Number</label><input type="number" id="weekNumber" min="1" step="1" value="1" /></div>`,
      () => { const number = parseInt(document.getElementById('weekNumber').value); if (!number || number < 1) { showToast('Please enter a valid week number.', 'error'); return false; } const unit = studyData.years[yi].semesters[si].units[ui]; unit.weeks.push({ number, topics: [], assignments: [] }); return true; });
  };
  window.editWeek = function(yi, si, ui, wi) {
    const week = studyData.years[yi].semesters[si].units[ui].weeks[wi];
    openModal('Edit Week', `<div class="form-group"><label>Week Number</label><input type="number" id="weekNumber" value="${week.number}" min="1" step="1" /></div>`,
      () => { const number = parseInt(document.getElementById('weekNumber').value); if (!number || number < 1) { showToast('Please enter a valid week number.', 'error'); return false; } week.number = number; return true; });
  };
  window.deleteWeek = function(yi, si, ui, wi) {
    if (!confirm('Delete this week and all its topics and assignments?')) return;
    studyData.years[yi].semesters[si].units[ui].weeks.splice(wi, 1);
    render();
    scheduleSave();
  };

  window.addTopic = function(yi, si, ui, wi) {
    openModal('Add Topic', `<div class="form-group"><label>Topic Name</label><input type="text" id="topicName" placeholder="e.g. Multivariable Calculus" /></div>`,
      () => { const name = document.getElementById('topicName').value.trim(); if (!name) { showToast('Please enter a topic name.', 'error'); return false; } const week = studyData.years[yi].semesters[si].units[ui].weeks[wi]; week.topics.push({ name, subtopics: [], completed: false, subCompleted: [] }); return true; });
  };
  window.editTopic = function(yi, si, ui, wi, ti) {
    const topic = studyData.years[yi].semesters[si].units[ui].weeks[wi].topics[ti];
    openModal('Edit Topic', `<div class="form-group"><label>Topic Name</label><input type="text" id="topicName" value="${escapeHtml(topic.name)}" /></div>`,
      () => { const name = document.getElementById('topicName').value.trim(); if (!name) { showToast('Please enter a topic name.', 'error'); return false; } topic.name = name; return true; });
  };
  window.deleteTopic = function(yi, si, ui, wi, ti) {
    if (!confirm('Delete this topic and all its subtopics?')) return;
    const week = studyData.years[yi].semesters[si].units[ui].weeks[wi];
    week.topics.splice(ti, 1);
    render();
    scheduleSave();
  };

  window.addSubtopic = function(yi, si, ui, wi, ti) {
    openModal('Add Subtopic', `<div class="form-group"><label>Subtopic Name</label><input type="text" id="subtopicName" placeholder="e.g. Partial derivatives" /></div>`,
      () => { const name = document.getElementById('subtopicName').value.trim(); if (!name) { showToast('Please enter a subtopic name.', 'error'); return false; } const topic = studyData.years[yi].semesters[si].units[ui].weeks[wi].topics[ti]; if (!topic.subtopics) topic.subtopics = []; if (!topic.subCompleted) topic.subCompleted = []; topic.subtopics.push(name); topic.subCompleted.push(false); recalcTopicCompletion(topic); return true; });
  };
  window.deleteSubtopic = function(yi, si, ui, wi, ti, si2) {
    if (!confirm('Delete this subtopic?')) return;
    const topic = studyData.years[yi].semesters[si].units[ui].weeks[wi].topics[ti];
    if (topic.subtopics && topic.subtopics.length > si2) {
      topic.subtopics.splice(si2, 1);
      if (topic.subCompleted && topic.subCompleted.length > si2) {
        topic.subCompleted.splice(si2, 1);
      }
      recalcTopicCompletion(topic);
    }
    render();
    scheduleSave();
  };

  window.addAssignment = function(yi, si, ui, wi) {
    openModal('Add Assignment', `<div class="form-group"><label>Assignment Name</label><input type="text" id="assName" placeholder="e.g. Quiz 1" /></div><div class="form-group"><label>Due Date</label><input type="date" id="assDue" /></div><div class="form-group"><label>Status</label><select id="assStatus"><option value="pending">Pending</option><option value="in-progress">In Progress</option><option value="submitted">Submitted</option></select></div><div class="form-group"><label>Marks</label><input type="text" id="assMarks" placeholder="e.g. 85%" /></div><div class="form-group"><label>Weighting (%)</label><input type="number" id="assWeight" placeholder="5" min="0" max="100" /></div>`,
      () => { const name = document.getElementById('assName').value.trim(); const due = document.getElementById('assDue').value; const status = document.getElementById('assStatus').value; const marks = document.getElementById('assMarks').value.trim(); const weight = parseFloat(document.getElementById('assWeight').value) || 0; if (!name) { showToast('Please enter an assignment name.', 'error'); return false; } const week = studyData.years[yi].semesters[si].units[ui].weeks[wi]; if (!week.assignments) week.assignments = []; week.assignments.push({ name, due, status, marks, weight }); return true; });
  };
  window.editAssignment = function(yi, si, ui, wi, ai) {
    const ass = studyData.years[yi].semesters[si].units[ui].weeks[wi].assignments[ai];
    openModal('Edit Assignment', `<div class="form-group"><label>Assignment Name</label><input type="text" id="assName" value="${escapeHtml(ass.name)}" /></div><div class="form-group"><label>Due Date</label><input type="date" id="assDue" value="${ass.due || ''}" /></div><div class="form-group"><label>Status</label><select id="assStatus"><option value="pending" ${ass.status === 'pending' ? 'selected' : ''}>Pending</option><option value="in-progress" ${ass.status === 'in-progress' ? 'selected' : ''}>In Progress</option><option value="submitted" ${ass.status === 'submitted' ? 'selected' : ''}>Submitted</option></select></div><div class="form-group"><label>Marks</label><input type="text" id="assMarks" value="${escapeHtml(ass.marks || '')}" /></div><div class="form-group"><label>Weighting (%)</label><input type="number" id="assWeight" value="${ass.weight || ''}" min="0" max="100" /></div>`,
      () => { const name = document.getElementById('assName').value.trim(); const due = document.getElementById('assDue').value; const status = document.getElementById('assStatus').value; const marks = document.getElementById('assMarks').value.trim(); const weight = parseFloat(document.getElementById('assWeight').value) || 0; if (!name) { showToast('Please enter an assignment name.', 'error'); return false; } ass.name = name; ass.due = due; ass.status = status; ass.marks = marks; ass.weight = weight; return true; });
  };
  window.deleteAssignment = function(yi, si, ui, wi, ai) {
    if (!confirm('Delete this assignment?')) return;
    const week = studyData.years[yi].semesters[si].units[ui].weeks[wi];
    week.assignments.splice(ai, 1);
    render();
    scheduleSave();
  };

  // ---- GRADE CALCULATOR ----
  function calculateUnitGrade(unit) {
    const allAssignments = [];
    (unit.weeks || []).forEach(week => {
      (week.assignments || []).forEach(ass => {
        allAssignments.push(ass);
      });
    });
    let totalWeight = 0, weightedSum = 0, missingMarks = 0;
    allAssignments.forEach(ass => {
      const weight = parseFloat(ass.weight) || 0;
      totalWeight += weight;
      const marks = parseFloat(ass.marks);
      if (!isNaN(marks) && marks >= 0 && marks <= 100) {
        weightedSum += marks * (weight / 100);
      } else {
        missingMarks += weight;
      }
    });
    if (allAssignments.length === 0 || totalWeight === 0) return null;
    const achievedWeight = totalWeight - missingMarks;
    const currentGrade = achievedWeight > 0 ? (weightedSum / achievedWeight) * 100 : null;
    return { grade: currentGrade, totalWeight, weightedSum, missingMarks, allAssignments, achievedWeight };
  }

  window.openGradeModal = function(yi, si, ui) {
    const unit = studyData.years[yi]?.semesters[si]?.units[ui];
    if (!unit) return;
    const result = calculateUnitGrade(unit);
    const body = document.getElementById('gradeModalBody');
    let html = '';
    let gradeDisplay = 'N/A', gradeColor = 'red', gradeValue = 0;
    if (result) {
      if (result.grade !== null) {
        gradeValue = Math.round(result.grade);
        gradeDisplay = gradeValue + '%';
        gradeColor = gradeValue >= 70 ? 'green' : (gradeValue >= 50 ? 'orange' : 'red');
      } else {
        gradeDisplay = '—';
      }
    } else {
      gradeDisplay = 'No assignments';
    }
    html += `<div class="grade-summary">
      <div class="card"><div class="value ${gradeColor}">${gradeDisplay}</div><div class="label">Current Grade</div></div>
      <div class="card"><div class="value">${result ? (result.missingMarks > 0 ? '⏳' : '✅') : '—'}</div><div class="label">${result ? (result.missingMarks > 0 ? result.missingMarks.toFixed(0)+'% pending' : 'All marked') : '—'}</div></div>
      <div class="card"><div class="value">${result ? result.allAssignments.length : 0}</div><div class="label">Assignments</div></div>
    </div>`;
    if (result && result.allAssignments.length > 0) {
      html += `<div style="max-height:260px;overflow-y:auto;">`;
      result.allAssignments.forEach((ass, idx) => {
        const isPending = ass.status === 'pending' || ass.status === 'in-progress';
        const statusClass = isPending ? 'pending' : 'submitted';
        const statusLabel = isPending ? 'Pending' : 'Submitted';
        html += `<div class="assignment-row" data-idx="${idx}">
          <div class="name">${escapeHtml(ass.name)}</div>
          <div class="weight">${ass.weight || 0}%</div>
          <input type="number" class="marks-input" value="${ass.marks || ''}" min="0" max="100" step="0.5"
            data-yi="${yi}" data-si="${si}" data-ui="${ui}" data-idx="${idx}"
            onchange="window.updateGradeMark(this)" placeholder="Marks">
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>`;
      });
      html += `</div>`;
      const currentGrade = result.grade;
      const missingWeight = result.missingMarks || 0;
      const achievedWeight = result.achievedWeight || 0;
      const totalWeight = result.totalWeight || 100;
      html += `<div class="what-if">
        <div style="font-weight:600;margin-bottom:8px;">🎯 What-If Scenario</div>
        <div class="input-group">
          <span>Target grade:</span>
          <input type="number" id="targetGradeInput" value="${Math.round(currentGrade || 70)}" min="0" max="100" step="0.5"
            oninput="window.updateWhatIf(${yi}, ${si}, ${ui}, this.value)">
          <span>%</span>
        </div>
        <div id="whatIfResult" style="margin-top:8px;">
          ${currentGrade !== null ? (missingWeight > 0 ? 'Enter marks to see what-if.' : '✅ All done!') : 'Enter marks to see what-if.'}
        </div>
      </div>`;
    } else {
      html += `<p style="color:var(--text-secondary);">No assignments found for this unit.</p>`;
    }
    body.innerHTML = html;
    document.getElementById('gradeModalTitle').textContent = `📊 Grade Calculator – ${unit.code} ${unit.name}`;
    if (result && result.grade !== null) {
      setTimeout(() => {
        const targetInput = document.getElementById('targetGradeInput');
        if (targetInput) window.updateWhatIf(yi, si, ui, targetInput.value);
      }, 100);
    }
    document.getElementById('gradeModal').classList.add('open');
  };

  window.updateGradeMark = function(input) {
    const yi = parseInt(input.dataset.yi);
    const si = parseInt(input.dataset.si);
    const ui = parseInt(input.dataset.ui);
    const idx = parseInt(input.dataset.idx);
    const unit = studyData.years[yi]?.semesters[si]?.units[ui];
    if (!unit) return;
    const flatAssignments = [];
    (unit.weeks || []).forEach(week => {
      (week.assignments || []).forEach(ass => {
        flatAssignments.push(ass);
      });
    });
    if (idx < flatAssignments.length) {
      flatAssignments[idx].marks = input.value;
      scheduleSave();
      if (document.getElementById('gradeModal').classList.contains('open')) {
        window.openGradeModal(yi, si, ui);
        const newInput = document.querySelector(`.marks-input[data-yi="${yi}"][data-si="${si}"][data-ui="${ui}"][data-idx="${idx}"]`);
        if (newInput) newInput.focus();
      }
      showToast('✅ Marks updated', 'success');
    }
  };

  window.updateWhatIf = function(yi, si, ui, target) {
    const unit = studyData.years[yi]?.semesters[si]?.units[ui];
    if (!unit) return;
    const result = calculateUnitGrade(unit);
    if (!result || result.grade === null) {
      document.getElementById('whatIfResult').innerHTML = 'Enter marks to see what-if.';
      return;
    }
    const currentGrade = result.grade;
    const missingWeight = result.missingMarks || 0;
    const achievedWeight = result.achievedWeight || 0;
    const totalWeight = result.totalWeight || 100;
    const targetNum = parseFloat(target);
    if (isNaN(targetNum) || targetNum < 0 || targetNum > 100) {
      document.getElementById('whatIfResult').innerHTML = 'Please enter a valid target (0-100).';
      return;
    }
    const resultDiv = document.getElementById('whatIfResult');
    if (missingWeight === 0) {
      resultDiv.innerHTML = `✅ All assignments already have marks. Your grade is <strong>${Math.round(currentGrade)}%</strong>.`;
      return;
    }
    const needed = (targetNum * totalWeight - currentGrade * achievedWeight / 100) / missingWeight * 100;
    if (needed > 100) {
      resultDiv.innerHTML = `❌ <span class="impossible">Even scoring 100% on all remaining assignments (${missingWeight}%) will only get you ${((currentGrade * achievedWeight / 100 + missingWeight) / totalWeight * 100).toFixed(1)}%</span>`;
    } else if (needed < 0) {
      resultDiv.innerHTML = `✅ You already have <strong>${Math.round(currentGrade)}%</strong>. You can score 0% on remaining assignments and still reach ${targetNum}%.`;
    } else {
      resultDiv.innerHTML = `💡 To reach <strong>${targetNum}%</strong>, you need <strong class="needed">${needed.toFixed(1)}%</strong> average on the remaining <strong>${missingWeight}%</strong> of assignments.`;
    }
  };

  document.getElementById('gradeModalClose').addEventListener('click', function() {
    document.getElementById('gradeModal').classList.remove('open');
  });

  // ---- EXCEL EXPORT ----
  window.exportToExcel = async function() {
    if (!studyData.years.length) {
      showToast('No data to export.', 'error');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'progress-overlay';
    overlay.innerHTML = `
      <div class="progress-card">
        <h4><i class="fa fa-file-excel-o"></i> Generating Excel Report</h4>
        <p id="progressStage" class="progress-stage">Initializing...</p>
        <div class="progress-track"><div id="progressFill" class="progress-fill-bar" style="width:0%;"></div></div>
        <span id="progressPercent" class="progress-percent">0%</span>
      </div>`;
    document.body.appendChild(overlay);
    const updateProgress = (pct, stage) => {
      const fill = document.getElementById('progressFill');
      const percent = document.getElementById('progressPercent');
      const stageEl = document.getElementById('progressStage');
      if (fill) fill.style.width = pct + '%';
      if (percent) percent.textContent = pct + '%';
      if (stage && stageEl) stageEl.textContent = stage;
    };
    updateProgress(5, 'Preparing data...');

    try {
      const ExcelJS = window.ExcelJS;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = user.username;
      workbook.created = new Date();

      let totalTopics = 0, doneTopics = 0, totalAssignments = 0, pendingAssignments = 0, submittedAssignments = 0;
      let totalWeighted = 0, weightedSum = 0;
      const unitProgress = [];
      studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => {
        let unitTotal = 0, unitDone = 0;
        u.weeks.forEach(w => {
          w.topics.forEach(t => {
            unitTotal += t.subtopics.length;
            unitDone += t.subCompleted.filter(Boolean).length;
            totalTopics += t.subtopics.length;
            doneTopics += t.subCompleted.filter(Boolean).length;
          });
          w.assignments.forEach(a => {
            totalAssignments++;
            if (a.status === 'submitted') submittedAssignments++;
            else if (a.status === 'pending' || a.status === 'in-progress') pendingAssignments++;
            const weight = parseFloat(a.weight) || 0;
            totalWeighted += weight;
            const marks = parseFloat(a.marks);
            if (!isNaN(marks) && marks >= 0 && marks <= 100) {
              weightedSum += marks * (weight / 100);
            }
          });
        });
        unitProgress.push({ code: u.code, name: u.name, total: unitTotal, done: unitDone, pct: unitTotal > 0 ? (unitDone/unitTotal)*100 : 0 });
      })));

      const completionPct = totalTopics > 0 ? (doneTopics/totalTopics)*100 : 0;
      const assignmentCompletionPct = totalAssignments > 0 ? (submittedAssignments/totalAssignments)*100 : 0;
      const overallGrade = totalWeighted > 0 ? (weightedSum/totalWeighted)*100 : null;

      // ---- SHEET 1: Cover ----
      updateProgress(10, 'Creating cover sheet...');
      const cover = workbook.addWorksheet('Cover');
      cover.mergeCells('A1:F1');
      const title = cover.getCell('A1');
      title.value = '📚 STUDY PLAN REPORT';
      title.font = { bold: true, size: 28, color: { argb: 'FFFFFFFF' } };
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      title.alignment = { horizontal: 'center', vertical: 'middle' };
      cover.getRow(1).height = 60;
      cover.mergeCells('A2:F2');
      const sub = cover.getCell('A2');
      sub.value = `Generated for ${user.username}`;
      sub.font = { size: 14, italic: true, color: { argb: 'FF2FC7FF' } };
      sub.alignment = { horizontal: 'center' };
      cover.getRow(2).height = 30;
      cover.addRow([]);
      const dateRow = cover.addRow(['Report Date:', new Date().toLocaleString()]);
      dateRow.font = { size: 12 };
      const meta = [
        ['Total Years:', studyData.years.length],
        ['Total Units:', studyData.years.reduce((acc, y) => acc + y.semesters.reduce((a, s) => a + s.units.length, 0), 0)],
        ['Total Weeks:', studyData.years.reduce((acc, y) => acc + y.semesters.reduce((a, s) => a + s.units.reduce((u, un) => u + un.weeks.length, 0), 0), 0)],
        ['Total Topics:', totalTopics],
        ['Completed Topics:', doneTopics],
        ['Completion Rate:', completionPct.toFixed(1) + '%'],
        ['Total Assignments:', totalAssignments],
        ['Submitted:', submittedAssignments],
        ['Pending:', pendingAssignments],
        ['Overall Grade:', overallGrade !== null ? overallGrade.toFixed(1) + '%' : 'N/A']
      ];
      meta.forEach(([label, value]) => {
        const row = cover.addRow([label, value]);
        row.getCell(1).font = { bold: true };
      });
      cover.columns = [{ width: 25 }, { width: 30 }];

      // ---- SHEET 2: Unit Progress ----
      updateProgress(25, 'Building unit progress table...');
      const unitSheet = workbook.addWorksheet('Unit Progress');
      unitSheet.mergeCells('A1:D1');
      const uTitle = unitSheet.getCell('A1');
      uTitle.value = '📊 UNIT PROGRESS BREAKDOWN';
      uTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      uTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      uTitle.alignment = { horizontal: 'center' };
      unitSheet.getRow(1).height = 30;

      const uHeaders = ['Unit', 'Total Subtopics', 'Completed', 'Progress'];
      const uHead = unitSheet.addRow(uHeaders);
      uHead.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      uHead.height = 24;
      unitProgress.forEach(u => {
        const row = unitSheet.addRow([u.code + ' ' + u.name, u.total, u.done, u.pct.toFixed(1) + '%']);
        row.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle' };
        });
        const pctCell = row.getCell(4);
        if (u.pct >= 80) pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        else if (u.pct >= 50) pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
        else pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      });
      unitSheet.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }];

      // ---- SHEET 3: Assignment Tracker ----
      updateProgress(40, 'Creating assignment tracker...');
      const assignSheet = workbook.addWorksheet('Assignment Tracker');
      assignSheet.mergeCells('A1:G1');
      const aTitle = assignSheet.getCell('A1');
      aTitle.value = '📋 ASSIGNMENT TRACKER';
      aTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      aTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      aTitle.alignment = { horizontal: 'center' };
      assignSheet.getRow(1).height = 30;

      const aHeaders = ['Unit', 'Week', 'Assignment', 'Due Date', 'Status', 'Marks', 'Weight'];
      const aHead = assignSheet.addRow(aHeaders);
      aHead.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      aHead.height = 24;
      studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => u.weeks.forEach(w => w.assignments.forEach(a => {
        const row = assignSheet.addRow([u.code, 'W' + w.number, a.name, a.due || '', a.status, a.marks || '', a.weight || '']);
        row.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle' };
        });
        const statusCell = row.getCell(5);
        if (a.status === 'submitted') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          statusCell.font = { color: { argb: 'FF006400' }, bold: true };
        } else if (a.status === 'in-progress') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
          statusCell.font = { color: { argb: 'FF8B6500' }, bold: true };
        } else {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          statusCell.font = { color: { argb: 'FF8B0000' }, bold: true };
        }
      }))));
      assignSheet.columns = [{ width: 15 }, { width: 10 }, { width: 30 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 12 }];

      // ---- SHEET 4: Grade Analysis ----
      updateProgress(60, 'Building grade analysis...');
      const gradeSheet = workbook.addWorksheet('Grade Analysis');
      gradeSheet.mergeCells('A1:E1');
      const gTitle = gradeSheet.getCell('A1');
      gTitle.value = '📊 GRADE ANALYSIS';
      gTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      gTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      gTitle.alignment = { horizontal: 'center' };
      gradeSheet.getRow(1).height = 30;

      const gHeaders = ['Unit', 'Assignments', 'Weighted Grade', 'Status', 'Prediction'];
      const gHead = gradeSheet.addRow(gHeaders);
      gHead.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      gHead.height = 24;
      studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => {
        const result = calculateUnitGrade(u);
        const grade = result && result.grade !== null ? result.grade : null;
        const gradeDisplay = grade !== null ? grade.toFixed(1) + '%' : 'N/A';
        const status = grade !== null ? (grade >= 70 ? '✅ Passing' : grade >= 50 ? '⚠️ Borderline' : '❌ Fail') : '—';
        const prediction = grade !== null ? (grade >= 70 ? 'On track' : grade >= 50 ? 'Needs improvement' : 'At risk') : '—';
        const row = gradeSheet.addRow([u.code + ' ' + u.name, result ? result.allAssignments.length : 0, gradeDisplay, status, prediction]);
        row.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle' };
        });
        const statusCell = row.getCell(4);
        if (status.includes('✅')) {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          statusCell.font = { color: { argb: 'FF006400' }, bold: true };
        } else if (status.includes('⚠️')) {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
          statusCell.font = { color: { argb: 'FF8B6500' }, bold: true };
        } else if (status.includes('❌')) {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          statusCell.font = { color: { argb: 'FF8B0000' }, bold: true };
        }
      })));
      gradeSheet.columns = [{ width: 30 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 20 }];

      // ---- SHEET 5: Charts ----
      updateProgress(80, 'Generating charts...');
      const chartSheet = workbook.addWorksheet('Charts');
      chartSheet.mergeCells('A1:C1');
      const cTitle = chartSheet.getCell('A1');
      cTitle.value = '📈 VISUAL DASHBOARD';
      cTitle.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      cTitle.alignment = { horizontal: 'center' };
      chartSheet.getRow(1).height = 36;

      // Chart 1: Unit Progress
      const canvas1 = document.createElement('canvas');
      canvas1.width = 800; canvas1.height = 400;
      const ctx1 = canvas1.getContext('2d');
      const codes = unitProgress.map(u => u.code);
      const pcts = unitProgress.map(u => u.pct);
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: codes,
          datasets: [{ label: 'Progress %', data: pcts, backgroundColor: '#2fc7ff' }]
        },
        options: {
          responsive: false,
          plugins: { title: { display: true, text: 'Unit Progress (%)', font: { size: 18 } } },
          scales: { y: { beginAtZero: true, max: 100 } }
        }
      });
      await new Promise(r => setTimeout(r, 500));
      const img1 = canvas1.toDataURL('image/png');
      const imageId1 = workbook.addImage({ base64: img1, extension: 'png' });
      chartSheet.addImage(imageId1, { tl: { col: 0, row: 3 }, ext: { width: 380, height: 250 } });

      // Chart 2: Weekly Trend
      const canvas2 = document.createElement('canvas');
      canvas2.width = 800; canvas2.height = 400;
      const ctx2 = canvas2.getContext('2d');
      const weeklyData = {};
      studyData.years.forEach(y => y.semesters.forEach(s => s.units.forEach(u => u.weeks.forEach(w => {
        const key = y.name + ' W' + w.number;
        let total = 0, done = 0;
        w.topics.forEach(t => { total += t.subtopics.length; done += t.subCompleted.filter(Boolean).length; });
        if (!weeklyData[key]) weeklyData[key] = { total: 0, done: 0 };
        weeklyData[key].total += total;
        weeklyData[key].done += done;
      }))));
      const labels = Object.keys(weeklyData).sort();
      const doneData = labels.map(k => weeklyData[k].done);
      const totalData = labels.map(k => weeklyData[k].total);
      new Chart(ctx2, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Completed', data: doneData, borderColor: '#00b894', fill: false, tension: 0.3 },
            { label: 'Total', data: totalData, borderColor: '#2fc7ff', fill: false, tension: 0.3 }
          ]
        },
        options: {
          responsive: false,
          plugins: { title: { display: true, text: 'Weekly Subtopics Trend', font: { size: 18 } } },
          scales: { y: { beginAtZero: true } }
        }
      });
      await new Promise(r => setTimeout(r, 500));
      const img2 = canvas2.toDataURL('image/png');
      const imageId2 = workbook.addImage({ base64: img2, extension: 'png' });
      chartSheet.addImage(imageId2, { tl: { col: 2, row: 3 }, ext: { width: 380, height: 250 } });

      chartSheet.protect('Siya');

      // ---- SHEET 6: Yearly Calendar (simplified) ----
      updateProgress(90, 'Building yearly calendar...');
      const calendarSheet = workbook.addWorksheet('Yearly Calendar');
      calendarSheet.mergeCells('A1:E1');
      const calTitle = calendarSheet.getCell('A1');
      calTitle.value = '📅 YEARLY CALENDAR';
      calTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      calTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      calTitle.alignment = { horizontal: 'center' };
      calendarSheet.getRow(1).height = 30;
      calendarSheet.addRow(['Month', 'Total Hours', 'Working Days', 'Avg/Day', 'Status']);
      // (Full calendar logic would go here – simplified for brevity)
      calendarSheet.columns = [{ width: 18 }, { width: 15 }, { width: 18 }, { width: 15 }, { width: 18 }];

      // ---- SAVE ----
      updateProgress(95, 'Saving Excel file...');
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `StudyPlan_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('✅ Excel report generated successfully!', 'success');
      updateProgress(100, 'Done!');
      setTimeout(() => overlay.remove(), 1500);
    } catch (err) {
      console.error(err);
      showToast('Export failed: ' + err.message, 'error');
      document.querySelector('.progress-overlay')?.remove();
    }
  };

  // ---- INIT ----
  document.addEventListener('DOMContentLoaded', function() {
    // Ensure the loader is hidden if anything goes wrong during init
    const loader = document.getElementById('initialLoading');
    try {
      // Build the UI structure
      const contentArea = document.getElementById('contentArea');
      if (!contentArea) return;
      contentArea.innerHTML = `
        <div class="study-header">
          <div>
            <h1><i class="fa fa-graduation-cap" style="font-size:1.8rem;margin-right:12px;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;"></i> Study Manager</h1>
            <div class="subtitle">Years → Semesters → Units → Weeks → Topics → Subtopics · <span id="userDisplay">🔒 ${user.username}</span></div>
          </div>
          <div class="actions">
            <button class="btn btn-sync" id="syncBtn"><i class="fa fa-cloud-download"></i> Sync</button>
            <button class="btn btn-excel" id="exportBtn"><i class="fa fa-file-excel-o"></i> Excel</button>
            <button class="btn btn-success-glow" id="addYearBtn"><i class="fa fa-plus"></i> Add Year</button>
            <button class="btn btn-outline-secondary" id="resetBtn" style="border-color:var(--border-subtle);color:var(--text-secondary);"><i class="fa fa-refresh"></i> Reset</button>
          </div>
        </div>
        <div id="deadlinesContainer"></div>
        <div id="analyticsContainer"></div>
        <div class="stats-bar">
          <div class="stat-item"><div class="number blue" id="statYears">0</div><div class="label">Years</div></div>
          <div class="stat-item"><div class="number purple" id="statUnits">0</div><div class="label">Units</div></div>
          <div class="stat-item"><div class="number orange" id="statWeeks">0</div><div class="label">Weeks</div></div>
          <div class="stat-item"><div class="number green" id="statTopicsDone">0</div><div class="label">Topics Done</div></div>
          <div class="stat-item"><div class="number" id="statAssignments">0</div><div class="label">Assignments</div></div>
          <div class="stat-item"><div class="number red" id="statPending">0</div><div class="label">Pending</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline-secondary" onclick="window.expandAll()" style="border-color:var(--border-subtle);color:var(--text-secondary);"><i class="fa fa-plus-square"></i> Expand All</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="window.collapseAll()" style="border-color:var(--border-subtle);color:var(--text-secondary);"><i class="fa fa-minus-square"></i> Collapse All</button>
        </div>
        <div id="treeContainer"></div>
        <div class="text-center text-muted-light small py-4" style="border-top:1px solid var(--border-subtle);margin-top:20px;">
          <span id="footerStatus"></span>
        </div>
      `;

      // Bind buttons
      document.getElementById('addYearBtn').addEventListener('click', window.addYear);
      document.getElementById('syncBtn').addEventListener('click', async function() {
        showToast('Syncing...', 'info');
        await loadData();
        showToast('Synced from GitHub', 'success');
      });
      document.getElementById('exportBtn').addEventListener('click', window.exportToExcel);
      document.getElementById('resetBtn').addEventListener('click', function() {
        if (!confirm('Reset ALL data to default?')) return;
        studyData = getDefaultData();
        expanded = {};
        render();
        scheduleSave();
        showToast('Reset to default', 'info');
      });

      // Expand/collapse all
      window.expandAll = function() {
        document.querySelectorAll('.level-body').forEach(el => el.classList.add('open'));
        document.querySelectorAll('.level-header .fa-chevron-down, .level-header .fa-chevron-up').forEach(el => {
          el.classList.toggle('fa-chevron-down');
          el.classList.toggle('fa-chevron-up');
        });
      };
      window.collapseAll = function() {
        document.querySelectorAll('.level-body').forEach(el => el.classList.remove('open'));
        document.querySelectorAll('.level-header .fa-chevron-down, .level-header .fa-chevron-up').forEach(el => {
          if (el.classList.contains('fa-chevron-up')) {
            el.classList.remove('fa-chevron-up');
            el.classList.add('fa-chevron-down');
          }
        });
      };

      // Load data (spinner will be hidden inside loadData)
      loadData().catch(err => {
        console.error('Init error:', err);
        showToast('Initialisation error: ' + err.message, 'error');
        if (loader) loader.style.display = 'none';
      });
    } catch (err) {
      console.error('Fatal init error:', err);
      if (loader) loader.style.display = 'none';
      showToast('Fatal error: ' + err.message, 'error');
    }
    window.updateUserFooter();
  });
})();
