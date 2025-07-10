<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./static/vibe-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="./static/vibe-light.png">
  <img alt="Vibe Browser" src="./static/vibe-dark.png" width="100%">
</picture>

<h1 align="center">The Interactive Browser.</h1>

<div align="center">

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/cobrowser.svg?style=social&label=Follow%20%40cobrowser)](https://x.com/cobrowser)
[![Discord](https://img.shields.io/discord/1351569878116470928?logo=discord&logoColor=white&label=discord)](https://discord.gg/gw9UpFUhyY)

</div>

> **Alpha software** – APIs and security hardening are still evolving.

---

## Quick Start

Download the latest image from the [releases page](https://github.com/co-browser/vibe/releases) and run it.

In the chat window’s bottom bar:

| Do this | What it enables |
|---------|------------------|
| **Sign in with Gmail** | Email tooling |
| **Sign in with Co-Browser** | Persistent memory |
| **Enter OpenAI API key** | AI features |

That’s all, start browsing and Vibe adapts as you go.

---

## Local Development

```bash
# Copy the environment template
cp .env.example .env

# Add your OpenAI key inside .env
# OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Install dependencies and start the app
pnpm install
pnpm dev
```

The desktop application will reload automatically as you edit the source code.

---

## Configuration Flags

| Flag | Purpose |
|------|---------|
| `USE_LOCAL_RAG_SERVER=true` | Use a locally running RAG server. |
| `USE_LOCAL_GMAIL_AUTH=true` | Use self-hosted Gmail OAuth (see below). |

### Self-Hosted Gmail OAuth

If you prefer to use your own Google Cloud project:

<details>
<summary>Console (Web) setup</summary>

1. Select or create a project in the [Google Cloud Console](https://console.cloud.google.com/projectselector2/home/dashboard).<br>
2. Enable the Gmail API in the [library](https://console.cloud.google.com/apis/library/gmail.googleapis.com).<br>
3. Create OAuth credentials (Desktop app) and download the JSON file.
</details>

<details>
<summary>gcloud (CLI) setup</summary>

```bash
# Authenticate and pick a project
gcloud auth login
# (Optional) create a new project
gcloud projects create YOUR_PROJECT_ID
# Activate the project
gcloud config set project YOUR_PROJECT_ID

# Enable the Gmail API
gcloud services enable gmail.googleapis.com
```
Create OAuth credentials for a Desktop application in the console (step 3 above) and download the JSON file.
</details>

**Finish up**

```bash
mkdir -p ~/.gmail-mcp
mv gcp-oauth.keys.json ~/.gmail-mcp/
```
Placing this file switches Vibe to self-hosted OAuth mode automatically.

---

## Demo

![Demo](./static/demo.gif)

---

## Release Notes

> **Note**
>
> [v0.1.7](https://github.com/co-browser/vibe/releases/tag/v0.1.7) - July 10, 2025
>
> • **Gmail Fix:** Fixed an issue where Gmail integration would break after restarting the app  
> • **Process Management:** Email server now properly shuts down when you quit the app  
> • **Stability:** No more "port already in use" errors on subsequent launches 

For the full technical changelog, see [CHANGELOG.md](CHANGELOG.md).

## Contributing

Please follow the guidelines in [CONTRIBUTING.md](CONTRIBUTING.md). The project’s code of conduct is available in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

