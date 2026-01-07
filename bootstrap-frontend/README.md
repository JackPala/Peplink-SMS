# Peplink SMS - Bootstrap Frontend

A modern, responsive web UI for sending and receiving SMS messages through Peplink, built with Bootstrap 5 and Material Design.

## Features

- **Material Design Interface**: Clean, modern UI with gradient colors and smooth animations
- **Sidebar Navigation**: Quick access to all message conversations with search functionality
- **Real-time Messaging**: Send and receive messages with instant updates
- **Contact Management**: View 6 example contacts with avatars and message previews
- **Interactive Chat**: Textra-style messaging interface with:
  - Message bubbles with timestamps
  - Sent/received message differentiation
  - Smooth scrolling and animations
  - Message input with emoji and attachment support
- **Top Action Bar**: Quick access to call, info, and more options
- **Search Functionality**: Filter contacts by name or message content
- **Responsive Design**: Works on desktop and mobile devices

## Technologies Used

- **Bootstrap 5.3.2**: For responsive layout and components
- **Custom CSS**: Material Design styling with gradient themes
- **Vanilla JavaScript**: Interactive functionality without heavy frameworks
- **Material Icons**: Using Unicode emoji for better compatibility

## File Structure

```
bootstrap-frontend/
├── index.html          # Main HTML file
├── styles.css          # Custom CSS with Material Design styling
├── script.js           # JavaScript for interactivity
├── assets/
│   ├── css/
│   │   ├── bootstrap.min.css
│   │   └── material-icons.css
│   ├── js/
│   │   └── bootstrap.bundle.min.js
│   └── fonts/
├── package.json        # NPM dependencies
└── README.md          # This file
```

## Getting Started

### Option 1: Direct Browser Access

Simply open `index.html` in a modern web browser. All assets are included locally.

### Option 2: Local Web Server

For better development experience, run a local web server:

```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js
npx http-server -p 8080

# Using PHP
php -S localhost:8080
```

Then navigate to `http://localhost:8080/index.html`

## Usage

### Viewing Conversations

- Click on any contact in the sidebar to view their message history
- The active conversation is highlighted with a darker background

### Sending Messages

1. Type your message in the input field at the bottom
2. Press Enter or click the send button (➤)
3. Your message appears as a purple bubble on the right
4. A simulated response appears after 2 seconds (for demo purposes)

### Searching Contacts

- Use the search bar at the top of the sidebar
- Type any part of a contact name or message preview
- Matching contacts are filtered in real-time

### Additional Actions

- **New Message Button (✏️)**: Create a new conversation
- **Call Button (📞)**: Initiate a call with the contact
- **Info Button (ℹ️)**: View contact information
- **Attach Button (📎)**: Attach files to messages
- **Emoji Button (😊)**: Add emojis to messages

## Integration with Peplink

This frontend is designed to be integrated with Peplink SMS API. To connect it:

1. Replace the simulated message sending in `script.js` with API calls
2. Implement WebSocket or polling for real-time message reception
3. Add authentication for secure access
4. Configure the API endpoint for your Peplink device

## Customization

### Colors

The main gradient colors can be changed in `styles.css`:

```css
.sidebar {
    background: linear-gradient(135deg, #FFB81C 0%, #F1AD1A 100%);
}
```

### Example Contacts

Modify the contact list in `index.html` or dynamically load from your backend.

### Message Simulation

The auto-response feature can be disabled by removing or commenting out the `simulateReceivedMessage()` call in `script.js`.

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## Development

### Installing Dependencies

```bash
npm install
```

This will install Bootstrap and Material Design Icons locally.

### File Serving

Make sure to serve files through a web server (not file://) to avoid CORS issues.

## License

This project is open source. See the LICENSE file in the root directory.

## Screenshots

The UI features a yellow-gold Peplink gradient sidebar with contact avatars, a clean white chat area with message bubbles, and a modern input field at the bottom.

## Future Enhancements

- Real Peplink API integration
- User authentication
- Media message support (images, videos)
- Group messaging
- Message read receipts
- Typing indicators
- Voice messages
- Export conversation history
- Dark mode theme
- Notification system
