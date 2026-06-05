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

## 実装したmDNS広告PoC（2026-06-05）

`scripts/airplay-mdns-advertise.js` を追加し、Node.js の標準 `dgram` モジュールだけで mDNS multicast 宛に DNS-SD 形式の広告パケットを送信する検証を行えるようにしました。

この実装は **探索ログ確認のための PoC** です。AirPlay の正式な受信実装ではなく、映像受信・復号・表示、PCクリックによるiPhone操作、認証/ペアリング処理は実装していません。iPhone の「画面ミラーリング」候補に表示されることも保証しません。

### 実行方法

まず Windows PC の LAN IP を確認します。

```bash
npm run diagnose:network
```

`Likely same-LAN candidates` に出た IPv4 を指定して広告を開始します。

```bash
npm run advertise:airplay -- --ip 192.168.1.23 --name AirLink-Phase0
```

終了する場合は `Ctrl+C` を押します。終了時には TTL 0 の goodbye レコードを送信し、ソケットを閉じます。

### 実装した広告内容

現時点の広告内容は、Bonjour/DNS-SD の基本構造を満たすための検証用です。AirPlay receiver として十分かどうかは未確認で、次の検証対象です。

| レコード | 値 | 目的 |
| --- | --- | --- |
| PTR | `_services._dns-sd._udp.local` → `_airplay._tcp.local` | DNS-SD の service enumeration 用。 |
| PTR | `_services._dns-sd._udp.local` → `_raop._tcp.local` | RAOP 系 service enumeration 用。 |
| PTR | `_airplay._tcp.local` → `<name>._airplay._tcp.local` | AirPlay-like service instance の広告。 |
| SRV | `<name>._airplay._tcp.local` → `<hostname>.local:<port>` | 接続先ホストとポートの提示。既定ポートは `7000`。 |
| TXT | `<name>._airplay._tcp.local` | AirPlay-like receiver として調査する TXT 値。 |
| PTR | `_raop._tcp.local` → `<deviceid>@<name>._raop._tcp.local` | RAOP-like service instance の広告。 |
| SRV | `<deviceid>@<name>._raop._tcp.local` → `<hostname>.local:<raop-port>` | RAOP-like 接続先ホストとポートの提示。既定ポートは `5000`。 |
| TXT | `<deviceid>@<name>._raop._tcp.local` | RAOP-like receiver として調査する TXT 値。 |
| A | `<hostname>.local` → 指定した IPv4 | iPhone がホスト名から指定IPへ到達するための候補。 |

### TXTレコード

AirPlay-like TXT レコード:

- `deviceid=<stable MAC-like id>`
- `features=0x5A7FFFF7,0x1E`
- `flags=0x44`
- `model=AirLinkPhase0,1`
- `srcvers=220.68`
- `vv=2`
- `pi=<stable UUID-like id>`
- `note=phase0-discovery-only`

RAOP-like TXT レコード:

- `txtvers=1`
- `ch=2`
- `cn=0,1,2,3`
- `et=0,1`
- `md=0,1,2`
- `pw=false`
- `sr=44100`
- `ss=16`
- `tp=UDP`
- `vn=65537`
- `vs=220.68`
- `am=AirLinkPhase0,1`
- `sf=0x4`
- `deviceid=<stable MAC-like id>`

### 調査根拠と未確認点

- Bonjour は Apple のゼロ構成ネットワーク技術で、ローカルネットワーク上のサービス探索に使われます。参考: <https://developer.apple.com/bonjour/>
- mDNS の multicast 動作は RFC 6762、DNS-SD の service instance / PTR / SRV / TXT の考え方は RFC 6763 を根拠にしています。参考: <https://www.rfc-editor.org/rfc/rfc6762> / <https://www.rfc-editor.org/rfc/rfc6763>
- `_airplay._tcp.local` と `_raop._tcp.local`、および AirPlay/RAOP の TXT 値は、公開されている Bonjour/DNS-SD 観測例や既存 receiver 実装で見られる形式を参考にした **調査用の仮設定** です。Apple の公式 AirPlay receiver 仕様として確認できたものではありません。
- したがって、この PoC で候補に表示されない場合でも「実装不可能」とは判断せず、TXT レコード、service type、認証/ペアリング要件、Firewall、ネットワーク構成を追加調査します。

## iPhone側で確認する手順（広告PoC）

1. Windows PC と iPhone を同じ Wi-Fi / 同一LANに接続する。
2. VPN、ゲストWi-Fi、AP isolation を避ける。
3. Windows PC で LAN IP を確認する。
   ```bash
   npm run diagnose:network
   ```
4. Windows PC で広告PoCを起動する。
   ```bash
   npm run advertise:airplay -- --ip <Windows LAN IP> --name AirLink-Phase0
   ```
5. Windows Defender Firewall が Node.js のプライベートネットワーク通信を許可しているか確認する。
6. iPhone のコントロールセンターを開く。
7. 「画面ミラーリング」をタップする。
8. `AirLink-Phase0` または Windows PC 名らしき候補が表示されるか確認する。
9. 候補が出た場合は選択し、PC側ログに `mDNS query-like packet` や接続試行らしきログが出るか確認する。

## 広告PoCの成功判定・失敗判定

### 成功判定

- iPhone の「画面ミラーリング」候補に PC 名または検証サービス名が表示される。
- もしくは、iPhone 側で候補確認/選択を行ったタイミングで、PC 側に `mDNS query-like packet` など iPhone からの探索・接続試行らしきログが出る。

この段階では、映像が表示されること、AirPlay セッションが成立すること、iPhone をPCクリックで操作できることは成功条件に含めません。

### 失敗判定

- iPhone の「画面ミラーリング」候補に検証サービスが出ない。
- 同一LAN、VPNオフ、ゲストWi-Fiなし、AP isolationなしを確認しても変化がない。
- Windows Defender Firewall で Node.js を許可、または検証環境で一時的にFirewall影響を除外しても変化がない。
- 別端末の mDNS browser でも `_airplay._tcp.local` / `_raop._tcp.local` 広告が見えない。

## 次に確認すること

1. 別端末の mDNS browser / `dns-sd` / `avahi-browse` で `_airplay._tcp.local` と `_raop._tcp.local` が見えるか確認する。
2. iPhone 操作時に PoC ログへ mDNS query が出るか確認する。
3. 候補に出ない場合、TXT レコードの `features` / `flags` / `srcvers` / `vv` / `model` を既存 receiver 実装や実機 Apple TV の観測値と比較する。
4. 候補に出るが選択後に進まない場合、AirPlay の認証/ペアリング/暗号化ハンドシェイクを調査する。
5. Firewall / ルーター / VPN / AP isolation を変えた比較ログを残す。
6. Node.js raw mDNS で不安定な場合、Bonjour SDK、Avahi、Rust mDNS ライブラリ、または商用 AirPlay receiver SDK を比較する。
