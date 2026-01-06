# InkSight 🖋️

> **Read deeply, think clearly.**
> A modern Web application integrating deep reading, mind mapping, and knowledge management.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](https://github.com/Mrmo072/InkSight/releases)

[中文](./README_ZH.md) | **English**

## 📖 Introduction

InkSight aims to solve the pain point of separation between "reading" and "thinking" in traditional reading tools. It seamlessly integrates a multi-format document reader (PDF/EPUB/Markdown) with an infinite canvas mind map, supporting **drag-and-drop node creation** and **bi-directional linking**. Whether you are conducting academic research by reading papers or building a knowledge system by reading technical books, InkSight helps you transform information into knowledge more efficiently.

![InkSight Preview](./docs/images/preview.png)

## 🚀 Quick Start

### Requirements
- Node.js 16+
- npm or yarn

### Installation & Running

```bash
# 1. Clone the repository
git clone https://github.com/Mrmo072/inksight.git

# 2. Enter the directory
cd inksight

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev
```

Visit `http://localhost:5173` to start using it.

## 📚 Documentation

- **[Features](./docs/FEATURES.md)**: Detailed feature introduction.
- **[Architecture](./docs/ARCHITECTURE.md)**: Project structure, tech stack, and core module explanation.
- **[Roadmap](./docs/ROADMAP.md)**: Development motivation and future plans.

## ✨ Key Features

- **Multi-format Support**: PDF, EPUB, TXT, Markdown.
- **Immersive Reading**: A reading experience focused on content.
- **Visual Notes**: Generate mind map nodes directly by dragging content from documents.
- **Annotation List**: Dedicated interaction panel for managing highlights and notes with bidirectional sync.
- **Outline Navigation**: Integrated document outline sidebar for easy navigation.
- **Smart Layout**: Powerful automatic layout algorithms to clarify your train of thought with one click.
- **Bi-directional Tracing**: Click on a note node to instantly jump back to the original source in the text.
- **Privacy & Security**: All data is stored locally, no internet connection required.

## 📦 Packaging (Windows Application)

You can package InkSight as a standalone Windows executable (`.exe`) that runs without a server.

### Build Executable

```bash
# Build the application
npm run dist:win

# The executable will be generated at:
# dist/win-unpacked/InkSight.exe
```

## 🛠️ Tech Stack

- **Frontend**: React, Vanilla JS, Vite
- **Desktop**: Electron
- **Rendering**: PDF.js, Epub.js, Marked
- **Canvas**: [Plait (Drawnix)](https://github.com/plait-board/drawnix), Rough.js

## 🤝 Acknowledgements

- **[Drawnix](https://github.com/plait-board/drawnix)**: The core whiteboard engine of InkSight is built upon Drawnix. Special thanks to the Plait Board team for their excellent work.

## ☕ Support

If you find InkSight helpful, please consider buying me a coffee to support the development!

<div align="center">
  <img src="./docs/images/wechat.png" alt="WeChat Pay" width="200" style="margin-right: 20px;" />
  <img src="./docs/images/Alipay.png" alt="Alipay" width="200" />
</div>

---
*Created by the Mrmo072.*
