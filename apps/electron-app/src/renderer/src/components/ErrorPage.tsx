import { useState, useEffect, useMemo } from "react";
import { WifiOff, AlertCircle, Globe, Sparkles } from "lucide-react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ErrorPage");

interface SiteData {
  url: string;
  title: string;
  visitCount: number;
  favicon?: string;
}

interface ErrorPageProps {
  errorType: "network" | "dns" | "timeout" | "not-found" | "server-error";
  url?: string;
}

export function ErrorPage({ errorType, url }: ErrorPageProps) {
  const [topSites, setTopSites] = useState<SiteData[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Fetch top visited sites from profile service
  useEffect(() => {
    const fetchTopSites = async () => {
      try {
        const result = await window.electron?.ipcRenderer.invoke(
          "profile:get-top-sites",
          3,
        );
        if (result?.success && result.sites) {
          setTopSites(result.sites);
        }
      } catch (error) {
        logger.error("Failed to fetch top sites:", error);
      }
    };

    fetchTopSites();
  }, []);

  // Determine error title and icon based on error type
  const errorConfig = useMemo(() => {
    switch (errorType) {
      case "network":
        return {
          title: "Unable to Connect to the Internet",
          icon: WifiOff,
          showSites: false,
          description: "Check your internet connection and try again",
        };
      case "dns":
      case "not-found":
        return {
          title: "This site can't be reached",
          icon: AlertCircle,
          showSites: true,
          description: url
            ? `${new URL(url).hostname} refused to connect`
            : "The server refused to connect",
        };
      case "timeout":
        return {
          title: "This site can't be reached",
          icon: Globe,
          showSites: true,
          description: url
            ? `${new URL(url).hostname} took too long to respond`
            : "The server took too long to respond",
        };
      case "server-error":
        return {
          title: "This site can't be reached",
          icon: AlertCircle,
          showSites: true,
          description: "The server encountered an error",
        };
      default:
        return {
          title: "Something went wrong",
          icon: AlertCircle,
          showSites: true,
          description: "An unexpected error occurred",
        };
    }
  }, [errorType, url]);

  const Icon = errorConfig.icon;

  // Get the site name for the agent card based on hover/selection
  const getAgentCardTitle = () => {
    const targetSite = hoveredCard || selectedCard;
    if (!targetSite || topSites.length < 2) return "Build a Site";

    const site = topSites.find(s => s.url === targetSite);
    if (!site) return "Build a Site";

    // Extract domain name for cleaner display
    try {
      const domain = new URL(site.url).hostname.replace("www.", "");
      const siteName = domain.split(".")[0];
      return `Build ${siteName.charAt(0).toUpperCase() + siteName.slice(1)} Site`;
    } catch {
      return "Build This Site";
    }
  };

  const handleCardClick = (siteUrl: string) => {
    setSelectedCard(siteUrl);
    // Navigate to the site
    window.electron?.ipcRenderer.invoke("navigate-to", siteUrl);
  };

  const handleAgentClick = () => {
    const targetSite = hoveredCard || selectedCard || topSites[0]?.url;
    if (targetSite) {
      window.electron?.ipcRenderer.invoke("open-agent", {
        action: "build-site",
        reference: targetSite,
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
      {/* Error Icon and Title */}
      <div className="text-center mb-8">
        <div className="mb-4">
          {errorConfig.showSites ? (
            <Icon className="w-16 h-16 text-gray-400 mx-auto" />
          ) : (
            // Animated lava lamp effect for no internet
            <div className="relative w-32 h-48 mx-auto">
              <div className="absolute inset-0 bg-gray-300 rounded-full opacity-50">
                <div className="lava-lamp-bubble" />
                <div
                  className="lava-lamp-bubble"
                  style={{ animationDelay: "2s" }}
                />
                <div
                  className="lava-lamp-bubble"
                  style={{ animationDelay: "4s" }}
                />
              </div>
            </div>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">
          {errorConfig.title}
        </h1>
        <p className="text-gray-600">{errorConfig.description}</p>
      </div>

      {/* Hero Cards for Sites */}
      {errorConfig.showSites && topSites.length > 0 && (
        <div className="flex gap-4 mt-8">
          {/* Top 2 visited sites */}
          {topSites.slice(0, 2).map(site => (
            <button
              key={site.url}
              onClick={() => handleCardClick(site.url)}
              onMouseEnter={() => setHoveredCard(site.url)}
              onMouseLeave={() => setHoveredCard(null)}
              className={`
                bg-white rounded-lg p-6 shadow-sm border transition-all
                hover:shadow-md hover:scale-105 cursor-pointer
                ${selectedCard === site.url ? "border-blue-500" : "border-gray-200"}
              `}
              style={{ width: "200px" }}
            >
              <div className="flex flex-col items-center">
                {site.favicon ? (
                  <img
                    src={site.favicon}
                    alt={site.title}
                    className="w-12 h-12 mb-3 rounded"
                  />
                ) : (
                  <Globe className="w-12 h-12 mb-3 text-gray-400" />
                )}
                <h3 className="font-medium text-gray-800 text-center line-clamp-1">
                  {site.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {new URL(site.url).hostname}
                </p>
              </div>
            </button>
          ))}

          {/* Agent Card */}
          <button
            onClick={handleAgentClick}
            className="
              bg-gradient-to-r from-purple-500 to-pink-500 
              rounded-lg p-6 shadow-sm border border-transparent
              transition-all hover:shadow-md hover:scale-105 cursor-pointer
              text-white
            "
            style={{ width: "200px" }}
          >
            <div className="flex flex-col items-center">
              <Sparkles className="w-12 h-12 mb-3" />
              <h3 className="font-medium text-center">{getAgentCardTitle()}</h3>
              <p className="text-sm opacity-90 mt-1">AI Assistant</p>
            </div>
          </button>
        </div>
      )}

      {/* Retry Button */}
      <button
        onClick={() => window.location.reload()}
        className="mt-8 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Try Again
      </button>

      <style>{`
        @keyframes lava-move {
          0% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-20px) scale(1.1);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }

        .lava-lamp-bubble {
          position: absolute;
          background: radial-gradient(circle, #9ca3af 0%, #6b7280 100%);
          border-radius: 50%;
          animation: lava-move 6s ease-in-out infinite;
        }

        .lava-lamp-bubble:nth-child(1) {
          width: 40px;
          height: 40px;
          left: 20%;
          top: 60%;
        }

        .lava-lamp-bubble:nth-child(2) {
          width: 60px;
          height: 60px;
          left: 50%;
          top: 40%;
        }

        .lava-lamp-bubble:nth-child(3) {
          width: 35px;
          height: 35px;
          left: 70%;
          top: 70%;
        }
      `}</style>
    </div>
  );
}
