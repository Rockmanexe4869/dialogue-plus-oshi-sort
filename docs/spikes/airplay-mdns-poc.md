# Phase 0 Spike: AirPlay/mDNS 探索 PoC

## 目的

この Spike は、iPhone の「画面ミラーリング」候補に Windows PC 側アプリを表示できる可能性を検証するための技術調査メモです。

現時点では **映像受信・復号・表示は実装しません**。また、**PC クリックによる iPhone 操作も実装しません**。まずは、iPhone から Windows PC 側の候補が見えるか、候補に出ない場合どこで詰まっているかをログで切り分けることを目的にします。

## iPhone画面ミラーリングの探索に必要な要素

iPhone の画面ミラーリング候補に Windows PC を出すには、少なくとも次の要素を検証する必要があります。

1. **同一LAN上で到達可能であること**
   - iPhone と Windows PC が同じ Wi-Fi / 同じサブネット、または相互に multicast が届くネットワーク上にいる必要があります。
   - ゲストWi-Fi、AP isolation、企業ネットワーク、VPN、ルーター設定により探索パケットが遮断される可能性があります。

2. **Bonjour / mDNS によるサービス広告**
   - iPhone 側はローカルネットワーク上のサービスを Bonjour / mDNS で探索します。
   - Windows PC 側アプリは、AirPlay receiver 相当のサービス種別、名前、ポート、TXT レコードを適切に広告できる必要があります。

3. **AirPlay receiver として認識されるための情報**
   - 単に mDNS で任意サービスを出すだけでは、画面ミラーリング候補として表示されるとは限りません。
   - AirPlay receiver として必要な service type、TXT レコード、対応機能フラグ、認証/ペアリング方式、プロトコルバージョンを調査する必要があります。

4. **接続開始時の受け口**
   - 候補に表示された後、iPhone が接続を開始した場合に Windows 側で TCP/UDP ポートを待ち受けている必要があります。
   - この Spike の初期段階では映像処理までは行わず、接続要求が来たことをログで確認するところまでを成功候補にします。

## mDNS / Bonjour の役割

mDNS / Bonjour は、同一LAN内で「このPCは AirPlay receiver らしいサービスを提供している」と知らせる探索レイヤーです。

主な役割:

- Windows PC 側のホスト名、サービス名、ポートをローカルネットワークに広告する。
- iPhone 側が画面ミラーリング候補を探す際の入口になる。
- IPアドレスを手入力せずに、サービス名で候補を見つけられるようにする。

注意点:

- mDNS は通常 UDP 5353 / multicast を使うため、Firewall、VPN、ルーター、企業ネットワークで遮断されやすいです。
- mDNS 広告が見えても、AirPlay receiver として必要な TXT レコードや待受ポートが不十分だと、iPhone の候補に出ない可能性があります。
- Windows 環境では Bonjour サービス、mDNS ライブラリ、または自前実装のどれを使うかを検証する必要があります。

## AirPlay receiver実装で調査すべき点

この PoC では、実装を始める前に次の点を確認します。仕様が非公開またはライセンス上の制約を受ける可能性があるため、動作保証として扱わないでください。

- iPhone の画面ミラーリング候補に表示されるために必要な Bonjour service type。
- 必須/任意の TXT レコードと値。
- iOS バージョンごとの AirPlay receiver 要件差分。
- 認証、ペアリング、PIN 表示、暗号化ハンドシェイクの有無。
- 接続開始時に iPhone からどのポートへどの順番でアクセスが来るか。
- 映像受信前に最小限ログできる HTTP/RTSP/その他プロトコルの境界。
- OSS 実装を参考にする場合のライセンス、商用利用可否、保守状況。
- 商用SDKを使う場合の費用、配布条件、Apple関連ライセンス/商標リスク。

## Windows Firewallで詰まりそうな点

Windows Defender Firewall やネットワーク環境により、候補表示前の段階で失敗する可能性があります。

確認ポイント:

- アプリまたは Node/Rust 実行ファイルがプライベートネットワークで通信許可されているか。
- UDP 5353 の multicast が送受信できるか。
- AirPlay receiver PoC が利用する TCP/UDP ポートが着信許可されているか。
- Windows のネットワーク種類が「プライベート」ではなく「パブリック」になっていないか。
- VPN、セキュリティソフト、企業端末管理、ルーターの AP isolation が multicast を遮断していないか。
- IPv4/IPv6 のどちらで広告・接続しているかがログで区別できるか。

## 成功判定・失敗判定

### 成功判定

Phase 0 では、次の順に成功レベルを分けます。

1. `scripts/network-diagnostics.js` で Windows PC のホスト名、IPアドレス、ネットワーク候補を出力できる。
2. Windows PC 側で mDNS 広告プロセスを起動し、同一LAN内の別端末から広告が見える。
3. iPhone の画面ミラーリング候補に PoC のサービス名が表示される。
4. iPhone が候補を選択したとき、Windows 側ログに接続試行が記録される。

この Spike では 3 または 4 まで到達できれば、次の AirPlay receiver 実装調査に進む判断材料になります。映像の表示成功は Phase 0 の成功条件ではありません。

### 失敗判定

次の場合は、候補表示に進む前にネットワークまたは広告内容を見直します。

- Windows PC に有効な LAN IP が見つからない。
- iPhone と Windows PC が同一Wi-Fiではない、またはゲストWi-Fiで相互探索できない。
- VPN を切っても mDNS 広告が別端末から見えない。
- Firewall を一時的に緩和しても mDNS 広告が見えない。
- mDNS 広告は見えるが、iPhone の画面ミラーリング候補に出ない。
- 候補には出るが、選択時に Windows 側の待受ポートに接続ログが来ない。

## 次に確認すべきログ

mDNS / AirPlay receiver PoC を作る際は、少なくとも次のログを出します。

### ネットワーク診断ログ

- ホスト名。
- OS / Node.js バージョン。
- ネットワークインターフェース名。
- IPv4 / IPv6 アドレス。
- internal / external の区別。
- private IPv4 かどうか。
- 同一LAN確認に使うサブネット情報。

### mDNS広告ログ

- 広告開始時刻。
- サービス名。
- service type。
- 広告ポート。
- TXT レコード。
- 使用インターフェース / IPアドレス。
- mDNS ライブラリのエラー。

### iPhone接続試行ログ

- 接続元IPアドレス。
- 接続先ポート。
- 最初に届いたリクエストのメソッド/ヘッダー/先頭バイト列。
- 接続開始/切断時刻。
- 認証・ペアリング・暗号化ハンドシェイクで止まった位置。

### Firewall/環境ログ

- Windows ネットワーク種類。
- Firewall ルールの有無。
- VPN 有効/無効。
- ルーターの guest / AP isolation 設定。

## 次のアクション

1. `scripts/network-diagnostics.js` を実行し、Windows PC の有効な LAN IP を確認する。
2. iPhone と Windows PC が同じ Wi-Fi にいることを `docs/phase-0-checklist.md` で確認する。
3. mDNS 広告 PoC を別 Issue で作成し、広告ログを出す。
4. iPhone の画面ミラーリング候補に表示されるか確認する。
5. 候補に出ない場合は、service type / TXT レコード / Firewall / VPN / AP isolation の順に切り分ける。
