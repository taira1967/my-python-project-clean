import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, addDoc, deleteDoc, orderBy, serverTimestamp, setLogLevel, where } from 'firebase/firestore';
import { performOCR } from './utils/gemini';

// Firebaseのログレベルを設定 (デバッグ用)
setLogLevel('debug');

// --- 環境変数から設定を読み込み（セキュリティ対策） ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// --- UIコンポーネント ---

// --- UIコンポーネント ---

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-gray-100">
    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
    <p className="ml-4 text-2xl text-indigo-700 font-semibold">準備中です...</p>
  </div>
);

const LoginScreen = ({ onLogin, onSignUp, onGuestLogin, loginError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false); // 新規登録モードかどうか

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isRegistering) {
      onSignUp(email, password);
    } else {
      onLogin(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 md:p-8 space-y-4 md:space-y-6">
        <div className="text-center">
          <h1 className="text-xl md:text-3xl font-bold text-indigo-600">💡 電気料金比較表</h1>
          <p className="mt-2 text-sm md:text-base text-gray-600">
            {isRegistering ? '新しいアカウントを作成します' : 'ログインしてデータを管理'}
          </p>
        </div>

        {/* ゲストログインボタン（試作品用 - 登録時は非表示推奨だが残しておく） */}
        {!isRegistering && (
          <button
            onClick={onGuestLogin}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-300 flex items-center justify-center mb-4"
          >
            <span className="mr-2">🚀</span>
            ゲストとして試す（登録不要）
          </button>
        )}

        {!isRegistering && (
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">またはメールでログイン</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-3 rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-3 rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              placeholder="••••••••"
              required
              minLength={6}
            />
            {isRegistering && <p className="text-xs text-gray-500 mt-1">※6文字以上で設定してください</p>}
          </div>
          {loginError && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-lg">{loginError}</p>}

          <button type="submit" className={`w-full py-3 px-4 text-white font-bold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition duration-300 ${isRegistering ? 'bg-orange-500 hover:bg-orange-600 focus:ring-orange-500' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'}`}>
            {isRegistering ? 'アカウント登録' : 'ログイン'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setPassword('');
              // エラーメッセージなどは親側で管理してるので残るかもしれんが、とりあえず切り替え
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold underline"
          >
            {isRegistering ? 'すでにアカウントをお持ちの方はログイン' : 'アカウントをお持ちでない方は新規登録'}
          </button>
        </div>

        {!isRegistering && (
          <div className="text-xs text-center text-gray-500 mt-4">
            <p className="mt-2">本番運用時は管理者アカウントでログインしてください。</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- メインアプリケーションコンポーネント ---
const MainApp = ({ currentUser, isAdmin, onLogout, db, userId, appId }) => {
  const [bills, setBills] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);
  const [ocrResultJson, setOcrResultJson] = useState(null);
  const [selectedFilterMode, setSelectedFilterMode] = useState('All_Records');
  const [adminRecorderFilter, setAdminRecorderFilter] = useState('all');
  const [message, setMessage] = useState('');
<<<<<<< Updated upstream
<<<<<<< Updated upstream
  
<<<<<<< HEAD
  // 画像拡大機能用のstate（老眼対応）
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  
=======
=======
=======
>>>>>>> Stashed changes

  // 画像拡大機能用のstate（老眼対応）
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
>>>>>>> recovery-7d2-clean
  const [newBillData, setNewBillData] = useState({
    recorderName: currentUser || 'ゲストユーザー',
    contractType: '',
    billingDate: '',
    usageKwh: '',
    totalCost: '',
    periodDays: '',
    notes: '',
  });

  // ログインユーザーが変わったら、フォームの記録者名を更新
  useEffect(() => {
    setNewBillData(prev => ({ ...prev, recorderName: currentUser || 'ゲストユーザー' }));
  }, [currentUser]);


  // 日付フォーマット関数
  const formatDate = (timestamp) => {
    if (!timestamp) return '日付不明';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };


  // リアルタイムデータ購読
  useEffect(() => {
    if (!db || !userId || !appId) return;

    const collectionPath = `artifacts/${appId}/energy_bills`;
    const billsCollection = collection(db, collectionPath);
    let billsQuery;

    if (isAdmin) {
      // 管理者は全データを閲覧
      billsQuery = query(billsCollection, orderBy('timestamp', 'desc'));
    } else {
      // 一般ユーザーは自分のデータのみ閲覧 (authorIdはFirebase AuthのUID)
      billsQuery = query(billsCollection, where('authorId', '==', userId), orderBy('timestamp', 'desc'));
    }

    const unsubscribe = onSnapshot(billsQuery, (snapshot) => {
      const fetchedBills = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        usageKwh: Number(doc.data().usageKwh),
        totalCost: Number(doc.data().totalCost),
        periodDays: Number(doc.data().periodDays),
      }));
      setBills(fetchedBills);
    }, (error) => {
      console.error("Firestore data fetch failed:", error);
      setMessage(`データ取得エラー: ${error.message}`);
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAdmin]);

<<<<<<< HEAD
  // 料金年月分を統一フォーマットに正規化する関数（老眼対応・合算機能対応）
  const normalizeBillingDate = (rawDate) => {
    if (!rawDate) return '';
    
    let normalized = rawDate.trim();
    
    // 1. 令和→R変換
    normalized = normalized.replace(/令和/g, 'R');
    normalized = normalized.replace(/れいわ/g, 'R');
    
    // 2. 全角→半角変換
    normalized = normalized.replace(/[Ｒ]/g, 'R');
    normalized = normalized.replace(/[０-９]/g, (s) => 
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );
    
    // 3. スペースの正規化（Rと数字の間にスペースを適切に挿入）
    // 例：R76月分 → R7 6月分
    normalized = normalized.replace(/R\s*(\d+)\s*(\d+月分)/g, 'R$1 $2');
    
    // 4. Rの後の数字と月の間にスペースがない場合の処理
    // 例：R7 6月分、R76月分 など
    if (!normalized.match(/R\d+\s+\d+月分/)) {
      // R[数字][数字]月分 のパターンを探す
      normalized = normalized.replace(/R(\d+)(\d)月分/g, 'R$1 $2月分');
    }
    
    // 5. 余分なスペースを削除
    normalized = normalized.replace(/\s+/g, ' ');
    
    // 6. 最終フォーマットチェック（R[数字] [数字]月分）
    const match = normalized.match(/R(\d+)\s+(\d+)月分/);
    if (match) {
      return `R${match[1]} ${match[2]}月分`;
    }
    
    // マッチしない場合は元の値を返す（エラーを起こさない）
    return rawDate;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // 料金年月分の場合は自動正規化
    if (name === 'billingDate') {
      const normalized = normalizeBillingDate(value);
      setNewBillData(prev => ({ ...prev, [name]: normalized }));
    } else {
      setNewBillData(prev => ({ ...prev, [name]: value }));
    }
=======
<<<<<<< Updated upstream
  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewBillData(prev => ({ ...prev, [name]: value }));
=======
  // 料金年月分を統一フォーマットに正規化する関数（老眼対応・合算機能対応）
  const normalizeBillingDate = (rawDate) => {
    if (!rawDate) return '';

    let normalized = rawDate.trim();

    // 1. 令和→R変換
    normalized = normalized.replace(/令和/g, 'R');
    normalized = normalized.replace(/れいわ/g, 'R');

    // 2. 全角→半角変換
    normalized = normalized.replace(/[Ｒ]/g, 'R');
    normalized = normalized.replace(/[０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );

    // 3. スペースの正規化（Rと数字の間にスペースを適切に挿入）
    // 例：R76月分 → R7 6月分
    normalized = normalized.replace(/R\s*(\d+)\s*(\d+月分)/g, 'R$1 $2');

    // 4. Rの後の数字と月の間にスペースがない場合の処理
    // 例：R7 6月分、R76月分 など
    if (!normalized.match(/R\d+\s+\d+月分/)) {
      // R[数字][数字]月分 のパターンを探す
      normalized = normalized.replace(/R(\d+)(\d)月分/g, 'R$1 $2月分');
    }

    // 5. 余分なスペースを削除
    normalized = normalized.replace(/\s+/g, ' ');

    // 6. 最終フォーマットチェック（R[数字] [数字]月分）
    const match = normalized.match(/R(\d+)\s+(\d+)月分/);
    if (match) {
      return `R${match[1]} ${match[2]}月分`;
    }

    // マッチしない場合は元の値を返す（エラーを起こさない）
    return rawDate;
>>>>>>> recovery-7d2-clean
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // 料金年月分の場合は自動正規化
    if (name === 'billingDate') {
      const normalized = normalizeBillingDate(value);
      setNewBillData(prev => ({ ...prev, [name]: normalized }));
    } else {
      setNewBillData(prev => ({ ...prev, [name]: value }));
    }
>>>>>>> Stashed changes
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
      setMessage('画像ファイルをアップロードしてください。');
      return;
    }
    setMessage('');
    setUploadedImageBase64(null);
    setOcrResultJson(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImageBase64(e.target.result);
      setMessage('画像が読み込まれました。「OCR解析実行」ボタンを押してください。');
    };
    reader.onerror = () => setMessage('画像の読み込み中にエラーが発生しました。');
    reader.readAsDataURL(file);
  };

  const handleOCRProcess = async () => {
    if (!uploadedImageBase64) {
      setMessage('画像を先にアップロードしてください。');
      return;
    }
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    setIsProcessing(true);
    setMessage('画像をAIが解析中です... (約5〜10秒かかることがあります)');
    const mimeType = uploadedImageBase64.substring(5, uploadedImageBase64.indexOf(';'));
    const base64Data = uploadedImageBase64.split(',')[1];
    const systemPrompt = "あなたは電気の検針票から正確な数値と契約情報を抽出する専門家です。指示された情報を厳密にJSON形式でのみ出力してください。余計な説明やコメントは一切含めないでください。";
    const userQuery = "添付された電気の検針票画像から、以下の情報を厳密にJSON形式で抽出しなさい。特に、料金の契約種別またはプラン名と、料金年月分（例: R7 6月分）をテキストとして正確に抽出してください。";
    const responseSchema = {
        type: "OBJECT",
        properties: {
            "usageKwh": { 
                "type": "NUMBER", 
                "description": "使用電力量 (kWh)。小数点以下も含む。必ず数値として出力。" 
            },
            "totalCost": { 
                "type": "NUMBER", 
                "description": "合計請求金額 (円)。必ず数値として出力。カンマは除去すること。" 
            },
            "periodDays": { 
                "type": "NUMBER", 
                "description": "検針期間の日数。必ず数値として出力。" 
            },
            "billingDate": { 
                "type": "STRING", 
                "description": "料金年月分を必ず「R[数字][半角スペース][数字]月分」の厳密な形式で出力すること。例: 'R7 6月分'。券面が「令和7年6月分」なら「R7 6月分」に変換。券面が「R76月分」（スペースなし）なら「R7 6月分」に修正。スペースは必ず半角1つ。数字も必ず半角。この形式以外では出力しないこと。日付が完全に不明な場合のみ空文字列。" 
            },
            "contractName": { 
                "type": "STRING", 
                "description": "電気の契約種別またはプラン名を正確に抽出すること。例: 低圧電力α, 灯季時別, 従量電灯B。表記ゆれに注意し統一すること（例:「低圧電力α」と「低圧電力a」は同じものとして「低圧電力α」で統一）。ギリシャ文字のαは必ずαで出力。" 
            }
        },
        propertyOrdering: ["usageKwh", "totalCost", "periodDays", "billingDate", "contractName"]
    };
    const payload = {
        contents: [{ role: "user", parts: [{ text: userQuery }, { inlineData: { mimeType, data: base64Data } }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema }
    };
    
=======

>>>>>>> Stashed changes
=======

>>>>>>> Stashed changes
    // 環境変数からAPIキーを取得（セキュリティ対策）
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey || apiKey === 'ここにGemini APIキーを入力') {
      setMessage('⚠️ Gemini APIキーが設定されていません。.env.localファイルにAPIキーを設定してください。');
      return;
    }
<<<<<<< HEAD
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
=======
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
>>>>>>> recovery-7d2-clean
    try {
        const response = await fetchWithExponentialBackoff(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API response was not ok: ${response.statusText}`);
        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error("APIから有効なJSON応答が得られませんでした。");
        const parsedJson = JSON.parse(jsonText);
        setOcrResultJson(parsedJson);
        setNewBillData(prev => ({
            ...prev,
            usageKwh: parsedJson.usageKwh !== undefined ? String(parsedJson.usageKwh) : '',
            totalCost: parsedJson.totalCost !== undefined ? String(parsedJson.totalCost) : '',
            periodDays: parsedJson.periodDays !== undefined ? String(parsedJson.periodDays) : '',
            billingDate: normalizeBillingDate(parsedJson.billingDate || ''),
            contractType: parsedJson.contractName || prev.contractType, 
        }));
<<<<<<< HEAD
        setMessage('✅ OCR解析が完了し、フォームにデータが自動入力されました。料金年月分は自動的に「R7 6月分」形式に統一されています。');
=======
        setMessage('✅ OCR解析が完了し、フォームにデータが自動入力されました。');
=======

    setIsProcessing(true);
    setMessage('画像をAIが解析中です... (約5〜10秒かかることがあります)');

    const userQuery = "画像から以下の項目を抽出し、JSONで出力してください。\n\n1. 合計金額(円)\n2. 使用電力量(kWh)\n3. 検針期間の日数(30などの数値のみ)\n4. 契約種別\n5. 料金年月(R7 6月分)\n\n【最重要注意事項】\n・料金年月は「○ヶ月分」ではなく、必ず「○月分」です。「1ヶ月分」は間違いです。\n・契約種別の末尾にある記号（α、βなど）は絶対に見落とさないでください。「低圧電力」ではなく「低圧電力α」のように正確に。";
    const responseSchema = {
      type: "OBJECT",
      properties: {
        "usageKwh": {
          "type": "NUMBER",
          "description": "使用電力量 (kWh)。"
        },
        "totalCost": {
          "type": "NUMBER",
          "description": "合計請求金額 (円)。"
        },
        "periodDays": {
          "type": "NUMBER",
          "description": "検針期間の日数。「30日」や「29日」などの「日数」を抽出すること。「6月1日〜6月30日」のような日付範囲は絶対に含めない。純粋な数値のみ。"
        },
        "billingDate": {
          "type": "STRING",
          "description": "料金年月分。「R[数字] [数字]月分」形式。例: 'R7 6月分'。"
        },
        "contractName": {
          "type": "STRING",
          "description": "電気の契約種別。特に「低圧電力α」の「α」や「灯季時別」等を正確に抽出すること。記号を省略しない。"
        }
      },
      propertyOrdering: ["usageKwh", "totalCost", "periodDays", "billingDate", "contractName"]
    };

    try {
=======

    setIsProcessing(true);
    setMessage('画像をAIが解析中です... (約5〜10秒かかることがあります)');

    const userQuery = "画像から以下の項目を抽出し、JSONで出力してください。\n\n1. 合計金額(円)\n2. 使用電力量(kWh)\n3. 検針期間の日数(30などの数値のみ)\n4. 契約種別\n5. 料金年月(R7 6月分)\n\n【最重要注意事項】\n・料金年月は「○ヶ月分」ではなく、必ず「○月分」です。「1ヶ月分」は間違いです。\n・契約種別の末尾にある記号（α、βなど）は絶対に見落とさないでください。「低圧電力」ではなく「低圧電力α」のように正確に。";
    const responseSchema = {
      type: "OBJECT",
      properties: {
        "usageKwh": {
          "type": "NUMBER",
          "description": "使用電力量 (kWh)。"
        },
        "totalCost": {
          "type": "NUMBER",
          "description": "合計請求金額 (円)。"
        },
        "periodDays": {
          "type": "NUMBER",
          "description": "検針期間の日数。「30日」や「29日」などの「日数」を抽出すること。「6月1日〜6月30日」のような日付範囲は絶対に含めない。純粋な数値のみ。"
        },
        "billingDate": {
          "type": "STRING",
          "description": "料金年月分。「R[数字] [数字]月分」形式。例: 'R7 6月分'。"
        },
        "contractName": {
          "type": "STRING",
          "description": "電気の契約種別。特に「低圧電力α」の「α」や「灯季時別」等を正確に抽出すること。記号を省略しない。"
        }
      },
      propertyOrdering: ["usageKwh", "totalCost", "periodDays", "billingDate", "contractName"]
    };

    try {
>>>>>>> Stashed changes
      const parsedJson = await performOCR(uploadedImageBase64, apiKey, responseSchema, userQuery);

      if (!parsedJson) throw new Error("APIから有効なJSON応答が得られませんでした。");

      setOcrResultJson(parsedJson);
      setNewBillData(prev => ({
        ...prev,
        usageKwh: parsedJson.usageKwh !== undefined ? String(parsedJson.usageKwh) : '',
        totalCost: parsedJson.totalCost !== undefined ? String(parsedJson.totalCost) : '',
        periodDays: parsedJson.periodDays !== undefined ? String(parsedJson.periodDays) : '',
        billingDate: normalizeBillingDate(parsedJson.billingDate || ''),
        contractType: parsedJson.contractName || prev.contractType,
      }));
      setMessage('✅ OCR解析が完了し、フォームにデータが自動入力されました。料金年月分は自動的に「R7 6月分」形式に統一されています。');
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
>>>>>>> recovery-7d2-clean
    } catch (error) {
      console.error('OCR API Error:', error);
      setMessage(`OCR解析エラー: ${error.message}。手動でデータを入力してください。`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addHistory = async (action, details) => {
    try {
      const historyCollectionPath = `artifacts/${appId}/energy_bills_history`;
      await addDoc(collection(db, historyCollectionPath), {
        action,
        details,
        recorderName: currentUser,
        timestamp: serverTimestamp(),
        userId: userId,
      });
    } catch (error) {
      console.error("操作履歴の保存に失敗しました: ", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const { recorderName, contractType, usageKwh, totalCost, periodDays } = newBillData;
    if (!recorderName || !contractType || !usageKwh || !totalCost || !periodDays) {
      setMessage('記録者名、契約種別、使用量、料金、日数は必須です。');
      return;
    }
    if (isNaN(Number(usageKwh)) || isNaN(Number(totalCost)) || isNaN(Number(periodDays))) {
      setMessage('使用量、料金、日数は有効な数値で入力してください。');
      return;
    }
    const collectionPath = `artifacts/${appId}/energy_bills`;
    const dataToSave = {
      ...newBillData,
      usageKwh: Number(usageKwh),
      totalCost: Number(totalCost),
      periodDays: Number(periodDays),
      timestamp: serverTimestamp(),
      authorId: userId, // Firebase AuthのUIDを記録
    };
    try {
      const docRef = await addDoc(collection(db, collectionPath), dataToSave);
      await addHistory('登録', `ID:${docRef.id}「${contractType}」のデータを登録しました。`);
      setMessage(`「${recorderName} - ${contractType}」の検針票データを正常に登録しました！`);
      setNewBillData({ recorderName: currentUser, contractType: '', billingDate: '', usageKwh: '', totalCost: '', periodDays: '', notes: '' });
      setUploadedImageBase64(null);
      setOcrResultJson(null);
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage(`データ登録エラー: ${error.message}`);
    }
  };

  const handleDelete = async (id, billData) => {
    if (!db || !userId || !appId) return;
    try {
      const docPath = `artifacts/${appId}/energy_bills/${id}`;
      await deleteDoc(doc(db, docPath));
      await addHistory('削除', `ID:${id}「${billData.contractType}」のデータを削除しました。`);
      setMessage(`データ ID:${id} を削除しました。`);
    } catch (error) {
      console.error("Error deleting document: ", error);
      setMessage(`データ削除エラー: ${error.message}`);
    }
  };

  const handleExportCSV = () => {
    if (filteredBills.length === 0) {
      setMessage('エクスポート対象のデータがありません。');
      return;
    }
    const headers = ["記録者名", "契約種別", "料金年月分", "日数", "使用量(kWh)", "合計料金(円)", "日平均使用量(kWh/日)", "日平均料金(円/日)", "メモ"];
    const rows = filteredBills.map(bill => [
      `"${(bill.recorderName || '').replace(/"/g, '""')}"`,
      `"${(bill.contractType || '').replace(/"/g, '""')}"`,
      `"${(bill.billingDate || formatDate(bill.timestamp)).replace(/"/g, '""')}"`,
      bill.periodDays, bill.usageKwh.toFixed(2), bill.totalCost.toFixed(0),
      bill.dailyUsage.toFixed(2), bill.dailyCost.toFixed(2),
      `"${(bill.notes || '').replace(/"/g, '""')}"`
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.setAttribute("href", url);
    link.setAttribute("download", `電気料金履歴_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage('表示されているデータをCSVファイルとしてエクスポートしました。');
  };

  const getFilterModeLabel = (mode) => {
    switch (mode) {
      case 'All_Records': return '全ての記録 (パターン0)';
      case 'Contract_Alpha': return '低圧電力α (パターン1)';
      case 'Contract_Toukijibetsu': return '灯季時別 (パターン2)';
      case 'Contract_Combined': return '低圧電力α / 灯季時別 合算 (パターン3)';
      default: return 'フィルタリングなし';
    }
  };

  const uniqueRecorders = useMemo(() => {
    const recorders = new Set(bills.map(b => b.recorderName));
    return ['all', ...Array.from(recorders)];
  }, [bills]);

  const filteredBills = useMemo(() => {
    let recordsToUse = bills;

    // 管理者用の記録者名フィルタ
    if (isAdmin && adminRecorderFilter !== 'all') {
      recordsToUse = recordsToUse.filter(bill => bill.recorderName === adminRecorderFilter);
    }

    if (selectedFilterMode === 'Contract_Alpha') {
      recordsToUse = recordsToUse.filter(bill => bill.contractType && bill.contractType.includes('低圧電力α'));
    } else if (selectedFilterMode === 'Contract_Toukijibetsu') {
      recordsToUse = recordsToUse.filter(bill => bill.contractType && bill.contractType.includes('灯季時別'));
    } else if (selectedFilterMode === 'Contract_Combined') {
      recordsToUse = recordsToUse.filter(bill => bill.billingDate && bill.contractType && (bill.contractType.includes('低圧電力α') || bill.contractType.includes('灯季時別')));
      if (recordsToUse.length > 0) {
        const groupedByDate = recordsToUse.reduce((acc, bill) => {
          const dateKey = bill.billingDate;
          if (!dateKey) return acc;
          if (!acc[dateKey]) {
            // グループの初期化
            acc[dateKey] = {
              recorderName: bill.recorderName,
              contractType: `合算 (${dateKey})`,
              billingDate: dateKey,
              usageKwh: 0, // 合算用
              totalCost: 0, // 合算用
              periodDays: bill.periodDays, // ★ 最初のレコードの日数を採用
              timestamp: bill.timestamp,
              originalBillIds: [],
              originalContractTypes: [],
              notes: `合算元: ${bill.contractType}`, // 初期ノート
            };
          }

          // --- 合算ロジック ---
          acc[dateKey].usageKwh += bill.usageKwh; // 使用量を合算
          acc[dateKey].totalCost += bill.totalCost; // 料金を合算
          // periodDays は合算しない (最初の値を使用)

          // ---------------------

          acc[dateKey].originalBillIds.push(bill.id);
          if (!acc[dateKey].originalContractTypes.includes(bill.contractType)) {
            acc[dateKey].originalContractTypes.push(bill.contractType);
          }
          // ノートを更新（デバッグ用）
          acc[dateKey].notes = `合算元: ${acc[dateKey].originalContractTypes.join(' + ')}`;

          return acc;
        }, {});
        recordsToUse = Object.values(groupedByDate).map(record => ({
          ...record,
          contractType: `合算: ${record.originalContractTypes.sort().join(' + ')}`,
          notes: `合算された記録 (料金年月分: ${record.billingDate})`,
          id: record.originalBillIds.sort().join('_'),
        }));
      }
    }
    recordsToUse.sort((a, b) => (b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0) - (a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0));
    return recordsToUse.map(bill => {
      const dailyUsage = bill.periodDays > 0 ? (bill.usageKwh / bill.periodDays) : 0;
      const dailyCost = bill.periodDays > 0 ? (bill.totalCost / bill.periodDays) : 0;
      return { ...bill, dailyUsage, dailyCost };
    });
  }, [bills, selectedFilterMode, adminRecorderFilter, isAdmin]);

  const comparisonResult = useMemo(() => {
    if (filteredBills.length < 2) return { status: 'none' };
    const latestBill = filteredBills[0];
    const historicalBills = filteredBills.slice(1);
    const totalHistoricalCost = historicalBills.reduce((sum, bill) => sum + bill.dailyCost, 0);
    const historicalAvgDailyCost = historicalBills.length > 0 ? totalHistoricalCost / historicalBills.length : 0;
    const costDifference = latestBill.dailyCost - historicalAvgDailyCost;
    const costPercentChange = historicalAvgDailyCost > 0 ? (costDifference / historicalAvgDailyCost) * 100 : 0;
    const isCostImproved = costDifference < 0;
    return { status: isCostImproved ? 'improved' : 'worse', latestBill, historicalAvgDailyCost, costDifference, costPercentChange };
  }, [filteredBills]);

  const renderComparison = () => {
    const filterLabel = getFilterModeLabel(selectedFilterMode);
    if (comparisonResult.status === 'none') {
      return (
        <div className="text-center p-4 bg-yellow-100 text-yellow-800 rounded-xl shadow-lg border-2 border-yellow-300">
          <p>現在選択されている記録（{filterLabel}）のデータが2件未満のため、比較できません。</p>
        </div>
      );
    }
    const { status, latestBill, historicalAvgDailyCost, costDifference, costPercentChange } = comparisonResult;
    const isImproved = status === 'improved';
    const bgColor = isImproved ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400';
    const textColor = isImproved ? 'text-green-800' : 'text-red-800';
    return (
      <div className={`p-5 rounded-2xl shadow-xl ${bgColor} border-4`}>
        <h3 className="text-xl font-bold mb-2 flex items-center justify-between">
          <span>📈 {filterLabel} の最新データ比較結果</span>
          <span className={`text-2xl font-extrabold ${textColor}`}>{isImproved ? '節約達成!' : '要改善'}</span>
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm border-t border-gray-300 pt-3">
          <div><p className="font-medium text-gray-600">最新の日平均料金</p><p className="text-lg font-semibold text-gray-900">{latestBill.dailyCost.toFixed(2)} 円/日</p></div>
          <div><p className="font-medium text-gray-600">過去の平均日料金</p><p className="text-lg font-semibold text-gray-900">{historicalAvgDailyCost.toFixed(2)} 円/日</p></div>
        </div>
        <div className={`mt-4 p-3 rounded-lg ${isImproved ? 'bg-green-200' : 'bg-red-200'} text-center`}>
          <p className="font-bold text-lg">最新の請求は過去平均より:</p>
          <p className={`text-3xl font-extrabold flex items-center justify-center ${isImproved ? 'text-green-600' : 'text-red-600'} mt-1`}>
            {isImproved ? '↓' : '↑'} {Math.abs(costDifference).toFixed(2)} 円/日 ({Math.abs(costPercentChange).toFixed(1)}%) {isImproved ? ' 安い' : ' 高い'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <header className="bg-indigo-600 text-white p-2 md:p-3 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-base md:text-lg font-bold">💡 電気料金比較表</h1>
          <p className="text-xs opacity-90">ようこそ, {isAdmin ? `管理者 ${currentUser}` : currentUser || 'ゲストユーザー'} さん</p>
        </div>
        <button onClick={onLogout} className="px-2 py-1 md:px-3 md:py-2 bg-red-500 hover:bg-red-600 text-white text-xs md:text-sm font-semibold rounded-lg shadow-md">ログアウト</button>
      </header>
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        {message && <div className="p-3 mb-6 rounded-lg bg-indigo-100 text-indigo-700 font-medium shadow-md">{message}</div>}
        <section className="mb-8">{renderComparison()}</section>
        <section className="bg-white p-4 md:p-6 rounded-2xl shadow-xl mb-6 md:mb-10 border border-indigo-200">
          <h2 className="text-lg md:text-2xl font-bold text-indigo-800 mb-3 md:mb-5 border-b pb-2">📸 OCR機能: 検針票の画像をアップロード</h2>
          <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isProcessing} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mb-4" />
          {uploadedImageBase64 && (
<<<<<<< HEAD
            <div className="space-y-6">
              {/* OCR解析ボタン（最上部に配置） */}
              <button 
                onClick={handleOCRProcess} 
                disabled={isProcessing} 
                className="w-full px-6 py-4 text-xl md:text-2xl border border-transparent rounded-xl shadow-2xl text-white font-bold bg-green-500 hover:bg-green-600 disabled:opacity-50 flex items-center justify-center transition-all"
              >
                {isProcessing ? '🔄 AI解析中...' : '✨ OCR解析を実行する'}
              </button>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 左側：アップロードした画像 */}
                <div className="border-4 border-blue-400 rounded-xl p-4 bg-blue-50">
                  <h3 className="text-xl md:text-2xl font-bold mb-3 text-blue-800 flex items-center">
                    📷 撮影した検針票
                  </h3>
                  <div className="relative">
                    <img 
                      src={uploadedImageBase64} 
                      alt="検針票" 
                      className="w-full max-w-2xl cursor-pointer border-2 border-gray-300 rounded-lg shadow-lg hover:shadow-2xl transition-shadow" 
                      onClick={() => setIsImageZoomed(true)}
                      style={{ maxHeight: '500px', objectFit: 'contain' }}
                    />
                    <p className="text-center mt-3 text-blue-700 font-bold text-lg">
                      👆 クリックで拡大表示
                    </p>
                  </div>
                </div>

                {/* 右側：OCR読み取り結果（超大きい文字） */}
                <div className="border-4 border-green-400 rounded-xl p-4 bg-green-50">
                  <h3 className="text-xl md:text-2xl font-bold mb-3 text-green-800 flex items-center">
                    ✅ 読み取り結果
                  </h3>
                  
                  {ocrResultJson ? (
                    <div className="space-y-4">
                      {/* 料金年月分 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📅 料金年月分</p>
                        <p className="text-3xl md:text-4xl font-bold text-blue-600">
                          {ocrResultJson.billingDate || '未入力'}
                        </p>
                      </div>

                      {/* 契約種別 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📋 契約種別</p>
                        <p className="text-2xl md:text-3xl font-bold text-indigo-600">
                          {ocrResultJson.contractName || '未入力'}
                        </p>
                      </div>

                      {/* 使用量 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">⚡ 使用量</p>
                        <p className="text-3xl md:text-4xl font-bold text-green-600">
                          {ocrResultJson.usageKwh} <span className="text-2xl">kWh</span>
                        </p>
                      </div>

                      {/* 料金 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">💰 合計料金</p>
                        <p className="text-4xl md:text-5xl font-bold text-red-600">
                          {ocrResultJson.totalCost?.toLocaleString()} <span className="text-2xl">円</span>
                        </p>
                      </div>

                      {/* 日数 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📆 検針期間</p>
                        <p className="text-3xl md:text-4xl font-bold text-purple-600">
                          {ocrResultJson.periodDays} <span className="text-2xl">日</span>
                        </p>
                      </div>

                      <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mt-4">
                        <p className="text-lg md:text-xl font-bold text-yellow-800 text-center">
                          👆 この内容で間違いありませんか？
                        </p>
                        <p className="text-base text-gray-700 text-center mt-2">
                          間違いがあれば、下のフォームで修正できます
                        </p>
                      </div>
                    </div>
=======
<<<<<<< Updated upstream
            <div className="flex flex-col md:flex-row gap-4 mb-4 items-start">
              <div className="md:w-1/3 w-full border border-gray-300 rounded-lg p-2 bg-gray-50">
                <img src={uploadedImageBase64} alt="Uploaded Bill" className="w-full max-w-xs max-h-64 object-contain h-auto rounded-lg shadow-md" />
              </div>
              <div className="md:w-2/3 w-full space-y-3">
                <button onClick={handleOCRProcess} disabled={isProcessing} className="w-full px-6 py-3 border border-transparent rounded-lg shadow-lg text-white font-semibold bg-green-400 hover:bg-green-500 disabled:opacity-50 flex items-center justify-center">
                  {isProcessing ? 'AI解析中...' : 'OCR解析を実行する'}
                </button>
                {ocrResultJson && (
                    <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-sm">
                        <pre className="whitespace-pre-wrap break-words text-xs text-gray-600 bg-gray-200 p-2 rounded">{JSON.stringify(ocrResultJson, null, 2)}</pre>
                    </div>
=======
            <div className="space-y-6">
              {/* OCR解析ボタン（最上部に配置） */}
              <button
                onClick={handleOCRProcess}
                disabled={isProcessing}
                className="w-full px-6 py-4 text-xl md:text-2xl border border-transparent rounded-xl shadow-2xl text-white font-bold bg-green-500 hover:bg-green-600 disabled:opacity-50 flex items-center justify-center transition-all"
              >
                {isProcessing ? '🔄 AI解析中...' : '✨ OCR解析を実行する'}
              </button>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 左側：アップロードした画像 */}
                <div className="border-4 border-blue-400 rounded-xl p-4 bg-blue-50">
                  <h3 className="text-xl md:text-2xl font-bold mb-3 text-blue-800 flex items-center">
                    📷 撮影した検針票
                  </h3>
                  <div className="relative">
                    <img
                      src={uploadedImageBase64}
                      alt="検針票"
                      className="w-full max-w-2xl cursor-pointer border-2 border-gray-300 rounded-lg shadow-lg hover:shadow-2xl transition-shadow"
                      onClick={() => setIsImageZoomed(true)}
                      style={{ maxHeight: '500px', objectFit: 'contain' }}
                    />
                    <p className="text-center mt-3 text-blue-700 font-bold text-lg">
                      👆 クリックで拡大表示
                    </p>
                  </div>
                </div>

                {/* 右側：OCR読み取り結果（超大きい文字） */}
                <div className="border-4 border-green-400 rounded-xl p-4 bg-green-50">
                  <h3 className="text-xl md:text-2xl font-bold mb-3 text-green-800 flex items-center">
                    ✅ 読み取り結果
                  </h3>

                  {ocrResultJson ? (
                    <div className="space-y-4">
                      {/* 料金年月分 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📅 料金年月分</p>
                        <p className="text-3xl md:text-4xl font-bold text-blue-600">
                          {ocrResultJson.billingDate || '未入力'}
                        </p>
                      </div>

                      {/* 契約種別 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📋 契約種別</p>
                        <p className="text-2xl md:text-3xl font-bold text-indigo-600">
                          {ocrResultJson.contractName || '未入力'}
                        </p>
                      </div>

                      {/* 使用量 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">⚡ 使用量</p>
                        <p className="text-3xl md:text-4xl font-bold text-green-600">
                          {ocrResultJson.usageKwh} <span className="text-2xl">kWh</span>
                        </p>
                      </div>

                      {/* 料金 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">💰 合計料金</p>
                        <p className="text-4xl md:text-5xl font-bold text-red-600">
                          {ocrResultJson.totalCost?.toLocaleString()} <span className="text-2xl">円</span>
                        </p>
                      </div>

                      {/* 日数 */}
                      <div className="bg-white p-4 rounded-lg shadow-md border-2 border-gray-200">
                        <p className="text-sm text-gray-600 font-medium mb-1">📆 検針期間 (日数)</p>
                        <p className="text-3xl md:text-4xl font-bold text-purple-600">
                          {ocrResultJson.periodDays} <span className="text-2xl">日</span>
                        </p>
                      </div>


                    </div>
>>>>>>> recovery-7d2-clean
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-400">
                      <div className="text-center">
                        <p className="text-2xl mb-2">📸</p>
                        <p className="text-lg">OCR解析を実行してください</p>
                      </div>
                    </div>
                  )}
                </div>
<<<<<<< HEAD
=======
                {/* 確認メッセージ（欄外・下に配置） */}
                {ocrResultJson && (
                  <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mt-4 shadow-lg">
                    <p className="text-lg md:text-xl font-bold text-yellow-800 text-center">
                      👆 この内容で間違いありませんか？
                    </p>
                    <p className="text-base text-gray-700 text-center mt-2">
                      間違いがあれば、下のフォームで修正できます
                    </p>
                  </div>
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
                )}
>>>>>>> recovery-7d2-clean
              </div>

              {/* デバッグ用の生JSON表示（小さく表示） */}
              {ocrResultJson && (
                <details className="bg-gray-100 border border-gray-300 rounded-lg p-3">
                  <summary className="cursor-pointer text-sm text-gray-600 font-medium">
                    🔍 詳細データ（開発者向け）
                  </summary>
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-600 bg-white p-2 rounded mt-2">
                    {JSON.stringify(ocrResultJson, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>
<<<<<<< HEAD
        <section className="bg-white p-4 md:p-6 rounded-2xl shadow-xl mb-6 md:mb-10 border-4 border-yellow-300">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-5 border-b-4 pb-3 flex items-center">
            📝 検針票データの登録・編集
            <span className="ml-4 text-lg text-yellow-600">(OCR結果を確認・修正できます)</span>
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1カラムレイアウトに変更（ずれを防ぐ） */}
            <div className="space-y-6">
              {/* 記録者名 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  👤 記録者名
                </label>
                <input 
                  type="text" 
                  name="recorderName" 
                  value={newBillData.recorderName} 
                  onChange={handleChange} 
                  readOnly={!isAdmin} 
                  className={`block w-full rounded-xl border-4 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 ${!isAdmin ? 'bg-gray-100' : 'border-gray-300'}`}
                  style={{ fontSize: '28px' }}
                />
              </div>
=======
<<<<<<< Updated upstream
        <section className="bg-white p-4 md:p-6 rounded-2xl shadow-xl mb-6 md:mb-10 border border-gray-200">
          <h2 className="text-lg md:text-2xl font-bold text-gray-800 mb-3 md:mb-5 border-b pb-2">📝 検針票データの登録・編集</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700">記録者名</label>
                <input type="text" name="recorderName" value={newBillData.recorderName} onChange={handleChange} readOnly={!isAdmin} className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border text-base md:text-lg font-semibold ${!isAdmin ? 'bg-gray-100' : ''}`} />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700">契約種別 (必須) <span className="text-red-500">*</span></label>
                <input type="text" name="contractType" value={newBillData.contractType} onChange={handleChange} placeholder="例: 低圧電力α, 灯季時別" required className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500 text-base md:text-lg font-semibold" />
=======
        <section className="bg-white p-4 md:p-6 rounded-2xl shadow-xl mb-6 md:mb-10 border-4 border-yellow-300">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-5 border-b-4 pb-3 flex items-center">
            📝 検針票データの登録・編集
            <span className="ml-4 text-lg text-yellow-600">(OCR結果を確認・修正できます)</span>
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1カラムレイアウトに変更（ずれを防ぐ） */}
            <div className="space-y-6">
              {/* 記録者名 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  👤 記録者名
                </label>
                <input
                  type="text"
                  name="recorderName"
                  value={newBillData.recorderName}
                  onChange={handleChange}
                  readOnly={!isAdmin}
                  className={`block w-full rounded-xl border-4 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 ${!isAdmin ? 'bg-gray-100' : 'border-gray-300'}`}
                  style={{ fontSize: '28px' }}
                />
              </div>
>>>>>>> recovery-7d2-clean

              {/* 契約種別 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  📋 契約種別 <span className="text-red-500 text-3xl">*</span>
                </label>
<<<<<<< HEAD
                <input 
                  type="text" 
                  name="contractType" 
                  value={newBillData.contractType} 
                  onChange={handleChange} 
                  placeholder="例: 低圧電力α" 
                  required 
=======
                <input
                  type="text"
                  name="contractType"
                  value={newBillData.contractType}
                  onChange={handleChange}
                  placeholder="例: 低圧電力α"
                  required
>>>>>>> recovery-7d2-clean
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
              </div>

              {/* 料金年月分 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  📅 料金年月分
                </label>
<<<<<<< HEAD
                <input 
                  type="text" 
                  name="billingDate" 
                  value={newBillData.billingDate} 
                  onChange={handleChange} 
                  placeholder="例: R7 6月分" 
=======
                <input
                  type="text"
                  name="billingDate"
                  value={newBillData.billingDate}
                  onChange={handleChange}
                  placeholder="例: R7 6月分"
>>>>>>> recovery-7d2-clean
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
              </div>

              {/* 使用量 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  ⚡ 使用量 (kWh) <span className="text-red-500 text-3xl">*</span>
                </label>
<<<<<<< HEAD
                <input 
                  type="number" 
                  name="usageKwh" 
                  value={newBillData.usageKwh} 
                  onChange={handleChange} 
                  placeholder="例: 350.5" 
                  required 
                  step="0.01" 
=======
                <input
                  type="number"
                  name="usageKwh"
                  value={newBillData.usageKwh}
                  onChange={handleChange}
                  placeholder="例: 350.5"
                  required
                  step="0.01"
>>>>>>> recovery-7d2-clean
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
              </div>

              {/* 合計料金 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  💰 合計料金 (円) <span className="text-red-500 text-3xl">*</span>
                </label>
<<<<<<< HEAD
                <input 
                  type="number" 
                  name="totalCost" 
                  value={newBillData.totalCost} 
                  onChange={handleChange} 
                  placeholder="例: 12500" 
                  required 
                  step="1" 
=======
                <input
                  type="number"
                  name="totalCost"
                  value={newBillData.totalCost}
                  onChange={handleChange}
                  placeholder="例: 12500"
                  required
                  step="1"
>>>>>>> recovery-7d2-clean
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
              </div>

              {/* 検針期間 */}
              <div>
                <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                  📆 検針期間 (日) <span className="text-red-500 text-3xl">*</span>
                </label>
<<<<<<< HEAD
                <input 
                  type="number" 
                  name="periodDays" 
                  value={newBillData.periodDays} 
                  onChange={handleChange} 
                  placeholder="例: 30" 
                  required 
                  step="1" 
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
=======
                <input
                  type="number"
                  name="periodDays"
                  value={newBillData.periodDays}
                  onChange={handleChange}
                  placeholder="例: 30"
                  required
                  step="1"
                  className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-2xl md:text-3xl font-bold focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
                  style={{ fontSize: '28px' }}
                />
>>>>>>> Stashed changes
>>>>>>> recovery-7d2-clean
              </div>
            </div>
<<<<<<< HEAD
=======
<<<<<<< Updated upstream
            <div><label className="block text-sm font-medium text-gray-700">メモ/備考</label><textarea name="notes" value={newBillData.notes} onChange={handleChange} rows="2" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500" placeholder="エアコン使用状況や季節変動など..."></textarea></div>
            <button type="submit" disabled={!db || !userId} className="w-full md:w-auto px-6 py-3 border border-transparent rounded-lg shadow-lg text-white font-semibold bg-sky-400 hover:bg-sky-500 disabled:opacity-50">データを登録する</button>
=======
>>>>>>> recovery-7d2-clean

            {/* メモ欄 */}
            <div>
              <label className="block text-xl md:text-2xl font-bold text-gray-700 mb-2">
                📝 メモ/備考
              </label>
<<<<<<< HEAD
              <textarea 
                name="notes" 
                value={newBillData.notes} 
                onChange={handleChange} 
                rows="3" 
                className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-xl md:text-2xl focus:ring-4 focus:ring-blue-300 focus:border-blue-500" 
=======
              <textarea
                name="notes"
                value={newBillData.notes}
                onChange={handleChange}
                rows="3"
                className="block w-full rounded-xl border-4 border-gray-300 shadow-lg p-4 text-xl md:text-2xl focus:ring-4 focus:ring-blue-300 focus:border-blue-500"
>>>>>>> recovery-7d2-clean
                placeholder="エアコン使用状況や季節変動など..."
                style={{ fontSize: '20px' }}
              ></textarea>
            </div>

            {/* 保存ボタン（超大きい） */}
<<<<<<< HEAD
            <button 
              type="submit" 
              disabled={!db || !userId} 
=======
            <button
              type="submit"
              disabled={!db || !userId}
>>>>>>> recovery-7d2-clean
              className="w-full px-8 py-6 border-4 border-transparent rounded-2xl shadow-2xl text-white font-bold bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-3xl md:text-4xl transition-all transform hover:scale-105"
            >
              ✅ この内容で保存する
            </button>
<<<<<<< HEAD
=======
>>>>>>> Stashed changes
>>>>>>> recovery-7d2-clean
          </form>
        </section>
        <section className="bg-white p-4 md:p-6 rounded-2xl shadow-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 md:mb-5 border-b pb-2 gap-3">
            <h2 className="text-lg md:text-2xl font-bold text-gray-800">📋 登録履歴 ({filteredBills.length} 件)</h2>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 w-full md:w-auto">
              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <label htmlFor="recorderFilter" className="text-sm font-medium text-gray-700">記録者フィルタ:</label>
                  <select id="recorderFilter" value={adminRecorderFilter} onChange={(e) => setAdminRecorderFilter(e.target.value)} className="p-2 border border-gray-300 rounded-lg shadow-sm">
                    {uniqueRecorders.map(name => <option key={name} value={name}>{name === 'all' ? '全ての記録者' : name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center space-x-2"><label htmlFor="recordFilter" className="text-sm font-medium text-gray-700">契約種別フィルタ:</label><select id="recordFilter" value={selectedFilterMode} onChange={(e) => setSelectedFilterMode(e.target.value)} className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"><option value="All_Records">{getFilterModeLabel('All_Records')}</option><option value="Contract_Alpha">{getFilterModeLabel('Contract_Alpha')}</option><option value="Contract_Toukijibetsu">{getFilterModeLabel('Contract_Toukijibetsu')}</option><option value="Contract_Combined">{getFilterModeLabel('Contract_Combined')}</option></select></div>
              <button onClick={handleExportCSV} disabled={filteredBills.length === 0} className="px-4 py-2 bg-green-400 text-white font-semibold rounded-lg shadow-md hover:bg-green-500 disabled:opacity-50 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 7.414V13a1 1 0 11-2 0V7.414L6.293 9.707z" clipRule="evenodd" /></svg>CSV出力</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">記録者名</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">契約種別</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">料金年月分</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日数</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">使用量</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">合計料金</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50">日平均使用量</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-100">日平均料金</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メモ</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBills.length === 0 ? (
                  <tr><td colSpan="10" className="px-3 py-4 text-center text-sm text-gray-500">該当するデータはありません。</td></tr>
                ) : (
                  filteredBills.map((bill, index) => (
                    <tr key={bill.id} className={index === 0 ? 'bg-indigo-50 font-semibold' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{bill.recorderName || '未設定'}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-indigo-700 font-bold">{bill.contractType || '未設定'}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{bill.billingDate || formatDate(bill.timestamp)}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{bill.periodDays}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{bill.usageKwh.toFixed(2)}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{bill.totalCost.toFixed(0)}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 bg-indigo-50">{bill.dailyUsage.toFixed(2)}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 bg-indigo-100">{bill.dailyCost.toFixed(2)}</td>
                      <td className="px-3 py-4 text-sm text-gray-500 max-w-xs overflow-hidden truncate">{bill.notes || '-'}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {bill.id.includes('_') ? (<span className="text-gray-400">元を削除</span>) : (<button onClick={() => handleDelete(bill.id, bill)} className="text-red-600 hover:text-red-900">削除</button>)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
<<<<<<< HEAD

      {/* 画像拡大モーダル（老眼対応） */}
      {isImageZoomed && uploadedImageBase64 && (
        <div 
=======
<<<<<<< Updated upstream
=======

      {/* 画像拡大モーダル（老眼対応） */}
      {isImageZoomed && uploadedImageBase64 && (
        <div
>>>>>>> recovery-7d2-clean
          className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4"
          onClick={() => setIsImageZoomed(false)}
        >
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            {/* 閉じるボタン（右上） */}
<<<<<<< HEAD
            <button 
=======
            <button
>>>>>>> recovery-7d2-clean
              onClick={() => setIsImageZoomed(false)}
              className="absolute top-4 right-4 bg-white hover:bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-full shadow-2xl text-2xl z-10 transition-all"
            >
              ✕ 閉じる
            </button>

            {/* ズーム操作ボタン（右下） */}
            <div className="absolute bottom-4 right-4 flex flex-col space-y-3 z-10">
<<<<<<< HEAD
              <button 
=======
              <button
>>>>>>> recovery-7d2-clean
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomLevel(prev => Math.min(prev + 0.25, 3));
                }}
                className="bg-white hover:bg-gray-200 text-gray-800 font-bold py-3 px-5 rounded-full shadow-2xl text-3xl transition-all"
                title="拡大"
              >
                ➕
              </button>
<<<<<<< HEAD
              <button 
=======
              <button
>>>>>>> recovery-7d2-clean
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomLevel(1);
                }}
                className="bg-white hover:bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-full shadow-2xl text-lg transition-all"
                title="リセット"
              >
                100%
              </button>
<<<<<<< HEAD
              <button 
=======
              <button
>>>>>>> recovery-7d2-clean
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
                }}
                className="bg-white hover:bg-gray-200 text-gray-800 font-bold py-3 px-5 rounded-full shadow-2xl text-3xl transition-all"
                title="縮小"
              >
                ➖
              </button>
            </div>

            {/* 説明テキスト（下部中央） */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-6 py-3 rounded-full z-10">
              <p className="text-lg md:text-xl font-bold text-center">
                📱 スマホ：ピンチで拡大縮小 | 🖱️ PC：+/- ボタンで拡大縮小
              </p>
            </div>

            {/* 画像本体 */}
<<<<<<< HEAD
            <div 
              className="overflow-auto max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={uploadedImageBase64} 
                alt="検針票（拡大表示）" 
                className="transition-transform duration-300"
                style={{ 
=======
            <div
              className="overflow-auto max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={uploadedImageBase64}
                alt="検針票（拡大表示）"
                className="transition-transform duration-300"
                style={{
>>>>>>> recovery-7d2-clean
                  transform: `scale(${zoomLevel})`,
                  maxWidth: 'none',
                  cursor: 'grab'
                }}
              />
            </div>
          </div>
        </div>
      )}
<<<<<<< HEAD
=======
>>>>>>> Stashed changes
>>>>>>> recovery-7d2-clean
    </div>
  );
};

// --- ルートコンポーネント (認証状態を管理) ---
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [appId, setAppId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ログイン状態
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // ログイン中のユーザー名 (email)
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Firebase初期化と認証
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) { throw new Error("Firebase設定情報が見つかりません。"); }
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);
      setDb(firestore);
      setAuth(authentication);
      setAppId(import.meta.env.VITE_APP_ID || 'default-app-id');

      const unsubscribeAuth = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          try {
            const idTokenResult = await user.getIdTokenResult(true); // Force refresh
            const claims = idTokenResult.claims;
            setIsAdmin(claims.admin === true);
            // 匿名ユーザーの場合はメールアドレスがnullなので、ゲストユーザーと表示
            setCurrentUser(user.isAnonymous ? 'ゲストユーザー' : user.email);
            setUserId(user.uid);
            setIsLoggedIn(true);
          } catch (error) {
            console.error("Error getting user claims:", error);
            // Fallback to non-admin user if claims fail
            setIsAdmin(false);
            setCurrentUser(user.isAnonymous ? 'ゲストユーザー' : user.email);
            setUserId(user.uid);
            setIsLoggedIn(true);
          }
        } else {
          // User is signed out
          setIsLoggedIn(false);
          setCurrentUser(null);
          setUserId(null);
          setIsAdmin(false);
        }
        setLoading(false);
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error("Firebase setup failed:", e);
      setLoginError(`初期化エラー: ${e.message}`);
      setLoading(false);
    }
  }, []);

  const handleLogin = async (email, password) => {
    setLoginError('');
    if (!auth || !email || !password) {
      setLoginError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      console.error("Login failed:", error);
      setLoginError('ログインに失敗しました。メールアドレスまたはパスワードが正しくありません。');
      setLoading(false);
    }
  };

  const handleSignUp = async (email, password) => {
    setLoginError('');
    if (!auth || !email || !password) {
      setLoginError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest (automatically logs in after sign up)
    } catch (error) {
      console.error("Sign up failed:", error);
      let errMsg = '登録に失敗しました。';
      if (error.code === 'auth/email-already-in-use') {
        errMsg = 'このメールアドレスは既に使用されています。';
      } else if (error.code === 'auth/weak-password') {
        errMsg = 'パスワードが短すぎます。6文字以上にしてください。';
      } else {
        errMsg = `登録エラー: ${error.message}`;
      }
      setLoginError(errMsg);
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoginError('');
    if (!auth) {
      setLoginError('認証システムの初期化に失敗しました。');
      return;
    }
    setLoading(true);
    try {
      await signInAnonymously(auth);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      console.error("Guest login failed:", error);
      setLoginError('ゲストログインに失敗しました。再度お試しください。');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      // onAuthStateChanged will handle state cleanup
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {!isLoggedIn ? (
        <LoginScreen onLogin={handleLogin} onSignUp={handleSignUp} onGuestLogin={handleGuestLogin} loginError={loginError} />
      ) : (
        <MainApp
          currentUser={currentUser}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          db={db}
          userId={userId}
          appId={appId}
        />
      )}
      <footer className="bg-gray-800 text-white p-4">
        <div className="container mx-auto text-center text-xs text-gray-400">
          <p>© 2025 Taira Dev. All rights reserved. 無断転載・複製・改変を禁じます。</p>
        </div>
      </footer>
    </>
  );
};

export default App;
