/**
 * 画面の機械的な検査。
 *
 * **型チェックとテストはCSSの安全弁にならない。**はみ出し・押せないボタン・
 * 小さすぎる文字・重なりは、どれも素通りする。ここはそれを目で見る前に
 * 機械で拾うための式で、ブラウザの中で評価される。
 *
 * 巡回(tour.mjs)と1画面の確認(scene.mts)の**両方が同じ式を使う**。
 * 別々に持つと、片方だけ検査が増えて「巡回は通ったのに崩れている」が起きる。
 */
export const INSPECT = `(() => {
  const problems = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 1. 横スクロール。縦画面で最も起きやすく、起きると全体が窮屈になる
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push('横にはみ出している (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
  }

  const nav = document.querySelector('.bottom-nav');
  const navTop = nav ? nav.getBoundingClientRect().top : vh;

  // 2. 押せないボタン。他の要素が上に乗っている/画面外にある
  /*
   * モーダルが開いている時、背面の画面は意図的に操作できない。
   * document 全体を調べると、それらを全部「押せない」と誤報するため、
   * aria-modal の付いた最前面だけを検査対象にする。
   * 全面スクリーンは中央をパネルが覆うのが正常なので対象外にする。
   */
  const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  const scope = modal ?? document;
  /*
   * **summary も押しもの。**
   * 折りたたみの見出しは button でも a でもないので、ここに入れるまで
   * **一度も検査されていなかった。**図鑑の「スキルLv別の変化を見る」が
   * 下タブの裏に入ってどうやっても押せない状態で、巡回を素通りしている。
   */
  const buttons = [...scope.querySelectorAll('button:not([disabled]), a[href], summary')]
    .filter((b) => !b.matches('.regular-missions__scrim'));

  /** ページを送ると一緒に動くか。固定・粘着の中に居るものは動かない */
  const movesWithPage = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const pos = getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky') return false;
    }
    return true;
  };

  /*
   * **いま実際に見えている部分**を返す。画面と、内側の巻物で切った後の矩形。
   *
   * 中心の座標で「最前面が自分か」を見るので、**的が端でまたいでいると
   * 中心が箱の外へ出る**。そこを踏むのは下に敷かれた別の要素で、
   * 送れば見えるだけのものを「覆われている」と誤報していた
   * (絞り込みを開いた状態を巡回へ入れた回に、札11個ぶんが一斉に出た)。
   */
  const visibleRect = (el, r) => {
    let top = Math.max(r.top, 0);
    let bottom = Math.min(r.bottom, vh);
    let left = Math.max(r.left, 0);
    let right = Math.min(r.right, vw);
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (!/(auto|scroll)/.test(cs.overflowY + ' ' + cs.overflowX)) continue;
      const nr = node.getBoundingClientRect();
      if (nr.width < 1 || nr.height < 1) continue;
      top = Math.max(top, nr.top);
      bottom = Math.min(bottom, nr.bottom);
      left = Math.max(left, nr.left);
      right = Math.min(right, nr.right);
    }
    return { top, bottom, left, right };
  };

  /*
   * **その的を、いちばん内側の巻物を送って動かせるか。**
   *
   * movesWithPage はページ基準なので、下から出るシートのように
   * 全体が position:fixed の中では**中身が全部「動かない」**になる。
   * シートの中身は panel を送れば動くので、そこまでを見る。
   */
  const pinnedInsideScroller = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
      if (/(auto|scroll)/.test(cs.overflowY)) return false;
    }
    return false;
  };

  /*
   * **覆っているのが「端に貼り付いた帯」か。**
   *
   * 下タブや操作帯のように面の上端・下端へ貼り付いているものは、
   * 送れば的の方が抜け出せる。**中ほどに浮いているものは別で、
   * そこに居座るかぎり下の的は押せない**——初心者ミッションの浮遊パネル、
   * ホームの小窓、ログインボーナスの札で3回作っている事故がこれ。
   * 端に貼り付いたものだけを見逃し、浮いているものは必ず拾う。
   */
  const pinnedEdgeBand = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') {
        if (/(auto|scroll)/.test(cs.overflowY)) return false;
        continue;
      }
      const nr = node.getBoundingClientRect();
      // その帯が乗っている面(いちばん内側の巻物、無ければ画面)
      let faceTop = 0;
      let faceBottom = vh;
      for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
        if (!/(auto|scroll)/.test(getComputedStyle(p).overflowY)) continue;
        const pr = p.getBoundingClientRect();
        faceTop = pr.top;
        faceBottom = pr.bottom;
        break;
      }
      /*
       * 画面そのものの下端に貼る帯は、**下タブの上に載る**(bottom: 下タブ + 8px)。
       * 画面の縁ではなく下タブの上端を縁として見る。見ないと、送れば出てくる的を
       * 「押せない」と誤報する(交換所の実行バーで、見出しの高さが変わった時に出た)
       */
      const edge = faceBottom === vh ? Math.min(faceBottom, navTop) : faceBottom;
      return nr.top <= faceTop + 4 || nr.bottom >= edge - 12;
    }
    return false;
  };

  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 画面の外(下タブの裏に隠れているものを含む)
    if (r.left < -2 || r.right > vw + 2) {
      problems.push('画面の外にあるボタン: ' + (b.textContent || '').trim().slice(0, 16));
      continue;
    }
    // 見えている位置にあるのに、最前面が自分でない
    const vis = visibleRect(b, r);
    // 見えている部分がほぼ無い = 送れば出てくるもの
    if (vis.bottom - vis.top < 2 || vis.right - vis.left < 2) continue;
    const cx = Math.min(vw - 2, Math.max(2, (vis.left + vis.right) / 2));
    const cy = Math.min(vh - 2, Math.max(2, (vis.top + vis.bottom) / 2));
    if (cy > navTop - 2) continue; // 下タブの下は判定しない
    const top = document.elementFromPoint(cx, cy);
    if (top && !b.contains(top) && top !== b && !b.closest('.bottom-nav')) {
      /*
       * **覆っているのが動かない帯で、的の方は動くなら、送れば出てくる。**
       * 下タブの下を判定しないのと同じ理由(粘着の操作帯も同じ性質)。
       * 送りきっても出てこないものは、次の検査が拾う。
       */
      if (pinnedEdgeBand(top) && !pinnedInsideScroller(b)) continue;
      problems.push('押せないボタン「' + (b.textContent || '').trim().slice(0, 14) + '」の手前に ' + (top.className || top.tagName));
    }
  }

  /*
   * 3. **一番下まで送っても、下タブの裏から出てこない押しもの。**
   *
   * 上の検査は「下タブの下は判定しない」(送れば出てくるため)なので、
   * **送りきっても出てこないもの**だけがここに残っていた。
   * 図鑑の詳細がこれで、画面の下余白に下タブ(64px)のぶんが入っておらず、
   * 「スキルLv別の変化を見る」が**どうやっても押せなかった**。
   *
   * 送った量に関係なく決まるので、いまのスクロール位置のまま計算できる。
   */
  const scroller = document.scrollingElement || document.documentElement;
  const maxScroll = Math.max(0, scroller.scrollHeight - vh);
  for (const b of buttons) {
    if (b.closest('.bottom-nav') || b.closest('.dev-menu')) continue;
    /*
     * **畳んだ details の中身は見えていない。**Chromium は畳んだ中身を
     * content-visibility: hidden で隠すだけなので、箱の位置は残っていて
     * ここで拾ってしまう(試練の塔の未解放の節「96階」)。開けば出てくる物は、
     * 開いた姿で検査する。畳んだままの見出し(summary)は見る
     */
    const folded = b.closest('details:not([open])');
    if (folded && !b.closest('summary')) continue;
    if (!movesWithPage(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 一番下まで送った時に、この的の中心がどこへ来るか
    const bestCenter = r.top + scroller.scrollTop - maxScroll + r.height / 2;
    if (bestCenter >= navTop) {
      problems.push('下タブの裏から出てこない「' + ((b.textContent || '').trim().slice(0, 14) || b.className) + '」(画面の下余白に下タブのぶんが無い)');
      break;
    }
  }

  // 4. 指で押すには小さすぎる的。
  //    実測したところ、並べ替えの札が29px、ショップの購入が31pxしかなく、
  //    **買う・編成するという取り返しのつかない操作ほど的が小さい**
  //    という逆転が起きていた。36pxを下回るものを拾う。
  const TAP_MIN = 36;
  for (const b of buttons) {
    if (b.closest('.dev-menu')) continue;
    /*
     * **理由を書いた1件だけ、例外にする。**
     *
     * 所持一覧の簡易表示は1枚が60〜70px幅しかない。そこへ36pxの判定を置くと、
     * 見えている小さな丸より透明な判定の方がカードの半分以上を占め、
     * 「カード本体を押したつもり」がロックや詳細に吸われる。
     * 小さいことより、押したつもりの操作が別のものに化ける方が悪い。
     *
     * **無条件の穴にはしない。** data-tap-small を書いた要素だけを外し、
     * 値にはどの画面でなぜ小さいのかを残す。付ける時は、
     * 「小さくても誤操作が減る」と言い切れるかを毎回確かめること。
     */
    if (b.dataset.tapSmall) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.height < TAP_MIN || r.width < TAP_MIN) {
      problems.push('指で押すには小さい (' + Math.round(r.width) + 'x' + Math.round(r.height) + '): ' + ((b.textContent || '').trim().slice(0, 12) || b.className));
      break;
    }
  }

  // 5. 極端に小さい文字。実機で読めない
  for (const el of document.querySelectorAll('p, span, div, button')) {
    if (!el.textContent || el.children.length > 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < 9) {
      problems.push('文字が小さすぎる (' + size.toFixed(1) + 'px): ' + el.textContent.trim().slice(0, 14));
      break;
    }
  }

  /*
   * 6. 文字が「‥」で切り落とされている。
   *
   * text-overflow: ellipsis は、本来**長い名前を1行に収めるための保険**で、
   * 数文字しか入らない枠に落ちた時の非常口ではない。
   * アリーナのランキングで、代表モンスターの絵文字が無い行の名前が
   * 22px幅の列へ繰り上がり、実機で「ド‥」と2文字目で切れていた。
   * はみ出しでも小さすぎる文字でもないので、既存の検査を全部すり抜ける。
   *
   * 「切れているか」だけを見ると、長い名前を収める正常な省略まで拾ってしまう。
   * **枠そのものが狭すぎるか**で判定する(文字5個ぶんも入らない枠)。
   */
  for (const el of document.querySelectorAll('span, p, div, button, h1, h2, h3')) {
    if (!el.textContent || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const size = parseFloat(cs.fontSize) || 12;
    if (el.clientWidth >= size * 5) continue;
    problems.push(
      '文字が切り落とされている (幅' + Math.round(el.clientWidth) + 'px / 文字' + size.toFixed(0) + 'px): '
      + el.textContent.trim().slice(0, 14) + ' [' + (el.className || el.tagName) + ']',
    );
    break;
  }

  // 7. 見出しと重なっている要素(上帯の文字の重なりを何度も出しているため)
  const header = document.querySelector('.screen-head__title, .app-header h1, .battle-topbar__title');
  if (header) {
    const hr = header.getBoundingClientRect();
    for (const el of document.querySelectorAll('.battle-logstrip, .shop-notice, .app-subtitle')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const overlap = !(r.bottom <= hr.top || r.top >= hr.bottom || r.right <= hr.left || r.left >= hr.right);
      if (overlap) problems.push('見出しと重なっている: ' + el.className);
    }
  }

  return { problems, ボタン数: buttons.length, 高さ: document.documentElement.scrollHeight };
})()`;
