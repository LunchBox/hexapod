# PosCalculator v2 — 梯度下降 IK 重構

**日期：** 2026-05-02
**狀態：** 已批准

## 目標

通過重構梯度下降逆向運動學求解器（`pos_calculator.ts`）並改善調用者錯誤處理來修復機器人移動期間腿部卡住的問題。零三角函數 — 純數值梯度下降。

## 演算法變更

### 1. 限制取代邊界中斷

**v1：** 如果任何關節超過 `[SERVO_MIN, SERVO_MAX]`，立即跳出 while 迴圈。所有關節停留在部分迭代值。

**v2：** 每次更新後將每個關節限制在邊界內。繼續迭代。

### 2. 追蹤最佳解，退出時回傳最佳值

**v1：** 失敗時（dist > dist_error 或邊界命中），恢復原始值。成功時使用最後的值（四捨五入）。

**v2：** 在所有迭代中追蹤 `bestValues` 和 `bestDist`。始終回傳找到的最佳解，即使達到最大迭代次數。

### 3. 標準動量（無不穩定的回溯）

**v1：** 將梯度累積到 `speeds[i]`，在符號翻轉時使用除以梯度差的回溯。

**v2：** 標準動量：`momentum[i] = beta * momentum[i] + (1 - beta) * gradients[i]`，然後 `values[i] -= lr * momentum[i]`。無回溯公式。

### 4. 自適應步長

**v1：** 有限差分的固定 `step = 20`。

**v2：** 從 30 開始，梯度符號翻轉（檢測到振盪）時乘以 0.85，最小 5。

### 5. 豐富的回傳型別

**v1：** 回傳 `boolean`。

**v2：** 回傳 `{ success: boolean; distance: number; iterations: number; values: number[] }`。

### 6. 調用者錯誤處理

**v1：** 所有調用者忽略回傳值。

**v2：**
- `transform_body`：即使部分收斂也使用回傳值；放寬漂移閾值 2→8
- `move_tips` / `move_body`：失敗時記錄警告，以最佳努力值繼續
- `putdown_tips` / `laydown`：檢查回傳值，失敗時以降級目標重試

## 常數

```
MAX_LOOPS: 200 → 300
INITIAL_STEP: 30
MIN_STEP: 5
LEARNING_RATE: 0.5
MOMENTUM_BETA: 0.8
STEP_DECAY: 0.85
DIST_ERROR: 0.01（不變）
DRIFT_THRESHOLD: 2 → 8（在 transform_body 中）
```

## 變更的檔案

- `src/hexapod/pos_calculator.ts` — `run()` 方法的完整重寫
- `src/hexapod/hexapod.ts` — `set_tip_pos` 回傳型別、`transform_body` 漂移閾值、調用者檢查

## 不可協商

- **禁止三角函數**（`Math.sin`、`Math.cos`、`Math.atan2` 等）用於關節角度或 tip 位置計算
- 僅使用有限差分的梯度下降
- 所有優化為純數值方法
