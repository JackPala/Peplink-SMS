let chatHistory = {};
let contactsData = [];
let currentContact = null;
let currentContactPhone = '';
let smsPollingIntervalId = null;
let smsLoadInProgress = false;
let composeModalEl = null;
let composeFormEl = null;
let composePhoneInput = null;
let composeMessageInput = null;
let composeErrorEl = null;
let composeSendBtn = null;
let composeCancelBtn = null;
let composeCloseBtn = null;

// Theme Management
let currentTheme = 'light'; // 'light', 'dark', or 'auto'

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    cacheComposeElements();
    setupEventListeners();
    relocateChatActions();
    loadSmsData()
        .catch(err => console.error('Initial SMS load failed', err))
        .finally(() => {
            smsPollingIntervalId = setInterval(() => {
                loadSmsData({ background: true }).catch(err => {
                    console.error('Background SMS refresh failed', err);
                });
            }, 15000);
        });
});

// Setup event listeners
function setupEventListeners() {
    // Contact selection
    const contactsList = document.getElementById('contactsList');
    if (contactsList) {
        contactsList.addEventListener('click', function(event) {
            const target = event.target.closest('.contact-item');
            if (!target) {
                return;
            }
            
            setActiveContact(target.getAttribute('data-contact'));
        });
    }
    
    // Send message button
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    
    // Enter key to send message
    document.getElementById('messageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', function(e) {
        applySearchFilter(e.target.value || '');
    });
    
    // New message button
    document.getElementById('newMessageBtn').addEventListener('click', function() {
        openComposeModal();
    });
    
    // Info button
    document.getElementById('infoBtn').addEventListener('click', function() {
        if (!currentContact) {
            alert('Select a contact to view details.');
            return;
        }
        alert(`Contact Info:\nName: ${currentContact}\nPhone: ${currentContactPhone || 'Unknown'}`);
    });
    
    if (composeFormEl) {
        composeFormEl.addEventListener('submit', handleComposeSubmit);
    }
    
    if (composeModalEl) {
        const cancelBtn = composeCancelBtn;
        const closeBtn = composeCloseBtn;
        if (cancelBtn) cancelBtn.addEventListener('click', closeComposeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeComposeModal);
        composeModalEl.addEventListener('click', function(event) {
            if (event.target === composeModalEl) {
                closeComposeModal();
            }
        });
    }
    
    // Theme toggle
    setupThemeToggle();
    
    // More menu dropdown
    setupMoreMenu();

    // Mobile sidebar toggle
    setupMobileSidebar();
}

function cacheComposeElements() {
    composeModalEl = document.getElementById('composeModal');
    composeFormEl = document.getElementById('composeForm');
    composePhoneInput = document.getElementById('composePhoneInput');
    composeMessageInput = document.getElementById('composeMessageInput');
    composeErrorEl = document.getElementById('composeError');
    composeSendBtn = document.getElementById('composeSendBtn');
    composeCancelBtn = document.getElementById('composeCancelBtn');
    composeCloseBtn = document.getElementById('composeCloseBtn');
}

async function loadSmsData(options = {}) {
    const { background = false } = options;
    
    if (smsLoadInProgress && background) {
        return;
    }
    smsLoadInProgress = true;
    
    const contactsList = document.getElementById('contactsList');
    const searchInput = document.getElementById('searchInput');
    const previousSearchTerm = searchInput ? searchInput.value : '';
    const previousContact = currentContact;
    
    if (!background && contactsList) {
        contactsList.innerHTML = '<div class="empty-state">Loading SMS...</div>';
    }
    if (!background) {
        renderMessagesPlaceholder('Loading SMS from your router...');
    }
    
    try {
        const response = await fetch(`/api/sms?t=${Date.now()}`);
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }
        
        const payload = await response.json();
        const conversations = payload.conversations || [];
        
        chatHistory = {};
        contactsData = conversations.map(conversation => {
            const contactName = conversation.sender || 'Unknown Sender';
            const normalizedMessages = (conversation.messages || []).map(normalizeMessage);
            chatHistory[contactName] = normalizedMessages;
            const defaultConnId = normalizedMessages.length > 0
                ? normalizedMessages[normalizedMessages.length - 1].connId || null
                : null;
            return {
                name: contactName,
                phone: contactName,
                messages: normalizedMessages,
                defaultConnId
            };
        });
        
        sortContactsByLatest();
        renderContactsList();
        applySearchFilter(previousSearchTerm);
        
        if (contactsData.length === 0) {
            setActiveContact(null);
        } else if (previousContact && contactsData.some(contact => contact.name === previousContact)) {
            setActiveContact(previousContact, { preserveScroll: background });
        } else {
            setActiveContact(contactsData[0].name);
        }
    } catch (error) {
        if (!background) {
            if (contactsList) {
                contactsList.innerHTML = '';
                const errorMessage = document.createElement('div');
                errorMessage.className = 'empty-state';
                errorMessage.textContent = `Unable to load SMS (${error.message})`;
                contactsList.appendChild(errorMessage);
            }
            renderMessagesPlaceholder('Unable to load SMS from the router.', error.message);
            throw error;
        } else {
            console.error('Failed to refresh SMS conversations', error);
        }
    } finally {
        smsLoadInProgress = false;
    }
}

function renderContactsList() {
    const contactsList = document.getElementById('contactsList');
    if (!contactsList) {
        return;
    }
    
    contactsList.innerHTML = '';
    
    if (contactsData.length === 0) {
        contactsList.innerHTML = '<div class="empty-state">No SMS conversations yet.</div>';
        return;
    }
    
    contactsData.forEach(contact => {
        const lastMessage = contact.messages[contact.messages.length - 1];
        const previewText = lastMessage ? truncateText(lastMessage.text) : 'No messages yet';
        const previewTime = lastMessage ? formatPreviewTime(lastMessage) : '';
        
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        if (currentContact === contact.name) {
            contactItem.classList.add('active');
        }
        contactItem.setAttribute('data-contact', contact.name);
        contactItem.setAttribute('data-phone', contact.phone);
        
        const avatar = document.createElement('div');
        avatar.className = 'contact-avatar';
        avatar.innerHTML = '<span class="material-icons">👤</span>';
        
        const infoWrapper = document.createElement('div');
        infoWrapper.className = 'contact-info';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'contact-name';
        nameEl.textContent = contact.name;
        
        const previewEl = document.createElement('div');
        previewEl.className = 'contact-preview';
        previewEl.textContent = previewText;
        
        const timeEl = document.createElement('div');
        timeEl.className = 'contact-time';
        timeEl.textContent = previewTime || '';
        
        infoWrapper.appendChild(nameEl);
        infoWrapper.appendChild(previewEl);
        
        contactItem.appendChild(avatar);
        contactItem.appendChild(infoWrapper);
        contactItem.appendChild(timeEl);
        
        contactsList.appendChild(contactItem);
    });
}

function setActiveContact(contactName, options = {}) {
    const { preserveScroll = false } = options;
    
    if (!contactName) {
        currentContact = null;
        currentContactPhone = '';
        updateCurrentContactHeader('No Contact Selected', '');
        if (contactsData.length === 0) {
            renderMessagesPlaceholder('No SMS messages were found on the router.');
        } else {
            renderMessagesPlaceholder('Select a conversation to view SMS messages.');
        }
        return;
    }
    
    const contact = contactsData.find(item => item.name === contactName);
    if (!contact) {
        currentContact = null;
        currentContactPhone = '';
        updateCurrentContactHeader('No Contact Selected', '');
        renderMessagesPlaceholder('No SMS messages available for the selected contact.');
        return;
    }
    
    currentContact = contact.name;
    currentContactPhone = contact.phone;
    
    updateCurrentContactHeader(contact.name, contact.phone);
    
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-contact') === contact.name);
    });
    
    loadChatHistory(contact.name, { preserveScroll });
    closeSidebarOnMobile();
}

function normalizeMessage(rawMessage = {}) {
    const parsedTimestamp = parseMessageTimestamp(rawMessage.timestamp, rawMessage.date);
    const metadata = buildMessageMetadata(parsedTimestamp);
    
    return {
        id: rawMessage.id || rawMessage.routerMessageId || rawMessage.message_id,
        type: rawMessage.direction === 'sent' ? 'sent' : 'received',
        text: rawMessage.content || '',
        time: metadata.displayTime,
        dateLabel: metadata.dateLabel,
        timestamp: parsedTimestamp
    };
}

function parseMessageTimestamp(timestamp, dateString) {
    if (typeof timestamp === 'number') {
        return timestamp;
    }
    
    if (dateString) {
        const currentYear = new Date().getFullYear();
        const withYear = Date.parse(`${dateString} ${currentYear}`);
        if (!Number.isNaN(withYear)) {
            return Math.floor(withYear / 1000);
        }
        
        const fallback = Date.parse(dateString);
        if (!Number.isNaN(fallback)) {
            return Math.floor(fallback / 1000);
        }
    }
    
    return null;
}

function buildMessageMetadata(timestamp) {
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date();
    return {
        displayTime: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        dateLabel: date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    };
}

function sortContactsByLatest() {
    contactsData.sort((a, b) => {
        const aTimestamp = getContactLatestTimestamp(a);
        const bTimestamp = getContactLatestTimestamp(b);
        return (bTimestamp || 0) - (aTimestamp || 0);
    });
}

function getContactLatestTimestamp(contact) {
    if (!contact.messages || contact.messages.length === 0) {
        return 0;
    }
    const lastMessage = contact.messages[contact.messages.length - 1];
    return lastMessage.timestamp || 0;
}

function truncateText(text, limit = 40) {
    if (!text) {
        return 'No messages yet';
    }
    if (text.length <= limit) {
        return text;
    }
    return `${text.substring(0, limit - 3)}...`;
}

function formatPreviewTime(message) {
    if (!message) {
        return '';
    }
    
    const timestampMs = typeof message.timestamp === 'number' ? message.timestamp * 1000 : null;
    const fallback = message.time || '';
    
    if (!timestampMs) {
        return fallback;
    }
    
    const messageDate = new Date(timestampMs);
    const now = new Date();
    
    const isSameDay = messageDate.toDateString() === now.toDateString();
    if (isSameDay) {
        return messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    
    const isSameYear = messageDate.getFullYear() === now.getFullYear();
    if (isSameYear) {
        return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    
    return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderMessagesPlaceholder(message, detail) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        return;
    }
    
    messagesContainer.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state-message';
    
    const primaryText = document.createElement('p');
    primaryText.textContent = message;
    wrapper.appendChild(primaryText);
    
    if (detail) {
        const detailText = document.createElement('p');
        detailText.className = 'text-muted';
        detailText.textContent = detail;
        wrapper.appendChild(detailText);
    }
    
    messagesContainer.appendChild(wrapper);
}

function applySearchFilter(searchValue = '') {
    const normalized = (searchValue || '').toLowerCase();
    const contacts = document.querySelectorAll('.contact-item');
    
    contacts.forEach(contact => {
        const name = contact.getAttribute('data-contact').toLowerCase();
        const previewText = contact.querySelector('.contact-preview').textContent.toLowerCase();
        if (!normalized || name.includes(normalized) || previewText.includes(normalized)) {
            contact.style.display = 'flex';
        } else {
            contact.style.display = 'none';
        }
    });
}

function updateCurrentContactHeader(name, phone) {
    const nameEl = document.getElementById('currentContactName');
    const phoneEl = document.getElementById('currentContactPhone');
    
    if (nameEl) {
        nameEl.textContent = name;
    }
    
    if (phoneEl) {
        phoneEl.textContent = phone || '';
    }
}

// Load chat history for a contact
function loadChatHistory(contactName, options = {}) {
    const { preserveScroll = false } = options;
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        return;
    }
    
    const previousScrollTop = messagesContainer.scrollTop;
    const previousHeight = messagesContainer.scrollHeight;
    
    messagesContainer.innerHTML = '';
    const messages = chatHistory[contactName] || [];
    
    if (messages.length === 0) {
        renderMessagesPlaceholder('No SMS messages for this contact yet.');
        return;
    }
    
    let lastDateLabel = null;
    messages.forEach(msg => {
        if (msg.dateLabel && msg.dateLabel !== lastDateLabel) {
            const dateDivider = document.createElement('div');
            dateDivider.className = 'date-divider';
            dateDivider.innerHTML = `<span>${msg.dateLabel}</span>`;
            messagesContainer.appendChild(dateDivider);
            lastDateLabel = msg.dateLabel;
        }
        addMessageToUI(msg.type, msg.text, msg.time, false);
    });
    
    if (preserveScroll) {
        const newHeight = messagesContainer.scrollHeight;
        const heightDiff = newHeight - previousHeight;
        messagesContainer.scrollTop = previousScrollTop + Math.max(heightDiff, 0);
    } else {
        scrollToBottom();
    }
}

// Add message to UI
function addMessageToUI(type, text, time, animate = true) {
    const messagesContainer = document.getElementById('messagesContainer');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = text;
    
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = time || '';
    
    messageBubble.appendChild(messageText);
    messageBubble.appendChild(messageTime);
    messageDiv.appendChild(messageBubble);
    
    messagesContainer.appendChild(messageDiv);
    
    if (animate) {
        scrollToBottom();
    }
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text === '') return;
    
    if (!currentContact || !currentContactPhone) {
        alert('Select a contact before composing a message.');
        input.value = '';
        input.focus();
        return;
    }
    
    const connId = getConversationConnectionId(currentContact);
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        appendLocalMessage(currentContact, currentContactPhone, text, 'sent', { connId });
        input.value = '';
        await sendSmsRequest({
            recipient: currentContactPhone,
            content: text,
            connId
        });
        await loadSmsData({ background: true });
    } catch (error) {
        alert(error.message || 'Failed to send SMS.');
        await loadSmsData({ background: false });
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

function getConversationConnectionId(contactName) {
    const contact = contactsData.find(item => item.name === contactName);
    if (!contact) {
        return null;
    }
    if (contact.defaultConnId) {
        return contact.defaultConnId;
    }
    const lastMessage = contact.messages[contact.messages.length - 1];
    return lastMessage ? lastMessage.connId || null : null;
}

function appendLocalMessage(contactName, phone, text, type, options = {}) {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const metadata = buildMessageMetadata(timestampSeconds);
    const message = {
        id: Date.now(),
        type,
        text,
        time: metadata.displayTime,
        dateLabel: metadata.dateLabel,
        timestamp: timestampSeconds,
        connId: options.connId || null,
        simId: options.simId || null
    };
    
    if (!chatHistory[contactName]) {
        chatHistory[contactName] = [];
    }
    chatHistory[contactName].push(message);
    
    let contact = contactsData.find(item => item.name === contactName);
    if (!contact) {
        contact = {
            name: contactName,
            phone: phone || contactName,
            messages: [],
            defaultConnId: options.connId || null
        };
        contactsData.push(contact);
    }
    contact.messages.push({ ...message });
    if (!contact.defaultConnId && options.connId) {
        contact.defaultConnId = options.connId;
    }
    
    sortContactsByLatest();
    renderContactsList();
    const searchInput = document.getElementById('searchInput');
    applySearchFilter(searchInput ? searchInput.value : '');
    
    if (currentContact === contactName) {
        loadChatHistory(contactName);
    }
}

function openComposeModal() {
    if (!composeModalEl) return;
    if (composeFormEl) {
        composeFormEl.reset();
    }
    if (composeErrorEl) {
        composeErrorEl.textContent = '';
    }
    composeModalEl.classList.add('show');
    if (composePhoneInput) {
        composePhoneInput.focus();
    }
}

function closeComposeModal() {
    if (!composeModalEl) return;
    composeModalEl.classList.remove('show');
    if (composeFormEl) {
        composeFormEl.reset();
    }
    if (composeErrorEl) {
        composeErrorEl.textContent = '';
    }
}

async function handleComposeSubmit(event) {
    event.preventDefault();
    if (!composePhoneInput || !composeMessageInput) {
        return;
    }
    
    const phone = composePhoneInput.value.trim();
    const message = composeMessageInput.value.trim();
    
    if (!phone || !message) {
        if (composeErrorEl) {
            composeErrorEl.textContent = 'Phone number and message are required.';
        }
        return;
    }
    
    if (!phone.startsWith('+')) {
        if (composeErrorEl) {
            composeErrorEl.textContent = 'Phone number must include the country code (e.g., +1234567890).';
        }
        return;
    }
    
    setComposeLoading(true);
    try {
        await sendSmsRequest({
            recipient: phone,
            content: message
        });
        closeComposeModal();
        await loadSmsData({ background: false });
        setActiveContact(phone);
    } catch (error) {
        if (composeErrorEl) {
            composeErrorEl.textContent = error.message || 'Failed to send SMS.';
        }
    } finally {
        setComposeLoading(false);
    }
}

function setComposeLoading(isLoading) {
    if (composeSendBtn) {
        composeSendBtn.disabled = isLoading;
    }
    if (composeCancelBtn) {
        composeCancelBtn.disabled = isLoading;
    }
    if (composeCloseBtn) {
        composeCloseBtn.disabled = isLoading;
    }
}

async function sendSmsRequest(payload) {
    const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    let data = {};
    try {
        data = await response.json();
    } catch (err) {
        data = {};
    }
    
    if (!response.ok) {
        throw new Error(data.message || 'Failed to send SMS.');
    }
    
    return data;
}
// Scroll to bottom of messages
function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        return;
    }
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// Handle window resize
window.addEventListener('resize', function() {
    scrollToBottom();
    if (!isMobileView()) {
        toggleSidebar(false);
    }
    relocateChatActions();
});

// Theme Management Functions
function initializeTheme() {
    // Get saved theme preference or default to 'auto'
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(savedTheme);
    updateThemeUI(savedTheme);
}

function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeDropdown = document.getElementById('themeDropdown');
    const themeOptions = document.querySelectorAll('.theme-option');
    
    // Toggle dropdown
    themeToggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!themeToggleBtn.contains(e.target) && !themeDropdown.contains(e.target)) {
            themeDropdown.classList.remove('show');
        }
    });
    
    // Theme option selection
    themeOptions.forEach(option => {
        option.addEventListener('click', function() {
            const selectedTheme = this.getAttribute('data-theme');
            currentTheme = selectedTheme;
            localStorage.setItem('theme', selectedTheme);
            applyTheme(selectedTheme);
            updateThemeUI(selectedTheme);
            themeDropdown.classList.remove('show');
        });
    });
    
    // Listen for system theme changes when in auto mode
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
            if (currentTheme === 'auto') {
                applyTheme('auto');
                updateThemeUI('auto');
            }
        });
    }
}

function setupMoreMenu() {
    const moreBtn = document.getElementById('moreBtn');
    const moreDropdown = document.getElementById('moreDropdown');
    
    if (!moreBtn || !moreDropdown) return;
    
    moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        moreDropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', function(e) {
        if (!moreDropdown.contains(e.target) && !moreBtn.contains(e.target)) {
            moreDropdown.classList.remove('show');
        }
    });
    
    const optionButtons = moreDropdown.querySelectorAll('.dropdown-option');
    optionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleMoreMenuAction(action);
            moreDropdown.classList.remove('show');
        });
    });
}

function handleMoreMenuAction(action) {
    if (action === 'settings') {
        alert('Settings functionality will be implemented here.');
    } else if (action === 'logout') {
        window.location.href = '/logout';
    }
}

function setupMobileSidebar() {
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebar();
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSidebar(false);
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', function() {
            toggleSidebar(false);
        });
    }
}

function toggleSidebar(forceState) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar || !overlay) return;
    
    const shouldShow = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('show');
    
    if (shouldShow && !isMobileView()) {
        return;
    }
    
    if (shouldShow) {
        sidebar.classList.add('show');
        overlay.classList.add('show');
    } else {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }
}

function closeSidebarOnMobile() {
    if (isMobileView()) {
        toggleSidebar(false);
    }
}

function isMobileView() {
    return window.innerWidth <= 768;
}

function relocateChatActions() {
    const chatActions = document.getElementById('chatActions');
    const desktopPlaceholder = document.getElementById('chatActionsDesktopPlaceholder');
    const mobileContainer = document.getElementById('mobileChatActions');
    
    if (!chatActions || !desktopPlaceholder || !mobileContainer) {
        return;
    }
    
    if (isMobileView()) {
        if (!mobileContainer.contains(chatActions)) {
            mobileContainer.appendChild(chatActions);
        }
    } else {
        const desktopParent = desktopPlaceholder.parentNode;
        if (desktopParent && desktopParent !== chatActions.parentNode) {
            desktopParent.insertBefore(chatActions, desktopPlaceholder);
        }
    }
}

function applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'auto') {
        // Check system preference
        const prefersDark = getSystemThemePreference();
        if (prefersDark) {
            root.setAttribute('data-theme', 'dark');
        } else {
            root.removeAttribute('data-theme');
        }
    } else if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else {
        root.removeAttribute('data-theme');
    }
}

function updateThemeUI(theme) {
    const themeIcon = document.getElementById('themeIcon');
    const themeOptions = document.querySelectorAll('.theme-option');
    
    // Update icon based on current theme
    if (theme === 'auto') {
        const prefersDark = getSystemThemePreference();
        themeIcon.textContent = prefersDark ? '🌙' : '☀️';
    } else if (theme === 'dark') {
        themeIcon.textContent = '🌙';
    } else {
        themeIcon.textContent = '☀️';
    }
    
    // Update active state in dropdown
    themeOptions.forEach(option => {
        if (option.getAttribute('data-theme') === theme) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

function getSystemThemePreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
