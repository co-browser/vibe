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
    "!node_modules/framer-motion/**",
    "!node_modules/@swc/**",
    "node_modules/fs-xattr/build/Release/*.node",
    "!node_modules/.cache",
    "out/**/*",
  ],
  afterSign: "scripts/notarize.js",
  afterAllArtifactBuild: "scripts/notarizedmg.js",
  asarUnpack: [
    "**/*.node"
  ],
  extraResources: [
    {
      from: "../../packages/mcp-*/dist",
      to: "mcp-servers",
      filter: ["**/*"],
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
      NSServices: [
                {
                    NSSendTypes: ["NSStringPboardType"],
                    NSMessage: "handleTextDropOnDock",
                    NSMenuItem: {
                        default: "vibe...",
                    },
                },
            ],
    },
    category: "public.app-category.developer-tools",
    entitlements: "resources/entitlements.mac.plist", 
    entitlementsInherit: "resources/entitlements.mac.plist",
    darkModeSupport: true,
    electronLanguages: ["en"],
    hardenedRuntime: true,
    gatekeeperAssess: true,
    icon: "resources/icon.icns",
    notarize: false,
    type: "distribution",
    identity: "E2566872AC26692C6196F1E880B092B692C0B981",
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
    sign: true,
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
  extraMetadata: {
    version: process.env.VIBE_VERSION || require("./package.json").version,
    env: "production",
  },
  npmRebuild: false,
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
