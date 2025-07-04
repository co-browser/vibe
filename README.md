<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./static/vibe-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="./static/vibe-light.png">
  <img alt="Vibe Browser" src="./static/vibe-dark.png" width="100%">
</picture>

<h1 align="center">The Interactive Browser.</h1>

<div align="center">

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/cobrowser.svg?style=social&label=Follow%20%40cobrowser)](https://x.com/cobrowser)
[![Discord](https://img.shields.io/discord/1351569878116470928?logo=discord&logoColor=white&label=discord&color=white)](https://discord.gg/gw9UpFUhyY)

</div>

Vibe Browser is an AI-powered desktop browser that transforms traditional web browsing into an intelligent, memory-enhanced experience.

> [!WARNING]
>
> This project is in alpha stage and not production-ready. 
> The architecture is under active development and subject to significant changes.
> Security features are not fully implemented - do not use with sensitive data or in production environments.
>

macOS:

```bash
# 1. Clone and setup
git clone https://github.com/co-browser/vibe.git
cd vibe && cp .env.example .env

# 2. Add your API key to .env
# OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# 3. Install and launch
pnpm install && pnpm dev
```

## Features

Vibe Browser includes intelligent AI-powered features:

- **Memory Awareness**: Intelligent context and memory of all websites you visit
- **Gmail Integration**: AI-powered email management and automation

<details>
<summary><strong>Gmail Setup</strong></summary>


#### Gmail Setup

To enable Gmail integration, configure your Google Cloud credentials by following either the Console or gcloud path below.

| Option 1: Console (Web) Setup | Option 2: gcloud (CLI) Setup |
|:------------------------------:|:-----------------------------:|
| <span style="color: green;">Use the Google Cloud Console for a guided, web-based setup.</span> | <span style="color: blue;">Use the gcloud command-line tool for a faster, scriptable setup.</span> |
| | |
| **1. Select or Create Project** | **1. Login and Select Project** |
| • Go to the [Google Cloud Project Selector](https://console.cloud.google.com/projectselector2/home/dashboard)• Choose an existing project or click CREATE PROJECT | • Authenticate with Google Cloud:<br>```gcloud auth login```<br>• To create a new project, run:<br>```gcloud projects create YOUR_PROJECT_ID```<br>• Set your active project:<br>```gcloud config set project YOUR_PROJECT_ID```<br> |
| | |
| **2. Enable Gmail API** | **2. Enable Gmail API** |
| • Navigate to the [Gmail API Library page](https://console.cloud.google.com/apis/library/gmail.googleapis.com)• Ensure your project is selected and click Enable | • Run the following command:<br>```gcloud services enable gmail.googleapis.com```<br> |
| | |
| **3. Create OAuth Credentials** | **3. Create OAuth Credentials** |
| • Go to the [Credentials page](https://console.cloud.google.com/apis/credentials)• Click + CREATE CREDENTIALS > OAuth client ID• Set Application type to Desktop app• Click Create, then DOWNLOAD JSON | Creating OAuth credentials for a Desktop App is best done through the web console. Please follow Step 3 from the Console (Web) Setup above to download the JSON key file. |

## Final Step (for both paths)

After downloading the credentials file:

1. Rename the downloaded file to `gcp-oauth.keys.json`
2. Move it to the application's configuration directory:
   ```bash
   mkdir -p ~/.gmail-mcp
   mv gcp-oauth.keys.json ~/.gmail-mcp/
   ``` 
</details>

## Demo



## Release Notes

[Release Notes](CHANGELOG.md)

## Development

Quick fix for common issues:
```bash
pnpm fix  # Auto-format and lint-fix
```

Pre-commit hooks validate code quality (same as CI). All commits must pass build, lint, typecheck, and format checks.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our [code of conduct](CODE_OF_CONDUCT.md), and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/co-browser/vibe/tags).
