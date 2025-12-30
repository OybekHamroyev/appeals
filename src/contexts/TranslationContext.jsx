import React, { createContext, useState, useEffect } from "react";

export const TranslationContext = createContext({ lang: "uz", t: (k) => k });

async function loadStrings(lang) {
  try {
    const mod = await import(`../utils/translation/${lang}/strings.json`);
    return mod.default || mod;
  } catch (e) {
    console.warn("translation load failed", lang, e);
    return {};
  }
}

export function TranslationProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "uz");
  const [strings, setStrings] = useState({});

  useEffect(() => {
    let mounted = true;
    loadStrings(lang).then((s) => {
      if (mounted) setStrings(s);
    });
    return () => (mounted = false);
  }, [lang]);

  function t(key) {
    return strings[key] || key;
  }

  return (
    <TranslationContext.Provider value={{ lang, setLang, t }}>
      {children}
    </TranslationContext.Provider>
  );
}
