import { GUARANTEED_MIN_STAR, SUMMON_COST_SINGLE, SUMMON_COST_TEN } from "../../game/gacha.js";
import { MAX_DUNGEON_PARTY_SIZE } from "../../game/playerState.js";
import { el } from "../dom.js";
import { icon, IconName } from "../icons.js";

/**
 * 遊び方。
 *
 * **仕組みを全部並べる場ではない。**それはヘルプではなく仕様書になる。
 * ここで答えるのは「次に何をすればいいか」だけ。
 * 順番どおりに読めば、始めた人が最初の1時間で迷わない、という並びにしてある。
 *
 * 数字は書かない(装備の倍率、ドロップ率など)。数字は調整で動くので、
 * ここに書くと必ず食い違う。**動かない考え方だけを書く。**
 * ただし召喚の値段と保証だけは、押す前に知らないと判断できないので出す。
 */

export interface HowToPlayProps {
  onBack: () => void;
}

interface Topic {
  name: IconName;
  title: string;
  lead: string;
  points: string[];
}

const TOPICS: Topic[] = [
  {
    name: "adventure",
    title: "まずは冒険へ",
    lead: "ホームの ADVENTURE から。ステージを進めると、次に行く場所と育てる材料が増えていきます。",
    points: [
      "戦闘は自動で進みます。編成さえ組めば、あとは見ているだけで終わります",
      "負けてもスタミナ以外は失いません。詰まったら、育ててから戻ってきてください",
      "章ごとに敵の属性が変わります。相性の良い子を入れるだけで手応えが変わります",
    ],
  },
  {
    name: "party",
    title: "相性と速さで決まる",
    lead: "同じ強さでも、誰を入れるかで結果が変わります。見るのは属性と速度の2つです。",
    points: [
      "火→木→水→火 の順に強く、電気と木は互いに強く出ます。光と闇は互いにだけ強い",
      "**速度が高いほど先に、多く動けます。**攻撃力より効くことがよくあります",
      "スキルにはクールタイムがあります。強い技ほど間隔が長いので、繋ぐ順番を考えると安定します",
    ],
  },
  {
    name: "monsters",
    title: "育てる4つの道",
    lead: "手持ちを強くする方法は4つあります。詰まった時は、どれが足りていないかを見てください。",
    points: [
      "**レベル**: 戦闘とレベル上げダンジョンで上がります。まずはここ",
      "**ランクアップ**: 最大レベルで、同じ星の仲間を材料に星を上げます。伸びしろごと増えます",
      "**スキル強化**: 同じモンスターを材料にすると技が伸びます。倍率も、効果の発動率も上がります",
      "**クリエイト**: 別のモンスターの技を移せます。ふつうの子に、思わぬ役割を持たせられます",
    ],
  },
  {
    name: "equipment",
    title: "装備が伸びしろの本体",
    lead: "レベルより装備の方が、最終的な強さを決めます。装備ダンジョンで集めます。",
    points: [
      "6つの枠それぞれにメインの効果と副効果が付きます。**副効果は強化するたびに伸びます**",
      "同じシリーズを2個・4個そろえるとセット効果が付きます",
      "モンスターの詳細で、装備で上がった分だけを分けて確認できます",
      `装備ダンジョンは専用の編成で挑めます(通常より1体多い${MAX_DUNGEON_PARTY_SIZE}体)`,
    ],
  },
  {
    name: "summon",
    title: "召喚で仲間を増やす",
    lead: "ダイヤか召喚の書で引きます。始めたばかりなら、まず「はじまりの10連」を引いてください。",
    points: [
      "**はじまりの10連**は無料で1度きり。★5を1体保証します",
      `10連は${SUMMON_COST_TEN}ダイヤ。★${GUARANTEED_MIN_STAR}以上を1体保証します`,
      `1回は${SUMMON_COST_SINGLE}ダイヤ。★3以上が出ます`,
      "召喚の書はダンジョンで拾えます。ダイヤを使わずに引けます",
    ],
  },
  {
    name: "equipDungeon",
    title: "行き先の使い分け",
    lead: "ホームの下の段から入ります。何が足りないかで選んでください。",
    points: [
      "**装備ダンジョン**: 装備を集める場所。奥へ行くほど良い物が出ます",
      "**育成ダンジョン**: 経験値だけを集める場所。レベルを一気に上げたい時に",
      "**ゴールドダンジョン**: 金策専用。強化にはお金がかかります",
      "**アリーナ**: 他のファイターとの対戦。攻めと守りで別々の編成を組みます",
    ],
  },
  {
    name: "stamina",
    title: "毎日やっておくこと",
    lead: "短い時間でも、これだけ触っておくと後が楽になります。",
    points: [
      "ログインボーナスを受け取る(10日ごとに大きく増えます)",
      "スタミナは時間で回復します。**溢れる前に使うのが一番の節約**です",
      "ショップは1時間ごとに品揃えが変わります",
      "ゴールドダンジョンには1日の回数制限があります",
    ],
  },
];

function renderTopic(topic: Topic): HTMLElement {
  return el("section", { className: "panel howto-card" }, [
    el("div", { className: "howto-card__head" }, [
      el("span", { className: "howto-card__icon" }, [icon(topic.name)]),
      el("h2", {}, [topic.title]),
    ]),
    el("p", { className: "howto-card__lead" }, [topic.lead]),
    el(
      "ul",
      { className: "howto-card__list" },
      topic.points.map((text) =>
        // **で囲んだところを強調する。文の中の要点だけが立つと、拾い読みができる
        el(
          "li",
          {},
          text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? el("strong", {}, [part]) : part)),
        ),
      ),
    ),
  ]);
}

export function renderHowToPlay(props: HowToPlayProps): HTMLElement {
  return el("div", { className: "screen howto-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["遊び方"])]),
    el("p", { className: "howto-intro" }, [
      "ふつうのモンスターでも、育てて装備を整えれば奥まで行けます。順番に読めば、次にやることが分かります。",
    ]),
    ...TOPICS.map(renderTopic),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onBack }, ["◀ 戻る"]),
  ]);
}
