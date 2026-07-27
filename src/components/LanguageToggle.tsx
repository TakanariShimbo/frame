import { useTranslation } from "react-i18next";

// UI言語の切替ボタン。ラベルには「切り替え先」の言語名を表示する（EN画面なら「日本語」）。
export default function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const onClick = () => {
    i18n.changeLanguage(i18n.language === "ja" ? "en" : "ja");
  };

  return (
    <button type="button" className="lang-toggle" onClick={onClick}>
      {t("common.langToggle")}
    </button>
  );
}
