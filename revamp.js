document.addEventListener('DOMContentLoaded', () => {
    const revampBtn = document.getElementById('revampBtn');
    const overlay = document.getElementById('revampOverlay');
    const body = document.body;
    const revampText = document.querySelector('.revamp-text');

    // Check localStorage
    if (localStorage.getItem('theme') === 'neo') {
        body.classList.add('neo-mode');
        revampText.innerText = "SYSTEM REBOOT...";
    }

    revampBtn.addEventListener('click', () => {
        // 1. Activate Overlay
        overlay.classList.add('active');

        // 2. Decide next state
        const isNeo = body.classList.contains('neo-mode');
        revampText.innerText = isNeo ? "RESTORING ARCHITECTURE..." : "INITIALIZING NEO-PROTOCOL...";

        // 3. Wait for animation effect
        setTimeout(() => {
            if (isNeo) {
                body.classList.remove('neo-mode');
                localStorage.setItem('theme', 'default');
            } else {
                body.classList.add('neo-mode');
                localStorage.setItem('theme', 'neo');

                // Play a sound effect if you want? (Optional)
            }
        }, 1000); // Change theme halfway through animation

        // 4. Remove Overlay
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 2000);
    });

    // FAQ Accordion
    const faqFolders = document.querySelectorAll('.faq-folder');
    faqFolders.forEach(folder => {
        folder.addEventListener('click', () => {
            folder.classList.toggle('open');
            // Close others? Optional
            faqFolders.forEach(other => {
                if (other !== folder) other.classList.remove('open');
            });
        });
    });
});
