"use client";

import { NativeSettings, IOSSettings } from "capacitor-native-settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * バックグラウンドGPS追跡の開始時、または位置情報エラー時に、iOSの
 * 「常に許可」設定への切り替えを案内するモーダル。
 *
 * iOSは一度「Appの使用中のみ許可」で承認されると、アプリ側から再度
 * 「常に許可」ダイアログを出すことができない(設定アプリへの遷移が必要)ため、
 * 説明とワンタップでの設定画面への導線をセットで提供する。
 */
export default function AlwaysLocationPermissionModal({ open, onClose }: Props) {
  if (!open) return null;

  async function handleOpenSettings() {
    try {
      // capacitor-native-settingsはiOSでは「アプリの設定画面」しか
      // 開くことができない(Appleの制約)ため、IOSSettings.Appを指定する。
      await NativeSettings.openIOS({ option: IOSSettings.App });
    } catch (error) {
      console.warn("[Settings Error] 設定画面を開けませんでした:", error);
    } finally {
      onClose();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-sm w-full pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">📍</span>
              <h2 className="font-bold text-lg text-gray-900 leading-tight">
                位置情報の「常に許可」が必要です
              </h2>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed">
              スリープ中やバックグラウンドでの移動経路を記録するには、位置情報の「常に許可」が必要です。
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleOpenSettings}
                className="w-full text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-3 transition-colors font-medium"
              >
                設定画面を開く
              </button>
              <button
                onClick={onClose}
                className="w-full text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-3 transition-colors font-medium"
              >
                あとで設定する
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
