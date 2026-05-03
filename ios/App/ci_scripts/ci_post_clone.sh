#!/bin/sh
set -e

# Install Homebrew if not present
if ! command -v brew &> /dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install Node.js via nvm or brew if not present
if ! command -v node &> /dev/null; then
  brew install node
fi

# Install CocoaPods if not present
if ! command -v pod &> /dev/null; then
  brew install cocoapods
fi

# Move to project root (three levels up from ios/App/ci_scripts/)
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node dependencies
npm ci

# Build the web app (generates dist/)
npm run build

# Sync Capacitor — copies dist/ to ios/App/App/public/ and generates config files
npx cap sync ios

# Install iOS CocoaPods dependencies
cd ios/App
pod install --repo-update
