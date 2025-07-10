module.exports = {
  productName: "vibe",
  directories: {
    buildResources: "build",
  },
  files: [
    "!**/.vscode/*",
    "!src/*",
    "!electron.vite.config.{js,ts,mjs,cjs}",
    "!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}",
    "!{.env,.env.*,.npmrc,pnpm-lock.yaml}",
    "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",
    "out/**/*",
  ],
  afterSign: process.env.NOTARIZE === 'true' ? "scripts/notarize.js" : undefined,
  afterAllArtifactBuild: process.env.NOTARIZE === 'true' ? "scripts/notarizedmg.js" : undefined,
  asarUnpack: [
    "dist/mac-arm64/vibe.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node",
    "**/out/main/processes/mcp-manager-process.js",
    "**/out/main/processes/agent-process.js"
  ],
  extraResources: [
    {
      from: "../../packages/mcp-gmail",
      to: "mcp-servers/mcp-gmail",
      filter: ["**/*", "!.git/**/*"],
    },
    {
      from: "../../packages/mcp-rag",
      to: "mcp-servers/mcp-rag",
      filter: ["**/*", "!.git/**/*"],
    },
  ],
  win: {
    executableName: "vibe-desktop",
  },
  nsis: {
    artifactName: "${name}-${version}-setup.${ext}",
    shortcutName: "${productName}",
    uninstallDisplayName: "${productName}",
    createDesktopShortcut: "always",
  },
  mac: {
    appId: "xyz.cobrowser.vibe",
    extendInfo: {
      NSBonjourServices: ["_http._tcp"],
      ASWebAuthenticationSessionWebBrowserSupportCapabilities: {
        IsSupported: true,
        EphemeralBrowserSessionIsSupported: true,
        CallbackURLMatchingIsSupported: true,
        AdditionalHeaderFieldsAreSupported: true,
      },
      ASWebAuthenticationSessionWebBrowserSupport: {
        IsSupported: true,
        EphemeralBrowserSessionIsSupported: true,
        CallbackURLMatchingIsSupported: true,
        AdditionalHeaderFieldsAreSupported: true,
      },
      ASAccountAuthenticationModificationOptOutOfSecurityPromptsOnSignIn: true,
      UIRequiredDeviceCapabilities: ["embedded-web-browser-engine"],
      BEEmbeddedWebBrowserEngine: "chromium",
      BEEmbeddedWebBrowserEngineVersion: "138.0.0.0",
      NSDockTilePlugIn: "DockTile.docktileplugin",
    NSBluetoothAlwaysUsageDescription: "passkey access",
      NSBluetoothPeripheralUsageDescription: "passkey access",
      NSCameraUsageDescription: "webrtc access",
      NSMicrophoneUsageDescription: "webrtc access",
      LSEnvironment: {
        USE_LOCAL_RAG_SERVER: "false",
        USE_LOCAL_GMAIL_AUTH: "false",
        NODE_ENV: "production",
        RAG_SERVER_URL: "https://rag.cobrowser.xyz",
      },
    },
    category: "public.app-category.developer-tools",
    entitlements: "resources/entitlements.mac.plist", 
    entitlementsInherit: "resources/entitlements.mac.plist",
    darkModeSupport: true,
    electronLanguages: ["en"],
    hardenedRuntime: true,
    gatekeeperAssess: true,
    icon: "resources/icon.icns",
    notarize: process.env.NOTARIZE === 'true' || false,
    type: "distribution",
    identity: process.env.APPLE_IDENTITY || (process.env.CSC_LINK ? "E2566872AC26692C6196F1E880B092B692C0B981" : null),
    helperBundleId: "${appId}.helper",
    helperEHBundleId: "${appId}.helper.eh",
    helperGPUBundleId: "${appId}.helper.gpu",
    helperPluginBundleId: "${appId}.helper.plugin",
    additionalArguments: ["--timestamp"],
    target: ["dmg", "zip"],
    artifactName: "vibe-${version}.${ext}",
    binaries: ["dist/mac-arm64/vibe.app/Contents/MacOS/vibe"],
  },
  dmg: {
    icon: "resources/icon.icns",
    background: "resources/bg.tiff",
    sign: process.env.CSC_LINK ? true : false,
    format: "ULFO",
    internetEnabled: true,
    title: "[ v i b e ]",
    window: {
      width: 600,
      height: 600,
    },
    contents: [
      {
        type: "link",
        path: "/Applications",
        x: 410,
        y: 150,
      },
      {
        type: "file",
        x: 130,
        y: 150,
      },
    ],
  },
  linux: {
    target: ["AppImage", "snap", "deb"],
    maintainer: "vibe-maintainers@example.com",
    category: "Utility",
  },
  publish: {
    provider: "github",
    owner: "co-browser",
    repo: "vibe",
    private: false,
    releaseType: "release"
  },
  extraMetadata: {
    version: process.env.VIBE_VERSION || require("./package.json").version,
    env: "production",
  },
  // Ensure NODE_ENV is set for packaged app
  asar: {
    smartUnpack: true
  },
  npmRebuild: false,
  // Only include publish config when explicitly publishing (e.g., in CI)
  ...(process.env.PUBLISH_RELEASE === "true" ? {
    publish: {
      provider: "github",
      owner: "co-browser",
      repo: "vibe",
      releaseType: "draft",
      publishAutoUpdate: true
    }
  } : {}),
  electronDownload: {
    mirror: "https://npmmirror.com/mirrors/electron/",
  },
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: true,
    grantFileProtocolExtraPrivileges: false
}
};
