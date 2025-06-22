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

To enable Gmail integration, configure Google Cloud credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API for your project
4. Go to "APIs & Services" > "Credentials"
5. Click "Create Credentials" > "OAuth client ID"
6. Choose either "Desktop app" or "Web application" as application type
7. Download the JSON file and rename it to `gcp-oauth.keys.json`
8. Set up authentication:

```bash
mkdir -p ~/.gmail-mcp
mv gcp-oauth.keys.json ~/.gmail-mcp/
```

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
