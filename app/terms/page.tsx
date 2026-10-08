// 「ここトレ！」利用規約。静的エクスポート(Capacitor)で配信するため、サーバー機能は使わない。
import Link from "next/link";

export const metadata = { title: "利用規約 | ここトレ！" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "第1条(適用)",
    body: ["本規約は、「ここトレ！」(以下「本アプリ」)の利用に関する条件を定めるものです。ユーザーは本規約に同意のうえ本アプリを利用するものとします。"],
  },
  {
    title: "第2条(禁止事項)",
    body: [
      "ユーザーは、以下の行為を行ってはなりません。",
      "・わいせつ、暴力的、差別的、その他不適切なコンテンツの投稿",
      "・他のユーザーや第三者への嫌がらせ、誹謗中傷、迷惑行為、スパム行為",
      "・他者の著作権・肖像権・プライバシー等の権利を侵害する投稿",
      "・立入禁止区域への侵入を助長する情報など、法令または公序良俗に反する投稿",
      "・その他、運営が不適切と判断する行為",
    ],
  },
  {
    title: "第3条(不適切なコンテンツへの対応)",
    body: [
      "本アプリでは、不適切なコンテンツは許容されません。ユーザーは、各投稿から「通報」およびユーザーの「ブロック」を行うことができます。",
      "運営は通報内容を確認のうえ、該当コンテンツの削除、違反したユーザーのアカウント停止その他の措置を、予告なく行うことがあります。",
    ],
  },
  {
    title: "第4条(投稿コンテンツの権利)",
    body: ["投稿された写真・テキストの著作権は投稿者に帰属します。ただし、投稿者は本アプリ上での表示・配信に必要な範囲で運営が利用することを許諾するものとします。"],
  },
  {
    title: "第5条(免責)",
    body: ["本アプリの情報(撮影スポット、駐車場・周辺情報等)の正確性は保証されません。現地の規則・マナーを守り、自己責任でご利用ください。"],
  },
  {
    title: "第6条(規約の変更)",
    body: ["運営は、必要に応じて本規約を変更できるものとします。変更後に本アプリを利用した場合、変更に同意したものとみなします。"],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-xl font-bold text-gray-900">ここトレ！ 利用規約</h1>
        <p className="text-sm font-semibold text-red-600">
          不適切なコンテンツの投稿や他者への嫌がらせ行為は禁止です。違反した場合は、投稿の削除やアカウント停止等の措置を行います。
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title} className="space-y-1">
            <h2 className="font-semibold text-gray-900">{s.title}</h2>
            {s.body.map((line) => (
              <p key={line} className="text-sm text-gray-700 leading-relaxed">
                {line}
              </p>
            ))}
          </section>
        ))}
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-orange-600 hover:underline">← ホームへ戻る</Link>
          <Link href="/support" className="text-orange-600 hover:underline">サポート</Link>
        </div>
      </div>
    </div>
  );
}
