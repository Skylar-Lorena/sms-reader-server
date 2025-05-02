// server.js - Improved Express Server with better error handling and features
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet'); // For security headers
const compression = require('compression'); // For response compression
const morgan = require('morgan'); // For logging
const rateLimit = require('express-rate-limit'); // For rate limiting

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced data storage path with creation if not exists
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize messages file if it doesn't exist
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
}

// Rate limiting setup
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});

// Middleware
app.use(helmet()); // Set security headers
app.use(compression()); // Compress responses
app.use(cors({
  origin: '*', // In production, specify allowed origins
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(morgan('combined')); // Log HTTP requests
app.use('/api/', apiLimiter); // Apply rate limiting to API routes

// Helper to read messages with error handling
const readMessages = () => {
  try {
    const data = fs.readFileSync(MESSAGES_FILE);
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading messages file:', error);
    return [];
  }
};

// Helper to write messages with error handling
const writeMessages = (messages) => {
  try {
    // Create a temporary file to ensure atomic write
    const tempFile = `${MESSAGES_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(messages, null, 2));
    fs.renameSync(tempFile, MESSAGES_FILE);
    return true;
  } catch (error) {
    console.error('Error writing to messages file:', error);
    return false;
  }
};

// Request validation middleware
const validateMessageRequest = (req, res, next) => {
  const { sender, content } = req.body;
  
  if (!sender || !content) {
    return res.status(400).json({ 
      error: 'Validation error',
      details: 'Sender and content are required' 
    });
  }
  
  // Add more validation as needed
  if (typeof content !== 'string' || content.length > 1000) {
    return res.status(400).json({ 
      error: 'Validation error',
      details: 'Content must be a string with maximum length of 1000 characters' 
    });
  }
  
  next();
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    name: 'SMSReader API',
    version: '1.1.0',
    status: 'running' 
  });
});

// Get messages with pagination
app.get('/api/messages', (req, res) => {
  try {
    const messages = readMessages();
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    // Prepare pagination result
    const result = {
      data: messages.slice(startIndex, endIndex),
      pagination: {
        total: messages.length,
        page,
        limit,
        pages: Math.ceil(messages.length / limit)
      }
    };
    
    // Add next/prev page info
    if (endIndex < messages.length) {
      result.pagination.next = page + 1;
    }
    
    if (startIndex > 0) {
      result.pagination.prev = page - 1;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// Post a new message with validation
app.post('/api/messages', validateMessageRequest, (req, res) => {
  try {
    const { sender, content, timestamp } = req.body;
    
    const newMessage = {
      id: Date.now().toString(),
      sender,
      content,
      timestamp: timestamp || Date.now(),
      receivedAt: Date.now()
    };
    
    const messages = readMessages();
    messages.unshift(newMessage); // Add to beginning of array
    
    // Limit stored messages to 1000 to prevent file size issues
    const limitedMessages = messages.slice(0, 1000);
    
    if (writeMessages(limitedMessages)) {
      console.log(`New message received from ${sender}`);
      res.status(201).json(newMessage);
    } else {
      throw new Error('Failed to write message to storage');
    }
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Server error processing message' });
  }
});

// Get messages by sender with filtration
app.get('/api/messages/sender/:sender', (req, res) => {
  try {
    const { sender } = req.params;
    const messages = readMessages();
    
    // Normalize sender for case-insensitive comparison
    const normalizedSender = sender.toLowerCase();
    
    const filteredMessages = messages.filter(
      msg => msg.sender.toLowerCase() === normalizedSender
    );
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const result = {
      data: filteredMessages.slice(startIndex, endIndex),
      pagination: {
        total: filteredMessages.length,
        page,
        limit,
        pages: Math.ceil(filteredMessages.length / limit)
      }
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error retrieving filtered messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// Delete a message with proper error handling
app.delete('/api/messages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const messages = readMessages();
    
    const initialLength = messages.length;
    const updatedMessages = messages.filter(msg => msg.id !== id);
    
    if (initialLength === updatedMessages.length) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (writeMessages(updatedMessages)) {
      res.json({ 
        message: 'Message deleted successfully',
        id
      });
    } else {
      throw new Error('Failed to update storage after deletion');
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Server error deleting message' });
  }
});

// Clear all messages with confirmation requirement
app.delete('/api/messages', (req, res) => {
  try {
    // Require confirmation to prevent accidental deletion
    const { confirm } = req.query;
    
    if (confirm !== 'true') {
      return res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Add ?confirm=true to URL to confirm deletion of all messages'
      });
    }
    
    if (writeMessages([])) {
      res.json({ 
        message: 'All messages cleared successfully',
        timestamp: Date.now()
      });
    } else {
      throw new Error('Failed to clear messages');
    }
  } catch (error) {
    console.error('Error clearing messages:', error);
    res.status(500).json({ error: 'Server error clearing messages' });
  }
});

// Add a health check endpoint
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK'
  };
  
  try {
    // Check if we can read the messages file
    readMessages();
    res.json(health);
  } catch (error) {
    health.status = 'ERROR';
    health.error = error.message;
    res.status(500).json(health);
  }
});

// Error handling for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Start the server with better logging
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on 192.168.100.4:3000');

  // Get server's network interfaces to display all available addresses
  const networkInterfaces = require('os').networkInterfaces();
  console.log('Available on:');
  
  Object.keys(networkInterfaces).forEach(iface => {
    networkInterfaces[iface].forEach(details => {
      if (details.family === 'IPv4' && !details.internal) {
        console.log(`  http://${details.address}:${PORT}`);
      }
    });
  });
  //to-do: add swagger documentation
  // For now, just log the API documentation URL
  console.log(`API Documentation: http://localhost:${PORT}/docs`);
});