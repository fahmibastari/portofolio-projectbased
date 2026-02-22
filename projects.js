/**
 * projects.js — Central data source for all portfolio projects.
 * workspace.html reads from this file via ?id=<key>
 *
 * Each project entry:
 *   id        : URL param key
 *   name      : Display name
 *   category  : Short category label
 *   desc      : Full description
 *   role      : Developer role
 *   timeline  : Project duration
 *   type      : Work type (Client / Personal / etc.)
 *   thumb     : Cover image (relative path)
 *   tech      : [{ name, color }]  tech stack chips
 *   images    : [{ file, label }]  ALL images in the project folder
 */

const PROJECTS = {

    flamboys: {
        id: 'flamboys',
        name: 'Flamboys Roaster Ecosystem',
        category: 'Fullstack IoT · Mobile',
        desc: 'End-to-end digital transformation for coffee production, bridging precision roasting logs with real-time inventory intelligence across web and mobile platforms.',
        role: 'Lead Developer', timeline: '3 months', type: 'Client Work',
        thumb: 'image/flamboys/Mobile - HomeMenu.png',
        tech: [
            { name: 'React Native', color: '#61dafb' },
            { name: 'Supabase', color: '#3ecf8e' },
            { name: 'Laravel', color: '#f55247' },
            { name: 'Vue.js', color: '#4fc08d' },
            { name: 'PostgreSQL', color: '#336791' },
            { name: 'Firebase', color: '#f89820' },
            { name: 'REST API', color: '#ff6c37' },
            { name: 'Redux', color: '#764abc' },
        ],
        images: [
            { file: 'image/flamboys/Mobile - HomeMenu.png', label: 'Mobile · Home Menu' },
            { file: 'image/flamboys/Mobile - RoastingSession.png', label: 'Mobile · Roasting Session' },
            { file: 'image/flamboys/Admin - DashboardAnalytics.png', label: 'Admin · Dashboard Analytics' },
            { file: 'image/flamboys/Admin - InventoryList.png', label: 'Admin · Inventory List' },
            { file: 'image/flamboys/Admin - LogRORDetails.png', label: 'Admin · Log ROR Details' },
            { file: 'image/flamboys/Admin - RoasterManagement.png', label: 'Admin · Roaster Management' },
        ],
    },

    ubmstorage: {
        id: 'ubmstorage',
        name: 'UBM Storage 3D',
        category: 'Immersive WebGL',
        desc: 'A fully interactive 3D virtual store simulating a retro handheld console experience directly in the browser using React Three Fiber and custom GLSL shaders.',
        role: 'Frontend Developer', timeline: '1.5 months', type: 'Client Work',
        thumb: 'image/ubmstorage/LP - 3D PSP.png',
        tech: [
            { name: 'React', color: '#61dafb' },
            { name: 'Three.js', color: '#000000' },
            { name: 'React Three Fiber', color: '#ff6c37' },
            { name: 'GLSL', color: '#5568ff' },
            { name: 'Vite', color: '#a855f7' },
            { name: 'Zustand', color: '#ffb700' },
        ],
        images: [
            { file: 'image/ubmstorage/LP - 3D PSP.png', label: 'Landing · 3D PSP View' },
            { file: 'image/ubmstorage/PSP - Boot Logo UBM.png', label: 'PSP · Boot Logo' },
            { file: 'image/ubmstorage/PSP - Catalog with Music Player.png', label: 'PSP · Catalog + Music' },
            { file: 'image/ubmstorage/PSP - Menu Custom UI.png', label: 'PSP · Custom Menu UI' },
            { file: 'image/ubmstorage/PSP - Music Player.png', label: 'PSP · Music Player' },
            { file: 'image/ubmstorage/PSP - Product Catalog.png', label: 'PSP · Product Catalog' },
        ],
    },

    digivass: {
        id: 'digivass',
        name: 'DIGIVASS Field Ops',
        category: 'Featured Ecosystem · Mobile',
        desc: 'An integrated command center solving the disconnect between office management and field surveyors with offline-first mobile architecture and real-time sync.',
        role: 'Fullstack Developer', timeline: '4 months', type: 'Client Work',
        thumb: 'image/digivass/MobileMockup.png',
        tech: [
            { name: 'React Native', color: '#61dafb' },
            { name: 'NestJS', color: '#e0234e' },
            { name: 'PostgreSQL', color: '#336791' },
            { name: 'Supabase', color: '#3ecf8e' },
            { name: 'REST API', color: '#ff6c37' },
            { name: 'Expo', color: '#000000' },
        ],
        images: [
            { file: 'image/digivass/MobileMockup.png', label: 'Mobile · Mockup Overview' },
            { file: 'image/digivass/AdminLogin.png', label: 'Admin · Login' },
            { file: 'image/digivass/AdminDashboard.png', label: 'Admin · Dashboard' },
            { file: 'image/digivass/AdminCreateSurvey.png', label: 'Admin · Create Survey' },
            { file: 'image/digivass/AdminManageSurvey.png', label: 'Admin · Manage Survey' },
            { file: 'image/digivass/AdminManageTeam.png', label: 'Admin · Manage Team' },
            { file: 'image/digivass/AdminSurveyDetail.png', label: 'Admin · Survey Detail' },
            { file: 'image/digivass/AdminValidation.png', label: 'Admin · Validation' },
        ],
    },

    justspeak: {
        id: 'justspeak',
        name: 'JustSpeak IELTS',
        category: 'EdTech Platform',
        desc: 'Synchronized classroom experience using Laravel & Inertia.js. Replaces heavy websockets with optimized REST strategies for a real-time practice environment.',
        role: 'Backend Developer', timeline: '2 months', type: 'Client Work',
        thumb: 'image/justspeak/Dashboard.png',
        tech: [
            { name: 'Laravel', color: '#f55247' },
            { name: 'Inertia.js', color: '#9553e9' },
            { name: 'Vue.js', color: '#4fc08d' },
            { name: 'MySQL', color: '#4479a1' },
            { name: 'REST API', color: '#ff6c37' },
            { name: 'Tailwind', color: '#38bdf8' },
        ],
        images: [
            { file: 'image/justspeak/Dashboard.png', label: 'Student · Dashboard' },
            { file: 'image/justspeak/About.png', label: 'Landing · About' },
            { file: 'image/justspeak/Contact.png', label: 'Landing · Contact' },
            { file: 'image/justspeak/Quiz.png', label: 'Student · Quiz' },
            { file: 'image/justspeak/Resources.png', label: 'Student · Resources' },
            { file: 'image/justspeak/Admin - Dashboard.png', label: 'Admin · Dashboard' },
            { file: 'image/justspeak/Admin - Analytics.png', label: 'Admin · Analytics' },
            { file: 'image/justspeak/Admin - Assessment.png', label: 'Admin · Assessment' },
        ],
    },

    mental: {
        id: 'mental',
        name: 'Mental Healing ID',
        category: 'HealthTech',
        desc: 'High-performance executive dashboard translating complex patient data into intuitive visual insights. Built with Next.js and optimized for data-heavy views.',
        role: 'Frontend Developer', timeline: '1 month', type: 'Client Work',
        thumb: 'image/mentalhealing/Dashboard.png',
        tech: [
            { name: 'Next.js', color: '#000000' },
            { name: 'TypeScript', color: '#3178c6' },
            { name: 'Supabase', color: '#3ecf8e' },
            { name: 'Tailwind', color: '#38bdf8' },
            { name: 'Chart.js', color: '#ff6384' },
        ],
        images: [
            { file: 'image/mentalhealing/Dashboard.png', label: 'Dashboard · Overview' },
            { file: 'image/mentalhealing/Layanan.png', label: 'Layanan · Services' },
            { file: 'image/mentalhealing/ListPsikolog.png', label: 'Psikolog · Directory' },
        ],
    },

    '2watuju': {
        id: '2watuju',
        name: '2Watuju Architecture',
        category: 'VR / SEO',
        desc: 'Lightning-fast Svelte app focused on technical SEO and immersive 360° VR visualizations (Panolens.js) for an architecture firm\'s portfolio showcase.',
        role: 'Frontend Developer', timeline: '3 weeks', type: 'Client Work',
        thumb: 'image/2watuju/DashboardCatalog.png',
        tech: [
            { name: 'Svelte', color: '#ff3e00' },
            { name: 'Panolens.js', color: '#4a9ca6' },
            { name: 'Three.js', color: '#000000' },
            { name: 'Vite', color: '#a855f7' },
            { name: 'SEO', color: '#22c55e' },
        ],
        images: [
            { file: 'image/2watuju/DashboardCatalog.png', label: 'Dashboard · Catalog' },
            { file: 'image/2watuju/About.png', label: 'Page · About' },
            { file: 'image/2watuju/ProjectDetail.png', label: 'Page · Project Detail' },
            { file: 'image/2watuju/ProjectReview.png', label: 'Page · Project Review' },
        ],
    },

    perpahmian: {
        id: 'perpahmian',
        name: 'PERPAHMIAN Game Station',
        category: 'Gaming Platform',
        desc: 'A futuristic collection of 10 playable browser games built with pure Vanilla JS, featuring glassmorphism UI and procedural music generation via Tone.js.',
        role: 'Solo Developer', timeline: '2 months', type: 'Personal Project',
        thumb: 'image/perpahmian-gamestation/Dashboard.png',
        tech: [
            { name: 'Vanilla JS', color: '#f7df1e' },
            { name: 'Tone.js', color: '#ff6c37' },
            { name: 'Canvas API', color: '#22c55e' },
            { name: 'Web Audio', color: '#a855f7' },
            { name: 'CSS3', color: '#264de4' },
        ],
        images: [
            { file: 'image/perpahmian-gamestation/Dashboard.png', label: 'Dashboard · Home' },
            { file: 'image/perpahmian-gamestation/DashboardListGame.png', label: 'Dashboard · Game List' },
            { file: 'image/perpahmian-gamestation/Game1.png', label: 'Game 1' },
            { file: 'image/perpahmian-gamestation/Game2.png', label: 'Game 2' },
            { file: 'image/perpahmian-gamestation/Game3.png', label: 'Game 3' },
            { file: 'image/perpahmian-gamestation/Game4.png', label: 'Game 4' },
            { file: 'image/perpahmian-gamestation/Game5.png', label: 'Game 5' },
            { file: 'image/perpahmian-gamestation/Game6.png', label: 'Game 6' },
        ],
    },

    navaraprofile: {
        id: 'navaraprofile',
        name: 'Navara City Park Profile',
        category: 'Dynamic CMS',
        desc: 'A fully dynamic corporate identity platform where every section is editable via a custom admin panel. Built on Supabase with real-time preview.',
        role: 'Fullstack Developer', timeline: '6 weeks', type: 'Client Work',
        thumb: 'image/navaraprofile/1.png',
        tech: [
            { name: 'Next.js', color: '#000000' },
            { name: 'Supabase', color: '#3ecf8e' },
            { name: 'Tailwind', color: '#38bdf8' },
            { name: 'TypeScript', color: '#3178c6' },
        ],
        images: [
            { file: 'image/navaraprofile/1.png', label: 'Page 1' },
            { file: 'image/navaraprofile/2.png', label: 'Page 2' },
            { file: 'image/navaraprofile/3.png', label: 'Page 3' },
            { file: 'image/navaraprofile/4.png', label: 'Page 4' },
            { file: 'image/navaraprofile/5.png', label: 'Page 5' },
            { file: 'image/navaraprofile/6.png', label: 'Page 6' },
        ],
    },

    navaraopening: {
        id: 'navaraopening',
        name: 'Opening Ceremony Inv.',
        category: 'Event System',
        desc: 'Smart digital invitation system with Google Sheets API integration to auto-generate personalized guest links and track RSVPs in real-time.',
        role: 'Fullstack Developer', timeline: '2 weeks', type: 'Client Work',
        thumb: 'image/navaraopening/1.png',
        tech: [
            { name: 'Google Sheets API', color: '#0f9d58' },
            { name: 'Laravel', color: '#f55247' },
            { name: 'QR Code', color: '#333' },
            { name: 'MySQL', color: '#4479a1' },
        ],
        images: [
            { file: 'image/navaraopening/1.png', label: 'Page 1' },
            { file: 'image/navaraopening/2.png', label: 'Page 2' },
            { file: 'image/navaraopening/3.png', label: 'Page 3' },
            { file: 'image/navaraopening/4.png', label: 'Page 4' },
            { file: 'image/navaraopening/5.png', label: 'Page 5' },
            { file: 'image/navaraopening/6.png', label: 'Page 6' },
        ],
    },

    examlent: {
        id: 'examlent',
        name: 'Examlent',
        category: 'SaaS Product',
        desc: 'Full-featured exam simulator with token entry, auto-grading, and CSV reporting built on Supabase. Supports multiple question types including reading passages.',
        role: 'Fullstack Developer', timeline: '2 months', type: 'Personal Project',
        thumb: 'image/examlent/StudentLandingPage.png',
        tech: [
            { name: 'Next.js', color: '#000000' },
            { name: 'Supabase', color: '#3ecf8e' },
            { name: 'TypeScript', color: '#3178c6' },
            { name: 'Tailwind', color: '#38bdf8' },
            { name: 'CSV Export', color: '#22c55e' },
        ],
        images: [
            { file: 'image/examlent/StudentLandingPage.png', label: 'Student · Landing Page' },
            { file: 'image/examlent/StudentJoinPortal.png', label: 'Student · Join Portal' },
            { file: 'image/examlent/StudentJoinExam.png', label: 'Student · Join Exam' },
            { file: 'image/examlent/StudentJoinExam2.png', label: 'Student · Exam View' },
            { file: 'image/examlent/AdminLogin.png', label: 'Admin · Login' },
            { file: 'image/examlent/AdminPackageList.png', label: 'Admin · Package List' },
            { file: 'image/examlent/AdminManagePackage.png', label: 'Admin · Manage Package' },
            { file: 'image/examlent/AdminManageQuestion - QuestionList.png', label: 'Admin · Question List' },
            { file: 'image/examlent/AdminManageQuestion - Question Type.png', label: 'Admin · Question Types' },
            { file: 'image/examlent/AdminManageQuestion - Reading Passage.png', label: 'Admin · Reading Passage' },
            { file: 'image/examlent/AdminReviewStudentAttempt.png', label: 'Admin · Review Attempt' },
            { file: 'image/examlent/AdminExamResult.png', label: 'Admin · Exam Results' },
        ],
    },

    cced: {
        id: 'cced',
        name: 'CCED Hiring Portal',
        category: 'Public Sector',
        desc: 'University job marketplace connecting students with companies using role-based access control. Built for Ciputra University\'s career development center.',
        role: 'Fullstack Developer', timeline: '3 months', type: 'Client Work',
        thumb: 'image/cced/LandingPage.png',
        tech: [
            { name: 'Laravel', color: '#f55247' },
            { name: 'Vue.js', color: '#4fc08d' },
            { name: 'MySQL', color: '#4479a1' },
            { name: 'Tailwind', color: '#38bdf8' },
            { name: 'RBAC', color: '#a855f7' },
        ],
        images: [
            { file: 'image/cced/LandingPage.png', label: 'Landing · Home' },
            { file: 'image/cced/LoginPage.png', label: 'Auth · Login' },
            { file: 'image/cced/RegisterPage.png', label: 'Auth · Register' },
            { file: 'image/cced/JobSeekerDashboard.png', label: 'Seeker · Dashboard' },
            { file: 'image/cced/JobSeekerProfile.png', label: 'Seeker · Profile' },
            { file: 'image/cced/CompanyDashboard.png', label: 'Company · Dashboard' },
            { file: 'image/cced/CompanyDetailJob.png', label: 'Company · Job Detail' },
            { file: 'image/cced/CompanyProfile.png', label: 'Company · Profile' },
            { file: 'image/cced/AdminDashboard.png', label: 'Admin · Dashboard' },
            { file: 'image/cced/AdminAddJob.png', label: 'Admin · Add Job' },
        ],
    },

    freelance: {
        id: 'freelance',
        name: 'Freelancer Tracker',
        category: 'Utility Tool',
        desc: 'Multi-currency fee tracker and session manager handling complex timezone conversions and client billing. Built for personal use as a freelance productivity tool.',
        role: 'Solo Developer', timeline: '2 weeks', type: 'Personal Project',
        thumb: 'image/freelance/1.png',
        tech: [
            { name: 'Vanilla JS', color: '#f7df1e' },
            { name: 'IndexedDB', color: '#22c55e' },
            { name: 'LocalStorage', color: '#4479a1' },
            { name: 'CSS3', color: '#264de4' },
        ],
        images: [
            { file: 'image/freelance/1.png', label: 'Screen 1' },
            { file: 'image/freelance/2.png', label: 'Screen 2' },
            { file: 'image/freelance/3.png', label: 'Screen 3' },
            { file: 'image/freelance/4.png', label: 'Screen 4' },
            { file: 'image/freelance/5.png', label: 'Screen 5' },
            { file: 'image/freelance/6.png', label: 'Screen 6' },
        ],
    },

    wakaf: {
        id: 'wakaf',
        name: 'Wakaf Digital',
        category: 'Civic Tech',
        desc: 'Digital waqf platform enabling transparent donation tracking and project management for Islamic social finance. Built with full audit trail and reporting.',
        role: 'Fullstack Developer', timeline: '2 months', type: 'Client Work',
        thumb: 'image/wakaf/1.png',
        tech: [
            { name: 'Laravel', color: '#f55247' },
            { name: 'MySQL', color: '#4479a1' },
            { name: 'Tailwind', color: '#38bdf8' },
            { name: 'Alpine.js', color: '#77c1d2' },
        ],
        images: [
            { file: 'image/wakaf/1.png', label: 'Screen 1' },
            { file: 'image/wakaf/2.png', label: 'Screen 2' },
            { file: 'image/wakaf/3.png', label: 'Screen 3' },
        ],
    },

};

// Helper to get project by URL param
function getProjectFromURL() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    return PROJECTS[id] || null;
}
