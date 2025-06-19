#!/bin/sh

# Note: Do not run this script directly, run `npm run build` in the `demo` folder to make the variables available.

cd "$(dirname "$0")"

xcodebuild -project DockTileBuilder.xcodeproj clean build CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO GCC_PREPROCESSOR_DEFINITIONS='kDOCK_ICON_NOTIFICATION_KEY=@\"$npm_config_dock_icon_notification_key\" kDOCK_ICON_CLASS_NAME=$npm_config_dock_icon_class_name' PRODUCT_BUNDLE_IDENTIFIER='$npm_config_dock_icon_plugin_bundle_identifier' DOCK_ICON_CLASS_NAME='$npm_config_dock_icon_class_name'