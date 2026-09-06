# featured.json（長岡花火）の生成。解説の文字数を山の解説と同じ枠に収める:
#   ja long 60〜80字 / ja short 25〜50字 / en long 140〜270字 / en short 45〜160字
# 協賛社名は aliases に入れて検索ヒットさせる。
# 使い方: python3 scripts/generate-featured.py && node scripts/check-featured.mjs
import json, re

LAT, LON = 37.4463, 138.8367
BASE = dict(latitude=LAT, longitude=LON, elevation_m=2026, prefecture="長岡花火")
URL = "https://nagaokamatsuri.com/"

# (日, 時刻, 種別, タイトル, 協賛)
P2 = [
 ("2","19:25","ナイアガラ超大型スターマイン","カノン～この先に続く道(ミライ)に向かって～","オンヨネ＆エヌ・シィ・ティ"),
 ("2","19:25","ベスビアス超大型スターマイン","純金箔24K 黄金の輝き","トーア"),
 ("2","19:25","超大型スーパーベスビアス","ガラスが拓く未来のとびら","ミクロ技術研究所長岡事業所"),
 ("2","19:25","ベスビアス大スターマイン","大河の恵み～水が生む紙の物語","北越コーポレーション・北越グループ"),
 ("2","19:25","10号72発","誰かのために！72年の感謝報恩","ソリマチテックグループ"),
 ("2","19:25","超大型スーパーベスビアス","米百俵の心","中越興業グループ"),
 ("2","19:25","ベスビアス超大型スターマイン","長岡から世界へ、希望の花束","イートラスト"),
 ("2","19:45","ベスビアス超大型スターマイン","ともに歩んだ80年、明日へ届ける感謝の響き","越後製菓"),
 ("2","19:45","超大型スーパーベスビアス","真夏のイルミネーション","ユニオンツール"),
 ("2","19:45","ベスビアス大スターマイン","人が想い描く未来、その先へ","クレスコ"),
 ("2","19:45","ベスビアス超大型スターマイン","心ひとつに","TeNYテレビ新潟"),
 ("2","19:45","10号20発・20号3発","未来へ～平和を願って～","リバーサイド千秋・アピタ長岡店・JTB"),
 ("2","20:00","超大型ワイドスターマイン","ふるさとの四季","岩塚製菓グループ"),
 ("2","20:00","超大型スーパーベスビアス","福田グループスピリット～100年先も誠実～","福田グループ"),
 ("2","20:00","ベスビアス超大型スターマイン","感謝の絆、未来への輝き","日産サティオ新潟西"),
 ("2","20:00","スペシャルスターマイン","すべての『いのち』にありがとう","長岡市仏教会・立正佼成会長岡教会"),
 ("2","20:00","超大型スーパーベスビアス","AIRMANスパーキング","AIRMAN"),
 ("2","20:15","花火","故郷はひとつ","協賛企業一同"),
 ("2","20:15","ベスビアス大スターマイン","インプレッション・トリップ","クラブツーリズム"),
 ("2","20:15","超大型スーパーベスビアス","光差す明日へ","伊藤建設グループ・宮下電設"),
 ("2","20:15","ベスビアス大スターマイン","挑戦の精神","カナデビア・カナデビアE&E"),
 ("2","20:15","超大型スーパーベスビアス","夜空に輝くプレミアム","セブン-イレブン・セブン銀行"),
 ("2","20:30","ベスビアス超大型スターマイン","エコの華","ナンバグループ"),
 ("2","20:30","超大型スーパーベスビアス","光ある美しく豊かな世界へ","トクサイ"),
 ("2","20:30","ベスビアス大スターマイン","夏の思い出","コメリ"),
 ("2","20:40","超大型ミラクルスターマイン","スプラッシュファイヤー炎の舞","ワタナベグループ"),
 ("2","20:40","ベスビアス大スターマイン","ホテルニューオータニ長岡感謝の大輪","ホテルニューオータニ長岡"),
 ("2","20:45","超大型スーパーベスビアス","長岡とともに技大、感謝の50年","長岡技術科学大学開学50周年記念花火協賛者一同"),
 ("2","20:45","超大型スーパーベスビアス","クリーンエナジー","石油資源開発"),
 ("2","20:45","超大型スーパーベスビアス","つながり","ネクスコ東日本長岡管理事務所グループ"),
 ("2","21:00","超大型スーパーベスビアス","鉄にいのち、ひとに未来","北越メタル"),
 ("2","21:00","ベスビアス大スターマイン","龍華～未来へ続く日の光～","目崎グループ"),
 ("2","21:00","超大型スーパーベスビアス","感謝","SBFグループ・三共土地開発"),
 ("2","21:00","超大型スーパーベスビアス","皆さまへ創業百周年の感謝を込めて","ジェスクホリウチ"),
 ("2","21:25","サプライズ花火","君と花火と約束と","映画製作委員会"),
]
P3 = [
 ("3","19:25","ナイアガラ超大型スターマイン","カノン～この先に続く道(ミライ)に向かって～","JTB＆エヌ・シィ・ティ"),
 ("3","19:25","ベスビアス超大型スターマイン","上場記念花火アリガトウナガオカ","フラー"),
 ("3","19:25","超大型スーパーベスビアス","マンマのフルーツカーニバル","北陸学園"),
 ("3","19:25","スペシャルスターマイン","水とともに","前澤工業ほか"),
 ("3","19:25","超大型スーパーベスビアス","つながれ！～モノづくりの未来へ～","シマキュウグループ"),
 ("3","19:25","ベスビアス超大型スターマイン","千人鮮色、ありがとうの花","高田建築事務所と愉快な仲間たち"),
 ("3","19:25","ベスビアス大スターマイン","インプレッション・トリップ","クラブツーリズム"),
 ("3","19:45","花火","この空の花","協賛企業一同"),
 ("3","19:45","ベスビアス大スターマイン","燃ゆる華心","コロナ"),
 ("3","19:45","超大型スーパーベスビアス","アルプスアルパイン・シャイニングスター","アルプスアルパイングループ"),
 ("3","19:45","スターマイン","信濃川の夕涼み","イオン長岡店・専門店街Well"),
 ("3","19:45","超大型スーパーベスビアス","あなたとずっとこの空と","岡三にいがた証券"),
 ("3","19:45","ベスビアス超大型スターマイン","金燦、銀燦","伊丹自動車ほか"),
 ("3","20:00","超大型ワイドスターマイン","安心と感動に満ちた世界と未来のために","日本精機グループ"),
 ("3","20:00","ベスビアス超大型スターマイン","太陽の輝き","太陽工機"),
 ("3","20:00","超大型スーパーベスビアス","子供たちの未来のために","スプリックス"),
 ("3","20:00","ベスビアス超大型スターマイン","ともに創る未来へ","ヤマト運輸長岡主管支店"),
 ("3","20:00","10号28発","酔火連発 尺玉の響","酔火連"),
 ("3","20:15","花火","HOPE TO THE FUTURE～未来へ~","協賛企業一同"),
 ("3","20:15","スターマイン","輝け愛花火","崇徳厚生事業団職員有志一同"),
 ("3","20:15","ベスビアス超大型スターマイン","天空華宴","大石組"),
 ("3","20:15","ベスビアス大スターマイン","mirai","扉-tobira-"),
 ("3","20:15","10号60連発＆ベスビアス大スターマイン","駆け抜ける丙午 60-60","長岡高校昭和60年卒還暦花火の会"),
 ("3","20:30","ベスビアス超大型スターマイン","No Attack,No Chance","ピカイチ・INSIGHT LAB"),
 ("3","20:30","スペシャルスターマイン","平和への誓い","創価学会"),
 ("3","20:30","ベスビアス超大型スターマイン","夜空に感謝の花束","明治安田"),
 ("3","20:40","超大型ミラクルスターマイン","世界への躍動","ヨネックス"),
 ("3","20:40","ベスビアス超大型スターマイン","大河の夕景","高野不動産グループ"),
 ("3","20:45","超大型スーパーベスビアス","99年分のありがとうを込めて","ナカザワグループ"),
 ("3","20:45","超大型スーパーベスビアス","ラブラブファイヤー2026","アークベルグループ長岡ベルナール"),
 ("3","20:45","超大型スーパーベスビアス","アイデアと技術の宝石箱","大森機械工業長岡工場"),
 ("3","21:00","7号12発・10号12発","未来飛翔","長岡市共同受注グループ「けやき」"),
 ("3","21:00","ベスビアス超大型スターマイン","新潟の未来を見つめ続けて","ダイア建設新潟"),
 ("3","21:00","スターマイン","パラダイス・イン・ザ・スカイ","スーパーセンタームサシ長岡店"),
 ("3","21:00","ベスビアス大スターマイン","支社開設60周年 感謝を空へ 安心を未来へ","日本生命"),
]


# 演目ごとの背景ストーリー（ja: 長め解説の主文 / hook: 短め解説の要点 / en: 英語の主文）。
# 確証のある事実のみ断定し、タイトルからの連想は「にちなむ」「掲げた」等でぼかす。
STORIES = {
 "カノン～この先に続く道(ミライ)に向かって～": (
  "未来へ続く道への願いをカノンの旋律に重ね、大手大橋のナイアガラとともに夜空を開く開幕の共演。",
  "カノンの旋律とナイアガラで夜空を開く開幕の共演",
  "An opening collaboration that pairs the Niagara cascade on the Ohte Bridge with a starmine set to Pachelbel's Canon, carrying a wish for the road to the future."),
 "純金箔24K 黄金の輝き": (
  "タイトルに掲げた純金箔のように、黄金一色の光が夜空を染める様をイメージさせる演目。",
  "純金箔のような黄金一色をイメージさせる演目名",
  "Its title of pure 24-karat gold leaf evokes an image of the night sky dyed in a single luxurious shade of gold."),
 "ガラスが拓く未来のとびら": (
  "ガラスの精密加工を手がける協賛社にちなみ、透明感のある光が未来の扉を開くように広がる。",
  "ガラス加工の協賛社にちなむ透明感ある光",
  "Sponsored by a precision glass maker, the display spreads with a glassy transparency, as if opening a door to the future."),
 "大河の恵み～水が生む紙の物語": (
  "製紙業を営む協賛社らしく、信濃川の水の恵みと紙づくりの物語を光の連なりで描き出す。",
  "信濃川の水と紙づくりの物語を光で描く",
  "True to its papermaking sponsor, the display tells the story of paper born from the blessings of the Shinano River's water."),
 "誰かのために！72年の感謝報恩": (
  "創業72年の感謝を込めて尺玉72発を打ち上げる、「誰かのために」を掲げた感謝報恩の演目。",
  "創業72年の感謝を尺玉72発に込める",
  "Seventy-two giant shells, one for each year since the sponsor's founding, fired in gratitude under the banner of doing something for someone."),
 "米百俵の心": (
  "米百俵を売って学校を建てた長岡藩の故事に想いを重ね、未来への投資の心を光で表す。",
  "米百俵の故事に重ねた未来への想い",
  "A display that honors Nagaoka's Kome Hyappyo story of selling rice to build a school, expressing the spirit of investing in the future."),
 "長岡から世界へ、希望の花束": (
  "長岡から世界へ希望を届けるという想いを、花束のように色とりどりの光に託して打ち上げる。",
  "世界へ届ける花束のような色とりどりの光",
  "A bouquet of many-colored lights carrying a wish to deliver hope from Nagaoka to the world."),
 "ともに歩んだ80年、明日へ届ける感謝の響き": (
  "米菓や切り餅で知られる越後製菓が、創業80年をともに歩んだ感謝を込めて夜空に響かせる。",
  "越後製菓が創業80年の感謝を込める",
  "Echigo Seika, known for its rice crackers and mochi, marks 80 years of history with a resounding display of gratitude."),
 "真夏のイルミネーション": (
  "冬に長岡工場を彩るイルミネーションで知られるユニオンツールが、その光を真夏の夜空に咲かせる。",
  "冬の名物イルミネーションを真夏の夜空に",
  "Union Tool, famous for the winter illuminations that adorn its Nagaoka plant, brings that glow to the midsummer night sky."),
 "人が想い描く未来、その先へ": (
  "人が想い描く未来のさらに先へ、という願いを掲げ、光の連なりが夜空の奥へと駆け上がる。",
  "想い描く未来のさらに先へ駆ける光",
  "Under the theme of going beyond the future people imagine, trails of light race deeper and deeper into the night sky."),
 "心ひとつに": (
  "地元の放送局TeNYテレビ新潟が贈る、会場の心をひとつにする願いを込めたスターマイン。",
  "会場の心をひとつにする願いを込めて",
  "Presented by local broadcaster TeNY, a starmine carrying the wish to bring every heart at the venue together as one."),
 "未来へ～平和を願って～": (
  "尺玉に加えて20号玉3発を打ち上げ、未来と平和への願いを大輪の連なりに込める演目。",
  "20号玉3発とともに平和への願いを込める",
  "Three massive 20-gou shells join the giant shells in a program that entrusts its prayer for peace and the future to a chain of great blooms."),
 "ふるさとの四季": (
  "新潟の米菓メーカー岩塚製菓が贈る、ふるさとの春夏秋冬をイメージさせる横長の光の絵巻。",
  "ふるさとの四季をイメージさせる光の絵巻",
  "Rice-cracker maker Iwatsuka Confectionery presents a wide scroll of light evoking the four seasons of its hometown."),
 "福田グループスピリット～100年先も誠実～": (
  "「100年先も誠実」を掲げる建設の福田グループが、その精神を貫くようにまっすぐな光を上げる。",
  "「100年先も誠実」の精神を光に込めて",
  "The Fukuda construction group raises columns of straight, honest light under its motto of staying sincere for the next hundred years."),
 "感謝の絆、未来への輝き": (
  "地元とともに歩む自動車販売店が、日頃の感謝の絆を未来への輝きに変えて夜空へ届ける。",
  "感謝の絆を未来への輝きに変えて",
  "A local car dealership turns its bonds of gratitude into brilliance for the future, delivered high into the night sky."),
 "すべての『いのち』にありがとう": (
  "長岡市仏教会などが贈る祈りの花火。すべてのいのちへの感謝と供養の想いを静かな光に込める。",
  "すべてのいのちへの感謝と祈りを込めて",
  "A prayerful display from Nagaoka's Buddhist association, entrusting gratitude and remembrance for all life to its quiet light."),
 "AIRMANスパーキング": (
  "エンジンコンプレッサで知られる建機メーカーAIRMAN（旧北越工業）が、火花のように弾ける光で沸かせる。",
  "AIRMANブランドの火花のように弾ける光",
  "AIRMAN, the machinery maker formerly known as Hokuetsu Industries, rouses the crowd with light that bursts like flying sparks."),
 "故郷はひとつ": (
  "多数の協賛で打ち上げる合同プログラム。ふるさとへの想いをひとつにし、しっとりと夜空を彩る。",
  "ふるさとへの想いをひとつにする合同花火",
  "A joint program backed by many sponsors, gathering everyone's feelings for their hometown into one gentle display."),
 "インプレッション・トリップ": (
  "旅行会社クラブツーリズムが誘う、印象深い旅の情景を巡るような色変化のスターマイン。",
  "旅の情景を巡るような色変化の花火",
  "Travel company Club Tourism leads a starmine journey through shifting colors, like scenes from an unforgettable trip."),
 "光差す明日へ": (
  "地元の建設と電設の協賛社が、光の差す明日を照らすように力強い光の柱を打ち立てる。",
  "明日を照らす力強い光の柱",
  "Local construction and electrical firms raise powerful pillars of light, as if illuminating the road to a brighter tomorrow."),
 "挑戦の精神": (
  "ものづくりの協賛社が掲げる挑戦の精神そのままに、勢いよく夜空へ駆け上がる花火が続く。",
  "挑戦の精神を体現して駆け上がる花火",
  "True to its sponsor's spirit of challenge, shell after shell charges boldly up into the night sky."),
 "夜空に輝くプレミアム": (
  "セブン-イレブンとセブン銀行が贈る、選び抜かれた玉が夜空にプレミアムな輝きを連ねる演目。",
  "選び抜かれた玉がプレミアムに輝く",
  "Seven-Eleven and Seven Bank present a lineup of carefully selected shells that string premium brilliance across the sky."),
 "エコの華": (
  "環境への想いを込めた「エコの華」。資源を未来へつなぐ願いが、大輪の花になって開く。",
  "環境への想いが大輪の花になって開く",
  "A flower of ecology: the wish to carry resources on to the future blooms as great blossoms over the river."),
 "光ある美しく豊かな世界へ": (
  "光ある美しく豊かな世界へ、という祈りを掲げ、澄んだ色の光が幾重にも夜空へ広がっていく。",
  "美しく豊かな世界への祈りを光に",
  "Under a prayer for a beautiful and abundant world filled with light, layers of clear color spread across the night."),
 "夏の思い出": (
  "新潟発のホームセンター、コメリが贈る夏の思い出の一場面。家族で見上げたい素直な大輪が続く。",
  "家族で見上げたい夏の思い出の大輪",
  "Komeri, the home-center chain born in Niigata, offers a scene for summer memories: honest, generous blooms for families looking up together."),
 "スプラッシュファイヤー炎の舞": (
  "水しぶきと炎の舞を名に掲げ、弾ける光と動きの大きな演出をイメージさせるスターマイン。",
  "炎の舞の名が弾ける光をイメージさせる",
  "Splash Fire: the name evokes dancing flames and light that bursts like flying spray, with big sweeping motion."),
 "ホテルニューオータニ長岡感謝の大輪": (
  "長岡駅前に立つ地元のホテルが、日頃の感謝を込めて打ち上げる、まっすぐで大ぶりな感謝の大輪。",
  "地元ホテルが贈る感謝の大輪",
  "Hotel New Otani Nagaoka, standing right in front of Nagaoka Station, fires generous blooms of straightforward gratitude."),
 "長岡とともに技大、感謝の50年": (
  "長岡技術科学大学の開学50周年を記念し、長岡とともに歩んだ半世紀の感謝を夜空に刻む。",
  "技大開学50周年の感謝を夜空に刻む",
  "Marking the 50th anniversary of Nagaoka University of Technology, this display engraves half a century of gratitude in the sky."),
 "クリーンエナジー": (
  "長岡近郊のガス田で天然ガスを生産する石油資源開発が、クリーンエナジーへの想いを光にする。",
  "天然ガスの街らしいクリーンエナジーの光",
  "JAPEX, which produces natural gas from fields near Nagaoka, turns its commitment to clean energy into light."),
 "つながり": (
  "高速道路を守るネクスコ東日本のグループが、道がつなぐ人と人との縁を光の連なりで表す。",
  "道がつなぐ人と人との縁を光の連なりに",
  "The NEXCO East group, keeper of the expressways, expresses the bonds that roads create through an unbroken chain of light."),
 "鉄にいのち、ひとに未来": (
  "長岡の電炉メーカー北越メタルが、鉄にいのちを吹き込む仕事への誇りを力強い光で示す。",
  "鉄の街の誇りを力強い光で示す",
  "Hokuetsu Metal, Nagaoka's steelmaker, shows its pride in breathing life into iron through powerful, unbending light."),
 "龍華～未来へ続く日の光～": (
  "龍が咲かせる華という名から、金色の尾を引いて立ち上る光をイメージさせる演目。",
  "龍の華の名が立ち上る光をイメージさせる",
  "Its name, flowers blooming from a dragon, evokes an image of shells climbing skyward with golden tails like light stretching into the future."),
 "感謝": (
  "ただ一言「感謝」を掲げた演目。飾らない言葉のとおり、まっすぐな光が静かに夜空へ立ち上る。",
  "「感謝」の一言をまっすぐな光に込めて",
  "A program bearing the single word thanks: unadorned, straightforward light rising quietly into the night, just as the word promises."),
 "皆さまへ創業百周年の感謝を込めて": (
  "創業100周年を迎えた協賛社が、一世紀分の感謝を込めて夜空いっぱいに光を捧げる記念の演目。",
  "創業100周年、一世紀分の感謝を捧げる",
  "Celebrating its 100th anniversary, the sponsor offers a century's worth of gratitude in a commemorative display filling the sky."),
 "君と花火と約束と": (
  "長岡花火を舞台にした映画「君と花火と約束と」とのタイアップで贈る、両日最後のサプライズ。",
  "映画タイアップの両日最後のサプライズ",
  "A surprise finale on both nights, presented in tie-up with the film Kimi to Hanabi to Yakusoku to, set against the Nagaoka fireworks."),
 "上場記念花火アリガトウナガオカ": (
  "新潟に本社を置くIT企業フラーが株式上場を記念し、感謝の「アリガトウナガオカ」を夜空に掲げる。",
  "上場記念、育った街へのアリガトウ",
  "Fuller, an IT company headquartered in Niigata, celebrates its stock listing by firing a heartfelt thank-you, Arigato Nagaoka, into the sky."),
 "マンマのフルーツカーニバル": (
  "調理や製菓を学ぶ北陸学園が贈る、果物を山盛りにしたようなカラフルで甘い光のカーニバル。",
  "果物を山盛りにしたようなカラフルな光",
  "From culinary school Hokuriku Gakuen comes a carnival of sweet, colorful light, like fruit piled high on a platter."),
 "水とともに": (
  "水処理に携わる前澤工業らしく、水とともに生きる街への想いを、流れるような光で描く。",
  "水とともに生きる街への想いを流れる光に",
  "True to water-infrastructure firm Maezawa Industries, flowing light expresses a life lived together with water."),
 "つながれ！～モノづくりの未来へ～": (
  "産業を支える協賛社が、モノづくりの未来へ技と想いをつなげという願いを光の連鎖に込める。",
  "モノづくりの未来へつなぐ光の連鎖",
  "An industrial sponsor entrusts its wish to pass on craftsmanship to the future through a chain reaction of light."),
 "千人鮮色、ありがとうの花": (
  "千人の彩りを思わせる色とりどりの光で、支えてくれた人々への「ありがとう」を花にして贈る。",
  "千人の彩りで咲かせるありがとうの花",
  "Flowers of thanks bloom in the myriad colors of a thousand people, offered to everyone who lent their support."),
 "この空の花": (
  "長岡空襲と花火を描いた映画「この空の花」の名を冠し、鎮魂と再生の想いを継ぐ合同プログラム。",
  "映画「この空の花」の名を継ぐ祈りの花火",
  "Bearing the name of the film Casting Blossoms to the Sky, which portrayed the Nagaoka air raid and its fireworks, this joint program carries on a prayer of remembrance and rebirth."),
 "燃ゆる華心": (
  "燃焼機器を手がける三条のコロナらしい「燃ゆる」の名のもと、華やかな炎の心が夜空に咲く。",
  "暖房機器の会社らしい「燃ゆる」華の心",
  "Under the fitting banner of burning from heating-equipment maker Corona, a brilliant heart of flame blossoms in the dark."),
 "アルプスアルパイン・シャイニングスター": (
  "電子部品のアルプスアルパインが、シャイニングスターの名のとおり星々の瞬きを夜空に散らす。",
  "星々の瞬きを散らすシャイニングスター",
  "Electronics maker Alps Alpine scatters the twinkling of countless stars across the sky, true to its Shining Star title."),
 "信濃川の夕涼み": (
  "川辺の夕涼みを名に掲げ、真夏の信濃川に吹く涼風のような時間をイメージさせる演目。",
  "夕涼みの涼風をイメージさせる演目名",
  "Named for a cool evening by the water, the title evokes a moment of breeze drifting over the midsummer Shinano riverside."),
 "あなたとずっとこの空と": (
  "「あなたとずっとこの空と」の名を掲げ、寄り添う光をイメージさせる演目。大切な人と見上げたい。",
  "寄り添う光をイメージさせる演目名",
  "Bearing the title You, Always, and This Sky, the program evokes an image of lights nestling close together, made to be watched with someone dear."),
 "金燦、銀燦": (
  "金と銀の燦めきを名に掲げた演目。余計な色を削ぎ、輝きそのものを味わう構成をイメージさせる。",
  "金と銀の燦めきを名に掲げた演目",
  "Named for the sparkle of gold and silver, the title evokes fireworks at their most essential, with brilliance savored for its own sake."),
 "安心と感動に満ちた世界と未来のために": (
  "長岡に本社を置く計器メーカー日本精機が、安心と感動に満ちた未来への願いを光で計り描く。",
  "長岡の計器メーカーが描く未来への願い",
  "Nippon Seiki, the instrument maker headquartered in Nagaoka, charts its wish for a future filled with safety and wonder in light."),
 "太陽の輝き": (
  "工作機械をつくる長岡の太陽工機が、その名のとおり太陽の輝きを真夜中の空に呼び戻す。",
  "真夜中の空に呼び戻す太陽の輝き",
  "Taiyo Koki, Nagaoka's machine-tool builder, calls the brilliance of the sun back into the midnight sky, true to its name."),
 "子供たちの未来のために": (
  "長岡発の教育企業スプリックスが、子供たちの未来を照らすようにあたたかな光を打ち上げる。",
  "子供たちの未来を照らすあたたかな光",
  "Sprix, the education company born in Nagaoka, sends up warm light as if to illuminate the future of its children."),
 "ともに創る未来へ": (
  "暮らしを支える物流のヤマト運輸が、地域とともに創る未来への想いを届け物のように打ち上げる。",
  "地域とともに創る未来への想いを届ける",
  "Yamato Transport, the delivery company that supports daily life, sends up its wish for a future built together with the region."),
 "酔火連発 尺玉の響": (
  "花火に酔いしれる愛好家の会「酔火連」が贈る尺玉28連発。玉の響きそのものを味わう通好みの間。",
  "愛好家の会が贈る尺玉28連発の響き",
  "From Suikaren, a circle of fireworks devotees, come 28 giant shells in a row — a connoisseur's interval devoted to the report itself."),
 "HOPE TO THE FUTURE～未来へ~": (
  "多数の協賛で打ち上げる合同プログラム。希望を未来へつなぐ想いを、明るい光の連なりに込める。",
  "希望を未来へつなぐ合同プログラム",
  "A joint program backed by many sponsors, entrusting the hope carried toward the future to a bright procession of light."),
 "輝け愛花火": (
  "福祉に携わる職員有志が持ち寄る「愛花火」。支え合う日々への想いが、小さくも確かに輝く。",
  "職員有志が持ち寄る支え合いの愛花火",
  "A fireworks of love brought together by welfare workers: the spirit of supporting one another shines small but sure."),
 "天空華宴": (
  "天空で開く華の宴という名のとおり、夜空の高みでにぎわう大輪の宴をイメージさせる演目。",
  "天空の華の宴をイメージさせる演目名",
  "A banquet of flowers in the heavens: the name evokes an image of great blooms reveling high in the night sky."),
 "mirai": (
  "小文字の「mirai」に込めた等身大の未来という名から、やわらかな色の光をイメージさせる。",
  "等身大のmiraiをイメージさせる演目名",
  "In lowercase mirai lies an everyday, human-sized future; the name evokes soft, gentle colors of light keeping company with the crowd."),
 "駆け抜ける丙午 60-60": (
  "丙午生まれの長岡高校昭和60年卒業生が還暦を記念し、尺玉60連発で60年を一気に駆け抜ける。",
  "還暦記念、尺玉60連発で駆け抜ける60年",
  "Nagaoka High School's class of 1985, born in the year of the fire horse, marks its 60th birthday by racing through 60 years with 60 giant shells."),
 "No Attack,No Chance": (
  "「挑まなければ好機はない」の言葉を掲げ、ためらいなく攻める構成で一気に夜空を埋める演目。",
  "挑まなければ好機はない、攻めの構成",
  "Under the motto that without attack there is no chance, the display fills the sky in one unhesitating offensive."),
 "平和への誓い": (
  "長岡空襲の記憶を受け継ぐこの大会で、恒久平和への誓いを静かで澄んだ光に託して打ち上げる。",
  "恒久平和への誓いを澄んだ光に託す",
  "At a festival that inherits the memory of the Nagaoka air raid, a vow of lasting peace is entrusted to quiet, clear light."),
 "夜空に感謝の花束": (
  "保険を通じて寄り添う明治安田が、地域への感謝を花束にして夜空へ贈るスターマイン。",
  "地域への感謝を花束にして夜空へ",
  "Meiji Yasuda, standing by the community through the years, sends a bouquet of gratitude up into the night sky."),
 "世界への躍動": (
  "新潟生まれのスポーツブランド、ヨネックスが、世界の舞台へ躍動するようなスピード感で魅せる。",
  "ヨネックスが魅せる世界への躍動感",
  "Yonex, the sports brand born in Niigata, dazzles with the speed and spring of an athlete leaping onto the world stage."),
 "大河の夕景": (
  "信濃川の夕景を名に掲げ、暮れゆく大河の空の色合いをイメージさせる演目。",
  "信濃川の夕景をイメージさせる演目名",
  "Titled Evening on the Great River, the name evokes the colors of dusk settling slowly over the Shinano."),
 "99年分のありがとうを込めて": (
  "創業99年を迎えた協賛社が、100年目を前にした「ありがとう」を99年分まとめて夜空に放つ。",
  "創業99年分のありがとうを夜空に",
  "On the eve of its centennial, the 99-year-old sponsor releases ninety-nine years' worth of thanks into the sky at once."),
 "ラブラブファイヤー2026": (
  "ブライダルも手がけるアークベルグループが、恋人たちの夏に贈る、愛を祝うにぎやかな花火。",
  "恋人たちの夏に贈る愛を祝う花火",
  "From the Arkbell group, whose business includes weddings, comes a merry display celebrating love, a gift for couples in summer."),
 "アイデアと技術の宝石箱": (
  "包装機械の大森機械工業が、アイデアと技術を詰め込んだ宝石箱を開けるように多彩な光を放つ。",
  "宝石箱を開けたような多彩な光",
  "Packaging-machine maker Omori opens a jewel box of ideas and engineering, spilling out light of every color."),
 "未来飛翔": (
  "地元の事業所が力を合わせる共同受注グループ「けやき」が、未来へ羽ばたく願いを夜空に打ち上げる。",
  "未来へ羽ばたく願いを込めた花火",
  "Keyaki, a joint group of local workplaces pooling their strength, launches its shared wish to soar into the future."),
 "新潟の未来を見つめ続けて": (
  "新潟の街づくりに携わる協賛社が、この地の未来を見つめ続ける決意を穏やかな光の連なりに込める。",
  "新潟の未来を見つめる決意を光に",
  "A sponsor engaged in building Niigata entrusts its resolve to keep watching over the region's future to a calm procession of light."),
 "パラダイス・イン・ザ・スカイ": (
  "夜空の楽園を名に掲げ、明るくにぎやかな光が絶え間なく続くひとときをイメージさせる演目。",
  "夜空の楽園をイメージさせる演目名",
  "Paradise in the Sky: the name evokes a bright, cheerful stretch of light that simply never lets up."),
 "支社開設60周年 感謝を空へ 安心を未来へ": (
  "長岡支社の開設60周年を迎えた日本生命が、感謝を空へ、安心を未来へ届ける記念の演目。",
  "支社60周年の感謝を空へ、安心を未来へ",
  "Nippon Life marks the 60th anniversary of its Nagaoka branch, sending gratitude skyward and reassurance on to the future."),
}

TYPE_FILL = {
 "ナイアガラ超大型スターマイン": "大手大橋の光の滝とスターマインの共演が見どころ。",
 "ベスビアス超大型スターマイン": "湧き上がる光の奔流が夜空を焦がす伝統の型。",
 "超大型スーパーベスビアス": "ベスビアス最大級の打上げ規模を誇る演目。",
 "ベスビアス大スターマイン": "連射の花火が大きな光の柱を夜空に描く。",
 "超大型ワイドスターマイン": "横一線に広がる光のパノラマが見どころ。",
 "超大型ミラクルスターマイン": "変化に富んだ多彩な演出が楽しめる。",
 "スペシャルスターマイン": "テーマに沿った音楽と色彩の演出が光る。",
 "スターマイン": "速射連発の花火が途切れなく夜空を彩る。",
 "花火": "多数の協賛により打ち上げられる特別演目。",
 "サプライズ花火": "映画とタイアップした特別演出の一幕。",
}
TYPE_EN = {
 "ナイアガラ超大型スターマイン": "a Niagara cascade pouring from the Ohte Bridge paired with a super-wide starmine",
 "ベスビアス超大型スターマイン": "a traditional Vesuvius super starmine, a volcanic torrent of light",
 "超大型スーパーベスビアス": "the largest class of Vesuvius starmine, filling the whole field of view",
 "ベスビアス大スターマイン": "a traditional Vesuvius-style grand starmine",
 "超大型ワイドスターマイン": "a super-wide starmine spread across a broad launch front",
 "超大型ミラクルスターマイン": "a super-size starmine with varied, theatrical effects",
 "スペシャルスターマイン": "a themed starmine staged with music and color",
 "スターマイン": "a rapid-fire starmine",
 "花火": "a special program supported by many sponsors",
 "サプライズ花火": "a surprise display tied to a feature film",
}
PADS = ["信濃川の夜空を彩る演目の一つ。", "慰霊と復興の祈りを受け継ぐ大会を彩る。", "会場を沸かせる夏の夜の一幕。"]

def split_sponsors(s):
    parts = [p for p in re.split(r"[・、＆&,]| と ", s) if len(p) >= 2]
    out = []
    for p in [s] + parts:
        if p not in out:
            out.append(p)
    return out

def ja_long(days, time, typ, title, sponsor):
    story = STORIES[title][0]
    fill = TYPE_FILL.get(typ, "大輪の尺玉が連続して夜空に開く。")
    # ストーリーを主文に、足りなければ補足文の組み合わせで60〜80字に合わせる
    # ストーリーと内容が重複する穴埋め文は使わない（先頭4字が含まれていたら重複とみなす）
    def fresh(t):
        return t and t[:4] not in story
    tails = [""] + [t for t in (fill, PADS[0], PADS[1], PADS[2]) if fresh(t)] + [f"長岡花火{days}の演目。", f"{days}打上げ。"]
    from itertools import permutations
    cands = [story + a for a in tails] + [story + a + b for a, b in permutations(tails, 2) if a and b]
    for t in cands:
        if 60 <= len(t) <= 80:
            return t
    raise ValueError(f"ja_long adjust failed ({len(story)}字): {title}")

def ja_short(days, time, typ, title, sponsor):
    hook = STORIES[title][1]
    typs = typ if len(typ) <= 14 else "超大型スターマイン"
    fill = TYPE_FILL.get(typ, "大輪の尺玉が連続して夜空に開く。")
    # 短めは長めの要約。フック＋種別で構成し、日付は入れない
    cands = [
        f"{hook}。",
        f"{hook}。{typs}。",
        f"{hook}、長岡花火の{typs}。",
        f"{hook}。{fill}",
    ]
    for t in cands:
        if 25 <= len(t) <= 50:
            return t
    raise ValueError(f"ja_short adjust failed ({len(hook)}字): {title}")

def en_pair(title, days_en, time, typ, sponsor):
    ten = TYPE_EN.get(typ, "a program of large shells")
    story = STORIES[title][2]
    long = story
    if len(long) < 140:
        long += f" It is staged as {ten} at the Nagaoka Fireworks Show on {days_en}."
    if len(long) < 140:
        long += " The lights bloom over the Shinano River."
    if len(long) > 270:
        long = story
    assert 140 <= len(long) <= 270, (title, len(long))
    short = story if 45 <= len(story) <= 160 else f"{ten[0].upper() + ten[1:]} at the Nagaoka Fireworks Show ({days_en})."
    assert 45 <= len(short) <= 160, (title, len(short))
    return long, short

# --- 主要演目（手書き解説） ---
def curated(id, name, kana, en, aliases, priority, ja_l, ja_s, en_l, en_s, tags_ja, tags_en,
            prefecture="長岡花火", category="hanabi", event_day="08-02/08-03", venue="信濃川河川敷",
            recurring=True, year=None):
    return {
        "id": id, "name": name, "name_kana": kana, "name_en": en,
        "aliases": [{"name": a} for a in aliases],
        **{**BASE, "prefecture": prefecture}, "priority": priority,
        # 分類メタデータ（アプリは未使用。将来のカテゴリ表示・年度入替のための構造）
        "category": category, "event_day": event_day, "venue": venue,
        "recurring": recurring, "year": year,
        "description": {
            "title_ja": name, "title_en": en,
            "description_ja_long": ja_l, "description_ja_short": ja_s,
            "description_en_long": en_l, "description_en_short": en_s,
            "tags_ja": tags_ja, "tags_en": tags_en, "quality": "good", "url": URL,
        },
    }

entries = [
    curated(9000001, "長岡花火", "ながおかはなび", "Nagaoka Fireworks",
        ["長岡まつり大花火大会", "花火"], 1000,
        "毎年8月2日・3日に信濃川河川敷で開かれる日本三大花火の一つ。長岡空襲からの復興と慰霊、平和への祈りを受け継ぎ、正三尺玉やフェニックスが夜空を彩る。",
        "8月2日・3日開催の日本三大花火の一つ。慰霊と復興の祈りを込めた大輪が信濃川の夜空を彩る。",
        "The Nagaoka Festival Grand Fireworks Show is held on August 2nd and 3rd along the Shinano River. One of Japan's three greatest displays, it carries a prayer for peace and recovery born from the 1945 air raid, crowned by giant shells and the Phoenix.",
        "One of Japan's three greatest fireworks festivals, held August 2nd and 3rd on the Shinano River in Nagaoka.",
        ["花火", "夏", "新潟県", "祭り"], ["Fireworks", "Summer", "Niigata", "Festival"], prefecture="新潟県"),
    curated(9000002, "復興祈願花火フェニックス", "ふっこうきがんはなびふぇにっくす", "Phoenix",
        ["フェニックス", "フェニックス花火協賛者一同"], 999,
        "中越地震からの復興を祈って2005年に誕生した、長岡花火を象徴する超大型スターマイン。全長約2kmの打上げ幅から音楽に乗せて光のパノラマが広がる。",
        "復興祈願で2005年に誕生。全長約2kmの光のパノラマが音楽とともに広がる名物スターマイン。",
        "The Phoenix is Nagaoka's signature super-wide starmine, first launched in 2005 as a prayer for recovery from the Chuetsu Earthquake, filling a front of about two kilometers along the Shinano River in sync with music.",
        "Nagaoka's signature two-kilometer starmine, born in 2005 as a prayer for earthquake recovery.",
        ["花火", "長岡花火", "復興祈願"], ["Fireworks", "Nagaoka", "Phoenix"]),
    curated(9000003, "正三尺玉", "しょうさんじゃくだま", "Shosanjakudama",
        ["三尺玉", "吉乃川", "越後交通", "原信", "INPEX"], 998,
        "直径約90cmの巨大な玉を上空約600mへ打ち上げ、直径約650mの大輪を咲かせる長岡名物。開花とともに腹に響く轟音が信濃川の会場全体を包み込む。",
        "直径約90cmの玉が上空約600mで約650mの大輪に開く、長岡名物の巨大花火。",
        "The Shosanjakudama is Nagaoka's iconic giant shell, about 90 centimeters across, fired some 600 meters up to bloom roughly 650 meters wide, its thunderous report rolling across the Shinano River venue.",
        "Nagaoka's iconic giant shell, blooming about 650 meters across high above the Shinano River.",
        ["花火", "長岡花火", "三尺玉"], ["Fireworks", "Nagaoka", "Giant shell"]),
    curated(9000004, "白菊", "しらぎく", "Shiragiku",
        ["慰霊の白菊", "嘉瀬煙火工業", "長岡花火財団", "平和祭の白菊", "前夜祭の白菊", "慰霊花火"], 997,
        "白一色で静かに開く慰霊の花火。花火師・嘉瀬誠次氏がシベリア抑留の戦友に捧げたことに始まり、平和祭の夜と大花火大会の冒頭を静かに飾る。",
        "白一色で開く慰霊の花火。犠牲者への鎮魂を込め、平和祭の夜と大会の冒頭を飾る。",
        "The Shiragiku is a pure-white memorial shell first fired by pyrotechnician Seiji Kase in mourning for comrades lost in Siberian internment. It quietly opens the Peace Festival night and both evenings of the fireworks show.",
        "A pure-white memorial shell that quietly opens the Peace Festival night and the fireworks evenings.",
        ["花火", "長岡花火", "慰霊"], ["Fireworks", "Nagaoka", "Memorial"],
        event_day="08-01/08-02/08-03"),
    curated(9000005, "天地人花火", "てんちじんはなび", "Tenchijin Fireworks",
        ["天地人", "天地人花火協賛企業一同"], 996,
        "長岡ゆかりの武将・直江兼続を描いた大河ドラマ「天地人」を記念する音楽付きスターマイン。義と愛の物語を思わせる勇壮な花火が信濃川の夜空を駆ける。",
        "大河ドラマ「天地人」を記念した音楽付きスターマイン。直江兼続の物語を花火で描く。",
        "The Tenchijin Fireworks are a musical starmine commemorating the taiga drama about Naoe Kanetsugu, the samurai of loyalty and love tied to the Nagaoka region, sweeping gallantly across the night sky over the river.",
        "A musical starmine honoring the taiga drama Tenchijin and the local samurai Naoe Kanetsugu.",
        ["花火", "長岡花火", "天地人"], ["Fireworks", "Nagaoka", "Tenchijin"]),
    curated(9000006, "米百俵花火・尺玉100連発", "こめひゃっぴょうはなびしゃくだまひゃくれんぱつ", "Kome Hyappyo 100 Shells",
        ["米百俵花火", "尺玉100連発", "TDKラムダ", "NNCエンジニアリング"], 995,
        "戊辰戦争後、米百俵を売って学校を建てた長岡藩の精神にちなむ演目。上空約330mで開く尺玉100発を、息つく間もなく連続で打ち上げる圧巻の構成。",
        "「米百俵の精神」にちなみ尺玉100発を連続打上げ。大会屈指の迫力を誇る演目。",
        "Honoring the Kome Hyappyo spirit of investing in the future, one hundred giant shells are fired in relentless succession, each blooming about 330 meters up, making one of the festival's most powerful programs.",
        "One hundred giant shells fired in relentless succession, honoring Nagaoka's Kome Hyappyo spirit.",
        ["花火", "長岡花火", "米百俵"], ["Fireworks", "Nagaoka", "Kome Hyappyo"]),
    curated(9000007, "ナイアガラ", "ないあがら", "Niagara",
        ["ナイアガラ大瀑布", "植木組", "朝日山"], 994,
        "信濃川に架かる大手大橋から、滝のように光が流れ落ちる大仕掛けの花火。川面に映る金色のカーテンが美しく、プログラム中盤の見どころの一つ。",
        "大手大橋から滝のように流れ落ちる光のカーテン。川面に映る金色が美しい仕掛け花火。",
        "The Niagara is a set-piece cascade of golden sparks pouring from the Ohte Bridge over the Shinano River, its falling curtain of light mirrored on the water as one of the highlights of the mid-program.",
        "A golden cascade of sparks pouring from the Ohte Bridge, mirrored on the Shinano River.",
        ["花火", "長岡花火", "ナイアガラ"], ["Fireworks", "Nagaoka", "Niagara"]),
    curated(9000008, "ベスビアス超大型スターマイン", "べすびあすちょうおおがたすたーまいん", "Vesuvius Starmine",
        ["ベスビアス"], 993,
        "火山ベスビオの噴火にたとえられる長岡伝統の超大型スターマイン。広い打上げ幅から何百発もの花火が湧き上がり、光の奔流が夜空を焦がす主力演目。",
        "火山の噴火にたとえられる長岡伝統の超大型スターマイン。光の奔流が夜空を焦がす。",
        "Named for the eruption of Mount Vesuvius, this traditional Nagaoka super starmine sends hundreds of shells surging upward like a torrent of fire, staged several times through the festival by its sponsors.",
        "Nagaoka's traditional super starmine, a volcanic torrent of light staged throughout the festival.",
        ["花火", "長岡花火", "スターマイン"], ["Fireworks", "Nagaoka", "Starmine"]),
    curated(9000009, "匠の花火", "たくみのはなび", "Takumi Fireworks",
        ["匠"], 992,
        "長岡花火財団が贈る、花火師の技を主役にした演目。色の変化や開きの正確さ、消え際の美しさなど、一発ごとの完成度をじっくり味わえる通好みの時間。",
        "花火師の技を主役に、一発ごとの色・開き・消え際の完成度を味わう通好みの演目。",
        "Presented by the Nagaoka Fireworks Foundation, Takumi puts the pyrotechnician's craft itself center stage, savoring each shell for its color shifts, the precision of its bloom, and the beauty of its fade.",
        "A connoisseur's program devoted to the artisan's craft, one carefully judged shell at a time.",
        ["花火", "長岡花火", "花火師"], ["Fireworks", "Nagaoka", "Artisan"]),
]

# --- 長岡まつり平和祭（8月1日・大手通周辺）。2018年度に「前夜祭」から名称変更 ---
PJA = ["平和祭", "長岡まつり", "8月1日"]
PEN = ["Peace Festival", "Nagaoka", "August 1st"]
entries += [
    curated(9000011, "長岡まつり平和祭", "ながおかまつりへいわさい", "Nagaoka Peace Festival",
        ["前夜祭", "長岡まつり前夜祭", "平和祭", "8月1日"], 991,
        "1945年の長岡空襲翌年に始まった復興祭を前身とする、長岡まつり初日の行事。慰霊と感謝、恒久平和への願いを受け継ぎ、大民踊流しや慰霊神輿が大手通を彩る。",
        "慰霊と復興、平和への願いを受け継ぐ長岡まつり初日の行事。8月1日、大手通周辺で開催。",
        "The Peace Festival opens the Nagaoka Festival on August 1st. Descended from the recovery festival first held the year after the 1945 air raid, it fills Ote-dori with folk dances, a memorial mikoshi, drums and parades.",
        "The Peace Festival opens the Nagaoka Festival on August 1st, carrying prayers for remembrance, recovery and lasting peace.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通周辺"),
    curated(9000012, "大民踊流し", "だいみんようながし", "Great Folk Dance Procession",
        ["民踊流し", "民謡流し", "長岡甚句", "大花火音頭", "踊り流し", "盆踊り"], 990,
        "長岡甚句や大花火音頭に合わせ、大勢の踊り手が大手通などを踊り流す平和祭の名物行事。浴衣の列が夏の宵の街をゆっくりと進んでいく。",
        "長岡甚句・大花火音頭に合わせて大手通を踊り流す平和祭の名物行事。",
        "The Great Folk Dance Procession is a signature event of the Peace Festival, in which crowds of dancers flow along Ote-dori to the folk tunes of Nagaoka Jinku and the Ohanabi Ondo through the summer evening.",
        "Crowds of dancers in yukata flow down Ote-dori to Nagaoka's folk tunes at the Peace Festival.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通・すずらん通り"),
    curated(9000013, "柿川灯籠流し", "かきがわとうろうながし", "Kakigawa Lantern Floating",
        ["灯籠流し", "柿川", "平和の灯籠", "一之橋", "追廻橋", "とうろう流し"], 989,
        "慰霊と恒久平和への願いを灯籠に込め、柿川の水面へ静かに送り出す8月1日の行事。一之橋から追廻橋のあたりを、ゆらめく灯りがゆっくり流れてゆく。",
        "慰霊と平和への願いを込めた灯籠を柿川に流す、8月1日の静かな行事。",
        "Lanterns bearing prayers for the war dead and for lasting peace are set adrift on the Kakigawa river on August 1st, their flickering lights drifting slowly between the Ichinohashi and Oimawashi bridges.",
        "Lanterns carrying prayers for remembrance and peace drift quietly down the Kakigawa on August 1st.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="柿川（一之橋〜追廻橋）"),
    curated(9000014, "越後長岡慰霊神輿渡御", "えちごながおかいれいみこしとぎょ", "Memorial Mikoshi Procession",
        ["慰霊神輿", "長岡慰霊神輿", "神輿渡御", "みこし", "神輿"], 988,
        "長岡空襲の犠牲者を慰霊し、復興と平和への願いをつないで大手通を進む神輿渡御。平和祭の夜、大民踊流しに続いて力強く練り歩く。",
        "空襲犠牲者の慰霊と平和への願いを載せ、大手通を進む神輿渡御。",
        "The memorial mikoshi procession advances along Ote-dori in remembrance of the victims of the Nagaoka air raid, carrying prayers for recovery and lasting peace through the night of the Peace Festival.",
        "A memorial mikoshi carried down Ote-dori in remembrance of the air-raid victims, bearing prayers for peace.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通"),
    curated(9000015, "悠久太鼓", "ゆうきゅうだいこ", "Yukyu Daiko",
        ["長岡悠久太鼓", "和太鼓", "太鼓演奏", "太鼓"], 987,
        "長岡の歴史と大河信濃川を思わせる、力強い響きが特徴の郷土芸能。平和祭の街なかに勇壮な太鼓の音を響かせ、祭りの夜をいっそう沸かせる。",
        "力強い響きが特徴の長岡の郷土芸能。平和祭の街に太鼓の音を響かせる。",
        "Yukyu Daiko is Nagaoka's homegrown taiko drumming, its powerful sound evoking the city's history and the great Shinano River as it rings through the streets on the night of the Peace Festival.",
        "Nagaoka's own taiko drumming, ringing powerfully through the streets of the Peace Festival.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="ミライエ長岡前ほか"),
    curated(9000016, "越路の祭り屋台曳き回しとシャギリ", "こしじのまつりやたいひきまわしとしゃぎり", "Koshiji Festival Floats",
        ["越路の祭り屋台", "祭り屋台", "屋台曳き回し", "シャギリ", "お囃子", "山車"], 986,
        "越路地域に伝わる祭り屋台を曳き回し、笛や太鼓のお囃子「シャギリ」を響かせる伝統行事。華やかな屋台が平和祭の大手通に彩りを添える。",
        "越路の祭り屋台を曳き回し、シャギリのお囃子を響かせる伝統行事。",
        "Festival floats handed down in the Koshiji district are hauled through the streets to the piping and drumming of shagiri musicians, adding traditional color to the Peace Festival on Ote-dori.",
        "Koshiji's festival floats parade to the lively sound of shagiri flutes and drums.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通"),
    curated(9000017, "平和祭パレード", "へいわさいぱれーど", "Peace Festival Parade",
        ["長岡まつりパレード", "大手通パレード", "消防音楽隊", "バトントワリング", "パレード"], 985,
        "消防音楽隊やバトントワリングなどが大手通を進み、長岡まつりの開幕を華やかに告げる平和祭のパレード。沿道の歓声とともに祭りの3日間が始まる。",
        "音楽隊やバトンが大手通を進み、長岡まつりの開幕を告げるパレード。",
        "Marching bands, baton twirlers and more parade down Ote-dori, joyfully announcing the opening of the Nagaoka Festival as cheers rise along the street on the evening of the Peace Festival.",
        "A parade of bands and baton twirlers down Ote-dori, announcing the opening of the Nagaoka Festival.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通"),
    curated(9000018, "バルーンリリース", "ばるーんりりーす", "Balloon Release",
        ["風船飛ばし", "平和のバルーン", "オープニングセレモニー"], 984,
        "慰霊と復興、恒久平和への願いを託し、色とりどりのバルーンを長岡の空へ放つ平和祭のセレモニー。夕空に浮かぶ色彩が、祭りの始まりを静かに告げる。",
        "平和への願いを託したバルーンを長岡の空へ放つ、平和祭のセレモニー。",
        "In the opening ceremony of the Peace Festival, colorful balloons carrying prayers for remembrance, recovery and lasting peace are released into the evening sky over Nagaoka.",
        "Colorful balloons carrying prayers for peace rise into the evening sky over Nagaoka.",
        PJA, PEN, category="peace_festival", event_day="08-01", venue="大手通", recurring=False, year=2026),
]
have_names = {e["name"] for e in entries}

# --- プログラム演目（テンプレート生成・同名は両日統合） ---
merged = {}
for day, time, typ, title, sponsor in P2 + P3:
    m = merged.setdefault(title, {"days": [], "time": time, "types": [], "sponsors": []})
    m["days"].append(day)
    if typ not in m["types"]: m["types"].append(typ)
    if sponsor not in m["sponsors"]: m["sponsors"].append(sponsor)

nid = 9000101
for title, m in merged.items():
    if title in have_names: continue
    typ = m["types"][0]
    both = set(m["days"]) == {"2", "3"}
    days = "8月2日・3日" if both else f"8月{m['days'][0]}日"
    days_en = "August 2nd and 3rd" if both else f"August {m['days'][0]}"
    sponsor = "・".join(m["sponsors"])
    aliases = [{"name": a} for a in split_sponsors(sponsor)] + [{"name": typ}]
    en_l, en_s = en_pair(title, days_en, m["time"], typ, sponsor)
    entries.append({
        "id": nid, "name": title, "aliases": aliases, **BASE, "priority": 900,
        "category": "hanabi",
        "event_day": "08-02/08-03" if both else f"08-0{m['days'][0]}",
        "venue": "信濃川河川敷", "recurring": False, "year": 2026,
        "description": {
            "title_ja": title, "title_en": title,
            "description_ja_long": ja_long(days, m["time"], typ, title, sponsor),
            "description_ja_short": ja_short(days, m["time"], typ, title, sponsor),
            "description_en_long": en_l, "description_en_short": en_s,
            "tags_ja": ["花火", "長岡花火"], "tags_en": ["Fireworks", "Nagaoka"],
            # 協賛演目は演目名・協賛情報をもとにした紹介文（実演出は未確認）のため inferred
            "quality": "inferred", "url": URL,
        },
    })
    nid += 1

json.dump(entries, open("public/data/featured.json", "w"), ensure_ascii=False, indent=2)
print(f"{len(entries)} entries written")

# --- 解説一覧（日本語のみ）を docs/nagaoka-hanabi/descriptions.md に書き出す ---
import os
os.makedirs("docs/nagaoka-hanabi", exist_ok=True)
by_name = {e["name"]: e for e in entries}
md = ["# 長岡花火 解説一覧（日本語）", "",
      "`public/data/featured.json` の解説を演目ごとにまとめたもの。",
      "`python3 scripts/generate-featured.py` で featured.json とあわせて再生成される。",
      "",
      "> 協賛演目（quality: inferred）の解説は、演目名・協賛社の公開情報をもとにした紹介文で、",
      "> 実際の演出内容を保証するものではありません。主要演目（quality: good）は事実ベース。", ""]

md += ["## 主要演目", ""]
for e in entries[:9]:
    d = e["description"]
    md += [f"### {e['name']}", "",
           f"- **長め**: {d['description_ja_long']}",
           f"- **短め**: {d['description_ja_short']}", ""]

def day_section(day_label, items):
    out = [f"## {day_label}のプログラム", ""]
    seen = set()
    for _day, time, typ, title, sponsor in items:
        if title in seen or title not in by_name: continue
        seen.add(title)
        d = by_name[title]["description"]
        out += [f"### {time}　{title}", "",
                f"- 種別: {typ} ／ 協賛: {sponsor}",
                f"- **長め**: {d['description_ja_long']}",
                f"- **短め**: {d['description_ja_short']}", ""]
    return out

md += ["## 8月1日 平和祭", ""]
for e in entries:
    if e.get("category") != "peace_festival": continue
    d = e["description"]
    md += [f"### {e['name']}", "",
           f"- 会場: {e.get('venue', '')}",
           f"- **長め**: {d['description_ja_long']}",
           f"- **短め**: {d['description_ja_short']}", ""]

md += day_section("8月2日", P2)
md += day_section("8月3日", [x for x in P3 if x[3] not in {t for _,_,_,t,_ in P2}])
open("docs/nagaoka-hanabi/descriptions.md", "w").write("\n".join(md))
print("docs/nagaoka-hanabi/descriptions.md written")
