// Chat data structure
const chatHistory = {
    'John Smith': [
        { type: 'received', text: 'Hey, how are you doing?', time: '2:45 PM' },
        { type: 'sent', text: "I'm doing great! How about you?", time: '2:46 PM' },
        { type: 'received', text: 'Pretty good, thanks for asking!', time: '2:47 PM' }
    ],
    'Sarah Johnson': [
        { type: 'received', text: 'Can you help me with the project?', time: '1:25 PM' },
        { type: 'sent', text: 'Sure, what do you need?', time: '1:26 PM' },
        { type: 'received', text: 'Thanks for your help!', time: '1:30 PM' }
    ],
    'Mike Davis': [
        { type: 'sent', text: 'See you at the meeting tomorrow', time: '12:10 PM' },
        { type: 'received', text: 'See you tomorrow', time: '12:15 PM' }
    ],
    'Emily Brown': [
        { type: 'sent', text: 'I sent you the files', time: '11:15 AM' },
        { type: 'received', text: 'Got it, thanks!', time: '11:20 AM' }
    ],
    'Robert Wilson': [
        { type: 'received', text: 'Meeting at 3 PM', time: '10:45 AM' },
        { type: 'sent', text: "I'll be there", time: '10:46 AM' }
    ],
    'Lisa Anderson': [
        { type: 'sent', text: 'How about lunch at noon?', time: '9:25 AM' },
        { type: 'received', text: 'Perfect! 👍', time: '9:30 AM' }
    ]
};

let currentContact = 'John Smith';
let currentContactPhone = '+1234567890';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadChatHistory(currentContact);
    scrollToBottom();
});

// Setup event listeners
function setupEventListeners() {
    // Contact selection
    const contactItems = document.querySelectorAll('.contact-item');
    contactItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all contacts
            contactItems.forEach(c => c.classList.remove('active'));
            // Add active class to clicked contact
            this.classList.add('active');
            
            // Get contact info
            currentContact = this.getAttribute('data-contact');
            currentContactPhone = this.getAttribute('data-phone');
            
            // Update header
            document.getElementById('currentContactName').textContent = currentContact;
            document.getElementById('currentContactPhone').textContent = currentContactPhone;
            
            // Load chat history
            loadChatHistory(currentContact);
            scrollToBottom();
        });
    });
    
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
        const searchTerm = e.target.value.toLowerCase();
        const contacts = document.querySelectorAll('.contact-item');
        
        contacts.forEach(contact => {
            const name = contact.getAttribute('data-contact').toLowerCase();
            const preview = contact.querySelector('.contact-preview').textContent.toLowerCase();
            
            if (name.includes(searchTerm) || preview.includes(searchTerm)) {
                contact.style.display = 'flex';
            } else {
                contact.style.display = 'none';
            }
        });
    });
    
    // New message button
    document.getElementById('newMessageBtn').addEventListener('click', function() {
        alert('New message functionality - Would connect to Peplink SMS API');
    });
    
    // Call button
    document.getElementById('callBtn').addEventListener('click', function() {
        alert(`Calling ${currentContact} at ${currentContactPhone}`);
    });
    
    // Info button
    document.getElementById('infoBtn').addEventListener('click', function() {
        alert(`Contact Info:\nName: ${currentContact}\nPhone: ${currentContactPhone}`);
    });
    
    // Attach button
    document.getElementById('attachBtn').addEventListener('click', function() {
        alert('Attach file functionality - Would integrate with Peplink SMS API');
    });
    
    // Emoji button
    document.getElementById('emojiBtn').addEventListener('click', function() {
        alert('Emoji picker would be shown here');
    });
}

// Load chat history for a contact
function loadChatHistory(contactName) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    // Add date divider
    const dateDivider = document.createElement('div');
    dateDivider.className = 'date-divider';
    dateDivider.innerHTML = '<span>Today</span>';
    messagesContainer.appendChild(dateDivider);
    
    // Load messages
    const messages = chatHistory[contactName] || [];
    messages.forEach(msg => {
        addMessageToUI(msg.type, msg.text, msg.time, false);
    });
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
    messageTime.textContent = time;
    
    messageBubble.appendChild(messageText);
    messageBubble.appendChild(messageTime);
    messageDiv.appendChild(messageBubble);
    
    messagesContainer.appendChild(messageDiv);
    
    if (animate) {
        scrollToBottom();
    }
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text === '') return;
    
    // Get current time
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    // Add message to chat history
    if (!chatHistory[currentContact]) {
        chatHistory[currentContact] = [];
    }
    chatHistory[currentContact].push({ type: 'sent', text: text, time: time });
    
    // Add message to UI
    addMessageToUI('sent', text, time, true);
    
    // Clear input
    input.value = '';
    
    // Focus back on input
    input.focus();
    
    // Update contact preview
    updateContactPreview(currentContact, text, time);
    
    // Simulate received message after a delay (for demo purposes)
    setTimeout(() => {
        simulateReceivedMessage();
    }, 2000);
}

// Update contact preview in sidebar
function updateContactPreview(contactName, text, time) {
    const contacts = document.querySelectorAll('.contact-item');
    contacts.forEach(contact => {
        if (contact.getAttribute('data-contact') === contactName) {
            const preview = contact.querySelector('.contact-preview');
            const timeEl = contact.querySelector('.contact-time');
            
            preview.textContent = text;
            timeEl.textContent = time;
            
            // Move contact to top (optional)
            const contactsList = document.getElementById('contactsList');
            contactsList.insertBefore(contact, contactsList.firstChild);
        }
    });
}

// Simulate receiving a message (for demo)
function simulateReceivedMessage() {
    const responses = [
        "That's great!",
        "Got it, thanks!",
        "Sure thing!",
        "Sounds good to me!",
        "Perfect! 👍",
        "I'll check that out",
        "Thanks for letting me know"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    // Add to chat history
    chatHistory[currentContact].push({ type: 'received', text: randomResponse, time: time });
    
    // Add to UI
    addMessageToUI('received', randomResponse, time, true);
    
    // Update contact preview
    updateContactPreview(currentContact, randomResponse, time);
}

// Scroll to bottom of messages
function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

// Handle window resize
window.addEventListener('resize', function() {
    scrollToBottom();
});
