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

<details>
<summary><strong>📧 Gmail Feature Setup</strong></summary>

### Prerequisites

To use Vibe's Gmail integration, you need to set up Google Cloud credentials.

### Step 1: Create a Google Cloud Project and obtain credentials

#### a. Create a Google Cloud Project:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API for your project

#### b. Create OAuth 2.0 Credentials:

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose either "Desktop app" or "Web application" as application type
4. Give it a name and click "Create"
5. For Web application, add `http://localhost:3000/oauth2callback` to the authorized redirect URIs
6. Download the JSON file of your client's OAuth keys
7. Rename the key file to `gcp-oauth.keys.json`

### Step 2: Run Authentication

You can authenticate in two ways:

#### a. Global Authentication (Recommended):

```bash
# First time: Place gcp-oauth.keys.json in your home directory's .gmail-mcp folder
mkdir -p ~/.gmail-mcp
mv gcp-oauth.keys.json ~/.gmail-mcp/
```

#### b. Project-specific Authentication:

Place the `gcp-oauth.keys.json` file in your project's MCP Gmail package directory.

> [!TIP]
> 
> The global authentication method is recommended as it allows you to use the same credentials across multiple projects.

</details>

## Demo

![Demo](./static/demo.gif)

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
