import { useTranslation } from "react-i18next";
import { getAppMode } from "./mode";

// モード対応の翻訳フック。花火モードでは "hanabi.<key>" を優先し、
// 無ければ通常キーへフォールバックする（上書きしたい文言だけ hanabi.* に置けばよい）。
export function useModeT() {
  const { t, ...rest } = useTranslation();
  const mt = ((key: string, opts?: Record<string, unknown>) =>
    getAppMode() === "hanabi" ? t([`hanabi.${key}`, key] as never, opts as never) : t(key as never, opts as never)) as typeof t;
  return { t: mt, ...rest };
}
