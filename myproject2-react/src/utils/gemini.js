/**
 * Gemini APIを使用した汎用OCR解析関数
 * @param {string} base64Image - 画像のBase64データ (data:image/...形式)
 * @param {string} apiKey - Gemini APIキー
 * @param {Object} schema - 抽出したいデータのJSONスキーマ
 * @param {string} customPrompt - 解析への追加指示（任意）
 */
export const performOCR = async (base64Image, apiKey, schema, customPrompt = "") => {
    // 1. 画像データの整形
    const mimeType = base64Image.substring(5, base64Image.indexOf(';'));
    const base64Data = base64Image.split(',')[1];

    // 2. ペイロードの構築
    const payload = {
        contents: [{
            parts: [
                { text: "電気検針票から情報を抽出してJSONで返してください。項目: usageKwh(数値), totalCost(数値), periodDays(数値), billingDate(R7 6月分 形式), contractName(文字列)" },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
        }]
    };
    // 互換性が最も高い gemini-pro を使用
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    // 3. API実行 (リトライ処理付き)
    let response;
    let retries = 3;
    while (retries > 0) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) break; // 成功したらループを抜ける

            console.warn(`API Error: ${response.status}. Retrying... (${retries} left)`);
        } catch (error) {
            console.warn(`Network Error: ${error.message}. Retrying... (${retries} left)`);
        }
        retries--;
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    }

    if (!response || !response.ok) {
        const errorDetail = await response?.json().catch(() => ({}));
        throw new Error(`APIリクエストが失敗しました: ${response?.status || 'Network Error'} ${errorDetail?.error?.message || ''}`);
    }

    const result = await response.json();

    // 4. 応答からテキストを取り出してパース
    // 4. 応答からテキストを取り出してパース
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // より強固なパース処理: 最初の '{' から 最後の '}' までを抽出
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
        console.error("OCR Raw Response:", text);
        throw new Error(`AI応答がJSON形式ではありませんでした。応答内容: ${text.substring(0, 100)}...`);
    }

    const jsonString = text.substring(firstBrace, lastBrace + 1);

    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("JSON Parse Error:", e, jsonString);
        throw new Error(`JSON解析に失敗しました: ${e.message}`);
    }
};
