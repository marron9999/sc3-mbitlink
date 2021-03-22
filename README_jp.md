# sc3-mbitlink

![](images/mbituart.png)

- このリポジトリ

	- scratch-linkを改造(BLE UART対応)
	- bluetooth extensionのBLE部を分離・改造

## この拡張機能について

- この拡張機能を組み込んでも、ブロックは何も表示されません。micro:bitとの接続・切断を表現する丸いボタンのみが表示されます。
- 保存されたプログラム(SB3)を読み込んだとき、拡張機能 mbitlink は自動的に組み込まれません。読み込んだ後に手動で拡張機能 mbitlink を組み込んでください。
- micro:bit、maqueenのブロック（プログラム）を動かすためには、Scratch_mbitlinkが必要です。事前に起動しておいてください。
- micro:bitには専用プログラム（リポジトリ:maqueen_hexにあります）が必要です。事前に専用プログラムを転送しておいてください。

## Scratch_mbitlinkについて

- Scratch_mbitlinkの実行ファイルには署名はついていません。
- Scratch_mbitlinkを起動するとScratch/Scratch desktopを通信するために ws://device-manager.scratch.mit.edu:20111 を開きます。
- Scratch_mbitlinkを介して通信されているかを確認したいときは「-g」を付加して起動してください。