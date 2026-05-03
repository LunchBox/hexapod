# CLAUDE_CN.md

此檔案為 Claude Code 在此 repo 工作時提供指引。中文版本，與 `CLAUDE.md` 內容一致。

## 提交規範

所有 AI 提交必須使用正確的模型署名：

```
Co-Authored-By: Deepseek V4 Pro <noreply@deepseek.com>
```

當前會話使用的模型是 **Deepseek V4 Pro**，非 Claude Opus。如底層模型變更，請更新此行。

## 概述

JS Hexapod — 基於 Three.js 的 3D 六足機器人模擬器，可通過 Socket.IO 控制實體機器人。原為 vanilla JS（備份於 `legacy/`），現已遷移至 **React + Vite**。舊版 revision 72 Three.js 通過 `<script>` 標籤以全域變數載入，3D 核心邏輯不變。

## 指令

```bash
npm run dev      # 啟動開發伺服器（預設 localhost:3000）
npm run build    # 生產構建至 dist/
npm run preview  # 預覽生產構建
npm run lint     # ESLint
npx tsc --noEmit # TypeScript 型別檢查
```

尚無測試套件。

## 專案結構

```
legacy/                          # 原始 vanilla JS 備份（未修改）
public/libs/                     # 舊 Three.js 庫，以全域變數載入
  three.min.js                   #   THREE 全域 (revision 72)
  OrbitControls.js               #   THREE.OrbitControls
  Stats.js, Detector.js          #   Stats, Detector 全域
  THREEx.*.js                    #   THREEx 全域
src/
  main.tsx                       # React 進入點
  App.tsx                        # 外殼：分頁、佈局、HexapodProvider
  App.css                        # 佈局樣式
  index.css                      # 最小重置
  context/
    HexapodContext.tsx           # React context：botRef, sceneRef, servo displays, botVersion
  components/
    SceneCanvas.tsx              # 掛載 Three.js 場景，掛載時構建 Hexapod
    SceneControls.tsx            # 身體/旋轉搖桿、XYZ/RxRyRz 滑塊、姿態儲存/調用
    ControlPanel.tsx             # 繪製類型、移動模式、步態、動作按鈕、搖桿、鍵盤
    ServoPanel.tsx               # 18 個 servo 滑塊 + 末端位置輸入（每腿，命令式 DOM）
    AttributesPanel.tsx          # 身體/腿部幾何配置，localStorage 持久化
    LegEditor.tsx                # 2D canvas 關節編輯器，支援多腿編輯
    StatusPanel.tsx              # 狀態歷史列表，含播放/應用
    CommandDisplay.tsx           # 當前 + 上一個 servo 指令字串
    TimeChart.tsx                # 指令時間間隔 canvas 圖表
    Toolbar.tsx                  # 撤銷/重做/儲存工具列，鍵盤快捷鍵 (Ctrl+Z/Y/S)
    AttrSlider.tsx               # 可重用水平滑塊，含步進按鈕和擴展最大值
    SliderColumn.tsx             # 可重用滑塊列（垂直/水平、彈回、步進）
  hexapod/
    appState.ts                  # 可變單例，取代舊全域變數
    defaults.ts                  # 常數 + DEFAULT_HEXAPOD_OPTIONS
    utils.ts                     # DOM/向量/數學/localStorage 輔助函式
    scene.ts                     # initScene(container) — Three.js 設定
    joystick2.ts                 # JoyStick 類別（基於 canvas）
    pos_calculator.ts            # 逆向運動學：梯度下降求解器，tip→servo 值
    physics_solver.ts            # 多腿約束求解器 (PhysicsSolver.solveAll)
    hexapod.ts                   # Hexapod + HexapodLeg 類別、佈局計算、配置輔助
    gaits.ts                     # GaitController + GaitAction 階層
    gait_configs.ts              # 預設步態定義（依腿數）
    gait_generator.ts            # 運行時步態過濾：平衡驗證、去重、循環旋轉
    history.ts                   # 撤銷/重做堆疊（單例，JSON 序列化，最多 50 條）
    random.ts                    # 隨機選項生成器，用於測試/演示
  types/
    globals.d.ts                 # 舊 Three.js r72 等全域型別宣告
    hexapod.d.ts                 # 核心介面：HexapodOptions, HexapodLegOptions, LimbOptions 等
    css.d.ts                     # .css 匯入模組宣告
stylesheets/
  application.css                # 原始 UI 樣式
```

## 架構

**核心類別（與 legacy 邏輯相同，現為 ES 模組）：**
- `Hexapod` — 機器人主體。建立 3D 身體 mesh、6 個 `HexapodLeg` 實例、持有 `GaitController`。管理 servo 值計算、狀態快照/恢復、通過 Socket.IO 發送指令至 `localhost:8888`。`apply_attributes()` 從配置重建整個機器人。
- `HexapodLeg` — 三個肢段（coxa → femur → tibia → tip）。每個肢段為 Three.js mesh，具有 `servo_value`、`servo_idx`、`revert` 屬性。`set_tip_pos()` 調用 `PosCalculator`。
- `GaitController` — 擁有步態定義（腿組模式）、動作類型（power/efficient/body_first/fast）、目標模式（translate/target）。使用 `gait_configs.ts` 預設並經 `gait_generator.ts` 過濾進行平衡驗證。`fire_action()` 通過 ControlPanel 中的 setInterval 每 30ms 執行。
- `PosCalculator` — 單腿逆向運動學，透過梯度下降最小化 tip 到目標世界位置的距離。
- `JoyStick` — 基於 canvas 的 2D 搖桿。

**React 整合模式：**
- `appState.js` 為可變單例，持有 `{ scene, camera, renderer, controls, stats, keyboard, clock, current_bot, container }`。橋接舊全域邏輯與 React。
- `SceneCanvas` 在 useEffect 中調用 `initScene(container)` 後調用 `build_bot()`，結果同時存入 `appState` 和 React context。
- UI 元件直接讀寫 `appState.current_bot`（核心邏輯仍通過 ID 操作 DOM 元素）。
- 部分元件（ServoPanel、AttributesPanel）在 useEffect 中以命令式構建 DOM，保留原始邏輯。

**資料流：**
1. 配置從 `localStorage` 鍵 `"hexapod_options"` 載入（備選：`DEFAULT_HEXAPOD_OPTIONS`）
2. `initScene(container)` → Three.js 場景、相機、渲染器、動畫迴圈
3. `build_bot()` → `new Hexapod(scene, options)` 繪製身體 + 6 條腿
4. `laydown()` + `putdown_tips()` 將足部置於地面 (y=0)
5. 每個移動步驟調用 `after_status_change()`，更新 DOM、可選發送 servo 指令、記錄狀態歷史
6. Servo 指令格式：`#0 P1500 #1 P1500 ... T500`（servo 索引、脈衝寬度、時間間隔）

## Three.js API 注意事項

此程式碼庫使用 revision 72 Three.js API（`public/libs/` 中的舊版 `three.min.js`）。顯著模式：
- `THREE.Geometry`（非 BufferGeometry）
- `new THREE.Mesh(geometry, material, ...)` 單一材質建構函式
- `geometry.applyMatrix()` 而非 `.applyMatrix4()`
- 向量運算：`.clone()`、`.applyMatrix4()`、`.setFromMatrixPosition()`

舊庫以一般 `<script>` 標籤載入（非模組），暴露 `THREE`、`Stats`、`Detector`、`THREEx` 全域變數。

## 設計規則（不可協商）

### 禁止使用三角函數計算關節

`Math.sin`、`Math.cos`、`Math.atan2` 等三角函數**嚴禁**用於步態執行期間計算關節角度或 tip 位置。三角函數唯一有效用途：

- **身體幾何初始化**（`computeLegLayout`、`draw_body` 多邊形頂點）— 一次性設定
- **視覺渲染**（場景燈光動畫、LegEditor canvas 繪製）
- **高層導航目標**（`target_with_joystick` — 從搖桿角度決定旋轉方向）
- **UI 輔助**（AttributesPanel 邊長 ↔ 半徑轉換）

### 關節角度僅由 PosCalculator 計算

`PosCalculator`（`src/hexapod/pos_calculator.ts`）為梯度下降逆向運動學求解器。接收目標 tip **世界位置** (x, y, z)，數值迭代 servo 值以最小化到目標的距離。**零**三角函數 — 純數值梯度下降。

移動腿的唯一合法方式：

```
leg.set_tip_pos(worldPosition) → PosCalculator.run() → servo values
```

絕不可繞過此流程直接設定 servo 值或用三角函數計算角度。

### guide_pos 是步態移動的統一參考框架

`Hexapod.guide_pos`（`THREE.Object3D`，為 `this.mesh` 的子節點）是步態週期中計算目標位置的唯一資料來源。`move_tips()` 和 `move_body()` 都必須使用此模式：

1. `reset_guide_pos()` — 重置為相對於 mesh 的單位變換
2. 對 `guide_pos` 施加平移/旋轉偏移
3. `get_guide_pos(idx)` — 讀取變換後的世界位置
4. 將世界位置傳遞給 `leg.set_tip_pos()` → PosCalculator

`left_gl` / `right_gl` 參考線（旋轉 `±rotate_step`）直觀顯示 guide_pos 使用的旋轉方向。這些**非裝飾** — 必須與旋轉期間的實際 tip 移動一致。

### 步態步長因子

遵循 legacy 縮放慣例：
- **Tips**：以完整步長移動（`fb_step`、`lr_step`、`rotate_step`）
- **Body**：以 `step / leg_groups.length * 3` 移動
- 不可對 tips 使用 `(n-1)/n` 因子或反轉旋轉方向；tips 和 body 以相同方向旋轉

### Servo constraint 原則 — 動畫必須反映物理現實

有兩種物理模式（在 ControlPanel 切換，儲存為 `options.physics_mode`）：

**None**（`'none'`）：Tips 瞬間傳送到目標位置。Servo 立即跳到計算值。`hold_time` 使用舊版 `SERVO_VALUE_TIME_UNIT` 公式（手動模式為 0）。無動畫。此為原始行為。

**Servo Constraint**（`'servo_constraint'`）：每個 servo 有固定轉速（`servo_speed`，單位/秒）。模擬真實 servo 物理：
- 每個 servo 以**恆定速度**向目標旋轉 — 所有關節使用相同速度
- 角度差大的關節耗時更長；角度差小的更早到達 — **不同的到達時間**
- 身體移動期間，**tip 漂移是真實物理現象** — 某些 servo 先完成、另一些還在轉時，tip 位置會偏離。這**不是 bug**；真實硬體行為完全相同
- `hold_time = max(|delta|) / servo_speed * 1000` — 步態等待最慢的 servo 完成後才執行下一步

**絕對不可為了讓動畫「看起來更好」而人為同步 servo 計時。**動畫是模擬輸出，不是視覺效果。添加虛假的統一計時（例如強制所有關節同時完成）違反 servo constraint 原則。

### Keyframe 動畫系統（已取代單一目標欄位）

動畫系統已重構為使用 **keyframe 陣列**，取代個別的 start/target 欄位。**已不存在的舊欄位：**
- `leg._anim_targets`、`leg._anim_starts`、`leg._anim_start_time`
- `bot._mesh_start_pos`、`bot._mesh_target_pos`、`bot._mesh_start_rotY`、`bot._mesh_target_rotY`、`bot._mesh_anim_start`、`bot._mesh_anim_duration`

**當前欄位：**
- `Hexapod._mesh_keyframes: {pos, rotY}[]` — N+1 個 mesh 姿態（N = micro_steps）
- `Hexapod._segment_durations: number[]` — N 個持續時間（毫秒），每 segment 一個
- `Hexapod._current_segment: number` — 正在播放哪個 segment
- `Hexapod._segment_start_time: number` — 當前 segment 開始時間（performance.now）
- `HexapodLeg._servo_keyframes: number[][]` — 每腿 N+1 個 servo 值陣列
- `HexapodLeg._current_segment: number` — segment 索引（每腿獨立）
- `HexapodLeg._segment_start_time: number` — 當前 segment 開始時間

**動畫流程：**
- `move_body()` → 計算 keyframes → 調用 `apply_physics_keyframes()` 儲存
- `set_tip_pos()`（獨立，無身體移動）→ 建立 2 個 keyframes `[start, target]`
- `update_servo_animations()`（rAF，60fps）：在相鄰 keyframes 之間插值 mesh + 腿
- `update_animation()`（每腿）：每條腿根據自身 segment servo 差值獨立推進 `_current_segment`

**關鍵規則**：每條腿的 `_current_segment` 獨立推進。Mesh 有自己的 `_current_segment`。它們**不同步** — 腿可以比 mesh 更早或更晚完成一個 segment。這對 servo constraint 是正確的（獨立 servo 速度）。

### Micro steps — 細分身體移動

`options.micro_steps`（預設 1，範圍 1–20，僅會話期間有效，滑塊在 ControlPanel > Physics）。

當 `micro_steps > 1` 時，身體移動被細分為 N 個均勻間隔的 keyframes。在每個 keyframe 處，對**所有**腿在中間身體姿態下求解 IK。這減少了每個 segment 內的線性插值誤差（非線性運動學在線性插值期間導致 tip 漂移；更小的 segment = 更少誤差）。

- `micro_steps = 1`：一個 segment，與原始行為相同
- `micro_steps = 5`：五個 segment，每個為身體增量的 1/5，tip 追蹤更平滑

**計算流程**（在 `move_body()` servo constraint 路徑中）：
1. 構建 N+1 個 mesh keyframes（從起點到目標均勻分佈）
2. Keyframe 0 = 當前渲染 servo 值
3. 對於每個 keyframe k ≥ 1：將所有腿重置為 kf0 servo 值，移動 mesh 至 kf[k]，執行 `PhysicsSolver.solveAll()` → servo keyframe k
4. 計算 `_segment_durations[k] = max(|servoKf[k+1] - servoKf[k]|) / servo_speed * 1000`

**每次求解前重置為 kf0 至關重要。**PosCalculator 從當前 `limb.servo_value` 開始搜尋。如果不重置，每個 keyframe 的求解會從上一個結果漂移到不同的局部最小值，導致鎖定的 tips 滑動。

### PhysicsSolver — 多腿約束求解器

`src/hexapod/physics_solver.ts` — 純計算，無 DOM，無持久 Three.js 變更。

```typescript
PhysicsSolver.solveAll(bot, targets: THREE.Vector3[]): PhysicsSolverResult
```

- `targets[i]` 為腿 i 的 tip 在世界空間中的目標位置
- **調用者必須在調用前**將身體（mesh/body_mesh）移動到目標姿態
- 內部對每條腿獨立執行 `PosCalculator`
- 返回 `{ success, servoTargets, legResults }`

**調用者的責任**：為所有腿計算明確的世界目標：
- 著地腿（on_floor）：target = 原始世界 tip 位置（tip 在世界空間中鎖定）
- 浮空腿（floating）：target = 身體局部 tip 通過新身體姿態變換到世界空間（tip 跟隨身體）

### 參考線系統

`guideline`、`left_gl`、`right_gl` 為 `this.mesh` 的子節點。顯示從身體中心到 tip 位置的線條（mesh-local 空間）。

- **頂點來源**：`_guide_local_positions`（穩定 home 位置），**非**當前動畫中的 tip 位置
- **`guideline`**：身體 → home tips
- **`left_gl`**：相同頂點，Object3D.rotation.y = +rotate_step（顯示旋轉目標）
- **`right_gl`**：相同頂點，Object3D.rotation.y = -rotate_step

**`adjust_gait_guidelines()` 絕不可在動畫期間調用。**僅在穩定狀態時調用：
- `apply_attributes()` — 機器人重建
- rotate_step 變更
- `_body_home` 恢復後

**`sync_guide_circles()` 在動畫期間調用** — guide circles 為世界空間地面標記，追蹤當前 tip 位置，非參考指示器。

### _body_home 恢復順序

`apply_attributes()` 流程（順序重要）：
1. `draw()` — 幾何體、laydown、putdown_tips、auto_level_body、draw_gait_guidelines、draw_gait_guide
2. Servo 重置為 1500（init_angles 基準）
3. `laydown()`、`sync_guide_circles()`
4. `_body_home` 恢復（身體姿態 + tips，tips 僅首次構建時）
5. `laydown()` — 恢復後重新著地
6. `sync_guide_circles()`
7. **從當前 tip 位置重建 `_guide_local_positions`**
8. `adjust_gait_guidelines()` — **必須在步驟 7 之後**

`_body_home.save_body_home()` 使用 `history.save()`（而非直接 `set_bot_options()`）以保持 `history._lastSaved` 同步。
