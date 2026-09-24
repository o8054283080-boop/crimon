# PR #411 管理用自動保存の全工程監査

## 対象と保護条件

- 監査開始時の先端: cfa782cecbc64d473a5744ad8d57583ea158e064
- 作業ブランチ: feat/player-admin-snapshots。mainへの直接変更なし。
- 既存アリーナuser_id、rating、coins、tickets、戦績、防衛データを変更しない。
- 管理用保存による匿名ID・復旧アカウント作成を禁止。
- 保存先は専用crimon_player_snapshotsのみ。復旧用のlatest_saveへは書き込まない。

## 監査で判明した問題と修正

1. 管理APIに改行の代わりに文字列`\n`が混入し構文エラー。実改行へ修正。
2. 通常CIとbuild:edgeは管理APIの入口を検査していなかった。構文検査・実ハンドラーの回帰テスト・Deno型チェックを追加。
3. DBとAPIが独立したpushワークフローで競合。名指しSQLを再利用可能ワークフローにし、両APIのdeployはDB成功をneedsで待つ。
4. 本番crimon-adminはverify_jwt=falseで独自管理者トークンを検証。設定ファイル不在で次回deploy時に既定値へ変わるおそれがあり、既存設定を明記。snapshotはverify_jwt=trueとgetUser(token)の二段階検証。
5. 管理用トークン取得が匿名signup可能な汎用入口を使用。既存本人のみ更新する入口へ限定。refreshの本人不一致も拒否する。
6. 失敗時の再試行が1時間後、重複送信・無期限通信・localStorage例外への備えなし。1分間隔の再試行、10秒タイムアウト、同時送信抑制、本人別の成功時刻を追加。
7. DB取得エラーを空配列へ変換し「0人」と表示。必須データの失敗は503、snapshotの失敗は明示し既存一覧を維持。
8. 新テーブルへのservice_role権限を明示。PUBLIC/anon/authenticatedへの直接アクセスは拒否、RLS有効。
9. snapshot一覧を検索対象にし、0件・取得失敗・未対応APIを区別できる表示を追加。

## 配信順序と失敗時の動作

- 両APIは同じコミットのsnapshot SQLを先に適用する。SQLは1トランザクション、冪等、他テーブルのDMLなし。
- SQL適用失敗時はAPIを配信しない。
- WebはGitHub PagesとCloudflare Pagesの独立配信。Webが先行してAPIが404/503でも成功時刻を更新せず、1分後または復帰時に再試行する。
- マイグレーション一括実行（db push）は使わない。既存の本番スキーマとmigration履歴に差があるため。
- マージ前の本番検証はこのブランチのDB→APIの順。CI成功だけでマージしない。

## 開始時の本番読み取り記録

|テーブル|件数|全行JSONのMD5（順序固定）|
|---|---:|---|
|arena_profiles|5|551d10000bbdf481f29d3f380e7e29da|
|arena_standings|5|7b93d0b3a72742251bb4f405ab2d0557|
|arena_wallets|5|8cd859e65f52d6fa1a3f2187f6535b75|
|arena_defenses|3|8ca89f8021eae27db546f608f27e2811|
|arena_matches|700|d4137d0c88ed2ae4d5a17013e154dbda|

開始時点でsnapshotテーブルは未作成。管理APIはv7、独自認証。
ハッシュが変わった場合は通常プレイによる変動と作業による変更を区別して調査し、一致したとは報告しない。

## 検証ゲート

- [x] PR全差分、関連認証、DB、管理画面、CI、配信順序を監査
- [x] ローカル型チェック・Webビルド・共有Edgeビルド
- [x] 新規ID防止・認証失敗・本人不一致・再試行・書込境界・取得失敗のテスト
- [ ] 更新後先端のGitHub CI（型/テスト/Deno/巡回/HOME画像）
- [ ] 本番DBのテーブル・RLS・権限
- [ ] 本番Edge Functionのコード・認証・応答
- [ ] 既存本人の認証による本番snapshot保存成功
- [ ] 本番管理画面で既存5件とsnapshot表示
- [ ] 配信後の既存アリーナ全行非破壊比較
- [ ] 条件達成後のマージと、そのコミットのActions・Web配信確認

本番の保存・画面表示は既存本人のセッションと管理者ログインで検証する。成功を作るための新規ユーザー作成、トークン偽造、管理者パスワード変更は行わない。
