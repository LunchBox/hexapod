# 步態生成重構 — 設計規格

## 目標

以系統化的遍歷替換當前 `GaitController` 的位元遮罩列舉方法，按 **k = 同時抬起的腿數** 組織，並進行正確的循環旋轉去重。

## 當前狀態

`GaitController` 建構函式（gaits.ts:198-353）使用：
1. `2^N` 位元遮罩迴圈找出所有有效的「階段」（通過 `phaseValid` 的抬起腿部子集）
2. 遞迴精確覆蓋搜尋（`findCovers`）以分區所有腿部
3. 基於全域排序的去重（對每個覆蓋內的組排序，按第一個元素對覆蓋排序）

問題：去重對組進行全域排序，丟失了順序 — `[[0,1],[2,3],[4,5]]` 和 `[[2,3],[0,1],[4,5]]` 崩潰為相同的鍵，儘管它們是不同的執行順序。

## 新方法

### 演算法（方法 A：生成全部 + 規範去重）

對於每個 k 從 1 到 N-2（至少 2 條腿著地）：

1. **確定循環參數：**
   - `liftsPerLeg = lcm(N, k) / N` — 每條腿在一個循環中抬起的次數
   - `numSteps = lcm(N, k) / k` — 一個循環中的步數

2. **回溯生成：**
   - 追蹤每腿使用次數（每條腿最多出現 `liftsPerLeg` 次）
   - 每一步從剩餘可用腿中選擇 `k` 條腿（使用 k-組合）
   - 通過 `isValidPhase` 過濾：在未抬起的腿中，左右兩側必須都有代表（或存在中心腿）
   - 最後一步驗證所有腿部計數 == `liftsPerLeg`

3. **循環去重：**
   - `toCanonical(gait)`：旋轉使包含腿 0 的組位於第一位
   - `canonicalKey(gait)`：組內排序，組間用 `|` 連接
   - 使用 `Map<string, Gait>` 去重

### 命名

| k | 前綴 | 數量（N=6） |
|---|------|-------------|
| 1 | wave   | 120 |
| 2 | ripple | 30  |
| 3 | tripod | 10  |
| 4 | quad   | 30  |

每種類型的第一個步態使用裸前綴（如 `"tripod"`），後續的附加 `-{index}`（如 `"tripod-2"`、`"tripod-3"`）。這保留了向後相容性 — 引用 `"tripod"` 或 `"wave"` 的現有設定繼續有效。

### 階段有效性（與當前保持不變）

函式 `isValidPhase(lifted, leftLegs, rightLegs, centerLeg)`：
- 計算著地腿部（未抬起）
- 必須有 >= 2 條腿著地
- 必須至少有 1 條左腿和 1 條右腿著地，或有中心腿著地

## 變更的檔案

### 新增：`src/hexapod/gait_generator.ts`

純函式，無副作用：
- `generateAllGaits(n, leftLegs, rightLegs, centerLeg): Record<string, Gait[]>`
- `generateForK(n, k, leftLegs, rightLegs, centerLeg): Gait[]`
- `isValidPhase(lifted, leftLegs, rightLegs, centerLeg): boolean`
- `toCanonical(gait): Gait`
- `canonicalKey(gait): string`

型別：
- `Group = number[]` — 一步中同時抬起的腿
- `Gait = Group[]` — 有序的組序列（一個循環）

### 修改：`src/hexapod/gaits.ts`

- 從 `GaitController` 建構函式中移除內聯位元遮罩列舉和 `findCovers`
- 改為調用 `generateAllGaits()`
- `this.gaits` 保持 `Record<string, number[][]>`（向後相容）

### 修改：`src/components/ControlPanel.tsx`

- 步態選擇器 UI：按 k 分組（wave/ripple/tripod/quad）並附帶子編號
- 下拉選單或兩級選擇

### 修改：`src/hexapod/defaults.ts`

- 預設 `gait` 值可能需要更新到新的命名方案（如 `"tripod"` → `"tripod-1"` 或保留第一個 tripod 為 `"tripod"`）

## 不變更的部分

- `GaitAction`、`GaitMove`、`GaitStandby`、`GaitPutdownTips`、`GaitInternal` — 執行層保持不變
- `GaitController.act()`、`fire_action()`、`next_leg_group()`、`switch_gait()` — 全部不變
- `Hexapod`、`HexapodLeg` — 不變
- 實際移動邏輯（legs_up/down/move、body_move）— 不變
