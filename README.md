# SMS Reader API Backend

This is the backend server for the **SMS Reader Android App**, built with **Node.js** and **Express**. It handles the storage, retrieval, and management of SMS messages received from the Android app.

## Features

- **GET /api/messages**: Retrieve a paginated list of all messages.
- **POST /api/messages**: Post a new message with validation.
- **GET /api/messages/sender/:sender**: Retrieve messages filtered by sender with pagination.
- **DELETE /api/messages/:id**: Delete a message by ID.
- **DELETE /api/messages**: Clear all messages with a confirmation parameter.
- **/health**: A health check endpoint to verify server uptime and status.

## Installation

### Prerequisites

- **Node.js**: Make sure you have **Node.js** installed. You can download it from [here](https://nodejs.org/).
- **npm**: The package manager used to install dependencies.

### Steps to Set Up

1. **Clone the repository**:

```bash
git clone https://github.com/yourusername/sms-reader-backend.git
cd sms-reader-backend
