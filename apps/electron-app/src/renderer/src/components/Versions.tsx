/**
 * Versions component
 * Displays version information for Electron, Chromium, and Node.js
 */

import { useState } from "react";
import "./styles/Versions.css";

/**
 * Component that displays version information
 */
function Versions(): React.JSX.Element {
  // Get version information from the Electron process
  const [versions] = useState(window.vibe.app.getProcessVersions());

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  );
}

export default Versions;
