# JS Hexapod v0.8.0

基於 Three.js 的 3D 六足機器人模擬器，可通過 Socket.IO 控制實體機器人。

## 快速開始

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 生產構建至 dist/
npm run preview  # 預覽生產構建
npm run lint     # ESLint
```

## 功能

- **3D 預覽** — OrbitControls、網格、mesh/bone/points 繪製模式
- **步態引擎** — tripod、ripple、quad、wave 步態，支援 power/efficient/body_first/fast 模式；系統化的 k-legs-lifted 步態生成，具備平衡驗證和循環去重
- **逆向運動學** — 梯度下降 PosCalculator，不使用三角函數計算關節
- **Servo 轉速模擬** — 可配置 servo 轉速（單位/秒），60fps keyframe 動畫
- **物理模式** — None（tip 瞬移）/ Servo Constraint（真實 servo 轉速模擬）
- **Micro Steps** — 將身體移動細分為 N 個 keyframes，大位移時 IK 更穩定
- **多腿約束求解器** — PhysicsSolver 在身體移動時同時協調所有腿
- **腿部編輯器** — 2D canvas 拖拽調整肢段長度和角度，支援每腿 DOF、每段 IK 反饋
- **Servo 控制** — 18 個 servo 滑塊，即時指令顯示和時間圖表
- **實體機器人** — Socket.IO 連接 `localhost:8888`，servo 脈衝指令協議 (`#0 P1500 #1 P1500 ... T500`)
- **配置持久化** — localStorage 儲存/載入、匯出/匯入 JSON 設定檔、撤銷/重做
- **隨機生成器** — 一鍵隨機機器人參數

## 架構

```
src/
  main.tsx                    # React 進入點
  App.tsx                     # 外殼：分頁、佈局、HexapodProvider
  context/HexapodContext.tsx  # botRef、sceneRef、servo 顯示、版本更新
  components/
    SceneCanvas.tsx           # Three.js 場景掛載、構建 Hexapod
    SceneControls.tsx         # 3 個搖桿 (Move/Body/Rot)、XYZ/RxRyRz 滑塊，持久化 move_mode
    ControlPanel.tsx          # 繪製類型、步態、動作/步態/物理、鍵盤、send/sync
    AttributesPanel.tsx       # Profile (presets + body shape 按鈕)、Adjust、Motions、Body Attrs
    ServoPanel.tsx            # 18 個 servo 滑塊 + 末端位置輸入
    LegEditor.tsx             # 2D canvas 關節編輯器，支援多腿編輯
    StatusBar.tsx             # 狀態列：步態、模式、物理、腿數
    StatusPanel.tsx           # 狀態歷史，含播放/應用
    CommandDisplay.tsx        # 當前 + 上一個 servo 指令
    TimeChart.tsx             # 指令時間間隔圖表
    Toolbar.tsx               # 撤銷/重做/儲存工具列，鍵盤快捷鍵
    AttrSlider.tsx            # 可重用標籤範圍滑塊
    SliderColumn.tsx          # 可重用滑塊列（垂直/水平、彈回）
  hexapod/
    hexapod.ts                # Hexapod 類別、配置輔助
    hexapod_leg.ts            # HexapodLeg 類別
    gaits.ts                  # GaitController、步態動作
    gait_configs.ts           # 預設步態定義（wave、ripple、tripod、quad）
    gait_generator.ts         # 運行時步態過濾和驗證
    pos_calculator.ts         # 梯度下降 IK 求解器
    forward_kinematics.ts     # 純正向運動學（零 Three.js 依賴），供測試使用
    physics_solver.ts         # 多腿約束求解器
    servo_output.ts           # ServoOutput 介面 + DirectOutput/AnimatedOutput
    scene.ts                  # initScene — Three.js 設定
    joystick2.ts              # 基於 canvas 的 2D 搖桿
    leg_layout.ts             # 腿部佈局計算、關節位置
    presets.ts                # 15 個預設配置
    defaults.ts               # 常數、DEFAULT_HEAPOD_OPTIONS
    utils.ts                  # DOM/向量/數學/localStorage 輔助
    appState.ts               # 可變單例狀態
    history.ts                # 撤銷/重做堆疊
    random.ts                 # 隨機選項生成器
  types/
    globals.d.ts              # 舊 Three.js、Stats、Detector、THREEx 型別宣告
    hexapod.d.ts              # 核心介面：HexapodOptions、HexapodLegOptions、LimbOptions
    css.d.ts                  # .css 匯入模組宣告
stylesheets/
  application.css             # 原始 UI 樣式（由 React 匯入）
```

## 設計規則

- **關節禁用三角函數** — `PosCalculator` 使用梯度下降，絕不使用 sin/cos/atan2
- **guide_pos** 是所有步態 tip/body 移動的統一參考框架
- **步態步長因子**：tips 以完整步長移動，body 以 `step / leg_groups.length * 3` 移動
- **Servo Constraint 原則**：動畫反映物理現實 — servo 以恆速獨立旋轉，不同到達時間是正確的，絕不可人為同步
- **Keyframe 動畫**：mesh keyframes 用於步態行走；body_mesh keyframes 用於身體控制；每腿 keyframes 由 AnimatedOutput 策略管理

完整不可協商設計規則見 `CLAUDE.md`（英文）或 `CLAUDE_CN.md`（中文）。

## Three.js

使用 Three.js revision 72（通過 `<script>` 全域載入）：
- `THREE.Geometry`（非 BufferGeometry）
- 單一材質 mesh 建構函式
- `.applyMatrix()`（非 `.applyMatrix4()`）

## Servo 指令格式

```
#0 P1500 #1 P1500 #2 P1500 ... T500
```
Servo 索引、脈衝寬度（500–2500）、時間間隔（毫秒）。

## 授權

By Daniel Cheang @ 2015
