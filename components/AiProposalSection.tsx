"use client";

import { useState } from "react";
import type { Pin, AiProposal } from "@/lib/pins";
import Toast, { type ToastState } from "./Toast";

interface ShootingSuggestion {
  position: string;
  direction: string;
  reason: string;
}

interface BroadcastLocationSuggestion {
  recommended: {
    name: string;
    lat: number;
    lng: number;
    reason: string;
    iconType: "angle" | "parking";
  };
  alternative: {
    name: string;
    lat: number;
    lng: number;
    reason: string;
    iconType: "angle" | "parking";
  };
  parking: {
    name: string;
    lat: number;
    lng: number;
    reason: string;
    iconType: "angle" | "parking";
  };
}

export default function AiProposalSection({ pin }: { pin: Pin }) {
  const [expandedSection, setExpandedSection] = useState<
    "shooting" | "locations" | "summary" | null
  >(null);
  const [generatingType, setGeneratingType] = useState<
    "shooting" | "locations" | "summary" | null
  >(null);
  const [toast, setToast] = useState<ToastState>(null);
  const aiProposal = pin.aiProposal;

  async function generateProposal(type: "shooting" | "locations" | "summary") {
    setGeneratingType(type);
    try {
      let endpoint = "";
      let requestBody: Record<string, unknown> = { pinId: pin.id };

      if (type === "shooting") {
        endpoint = "/api/suggest-shooting";
        requestBody = {
          ...requestBody,
          name: pin.name,
          address: pin.address,
          osmFeatures: [],
          wikiSummary: "",
        };
      } else if (type === "locations") {
        endpoint = "/api/suggest-locations";
        requestBody = {
          ...requestBody,
          candidates: [],
          incidentType: "",
          address: pin.address,
        };
      } else if (type === "summary") {
        endpoint = "/api/generate-pin-summary";
        requestBody = {
          ...requestBody,
          locationName: pin.name,
          address: pin.address,
          records: [
            {
              date: new Date().toISOString(),
              incidentType: "",
              parkingInfo: pin.parkingInfo,
              shootingSpots: pin.shootingSpots,
              ipTransmissionInfo: pin.ipTransmissionInfo,
              fpuInfo: pin.fpuInfo,
              hazards: pin.hazards,
              notes: [],
            },
          ],
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "生成に失敗しました");
      }

      const data = await res.json();
      setToast({
        type: "success",
        message: `${type === "shooting" ? "撮影ポジション" : type === "locations" ? "放送位置" : "現場記録"}の提案を生成しました`,
      });
      // UI更新のため、ページリロードまたは状態更新が必要
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "提案の生成に失敗しました";
      console.error("提案生成エラー:", err);
      setToast({ type: "error", message: errorMessage });
    } finally {
      setGeneratingType(null);
    }
  }

  const hasShootingProposal = aiProposal?.content?.shootingPositions;
  const hasLocationProposal = aiProposal?.content?.broadcastLocations;
  const hasSummaryProposal = aiProposal?.content?.pinSummary;

  if (!hasShootingProposal && !hasLocationProposal && !hasSummaryProposal) {
    return (
      <div className="space-y-2">
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <div className="text-sm font-semibold">AI提案</div>
        <div className="space-y-2">
          <button
            onClick={() => generateProposal("shooting")}
            disabled={generatingType !== null}
            className="w-full text-sm border border-blue-300 text-blue-600 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
          >
            {generatingType === "shooting" ? "撮影ポジション提案を生成中..." : "撮影ポジション提案を生成"}
          </button>
          <button
            onClick={() => generateProposal("locations")}
            disabled={generatingType !== null}
            className="w-full text-sm border border-blue-300 text-blue-600 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
          >
            {generatingType === "locations" ? "放送位置提案を生成中..." : "放送位置提案を生成"}
          </button>
          <button
            onClick={() => generateProposal("summary")}
            disabled={generatingType !== null}
            className="w-full text-sm border border-blue-300 text-blue-600 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
          >
            {generatingType === "summary" ? "現場記録提案を生成中..." : "現場記録提案を生成"}
          </button>
        </div>
      </div>
    );
  }

  const generatedDate = aiProposal?.generatedAt
    ? typeof (aiProposal.generatedAt as any).toDate === "function"
      ? (aiProposal.generatedAt as any).toDate().toLocaleDateString("ja-JP")
      : new Date(aiProposal.generatedAt as any).toLocaleDateString("ja-JP")
    : "不明";

  return (
    <div className="space-y-3">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="text-sm font-semibold">AI提案 (生成日: {generatedDate})</div>

      {hasShootingProposal && (
        <div className="border border-gray-200 rounded-lg p-3">
          <button
            onClick={() =>
              setExpandedSection(
                expandedSection === "shooting" ? null : "shooting"
              )
            }
            className="w-full text-left flex justify-between items-center hover:bg-gray-50 p-1 rounded transition-colors"
          >
            <span className="text-sm font-medium">撮影ポジション提案</span>
            <span className="text-xs text-gray-500">
              {expandedSection === "shooting" ? "▼" : "▶"}
            </span>
          </button>
          {expandedSection === "shooting" && (
            <div className="mt-2 space-y-2 pt-2 border-t border-gray-100">
              {(hasShootingProposal as ShootingSuggestion[]).map(
                (suggestion, idx) => (
                  <div key={idx} className="text-xs">
                    <p className="font-medium text-gray-700">
                      提案 {idx + 1}: {suggestion.position}
                    </p>
                    <p className="text-gray-600">方向: {suggestion.direction}</p>
                    <p className="text-gray-600">理由: {suggestion.reason}</p>
                  </div>
                )
              )}
            </div>
          )}
          <button
            onClick={() => generateProposal("shooting")}
            disabled={generatingType !== null}
            className="mt-2 w-full text-xs border border-gray-300 text-gray-600 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generatingType === "shooting" ? "再生成中..." : "再生成"}
          </button>
        </div>
      )}

      {hasLocationProposal && (
        <div className="border border-gray-200 rounded-lg p-3">
          <button
            onClick={() =>
              setExpandedSection(
                expandedSection === "locations" ? null : "locations"
              )
            }
            className="w-full text-left flex justify-between items-center hover:bg-gray-50 p-1 rounded transition-colors"
          >
            <span className="text-sm font-medium">放送位置提案</span>
            <span className="text-xs text-gray-500">
              {expandedSection === "locations" ? "▼" : "▶"}
            </span>
          </button>
          {expandedSection === "locations" && (
            <div className="mt-2 space-y-2 pt-2 border-t border-gray-100">
              {(hasLocationProposal as BroadcastLocationSuggestion) && (
                <>
                  <div className="text-xs">
                    <p className="font-medium text-gray-700">推奨: {(hasLocationProposal as BroadcastLocationSuggestion).recommended.name}</p>
                    <p className="text-gray-600">
                      {(hasLocationProposal as BroadcastLocationSuggestion).recommended.reason}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-gray-700">
                      代替: {(hasLocationProposal as BroadcastLocationSuggestion).alternative.name}
                    </p>
                    <p className="text-gray-600">
                      {(hasLocationProposal as BroadcastLocationSuggestion).alternative.reason}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-gray-700">
                      駐車: {(hasLocationProposal as BroadcastLocationSuggestion).parking.name}
                    </p>
                    <p className="text-gray-600">
                      {(hasLocationProposal as BroadcastLocationSuggestion).parking.reason}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => generateProposal("locations")}
            disabled={generatingType !== null}
            className="mt-2 w-full text-xs border border-gray-300 text-gray-600 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generatingType === "locations" ? "再生成中..." : "再生成"}
          </button>
        </div>
      )}

      {hasSummaryProposal && (
        <div className="border border-gray-200 rounded-lg p-3">
          <button
            onClick={() =>
              setExpandedSection(expandedSection === "summary" ? null : "summary")
            }
            className="w-full text-left flex justify-between items-center hover:bg-gray-50 p-1 rounded transition-colors"
          >
            <span className="text-sm font-medium">現場記録提案</span>
            <span className="text-xs text-gray-500">
              {expandedSection === "summary" ? "▼" : "▶"}
            </span>
          </button>
          {expandedSection === "summary" && (
            <div className="mt-2 space-y-2 pt-2 border-t border-gray-100">
              {Object.entries(
                hasSummaryProposal as Record<string, string>
              ).map(([key, value]) => {
                const labels: Record<string, string> = {
                  parkingInfo: "駐車場所",
                  shootingSpots: "撮影ポイント",
                  ipTransmissionInfo: "携帯回線(IP伝送)",
                  fpuInfo: "FPU伝送",
                  hazards: "危険箇所・注意事項",
                };
                return (
                  <div key={key} className="text-xs">
                    <p className="font-medium text-gray-700">
                      {labels[key] || key}
                    </p>
                    <p className="text-gray-600 whitespace-pre-wrap">{value}</p>
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => generateProposal("summary")}
            disabled={generatingType !== null}
            className="mt-2 w-full text-xs border border-gray-300 text-gray-600 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generatingType === "summary" ? "再生成中..." : "再生成"}
          </button>
        </div>
      )}
    </div>
  );
}
