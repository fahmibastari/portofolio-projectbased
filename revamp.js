document.addEventListener('DOMContentLoaded', () => {
    const revampBtn = document.getElementById('revampBtn');
    const revampMenu = document.getElementById('revampMenu');
    const overlay = document.getElementById('revampOverlay');
    const body = document.body;
    const revampText = document.querySelector('.revamp-text');
    const themeBtns = document.querySelectorAll('.theme-btn');

    // 1. Check Initial State
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'neo') body.classList.add('neo-mode');
    if (savedTheme === 'hitech') body.classList.add('high-tech-mode');

    // 2. Toggle Menu
    revampBtn.addEventListener('click', () => {
        revampMenu.classList.toggle('open');
    });

    // 3. Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!revampBtn.contains(e.target) && !revampMenu.contains(e.target)) {
            revampMenu.classList.remove('open');
        }
    });

    // 4. Handle Theme Switch
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTheme = btn.getAttribute('data-theme');

            // Close menu
            revampMenu.classList.remove('open');

            // Start Overlay Animation
            overlay.classList.add('active');

            // Set text based on target
            if (targetTheme === 'hitech') {
                revampText.innerText = "ESTABLISHING UPLINK...";
                revampText.style.color = "#00F0FF";
                revampText.style.fontFamily = "monospace";
            } else if (targetTheme === 'neo') {
                revampText.innerText = "LOADING BRUTALISM...";
                revampText.style.color = "#FEF001";
                revampText.style.fontFamily = "Manrope";
            } else {
                revampText.innerText = "RESTORING DEFAULT...";
                revampText.style.color = "#fff";
                revampText.style.fontFamily = "Manrope";
            }

            setTimeout(() => {
                // Remove all theme classes first
                body.classList.remove('neo-mode', 'high-tech-mode');

                // Add specific class
                if (targetTheme === 'neo') body.classList.add('neo-mode');
                if (targetTheme === 'hitech') body.classList.add('high-tech-mode');

                // Save to local storage
                localStorage.setItem('theme', targetTheme);
            }, 1000);

            setTimeout(() => {
                overlay.classList.remove('active');
            }, 2000);
        });
    });

    // FAQ Accordion
    const faqFolders = document.querySelectorAll('.faq-folder');
    faqFolders.forEach(folder => {
        folder.addEventListener('click', () => {
            folder.classList.toggle('open');
            faqFolders.forEach(other => {
                if (other !== folder) other.classList.remove('open');
            });
        });
    });
});
