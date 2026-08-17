import Link from "next/link";
import Logo from "./Logo";

type Props = {
  title: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
};

export default function PageHeader({
  title,
  backHref = "/",
  backLabel = "トップページに戻る",
  action,
}: Props) {
  return (
    <header className="sticky top-0 z-[1000] bg-gray-900 text-white shadow-sm">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex-shrink-0">
            <Logo className="text-white" iconOnly />
          </Link>
          <span className="w-px h-5 bg-gray-700 flex-shrink-0" />
          <Link
            href={backHref}
            className="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition-colors flex-shrink-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <h1 className="font-bold text-white truncate">{title}</h1>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </header>
  );
}
