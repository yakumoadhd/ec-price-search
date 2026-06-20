export function cleanProductName(rawName: string): string {
  if (!rawName) return '商品名不明';
  
  let str = rawName;

  // 1. EC特有のスパム的な装飾・記号を根こそぎ削除
  str = str.replace(/[【\[].*?[】\]]/g, ' '); // 【】や[]で囲まれたテキスト
  str = str.replace(/[（\(].*?[）\)]/g, ' '); // ()や（）で囲まれたテキスト
  str = str.replace(/[★☆◆◇■□▲△▼▽●○◎♪]/g, ' '); // 記号系
  str = str.replace(/＼.*?／/g, ' ');

  // 2. メーカー名の除去（純粋に商品名だけにしたいケース）
  const makers = [
    'アサヒ飲料', 'アサヒ', 'サントリー', 'コカ・コーラ', 'コカコーラ', 
    '伊藤園', 'キリンビバレッジ', 'キリン', '大塚製薬', 'ポッカサッポロ', 
    'サンガリア', 'UCC', 'ヤクルト', 'ダイドードリンコ'
  ];
  for (const maker of makers) {
    str = str.replace(new RegExp(`^${maker}\\s*`), '');
    str = str.replace(new RegExp(`${maker}`, 'g'), '');
  }

  // 3. よくあるEC系のノイズワードの除去
  const noiseWords = [
    '送料無料', '送料込', 'あす楽', '正規品', '箱買い', 'まとめ買い',
    'ケース買い', 'クーポン配布中', 'ポイント10倍', 'ポイント最大',
    '期間限定', 'お買い物マラソン', 'スーパーSALE', 'スーパーセール',
    '訳あり', 'アウトレット', 'お試し', 'おためし', 'お得セット',
    'ラベルレスボトル', 'ラベルレス', 'ペットボトル', 'PET', '缶', '瓶',
    '炭酸水', '強炭酸水', '強炭酸', '無糖炭酸', '天然水', 'ミネラルウォーター',
    'お茶', '緑茶', '麦茶', '烏龍茶', 'ウーロン茶', 'ブレンド茶', '飲料', '水',
    'ケース', '選べる', 'セット', 'まとめ売り', 'まとめ', '箱', 'ダース'
  ];
  for (const word of noiseWords) {
    str = str.replace(new RegExp(word, 'g'), ' ');
  }

  // 4. 内容量や本数などの数値情報の除去 (例: 500ml, 2L, 24本, 48本)
  str = str.replace(/\d+\s*(?:ml|l|g|kg|cc)\b/ig, ' ');
  str = str.replace(/\d+\s*本/g, ' ');
  str = str.replace(/\d+\s*箱/g, ' ');
  str = str.replace(/\d+\s*パック/g, ' ');
  str = str.replace(/\s*[x×*]\s*\d+/ig, ' '); // x 24 など

  // 5. 複数スペースを1つにし、前後の空白をトリム
  str = str.replace(/\s+/g, ' ').trim();

  // 6. ピンポイントでのブランド名・シリーズ名の抽出（最強ヒューリスティック）
  // ユーザーの熱い要望に応える「本気の」商品名抽出
  const specificBrands = [
    // 炭酸水・水
    { trigger: 'ウィルキンソン', flavors: ['レモン', 'ピーチ', 'マスカット', 'ウメ', 'ジンジャエール', 'エクストラ', 'ファイア', 'クリアジンジャ'] },
    { trigger: 'い・ろ・は・す', flavors: ['もも', 'みかん', 'シャインマスカット', 'りんご', 'なし'] },
    { trigger: 'いろはす', out: 'い・ろ・は・す', flavors: ['もも', 'みかん', 'シャインマスカット', 'りんご', 'なし'] },
    { trigger: '南アルプスの天然水', flavors: ['スパークリング'] },
    { trigger: 'クリスタルガイザー', flavors: [] },
    { trigger: 'ボルヴィック', flavors: [] },
    { trigger: 'エビアン', flavors: [] },
    { trigger: 'ペリエ', flavors: [] },
    { trigger: 'サンペレグリノ', flavors: [] },
    { trigger: 'アイシー・スパーク', flavors: ['レモン'] },
    
    // お茶
    { trigger: '綾鷹', flavors: ['茶葉のあまみ', 'ほうじ茶', '濃い緑茶', '特選茶'] },
    { trigger: '爽健美茶', flavors: [] },
    { trigger: '伊右衛門', flavors: ['濃い味', '京都ブレンド', '焙じ茶'] },
    { trigger: 'お〜いお茶', flavors: ['濃い茶', 'ほうじ茶', '玄米茶'] },
    { trigger: 'おーいお茶', out: 'お〜いお茶', flavors: ['濃い茶', 'ほうじ茶', '玄米茶'] },
    { trigger: '生茶', flavors: ['ほうじ煎茶'] },
    { trigger: '午後の紅茶', flavors: ['ストレート', 'ミルクティー', 'レモンティー', 'おいしい無糖'] },
    { trigger: '十六茶', flavors: [] },
    { trigger: '健康ミネラルむぎ茶', flavors: [] },
    { trigger: 'やかんの麦茶', flavors: [] },
    { trigger: '緑効青汁', flavors: [] },
    { trigger: '特茶', flavors: [] },
    { trigger: 'からだすこやか茶', flavors: ['W'] },
    { trigger: '黒烏龍茶', flavors: [] },

    // エナジードリンク・炭酸飲料
    { trigger: 'レッドブル', flavors: ['シュガーフリー', 'エディション'] },
    { trigger: 'モンスター', flavors: ['エナジー', 'ゼロシュガー', 'ウルトラ', 'カオス', 'パイプラインパンチ'] },
    { trigger: 'オロナミンC', flavors: [] },
    { trigger: 'デカビタC', flavors: [] },
    { trigger: 'コカ・コーラ', flavors: ['ゼロ', 'プラス'] },
    { trigger: 'コカコーラ', out: 'コカ・コーラ', flavors: ['ゼロ', 'プラス'] },
    { trigger: 'ペプシ', flavors: ['生', 'ゼロ'] },
    { trigger: '三ツ矢サイダー', flavors: [] },
    { trigger: 'スプライト', flavors: [] },
    { trigger: 'ファンタ', flavors: ['グレープ', 'オレンジ'] },
    { trigger: 'カルピス', flavors: ['ウォーター', 'ソーダ'] },
    { trigger: 'ポカリスエット', flavors: ['イオンウォーター'] },
    { trigger: 'アクエリアス', flavors: ['ゼロ'] },
    
    // コーヒー
    { trigger: 'ボス', flavors: ['ブラック', 'カフェオレ', '微糖'] },
    { trigger: 'ジョージア', flavors: ['エメラルドマウンテン', 'ブラック', '微糖'] },
    { trigger: 'ワンダ', flavors: ['モーニングショット', '金の微糖', 'ブラック'] },
    { trigger: 'タリーズ', flavors: ['バリスタズブラック'] }
  ];

  for (const brand of specificBrands) {
    if (str.includes(brand.trigger) || rawName.includes(brand.trigger)) {
      let finalBrandName = brand.out || brand.trigger;
      
      // フレーバーの検出 (元のrawNameにフレーバーが含まれているか確認)
      let detectedFlavor = '';
      for (const flavor of brand.flavors) {
        if (rawName.includes(flavor)) {
          detectedFlavor = flavor;
          break; // 最初に見つかったフレーバーを優先
        }
      }
      
      if (detectedFlavor) {
        return `${finalBrandName} ${detectedFlavor}`;
      }
      
      return finalBrandName;
    }
  }

  // クリーニングした結果が空っぽになってしまったら、ある程度削った結果を返す
  return str.length > 0 ? str : rawName.replace(/[【\[].*?[】\]]/g, '').trim();
}
