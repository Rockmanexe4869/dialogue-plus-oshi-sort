# Phase 0 チェックリスト: iPhone → Windows 画面ミラーリング探索

## 目的

このチェックリストは、iPhone の「画面ミラーリング」候補に Windows PC 側アプリを表示できる可能性を検証する前の確認項目です。

Phase 0 では **映像受信・復号・表示はまだ実装しません**。また、**PCクリックでiPhoneを操作する機能も実装しません**。まずは同一LAN、Firewall、mDNS/Bonjour 探索の切り分けを優先します。

## 1. iPhoneとWindowsが同じWi-Fiにいるか

- [ ] iPhone が Wi-Fi に接続されている。
- [ ] Windows PC が同じ Wi-Fi / 同じルーター配下に接続されている。
- [ ] iPhone がゲストWi-Fiではなく通常のWi-Fiに接続されている。
- [ ] Windows PC がゲストWi-Fiではなく通常のWi-Fiに接続されている。
- [ ] ルーターの AP isolation / client isolation が無効になっている。
- [ ] `npm run diagnose:network` を実行し、Windows PC の LAN IP を記録した。
- [ ] Windows PC に複数の有効なネットワークインターフェースがある場合、どれが iPhone と同じLANか確認した。

## 2. VPNを切っているか

- [ ] Windows PC の VPN を切っている。
- [ ] iPhone の VPN / iCloud Private Relay / セキュリティアプリの通信保護を一時的に無効化している。
- [ ] 企業ネットワークや学校ネットワークではなく、検証しやすい家庭用/検証用Wi-Fiで試している。
- [ ] VPN を切った後に、Windows PC と iPhone を Wi-Fi に再接続した。

## 3. Windows Defender Firewall確認

- [ ] Windows のネットワーク種類が「プライベート」になっている。
- [ ] Node.js / PoC 実行ファイル / 将来の Tauri アプリがプライベートネットワークで通信許可されている。
- [ ] `scripts/airplay-mdns-advertise.js` 実行時に Firewall 確認ダイアログが出た場合、Node.js をプライベートネットワークで許可した。
- [ ] UDP 5353 の mDNS multicast が遮断されていないか確認した。
- [ ] PoC が利用する AirPlay-like port `7000` と RAOP-like port `5000` の着信が検証環境で許可されている。
- [ ] 一時的なFirewall緩和で候補表示が変わるか確認できる検証環境を用意した。
- [ ] セキュリティソフトや企業端末管理が multicast を遮断していないか確認した。

## 4. iPhone側の画面ミラーリング操作手順

1. iPhone と Windows PC を同じ Wi-Fi に接続する。
2. Windows PC 側でネットワーク診断を実行する。
   ```bash
   npm run diagnose:network
   ```
3. 広告PoCを Windows PC 側で起動する。
   ```bash
   npm run advertise:airplay -- --ip <Windows LAN IP> --name AirLink-Phase0
   ```
4. 起動ログに `AirPlay-like service`、`RAOP-like service`、`mDNS multicast target` が出ていることを確認する。
5. iPhone のコントロールセンターを開く。
6. 「画面ミラーリング」をタップする。
7. PoC のサービス名が候補に出るか確認する。
8. 候補に出た場合は選択し、Windows PC 側ログに `mDNS query-like packet` または接続試行らしきログが出るか確認する。

## 5. うまく出ない場合の切り分け

### A. Windows PC のIPが診断に出ない

- [ ] Windows PC が Wi-Fi または有線LANに接続されているか確認する。
- [ ] `npm run diagnose:network` の external IPv4 があるか確認する。
- [ ] Docker、WSL、仮想NICだけが出ていないか確認する。
- [ ] PCを再起動、またはネットワークアダプターを再接続する。

### B. iPhoneとWindowsが同じLANにいない可能性がある

- [ ] iPhone と Windows PC の接続先SSIDが同じか確認する。
- [ ] ルーターがゲストネットワークを使っていないか確認する。
- [ ] iPhone と Windows PC が同じ IPv4 サブネットにいるか確認する。
- [ ] 可能なら家庭用の単純なWi-Fi環境で再検証する。

### C. mDNS広告が見えない

- [ ] VPN を切る。
- [ ] Windows Defender Firewall を確認する。
- [ ] UDP 5353 がブロックされていないか確認する。
- [ ] ルーターの AP isolation / multicast filtering を確認する。
- [ ] 別端末から mDNS service browser で広告が見えるか確認する。

### D. mDNS広告は見えるがiPhoneの候補に出ない

- [ ] service type が AirPlay receiver として妥当か確認する。
- [ ] TXT レコードに不足がないか確認する。
- [ ] iOS バージョン差分を確認する。
- [ ] AirPlay receiver 実装/商用SDK/既存OSSの要件を調べる。
- [ ] 候補表示に必要な認証/ペアリング情報が不足していないか確認する。

### E. 候補には出るが接続ログが出ない

- [ ] PoC の待受ポートが正しく起動しているか確認する。
- [ ] Windows Firewall が待受ポートをブロックしていないか確認する。
- [ ] iPhone から Windows PC のIPへ到達できるネットワークか確認する。
- [ ] 接続元IP、接続先ポート、最初のリクエストをログ出力する。

## 6. 記録する情報

検証ごとに次をメモします。

- 検証日時。
- iPhone モデル / iOS バージョン。
- Windows バージョン。
- Wi-Fi SSID の種類（家庭用、ゲスト、企業、学校など）。
- VPN の有無。
- Windows Firewall の状態。
- `npm run diagnose:network` の出力。
- mDNS 広告ログ。
- iPhone の画面ミラーリング候補に出たか。
- 候補選択時に Windows 側ログへ接続試行が出たか。

## 7. mDNS / Bonjour 広告PoCの実行手順

Phase 0 の次ステップとして、`scripts/airplay-mdns-advertise.js` で AirPlay-like / RAOP-like な mDNS 広告を出し、iPhone の「画面ミラーリング」候補に表示される可能性を確認します。

この PoC は **探索確認専用** です。映像受信・復号・表示、PCクリックによるiPhone操作は実装していません。候補に表示されることも保証しません。

1. Windows PC の LAN IP を確認する。
   ```bash
   npm run diagnose:network
   ```
2. `Likely same-LAN candidates` に表示された IPv4 を控える。
3. 広告PoCを起動する。
   ```bash
   npm run advertise:airplay -- --ip <Windows LAN IP> --name AirLink-Phase0
   ```
4. 起動ログで次を確認する。
   - Hostname
   - Advertised IP
   - Friendly name
   - AirPlay-like service
   - RAOP-like service
   - mDNS multicast target
5. iPhone 側で画面ミラーリング候補を確認する。
6. 終了するときは `Ctrl+C` を押し、`mDNS advertiser stopped cleanly.` が出ることを確認する。

## 8. Windows Defender FirewallでNode.jsを許可する確認

- [ ] 初回実行時に Windows Defender Firewall の確認ダイアログが出た場合、プライベートネットワークで Node.js を許可した。
- [ ] Windows の「Windows セキュリティ」→「ファイアウォールとネットワーク保護」→「ファイアウォールによるアプリケーションの許可」で Node.js が許可されている。
- [ ] 少なくともプライベートネットワークで Node.js / PoC 実行ファイルの通信が許可されている。
- [ ] UDP 5353 の mDNS multicast が遮断されていない。
- [ ] PoC の AirPlay-like port `7000` と RAOP-like port `5000` が検証環境でブロックされていない。
- [ ] 企業管理PCやセキュリティソフトが Node.js の multicast 送信を止めていない。

## 9. iPhoneで画面ミラーリング候補を見る手順（広告PoC）

1. iPhone の Wi-Fi が Windows PC と同じ SSID / 同一LANであることを確認する。
2. iPhone 側の VPN や通信保護機能を一時的に切る。
3. Windows PC で広告PoCが起動していることを確認する。
4. iPhone の右上から下へスワイプしてコントロールセンターを開く。
5. 「画面ミラーリング」をタップする。
6. `AirLink-Phase0`、Windows PC 名、または PoC で指定した `--name` が表示されるか確認する。
7. 表示された場合は選択し、Windows PC 側ログに `mDNS query-like packet` や接続試行らしきログが出るか確認する。
8. 表示されない場合は、Firewall、VPN、ゲストWi-Fi、AP isolation、service type、TXT レコードの順に切り分ける。
