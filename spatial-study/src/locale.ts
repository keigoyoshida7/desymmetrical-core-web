export type SpatialLanguage = 'ja' | 'en';

// English is the canonical UI source. Translation changes labels, never scene data.
const japanese: Record<string, string> = {
  'INFO': '概要',
  'Spatial study': '空間スタディ',
  'SPATIAL STUDY': '空間スタディ',
  'De-symmetrical Core / Spatial study': 'De-symmetrical Core / 空間スタディ',
  'Use analysis from above': '上の解析値を使う',
  'Scene simulation': 'シーンのシミュレーション',
  'Optional visual mapping of the current shadow features. Scene edits do not change the sound playing above. Motion and recording pause while this section is off-screen.': '現在の影の特徴量を表示に反映できます。シーンの編集は上の試聴音を変更しません。このセクションが画面外にある間は、動作と記録を一時停止します。',
  'Waiting for analysis…': '解析値を待機中…',
  'Test signal · linked': 'テスト信号・連携中',
  'Camera analysis · linked': 'カメラ解析・連携中',
  'File analysis · linked': 'ファイル解析・連携中',
  'Input stopped': '入力停止中',
  'Recorded scene playback': '記録したシーンを再生中',
  'ARTIST: KEIGO YOSHIDA · ORIGINAL SPATIAL AUDIO PROTOTYPE:': '作者：KEIGO YOSHIDA · 空間音響プロトタイプ原版：',
  'OSC — DISCONNECTED': 'OSC — 未接続',
  'OSC — CONNECTED': 'OSC — 接続済み',
  'Send scene to Max ↗': 'シーンをMaxへ送信 ↗',
  'INSTALLATION': 'インスタレーション',
  'Exhibition space': '展示空間',
  'Spatial planning model · 7 m enclosure and 5.4 m blackout walls are provisional. Confirm with venue.': '空間検討用モデルです。空間の高さ7 mと遮光壁の高さ5.4 mは仮定値です。会場で確認してください。',
  'Room width m': '部屋の幅 m',
  'Room depth m': '部屋の奥行 m',
  'Enclosure height m': '空間の高さ m',
  'Blackout wall height m': '遮光壁の高さ m',
  'Entrance opening m': '入口の幅 m',
  'Light-lock corridor m': '遮光通路の長さ m',
  'Room edits preserve individual speaker positions. Reset the layout after changing room dimensions.': '部屋の寸法を変更しても、個別のスピーカー位置は保持されます。寸法変更後に配置をリセットしてください。',
  'Reset 16 wall speakers to room': '壁面16台を部屋に合わせて再配置',
  'Acrylic · trapezoidal form': 'アクリル・台形の形状',
  'Trapezoidal base and top · 32.5° slope in the reference study. Sizes below are editable working assumptions; fabrication dimensions are unconfirmed.': '底面と上面は台形で、参照スタディの傾斜は32.5°です。以下の寸法は変更可能な仮定値で、製作用寸法は未確定です。',
  'Front base width m': '底面前辺の幅 m',
  'Rear base width m': '底面後辺の幅 m',
  'Acrylic depth m': 'アクリルの奥行 m',
  'Acrylic height m': 'アクリルの高さ m',
  'Slope ° from floor': '床からの傾斜角 °',
  'Acrylic thickness m': 'アクリルの厚さ m',
  'Acrylic yaw °': 'アクリルの水平回転 °',
  'Acrylic position': 'アクリルの位置',
  'The long front edge and stone face the left entrance at 90°.': '長い前辺と石を、左側の入口に向けて90°回転します。',
  'Face acrylic & stone toward entrance': 'アクリルと石を入口へ向ける',
  'Inspect acrylic form': 'アクリルの形状を見る',
  'Stone & suspended arm': '石と吊り下げアーム',
  'Asama stone proxy · all sizes and support coordinates below are assumptions. Arm joints are a generic visual model.': '浅間石の仮モデルです。寸法と支持位置はすべて仮定値で、アームの関節も一般的な表示モデルです。',
  'Stone width m': '石の幅 m',
  'Stone depth m': '石の奥行 m',
  'Stone height m': '石の高さ m',
  'Stone yaw °': '石の水平回転 °',
  'Stone centre': '石の中心',
  'Arm mounting': 'アームの取り付け',
  'ceiling': '天井',
  'side': '側面',
  'Robot suspension base': 'ロボットの吊り下げ基点',
  'Centre support over acrylic': '支持位置をアクリルの真上へ',
  'Ceiling support descends vertically to the arm above the acrylic. Re-centre X/Y after moving the acrylic; Z sets the arm attachment height.': '天井からアクリル上のアームまで垂直に支持します。アクリル移動後はX/Yを再調整してください。Zはアームの取り付け高さです。',
  'Robot & light': 'ロボットと光',
  'Visual model only · not a robot safety controller.': '表示用モデルです。ロボットの安全制御には使用できません。',
  'Control': '制御方法',
  'joints': '関節',
  'target': '目標位置',
  'Light intensity': '光の強度',
  'Target': '目標位置',
  'Light azimuth': '光の方位角',
  'Light elevation': '光の仰角',
  'Light distance': '光の距離',
  'AZ °': '方位角 °',
  'EL °': '仰角 °',
  'DI °': '距離 °',
  'DIST m': '距離 m',
  'Polar controls move the target; the attached light follows the joints.': '極座標の操作で目標位置を移動します。取り付けられた光源は関節に追従します。',
  'Motion study': '動きのスタディ',
  'Motion preset': '動きのプリセット',
  'Choose a motion study…': '動きのスタディを選択…',
  '01 SLOW ORBIT': '01 ゆっくりした周回',
  '02 LOW ELLIPSE': '02 低い楕円',
  '03 HIGH ELLIPSE': '03 高い楕円',
  '04 FRONT BACK SCAN': '04 前後の走査',
  '05 SLOW FIGURE 8': '05 ゆっくりした8の字',
  '06 DISSYMMETRIC ORBIT': '06 非対称の周回',
  '07 RANDOM POINTS': '07 ランダムな点',
  '▶ Play': '▶ 再生',
  'Ⅱ Pause': 'Ⅱ 一時停止',
  '■ Stop': '■ 停止',
  'Path': '軌道',
  'MANUAL': '手動',
  'CIRCLE': '円',
  'ELLIPSE': '楕円',
  'ORBIT': '周回',
  'FIGURE 8': '8の字',
  'SLOW SCAN': 'ゆっくりした走査',
  'PENDULUM': '振り子',
  'RANDOM SMOOTH': '滑らかなランダム軌道',
  'RANDOM POINTS': 'ランダムな点',
  'KEYFRAMES': 'キーフレーム',
  'Phase': '位相',
  'Speed ×': '速度 ×',
  'Duration s': '所要時間 s',
  'Radius m': '半径 m',
  'Amplitude': '振幅',
  'Height m': '高さ m',
  'Centre': '中心',
  'Loop': '繰り返し',
  'loop': 'ループ',
  'once': '1回',
  'pingpong': '往復',
  'Easing': '速度変化',
  'linear': '一定',
  'sine': '正弦',
  'smooth': '滑らか',
  'Smoothing s': '平滑化 s',
  'Direction': '方向',
  'Keyframes · world XYZ': 'キーフレーム・ワールドXYZ',
  'Keyframe coordinates': 'キーフレーム座標',
  '+ Current target': '+ 現在の目標位置',
  'Apply points': '座標を適用',
  'TOP': '上面',
  'FRONT': '正面',
  'SIDE': '側面',
  'LISTENER': 'リスナー',
  'STONE': '石',
  'SHELL': 'アクリル',
  'ROBOT': 'ロボット',
  'TARGET': '目標位置',
  'LIGHT': '光源',
  'Focus selection': '選択対象にフォーカス',
  'CORE / SPATIAL STUDY': 'CORE / 空間スタディ',
  '16 wall speakers + 1 arm speaker + sub · dimensions in metres': '壁面16台＋アーム1台＋サブ・寸法の単位はm',
  'Preparing WebGL…': 'WebGLを準備中…',
  '● Sound source': '● 音源',
  '● Light / target': '● 光源 / 目標位置',
  '● Listener': '● リスナー',
  'HEADPHONE MONITORING / DSP IN MAX': 'ヘッドホン試聴 / 音響処理はMAX',
  'A · Direct binaural': 'A・直接バイノーラル',
  'B · Virtual speakers': 'B・仮想スピーカー',
  'Max not confirmed': 'Maxの応答未確認',
  'SPATIAL SCENE': '空間シーン',
  'Scene labels': 'シーン内のラベル',
  'Name size · px': '名前の大きさ・px',
  'Scene name size': 'シーン内の名前の大きさ',
  'Scene name size in pixels': 'シーン内の名前の大きさ（px）',
  'Channel and object names · 0.1–18 px.': 'チャンネルとオブジェクトの名前・0.1〜18 px。',
  'Saved on this browser. Dimension text stays unchanged.': 'このブラウザに保存します。寸法の文字サイズは変わりません。',
  'Selected object': '選択中のオブジェクト',
  'Sound sources': '音源',
  '+ Add source': '+ 音源を追加',
  '− Remove selected': '− 選択した音源を削除',
  '1–8 visual sources; the main Max engine has 4 voices. Dragging releases position mappings.': '表示音源は1〜8個、Maxの主音響エンジンは4音源です。ドラッグすると位置のマッピングが解除されます。',
  'Loudspeakers & listener': 'スピーカーとリスナー',
  'Lock speakers': 'スピーカーを固定',
  'Edit listener / reference': 'リスナー / 基準位置を編集',
  'CH1–4 rear · CH5–8 front · CH9–12 right · CH13–16 left · CH17 on arm.': 'CH1〜4：後方・CH5〜8：前方・CH9〜12：右・CH13〜16：左・CH17：アーム。',
  'SUB1 is a visual placeholder; A/B uses 17 directional feeds.': 'SUB1は表示上の仮置きです。A/Bは17系統の指向性出力を使用します。',
  'Speaker construction': 'スピーカーの構造',
  'Eminence ALPHA4-8 · Ø116.1 mm. Custom baffle and cabinet sizes remain unconfirmed. Arrangement parameters rebuild the 16 wall positions.': 'Eminence ALPHA4-8・直径116.1 mm。専用バッフルと筐体の寸法は未確定です。配置パラメーターを変更すると壁面16台の位置を再計算します。',
  'Driver diameter m': 'ユニットの直径 m',
  'Driver depth m': 'ユニットの奥行 m',
  'Baffle width m': 'バッフルの幅 m',
  'Baffle height m': 'バッフルの高さ m',
  'Baffle depth m': 'バッフルの奥行 m',
  'Wall inset m': '壁からの距離 m',
  'Horizontal pair spacing m': '水平ペアの間隔 m',
  'Lower tier height m': '下段の高さ m',
  'Upper tier height m': '上段の高さ m',
  'CH17 offset (world XYZ)': 'CH17のオフセット（ワールドXYZ）',
  'CH17 follows the robot end effector. Its offset is adjustable; no speaker hardware is controlled.': 'CH17はロボットの先端に追従します。オフセットは調整できますが、実物のスピーカーは制御しません。',
  'Sub width m': 'サブの幅 m',
  'Sub depth m': 'サブの奥行 m',
  'Sub height m': 'サブの高さ m',
  'Shadow / Spat mapping': '影 / Spatのマッピング',
  'CURRENT PROPOSAL': '現在の提案',
  'EXPERIMENTAL': '実験的な関係',
  'Centroid → XYZ': '重心 → XYZ',
  'Area → spread': '面積 → 広がり',
  'Penumbra → room presence': '半影 → 残響の存在感',
  'Density → distance': '密度 → 距離',
  'Entropy → envelopment': 'エントロピー → 包囲感',
  'Light azimuth → rotation': '光の方位角 → 回転',
  'Light distance → source distance': '光源との距離 → 音源の距離',
  'OUT': '出力',
  'Enabled mappings own their target. OFF releases it at its current value. Distance from light overrides density if both are enabled.': '有効なマッピングが対象値を制御します。OFFにすると現在値で制御を解除します。光源との距離と密度を同時に有効にした場合、光源との距離を優先します。',
  'Shadow features': '影の特徴量',
  'Simulated features · no optical analysis.': '模擬的な特徴量です。光学解析は行いません。',
  'Scene-derived or manual features. Enable “Use analysis from above” to follow the current Core Web analysis.': 'シーンから算出した特徴量、または手動の値です。「上の解析値を使う」を有効にすると、現在のCore Webの解析に追従します。',
  'Features': '特徴量',
  'derived': 'シーンから算出',
  'manual': '手動',
  'Centroid': '重心',
  'Area': '面積',
  'Penumbra': '半影',
  'Density': '密度',
  'Entropy': 'エントロピー',
  'Experiments / presets': '実験 / プリセット',
  'Preset name': 'プリセット名',
  'Name this experiment': '実験に名前を付ける',
  'Save preset': 'プリセットを保存',
  'Reset scene': 'シーンをリセット',
  'Saved preset': '保存済みプリセット',
  'Load': '読み込む',
  'Delete': '削除',
  'Export JSON': 'JSONを書き出す',
  'Import JSON': 'JSONを読み込む',
  'No saved experiments': '保存済みの実験はありません',
  'OSC connection': 'OSC接続',
  'WebSocket URL': 'WebSocket URL',
  'Connect': '接続',
  'Disconnect': '切断',
  'Max host': 'Maxのホスト',
  'Max receive UDP': 'Maxの受信UDP',
  'Max send UDP': 'Maxの送信UDP',
  'Apply bridge ports': 'ブリッジのポートを適用',
  'Also change the matching ports in the Max companion. WebSocket online does not mean Max is online.': 'Max側の対応ポートも変更してください。WebSocketの接続だけでは、Maxの接続は確認できません。',
  'AUTOMATION': '動作の記録',
  '● Record': '● 記録',
  '▶ Playback': '▶ 記録を再生',
  'No recording': '記録なし',
  'Export': '書き出す',
  'Import': '読み込む',
  'OSC monitor': 'OSCモニター',
  'Clear': '消去',
  'EDIT OFF': '編集 OFF',
  'EDIT ON': '編集 ON',
  'Source position': '音源の位置',
  'Source azimuth': '音源の方位角',
  'Source elevation': '音源の仰角',
  'Source distance': '音源の距離',
  'Spread %': '広がり %',
  'Room presence': '残響の存在感',
  'Envelopment': '包囲感',
  'Unlock speakers to edit or drag.': '編集やドラッグにはスピーカーの固定を解除してください。',
  'CH17 follows the end effector. Edit its offset under Speaker construction.': 'CH17はアームの先端に追従します。「スピーカーの構造」でオフセットを調整できます。',
  'Subwoofer placeholder. Bass management is not implemented.': 'サブウーファーの仮置きです。低域管理は実装していません。',
  'Round ALPHA4-8 driver in a provisional custom baffle. Coordinates in metres.': '仮寸法の専用バッフルに円形ALPHA4-8ユニットを配置しています。座標の単位はmです。',
  'Listener': 'リスナー',
  'Yaw ° CW': '水平角 ° 時計回り',
  'Light target': '光の目標位置',
  'Light attached to the robot end effector. The visual spotlight aims at the stone.': '光源はロボットの先端に取り付けられています。表示用のスポットライトは石に向きます。',
  'Procedural Asama stone proxy. Edit size, position and orientation under Stone & suspended arm. Values are provisional; this is not a scan.': '手続き的に生成した浅間石の仮モデルです。「石と吊り下げアーム」で寸法・位置・向きを編集できます。仮定値であり、スキャンデータではありません。',
  'Trapezoidal base and top with 32.5° slope. Edit dimensions in Acrylic. Sizes are assumptions; the surface is not an optical simulation.': '台形の底面と上面、32.5°の斜面です。「アクリル」で寸法を変更できます。寸法は仮定値で、表面の光学シミュレーションは行いません。',
  'Six serial joints; light attached to the end effector. Joint controls are in the left panel.': '直列の6関節と先端の光源です。関節は左側のパネルで操作できます。',
  'WEB PREVIEW · all scene controls available · audio requires local Max + Spat': 'WEBプレビュー・すべてのシーン操作が可能・音声にはローカルのMax＋Spatが必要です',
  'SOURCES': '音源',
  'SPAT / HRTFs': 'SPAT / HRTF',
  'HEADPHONES': 'ヘッドホン',
  '17 SPEAKER FEEDS': '17系統のスピーカー出力',
  'Working dimensions · confirm fabrication': '仮寸法・製作時に確認',
  'ABOUT THIS PROTOTYPE': 'このプロトタイプについて',
  'Close information': '説明を閉じる',
  'Artist: Keigo Yoshida': '作者：Keigo Yoshida',
  'Original spatial audio prototype:': '空間音響プロトタイプ原版：',
  'Based on': '原版：',
  'Core adaptation: Keigo Yoshida ·': 'Core版への展開：Keigo Yoshida・',
  'Source code': 'ソースコード',
  'NAVIGATION': '操作方法',
  'Drag to orbit · scroll to zoom. Use the view buttons for perspective, top, front and side. Select objects in the scene or interface; drag their axes to edit.': 'ドラッグで視点を回転し、スクロールで拡大・縮小します。表示ボタンで3D・上面・正面・側面を選択できます。シーンまたは操作パネルで対象を選び、軸をドラッグして編集します。',
  'Volcanic stone, acrylic shell, robot arm, directional light preview, listener/reference point and 16 wall speakers, one arm-mounted speaker and a subwoofer placeholder.': '火山石、アクリルの殻、ロボットアーム、指向性のある光のプレビュー、リスナー / 基準点、壁面16台とアーム1台のスピーカー、サブウーファーの仮置きで構成されます。',
  'ROBOT / LIGHT': 'ロボット / 光',
  'Adjust joints manually or choose a movement preset. Control speed and play / pause / stop. Move the light target around the stone and adjust intensity.': '関節を手動で調整するか、動きのプリセットを選びます。速度と再生・一時停止・停止を操作できます。光の目標位置を石の周囲へ動かし、光の強度を調整します。',
  'This is a visual prototype, not a robot safety controller.': '表示用プロトタイプです。ロボットの安全制御には使用できません。',
  'SPATIAL AUDIO': '空間音響',
  'Use the Core version of the Max patch from this repository. The local version communicates with IRCAM Spat 5 in Max: source position, distance, spread and room/reverberation.': 'このリポジトリのCore版Maxパッチを使用します。ローカル版ではMax上のIRCAM Spat 5と通信し、音源位置・距離・広がり・残響を制御します。',
  'SHADOW MAPPING': '影のマッピング',
  'Centroid → position': '重心 → 位置',
  'Penumbra → reverberation': '半影 → 残響',
  'Experimental relationships, not final mappings or real optical analysis.': '実験的な対応関係です。最終的なマッピングや実測の光学解析ではありません。',
  'Experimental relationships, not final mappings. The optional feed uses analyzed shadow values from the interface above.': '実験的な対応関係であり、最終的なマッピングではありません。任意で上の画面の影の解析値を使用できます。',
  'HEADPHONE MONITORING': 'ヘッドホン試聴',
  'DIRECT BINAURAL': '直接バイノーラル',
  'Spat renders sources directly for headphones.': 'Spatが音源をヘッドホン用に直接レンダリングします。',
  'VIRTUAL SPEAKERS': '仮想スピーカー',
  'Spat renders seventeen directional loudspeaker feeds; spat5.virtualspeakers~ simulates those speakers binaurally.': 'Spatが17系統の指向性スピーカー出力を生成し、spat5.virtualspeakers~がそのスピーカー群をバイノーラルで再現します。',
  'SPECIFICATION / ASSUMPTIONS': '仕様 / 仮定',
  'Imported from the earlier Core spatial study: provisional 7 × 7 × 7 m enclosure, 5.4 m blackout walls, 16 wall speakers + 1 arm speaker + 1 sub, and trapezoidal acrylic with a 32.5° slope. Dimensions and generic robot geometry remain editable planning assumptions. This scene has 1–8 visual sources and does not replace the 30 + 1 layers or the browser audio above.': '以前のCore空間スタディを基にしています。仮の7 × 7 × 7 mの空間、5.4 mの遮光壁、壁面16台＋アーム1台＋サブ1台、傾斜32.5°の台形アクリルで構成されます。寸法と一般的なロボット形状は変更可能な検討用の仮定です。このシーンは1〜8個の表示音源を使用し、上の30＋1層やブラウザ音響を置き換えません。',
  'OSC / WEB PREVIEW': 'OSC / WEBプレビュー',
  'With the local bridge and Max connected, interaction controls Spat in real time. Without OSC, the visual scene and all its controls remain usable in DEMO MODE. The browser never produces audio. For reliable audio control, run the downloaded project locally and open its localhost URL. Public HTTPS pages may block local bridge access.': 'ローカルのブリッジとMaxを接続すると、操作に応じてSpatをリアルタイムに制御します。OSC未接続でもシーンと各種操作をデモとして利用できます。この空間スタディ自体はブラウザで音を生成しません。音響の制御にはプロジェクトをローカルで実行し、localhostのURLを開いてください。公開HTTPSページからはローカルブリッジへの接続が制限される場合があります。',
  'With the local bridge and Max connected, interaction controls Spat in real time. Without OSC, the visual scene and all its controls remain usable in DEMO MODE. This spatial editor does not produce audio; use the listening controls above. For reliable audio control, run the downloaded project locally and open its localhost URL. Public HTTPS pages may block local bridge access.': 'ローカルのブリッジとMaxを接続すると、操作に応じてSpatをリアルタイムに制御します。OSC未接続でもシーンと各種操作をデモとして利用できます。この空間編集画面は音を生成しません。上の試聴操作を使用してください。音響の制御にはプロジェクトをローカルで実行し、localhostのURLを開いてください。公開HTTPSページからはローカルブリッジへの接続が制限される場合があります。',
  'Enter a finite light coordinate': '光の座標には有限の数値を入力してください',
  'Enter a finite source coordinate': '音源の座標には有限の数値を入力してください',
  'Preset library imported.': 'プリセット一覧を読み込みました。',
  'Automation imported.': '動作の記録を読み込みました。',
  'Acrylic front and stone aligned toward the entrance.': 'アクリルの前面と石を入口の方向に揃えました。',
  'Vertical ceiling support centred over the acrylic.': '天井からの垂直支持をアクリルの真上に合わせました。',
  'Maximum 64 points': '座標は最大64点です',
  'Use 2–64 arrays of three metre coordinates.': 'XYZの3つの座標（m）を持つ配列を2〜64点指定してください。',
  'Select a sound source first': '先に音源を選択してください',
  'Keep at least one source': '音源を少なくとも1つ残してください',
  'Core wall layout recalculated.': 'Coreの壁面スピーカー配置を再計算しました。',
  'Name this experiment first': '先に実験に名前を付けてください',
  'Experiment saved locally.': '実験をこのブラウザに保存しました。',
  'Choose a saved preset': '保存済みのプリセットを選択してください',
  'Recording scene parameters at 10 Hz.': 'シーンの設定を10 Hzで記録しています。',
  'Record at least two frames first': '先に2フレーム以上記録してください',
  'Scene sent. Check Max acknowledgement.': 'シーンを送信しました。Maxの応答を確認してください。',
  'Bridge offline. Connect a local bridge in OSC connection.': 'ブリッジが未接続です。OSC接続からローカルのブリッジに接続してください。',
  'Expected a scene object.': 'シーン形式のデータが必要です。',
  'This file is not a De-symmetrical Core scene (version 2). Adaptation scenes use a different installation layout.': 'このファイルはDe-symmetrical Coreのシーン（version 2）ではありません。Adaptation版は異なる配置を使用します。',
  'Use 1–8 sources': '音源は1〜8個にしてください',
  'Source IDs must be sequential 1…N': '音源IDは1から順番に並べてください',
  'Expected Core CH1…CH17 and SUB1 in channel order': 'CoreのCH1〜CH17とSUB1をチャンネル順で指定してください',
  'Invalid XYZ coordinates': 'XYZ座標が無効です',
  'Expected six joints within ±180°': '6つの関節を±180°の範囲で指定してください',
  'Invalid robot mounting': 'ロボットの取り付け方式が無効です',
  'Invalid control mode': '制御モードが無効です',
  'Invalid monitoring mode': '試聴モードが無効です',
  'Invalid movement mode': '動作モードが無効です',
  'Invalid playback option': '再生設定が無効です',
  'Invalid duration, speed or phase': '所要時間・速度・位相が無効です',
  'Use 2–64 XYZ keyframes': 'XYZキーフレームを2〜64点指定してください',
  'Invalid room dimensions': '部屋の寸法が無効です',
  'Acrylic top collapses: reduce height, increase slope or enlarge the footprint': 'アクリル上面が成立しません。高さを下げる、傾斜を急にする、または底面を広げてください',
  'Invalid stone dimensions': '石の寸法が無効です',
  'Invalid stone yaw': '石の水平角が無効です',
  'Invalid wall speaker layout': '壁面スピーカーの配置が無効です',
  'Invalid speaker shape dimensions': 'スピーカーの寸法が無効です',
  'Spat parameter outside prototype bounds': 'Spatの値がプロトタイプの対応範囲外です',
  'Invalid light intensity': '光の強度が無効です',
  'Shadow features must be 0–1': '影の特徴量は0〜1の範囲で指定してください',
  'Invalid motion extent': '動作の範囲が無効です',
  'Mapping range too large': 'マッピングの範囲が大きすぎます',
  'Expected at most 40 presets.': 'プリセットは40件以下にしてください。',
  'Invalid preset name': 'プリセット名が無効です',
  'JSON file exceeds 25 MB': 'JSONファイルが25 MBを超えています',
  'Expected a De-symmetrical Core recording (version 2)': 'De-symmetrical Coreの記録（version 2）が必要です',
  'Expected 2–3000 frames': '2〜3000フレームの記録が必要です',
  'Recording timestamps must strictly increase': '記録の時刻は前のフレームより後にしてください',
  'Record or import at least two frames first.': '先に2フレーム以上を記録するか読み込んでください。',
  'Invalid bridge response': 'ブリッジの応答が無効です',
  'Connect the OSC bridge first': '先にOSCブリッジを接続してください',
  'Invalid Max host': 'Maxのホストが無効です',
  'Max send and receive ports must differ': 'Maxの送信と受信には異なるポートを指定してください',
  'Configuration already in progress': '設定変更を処理中です',
  'Invalid OSC message batch': 'OSCメッセージの形式が無効です',
  'OSC rate limit (1600 messages/s)': 'OSCの送信上限です（毎秒1600メッセージ）',
};

function japaneseText(source: string): string {
  if (Object.hasOwn(japanese, source)) return japanese[source];
  let match: RegExpMatchArray | null;
  if ((match = source.match(/^(.*) · frozen$/))) return `${japaneseText(match[1])}・固定中`;
  if ((match = source.match(/^(.*) ([XYZ])$/)) && Object.hasOwn(japanese, match[1])) return `${japanese[match[1]]} ${match[2]}`;
  if ((match = source.match(/^(.*) (minimum|maximum)$/)) && Object.hasOwn(japanese, match[1])) return `${japanese[match[1]]} ${match[2] === 'minimum' ? '最小値' : '最大値'}`;
  if ((match = source.match(/^SOURCE (\d+)$/))) return `音源 ${match[1]}`;
  if ((match = source.match(/^This Max engine supports (\d+) sources$/))) return `このMaxエンジンは${match[1]}音源まで対応しています`;
  if ((match = source.match(/^(IDLE|RECORD|PLAY) · (\d+) frames · ([\d.]+) s$/))) return `${({IDLE: '停止中', RECORD: '記録中', PLAY: '再生中'} as Record<string, string>)[match[1]]} · ${match[2]}フレーム · ${match[3]} s`;
  if ((match = source.match(/^(\d+) msg\/s$/))) return `${match[1]} 件/秒`;
  if ((match = source.match(/^LIGHT XYZ\s+(.*)$/s))) return `光源 XYZ  ${match[1].replace(/TARGET ERROR\s+/g, '目標との差  ').replace('target may be out of reach', '目標が可動範囲外の可能性があります')}`;
  if ((match = source.match(/^TOP ENVELOPE\s+(.*)$/s))) return `上面の外形  ${match[1].replace('Working dimensions · confirm fabrication', japanese['Working dimensions · confirm fabrication'])}`;
  if ((match = source.match(/^Max: (.*) · master (.*)$/))) {
    const mode = ({direct: '直接バイノーラル', virtualspeakers: '仮想スピーカー', unconfirmed: '未確認'} as Record<string, string>)[match[1]] || match[1];
    const master = match[2] === 'unconfirmed' ? '未確認' : match[2].replace(/^sound (\S+) \/ gain (.+)$/, '音 $1 / ゲイン $2');
    return `Max: ${mode} · マスター ${master}`;
  }
  if ((match = source.match(/^WebGL unavailable: (.*)$/s))) return `WebGLを利用できません：${match[1]}`;
  if ((match = source.match(/^(.*): invalid (number|type|array|object)$/))) return `${match[1]}：${({number: '数値', type: '型', array: '配列', object: 'オブジェクト'} as Record<string, string>)[match[2]]}が無効です`;
  if ((match = source.match(/^Invalid port (.*)$/))) return `ポートが無効です：${match[1]}`;
  if ((match = source.match(/^OSC decode: (.*)$/s))) return `OSCの解析エラー：${match[1]}`;
  return source;
}

/** Translate UI copy only. Unknown text and numeric/OSC data are preserved verbatim. */
export function translateSpatialText(text: string, language: SpatialLanguage): string {
  if (language === 'en') return text;
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return match[1] + japaneseText(match[2]) + match[3];
}

type Copy = { english: string; rendered: string };
const textCopies = new WeakMap<Text, Copy>();
const attributeCopies = new WeakMap<Element, Map<string, Copy>>();
const knownOptions = new WeakSet<HTMLOptionElement>();
const userPresetOptions = new WeakSet<HTMLOptionElement>();
const excluded = 'script, style, textarea, input, pre, [data-no-translate], #osc-log, #last-in, #last-out';
const attributes = ['aria-label', 'title', 'placeholder'] as const;
let spatialLanguage: SpatialLanguage = 'en';
let localeRoot: HTMLElement | undefined;
let observer: MutationObserver | undefined;

function isProtectedText(node: Text): boolean {
  const element = node.parentElement;
  if (!element || element.closest(excluded)) return true;
  // Saved experiment names are user content, even if one equals a UI dictionary key.
  const preset = element.closest<HTMLOptionElement>('#preset-library option');
  return Boolean(preset && userPresetOptions.has(preset));
}

function localizeDocument(): void {
  if (!localeRoot) return;
  observer?.disconnect();
  try {
    // An option's implicit value follows its label. Make semantic values explicit first.
    for (const option of localeRoot.querySelectorAll<HTMLOptionElement>('option')) {
      if (!knownOptions.has(option)) {
        if (option.closest('#preset-library') && option.hasAttribute('value')) userPresetOptions.add(option);
        if (!option.hasAttribute('value')) option.value = option.textContent || '';
        knownOptions.add(option);
      }
    }
    const walker = document.createTreeWalker(localeRoot, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (isProtectedText(text)) continue;
      let copy = textCopies.get(text);
      if (!copy || text.data !== copy.rendered) {
        copy = { english: text.data, rendered: text.data };
        textCopies.set(text, copy);
      }
      const translated = translateSpatialText(copy.english, spatialLanguage);
      if (text.data !== translated) text.data = translated;
      copy.rendered = translated;
    }
    for (const element of [localeRoot, ...localeRoot.querySelectorAll<HTMLElement>('*')]) {
      if (element.closest('[data-no-translate]')) continue;
      for (const attribute of attributes) {
        const current = element.getAttribute(attribute);
        if (current === null) continue;
        let copies = attributeCopies.get(element);
        if (!copies) { copies = new Map(); attributeCopies.set(element, copies); }
        let copy = copies.get(attribute);
        if (!copy || current !== copy.rendered) {
          copy = { english: current, rendered: current };
          copies.set(attribute, copy);
        }
        const translated = translateSpatialText(copy.english, spatialLanguage);
        if (current !== translated) element.setAttribute(attribute, translated);
        copy.rendered = translated;
      }
    }
    document.documentElement.lang = spatialLanguage;
  } finally {
    observer?.observe(localeRoot, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes] });
  }
}

/** Call directly after inserting initial markup, before binding controls or refreshing values. */
export function initSpatialLocale(root: HTMLElement): void {
  observer?.disconnect();
  localeRoot = root;
  observer = new MutationObserver(() => localizeDocument());
  localizeDocument();
}

/** Parent-page preference only; this module never changes scene or preference storage. */
export function setSpatialLanguage(language: SpatialLanguage): void {
  if (language !== 'ja' && language !== 'en') return;
  spatialLanguage = language;
  localizeDocument();
}
