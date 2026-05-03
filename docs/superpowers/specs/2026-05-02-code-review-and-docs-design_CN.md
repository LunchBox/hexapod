# 代碼審查與文檔更新 — 設計規格

**日期：** 2026-05-02
**狀態：** 已批准

## 目標

對整個 hexapod 代碼庫進行全面代碼審查，修復發現的具體 bug，並將文檔更新至最新狀態。

## 方法

**方法 2：報告 → 修復 → 更新文檔** — 先撰寫完整的審查報告作為完整目錄，然後修復 bug，最後更新文檔以反映修復後的狀態。

## 交付物

### 1. 代碼審查報告（`docs/code-review-2026-05-02.md`）

包含嚴重性評級的完整發現目錄：

| 章節 | 內容 |
|---|---|
| 執行摘要 | 2-3 句專案健康概覽 |
| 發現的 Bug | `clearInterval`/`clearTimeout` 混用、循環依賴、拼寫錯誤的匯出、`slice()` 混淆 |
| 架構問題 | 雙重 React+DOM 狀態、模組級單例、過大的類別 |
| 代碼品質 | `any` 使用、混合命名、無效匯出、缺少錯誤處理、context 缺少 `useMemo` |
| 無障礙性 | `<a href="#">` 作為按鈕、無 ARIA、僅 canvas 互動 |
| 文檔缺口 | 無 JSDoc、無 TODO 標記、無測試套件 |
| 建議 | 含工作量估計的優先級列表 |

### 2. Bug 修復

四個具體 bug（在報告撰寫後修復）：

1. **對 `setTimeout` 結果使用 `clearInterval`** — `gaits.ts`：`clearInterval` 應為 `clearTimeout`
2. **循環依賴** — `hexapod.ts` ↔ `history.ts`：內聯匯入或提取共享介面
3. **拼寫錯誤的匯出** — `utils.ts`：`degree_to_redius` → `degree_to_radians`（保留舊名稱作為別名）
4. **令人困惑的 `slice()` 調用** — `hexapod.ts`：澄清 `draw_time_interval` slice 參數

### 3. 文檔更新

**README.md：**
- 架構圖 — 反映 React + context + 模組結構
- 專案結構 — 新增缺失檔案（gait_generator.ts、gait_configs.ts、SliderColumn、AttrSlider、LegEditor）
- 指令 — 新增 `npm run lint`、`npm run preview`
- Three.js 版本 — 修正 "pre-r69" → "revision 72"

**CLAUDE.md：**
- 專案結構 — 新增缺失檔案
- 架構 — 提及 gait_generator.ts、型別宣告目錄

## 範圍邊界

- **範圍內：** 報告、4 個 bug 修復、README + CLAUDE.md 更新
- **範圍外：** 重構過大的類別、新增 TypeScript strict 模式、新增測試、無障礙性改造、移除 `any` 使用、重新命名慣例 — 這些僅記錄為建議
