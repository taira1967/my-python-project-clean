import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, addDoc, deleteDoc, orderBy, serverTimestamp, setLogLevel, where } from 'firebase/firestore';

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

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-gray-100">
    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
    <p className="ml-4 text-2xl text-indigo-700 font-semibold">準備中です...</p>
  </div>
);

const LoginScreen = ({ onLogin, onGuestLogin, loginError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
            <h1 className="text-3xl font-bold text-indigo-600">💡 電気料金比較表</h1>
            <p className="mt-2 text-gray-600">ログインまたはゲストとして試してください。</p>
      </div>
        
        {/* ゲストログインボタン（試作品用） */}
        <button 
          onClick={onGuestLogin}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-300 flex items-center justify-center"
        >
          <span className="mr-2">🚀</span>
          ゲストとして試す（ログイン不要）
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">または</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-3 rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              placeholder="user@example.com"
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
            />
          </div>
          {loginError && <p className="text-sm text-red-600 bg-red-100 p-3 rounded-lg">{loginError}</p>}
          <button type="submit" className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-300">
            ログイン
          </button>
        </form>
         <div className="text-xs text-center text-gray-500 mt-4">
            <p className="text-green-600 font-semibold">試作品モード：ゲストログインで今すぐ試せます！</p>
            <p className="mt-2">本番運用時は管理者アカウントでログインしてください。</p>
        </div>
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
  
  // 指数バックオフ付きフェッチ関数 (Gemini API呼び出し用)
  const fetchWithExponentialBackoff = async (url, options, maxRetries = 5) => {
      for (let i = 0; i < maxRetries; i++) {
          try {
              const response = await fetch(url, options);
              if (response.status !== 429 && response.status < 500) { return response; }
              if (i === maxRetries - 1) { throw new Error(`Max retries reached. Last status: ${response.status}`); }
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000 + Math.random() * 1000));
          } catch (error) {
              if (i === maxRetries - 1) throw error;
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000 + Math.random() * 1000));
          }
      }
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewBillData(prev => ({ ...prev, [name]: value }));
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
    setIsProcessing(true);
    setMessage('画像をAIが解析中です... (約5〜10秒かかることがあります)');
    const mimeType = uploadedImageBase64.substring(5, uploadedImageBase64.indexOf(';'));
    const base64Data = uploadedImageBase64.split(',')[1];
    const systemPrompt = "あなたは電気の検針票から正確な数値と契約情報を抽出する専門家です。指示された情報を厳密にJSON形式でのみ出力してください。余計な説明やコメントは一切含めないでください。";
    const userQuery = "添付された電気の検針票画像から、以下の情報を厳密にJSON形式で抽出しなさい。特に、料金の契約種別またはプラン名と、料金年月分（例: R7 6月分）をテキストとして正確に抽出してください。";
    const responseSchema = {
        type: "OBJECT",
        properties: {
            "usageKwh": { "type": "NUMBER", "description": "使用電力量 (kWh)。小数点以下も含む。" },
            "totalCost": { "type": "NUMBER", "description": "合計請求金額 (円)。" },
            "periodDays": { "type": "NUMBER", "description": "検針期間の日数。" },
            "billingDate": { "type": "STRING", "description": "料金年月分。券面に記載されている通りのテキスト形式 (例: 'R7 6月分')。日付が不明な場合は空文字列にすること。" },
            "contractName": { "type": "STRING", "description": "電気の契約種別またはプラン名。例: 低圧電力α, 灯季時別, 従量電灯B。" } 
        },
        propertyOrdering: ["usageKwh", "totalCost", "periodDays", "billingDate", "contractName"]
    };
    const payload = {
        contents: [{ role: "user", parts: [{ text: userQuery }, { inlineData: { mimeType, data: base64Data } }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema }
    };
    
    // 環境変数からAPIキーを取得（セキュリティ対策）
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'ここにGemini APIキーを入力') {
      setMessage('⚠️ Gemini APIキーが設定されていません。.env.localファイルにAPIキーを設定してください。');
      setIsProcessing(false);
      return;
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
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
            billingDate: parsedJson.billingDate || '',
            contractType: parsedJson.contractName || prev.contractType, 
        }));
        setMessage('✅ OCR解析が完了し、フォームにデータが自動入力されました。');
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
      <header className="bg-indigo-600 text-white p-5 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">💡 電気料金（日別）期間比較表</h1>
          <p className="text-sm opacity-90 mt-1">ようこそ, {isAdmin ? `管理者 ${currentUser}` : currentUser || 'ゲストユーザー'} さん</p>
        </div>
        <button onClick={onLogout} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-md">ログアウト</button>
      </header>
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        {message && <div className="p-3 mb-6 rounded-lg bg-indigo-100 text-indigo-700 font-medium shadow-md">{message}</div>}
        <section className="mb-8">{renderComparison()}</section>
        <section className="bg-white p-6 rounded-2xl shadow-xl mb-10 border border-indigo-200">
          <h2 className="text-2xl font-bold text-indigo-800 mb-5 border-b pb-2">📸 OCR機能: 検針票の画像をアップロード</h2>
          <input type="file" accept="image/*" onChange={handleImageUpload} disabled={isProcessing} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 mb-4" />
          {uploadedImageBase64 && (
            <div className="flex flex-col md:flex-row gap-4 mb-4 items-start">
              <div className="md:w-1/3 w-full border border-gray-300 rounded-lg p-2 bg-gray-50">
                <img src={uploadedImageBase64} alt="Uploaded Bill" className="max-w-full h-auto rounded-lg shadow-md" />
              </div>
              <div className="md:w-2/3 w-full space-y-3">
                <button onClick={handleOCRProcess} disabled={isProcessing} className="w-full px-6 py-3 border border-transparent rounded-lg shadow-lg text-white font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center">
                  {isProcessing ? 'AI解析中...' : 'OCR解析を実行する'}
                </button>
                {ocrResultJson && (
                    <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-sm">
                        <pre className="whitespace-pre-wrap break-words text-xs text-gray-600 bg-gray-200 p-2 rounded">{JSON.stringify(ocrResultJson, null, 2)}</pre>
                    </div>
                )}
              </div>
            </div>
          )}
        </section>
        <section className="bg-white p-6 rounded-2xl shadow-xl mb-10 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800 mb-5 border-b pb-2">📝 検針票データの登録・編集</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700">記録者名</label>
                <input type="text" name="recorderName" value={newBillData.recorderName} onChange={handleChange} readOnly={!isAdmin} className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border font-semibold text-lg ${!isAdmin ? 'bg-gray-100' : ''}`} />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700">契約種別 (必須) <span className="text-red-500">*</span></label>
                <input type="text" name="contractType" value={newBillData.contractType} onChange={handleChange} placeholder="例: 低圧電力α, 灯季時別" required className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-lg" />
              </div>
              <div className="lg:col-span-1"><label className="block text-sm font-medium text-gray-700">料金年月分</label><input type="text" name="billingDate" value={newBillData.billingDate} onChange={handleChange} placeholder="例: R7 6月分" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500" /></div>
              <div className="lg:col-span-1"><label className="block text-sm font-medium text-gray-700">使用量 (kWh) <span className="text-red-500">*</span></label><input type="number" name="usageKwh" value={newBillData.usageKwh} onChange={handleChange} placeholder="例: 350.5" required step="0.01" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500" /></div>
              <div className="lg:col-span-1"><label className="block text-sm font-medium text-gray-700">合計料金 (円) <span className="text-red-500">*</span></label><input type="number" name="totalCost" value={newBillData.totalCost} onChange={handleChange} placeholder="例: 12500" required step="1" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500" /></div>
              <div className="lg:col-span-1"><label className="block text-sm font-medium text-gray-700">日数 (日) <span className="text-red-500">*</span></label><input type="number" name="periodDays" value={newBillData.periodDays} onChange={handleChange} placeholder="例: 30" required step="1" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700">メモ/備考</label><textarea name="notes" value={newBillData.notes} onChange={handleChange} rows="2" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500" placeholder="エアコン使用状況や季節変動など..."></textarea></div>
            <button type="submit" disabled={!db || !userId} className="w-full md:w-auto px-6 py-3 border border-transparent rounded-lg shadow-lg text-white font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">データを登録する</button>
          </form>
        </section>
        <section className="bg-white p-6 rounded-2xl shadow-xl">
          <div className="flex justify-between items-center mb-5 border-b pb-2">
            <h2 className="text-2xl font-bold text-gray-800">📋 登録履歴 ({filteredBills.length} 件)</h2>
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <label htmlFor="recorderFilter" className="text-sm font-medium text-gray-700">記録者フィルタ:</label>
                  <select id="recorderFilter" value={adminRecorderFilter} onChange={(e) => setAdminRecorderFilter(e.target.value)} className="p-2 border border-gray-300 rounded-lg shadow-sm">
                    {uniqueRecorders.map(name => <option key={name} value={name}>{name === 'all' ? '全ての記録者' : name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center space-x-2"><label htmlFor="recordFilter" className="text-sm font-medium text-gray-700">契約種別フィルタ:</label><select id="recordFilter" value={selectedFilterMode} onChange={(e) => setSelectedFilterMode(e.target.value)} className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"><option value="All_Records">{getFilterModeLabel('All_Records')}</option><option value="Contract_Alpha">{getFilterModeLabel('Contract_Alpha')}</option><option value="Contract_Toukijibetsu">{getFilterModeLabel('Contract_Toukijibetsu')}</option><option value="Contract_Combined">{getFilterModeLabel('Contract_Combined')}</option></select></div>
              <button onClick={handleExportCSV} disabled={filteredBills.length === 0} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 7.414V13a1 1 0 11-2 0V7.414L6.293 9.707z" clipRule="evenodd" /></svg>CSV出力</button>
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
        <LoginScreen onLogin={handleLogin} onGuestLogin={handleGuestLogin} loginError={loginError} />
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
