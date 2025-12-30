import React, { useContext } from "react";
import { TranslationContext } from "../contexts/TranslationContext";

export default function LanguageSelector({ className }) {
  const { lang, setLang } = useContext(TranslationContext);
  return (
    <select
      className={className || "lang-select"}
      value={lang}
      onChange={(e) => setLang(e.target.value)}
    >
      <option value="uz">UZ</option>
      <option value="ru">RU</option>
      <option value="en">EN</option>
    </select>
  );
}
