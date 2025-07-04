# Overlay System Security Guide

## Overview

This document outlines the comprehensive security measures implemented to prevent script injection bugs and ensure the stability of the overlay system.

## Security Measures Implemented

### 1. Script Validation

All scripts are validated before execution using pattern matching:

```typescript
// Dangerous patterns that are blocked:
- eval() and Function() constructors
- document.write() and document.writeln()
- innerHTML/outerHTML assignments with strings
- <script> tags
- javascript: URLs
- Event handlers (onclick, onload, etc.)
- String-based setTimeout/setInterval
```

### 2. Safe Script Execution

Scripts are executed in a controlled environment:

```typescript
// Features:
- Timeout protection (5-second limit)
- Function override protection
- Loop detection
- Error boundary wrapping
- Automatic cleanup
```

### 3. Content Security Policy

The overlay HTML includes strict CSP headers:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self' 'unsafe-inline'; 
               script-src 'self'; 
               style-src 'self' 'unsafe-inline';">
```

### 4. Error Monitoring

Comprehensive error monitoring prevents silent failures:

```typescript
// Monitored events:
- Uncaught JavaScript errors
- Unhandled promise rejections
- Suspicious script execution patterns
- Performance degradation
- Load failures
```

### 5. Graceful Degradation

The system includes fallback mechanisms:

```typescript
// Fallback features:
- Native React dropdown when overlay fails
- Visual error indicators
- Automatic re-enablement
- Keyboard shortcuts for recovery
```

## Best Practices

### 1. Never Use String-Based Script Execution

❌ **DON'T:**
```typescript
window.eval('some code');
new Function('code');
setTimeout('code', 1000);
```

✅ **DO:**
```typescript
// Use function references
setTimeout(() => { /* code */ }, 1000);
// Use message-based communication
window.electronAPI.overlay.send('event', data);
```

### 2. Always Validate Content

❌ **DON'T:**
```typescript
overlay.render({ html: userInput });
```

✅ **DO:**
```typescript
overlay.render({ html: escapeHtml(userInput) });
```

### 3. Use Event Delegation

❌ **DON'T:**
```typescript
// Inline event handlers
<div onclick="handleClick()">
```

✅ **DO:**
```typescript
// Data attributes with event delegation
<div data-suggestion-id="123" data-suggestion-index="0">
```

### 4. Implement Error Boundaries

```typescript
try {
  // Overlay operations
} catch (error) {
  console.error('Overlay error:', error);
  // Fallback to native UI
  setShowFallbackDropdown(true);
}
```

## Error Recovery

### 1. Automatic Recovery

The system automatically:
- Counts errors and disables overlay after 3 failures
- Provides visual indicators of system status
- Allows manual re-enablement

### 2. Manual Recovery

Keyboard shortcuts for debugging:
- `Ctrl+Shift+C`: Force clear overlay
- `Ctrl+Shift+D`: Debug overlay status
- `Ctrl+Shift+R`: Re-enable overlay

### 3. Visual Indicators

- 🔒 Green indicator: Secure overlay active
- ⚠️ Yellow indicator: Warning state
- ❌ Red indicator: Error state

## Testing Security

### 1. Security Test Cases

```typescript
// Test script injection attempts
const maliciousScripts = [
  'eval("alert(1)")',
  '<script>alert(1)</script>',
  'javascript:alert(1)',
  'onclick="alert(1)"',
  'setTimeout("alert(1)", 1000)'
];

maliciousScripts.forEach(script => {
  expect(() => overlay.executeScript(script)).toThrow();
});
```

### 2. Performance Testing

```typescript
// Test for infinite loops
const startTime = Date.now();
overlay.executeScript('while(true){}');
const duration = Date.now() - startTime;
expect(duration).toBeLessThan(5000); // Should timeout
```

## Monitoring and Logging

### 1. Error Logging

All errors are logged with context:
```typescript
logger.error('Overlay error:', {
  type: 'script-execution',
  error: error.message,
  script: script.substring(0, 100), // First 100 chars
  timestamp: Date.now()
});
```

### 2. Performance Monitoring

```typescript
// Monitor render times
if (renderTime > 16) { // Longer than one frame
  logger.warn('Slow overlay render:', renderTime + 'ms');
}
```

## Troubleshooting

### Common Issues

1. **Overlay not showing**
   - Check overlay status: `overlayStatus`
   - Verify error count: `errorCount`
   - Try re-enabling: `reEnableOverlay()`

2. **Script execution errors**
   - Check console for validation errors
   - Verify script doesn't contain blocked patterns
   - Use message-based communication instead

3. **Performance issues**
   - Monitor render times
   - Check for memory leaks
   - Verify content caching is working

### Debug Commands

```typescript
// Debug overlay state
debugOverlay();

// Check if overlay is available
console.log('Overlay available:', isOverlayAvailable);

// Force clear and reset
clearOverlay();
reEnableOverlay();
```

## Future Improvements

1. **Enhanced Validation**
   - AST-based script analysis
   - Semantic pattern detection
   - Machine learning-based threat detection

2. **Better Error Recovery**
   - Automatic script sanitization
   - Intelligent fallback selection
   - User preference learning

3. **Performance Optimization**
   - Virtual DOM for overlay content
   - Incremental updates
   - Background pre-rendering

## Conclusion

The overlay system is designed with security as a primary concern. By following these guidelines and using the provided safety measures, you can prevent script injection bugs and ensure a stable, secure overlay experience.

Remember: **When in doubt, use message-based communication instead of script injection.** 