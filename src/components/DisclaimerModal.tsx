import React from 'react';
import { X } from 'lucide-react';

interface DisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisclaimerModal({ isOpen, onClose }: DisclaimerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex justify-center pt-safe">
      <div className="bg-white w-full h-full md:h-auto md:max-w-2xl md:mt-10 md:rounded-2xl flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <header className="px-4 py-4 border-b border-gray-200 sticky top-0 bg-white flex items-center justify-between shrink-0 md:rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">利用規約および免責事項</h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 text-sm text-gray-700 leading-relaxed space-y-5 scrollbar-hide">
          <p>
            本アプリ（以下「当アプリ」）をご利用いただくにあたり、以下の利用規約および免責事項（以下「本規約」）を必ずお読みください。当アプリをご利用された場合、ユーザーは本規約のすべてに同意したものとみなされます。
          </p>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第1条（当アプリの目的と役割）</h3>
            <p>
              当アプリは、複数のECサイト（Amazon.co.jp、楽天市場、Yahoo!ショッピング等）のAPIを利用し、商品の価格、送料、ポイント、クーポン等の情報を取得・比較し、ユーザーの検索利便性を向上させることを目的とした情報提供ツールです。
            </p>
            <p className="mt-2">
              開発者（当アプリの提供者）は、商品の販売、決済、発送、およびポイントやクーポンの付与等の取引自体には一切関与しておりません。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第2条（情報の正確性と非保証）</h3>
            <p>
              当アプリに表示される商品名、価格、送料、付与ポイント、クーポン、在庫状況等の情報は、各ECサイトのAPIからデータを受信した時点のものです。システムや通信のタイムラグにより、実際の各ECサイト上の最新情報と差異が生じる場合があります。
            </p>
            <p className="mt-2">
              当アプリの独自ロジックにより算出される「実質総額」や「1個あたりの単価」は、あくまで目安としての参考価格です。ユーザーの会員ランクやキャンペーンのエントリー状況等によって、実際の適用価格や還元ポイントが異なる場合があります。
            </p>
            <p className="mt-2">
              開発者は、当アプリが提供する情報の正確性、最新性、完全性、有用性について、いかなる明示または黙示の保証も行いません。最終的な購入決定にあたっては、必ず遷移先の各ECサイト（公式アプリまたはWebサイト）にて、ご自身の責任で最新の価格や条件をご確認ください。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第3条（取引の当事者とトラブルの免責）</h3>
            <p>
              当アプリを経由した商品の購入、サービスの利用等の契約は、すべてユーザーと各ECサイトの販売店・ショップとの間で直接成立します。
            </p>
            <p className="mt-2">
              万が一、商品の未着、破損、返品、返金、ポイントの未付与、価格の相違など、取引に関するいかなるトラブルや損害が発生した場合でも、開発者は一切の責任を負わず、介入、補償、および損害賠償の義務を負いません。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第4条（アフィリエイトプログラムの参加について）</h3>
            <p>
              当アプリは、アフィリエイトプログラムを利用して収益を得ています。
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>
                <strong>Amazonアソシエイト・プログラム</strong>: Amazonのアソシエイトとして、ESTは適格販売により収入を得ています。
              </li>
              <li>
                <strong>その他のプログラム</strong>: 楽天アフィリエイト、バリューコマース（Yahoo!ショッピング）等のプログラムに参加しており、当アプリ内のリンクを経由して商品が購入された場合、開発者に紹介料が支払われる場合があります。これらのプログラム利用が、ユーザーの購入価格に上乗せ等の不利益を与えることは一切ありません。
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第5条（アプリの停止、変更、終了）</h3>
            <p>
              開発者は、各ECサイトのAPI仕様変更、サーバーメンテナンス、通信障害、または予期せぬ不具合等により、ユーザーに事前通知することなく、当アプリの一部または全部の機能の提供を一時停止、変更、または完全に終了させることができます。
            </p>
            <p className="mt-2">
              これによりユーザーに損害または不利益が生じた場合であっても、開発者は一切の責任を負いません。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第6条（免責の制限と損害賠償の範囲）</h3>
            <p>
              当アプリの利用、または利用できなかったことにより生じた直接的、間接的、付随的、特別、あるいは派生的な損害（機会損失やデータ損失を含む）について、開発者は一切の責任を負いません。法令（消費者契約法など）の強行規定により開発者の免責が認められない場合であっても、開発者が負う損害賠償の範囲は、ユーザーが当アプリに対して直接支払った金額（当アプリは無料であるため、実質0円）を上限とします。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-900 mb-2">第7条（準拠法と管轄裁判所）</h3>
            <p>
              本規約の解釈にあたっては日本法を準拠法とし、当アプリの利用に関して開発者とユーザーとの間に紛争が生じた場合には、開発者の所在地を管轄する地方裁判所または簡易裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>
          
          <div className="h-6"></div> {/* Bottom padding */}
        </div>
      </div>
    </div>
  );
}
