from flask import Flask, render_template, request, send_file, redirect, url_for, flash, jsonify
import csv
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import io
import pytesseract
from PIL import Image
import os
import re
import platform
import json
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'

# Tesseractのパス設定（Windowsの場合）
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# 日本語フォントの設定
def setup_japanese_font():
    """日本語フォントを設定"""
    try:
        if platform.system() == 'Windows':
            font_paths = [
                'C:/Windows/Fonts/msgothic.ttc',
                'C:/Windows/Fonts/meiryo.ttc',
                'C:/Windows/Fonts/yuanti.ttc',
            ]
            
            for font_path in font_paths:
                if os.path.exists(font_path):
                    plt.rcParams['font.family'] = fm.FontProperties(fname=font_path).get_name()
                    break
            else:
                plt.rcParams['font.family'] = 'DejaVu Sans'
        else:
            plt.rcParams['font.family'] = 'DejaVu Sans'
    except Exception as e:
        print(f"フォント設定エラー: {e}")
        plt.rcParams['font.family'] = 'DejaVu Sans'

setup_japanese_font()

def read_csv(filename):
    """CSVファイルを読み込む"""
    data = []
    if not os.path.exists(filename):
        return data
        
    with open(filename, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                usage = float(row['使用量（kWh）'])
                price = float(row['単価（円/kWh）'])
                total = usage * price
                data.append({
                    '年月': row['年月'],
                    '使用量': usage,
                    '単価': price,
                    '電気代': total
                })
            except (ValueError, KeyError) as e:
                print(f"データ読み込みエラー: {e}")
                continue
    return data

def extract_electric_data(text):
    """OCRで抽出したテキストから電気使用量データを抽出"""
    data = {}
    
    # 年月の抽出
    year_month_pattern = r'(\d{4})[年/](\d{1,2})[月]?'
    year_month_match = re.search(year_month_pattern, text)
    if year_month_match:
        year, month = year_month_match.groups()
        data['年月'] = f"{year}年{month}月"
    
    # 使用量の抽出
    usage_pattern = r'(\d+(?:\.\d+)?)\s*kWh'
    usage_match = re.search(usage_pattern, text, re.IGNORECASE)
    if usage_match:
        data['使用量'] = float(usage_match.group(1))
    
    # 単価の抽出
    price_pattern = r'(\d+(?:\.\d+)?)\s*円/kWh'
    price_match = re.search(price_pattern, text)
    if price_match:
        data['単価'] = float(price_match.group(1))
    
    return data

def process_ocr_image(image_path):
    """画像からOCRでテキストを抽出"""
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image, lang='jpn+eng')
        electric_data = extract_electric_data(text)
        return text, electric_data
    except Exception as e:
        return None, f"OCR処理エラー: {str(e)}"

# ルート定義
@app.route('/')
def index():
    records = read_csv('data.csv')
    return render_template('simple_index.html', records=records)

@app.route('/graph')
def graph():
    records = read_csv('data.csv')
    if not records:
        return "データがありません", 404
        
    months = [r['年月'] for r in records]
    totals = [r['電気代'] for r in records]

    plt.figure(figsize=(10, 6))
    plt.plot(months, totals, marker='o', color='green', linewidth=2, markersize=8)
    plt.title('月別電気代の推移', fontsize=16, fontweight='bold')
    plt.xlabel('年月', fontsize=12)
    plt.ylabel('電気代（円）', fontsize=12)
    plt.grid(True, alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()

    img = io.BytesIO()
    plt.savefig(img, format='png', dpi=150, bbox_inches='tight')
    img.seek(0)
    plt.close()
    return send_file(img, mimetype='image/png')

@app.route('/ocr')
def ocr_page():
    return render_template('simple_ocr.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('ファイルが選択されていません')
        return redirect(url_for('ocr_page'))
    
    file = request.files['file']
    if file.filename == '':
        flash('ファイルが選択されていません')
        return redirect(url_for('ocr_page'))
    
    if file:
        upload_folder = 'uploads'
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        
        filename = file.filename
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)
        
        extracted_text, electric_data = process_ocr_image(file_path)
        
        if isinstance(electric_data, dict) and electric_data:
            csv_file = 'data.csv'
            file_exists = os.path.exists(csv_file)
            
            with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                fieldnames = ['年月', '使用量（kWh）', '単価（円/kWh）']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                
                if not file_exists:
                    writer.writeheader()
                
                writer.writerow({
                    '年月': electric_data.get('年月', ''),
                    '使用量（kWh）': electric_data.get('使用量', ''),
                    '単価（円/kWh）': electric_data.get('単価', '')
                })
            
            flash('OCR処理が完了し、データが追加されました！')
        else:
            flash(f'OCR処理でエラーが発生しました: {electric_data}')
        
        os.remove(file_path)
        return redirect(url_for('ocr_page'))

@app.route('/api/data')
def api_data():
    """JSON API for data"""
    records = read_csv('data.csv')
    return jsonify(records)

@app.route('/api/upload', methods=['POST'])
def api_upload():
    """JSON API for upload"""
    if 'file' not in request.files:
        return jsonify({'error': 'ファイルが選択されていません'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'ファイルが選択されていません'}), 400
    
    try:
        upload_folder = 'uploads'
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        
        filename = file.filename
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)
        
        extracted_text, electric_data = process_ocr_image(file_path)
        
        if isinstance(electric_data, dict) and electric_data:
            csv_file = 'data.csv'
            file_exists = os.path.exists(csv_file)
            
            with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                fieldnames = ['年月', '使用量（kWh）', '単価（円/kWh）']
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                
                if not file_exists:
                    writer.writeheader()
                
                writer.writerow({
                    '年月': electric_data.get('年月', ''),
                    '使用量（kWh）': electric_data.get('使用量', ''),
                    '単価（円/kWh）': electric_data.get('単価', '')
                })
            
            os.remove(file_path)
            return jsonify({
                'success': True,
                'message': 'OCR処理が完了し、データが追加されました！',
                'data': electric_data
            })
        else:
            os.remove(file_path)
            return jsonify({'error': f'OCR処理でエラーが発生しました: {electric_data}'}), 400
            
    except Exception as e:
        return jsonify({'error': f'処理中にエラーが発生しました: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5002)




