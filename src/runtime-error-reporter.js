// Install a non-blocking global error banner before the application module loads.
(function installRuntimeErrorReporter() {
    let shownErrors = 0;

    function showFatalError(message) {
        if (shownErrors >= 3) return;
        shownErrors += 1;
        let banner = document.getElementById('runtime-error-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'runtime-error-banner';
            banner.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);'
                + 'z-index:99999;max-width:min(92vw,640px);padding:10px 14px;border-radius:10px;'
                + 'background:rgba(185,28,28,0.96);color:#fff;font:12px/1.5 system-ui,sans-serif;'
                + 'box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;gap:12px;align-items:flex-start;';
            const text = document.createElement('div');
            text.className = 'runtime-error-banner__text';
            text.style.cssText = 'word-break:break-word;white-space:pre-wrap;';
            const close = document.createElement('button');
            close.textContent = '×';
            close.style.cssText = 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0;line-height:1;';
            close.onclick = () => banner.remove();
            banner.appendChild(text);
            banner.appendChild(close);
            document.body.appendChild(banner);
        }
        const textElement = banner.querySelector('.runtime-error-banner__text');
        if (textElement) textElement.textContent = message;
    }

    window.onerror = (message, url, line, column, error) => {
        console.error('Global Error:', error || message);
        showFatalError(`Error: ${message}\n${url || ''}:${line || ''}`);
        return false;
    };
    window.addEventListener('error', (event) => {
        if (event.target?.tagName === 'SCRIPT') {
            console.error('Script loading error:', event.target.src);
            showFatalError(`Script failed to load: ${event.target.src}`);
        }
    }, true);
}());
