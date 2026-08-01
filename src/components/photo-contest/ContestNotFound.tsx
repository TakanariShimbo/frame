import AppLink from "./AppLink";
import { useDocumentMeta } from "./useDocumentMeta";

type Props = {
  // データ不備など内部エラー時は true（本番では詳細を出さず、開発時のみコンソールへ）
  isError?: boolean;
};

// 存在しない年度・非公開年度・コンテンツ読み込み失敗時の表示。
export default function ContestNotFound({ isError = false }: Props) {
  useDocumentMeta({
    title: isError ? "エラーが発生しました | YAMA FRAME AWARD" : "ページが見つかりません | YAMA FRAME AWARD",
    noindex: true,
  });
  return (
    <div className="pc-screen pcnf">
      <p className="kicker">{isError ? "ERROR" : "NOT FOUND"}</p>
      <h1 className="pcnf-title">{isError ? "ページを表示できません" : "ページが見つかりません"}</h1>
      <p className="pcnf-desc">
        {isError
          ? "コンテンツの読み込みで問題が発生しました。時間をおいて再度お試しください。"
          : "お探しのコンテストは存在しないか、現在は公開されていません。"}
      </p>
      <AppLink to="/photo-contest" className="pcnf-back">
        PHOTO CONTEST ARCHIVE
        <span className="pca-arrow" aria-hidden />
      </AppLink>
    </div>
  );
}
