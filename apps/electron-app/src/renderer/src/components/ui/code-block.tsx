import React, { useState } from "react";
import classnames from "classnames";

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  inline,
  className,
  children,
  ...props
}) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");

  const handleCopy = () => {
    const text = String(children).replace(/\n$/, "");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return !inline && match ? (
    <div className="code-block-wrapper">
      <pre className={classnames(className, "markdown-code-block")} {...props}>
        <code>{String(children).replace(/\n$/, "")}</code>
      </pre>
      <button
        className="code-copy-button"
        onClick={handleCopy}
        title="Copy code"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  ) : (
    <code className={classnames(className, "text-sm")} {...props}>
      {children}
    </code>
  );
};
