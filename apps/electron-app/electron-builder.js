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
  afterSign: "scripts/notarize.js",
  afterAllArtifactBuild: "scripts/notarizedmg.js",
  asarUnpack: [
    "dist/mac-arm64/vibe.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node",
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
      NSBluetoothAlwaysUsageDescription: "passkey access",
      NSBluetoothPeripheralUsageDescription: "passkey access",
      NSCameraUsageDescription: "webrtc access",
      NSMicrophoneUsageDescription: "webrtc access",
    },
    category: "public.app-category.developer-tools",
    entitlements: "resources/entitlements.mac.plist",
    darkModeSupport: true,
    electronLanguages: ["en"],
    hardenedRuntime: true,
    gatekeeperAssess: true,
    icon: "resources/icon.icns",
    notarize: false,
    type: "distribution",
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
    background: "resources/DMG_Background.tiff",
    sign: true,
    format: "ULFO",
    internetEnabled: true,
    title: "COBROWSER",
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
  // publish: {
  //   provider: "github",
  //   owner: "co-browser",
  //   repo: "vibe"
  // },
  electronDownload: {
    mirror: "https://npmmirror.com/mirrors/electron/",
  },
};
