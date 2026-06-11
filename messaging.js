// messaging.js – Ultimate fix with forced rendering
(function() {
    let currentMessages = [];
    let modalElement = null;
    let refreshInterval = null;
    let inboxRefreshInterval = null;

    function getUser() {
        return window.SessionManager?.getCurrentUser();
    }

    function getUserDataPath(username, filename) {
        const { dataPath } = window.REPO_CONFIG;
        const encUser = encodeURIComponent(username);
        return `${dataPath}/users/${encUser}/${filename}`;
    }

    async function getEncryptionKey() {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(window.APP_CONFIG.dogsname),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode('messages-salt'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptMessages(messages) {
        const key = await getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(messages));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    }

    async function decryptMessages(encryptedObj) {
        const key = await getEncryptionKey();
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    async function fetchWithRetry(fn, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try { return await fn(); } catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, delay * (i + 1)));
            }
        }
    }

    async function loadMessages() {
        const user = getUser();
        if (!user) return [];
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        try {
            const file = await fetchWithRetry(() =>
                GitHubAPI.getFileContent(owner, repo, path, branch, user.pat)
            );
            if (file && file.content) {
                const encrypted = JSON.parse(file.content);
                currentMessages = await decryptMessages(encrypted);
                console.log('Loaded messages:', currentMessages);
                return currentMessages;
            }
        } catch(e) { console.error("Load error:", e); }
        currentMessages = [];
        return [];
    }

    async function saveMessages(messages) {
        const user = getUser();
        if (!user) throw new Error("Not logged in");
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        const encrypted = await encryptMessages(messages);
        await fetchWithRetry(async () => {
            let sha = null;
            try {
                const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
                if (existing && existing.sha) sha = existing.sha;
            } catch(e) {}
            await GitHubAPI.updateFile(owner, repo, path, encrypted, "Update messages", branch, user.pat, sha);
        });
        currentMessages = messages;
    }

    async function markAsRead(messageId) {
        const msg = currentMessages.find(m => m.id === messageId);
        if (msg && !msg.read) {
            msg.read = true;
            await saveMessages(currentMessages);
            updateBadge();
            renderInbox();
        }
    }

    async function markAllAsRead() {
        let changed = false;
        for (let msg of currentMessages) if (!msg.read) { msg.read = true; changed = true; }
        if (changed) {
            await saveMessages(currentMessages);
            updateBadge();
            renderInbox();
        }
    }

    async function deleteMessage(messageId) {
        if (confirm("Delete this message?")) {
            currentMessages = currentMessages.filter(m => m.id !== messageId);
            await saveMessages(currentMessages);
            updateBadge();
            renderInbox();
        }
    }

    function getUnreadCount() {
        return currentMessages.filter(m => !m.read).length;
    }

    function updateBadge() {
        const badge = document.getElementById('msgBadge');
        if (!badge) return;
        const count = getUnreadCount();
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    function formatDate(isoString) {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    }

    function renderInbox() {
        const container = document.getElementById('msgListContainer');
        if (!container) {
            console.error("msgListContainer not found");
            return;
        }
        
        if (!currentMessages.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-envelope-o"></i> No messages</div>';
            return;
        }
        
        const sorted = [...currentMessages].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        let html = '';
        
        // Mark all read button
        html += `<div class="p-2 border-bottom"><button class="btn btn-sm btn-outline-secondary" id="markAllReadBtn"><i class="fa fa-check-circle"></i> Mark all as read</button></div>`;
        
        sorted.forEach(msg => {
            const isUnread = !msg.read;
            const msgId = msg.id;
            html += `
                <div class="list-group-item list-group-item-action ${isUnread ? 'list-group-item-primary' : ''}" style="cursor:pointer;" data-msg-id="${msgId}">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <strong>${window.escapeHtml(msg.subject)}</strong>
                            <div class="text-muted small">From: ${window.escapeHtml(msg.from)} · ${formatDate(msg.timestamp)}</div>
                            <div class="mt-1 msg-body-${msgId}" style="display:none;">${window.escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
                            <div class="mt-1 msg-preview-${msgId}">${window.escapeHtml(msg.body.substring(0, 100))}${msg.body.length > 100 ? '…' : ''}</div>
                        </div>
                        <div>
                            ${!msg.read ? `<button class="btn btn-sm btn-outline-primary mark-read-btn" data-id="${msgId}" title="Mark as read"><i class="fa fa-check"></i></button>` : ''}
                            <button class="btn btn-sm btn-outline-danger delete-msg-btn" data-id="${msgId}" title="Delete"><i class="fa fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Attach event listeners
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                await markAsRead(id);
            });
        });
        document.querySelectorAll('.delete-msg-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                await deleteMessage(id);
            });
        });
        document.querySelectorAll('.list-group-item-action').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mark-read-btn') || e.target.closest('.delete-msg-btn')) return;
                const msgId = item.dataset.msgId;
                const previewDiv = item.querySelector(`.msg-preview-${msgId}`);
                const bodyDiv = item.querySelector(`.msg-body-${msgId}`);
                if (previewDiv.style.display !== 'none') {
                    previewDiv.style.display = 'none';
                    bodyDiv.style.display = 'block';
                    const msg = currentMessages.find(m => m.id == msgId);
                    if (msg && !msg.read) markAsRead(msgId);
                } else {
                    previewDiv.style.display = 'block';
                    bodyDiv.style.display = 'none';
                }
            });
        });
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) markAllBtn.addEventListener('click', markAllAsRead);
        
        console.log(`Rendered ${sorted.length} messages`);
    }

    async function openInbox() {
        if (!modalElement) {
            modalElement = document.createElement('div');
            modalElement.className = 'modal fade';
            modalElement.id = 'inboxModal';
            modalElement.tabIndex = -1;
            modalElement.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5><i class="fa fa-inbox"></i> My Inbox</h5>
                            <button type="button" class="close" data-dismiss="modal">&times;</button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="list-group list-group-flush" id="msgListContainer" style="max-height: 60vh; overflow-y: auto;"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="refreshInboxBtn"><i class="fa fa-refresh"></i> Refresh</button>
                            <button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalElement);
            
            modalElement.addEventListener('shown.bs.modal', async () => {
                await loadMessages();
                renderInbox();
                updateBadge();
                if (inboxRefreshInterval) clearInterval(inboxRefreshInterval);
                inboxRefreshInterval = setInterval(async () => {
                    await loadMessages();
                    renderInbox();
                    updateBadge();
                }, 30000);
            });
            modalElement.addEventListener('hide.bs.modal', () => {
                if (inboxRefreshInterval) clearInterval(inboxRefreshInterval);
            });
            
            const refreshBtn = document.getElementById('refreshInboxBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    await loadMessages();
                    renderInbox();
                    updateBadge();
                });
            }
        }
        $(modalElement).modal('show');
        // Fallback: if modal doesn't show, try again after 100ms
        setTimeout(() => {
            if (modalElement && !$(modalElement).hasClass('show')) {
                $(modalElement).modal('show');
            }
        }, 100);
    }

    function addNotificationIcon() {
        const user = getUser();
        if (!user) return;
        const navUl = document.querySelector('.navbar-nav.ml-auto');
        if (!navUl) return;
        if (document.getElementById('msgNotificationIcon')) return;
        
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.id = 'msgNotificationIcon';
        li.innerHTML = `
            <a class="nav-link" href="#" id="msgBellBtn" style="position: relative;">
                <i class="fa fa-bell-o"></i>
                <span id="msgBadge" class="badge badge-danger" style="position: absolute; top: -5px; right: -10px; display: none; border-radius: 50%; padding: 2px 5px; font-size: 10px;"></span>
            </a>
        `;
        navUl.appendChild(li);
        document.getElementById('msgBellBtn').addEventListener('click', (e) => {
            e.preventDefault();
            openInbox();
        });
        loadMessages().then(() => updateBadge());
    }

    async function refreshUnread() {
        if (getUser()) {
            await loadMessages();
            updateBadge();
        }
    }

    window.debugInbox = {
        loadMessages,
        currentMessages: () => currentMessages,
        renderInbox,
        openInbox
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addNotificationIcon();
            refreshUnread();
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(refreshUnread, 30000);
            window.addEventListener('focus', refreshUnread);
        });
    } else {
        addNotificationIcon();
        refreshUnread();
        refreshInterval = setInterval(refreshUnread, 30000);
        window.addEventListener('focus', refreshUnread);
    }
})();
