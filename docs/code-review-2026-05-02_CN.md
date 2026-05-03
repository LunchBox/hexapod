# 代碼審查報告 — JS Hexapod v0.8.0

**日期：** 2026-05-02
**審查者：** Deepseek V4 Pro（自動審查）
**範圍：** 整個代碼庫（82 個檔案，`src/`、`public/`、`legacy/`、docs、設定檔）

---

## 執行摘要

JS Hexapod 代碼庫是一個功能齊全、組織良好的 Three.js 機器人模擬器，React 遷移已完成。核心 IK/步態邏輯健全，元件樹清晰分離。然而，代碼庫背負著顯著的 legacy 包袱：雙重 React+DOM 渲染架構、普遍的 `any` 使用（122 處）、繞過 React 資料流的模組級單例，且缺乏測試覆蓋。發現四個具體 bug，無嚴重問題。專案最能受益於整合 React 狀態管理及逐步啟用 TypeScript strict 模式。

---

## 1. 發現的 Bug

### B1 — 對 `setTimeout` 結果使用 `clearInterval`（中等）

**檔案：** `src/hexapod/gaits.ts:312,325`

```typescript
// 第 312 行
this.action_identify = setTimeout(() => {
  // ...
}, this.bot.options.gait_iteration_delay);

// 第 325 行
clearInterval(this.action_identify);  // BUG：應為 clearTimeout
```

`setTimeout` 回傳 timeout ID；`clearInterval` 預期 interval ID。雖然瀏覽器目前使用相同的 ID 池，但規範不保證此行為，且該調用在語義上是錯誤的。在嚴格環境中可能無法取消。

**修復：** 將 `clearInterval` 改為 `clearTimeout`。

---

### B2 — 循環模組依賴（低）

**檔案：** `src/hexapod/hexapod.ts:11` ↔ `src/hexapod/history.ts:1`

```
hexapod.ts  ──匯入──▶  history.ts
history.ts  ──匯入──▶  hexapod.ts  (set_bot_options)
```

`hexapod.ts` 從 `history.ts` 匯入 `history`，而 `history.ts` 從 `hexapod.ts` 匯入 `set_bot_options`。ES 模組通過 live bindings 處理此情況（匯入解析到尚未評估的模組），因此執行時可運作，但產生了脆弱的初始化順序依賴，並使靜態分析複雜化。

**修復：** 將 `set_bot_options` 移至獨立的共享模組，或通過回呼參數內聯調用。

---

### B3 — 拼寫錯誤的匯出 `degree_to_redius`（低）

**檔案：** `src/hexapod/utils.ts:100`

函式命名為 `degree_to_redius` — "redius" 是 "radians" 的拼寫錯誤。在 `hexapod.ts:8` 中以該名稱匯入並在 4 處調用（`hexapod.ts:1241,1244,1247,1258`）。

**修復：** 重新命名為 `degree_to_radians`，新增向後相容別名 `degree_to_redius` 指向相同函式。

---

### B4 — 令人困惑的 `Array.slice()` 參數（低）

**檔案：** `src/hexapod/hexapod.ts:1114`

```typescript
this.time_interval_stack = this.time_interval_stack.slice(
  this.time_interval_stack.length - max_number,
  max_number
);
```

`slice(begin, end)` 的第二個參數表示「在索引 `end` 之前停止」。此處 `end = max_number`，而意圖顯然是取最後 `max_number` 個元素。實際上這能運作是因為起始索引 `length - max_number` 加上請求的長度 `max_number` 等於 `length`，且 `slice` 會將 `end` 截斷至陣列長度。正確且更清晰的形式是 `slice(-max_number)`，表示「最後 N 個元素」。

**修復：** 替換為 `this.time_interval_stack.slice(-max_number)`。

---

## 2. 架構問題

### A1 — 雙重 React + DOM 渲染

`Hexapod` 類別通過 `innerHTML` 操作和 Canvas2D 繪製直接寫入 DOM 元素（`#servo_values`、`#on_servo_values`、`#status_history`、`#chart`）。React 元件（`CommandDisplay`、`TimeChart`、`StatusPanel`）然後讀取這些 DOM 元素以同步回 React 狀態。這建立了雙向資料流，其中 DOM 是某些狀態的資料來源，React 則是其他狀態的來源。

**影響：** 使 UI 無法在瀏覽器外進行測試；使資料流推理複雜化；阻止 SSR 或基於 React 的測試。

**改善路徑：** 將 `Hexapod.after_status_change()` 轉換為調用回呼以直接更新 React 狀態，而非寫入 DOM。DOM 目標元素可以改為從 props/context 渲染的純 React 元件。

### A2 — 模組級可變單例

`appState`（`src/hexapod/appState.ts`）和 `history`（`src/hexapod/history.ts`）是模組級可變物件，在整個代碼庫中被自由匯入和修改。這在功能上等同於全域變數，使資料流無法追蹤。

**影響：** 任何模組都可以隨時修改共享狀態；直接修改不會觸發 React 重新渲染；難以撰寫隔離測試。

### A3 — 過大的類別

| 類別/元件 | 檔案 | 行數 |
|---|---|---|
| `Hexapod` | `src/hexapod/hexapod.ts` | ~930（僅類別） |
| `ControlPanel` | `src/components/ControlPanel.tsx` | 611 |
| `AttributesPanel` | `src/components/AttributesPanel.tsx` | 549 |
| `GaitController` | `src/hexapod/gaits.ts` | ~400（僅控制器） |

`Hexapod` 混合了：3D mesh 建構、逆向運動學、步態編排、WebSocket 通訊、DOM 操作、localStorage 持久化和狀態歷史顯示。`ControlPanel` 混合了：步態選擇、繪製類型、移動模式、鍵盤處理、步驟指令、同步模式、DOF 設定、身體形狀和步態圖渲染器。

### A4 — 每次渲染重新建立 Context value

**檔案：** `src/context/HexapodContext.tsx:30-43`

Context 的 `value` 物件在每次渲染時內聯建立，未使用 `useMemo`，導致提供者每次渲染時所有 9 個消費元件都重新渲染，即使沒有值變更。

---

## 3. 代碼品質

### C1 — `any` 使用：122 處

在 `src/hexapod/` 的 10 個檔案中，共有 122 處使用 `any` 型別。主要違規者：

| 檔案 | `any` 次數 | 範例 |
|---|---|---|
| `hexapod.ts` | ~40 | `this.scene: any`、`this.mesh: any`、`this.legs: any[]` |
| `gaits.ts` | ~30 | `controller: any`，所有 GaitAction 子類別 |
| `utils.ts` | ~15 | 所有函式參數未定型別 |
| `joystick2.ts` | ~8 | 指標事件處理 |

**根本原因：** Three.js r72 函式庫沒有 TypeScript 定義；代碼從 vanilla JS 遷移時未新增中間型別。`types/globals.d.ts` 和 `types/hexapod.d.ts` 檔案存在但僅覆蓋部分。

### C2 — 混合命名慣例

代碼庫同時使用 `snake_case` 和 `camelCase`（約 60%/40% 比例）。同一檔案中的範例：

- `hexapod.ts`：`set_tip_pos`（snake）vs `computeLegLayout`（camel）
- `gaits.ts`：`legs_up`、`active_legs`（snake）vs `fireAction`（camel）

沒有明確的模式決定何處使用哪種風格。

### C3 — 無效或有問題的匯出

| 匯出 | 檔案 | 問題 |
|---|---|---|
| `COXA`、`FEMUR`、`TIBIA`、`TARSUS` | `defaults.ts` | 標記為 deprecated，仍匯出 |
| `RUN_FRAMES` | `defaults.ts` | 設為 `false`，從未切換 |
| `ANIMATE_TIMER` | `defaults.ts` | 設為 `0`，未使用 |
| `logger`（enable/disable） | `utils.ts` | 在 `src/hexapod/` 中從未被匯入 |
| `rotateAroundObjectAxis` | `utils.ts` | 在 `src/hexapod/` 中從未被匯入 |
| `rotateAroundWorldAxis` | `utils.ts` | 在 `src/hexapod/` 中從未被匯入 |
| `sleep` | `utils.ts` | CPU 阻塞忙等待；可能從未被調用 |
| `sceneRef` | `HexapodContext.tsx` | 在 context 中宣告，零消費者 |

### C4 — 缺少錯誤處理

- `PosCalculator.run()` 在未收斂時回傳 `false`，但 `transform_body()` 和 `move_tips()` 中的調用者丟棄了回傳值
- `get_actual_joint_positions()` 對無效腿部回傳 `null`；調用者未檢查
- `localStorage.getItem()` JSON.parse 未包裹在 try/catch 中
- `socket.emit()` 有 `connected` 防護但沒有 try/catch 處理通話中途斷開

### C5 — 基於字串的方法分派

**檔案：** `src/hexapod/gaits.ts` — `GaitAction.run()`

```typescript
(this as any)[step.func]()
```

方法名稱儲存為字串並通過括號表示法以 `as any` 轉型進行分派。這完全繞過了 TypeScript 檢查 — 步驟名稱中的拼寫錯誤將在執行時靜默失敗，沒有編譯錯誤。

### C6 — 硬編碼的 WebSocket URL

**檔案：** `src/hexapod/hexapod.ts` — 建構函式

Socket.IO 客戶端無條件連接到 `http://localhost:8888`。沒有環境變數、設定選項或依賴注入。

---

## 4. 無障礙性

### 所有互動控制項使用 `<a href="#">` 而非 `<button>`

所有元件中的每個可點擊元素都使用帶有 `href="#"` 的錨點標籤。這意味著：
- 無法通過 Space 鍵進行鍵盤啟用（錨點僅回應 Enter）
- 螢幕閱讀器無法將其識別為互動控制項
- 鍵盤導航沒有 `:focus-visible` 樣式

### 無任何 ARIA 屬性

整個代碼庫中不存在任何 `role`、`aria-label`、`aria-expanded`、`aria-selected` 或 `tabindex` 屬性。

### 僅 Canvas 的互動

`LegEditor`（2D 關節編輯器）和三個搖桿 canvas 沒有提供鍵盤或螢幕閱讀器替代方案。無法使用滑鼠或觸控螢幕的使用者無法操作這些控制項。

---

## 5. 文檔缺口

### 任何匯出的函式或類別都沒有 JSDoc

代碼庫中約 50 個匯出的函式/類別都沒有 `@param` 或 `@returns` 註解。

### 沒有 TODO/FIXME/HACK 標記

整個代碼庫中不存在此類註解，儘管存在上述記錄的 bug 和品質問題。技術債務對未來維護者不可見。

### 沒有測試套件

專案完全沒有自動化測試。沒有單元測試、整合測試或端對端測試。`package.json` 中沒有測試腳本。

### tsconfig 中 `strict: false`

TypeScript strict 模式已停用。啟用它將在編譯時捕獲許多與 `any` 相關的問題。

---

## 6. 建議

| 優先級 | 建議 | 工作量 | 影響 |
|---|---|---|---|
| **P0 — 立即修復** | 修復 4 個具體 bug（B1-B4） | 1 小時 | 正確性 |
| **P1 — 短期** | 將 context value 包裹在 `useMemo` 中 | 5 分鐘 | 效能：防止 9 元件重新渲染級聯 |
| **P1 — 短期** | 將 `<a href="#">` 替換為 `<button>` 元素 | 2 小時 | 無障礙性 |
| **P2 — 中期** | 將 `after_status_change()` 轉換為基於回呼的 React 狀態，而非 DOM 寫入 | 1 天 | 架構 |
| **P2 — 中期** | 為公共 API 表面新增 JSDoc（Hexapod、HexapodLeg、GaitController、PosCalculator） | 3 小時 | 可維護性 |
| **P2 — 中期** | 為未立即修復的已知問題新增 TODO 標記 | 30 分鐘 | 可見性 |
| **P3 — 長期** | 拆分 `Hexapod` 類別：提取 DOM 渲染、WebSocket 和狀態歷史 | 3 天 | 可維護性 |
| **P3 — 長期** | 將 `ControlPanel` 拆分為子元件（GaitPicker、StepControls、KeyboardHandler） | 1 天 | 可維護性 |
| **P3 — 長期** | 逐步啟用 TypeScript strict 模式（從 `noImplicitAny: false` 開始，然後收緊） | 持續 | 型別安全 |
| **P3 — 長期** | 為 PosCalculator、步態生成和工具函式新增單元測試 | 1 週 | 回歸防範 |
| **P4 — 未來** | 升級 Three.js 至現代 ES 模組版本，新增 `@types/three` | 重大工作量 | 消除約 100 個 `any` 轉型 |

---

## 7. Bug 修復狀態（後續追蹤，2026-05-03）

本報告中發現的所有 4 個 bug 已修復：

| Bug | 描述 | 狀態 |
|-----|------|------|
| B1 | `gaits.ts` 中對 `setTimeout` 結果使用 `clearInterval` | **已修復** — 替換為 `clearTimeout` |
| B2 | 循環依賴 `hexapod.ts` ↔ `history.ts` | **已修復** — `history.ts` 不再從 `hexapod.ts` 匯入 |
| B3 | `utils.ts` 中拼寫錯誤的匯出 `degree_to_redius` | **已修復** — 重新命名為 `degree_to_radians` 並保留向後相容別名 |
| B4 | `hexapod.ts` 中令人困惑的 `Array.slice()` 參數 | **已修復** — 使用 `slice(-max_number)` |

架構建議（A1–A4）、代碼品質問題（C1–C6）和無障礙性問題仍待處理。
