import { createLogger } from "@vibe/shared-types";

const logger = createLogger("persona-animator");

export type PersonaType = "work" | "pure" | "sexy";

interface PersonaConfig {
  color: string;
  className: string;
  name: string;
}

const PERSONA_CONFIGS: Record<PersonaType, PersonaConfig> = {
  work: {
    color: "#3B82F6", // Blue
    className: "persona-work",
    name: "Work",
  },
  pure: {
    color: "#FACC15", // Yellow
    className: "persona-pure",
    name: "Pure",
  },
  sexy: {
    color: "#EF4444", // Red
    className: "persona-sexy",
    name: "Sexy",
  },
};

export class PersonaAnimator {
  private currentPersona: PersonaType = "work";
  private animationInProgress = false;

  constructor() {
    // Listen for persona change events from main process
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on(
        "persona:change",
        (_event, persona: PersonaType) => {
          this.switchPersona(persona);
        },
      );
    }
  }

  /**
   * Switch to a new persona with rainbow animation
   */
  async switchPersona(persona: PersonaType) {
    if (this.animationInProgress || persona === this.currentPersona) {
      return;
    }

    logger.info(`Switching persona from ${this.currentPersona} to ${persona}`);
    this.animationInProgress = true;

    try {
      // Create and animate rainbow ray
      await this.animateRainbowRay();

      // Update current persona
      this.currentPersona = persona;

      // Apply persona glow to active tab
      this.applyPersonaGlow(persona);

      // Broadcast persona change
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send("persona:changed", persona);
      }
    } finally {
      this.animationInProgress = false;
    }
  }

  /**
   * Create and animate the rainbow neon ray
   */
  private async animateRainbowRay(): Promise<void> {
    return new Promise(resolve => {
      // Create rainbow ray element
      const ray = document.createElement("div");
      ray.className = "rainbow-neon-ray";
      document.body.appendChild(ray);

      // Sound removed per user request

      // Remove ray after animation completes
      setTimeout(() => {
        ray.remove();
        resolve();
      }, 1500);
    });
  }

  /**
   * Apply persona glow to active tab only
   */
  private applyPersonaGlow(persona: PersonaType) {
    const config = PERSONA_CONFIGS[persona];

    // First, remove all persona classes from all tabs
    const allTabs = document.querySelectorAll(".chrome-tab");
    allTabs.forEach(tab => {
      Object.values(PERSONA_CONFIGS).forEach(config => {
        tab.classList.remove(config.className);
      });
      tab.classList.remove("persona-glow", "active");
    });

    // Only apply persona styling to the active tab
    const activeTab = document.querySelector(".chrome-tab[active]");
    if (activeTab) {
      // Apply persona class only to active tab
      activeTab.classList.add(config.className);

      // Apply glow with delay for effect
      setTimeout(() => {
        activeTab.classList.add("persona-glow");

        // Activate glow after a brief delay
        setTimeout(() => {
          activeTab.classList.add("active");
        }, 100);
      }, 750); // Start glow midway through rainbow animation
    }
  }

  /**
   * Get current persona
   */
  getCurrentPersona(): PersonaType {
    return this.currentPersona;
  }

  /**
   * Apply persona styling to a tab element
   */
  applyPersonaToTab(tabElement: HTMLElement, persona?: PersonaType) {
    const targetPersona = persona || this.currentPersona;
    const config = PERSONA_CONFIGS[targetPersona];

    // Remove all persona classes
    Object.values(PERSONA_CONFIGS).forEach(config => {
      tabElement.classList.remove(config.className);
    });

    // Apply current persona class
    tabElement.classList.add(config.className);
  }
}

// Create singleton instance
export const personaAnimator = new PersonaAnimator();
