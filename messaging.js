// messaging.js – FINAL WORKING VERSION (with working delete)
(function() {
    let currentMessages = [];
    let modal = null;

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

    async function saveMessages(messages) {
        const user = getUser();
        if (!user) throw new Error('Not logged in');
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        
        const encrypted = await encryptMessages(messages);
        const content = btoa(JSON.stringify(encrypted));
        
        let sha = null;
        try {
            const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                headers: { Authorization: `token ${user.pat}` }
            });
            if (getResp.ok) {
                const data = await getResp.json();
                sha = data.sha;
            }
        } catch(e) {}
        
        const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                Authorization: `token ${user.pat}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update messages',
                content: content,
                branch: branch,
                sha: sha
            })
        });
        
        if (!putResp.ok) {
            const error = await putResp.json();
            throw new Error(`Failed to save: ${error.message}`);
        }
        
        currentMessages = messages;
        console.log('✅ Messages saved to GitHub');
    }

    async function loadMessages() {
        const user = getUser();
        if (!user) return [];
        const { owner, repo, branch } = window.REPO_CONFIG;
        const path = getUserDataPath(user.username, 'messages.enc');
        try {
            const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
                headers: { Authorization: `token ${user.pat}` }
            });
            if (resp.ok) {
                const file = await resp.json();
                const encrypted = JSON.parse(atob(file.content));
                currentMessages = await decryptMessages(encrypted);
                console.log(`✅ Loaded ${currentMessages.length} messages`);
            } else if (resp.status === 404) {
                currentMessages = [];
                console.log('No messages file yet');
            } else {
                throw new Error(`HTTP ${resp.status}`);
            }
        } catch(e) {
            console.error('Load error:', e);
            currentMessages = [];
        }
        return currentMessages;
    }

    function getUnreadCount() {
        return currentMessages.filter(m => !m.read).length;
    }

    function updateBadge() {
        const badge = document.getElementById('msgBadge');
        if (badge) {
            const count = getUnreadCount();
            badge.textContent = count;
            badge.style.display = count ? 'inline-block' : 'none';
        }
    }

    function formatDate(isoString) {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m);
    }

    async function markAsRead(id) {
        const msg = currentMessages.find(m => m.id == id);
        if (msg && !msg.read) {
            msg.read = true;
            await saveMessages(currentMessages);
            updateBadge();
            if (modal && modal.style.display !== 'none') renderModalContent();
        }
    }

    async function deleteMessage(id) {
        if (!confirm('Delete this message?')) return;
        
        const originalLength = currentMessages.length;
        currentMessages = currentMessages.filter(m => m.id != id);
        
        if (currentMessages.length === originalLength) {
            console.log('Message not found');
            return;
        }
        
        try {
            await saveMessages(currentMessages);
            console.log(`✅ Message ${id} deleted, ${currentMessages.length} remaining`);
            updateBadge();
            if (modal && modal.style.display !== 'none') {
                renderModalContent();
            } else {
                // If modal not open, just close it
                if (modal) $(modal).modal('hide');
            }
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Failed to delete message: ' + err.message);
            // Reload to restore state
            await loadMessages();
            if (modal && modal.style.display !== 'none') renderModalContent();
        }
    }

    async function markAllAsRead() {
        let changed = false;
        for (let m of currentMessages) {
            if (!m.read) {
                m.read = true;
                changed = true;
            }
        }
        if (changed) {
            await saveMessages(currentMessages);
            updateBadge();
            if (modal && modal.style.display !== 'none') renderModalContent();
        }
    }

    function renderModalContent() {
        const container = document.getElementById('msgListContainer');
        if (!container) {
            console.error('msgListContainer not found');
            return;
        }
        
        if (!currentMessages.length) {
            container.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-envelope-o"></i> No messages</div>';
            return;
        }
        
        const sorted = [...currentMessages].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        let html = `<div class="p-2 border-bottom"><button class="btn btn-sm btn-outline-secondary" id="markAllReadBtn"><i class="fa fa-check-circle"></i> Mark all as read</button></div>`;
        
        sorted.forEach(msg => {
            const isUnread = !msg.read;
            html += `
                <div class="list-group-item list-group-item-action ${isUnread ? 'list-group-item-primary' : ''}" data-id="${msg.id}" style="cursor:pointer;">
                    <div class="d-flex justify-content-between">
                        <div style="flex:1;">
                            <strong>${escapeHtml(msg.subject)}</strong>
                            <div class="small text-muted">From ${escapeHtml(msg.from)} · ${formatDate(msg.timestamp)}</div>
                            <div class="msg-preview-${msg.id}">${escapeHtml(msg.body.substring(0, 100))}${msg.body.length > 100 ? '…' : ''}</div>
                            <div class="msg-body-${msg.id}" style="display:none;">${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div>
                        </div>
                        <div style="margin-left: 10px;">
                            ${!msg.read ? `<button class="btn btn-sm btn-outline-primary mark-read" data-id="${msg.id}" style="margin-right:5px;">✓</button>` : ''}
                            <button class="btn btn-sm btn-outline-danger delete-msg" data-id="${msg.id}">🗑</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;

        // Attach event listeners
        container.querySelectorAll('.mark-read').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await markAsRead(btn.dataset.id);
            });
        });
        
        container.querySelectorAll('.delete-msg').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteMessage(btn.dataset.id);
            });
        });
        
        container.querySelectorAll('.list-group-item-action').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.mark-read') || e.target.closest('.delete-msg')) return;
                const id = el.dataset.id;
                const preview = el.querySelector(`.msg-preview-${id}`);
                const body = el.querySelector(`.msg-body-${id}`);
                if (preview.style.display !== 'none') {
                    preview.style.display = 'none';
                    body.style.display = 'block';
                    const msg = currentMessages.find(m => m.id == id);
                    if (msg && !msg.read) markAsRead(id);
                } else {
                    preview.style.display = 'block';
                    body.style.display = 'none';
                }
            });
        });
        
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', markAllAsRead);
        }
        
        console.log(`✅ Rendered ${sorted.length} messages`);
    }

    async function openInbox() {
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'inboxModal';
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5><i class="fa fa-inbox"></i> My Inbox</h5>
                            <button type="button" class="close" data-dismiss="modal">&times;</button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="list-group list-group-flush" id="msgListContainer" style="max-height:60vh; overflow-y:auto;"></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" id="refreshInboxBtn"><i class="fa fa-refresh"></i> Refresh</button>
                            <button class="btn btn-primary" data-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            const refreshBtn = document.getElementById('refreshInboxBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    await loadMessages();
                    renderModalContent();
                    updateBadge();
                });
            }
        }
        
        await loadMessages();
        renderModalContent();
        updateBadge();
        $(modal).modal('show');
    }

    function addNotificationIcon() {
        const user = getUser();
        if (!user || document.getElementById('msgNotificationIcon')) return;
        
        const navUl = document.querySelector('.navbar-nav.ml-auto');
        if (!navUl) return;
        
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.id = 'msgNotificationIcon';
        li.innerHTML = `
            <a class="nav-link" href="#" id="msgBellBtn" style="position:relative;">
                <i class="fa fa-bell-o"></i>
                <span id="msgBadge" class="badge badge-danger" style="position:absolute;top:-5px;right:-10px;display:none;border-radius:50%;padding:2px 5px;font-size:10px;"></span>
            </a>
        `;
        navUl.appendChild(li);
        
        document.getElementById('msgBellBtn').addEventListener('click', (e) => {
            e.preventDefault();
            openInbox();
        });
        
        loadMessages().then(() => updateBadge());
    }

    // Auto-refresh messages every 30 seconds
    let refreshInterval = null;
    
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(async () => {
            const user = getUser();
            if (user && document.visibilityState === 'visible') {
                await loadMessages();
                updateBadge();
                // If modal is open, refresh content
                if (modal && modal.style.display !== 'none') {
                    renderModalContent();
                }
            }
        }, 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addNotificationIcon();
            startAutoRefresh();
        });
    } else {
        addNotificationIcon();
        startAutoRefresh();
    }
})();
