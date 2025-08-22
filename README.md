<p align="center" style="font-size:48px;>
  <img src="assets/minihf_logo_no_text.png" alt="vector art logo of the brain patterned in the style of a pictorial history of Portuguese textiles, painted in the 1700s" width="50" height="50">
  MiniLoom
</p>

MiniLoom is a desktop application for AI text generation.

## Features

- Desktop application with native UI
- Text generation capabilities from a variety of LLM APIs
- File save/load functionality
- Settings management
- Text search functionality

## Getting Started

### First Time Setup

When you first open MiniLoom, the app will automatically detect that you're a new user and open the Settings panel with a welcome message. Here's what you need to do to get started:

1. **Create a Service** (Required)
   - Click on the "🌐 Services" tab
   - Click "Add New" to create your first service
   - Choose a service type (OpenRouter is recommended for beginners)
   - Fill in the required details:
     - **Service Name**: Give it a memorable name (e.g., "My OpenRouter")
     - **API URL**: Usually pre-filled for popular services
     - **Model Name**: Choose a model (e.g., "deepseek/deepseek-v3-base:free" for OpenRouter)
   - Click "Save"

2. **Add an API Key** (Required for most services)
   - Click on the "🔑 API Keys" tab
   - Enter a name for your key (e.g., "OPENROUTER_KEY")
   - Paste your API key in the "Secret" field
   - Click "Add"
   - **Note**: Some APIs may work without a key for free tiers

3. **Configure Sampling** (Optional - Default provided)
   - Click on the "🎲 Samplers" tab
   - A "Default" sampler is automatically created for new users
   - You can customize it or create new ones as needed

### Using the App

1. **Select Your Configuration**
   - In the bottom control bar, select your Service, API Key, and Sampler
   - The order is: Service → Key → Sampler

2. **Start Generating**
   - Type your prompt in the main editor
   - Click the "🖋️ Generate" button
   - Your text will be generated and added to the tree structure

3. **Navigate and Expand**
   - Use the tree view on the left to navigate between different generations
   - Click on any node to focus on it and continue from that point
   - Use thumbs up/down to rate responses

## Prerequisites

- Node.js / npm (version 14 or higher)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/JD-P/miniloom.git
cd miniloom
```

2. Install dependencies:

```bash
npm install
```

## Usage

To start the application:

```bash
npm start
```

This will launch the MiniLoom desktop application.

## Development

The application is built with:

- Electron for the desktop framework
- Vanilla JavaScript for the frontend
- MiniSearch for search functionality
- Diff-match-patch for text comparison

## License

Apache License 2.0

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
