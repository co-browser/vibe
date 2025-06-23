# Vibe Electron App - Production Testing Guide

## 🚀 Quick Start Testing

### Prerequisites
- Linux, macOS, or Windows machine with GUI
- Node.js 18+ installed
- Test dashboard running on port 3001

### 1. Start Test Dashboard
```bash
cd apps/test-dashboard
npm install
npm run dev
```
Dashboard will be available at: http://localhost:3001

### 2. Install & Launch Production App

#### Linux (AppImage - Recommended)
```bash
# Make executable (if needed)
chmod +x dist/vibe-0.1.0.AppImage

# Launch
./dist/vibe-0.1.0.AppImage
```

#### Linux (Debian Package)
```bash
# Install
sudo dpkg -i dist/vibe_0.1.0_amd64.deb

# Launch
vibe
```

#### Linux (Snap Package)
```bash
# Install
sudo snap install dist/vibe_0.1.0_amd64.snap --dangerous

# Launch
vibe
```

---

## 🧪 Complete Testing Checklist

### Phase 1: Basic App Launch & Authentication

#### ✅ App Launch Test
- [ ] App launches without errors
- [ ] Window appears with Vibe branding
- [ ] Navigation bar is visible
- [ ] Chat panel is accessible

#### ✅ Authentication Guard Test
- [ ] **CRITICAL**: Chat interface shows login requirement (not agent interface)
- [ ] Login options are displayed:
  - [ ] Email login
  - [ ] Google
  - [ ] Discord  
  - [ ] GitHub
  - [ ] Apple
  - [ ] Wallet options
- [ ] UI is responsive and professional

#### ✅ Authentication Flow Test
1. **Choose any auth method** (Email recommended for testing)
2. **Complete login process**
3. **Verify post-login behavior**:
   - [ ] Login interface disappears
   - [ ] Chat interface becomes available
   - [ ] User profile appears in navigation bar
   - [ ] Agent interactions are now enabled

#### ✅ Agent Protection Test
- [ ] **Before login**: No access to agent/chat functionality
- [ ] **After login**: Full access to agent capabilities
- [ ] **Agent responses work**: Test a simple query like "Hello"

### Phase 2: Deep-Link Auto-Login Testing

#### ✅ Dashboard Setup
1. **Open test dashboard**: http://localhost:3001
2. **Login with test account**:
   - Email: `test@example.com`
   - Password: `password123`
3. **Verify dashboard functionality**:
   - [ ] Login successful
   - [ ] User info displays
   - [ ] "Open Desktop App" button appears

#### ✅ Deep-Link Generation Test
1. **Click "Open Desktop App"** in dashboard
2. **Verify deep-link generation**:
   - [ ] JWT token generated
   - [ ] Deep-link URL shown (starts with `vibe://`)
   - [ ] Expiration time displayed (1 hour)

#### ✅ Auto-Login Flow Test
1. **Click the deep-link** or paste in browser
2. **Verify automatic behavior**:
   - [ ] Electron app launches (or focuses if already open)
   - [ ] **CRITICAL**: Automatic login occurs (no manual auth required)
   - [ ] User immediately has agent access
   - [ ] Same user info appears as in dashboard

#### ✅ Protocol Registration Test
- [ ] `vibe://` URLs are recognized by operating system
- [ ] Clicking deep-links opens Electron app
- [ ] Multiple clicks focus existing window (no duplicates)

### Phase 3: Session & State Management

#### ✅ Session Persistence Test
1. **Login via app**
2. **Close and reopen app**
3. **Verify**: Still logged in (24-hour session)

#### ✅ Session Expiration Test
1. **Login via deep-link**
2. **Wait or manually expire token**
3. **Verify**: Graceful fallback to manual login

#### ✅ Logout Test
1. **Click user profile** → **Logout**
2. **Verify**: Returns to login interface
3. **Verify**: Agent access is revoked

### Phase 4: Cross-Platform Testing

#### ✅ Windows Testing (if available)
- [ ] MSI installer works
- [ ] Protocol registration works
- [ ] Deep-links launch app correctly

#### ✅ macOS Testing (if available)
- [ ] DMG installer works
- [ ] Protocol registration works
- [ ] Deep-links launch app correctly
- [ ] App appears in Applications folder

---

## 🔍 Advanced Testing Scenarios

### Error Handling Tests

#### ✅ Network Connectivity
- [ ] App handles offline state gracefully
- [ ] Authentication fails appropriately when offline
- [ ] Agent requests show proper error messages

#### ✅ Invalid Deep-Links
- [ ] Expired tokens show appropriate error
- [ ] Malformed URLs don't crash app
- [ ] Invalid user data handled gracefully

#### ✅ Dashboard Unavailable
- [ ] App still functions when dashboard is down
- [ ] Manual authentication still works
- [ ] No crashes or infinite loading

### Security Tests

#### ✅ Token Validation
- [ ] Expired tokens are rejected
- [ ] Invalid tokens are rejected
- [ ] Token tampering is detected

#### ✅ Rate Limiting
- [ ] Dashboard rate limits work (try generating many tokens quickly)
- [ ] Login attempts are rate limited

#### ✅ Data Protection
- [ ] No sensitive data in logs
- [ ] Tokens are properly secured
- [ ] User data is handled securely

---

## 🐛 Troubleshooting Guide

### Common Issues & Solutions

#### App Won't Launch
```bash
# Check AppImage permissions
chmod +x dist/vibe-0.1.0.AppImage

# Check dependencies (Ubuntu/Debian)
sudo apt update && sudo apt install -y libnss3 libatk-bridge2.0-0 libxss1 libgconf-2-4

# Run with debug info
./dist/vibe-0.1.0.AppImage --verbose
```

#### Protocol Registration Issues
```bash
# Linux: Check desktop file
cat ~/.local/share/applications/vibe.desktop

# Manually register (if needed)
xdg-mime default vibe.desktop x-scheme-handler/vibe
```

#### Deep-Links Not Working
1. **Check protocol registration**: Try typing `vibe://test` in browser
2. **Check dashboard**: Ensure it's running on port 3001
3. **Check tokens**: Verify they're not expired
4. **Check logs**: Look in app console for errors

#### Authentication Issues
1. **Check environment**: Ensure `VITE_PRIVY_APP_ID` is set
2. **Check network**: Ensure Privy services are accessible
3. **Clear storage**: Try resetting app data
4. **Check credentials**: Verify Privy configuration

### Log Files & Debugging
```bash
# Linux log locations
~/.config/vibe/logs/
~/.local/share/vibe/

# Enable debug mode
ELECTRON_ENABLE_LOGGING=1 ./dist/vibe-0.1.0.AppImage

# Check Privy debug info
# Open DevTools in app: Ctrl+Shift+I (Linux/Windows) or Cmd+Opt+I (macOS)
```

---

## 📋 Test Report Template

```markdown
## Test Results - [Date]

**Environment:**
- OS: [Linux/Windows/macOS] [version]
- Node.js: [version]
- Package: [AppImage/DEB/Snap/MSI/DMG]

**Phase 1 - Basic Functionality:**
- [ ] App Launch: ✅/❌
- [ ] Authentication Guard: ✅/❌  
- [ ] Login Flow: ✅/❌
- [ ] Agent Protection: ✅/❌

**Phase 2 - Deep-Links:**
- [ ] Dashboard Setup: ✅/❌
- [ ] Deep-Link Generation: ✅/❌
- [ ] Auto-Login: ✅/❌
- [ ] Protocol Registration: ✅/❌

**Phase 3 - Session Management:**
- [ ] Session Persistence: ✅/❌
- [ ] Session Expiration: ✅/❌
- [ ] Logout: ✅/❌

**Issues Found:**
- [List any problems or unexpected behavior]

**Overall Status:** ✅ Ready for Production / ❌ Needs Fixes
```

---

## 🚀 Production Deployment Checklist

### Pre-Deployment
- [ ] All tests passed
- [ ] Environment variables configured
- [ ] Privy app ID updated for production
- [ ] Code signing certificates ready (for distribution)
- [ ] Auto-updater configured (if applicable)

### Distribution
- [ ] Upload packages to distribution channels
- [ ] Update website download links
- [ ] Test downloads from production URLs
- [ ] Verify protocol registration works from downloads

### Monitoring
- [ ] Error tracking configured
- [ ] Analytics configured
- [ ] User feedback channels ready
- [ ] Support documentation updated

---

**📞 Need Help?**
- Check logs first
- Review error messages carefully  
- Test with different auth methods
- Verify dashboard connectivity
- Check protocol registration status