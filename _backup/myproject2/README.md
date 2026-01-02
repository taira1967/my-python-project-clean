# 電気代管理システム - MyProject2

## 🚀 概要
シンプルで安定した電気代管理システムです。OCR機能を使用して検針票から自動的に電気使用量データを抽出し、グラフで可視化できます。

## ✨ 主な機能
- **OCR処理**: 検針票の画像から電気使用量データを自動抽出
- **データ管理**: CSVファイルでローカル保存
- **グラフ表示**: matplotlibで美しいグラフ生成
- **レスポンシブデザイン**: スマホ対応
- **ドラッグ&ドロップ**: 画像ファイルの簡単アップロード

## 🛠️ 必要な環境
- Python 3.8以上
- Tesseract OCR
- 必要なPythonパッケージ（requirements.txt参照）

## 📦 インストール手順

### 1. Tesseract OCRのインストール
```bash
# Windows (wingetを使用)
winget install --id UB-Mannheim.TesseractOCR

# または公式サイトからダウンロード
# https://github.com/UB-Mannheim/tesseract/wiki
```

### 2. Pythonパッケージのインストール
```bash
pip install -r requirements.txt
```

## 🚀 起動方法
```bash
python app.py
```

アプリケーションは http://127.0.0.1:5003 で起動します。

## 📋 使用方法

### 1. データ入力
- ブラウザで http://127.0.0.1:5003/ocr にアクセス
- 検針票の画像をアップロード
- OCR処理で自動的にデータを抽出・保存

### 2. データ確認
- メインページ（http://12http://127.0.0.1:5003/）でデータ一覧を確認
- グラフページ（7.0.0.1:5003/graph）で推移を確認

## 📁 ファイル構成
```
MyProject2/
├── app.py              # メインアプリケーション
├── requirements.txt    # 必要なパッケージ
├── README.md          # このファイル
├── templates/         # HTMLテンプレート
│   ├── index.html     # メインページ
│   └── ocr.html       # OCR処理ページ
├── data.csv           # データ保存ファイル（自動生成）
└── uploads/           # 一時アップロードフォルダ（自動生成）
```

## 🔧 技術仕様
- **フレームワーク**: Flask
- **OCR**: Tesseract OCR
- **グラフ**: matplotlib
- **データ保存**: CSV
- **フロントエンド**: HTML/CSS/JavaScript

## 🐛 トラブルシューティング

### OCRが動作しない場合
1. Tesseract OCRが正しくインストールされているか確認
2. パス設定が正しいか確認（app.pyの14行目）
3. 日本語データパックがインストールされているか確認

### グラフが表示されない場合
1. matplotlibの日本語フォント設定を確認
2. データが正しく読み込まれているか確認

## 📝 ライセンス
このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献
バグ報告や機能要望は、GitHubのIssuesでお知らせください。




「表示確認済み！」









