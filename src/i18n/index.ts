import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ja from "./locales/ja";
import en from "./locales/en";

// UIの言語。既定は常に日本語（ブラウザ言語は見ない）で、手動切替のみ localStorage に残す。
i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: "ja",
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
