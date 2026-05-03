# 步態生成重構 — 實作計劃

> **給 agentic 工作者：** 必要子技能：使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 來逐任務實作此計劃。步驟使用核取方塊（`- [ ]`）語法進行追蹤。

**目標：** 以系統化的 k-legs-lifted 遍歷替換 GaitController 中的 2^N 位元遮罩步態列舉，並正確去重循環旋轉。

**架構：** 新的純函式模組 `gait_generator.ts` 處理所有組合生成和去重。`GaitController` 建構函式調用它而非內聯位元遮罩邏輯。執行層（GaitAction、GaitMove 等）不變。

**技術堆疊：** TypeScript、Three.js（r72）、React + Vite

---

### 任務 1：建立 `src/hexapod/gait_generator.ts` — 純生成邏輯

**檔案：**
- 建立：`src/hexapod/gait_generator.ts`

- [ ] **步驟 1：撰寫包含所有生成函式的檔案**

```typescript
// ── 型別 ───────────────────────────────────────────────────────

export type Group = number[];
export type Gait = Group[];

// ── 數學輔助 ────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return Math.abs(a);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

// ── 組合生成器 ────────────────────────────────────────────────

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  if (arr.length < k) return;
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// ── 階段有效性 ──────────────────────────────────────────────

function isValidPhase(
  lifted: Set<number>,
  allLegs: number[],
  leftLegs: Set<number>,
  rightLegs: Set<number>,
  centerLeg: number | null,
): boolean {
  const groundLegs = allLegs.filter(l => !lifted.has(l));
  if (groundLegs.length < 2) return false;

  let rG = 0, lG = 0, cG = 0;
  for (const l of groundLegs) {
    if (rightLegs.has(l)) rG++;
    else if (leftLegs.has(l)) lG++;
    else if (l === centerLeg) cG = 1;
  }
  return (rG > 0 && lG > 0) || cG > 0;
}

// ── 循環規範形式 ───────────────────────────────────────────────

function toCanonical(gait: Gait): Gait {
  const idx = gait.findIndex(g => g.includes(0));
  if (idx <= 0) return gait;
  return [...gait.slice(idx), ...gait.slice(0, idx)];
}

function canonicalKey(gait: Gait): string {
  return gait.map(g => [...g].sort((a, b) => a - b).join(',')).join('|');
}

// ── 命名 ──────────────────────────────────────────────────────

const K_PREFIXES: Record<number, string> = {
  1: 'wave',
  2: 'ripple',
  3: 'tripod',
  4: 'quad',
};

function gaitName(k: number, index: number): string {
  const prefix = K_PREFIXES[k] || `k${k}`;
  return index === 0 ? prefix : `${prefix}-${index + 1}`;
}

// ── 主要：為給定 k 生成所有步態 ──────────────────────────────

export function generateForK(
  n: number,
  k: number,
  leftLegs: Set<number>,
  rightLegs: Set<number>,
  centerLeg: number | null,
): Gait[] {
  const liftsPerLeg = lcm(n, k) / n;
  const numSteps = lcm(n, k) / k;
  const allLegs = Array.from({ length: n }, (_, i) => i);

  const allSequences: Gait[] = [];
  const legCounts = new Array(n).fill(0);

  function backtrack(current: Gait) {
    const stepIdx = current.length;
    if (stepIdx === numSteps) {
      if (legCounts.every(c => c === liftsPerLeg)) {
        allSequences.push(current.map(g => [...g]));
      }
      return;
    }

    // 可用腿部：剩餘次數未滿的
    const available = allLegs.filter(l => legCounts[l] < liftsPerLeg);
    if (available.length < k) return;

    // 剪枝：剩餘步數中必須選擇以達到目標的腿
    const stepsLeft = numSteps - stepIdx;
    const forced = available.filter(l => legCounts[l] + stepsLeft === liftsPerLeg);

    for (const combo of combinations(available, k)) {
      // 必須包含所有強制腿
      if (forced.some(l => !combo.includes(l))) continue;

      const liftedSet = new Set(combo);
      if (!isValidPhase(liftedSet, allLegs, leftLegs, rightLegs, centerLeg)) continue;

      for (const l of combo) legCounts[l]++;
      current.push(combo);

      backtrack(current);

      current.pop();
      for (const l of combo) legCounts[l]--;
    }
  }

  backtrack([]);

  // 去重循環旋轉
  const unique = new Map<string, Gait>();
  for (const gait of allSequences) {
    const canonical = toCanonical(gait);
    const key = canonicalKey(canonical);
    if (!unique.has(key)) {
      unique.set(key, canonical);
    }
  }

  return Array.from(unique.values());
}

// ── 主要：為所有 k 生成所有步態 ──────────────────────────────

export function generateAllGaits(
  n: number,
  leftLegs: number[],
  rightLegs: number[],
  centerLeg: number | null,
): Record<string, Gait> {
  const leftSet = new Set(leftLegs);
  const rightSet = new Set(rightLegs);
  const allGaits: Record<string, Gait> = {};

  for (let k = 1; k <= n - 2; k++) {
    const gaits = generateForK(n, k, leftSet, rightSet, centerLeg);
    gaits.forEach((gait, idx) => {
      allGaits[gaitName(k, idx)] = gait;
    });
  }

  // 安全措施：始終產生至少一個步態
  if (Object.keys(allGaits).length === 0) {
    allGaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
  }

  return allGaits;
}
```

- [ ] **步驟 2：驗證檔案可編譯**

```bash
npx tsc --noEmit src/hexapod/gait_generator.ts
```

預期：無型別錯誤。

- [ ] **步驟 3：提交**

```bash
git add src/hexapod/gait_generator.ts
git commit -m "feat: add gait_generator with k-legs-lifted traversal and cyclic dedup

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### 任務 2：修改 `GaitController` 建構函式以使用生成器

**檔案：**
- 修改：`src/hexapod/gaits.ts:238-324`

- [ ] **步驟 1：在 gaits.ts 頂部新增匯入**

```typescript
import { generateAllGaits } from './gait_generator.js';
```

在現有匯入區塊之後新增（第 5 行之後）。

- [ ] **步驟 2：替換 GaitController 建構函式中的步態生成區塊**

將第 238-313 行（從 `// ── 2^N model...` 區塊開始到 `this.gaits = gaits;` 之前的步態命名迴圈結束）替換為：

```typescript
    // 生成所有有效的步態階段序列，按同時抬起腿數分組，
    // 並進行循環旋轉去重（規範形式：包含腿 0 的組為第一組）。
    this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);
```

這意味著：
- 移除第 238-313 行（整個 `phaseValid` 函式、`validPhases` 位元遮罩迴圈、`findCovers` 函式和調用、`seen`/`uniqueCovers` 去重、`gaits` 命名迴圈）
- 保留第 315 行（`this.gaits = gaits;`）— 但改為上述新調用

編輯後的建構函式流程應為：
1. 第 198-237 行：腿部分類（不變）
2. 新行：`this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);`
3. 第 315-353 行：從選項恢復步態、備選、動作設定（全部不變）

舊行號在刪除後會偏移。驗證編輯後建構函式顯示為：

```
    this.gaits = generateAllGaits(n, leftLegs, rightLegs, centerLeg);

    // 從選項恢復步態，備選第一個可用步態
    let gaitName = this.bot.options.gait || 'tripod';
    this.leg_groups = this.gaits[gaitName] || Object.values(this.gaits)[0];
    // 安全措施：如果完全沒有步態（不應發生），建立基本 wave
    if (!this.leg_groups) {
      this.gaits['wave'] = Array.from({ length: n }, (_, i) => [i]);
      this.leg_groups = this.gaits['wave'];
    }
```

- [ ] **步驟 3：驗證 TypeScript 編譯**

```bash
npx tsc --noEmit
```

預期：無型別錯誤。

- [ ] **步驟 4：在開發伺服器中測試**

```bash
npm run dev
```

在瀏覽器中開啟 `http://localhost:3000`。驗證：
- Hexapod 渲染
- 步態按鈕出現（按 k 分組，使用新命名）
- 切換步態正常（tripod、wave、ripple 變體）
- 步態生成沒有主控台錯誤

- [ ] **步驟 5：提交**

```bash
git add src/hexapod/gaits.ts
git commit -m "refactor: replace bitmask gait enum with gait_generator in GaitController

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### 任務 3：更新 ControlPanel 步態選擇器 UI

**檔案：**
- 修改：`src/components/ControlPanel.tsx`

當前 UI 將所有步態名稱渲染為扁平按鈕。190 個步態時，改為使用帶有按 k 分組的 `<optgroup>` 元素的 `<select>`。

- [ ] **步驟 1：以 k 分組版本替換 `getGaitList`**

替換第 27-31 行：

```typescript
function getGaitList(bot: any) {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  return Object.keys(gc.gaits).map(k => ({ value: k, label: k }));
}
```

改為：

```typescript
const K_LABELS: Record<string, string> = {
  wave: 'Wave (k=1)',
  ripple: 'Ripple (k=2)',
  tripod: 'Tripod (k=3)',
  quad: 'Quad (k=4)',
};

interface GaitGroup {
  prefix: string;
  label: string;
  gaits: { value: string; label: string }[];
}

function getGaitGroups(bot: any): GaitGroup[] {
  const gc = bot?.gait_controller;
  if (!gc?.gaits) return [];
  const names = Object.keys(gc.gaits);
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const name of names) {
    // 提取 k 前綴："wave" 或 "wave-2" → "wave"
    const prefix = name.match(/^[a-z]+/)![0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push({ value: name, label: name });
  }
  // 按數字後綴排序每個組
  const result: GaitGroup[] = [];
  for (const [prefix, gaits] of groups) {
    gaits.sort((a, b) => {
      const na = parseInt(a.label.match(/\d+$/)?.[0] || '1');
      const nb = parseInt(b.label.match(/\d+$/)?.[0] || '1');
      return na - nb;
    });
    result.push({
      prefix,
      label: K_LABELS[prefix] || prefix,
      gaits,
    });
  }
  // 按 k 排序組（wave=1、ripple=2 等）
  const kOrder = ['wave', 'ripple', 'tripod', 'quad'];
  result.sort((a, b) => kOrder.indexOf(a.prefix) - kOrder.indexOf(b.prefix));
  return result;
}
```

- [ ] **步驟 2：將 Gaits fieldset（第 393-405 行）替換為 select+optgroup**

替換：

```jsx
      <fieldset className="btns">
        <legend>Gaits</legend>
        {getGaitList(botRef.current).map((item) => (
          <a
            key={item.value}
            href="#"
            className={`control_btn${gait === item.value ? ' active' : ''}`}
            onClick={(e) => { e.preventDefault(); handleAction('gait_switch', item.value); }}
          >
            {item.label}
          </a>
        ))}
      </fieldset>
```

改為：

```jsx
      <fieldset className="btns">
        <legend>Gaits</legend>
        <select
          value={gait}
          onChange={(e) => { handleAction('gait_switch', e.target.value); }}
          style={{ fontSize: '13px', maxWidth: 220 }}
        >
          {getGaitGroups(botRef.current).map((group) => (
            <optgroup key={group.prefix} label={group.label}>
              {group.gaits.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </fieldset>
```

- [ ] **步驟 3：驗證 TypeScript 編譯**

```bash
npx tsc --noEmit
```

預期：無型別錯誤。

- [ ] **步驟 4：提交**

```bash
git add src/components/ControlPanel.tsx
git commit -m "feat: group gait selector by k with optgroup dropdown

Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>"
```

---

### 任務 4：驗證 AttributesPanel 備選仍正常運作

**檔案：**
- 讀取：`src/components/AttributesPanel.tsx:150-160`

- [ ] **步驟 1：檢查 AttributesPanel 中的步態備選參考**

讀取 `src/components/AttributesPanel.tsx` 約第 157 行。代碼在變更身體形狀或腿數時引用 `bot.gait_controller.gaits[bot.options.gait || 'tripod']` 作為備選檢查。由於我們保留 `'tripod'` 作為第一個 tripod 步態的名稱，此備選保持正確。

如果每個 k 的第一個步態使用裸前綴（`gait_generator.ts` 已經通過 `gaitName` 函式做到），則無需變更。

- [ ] **步驟 2：驗證 ControlPanel.tsx 第 174、185 行的相同模式**

相同模式 — 備選為 `'tripod'`。無需變更。

- [ ] **步驟 3：提交（如果需要變更）**

如果不需要變更則跳過。

---

### 任務 5：端對端手動驗證

- [ ] **步驟 1：啟動開發伺服器**

```bash
npm run dev
```

- [ ] **步驟 2：驗證步態生成和切換**

在瀏覽器中開啟 `http://localhost:3000`：

1. 檢查 Gaits 下拉選單具有 optgroup：Wave (k=1)、Ripple (k=2)、Tripod (k=3)、Quad (k=4)
2. 選擇 `tripod` — 驗證機器人站立，足部著地
3. 選擇 `wave-2` — 驗證 wave 步態正常（腿一次移動一條）
4. 從每個 k 組中選擇不同步態 — 驗證主控台無錯誤
5. 將腿數改為 4 再改回 — 驗證步態重新生成且 tripod 備選正常
6. 變更身體形狀 — 驗證相同
7. 按下 W/S/A/D 鍵 — 驗證所選步態移動正常

- [ ] **步驟 3：檢查主控台錯誤**

開啟瀏覽器開發者主控台。預期：無錯誤，僅正常日誌訊息（delta fire time、delta act time 等）

---

### 預期結果（N=6）

| k | 前綴 | 每循環步數 | 唯一步態 | 每腿每循環抬起次數 |
|---|------|----------|---------|-----------------|
| 1 | wave   | 6 | 120 | 1 |
| 2 | ripple | 3 | 30  | 1 |
| 3 | tripod | 2 | 10  | 1 |
| 4 | quad   | 3 | 30  | 2 |
