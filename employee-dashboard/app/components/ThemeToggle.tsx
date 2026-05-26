"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Minimal thin‑stroke SVG icons – sun and moon
const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
  </svg>
);

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  // Load persisted theme on mount
  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light" | "dark" | null) || null;
    const initial = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const applyTheme = (t: "light" | "dark") => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    root.classList.add(t === "light" ? "theme-light" : "theme-dark");
  };

  const toggleTheme = () => {
    if (!theme) return;
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  // Guard against flash before theme is known
  if (!theme) return null;

  // Dimensions for the neumorphic pill switch
const width = 48; // px
const height = 24; // px
const knobSize = 20; // px
const knobOffset = 2; // px padding inside track
const translateX = theme === "light" ? knobOffset : width - knobSize - knobOffset;

  return (
    <button
      onClick={toggleTheme}
      title={`Active theme: ${theme}. Click to toggle.`}
      aria-label="Toggle theme"
      className="fixed top-4 right-4 z-50 flex items-center justify-center"
    >
      <motion.div
        className="relative flex items-center"
        whileHover={{ y: -2 }} // subtle lift on hover
        whileTap={{ scale: 0.96 }} // slight compression on press
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${height / 2}px`,
          background: "var(--surface)",
          boxShadow: `4px 4px 8px rgba(0,0,0,0.12), -4px -4px 8px rgba(255,255,255,0.07)`,
          overflow: "hidden",
        }}
      >
        {/* Knob with icons on top */}
        <motion.div
          className="absolute top-0 left-0"
          style={{
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            borderRadius: "50%",
            background: "var(--background)",
            boxShadow: `2px 2px 5px rgba(0,0,0,0.15), -2px -2px 5px rgba(255,255,255,0.1)`,
          }}
          animate={{ x: translateX }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Sun icon centered on knob */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--accent)" }}
            animate={{
              opacity: theme === "light" ? 1 : 0,
              scale: theme === "light" ? 1 : 0.8,
            }}
            transition={{ duration: 0.25 }}
          >
            <SunIcon />
          </motion.div>
          {/* Moon icon centered on knob */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--accent)" }}
            animate={{
              opacity: theme === "dark" ? 1 : 0,
              scale: theme === "dark" ? 1 : 0.8,
            }}
            transition={{ duration: 0.25 }}
          >
            <MoonIcon />
          </motion.div>
        </motion.div>
      </motion.div>
    </button>
  );
}
